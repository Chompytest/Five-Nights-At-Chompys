# FIVE NIGHTS AT CHOMPY'S
A browser survival-horror game in the FNAF 1 mold, set in a suburban home at 3AM.
Pure web: Three.js r164 from CDN, no build step, no npm, no bundler. Deploys to
Vercel as static files + one serverless function. Playable on desktop and mobile.

Engine loading: index.html probes the CDN and falls back automatically to the
vendored copy in `vendor/three/` if the CDN is unreachable (offline dev, blocked
networks, CDN outage). The game never blank-screens because a CDN blinked.

## Run it locally
ES modules need HTTP (not `file://`):
```
cd fnac
python3 -m http.server 8000     # or: npx serve
# open http://localhost:8000
```
The leaderboard API only exists when deployed (or under `vercel dev`); locally the
board shows "offline — scores will sync" and queues scores in localStorage. They
flush automatically once the game is served with a working `/api/scores`.

## Deploy to Vercel
1. `npm i -g vercel` (or use the Vercel dashboard "Add New Project" and point it
   at this folder / repo). No framework preset — it's a static site; `api/` is
   auto-detected as serverless functions.
2. `vercel deploy` from this folder.
3. Leaderboard storage — create a free Upstash Redis database
   (https://console.upstash.com), then in Vercel → Project → Settings →
   Environment Variables add:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Redeploy. Until the vars exist, `/api/scores` answers
   `{ok:false, error:"leaderboard_not_configured"}` (readable JSON, no crash)
   and the game plays fine without a board.

Board data lives in sorted set `chompy:fnac:board`, written with `ZADD GT`, so a
player's score can only ever go up. To reset a season: `DEL chompy:fnac:board`
in the Upstash console.

## Controls
- **Drag** (mouse or touch) — look around. Look far left/right to **lean**
  toward the door / window for a free (terrifying) peek.
- **Tap the door switch** (left wall) — hold the hallway door shut. Costs power.
- **Tap the curtain switch** (right wall) — draw the window curtain. Costs power.
- **Tap the tablet** on the desk — raise the camera feed. Costs power.
  On the tablet: five numbered bezel buttons switch cameras; the red strip
  (or tapping the tablet body) lowers it.
- Keyboard conveniences: `Space` tablet, `1–5` cameras, `D` door, `C` curtain,
  `Esc` lower tablet, `P` pause.

## The four rules (spoilers — this is the design)
| Killer | Rule | Counter |
|---|---|---|
| **CHOMPY** | Advances garage→kitchen→living→hallway→door on a timer. | Closed door. He thumps and retreats. |
| **COB** | Moves only while her room is NOT on the raised tablet. | Watch her camera to freeze her. Door stops her strike. |
| **BOO** | Advances whenever the doorbell cam hasn't been checked recently. Comes to the WINDOW. | Check CAM 5; if she's scratching, curtain shut until the tap. |
| **GOLDEN COB** | Materializes IN the den. Staring ≥2s kills. Lingering kills. | Don't look. Raise the tablet to dispel. |

Boo activates Night 2, Golden Cob Night 3. All timers are drawn from per-night
random bands (see `js/config.js` NIGHTS) so exact patterns can't be memorized.

## Scoring
`score = nights_cleared × 10000 + seconds_survived_this_night × 10 + power_%_at_each_6AM × 20`
Live in the HUD. Submitted when a run ends (death or victory). RETRY continues
the same playthrough (progress kept) as a new scoring run; PLAY starts fresh.

---

## ASSET SWAP GUIDE
Everything external is declared once, at the top of **`js/config.js`**, in the
`ASSETS` object. Swapping in real art = changing **only the `url` strings**
(or just dropping files at the already-declared paths). Missing files log one
console warning each and fall back to procedural placeholders — the game never
crashes and never blanks on a 404.

**Models (.glb):**
- Origin at the **feet / floor point** — the loader grounds the model at y=0
  and recenters x/z, so a wrong origin shows as a sunken/floating model.
- **Facing +Z.** If your model faces another way set `yaw` (radians) in its
  ASSETS entry.
- Scale: any — the loader auto-scales so the bounding-box height equals the
  entry's `height` (meters). Adjust `height` to taste (Chompy 1.95, Cob 2.10,
  Boo 1.40, Golden Cob 1.30-seated).
- Rigged characters: embed animations in the .glb; **clip 0 auto-plays** as a
  looping idle. Bone naming is irrelevant to the game (no retargeting is done).
  Jumpscares animate the whole model group (lunge + shake), so they work with
  any rig or none.
- Golden Cob should be **authored seated/slumped** — she appears sitting in the
  den armchair.
- Textures embedded in the .glb. Keep polycounts mobile-sane (< ~30k tris per
  character).

**Textures:** see `textures/README.txt` (name, resolution, format per file).
They hot-swap over the procedural versions when present.

**Sounds:** none needed — all synthesized (see `sounds/README.txt`).

## TUNING
All in **`js/config.js`**:

| Constant | What it does |
|---|---|
| `TUNING.NIGHT_SECONDS` | Real seconds per night (420 = 7 min; 70s per in-game hour). |
| `TUNING.DRAIN_PASSIVE` | %/sec always draining. At 0.132, doing nothing ends the night ~44%. |
| `TUNING.DRAIN_DOOR / DRAIN_CURTAIN / DRAIN_TABLET` | Extra %/sec per active device. These three ARE the difficulty — raise to punish camping. |
| `TUNING.BLACKOUT_GRACE` | Seconds of darkness before the scripted kill (band). |
| `TUNING.GRACE_PERIOD` | Quiet seconds at 12AM before AI wakes (doubled on Night 1). |
| `TUNING.GOLDEN_STARE_KILL` | Stare seconds before Golden Cob kills. |
| `TUNING.GOLDEN_ROLL_EVERY` | Seconds between her spawn dice rolls. |
| `NIGHTS[n].chompy.band` | Sec between Chompy room-advances (band). Lower = faster door pressure. |
| `NIGHTS[n].chompy.entryWait` | Sec he waits at the door before striking — the door-reaction window. |
| `NIGHTS[n].cob.band` | UNWATCHED sec Cob needs to advance. Lower = forces more camera time. |
| `NIGHTS[n].boo.neglect` | Sec since last doorbell-cam check before Boo advances. Lower = forces more CAM 5. |
| `NIGHTS[n].boo.grace` | Sec she waits at the window — the curtain-reaction window. |
| `NIGHTS[n].golden.p` | Probability per roll that she materializes. |
| `NIGHTS[n].golden.stay` | Sec she stays; expiry = death unless dispelled. |
| `SCORE_*` | The scoring formula terms. |

Difficulty philosophy: nights get harder by shrinking bands (faster threats),
never by raising drain — power math stays learnable while pressure rises.

## Debug / test hooks
Open with `?debug=1` → `window.FNAC` in the console:
`FNAC.timescale(10)` fast-forward · `FNAC.time(400)` jump near 6AM ·
`FNAC.power(3)` force low power · `FNAC.night(5)` jump to a night ·
`FNAC.golden()` force Golden Cob · `FNAC.kill('boo')` force a jumpscare ·
`FNAC.state()` dump AI state · `FNAC.boardTest()` submit a test score.

## Project map
```
index.html        markup, CSS, importmap (three@0.164.1 via CDN)
js/config.js      ASSETS registry + all tuning (edit this one)
js/util.js        math + procedural canvas textures
js/audio.js       synthesized WebAudio: tells, heartbeat, scream, chime
js/world.js       house, furniture fallbacks, lighting, dust, door/curtain
js/characters.js  4 placeholder killers + GLB auto-swap + jumpscare anim
js/security.js    camera tablet: render-to-texture feed + CCTV shader
js/ai.js          the four rules
js/game.js        state machine, power, clock, score, nights
js/ui.js          title/cards/HUD + leaderboard client (queue, backoff)
js/main.js        renderer, post pass, input, frame loop
api/scores.js     Vercel serverless leaderboard (Upstash REST, ZADD GT)
vendor/three/     vendored three.js fallback (CDN is used when reachable)
models/ textures/ sounds/   drop-in asset folders (empty by design)
```
