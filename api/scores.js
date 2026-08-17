// ============================================================================
// api/scores.js — Vercel serverless leaderboard (CommonJS, no npm packages).
//
// Storage: Upstash Redis via its REST API, called with plain fetch.
// Sorted set key: "chompy:fnac:board". ZADD GT — a name's score can only
// ever be raised, never lowered.
//
// Env vars (Vercel project settings → Environment Variables):
//   UPSTASH_REDIS_REST_URL     e.g. https://xxxx.upstash.io
//   UPSTASH_REDIS_REST_TOKEN
//
// Deliberate choices, please keep:
//  * CommonJS module.exports, NOT `export default` — this file must not need
//    a build step or "type":"module" side effects.
//  * env vars are read INSIDE the handler, never at module scope — module
//    scope runs at cold-start import where a missing var becomes an opaque
//    crash instead of a readable JSON error.
//  * every failure path returns readable JSON. Nothing here throws to the
//    platform — an uncaught throw is an opaque FUNCTION_INVOCATION_FAILED
//    with zero diagnostic value.
// ============================================================================

const KEY = 'chompy:fnac:board';
const GAME = 'fnac';
const MAX_SCORE = 70000; // hard sanity clamp: > theoretical max (~64,200)

function sanitizeName(n) {
  if (typeof n !== 'string') return '';
  return n.replace(/[^\w \-'.]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

module.exports = async function handler(req, res) {
  // never let a cached board masquerade as a lost score
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // env INSIDE the handler — a misconfigured deploy answers with JSON,
    // not a crash
    const URL_ = process.env.UPSTASH_REDIS_REST_URL;
    const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!URL_ || !TOKEN) {
      return res.status(200).json({ ok: false, error: 'leaderboard_not_configured', top: [] });
    }

    async function redisPipeline(cmds) {
      const r = await fetch(URL_.replace(/\/$/, '') + '/pipeline', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error('upstash_http_' + r.status + (text ? ':' + text.slice(0, 120) : ''));
      }
      return r.json();
    }

    // ---------------- GET: top ten + the requesting player's row ----------
    if (req.method === 'GET') {
      const q = req.query || {};
      if ((q.game || GAME) !== GAME) return res.status(200).json({ ok: true, top: [] });
      const name = sanitizeName(q.name || '');

      const cmds = [['ZREVRANGE', KEY, '0', '9', 'WITHSCORES']];
      if (name) cmds.push(['ZREVRANK', KEY, name], ['ZSCORE', KEY, name]);
      const out = await redisPipeline(cmds);

      const flat = (out[0] && out[0].result) || [];
      const top = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        top.push({ name: String(flat[i]), score: Number(flat[i + 1]) || 0 });
      }
      let player = null;
      if (name && out[2] && out[2].result !== null && out[2].result !== undefined) {
        player = {
          name,
          score: Number(out[2].result) || 0,
          rank: (Number(out[1] && out[1].result) || 0) + 1,
        };
      }
      return res.status(200).json({ ok: true, top, player });
    }

    // ---------------- POST: submit a score (ZADD GT — only ever raises) ---
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ ok: false, error: 'bad_body' });
      }
      if ((body.game || GAME) !== GAME) {
        return res.status(400).json({ ok: false, error: 'bad_game' });
      }
      const name = sanitizeName(body.name);
      const score = Math.round(Number(body.score));
      if (!name) return res.status(400).json({ ok: false, error: 'bad_name' });
      if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
        return res.status(400).json({ ok: false, error: 'bad_score' });
      }

      const out = await redisPipeline([['ZADD', KEY, 'GT', String(score), name]]);
      if (out[0] && out[0].error) {
        return res.status(200).json({ ok: false, error: 'redis_' + String(out[0].error).slice(0, 80) });
      }
      // accepted:true is the client's ONLY signal to clear its retry queue
      return res.status(200).json({ ok: true, accepted: true, name, score });
    }

    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (e) {
    // readable JSON, never an opaque platform error
    return res.status(200).json({ ok: false, error: 'server_' + String((e && e.message) || e).slice(0, 160) });
  }
};
