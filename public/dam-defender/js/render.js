import { MAPS, TOWERS, WIDTH, HEIGHT, hash } from './data.js';

export function canvasPoint(rect, clientX, clientY) {
  return {
    x: ((clientX - rect.left) / rect.width) * WIDTH,
    y: ((clientY - rect.top) / rect.height) * HEIGHT,
  };
}
export function nearestPad(map, point) {
  let best = -1,
    distance = 40;
  MAPS[map].pads.forEach(([x, y], i) => {
    const d = Math.hypot(point.x - x, point.y - y);
    if (d < distance) {
      best = i;
      distance = d;
    }
  });
  return best;
}

function path(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const p of points.slice(1)) ctx.lineTo(...p);
}
function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
function rounded(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}
function text(
  ctx,
  label,
  x,
  y,
  size = 14,
  colour = '#263e32',
  align = 'center',
) {
  ctx.fillStyle = colour;
  ctx.font = `700 ${size}px system-ui`;
  ctx.textAlign = align;
  ctx.fillText(label, x, y);
}

export function beaver(ctx, x, y, scale = 1, colour = '#945d40', hat = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ellipse(ctx, 8, 14, 9, 15, '#5c4435');
  ellipse(ctx, 0, 7, 13, 17, colour);
  circle(ctx, -7, -10, 5, '#674533');
  circle(ctx, 7, -10, 5, '#674533');
  circle(ctx, 0, -3, 13, colour);
  ellipse(ctx, 0, 3, 8, 6, '#d7b88b');
  circle(ctx, -4, -6, 2, '#1e2b24');
  circle(ctx, 5, -6, 2, '#1e2b24');
  ellipse(ctx, 0, 0, 3, 2, '#312f28');
  rounded(ctx, -3, 5, 3, 5, 1, '#fff4d6');
  rounded(ctx, 1, 5, 3, 5, 1, '#fff4d6');
  if (hat) {
    rounded(ctx, -14, -14, 28, 5, 2, '#eacb7b');
    rounded(ctx, -10, -23, 20, 12, 4, '#eacb7b');
  }
  ctx.restore();
}
function tree(ctx, x, y, scale, colour) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ellipse(ctx, 5, 15, 27, 10, '#1d483421');
  rounded(ctx, -4, -5, 8, 27, 2, '#7c6548');
  circle(ctx, -12, -15, 22, colour);
  circle(ctx, 12, -17, 23, colour);
  circle(ctx, 0, -35, 25, colour);
  circle(ctx, -7, -40, 14, '#ffffff0d');
  ctx.restore();
}
export function towerArt(ctx, type, x, y, level = 1, time = 0) {
  ctx.save();
  ctx.translate(x, y);
  ellipse(ctx, 0, 18, 24, 9, '#29463530');
  if (type === 'bramble') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      circle(ctx, Math.cos(a) * 14, Math.sin(a) * 10, 11, '#638257');
      circle(ctx, Math.cos(a) * 17, Math.sin(a) * 9, 3, '#d7af73');
    }
  } else if (type === 'mill') {
    rounded(ctx, -20, -17, 31, 37, 4, '#debb81');
    ctx.fillStyle = '#805846';
    ctx.beginPath();
    ctx.moveTo(-24, -15);
    ctx.lineTo(-5, -36);
    ctx.lineTo(16, -15);
    ctx.fill();
    ctx.save();
    ctx.translate(17, 6);
    ctx.rotate(time * 0.6);
    circle(ctx, 0, 0, 18, '#76513e');
    circle(ctx, 0, 0, 13, '#c69e6a');
    ctx.strokeStyle = '#76513e';
    ctx.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      path(ctx, [
        [0, 0],
        [Math.cos(a) * 18, Math.sin(a) * 18],
      ]);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    rounded(ctx, -16, -7, 32, 28, 4, '#9e7751');
    rounded(ctx, -19, -11, 38, 8, 3, '#deb679');
    if (type === 'watch') {
      rounded(ctx, -11, -42, 22, 34, 3, '#c9aa76');
      rounded(ctx, -19, -48, 38, 10, 3, '#74513a');
      ctx.fillStyle = '#526e52';
      ctx.beginPath();
      ctx.moveTo(-25, -47);
      ctx.lineTo(0, -68);
      ctx.lineTo(25, -47);
      ctx.fill();
      rounded(ctx, -5, -35, 10, 12, 2, '#465347');
    } else if (type === 'log') {
      ctx.save();
      ctx.rotate(-0.6);
      rounded(ctx, -10, -28, 20, 40, 5, '#744b33');
      ellipse(ctx, 0, -27, 10, 5, '#dcb879');
      ctx.restore();
    } else {
      circle(ctx, 0, -21, 16, '#d2974b');
      ellipse(ctx, 0, -29, 17, 7, '#705640');
      rounded(ctx, -3, -41, 6, 9, 2, '#705640');
    }
  }
  for (let i = 0; i < level; i++)
    circle(ctx, -(level - 1) * 5 + i * 10, 27, 3, '#ffedbd');
  ctx.restore();
}
function enemyArt(ctx, e, time) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const size = e.boss ? 1.9 : 1;
  ctx.scale(size, size);
  ellipse(ctx, 0, 12, 13, 5, '#243e3235');
  if (e.flying) {
    const flap = Math.sin(time * 12) * 7;
    ctx.strokeStyle = e.boss ? '#51476e' : '#e8e7d0';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    path(ctx, [
      [-22, -12 + flap],
      [0, -2],
      [22, -12 + flap],
    ]);
    ctx.stroke();
    ellipse(ctx, 0, 0, 7, 14, e.boss ? '#66638a' : '#f2ebd4');
    ctx.fillStyle = '#e1b359';
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(4, 24);
    ctx.lineTo(-4, 14);
    ctx.fill();
  } else {
    const colour =
      e.type === 'boar'
        ? '#746152'
        : e.type === 'runner'
          ? '#bf764c'
          : '#888a80';
    ellipse(ctx, 0, 2, 12, 16, colour);
    circle(ctx, -7, -12, 4, colour);
    circle(ctx, 7, -12, 4, colour);
    circle(ctx, 0, -5, 12, colour);
    if (e.type === 'raider' || e.type === 'raccoon')
      rounded(ctx, -10, -9, 20, 7, 3, '#38423a');
    circle(ctx, -4, -6, 2, '#fff8dd');
    circle(ctx, 4, -6, 2, '#fff8dd');
    ellipse(ctx, 0, 1, 5, 3, '#3e3932');
    if (e.type === 'boar') {
      ctx.strokeStyle = '#f3e6c2';
      ctx.lineWidth = 3;
      path(ctx, [
        [-8, 0],
        [-12, 6],
        [-9, 9],
      ]);
      ctx.stroke();
      path(ctx, [
        [8, 0],
        [12, 6],
        [9, 9],
      ]);
      ctx.stroke();
    }
  }
  if (e.boss) {
    ctx.fillStyle = '#f5ca69';
    ctx.beginPath();
    ctx.moveTo(-9, -18);
    ctx.lineTo(-11, -29);
    ctx.lineTo(-3, -24);
    ctx.lineTo(0, -32);
    ctx.lineTo(4, -24);
    ctx.lineTo(11, -29);
    ctx.lineTo(9, -18);
    ctx.fill();
  }
  if (e.shield) {
    ctx.strokeStyle = '#f1d4a0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (e.slow > 0) {
    ctx.strokeStyle = '#b8d5a1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 12, 17, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  if (e.hp < e.maxHp || e.boss) {
    const w = e.boss ? 65 : 27;
    rounded(ctx, e.x - w / 2, e.y - (e.boss ? 66 : 25), w, 5, 2, '#294338');
    rounded(
      ctx,
      e.x - w / 2,
      e.y - (e.boss ? 66 : 25),
      w * Math.max(0, e.hp / e.maxHp),
      5,
      2,
      e.boss ? '#e9ae72' : '#dbe6b2',
    );
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cache = new Map();
    this.resize();
  }
  resize() {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.canvas.width = WIDTH * dpr;
    this.canvas.height = HEIGHT * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  background(mapIndex) {
    if (this.cache.has(mapIndex)) return this.cache.get(mapIndex);
    const cv = document.createElement('canvas');
    cv.width = WIDTH;
    cv.height = HEIGHT;
    const ctx = cv.getContext('2d'),
      map = MAPS[mapIndex];
    ctx.fillStyle = map.land;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    let seed = hash(map.id);
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 280; i++) {
      const x = random() * WIDTH,
        y = random() * HEIGHT;
      ellipse(ctx, x, y, 2 + random() * 4, 1, map.dark + '55');
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    path(ctx, map.river);
    ctx.strokeStyle = '#ecdeb2';
    ctx.lineWidth = 123;
    ctx.stroke();
    path(ctx, map.river);
    ctx.strokeStyle = map.water;
    ctx.lineWidth = 99;
    ctx.stroke();
    path(
      ctx,
      map.river.map(([x, y]) => [x + 15, y]),
    );
    ctx.strokeStyle = '#d4f0d955';
    ctx.lineWidth = 5;
    ctx.stroke();
    for (const route of map.paths) {
      path(ctx, route);
      ctx.strokeStyle = '#a9916866';
      ctx.lineWidth = 46;
      ctx.stroke();
      path(ctx, route);
      ctx.strokeStyle = '#e1cda0';
      ctx.lineWidth = 34;
      ctx.stroke();
      ctx.setLineDash([3, 17]);
      path(ctx, route);
      ctx.strokeStyle = '#b2a07888';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const [x, y] of map.trees)
      tree(
        ctx,
        x,
        y,
        1.1 + random() * 0.6,
        mapIndex === 2 ? '#436b62' : mapIndex === 1 ? '#818554' : '#648b62',
      );
    // A small village watches from the far bank.
    for (const [x, y] of [
      [725, 530],
      [800, 500],
      [850, 550],
    ]) {
      rounded(ctx, x - 21, y - 18, 42, 40, 4, '#f0dcaf');
      ctx.fillStyle = mapIndex === 2 ? '#756b8b' : '#bc7750';
      ctx.beginPath();
      ctx.moveTo(x - 29, y - 16);
      ctx.lineTo(x, y - 43);
      ctx.lineTo(x + 29, y - 16);
      ctx.fill();
      rounded(ctx, x - 5, y + 2, 10, 20, 2, '#705946');
      rounded(ctx, x + 9, y - 9, 8, 8, 2, '#fff1b5');
    }
    ctx.save();
    ctx.translate(482, 537);
    ctx.rotate(-0.025);
    for (let i = 0; i < 9; i++) {
      rounded(ctx, -64 + i * 15, -19, 12, 41, 4, '#6d5038');
      rounded(ctx, -62 + i * 15, -17, 4, 37, 2, '#b68b58');
    }
    rounded(ctx, -75, -15, 150, 8, 3, '#b48b5d');
    rounded(ctx, -75, 10, 150, 8, 3, '#c09a68');
    ctx.restore();
    beaver(ctx, 619, 558, 1.25, '#97613e', true);
    this.cache.set(mapIndex, cv);
    return cv;
  }
  draw(game, selected = -1, time = 0, reduced = false, previewType = 'acorn') {
    const s = game.state,
      ctx = this.ctx,
      mapIndex = s?.map || 0,
      map = MAPS[mapIndex];
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(this.background(mapIndex), 0, 0);
    const clock = reduced ? 0 : time;
    for (let i = 0; i < 9; i++) {
      const y = (i * 77 + clock * 18) % 600;
      const x = 470 + Math.sin(y / 85) * 25;
      ctx.strokeStyle = '#e5f3d766';
      ctx.lineWidth = 2;
      path(ctx, [
        [x - 7, y],
        [x + 7, y],
      ]);
      ctx.stroke();
    }
    if (s?.floodTimer > 0) {
      ctx.fillStyle = `rgba(137,226,218,${s.floodTimer * 0.16})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      for (const route of map.paths) {
        path(ctx, route);
        ctx.lineWidth = 55;
        ctx.strokeStyle = '#bceae3aa';
        ctx.stroke();
      }
      text(ctx, 'WHOOSH!', 480, 275, 38, '#f3ffe8');
    }
    if (s?.hp < s?.maxHp) {
      ctx.fillStyle = '#bd765955';
      ctx.fillRect(412, 514, 140 * (1 - s.hp / s.maxHp), 40);
    }
    for (let i = 0; i < map.pads.length; i++) {
      const [x, y] = map.pads[i],
        tower = s?.towers.find((t) => t.pad === i);
      if (selected === i) {
        const range = tower
          ? game.stats(tower).range
          : TOWERS[previewType].range;
        if (range) {
          circle(ctx, x, y, range, '#f9efd528');
          ctx.strokeStyle = '#ffeed788';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        circle(ctx, x, y, 34, '#ffecb69c');
      }
      if (tower) towerArt(ctx, tower.type, x, y, tower.level, clock);
      else {
        circle(ctx, x, y, 23, '#f9edcc99');
        ctx.strokeStyle = selected === i ? '#8e572f' : '#6d835c88';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        text(ctx, '+', x, y + 6, 24, '#6a7d56');
      }
      text(ctx, String(i + 1), x + 25, y + 28, 10, '#344c3b');
    }
    for (const e of [...(s?.enemies || [])].sort((a, b) => a.y - b.y))
      enemyArt(ctx, e, clock);
    for (const e of s?.effects || []) {
      ctx.globalAlpha = Math.min(1, e.life / e.max);
      if (e.kind === 'shot') {
        ctx.strokeStyle = e.colour;
        ctx.lineWidth = e.type === 'log' ? 7 : 3;
        path(ctx, [
          [e.x, e.y - 16],
          [e.tx, e.ty],
        ]);
        ctx.stroke();
        circle(ctx, e.tx, e.ty, e.type === 'bramble' ? 18 : 6, e.colour + '88');
      } else {
        ctx.strokeStyle = e.colour;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 8 + (1 - e.life / e.max) * 24, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Signs clarify the entrance and destination without covering build sites.
    for (let i = 0; i < map.paths.length; i++) {
      const [x, y] = map.paths[i][0];
      text(
        ctx,
        '↓ RAIDERS',
        Math.min(895, Math.max(75, x)),
        Math.max(28, y + 25),
        12,
        '#744832',
      );
    }
    text(ctx, 'YOUR DAM', 480, 587, 12, '#28453a');
    if (mapIndex === 2 && !reduced) {
      for (let i = 0; i < 22; i++) {
        const x = hash(`firefly${i}`) % 960,
          y = hash(`glow${i}`) % 510;
        ctx.globalAlpha = 0.35 + Math.sin(clock * 2 + i) * 0.3;
        circle(ctx, x, y, 2, '#fff2b2');
      }
      ctx.globalAlpha = 1;
    }
  }
}
