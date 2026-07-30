/*
 * Beaver Games API — a small Worker in front of the static site.
 *
 * Only /api/* reaches this code (wrangler.jsonc: run_worker_first); every
 * other path is served straight from the built assets.
 *
 *   GET  /api/scores?game=<slug>&period=week|all&limit=N  → { scores: [...] }
 *   POST /api/scores { id, game, name, score, wave, difficulty }
 *        Upserts by client-generated id, so saving a name after game over
 *        renames the run instead of adding a second row.
 *   POST /api/signup { email }                             → { ok: true }
 *
 * If the D1 binding is missing (database not created yet), reads return empty
 * lists and writes 503 — the site keeps working without the board.
 */

// Slugs must match src/data/games.js; kept inline so the Worker has no
// build-time dependency on the Astro source tree.
const KNOWN_GAMES = new Set(['chicken-attack', 'beaver-dash', 'orbit-cadet']);

const MAX_SCORE = 100_000_000;
const MAX_WAVE = 10_000;
const DIFFICULTIES = new Set(['rookie', 'veteran', 'superstar']);

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

const error = (message, status) => json({ error: message }, status);

/** Monday 00:00 UTC of the current week — the boards "reset" then. */
function weekStartIso(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString();
}

function cleanName(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .\-_]/g, '')
    .trim()
    .slice(0, 12) || 'PILOT';
}

async function getScores(env, url) {
  const game = url.searchParams.get('game') || '';
  if (!KNOWN_GAMES.has(game)) return error('unknown game', 400);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));
  const period = url.searchParams.get('period') === 'all' ? 'all' : 'week';
  if (!env.DB) return json({ scores: [], period });

  const since = period === 'week' ? weekStartIso() : '0000';
  const { results } = await env.DB.prepare(
    `SELECT name, score, wave, difficulty, created_at
       FROM scores
      WHERE game = ?1 AND created_at >= ?2
      ORDER BY score DESC, created_at ASC
      LIMIT ?3`
  )
    .bind(game, since, limit)
    .all();
  return json({ scores: results, period });
}

async function postScore(env, request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error('invalid json', 400);
  }

  const id = String(body.id || '').slice(0, 64);
  const game = String(body.game || '');
  const score = Math.floor(Number(body.score));
  const wave = Math.floor(Number(body.wave) || 0);
  const difficulty = String(body.difficulty || 'veteran');
  const name = cleanName(body.name);

  if (!/^[a-z0-9-]{8,64}$/.test(id)) return error('bad run id', 400);
  if (!KNOWN_GAMES.has(game)) return error('unknown game', 400);
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return error('bad score', 400);
  if (wave < 0 || wave > MAX_WAVE) return error('bad wave', 400);
  if (!DIFFICULTIES.has(difficulty)) return error('bad difficulty', 400);
  if (!env.DB) return error('leaderboard not configured', 503);

  // Upsert by run id. The score never goes down on re-submit: renames keep the
  // original numbers, so a rename cannot smuggle in a different result.
  await env.DB.prepare(
    `INSERT INTO scores (id, game, name, score, wave, difficulty)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name
       WHERE scores.game = excluded.game`
  )
    .bind(id, game, name, score, wave, difficulty)
    .run();
  return json({ ok: true });
}

async function postSignup(env, request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error('invalid json', 400);
  }
  // Honeypot: bots fill every field; humans never see this one.
  if (body.website) return json({ ok: true });
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return error('bad email', 400);
  if (!env.DB) return error('signups not configured', 503);
  await env.DB.prepare(
    `INSERT INTO signups (email) VALUES (?1) ON CONFLICT(email) DO NOTHING`
  )
    .bind(email)
    .run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // `await` matters: returning the bare promise would let its rejection
      // escape this try/catch and surface as a raw 500 instead of JSON.
      if (url.pathname === '/api/scores') {
        if (request.method === 'GET') return await getScores(env, url);
        if (request.method === 'POST') return await postScore(env, request);
        return error('method not allowed', 405);
      }
      if (url.pathname === '/api/signup' && request.method === 'POST') {
        return await postSignup(env, request);
      }
      if (url.pathname.startsWith('/api/')) return error('not found', 404);
    } catch (err) {
      console.error('api error', err);
      return error('internal error', 500);
    }

    // Non-API requests only reach the Worker when assets miss; hand back.
    return env.ASSETS.fetch(request);
  },
};
