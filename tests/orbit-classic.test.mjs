import test from 'node:test';
import assert from 'node:assert/strict';
import { cabinetLayout } from '../public/orbit-cadet/js/classic.js';

const sizes = [[320,568],[390,844],[700,320],[800,500],[1280,800]];

test('classic cabinet fits phones and desktop without hiding the playfield', () => {
  for (const [w,h] of sizes) {
    const l = cabinetLayout(w,h);
    assert.ok(l.left >= 0 && l.top >= 0);
    assert.ok(l.top + 900*l.scale <= h);
    assert.ok(l.panel.x + l.panel.w <= w);
    assert.equal(l.wide, w >= 700 && w/h >= 1.12);
    if (l.wide) assert.ok(l.panel.x > l.left + 560*l.scale);
    else { assert.ok(l.top >= 86); assert.ok(l.top + 900*l.scale <= h-64); }
  }
});

test('classic renderer and cabinet layout survive launch, play, pause and mission states', async () => {
  // Canvas operations are mocked: this verifies runtime safety, not visual output.
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    measureText: s => ({ width: String(s).length * 8 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  }, {
    get: (target,key) => key in target ? target[key] : (...args) => {
      assert.ok(args.every(a => typeof a !== 'number' || Number.isFinite(a)), String(key));
    },
    set: (target,key,value) => { target[key]=value; return true; },
  });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { devicePixelRatio:1, matchMedia:()=>({matches:false}) };
  globalThis.document = { createElement:()=>({getContext:()=>ctx}) };
  try {
    const { Game } = await import('../public/orbit-cadet/js/game.js');
    for (const [width,height] of sizes) {
      const game = new Game({getContext:()=>ctx,getBoundingClientRect:()=>({width,height})});
      game.newGame();
      game.plungeHold(true);
      for (let i=0;i<60;i++) game.frame(1/60);
      game.plungeHold(false);
      for (let i=0;i<300;i++) game.frame(1/60);
      assert.ok(game.balls.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y)));
      assert.ok(game.score > 0);
      assert.equal(game.pause(),true); game.render();
      assert.equal(game.resume(),true);
      game.mission={name:'TARGET PRACTICE',hint:'Drop all three targets',goal:3};
      game.missionProgress=2;game.render();
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window=previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document=previousDocument;
  }
});
