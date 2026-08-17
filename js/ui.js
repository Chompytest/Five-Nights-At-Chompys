// ============================================================================
// ui.js — DOM overlays (title, cards, HUD, pause) + leaderboard client.
//
// LEADERBOARD CLIENT RULES (hard-won, do not relax):
//  * a score is "submitted" ONLY when the server confirms (2xx + accepted:true)
//  * pending scores live in localStorage and survive reloads
//  * retry with exponential backoff; extra flush attempts on pagehide /
//    visibilitychange (sendBeacon — fire-and-forget, never marks confirmed)
//  * if a queued score exists and a worse one arrives, keep the better
//  * the player ALWAYS gets a visible row, even ranked below the top ten
//  * GETs are cache-busted and no-store — a stale board looks like a lost score
// ============================================================================
import { COPY } from './config.js';
import { initAudio, resumeAudio, suspendAudio } from './audio.js';

const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
  del(k) { try { localStorage.removeItem(k); } catch { } },
};

export function sanitizeName(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[^\w \-'.]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

const $ = (id) => document.getElementById(id);

export function createUI() {
  let S = null;                     // game state, bound after creation
  const el = {
    title: $('title'), name: $('nameInput'), play: $('playBtn'),
    board: $('boardRows'), boardStatus: $('boardStatus'), youRow: $('youRow'),
    prize: $('prizeBanner'), card: $('card'), cardTitle: $('cardTitle'),
    cardSub: $('cardSub'), cardHint: $('cardHint'), cardBtns: $('cardBtns'),
    hud: $('hud'), hudNight: $('hudNight'), hudClock: $('hudClock'),
    hudPower: $('hudPower'), hudPips: $('hudPips'), hudScore: $('hudScore'),
    pause: $('pauseOverlay'), flash: $('flash'), hint: $('dragHint'),
    subtitle: $('gameSubtitle'), logo: $('gameLogo'),
  };
  el.logo.textContent = COPY.TITLE;
  el.subtitle.textContent = COPY.SUBTITLE;
  el.prize.textContent = COPY.PRIZE;

  // returning players get their saved name restored; new players get an EMPTY
  // input with a placeholder — never a default name.
  const savedName = sanitizeName(LS.get('fnac_name', ''));
  if (savedName) el.name.value = savedName;

  const ui = {};
  ui.bind = (state) => { S = state; S.playerName = savedName; };

  // --------------------------------------------------------------------------
  // leaderboard client
  // --------------------------------------------------------------------------
  const LB = {
    inFlight: false, retryDelay: 1000, retryTimer: null,
    refreshTimer: null, lastConfirmed: null,
    pending() { try { return JSON.parse(LS.get('fnac_pending', 'null')); } catch { return null; } },
    setPending(p) { p ? LS.set('fnac_pending', JSON.stringify(p)) : LS.del('fnac_pending'); },
  };

  ui.resetSubmitState = () => { /* per-run flag lives in game.S.runFinalized;
    kept as an explicit hook so every run-start path resets submit state */ };

  ui.submitScore = (name, score) => {
    name = sanitizeName(name); score = Math.round(score);
    if (!name || !(score >= 0)) return;
    const best = Number(LS.get('fnac_best', '0')) || 0;
    if (score > best) LS.set('fnac_best', String(score));
    const cur = LB.pending();
    if (!cur || score > cur.score) LB.setPending({ name, score, game: COPY.GAME_ID });
    LB.retryDelay = 1000;
    attemptFlush();
  };

  async function attemptFlush() {
    const p = LB.pending();
    if (!p || LB.inFlight) return;
    LB.inFlight = true;
    try {
      const res = await fetch(COPY.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(p),
      });
      let json = null;
      try { json = await res.json(); } catch { }
      if (res.ok && json && json.accepted) {
        // CONFIRMED — only now does the queue clear
        const still = LB.pending();
        if (still && still.score <= p.score) LB.setPending(null);
        LB.lastConfirmed = p;
        LB.retryDelay = 1000;
        fetchBoard();
      } else if (json && typeof json.error === 'string' && json.error.startsWith('bad_')) {
        LB.setPending(null);          // invalid payload will never succeed
      } else {
        scheduleRetry();
      }
    } catch {
      scheduleRetry();
    } finally {
      LB.inFlight = false;
    }
  }
  function scheduleRetry() {
    clearTimeout(LB.retryTimer);
    LB.retryTimer = setTimeout(attemptFlush, LB.retryDelay);
    LB.retryDelay = Math.min(30000, LB.retryDelay * 2);
  }

  // extra flush attempts when the page is going away — beacon never confirms,
  // the pending entry survives for the next visit either way
  function beaconFlush() {
    const p = LB.pending();
    if (p && navigator.sendBeacon) {
      try { navigator.sendBeacon(COPY.API_URL, new Blob([JSON.stringify(p)], { type: 'application/json' })); } catch { }
    }
  }
  window.addEventListener('pagehide', beaconFlush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { beaconFlush(); }
    else { attemptFlush(); if (S && S.state === 'title') fetchBoard(); }
  });
  window.addEventListener('online', attemptFlush);

  async function fetchBoard() {
    const name = sanitizeName(el.name.value || LS.get('fnac_name', ''));
    const url = `${COPY.API_URL}?game=${COPY.GAME_ID}&name=${encodeURIComponent(name)}&_=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!json || json.ok === false || !Array.isArray(json.top)) {
        renderBoard(null, null, json && json.error === 'leaderboard_not_configured'
          ? 'leaderboard not configured' : 'board unavailable');
        return;
      }
      renderBoard(json.top, json.player || null, null);
    } catch {
      renderBoard(null, null, 'offline — scores will sync');
    }
  }

  function renderBoard(top, player, errMsg) {
    const name = sanitizeName(el.name.value || LS.get('fnac_name', ''));
    el.boardStatus.textContent = errMsg || '';
    // a fetch hiccup must not wipe rows the player can already see —
    // stale rows + a status line beat an empty panel
    if (errMsg && !top && el.board.children.length) return;
    el.board.innerHTML = '';
    if (top) {
      top.slice(0, 10).forEach((row, i) => {
        const div = document.createElement('div');
        div.className = 'brow rank-' + (i + 1);
        const isYou = name && row.name === name;
        if (isYou) div.classList.add('you');
        div.innerHTML = `<span class="brank">${i + 1}</span><span class="bname"></span><span class="bscore">${Number(row.score).toLocaleString()}</span>`;
        div.querySelector('.bname').textContent = row.name + (isYou ? ' (you)' : '');
        el.board.appendChild(div);
      });
      if (!top.length) el.boardStatus.textContent = 'no scores yet — be first';
    }
    // the reserved player row: rank-14 personal best must never look like a
    // failed save
    const pend = LB.pending();
    const localBest = Number(LS.get('fnac_best', '0')) || 0;
    const inTop = top && name && top.slice(0, 10).some(r => r.name === name);
    if (name && (player || localBest > 0 || pend)) {
      if (inTop && !pend) { el.youRow.style.display = 'none'; }
      else {
        el.youRow.style.display = '';
        const score = player ? player.score : Math.max(localBest, pend ? pend.score : 0);
        const rank = player && player.rank ? '#' + player.rank : '—';
        const status = pend ? 'saving…' : (player ? '' : 'local');
        el.youRow.innerHTML = `<span class="brank">${rank}</span><span class="bname"></span><span class="bscore">${Number(score).toLocaleString()} <em>${status}</em></span>`;
        el.youRow.querySelector('.bname').textContent = (name || 'YOU') + ' (you)';
      }
    } else el.youRow.style.display = 'none';
  }

  ui.showTitle = () => {
    el.title.style.display = '';
    el.hud.style.display = 'none';
    el.card.style.display = 'none';
    if (S) S.state = 'title';
    fetchBoard();
    clearInterval(LB.refreshTimer);
    LB.refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && S && S.state === 'title') fetchBoard();
    }, COPY.BOARD_REFRESH_MS);
  };

  // --------------------------------------------------------------------------
  // name + play
  // --------------------------------------------------------------------------
  function nameOK() { return sanitizeName(el.name.value).length >= 1; }
  function syncPlay() { el.play.disabled = !nameOK(); }
  el.name.addEventListener('input', syncPlay);
  syncPlay();

  el.play.addEventListener('click', () => {
    if (!nameOK()) return;
    const name = sanitizeName(el.name.value);
    el.name.value = name;
    LS.set('fnac_name', name);
    S.playerName = name;
    initAudio();               // user gesture — unlock audio
    el.title.style.display = 'none';
    el.hud.style.display = '';
    clearInterval(LB.refreshTimer);
    S.startRun({ night: 1 });  // startRun resets the submitted flag
    showDragHintOnce();
  });

  // --------------------------------------------------------------------------
  // cards
  // --------------------------------------------------------------------------
  function card(title, sub, hint, btns) {
    el.card.style.display = '';
    el.cardTitle.textContent = title;
    el.cardSub.innerHTML = sub || '';
    el.cardHint.textContent = hint || '';
    el.cardBtns.innerHTML = '';
    (btns || []).forEach(([label, fn, cls]) => {
      const b = document.createElement('button');
      b.className = 'cbtn ' + (cls || '');
      b.textContent = label;
      b.addEventListener('click', fn);
      el.cardBtns.appendChild(b);
    });
  }
  ui.hideCards = () => { el.card.style.display = 'none'; };

  ui.showIntro = (night, cfg) => {
    el.hud.style.display = '';
    card(cfg.label, `12:00 AM<br><span class="dim">${COPY.STORY}</span>`, cfg.hint, []);
  };

  ui.showDeath = ({ night, clock, score, canRetry }) => {
    flashScreen(0);
    card('YOU DIED',
      `Night ${night} — ${clock}<br>SCORE <b>${score.toLocaleString()}</b>`,
      'submitting score to the board…',
      [
        ['RETRY NIGHT ' + night, () => { ui.hideCards(); S.startRun({ night, keepProgress: true }); }, 'primary'],
        ['TITLE', () => ui.showTitle(), ''],
      ]);
  };

  ui.showClear = ({ night, powerPts, score, powerLeft }) => {
    card('6:00 AM', `NIGHT ${night} SURVIVED<br><span class="dim">battery ${powerLeft}% → +${powerPts.toLocaleString()} pts</span><br>SCORE <b>${score.toLocaleString()}</b>`, '', []);
    setTimeout(() => { if (S.state === 'clear') { ui.hideCards(); S.advanceNight(); } }, 4200);
  };

  ui.showVictory = ({ score, powerPts }) => {
    card('6:00 AM — SUNRISE', `YOU SURVIVED ALL FIVE NIGHTS<br>FINAL SCORE <b>${score.toLocaleString()}</b>`, 'the house is quiet now.', [
      ['TITLE', () => ui.showTitle(), 'primary'],
    ]);
  };

  // --------------------------------------------------------------------------
  // HUD
  // --------------------------------------------------------------------------
  ui.updateHUD = () => {
    if (!S || el.hud.style.display === 'none') return;
    el.hudNight.textContent = 'NIGHT ' + S.night;
    el.hudClock.textContent = S.clockText();
    el.hudScore.textContent = S.currentScore().toLocaleString();
    if (S.blackout) {
      el.hudPower.textContent = 'POWER OUT';
      el.hudPower.classList.add('dead');
      el.hudPips.textContent = '';
    } else {
      el.hudPower.classList.remove('dead');
      el.hudPower.textContent = Math.max(0, Math.floor(S.power)) + '%';
      let pips = 1;
      if (S.doorClosed) pips++;
      if (S.curtainClosed) pips++;
      if (S.tabletUp) pips++;
      el.hudPips.textContent = '▮'.repeat(pips) + '▯'.repeat(4 - pips);
      el.hudPower.classList.toggle('low', S.power < 25);
    }
  };

  // --------------------------------------------------------------------------
  // pause, flash, hints
  // --------------------------------------------------------------------------
  ui.setPaused = (on) => {
    el.pause.style.display = on ? '' : 'none';
    if (on) suspendAudio(); else resumeAudio();
  };
  el.pause.addEventListener('click', () => { if (S) { S.paused = false; ui.setPaused(false); } });

  function flashScreen(delay = 0) {
    setTimeout(() => {
      el.flash.style.transition = 'none'; el.flash.style.opacity = '0.9';
      requestAnimationFrame(() => {
        el.flash.style.transition = 'opacity 0.5s'; el.flash.style.opacity = '0';
      });
    }, delay);
  }
  ui.flashScreen = flashScreen;

  let hintShown = false;
  function showDragHintOnce() {
    if (hintShown) return; hintShown = true;
    el.hint.style.display = '';
    setTimeout(() => { el.hint.style.opacity = '0'; }, 6000);
    setTimeout(() => { el.hint.style.display = 'none'; }, 7000);
  }

  return ui;
}
