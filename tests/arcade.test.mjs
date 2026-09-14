import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  challengeFrom,
  scoreLink,
  isEditing,
} from "../public/shared/arcade.js";
import worker from "../worker/index.js";

const request = (body, path = "/api/scores") =>
  new Request(`https://arcade.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const run = {
  id: "test-run-12345678",
  game: "chicken-attack",
  name: "PILOT",
  score: 100,
  wave: 1,
  difficulty: "veteran",
};

test("challenge links preserve score and difficulty and reject hostile values", () => {
  const url = scoreLink(
    "chicken-attack",
    12345,
    "superstar",
    "https://arcade.test",
  );
  assert.deepEqual(challengeFrom(new URL(url).search), {
    score: 12345,
    mode: "superstar",
  });
  for (const v of [
    "-1",
    "0",
    "Infinity",
    "NaN",
    "1.5",
    "1e5",
    "100000001",
    "<script>",
  ])
    assert.equal(challengeFrom(`?challenge=${encodeURIComponent(v)}`), null);
  assert.equal(challengeFrom("?challenge=100&mode=cheat"), null);
});

test("API rejects null, array, fractional, and non-numeric input before using DB", async () => {
  for (const body of [
    null,
    [],
    { ...run, score: null },
    { ...run, score: "100" },
    { ...run, score: 1.5 },
    { ...run, wave: 1.5 },
    { ...run, wave: "1" },
  ]) {
    const response = await worker.fetch(request(body), {});
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(
    (await worker.fetch(request(null, "/api/signup"), {})).status,
    400,
  );
});

test("long runner distances remain eligible and leaderboard limits are integral and difficulty-scoped", async () => {
  let bound;
  const DB = {
    prepare: (sql) => ({
      bind: (...args) => {
        bound = { sql, args };
        return { run: async () => ({}), all: async () => ({ results: [] }) };
      },
    }),
  };
  assert.equal(
    (
      await worker.fetch(
        request({ ...run, game: "beaver-dash", wave: 20000 }),
        { DB },
      )
    ).status,
    200,
  );
  const response = await worker.fetch(
    new Request(
      "https://arcade.test/api/scores?game=chicken-attack&limit=2.8&difficulty=rookie",
    ),
    { DB },
  );
  assert.equal(response.status, 200);
  assert.equal(bound.args[2], 2);
  assert.equal(bound.args[3], "rookie");
  assert.match(bound.sql, /difficulty = \?4/);
  assert.equal(
    (
      await worker.fetch(
        new Request("https://arcade.test/api/scores?game=chicken-attack"),
        {},
      )
    ).status,
    503,
  );
});

test("every offline game includes all shared dependencies", () => {
  for (const slug of [
    "chicken-attack",
    "beaver-dash",
    "orbit-cadet",
    "whittle-wares",
  ]) {
    const sw = readFileSync(`public/${slug}/sw.js`, "utf8");
    assert.match(sw, /'\/shared\/arcade.js'/);
    assert.match(sw, /'\/shared\/arcade.css'/);
    const assets = sw.slice(
      sw.indexOf("const ASSETS"),
      sw.indexOf("];", sw.indexOf("const ASSETS")),
    );
    for (const [, asset] of assets.matchAll(/'([^']+)'/g)) {
      assert.ok(
        existsSync(
          asset.startsWith("/") ? `public${asset}` : `public/${slug}/${asset}`,
        ),
        asset,
      );
    }
  }
});

test("editing guard protects names and other form input", () => {
  assert.equal(isEditing({ closest: () => ({}) }), true);
  assert.equal(isEditing({ closest: () => null }), false);
  assert.equal(isEditing(null), false);
});

test("pinball pause releases flippers and cancels plunger without launching", async () => {
  globalThis.window = {};
  const { Game } = await import("../public/orbit-cadet/js/game.js");
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    state: "playing",
    tilted: false,
    table: { flippers: [{ up: true }, { up: true }] },
    plungerHeld: true,
    plunger: 0.8,
    emit: () => {},
  });
  assert.equal(game.pause(), true);
  assert.deepEqual(
    game.table.flippers.map((f) => f.up),
    [false, false],
  );
  assert.equal(game.plungerHeld, false);
  assert.equal(game.plunger, 0);
  assert.equal(game.resume(), true);
  assert.equal(game.state, "playing");
});

test("Chicken Attack does not intercept player-name typing or leave released movement stuck", async () => {
  const { Input } = await import("../public/chicken-attack/js/input.js");
  const input = Object.create(Input.prototype);
  Object.assign(input, { keys: new Set(["w"]), enabled: true });
  let paused = 0;
  input.onPause = () => paused++;
  const event = {
    key: "p",
    target: { closest: () => ({}) },
    preventDefault() {
      throw Error("Typing was intercepted");
    },
  };
  input._key(event, true);
  assert.equal(paused, 0);
  input._key({ ...event, key: "w" }, false);
  assert.equal(input.keys.has("w"), false);
});
