/*
 * Timber Tails — every pixel in the game, built at load time. Creatures are
 * drawn as character maps (one letter per pixel, looked up in a palette);
 * tiles are painted with a few rectangles each so a world can re-colour them.
 */

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Character map → canvas. Short rows are padded so a typo cannot throw. */
export function sprite(key, rows, palette) {
  if (cache.has(key)) return cache.get(key);
  const w = Math.max(...rows.map((r) => r.length));
  const c = canvas(w, rows.length);
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = palette[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  cache.set(key, c);
  return c;
}

function paint(key, w, h, fn) {
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w, h);
  const g = c.getContext('2d');
  fn((x, y, ww, hh, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, ww, hh);
  }, g);
  cache.set(key, c);
  return c;
}

/* ------------------------------------------------------------------ Pip -- */

const PIP = {
  idle: [
    '................',
    '........KK..KK..',
    '.......KBBKKBBK.',
    '.......KBBBBBBK.',
    '.......KBBEBBEK.',
    '.......KBBBBLLLK',
    '.......KBBBLLNLK',
    '........KBBLWWK.',
    '..KKK...KRRRRK..',
    '.KTTTK.KBBBLLK..',
    'KTXTXTKBBBBLLK..',
    'KTTXTTKBBBBLLK..',
    'KTXTXTKBBBBLLK..',
    '.KTTTKKBBBBBBK..',
    '..KKK.KBBKKBBK..',
    '......KKK..KKK..',
  ],
  jump: [
    '................',
    '........KK..KK..',
    'KKK....KBBKKBBK.',
    'KTTK...KBBBBBBK.',
    'KTXTK..KBBEBBEK.',
    'KTTXTK.KBBBBLLLK',
    '.KTTXTKKBBBLLNLK',
    '..KTTTKKKBBLWWK.',
    '...KKKBBKRRRRK..',
    '.....KBBBBBLLK..',
    '.....KBBBBBLLK..',
    '.....KBBBBBLLKK.',
    '....KBBBBBBBBBK.',
    '...KBBKKKKKKBBK.',
    '...KKK......KKK.',
    '................',
  ],
  slam: [
    '................',
    '......KK..KK....',
    '.....KBBKKBBK...',
    '.....KBBBBBBK...',
    '....KBBEBBEBBK..',
    '....KBBLLLLBBK..',
    '....KBBLNNLBBK..',
    '....KBBLWWLBBK..',
    '.....KRRRRRRK...',
    '.....KBBBBBBK...',
    '....KKBBBBBBKK..',
    '...KTTKKKKKKTTK.',
    '..KTXTXTTTTXTXTK',
    '..KTTXTXTXTXTTTK',
    '...KTTTTTTTTTTK.',
    '....KKKKKKKKKK..',
  ],
};
PIP.run1 = [...PIP.idle.slice(0, 14), '..KKKKBBK..KBBK.', '.....KKK....KKK.'];
PIP.run2 = [...PIP.idle.slice(0, 14), '..KKK..KBBBK....', '.......KKKKK....'];

const PIP_PAL = {
  plain: { K: '#3b2416', B: '#b4703a', L: '#edc48a', T: '#6a4426', X: '#8a5c38', W: '#ffffff', E: '#1a1010', N: '#2b1a12', R: '#e2473b' },
  cones: { K: '#3b2416', B: '#b4703a', L: '#edc48a', T: '#6a4426', X: '#8a5c38', W: '#ffffff', E: '#1a1010', N: '#2b1a12', R: '#3fae5a' },
  gold: { K: '#7a4a0c', B: '#ffd23a', L: '#fff3b0', T: '#f0a020', X: '#ffe27a', W: '#ffffff', E: '#7a4a0c', N: '#7a4a0c', R: '#ffffff' },
  flash: { K: '#ffffff', B: '#ffffff', L: '#ffffff', T: '#ffffff', X: '#ffffff', W: '#ffffff', E: '#ffffff', N: '#ffffff', R: '#ffffff' },
};

export function pip(pose, look) {
  return sprite(`pip.${pose}.${look}`, PIP[pose] || PIP.idle, PIP_PAL[look] || PIP_PAL.plain);
}

/* ------------------------------------------------------------ creatures -- */

const E = '................';
const CREATURES = {
  snail: {
    pal: { K: '#2a1c2e', S: '#b0527a', s: '#f0a0b8', G: '#d6dc74', E: '#1a1010' },
    frames: [
      [E, E, E, E, E, E, '......KKKK......', '....KKSSSSKK....', '...KSSsssSSSK...', '...KSsSSSsSSK.K.', '..KSSsSsSsSSKKEK', '..KSSsSSssSSKGGK', '..KSSSsssSSKGGGK', '.KKKSSSSSSKGGGK.', 'KGGGKKKKKKGGGGK.', 'KKKKKKKKKKKKKK..'],
      [E, E, E, E, E, E, '......KKKK......', '....KKSSSSKK....', '...KSSsssSSSK...', '...KSsSSSsSSK..K', '..KSSsSsSsSSK.KE', '..KSSsSSssSSKGGK', '..KSSSsssSSKGGGK', '..KKSSSSSSKGGGK.', '.KGGKKKKKKGGGGGK', '.KKKKKKKKKKKKKKK'],
    ],
  },
  beetle: {
    pal: { K: '#16233d', B: '#3f6fb5', b: '#8fc0f2', L: '#16233d', E: '#ffffff' },
    frames: [
      [E, E, E, E, E, E, E, '.....KKKKKK.....', '...KKBBbbBBKK...', '..KBBBbBBBBBBK..', '.KBBBbBBBBBBEEK.', '.KBBBBBBBBBBEKK.', '.KKBBBBBBBBBBBK.', '..KKKKKKKKKKKK..', '..L..L....L..L..', '.LL.LL...LL.LL..'],
      [E, E, E, E, E, E, E, '.....KKKKKK.....', '...KKBBbbBBKK...', '..KBBBbBBBBBBK..', '.KBBBbBBBBBBEEK.', '.KBBBBBBBBBBEKK.', '.KKBBBBBBBBBBBK.', '..KKKKKKKKKKKK..', '...L..L..L..L...', '...LL.LL.LL.LL..'],
    ],
  },
  hog: {
    pal: { K: '#2a1c14', S: '#6b5340', s: '#e2d3b8', F: '#f0d2a6', E: '#1a1010', N: '#1a1010', L: '#4a3626' },
    frames: [
      [E, E, E, E, E, '....s..s..s.....', '...sSssSssSs....', '..sSSSSSSSSSs...', '.sSSsSSsSSsSSK..', '.SSSSSSSSSSFFFK.', 'sSSsSSsSSsFFEFK.', '.SSSSSSSSFFFFFNK', 'sSSSSSSSSFFFFFK.', '.KSSSSSSSSFFFK..', '..KKLLKKKKLLK...', '....LL....LL....'],
      [E, E, E, E, E, '....s..s..s.....', '...sSssSssSs....', '..sSSSSSSSSSs...', '.sSSsSSsSSsSSK..', '.SSSSSSSSSSFFFK.', 'sSSsSSsSSsFFEFK.', '.SSSSSSSSFFFFFNK', 'sSSSSSSSSFFFFFK.', '.KSSSSSSSSFFFK..', '..KLLKKKKKKLLK..', '...LL......LL...'],
    ],
  },
  frog: {
    pal: { K: '#173a1c', G: '#4caf50', g: '#c6ee8a', E: '#ffffff', P: '#1a1010' },
    frames: [
      [E, E, E, E, E, E, '..KKK....KKK....', '.KEEEK..KEEEK...', '.KEPEKKKKEPEK...', '.KGGGGGGGGGGGK..', 'KGGGGGGGGGGGGGK.', 'KGGggggggggGGGK.', 'KGGgggggggggGGK.', 'KGGKgggggggKGGK.', 'KGGGKKKKKKKGGGK.', '.KKKK.....KKKK..'],
      [E, E, E, E, '..KKK....KKK....', '.KEEEK..KEEEK...', '.KEPEKKKKEPEK...', '.KGGGGGGGGGGGK..', 'KGGGGGGGGGGGGGK.', 'KGGggggggggGGGK.', '.KGgggggggggGK..', '.KGKgggggggKGK..', '.KGK.KKKKK.KGK..', 'KGGK.......KGGK.', 'KGK.........KGK.', 'KK...........KK.'],
    ],
  },
  wasp: {
    pal: { K: '#2b2118', Y: '#f6c93b', D: '#2b2118', W: '#e4f5ff', E: '#ffffff' },
    frames: [
      [E, E, E, '....WWW..WW.....', '...WWWWWWWWW....', '...WWWWWWWW.....', '....WWWWWW......', '...KKKKKKKKK....', '..KYYDYYDYYYK...', '.KYYYDYYDYYEYK..', 'KDYYYDYYDYYYYYK.', '.KYYYDYYDYYYYK..', '..KYYDYYDYYYK...', '...KKKKKKKKK....', E, E],
      [E, E, E, E, E, '....WWWWWWW.....', '...WWWWWWWWW....', '...KKKKKKKKK....', '..KYYDYYDYYYK...', '.KYYYDYYDYYEYK..', 'KDYYYDYYDYYYYYK.', '.KYYYDYYDYYYYK..', '..KYYDYYDYYYK...', '...KKKKKKKKK....', E, E],
    ],
  },
  bat: {
    pal: { K: '#1e1430', P: '#6b4a8c', p: '#9a78bd', E: '#ffd84a' },
    frames: [
      [E, E, E, E, E, E, E, E, 'KK....K..K....KK', 'KPK..KPKKPK..KPK', 'KPPKKPPPPPPKKPPK', '.KPPPPEPPEPPPPK.', '..KPPPPPPPPPPK..', '...KKPPPPPPKK...', '.....KPKKPK.....', '......K..K......'],
      [E, E, E, E, E, E, E, E, '......K..K......', '.....KPKKPK.....', '..KKKPPPPPPKKK..', '.KPPPPEPPEPPPPK.', 'KPPKPPPPPPPPKPPK', 'KPK.KKPPPPKK.KPK', 'KK....KPPK....KK', '.......KK.......'],
    ],
  },
  pike: {
    pal: { K: '#16301f', G: '#4f8f68', g: '#a8d8a0', W: '#eef2d4', E: '#ffe45a', T: '#ffffff' },
    frames: [
      ['......KK........', '.....KGGK.......', '....KGGGGK......', '....KGEGEK......', '...KGGGGGGK.....', '...KGTTTTGK.....', '...KGGGGGGK.....', '...KGgGGgGK.....', '...KGgGGgGK.....', '...KGGWWGGK.....', '....KGWWGK......', '....KGWWGK......', '.....KGGK.......', '....KGGGGK......', '...KGGKKGGK.....', '...KKK..KKK.....'],
    ],
  },
  icicle: {
    pal: { K: '#5a8fb8', I: '#bfe9ff', i: '#ffffff' },
    frames: [
      ['....KKKKKKKK....', '....KiIIIIIK....', '....KiIIIIIK....', '.....KiIIIK.....', '.....KiIIIK.....', '.....KiIIIK.....', '......KiIK......', '......KiIK......', '......KiIK......', '......KiIK......', '.......KIK......', '.......KIK......', '.......KK.......', '........K.......', E, E],
    ],
  },
  saw: {
    pal: { K: '#23232b', S: '#aab2bd', s: '#eef2f6', C: '#8a5a2b' },
    frames: [
      ['......K..K......', '..K..KSKKSK..K..', '.KSKKSSSSSSKKSK.', '..KSSSSSSSSSSK..', '..KSSSssssSSSK..', '.KSSSsSSSSsSSSK.', 'KKSSsSSCCSSsSSKK', '.KSSsSCCCCSsSSK.', '.KSSsSCCCCSsSSK.', 'KKSSsSSCCSSsSSKK', '.KSSSsSSSSsSSSK.', '..KSSSssssSSSK..', '..KSSSSSSSSSSK..', '.KSKKSSSSSSKKSK.', '..K..KSKKSK..K..', '......K..K......'],
    ],
  },
  boar: {
    pal: { K: '#24160f', B: '#7a4a2a', b: '#a8744a', D: '#3d2a1e', T: '#fff3d6', E: '#ff4a3a', N: '#e39a8a', H: '#1c1410' },
    frames: [
      [
        '................................',
        '.........DDDDDDDDD..............',
        '.......DDDDDDDDDDDDD............',
        '......DDKKKKKKKKKKDDD.....KK....',
        '.....DKKBBBBBBBBBBKKDD..KKBBK...',
        '....DKBBBBBBBBBBBBBBKKKKBBBBK...',
        '...DKBBBBBBBBBBBBBBBBBBBBBBBBK..',
        '...KBBBBBBBBBBBBBBBBBBBBBEEBBK..',
        '..KBBBBBBBBBBBBBBBBBBBBBBEKBBBK.',
        '..KBBBBBBBBBBBBBBBBBBBBBBBBBNNNK',
        '.KKBBBBBBBBBBBBBBBBBBBBBBBBNNNNK',
        'KBKBBBBBBBBBBBBBBBBBBBBBBTBNKNKK',
        'KBKBBBBBBBBBBBBBBBBBBBBBTTBNNNK.',
        '.KKBBBbbbbbbbbbbbbbBBBBTTKKKKK..',
        '..KBBbbbbbbbbbbbbbbbBBBTK.......',
        '..KBBbbbbbbbbbbbbbbbBBBK........',
        '..KBBBbbbbbbbbbbbbbBBBBK........',
        '...KBBBBBBBBBBBBBBBBBBK.........',
        '...KBBBKKKKKKKKKKBBBBK..........',
        '...KBBK.KBBK..KBBKKBBK..........',
        '...KBBK.KBBK..KBBK.KBBK.........',
        '...KBBK.KBBK..KBBK.KBBK.........',
        '...KHHK.KHHK..KHHK.KHHK.........',
        '...KKKK.KKKK..KKKK.KKKK.........',
      ],
    ],
  },
};
CREATURES.boar.frames.push([
  ...CREATURES.boar.frames[0].slice(0, 19),
  '..KBBK..KBBK.KBBK..KBBK.........',
  '.KBBK...KBBK.KBBK...KBBK........',
  '.KBBK..KBBK...KBBK..KBBK........',
  '.KHHK..KHHK...KHHK..KHHK........',
  '.KKKK..KKKK...KKKK..KKKK........',
]);
const WHITE = new Proxy({}, { get: () => '#ffffff' });

export function creature(kind, frame = 0, flash = false) {
  const c = CREATURES[kind];
  const f = frame % c.frames.length;
  return sprite(`${kind}.${f}.${flash ? 'w' : 'n'}`, c.frames[f], flash ? WHITE : c.pal);
}

/* ---------------------------------------------------------------- items -- */

const ITEMS = {
  acorn: {
    pal: { K: '#4a2c10', C: '#8a5a2e', N: '#e6a64c', n: '#fad793' },
    rows: ['....KK....', '...KCCK...', '..KCCCCK..', '.KCCCCCCK.', '.KKKKKKKK.', '.KNNNNnNK.', '.KNNNNNnK.', '.KNNNNNNK.', '..KNNNNK..', '..KNNNNK..', '...KNNK...', '....KK....'],
  },
  gold: {
    pal: { K: '#8a5a0c', C: '#f0a020', N: '#ffd23a', n: '#fff6c0' },
    rows: ['....KK....', '...KCCK...', '..KCCCCK..', '.KCCCCCCK.', '.KKKKKKKK.', '.KNNNNnNK.', '.KNNNNNnK.', '.KNNNNNNK.', '..KNNNNK..', '..KNNNNK..', '...KNNK...', '....KK....'],
  },
  berry: {
    pal: { K: '#5a1420', R: '#e2473b', r: '#ff9a8a', G: '#3fae5a', g: '#1f6a34' },
    rows: ['......gG....', '.....gGG....', '....gg.g....', '...g....g...', '..KKK...KKK.', '.KRrRK.KRrRK', '.KRRRK.KRRRK', '.KRRRK.KRRRK', '..KKK...KKK.', '............'],
  },
  cones: {
    pal: { K: '#3a2412', B: '#8a5a2e', b: '#c08a52', G: '#3fae5a' },
    rows: ['.....GG.....', '....KKKK....', '...KBbBbK...', '..KbBbBbBK..', '..KBbBbBbK..', '..KbBbBbBK..', '..KBbBbBbK..', '...KBbBbK...', '...KbBbBK...', '....KBbK....', '....KKKK....', '............'],
  },
  cone: {
    pal: { K: '#3a2412', B: '#8a5a2e', b: '#c08a52' },
    rows: ['..KKKK..', '.KBbBbK.', 'KbBbBbBK', 'KBbBbBbK', 'KbBbBbBK', '.KBbBbK.', '..KbBK..', '...KK...'],
  },
  clover: {
    pal: { K: '#145a2a', G: '#3fcf6a', g: '#a8f5b8' },
    rows: ['..KK..KK....', '.KGgKKGgK...', '.KGGGGGGK...', '..KGGGGK....', '.KGGGGGGK...', '.KGgKKGgK...', '..KK.KKK....', '.....KK.....', '......KK....', '.......K....', '............', '............'],
  },
  log: {
    pal: { K: '#8a5a0c', G: '#ffd23a', g: '#fff6c0', D: '#d9961a', R: '#f0b028' },
    rows: ['..KKKKKKKKKK..', '.KDGGGGGGGGKK.', 'KDRKGGgGGGGKRK', 'KRKRKGGGGGGKRK', 'KRKRKGGGgGGKRK', 'KDRKGGGGGGGKRK', '.KDGGGGGGGGKK.', '..KKKKKKKKKK..'],
  },
  heart: {
    pal: { K: '#5a1420', R: '#e2473b', r: '#ff9a8a' },
    rows: ['.KK.KK.', 'KRrKRRK', 'KRRRRRK', 'KRRRRRK', '.KRRRK.', '..KRK..', '...K...'],
  },
};

export function item(kind) {
  const it = ITEMS[kind];
  return sprite(`item.${kind}`, it.rows, it.pal);
}

/* ------------------------------------------------------- tiny digit font -- */

const FONT = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  U: ['101', '101', '101', '101', '111'],
  P: ['111', '101', '111', '100', '100'],
  '+': ['000', '010', '111', '010', '000'],
};

export function drawText(g, text, x, y, colour) {
  let cx = Math.round(x - (text.length * 4 - 1) / 2);
  const cy = Math.round(y);
  for (const ch of text) {
    const glyph = FONT[ch];
    if (glyph) {
      g.fillStyle = '#1a1010';
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 3; c++) if (glyph[r][c] === '1') g.fillRect(cx + c + 1, cy + r + 1, 1, 1);
      g.fillStyle = colour;
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 3; c++) if (glyph[r][c] === '1') g.fillRect(cx + c, cy + r, 1, 1);
    }
    cx += 4;
  }
}

/* ---------------------------------------------------------------- worlds -- */

export const THEMES = {
  meadow: {
    sky: ['#6ec1f0', '#a8dcf7', '#e3f5e1'],
    far: '#a5d9a0',
    mid: '#74c06d',
    grass: ['#56b848', '#9be35f', '#3d8f36'],
    soil: ['#a06c3c', '#855430', '#bb8650'],
    stone: ['#9aa3ad', '#c7cfd6', '#6b737d'],
    leaf: '#56b848',
    thorn: ['#2f6a2a', '#d8ecb0'],
    liquid: ['#3d8fd1', '#8fd0f5'],
    trees: 'round',
    fx: 'clouds',
    music: 'day',
  },
  cave: {
    sky: ['#15111f', '#1d172b', '#271f38'],
    far: '#2a2140',
    mid: '#352a4f',
    grass: ['#7a66a8', '#a892d6', '#54447a'],
    soil: ['#4e4069', '#3d3154', '#5f507e'],
    stone: ['#6f6690', '#9a90bd', '#463e60'],
    leaf: '#8ff0d0',
    thorn: ['#7a3a6a', '#f0b0e0'],
    liquid: ['#2a5a8a', '#5f9fd0'],
    trees: 'spikes',
    fx: 'spores',
    music: 'deep',
    dark: true,
  },
  marsh: {
    sky: ['#f0b877', '#f6dca6', '#d6e8c4'],
    far: '#a9c59a',
    mid: '#7fa873',
    grass: ['#6f9a3c', '#a4c95a', '#4f7528'],
    soil: ['#6e5a3a', '#57462c', '#84704c'],
    stone: ['#8f9480', '#bcc2aa', '#62675a'],
    leaf: '#6f9a3c',
    thorn: ['#3d5a2a', '#d8e0a0'],
    liquid: ['#3f8272', '#84c8ae'],
    trees: 'reeds',
    fx: 'flies',
    music: 'water',
  },
  pines: {
    sky: ['#4fa5e0', '#9bd0f3', '#e8f6fb'],
    far: '#7fb2a8',
    mid: '#3f8a6a',
    grass: ['#2f8f4a', '#62c070', '#1f6a34'],
    soil: ['#8a5234', '#6e3e26', '#a66a48'],
    stone: ['#8f8f86', '#c0c0b6', '#62625a'],
    leaf: '#2f8f4a',
    thorn: ['#1f5a2a', '#c8e8a0'],
    liquid: ['#3d8fd1', '#8fd0f5'],
    trees: 'pine',
    fx: 'clouds',
    music: 'day',
  },
  frost: {
    sky: ['#8fb8e2', '#cbe2f6', '#f7fcff'],
    far: '#c4d9ee',
    mid: '#9fbfe0',
    grass: ['#f2faff', '#ffffff', '#b8d6ee'],
    soil: ['#7f9fc2', '#6a88ac', '#96b4d4'],
    stone: ['#8fa3bd', '#c2d2e6', '#62748c'],
    leaf: '#e6f6ff',
    thorn: ['#6aa0d0', '#ffffff'],
    liquid: ['#3d6fb1', '#8fb8f5'],
    trees: 'pine',
    fx: 'snow',
    music: 'water',
  },
  ember: {
    sky: ['#2c1018', '#6e2620', '#d0602a'],
    far: '#4a1c1c',
    mid: '#34161a',
    grass: ['#6a5a54', '#8f7e76', '#463a36'],
    soil: ['#3e2c2c', '#2c1e1e', '#523c3a'],
    stone: ['#5a4a4c', '#84706e', '#362a2c'],
    leaf: '#d0602a',
    thorn: ['#2a1a1a', '#ff8a3a'],
    liquid: ['#ff6a1a', '#ffd23a'],
    trees: 'dead',
    fx: 'embers',
    music: 'deep',
  },
  storm: {
    sky: ['#272e3e', '#434e63', '#76839a'],
    far: '#3a4456',
    mid: '#2f3847',
    grass: ['#4f8a5a', '#78b684', '#356240'],
    soil: ['#5e5764', '#4a4452', '#746c7c'],
    stone: ['#737a88', '#a4acba', '#4c525e'],
    leaf: '#4f8a5a',
    thorn: ['#2a4a34', '#c0e0b0'],
    liquid: ['#2f4f7f', '#6f8fbf'],
    trees: 'dead',
    fx: 'rain',
    music: 'storm',
  },
  mill: {
    sky: ['#0d1230', '#1c2756', '#3a4888'],
    far: '#1a2250',
    mid: '#141a40',
    grass: ['#4a6a8a', '#7a9aba', '#30485f'],
    soil: ['#3a3a5a', '#2c2c48', '#4c4c70'],
    stone: ['#6a7090', '#a0a8c8', '#444a66'],
    leaf: '#7a9aba',
    thorn: ['#3a4060', '#d0d8f0'],
    liquid: ['#1f3f8f', '#5f8fdf'],
    trees: 'mill',
    fx: 'stars',
    music: 'storm',
  },
};

/** Tile art for one world, painted once and kept. */
export function tileset(name) {
  const th = THEMES[name];
  const k = `tiles.${name}.`;
  const speck = [
    [3, 5], [12, 6], [8, 8], [1, 10], [14, 9], [6, 11], [11, 12], [2, 14], [9, 15], [14, 14],
  ];
  const ground = (top, variant) =>
    paint(`${k}ground.${top}.${variant}`, 16, 16, (r) => {
      r(0, 0, 16, 16, th.soil[0]);
      for (const [x, y] of speck) r((x + variant * 5) % 16, y, 2, 1, th.soil[1]);
      for (const [x, y] of speck) r((x * 3 + 7 + variant * 3) % 16, (y + 5) % 16, 1, 1, th.soil[2]);
      if (!top) return;
      r(0, 0, 16, 4, th.grass[0]);
      for (let x = 0; x < 16; x++) {
        const d = (x * 7 + variant * 3) % 5;
        if (d < 2) r(x, 4, 1, 1 + (d === 0 ? 1 : 0), th.grass[0]);
        if ((x + variant) % 3 === 0) r(x, 0, 1, 1, th.grass[1]);
      }
      r(0, 1, 16, 1, th.grass[1]);
      r(0, 3, 16, 1, th.grass[2]);
    });
  const bevel = (key, face, light, dark, edge) =>
    paint(k + key, 16, 16, (r) => {
      r(0, 0, 16, 16, edge);
      r(1, 1, 14, 14, face);
      r(1, 1, 14, 1, light);
      r(1, 1, 1, 14, light);
      r(1, 14, 14, 1, dark);
      r(14, 1, 1, 14, dark);
    });
  const set = {
    groundTop: [ground(true, 0), ground(true, 1)],
    ground: [ground(false, 0), ground(false, 1)],
    stone: paint(k + 'stone', 16, 16, (r) => {
      r(0, 0, 16, 16, th.stone[2]);
      r(0, 0, 15, 7, th.stone[0]);
      r(0, 8, 7, 7, th.stone[0]);
      r(8, 8, 8, 7, th.stone[0]);
      r(0, 0, 15, 1, th.stone[1]);
      r(0, 8, 7, 1, th.stone[1]);
      r(8, 8, 8, 1, th.stone[1]);
    }),
    crate: paint(k + 'crate', 16, 16, (r) => {
      r(0, 0, 16, 16, '#5e3a18');
      r(1, 1, 14, 14, '#c08a4e');
      r(1, 5, 14, 1, '#96642f');
      r(1, 10, 14, 1, '#96642f');
      for (let i = 0; i < 12; i++) r(2 + i, 2 + i, 2, 1, '#7a4c20');
      r(1, 1, 14, 1, '#e0b070');
      r(2, 2, 1, 1, '#3a2410');
      r(13, 2, 1, 1, '#3a2410');
      r(2, 13, 1, 1, '#3a2410');
      r(13, 13, 1, 1, '#3a2410');
    }),
    stash: [0, 1, 2].map((f) =>
      paint(`${k}stash.${f}`, 16, 16, (r) => {
        r(0, 0, 16, 16, '#6e4310');
        r(1, 1, 14, 14, f === 1 ? '#ffc94a' : '#f2b02e');
        r(1, 1, 14, 1, '#ffe9a0');
        r(1, 1, 1, 14, '#ffe9a0');
        r(1, 14, 14, 1, '#b97a14');
        r(14, 1, 1, 14, '#b97a14');
        /* an acorn stamped on the lid */
        r(6, 3, 4, 1, '#6e4310');
        r(5, 4, 6, 2, '#6e4310');
        r(5, 6, 6, 4, '#8a5a1a');
        r(6, 10, 4, 1, '#8a5a1a');
        r(7, 11, 2, 1, '#8a5a1a');
        if (f === 2) r(3, 3, 2, 2, '#ffffff');
      }),
    ),
    used: bevel('used', '#8f7f6a', '#a89880', '#6a5c4a', '#4a3f33'),
    branch: paint(k + 'branch', 16, 16, (r) => {
      r(0, 0, 16, 6, '#8a5a2e');
      r(0, 0, 16, 1, '#c08a52');
      r(0, 5, 16, 1, '#553418');
      r(3, 2, 3, 1, '#6e4520');
      r(10, 3, 4, 1, '#6e4520');
      r(1, 6, 2, 2, th.leaf);
      r(12, 6, 3, 2, th.leaf);
      r(13, 8, 1, 1, th.leaf);
    }),
    thorn: paint(k + 'thorn', 16, 16, (r) => {
      for (let i = 0; i < 4; i++) {
        const x = i * 4;
        r(x + 1, 6, 1, 3, th.thorn[1]);
        r(x + 1, 8, 1, 8, th.thorn[0]);
        r(x, 10, 3, 6, th.thorn[0]);
        r(x + 3, 13, 1, 3, th.thorn[0]);
      }
    }),
    shroom: paint(k + 'shroom', 16, 16, (r) => {
      r(5, 9, 6, 7, '#f3ead2');
      r(5, 9, 1, 7, '#c9bf9f');
      r(10, 9, 1, 7, '#c9bf9f');
      r(2, 3, 12, 6, '#3a2466');
      r(4, 1, 8, 2, '#3a2466');
      r(1, 5, 14, 4, '#3a2466');
      r(3, 3, 10, 5, '#8a5fd6');
      r(5, 2, 6, 1, '#8a5fd6');
      r(2, 5, 12, 3, '#8a5fd6');
      r(4, 3, 3, 1, '#b08cf0');
      r(4, 5, 2, 2, '#ffe27a');
      r(9, 3, 2, 2, '#ffe27a');
      r(11, 6, 2, 1, '#ffe27a');
    }),
    ice: paint(k + 'ice', 16, 16, (r) => {
      r(0, 0, 16, 16, '#7fb4d8');
      r(0, 0, 15, 15, '#bfe6fb');
      r(0, 0, 16, 2, '#ffffff');
      r(3, 5, 4, 1, '#ffffff');
      r(5, 6, 4, 1, '#ffffff');
      r(10, 10, 3, 1, '#e6f6ff');
      r(2, 12, 2, 1, '#e6f6ff');
    }),
    crumble: paint(k + 'crumble', 16, 16, (r) => {
      r(0, 0, 16, 10, '#5a3c1e');
      r(0, 1, 16, 8, '#a67c50');
      r(0, 1, 16, 1, '#c9a070');
      r(4, 1, 1, 5, '#5a3c1e');
      r(5, 5, 1, 4, '#5a3c1e');
      r(11, 1, 1, 3, '#5a3c1e');
      r(10, 4, 1, 5, '#5a3c1e');
      r(7, 6, 2, 1, '#5a3c1e');
    }),
    check: [false, true].map((on) =>
      paint(`${k}check.${on}`, 16, 32, (r) => {
        r(3, 4, 2, 28, '#6e4520');
        r(3, 4, 1, 28, '#96642f');
        r(2, 2, 4, 2, '#f2b02e');
        r(5, 5, 9, 7, on ? '#e2473b' : '#8f8f8f');
        r(5, 5, 9, 1, on ? '#ff8a7a' : '#b8b8b8');
        r(12, 7, 2, 3, on ? '#b82a22' : '#6a6a6a');
        if (on) {
          r(8, 7, 2, 2, '#ffffff');
          r(7, 9, 4, 1, '#ffffff');
        }
      }),
    ),
    door: [false, true].map((open) =>
      paint(`${k}door.${open}`, 48, 40, (r) => {
        /* a lodge of piled sticks with a round door */
        const stick = ['#8a5a2e', '#6e4520', '#a8744a'];
        for (let y = 0; y < 40; y++) {
          const half = Math.round(24 * Math.sqrt(Math.max(0, 1 - Math.pow((40 - y) / 40, 2.2))));
          for (let x = 24 - half; x < 24 + half; x += 4) r(x, y, 4, 1, stick[((x >> 2) + (y >> 1)) % 3]);
        }
        r(16, 14, 16, 26, '#24160f');
        r(18, 12, 12, 2, '#24160f');
        if (open) {
          r(18, 16, 12, 24, '#ffd98a');
          r(20, 14, 8, 2, '#ffd98a');
          r(18, 30, 12, 10, '#f2b02e');
        } else {
          r(18, 16, 12, 24, '#4a3020');
          for (let x = 19; x < 30; x += 3) r(x, 14, 1, 26, '#8f8f8f');
          r(18, 26, 12, 1, '#8f8f8f');
        }
      }),
    ),
  };
  return set;
}
