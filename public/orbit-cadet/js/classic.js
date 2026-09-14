/*
 * Original 1990s space-pinball cabinet art.
 * Coordinates stay in the game's existing table space; art never changes collisions.
 */
export function cabinetLayout(width, height) {
  const wide = width >= 700 && width / height >= 1.12;
  const top = wide ? 14 : 86;
  const bottom = wide ? 14 : 64;
  const panelWidth = wide ? Math.min(290, Math.max(220, width * 0.26)) : 0;
  const gap = wide ? 18 : 0;
  const scaleY = 0.9;
  const scale = Math.max(0.1, Math.min(
    (width - 24 - panelWidth - gap) / 560,
    (height - top - bottom) / (1000 * scaleY)
  ));
  const tableWidth = 560 * scale;
  const tableHeight = 1000 * scale * scaleY;
  const left = (width - tableWidth - panelWidth - gap) / 2;
  const y = top + (height - top - bottom - tableHeight) / 2;
  return { wide, scale, scaleY, left, top: y,
    panel: { x: left + tableWidth + gap, y, w: panelWidth, h: tableHeight } };
}

function path(g, points, fill, stroke, width = 1) {
  g.beginPath(); g.moveTo(...points[0]);
  for (const p of points.slice(1)) g.lineTo(...p);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
}

function orbit(g, x, y, radius, tilt, color) {
  g.save(); g.translate(x, y); g.rotate(tilt);
  g.strokeStyle = color; g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, 0, radius, radius * 0.36, 0, 0, Math.PI * 2); g.stroke(); g.restore();
}

/** Printed artwork, cached along with the existing static playfield. */
export function bakeClassicArt(g) {
  g.save();
  // A blue planet and orbital paths behind the pop-bumper assembly.
  const planet = g.createRadialGradient(259, 353, 6, 280, 414, 139);
  planet.addColorStop(0, '#4788b0'); planet.addColorStop(.58, '#253966');
  planet.addColorStop(1, '#0c1736');
  g.fillStyle = planet; g.beginPath(); g.arc(280, 414, 137, 0, Math.PI * 2); g.fill();
  orbit(g, 280, 414, 160, -.6, '#ae9454');
  orbit(g, 280, 414, 151, .7, '#5a93bb');
  g.strokeStyle = '#547499'; g.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    g.beginPath(); g.ellipse(280, 414, 130, 25 + Math.abs(i) * 20, i * .32, 0, Math.PI * 2); g.stroke();
  }
  // A little orbital station printed between the top lanes and bumper cluster.
  path(g, [[260,235],[285,222],[310,235],[285,260]], '#aeb8ca', '#e9f3ff', 2);
  path(g, [[214,235],[250,229],[251,248],[215,255]], '#255778', '#91c4da', 2);
  path(g, [[320,229],[356,235],[355,255],[319,248]], '#255778', '#91c4da', 2);
  g.strokeStyle = '#a5bfd2'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(248,240); g.lineTo(322,240); g.moveTo(285,218); g.lineTo(285,194); g.stroke();

  // Original interceptor silhouette on the lower playfield, away from live targets.
  g.save(); g.translate(280,766); g.rotate(-.22);
  path(g, [[0,-42],[13,-7],[58,22],[15,19],[8,38],[-8,38],[-15,19],[-58,22],[-13,-7]], '#7893ab', '#c5d9e5', 2);
  path(g, [[0,-29],[6,-5],[0,8],[-6,-5]], '#78c6dc', '#e6f6ff', 1);
  path(g, [[-6,37],[0,55],[6,37]], '#c77936', null);
  g.restore();

  // Segmented warning strips and screw-fastened printed panels.
  for (const x of [111, 365]) {
    path(g, [[x,638],[x+82,638],[x+82,678],[x,678]], '#131d37', '#647690', 2);
    for (let i=0;i<7;i++) {
      g.fillStyle = i % 2 ? '#191f30' : '#c3a44e';
      g.fillRect(x + 5 + i*10, 674, 9, 3);
    }
    for (const dx of [4,78]) {
      g.fillStyle='#b7c9dc';g.beginPath();g.arc(x+dx,642,2,0,Math.PI*2);g.fill();
    }
  }
  // A ring of small printed lamps around the mission insignia.
  for (let i=0;i<12;i++) {
    const a=i*Math.PI/6;
    g.fillStyle=i%3===0?'#c4a757':'#335273';
    g.beginPath();g.arc(280+Math.cos(a)*64,766+Math.sin(a)*55,3,0,Math.PI*2);g.fill();
  }
  g.restore();
}

function text(g, value, x, y, size, color, maxWidth) {
  g.fillStyle=color;g.font=`700 ${size}px "Trebuchet MS",system-ui,sans-serif`;
  g.fillText(String(value),x,y,maxWidth);
}
function display(g, label, value, x, y, w, h) {
  g.fillStyle='#010607';g.fillRect(x,y,w,h);
  g.strokeStyle='#566371';g.lineWidth=2;g.strokeRect(x,y,w,h);
  text(g,label,x+12,y+20,11,'#84937b',w-24);
  g.fillStyle='#cbed96';g.font=`700 ${h>70?28:21}px "Courier New",monospace`;
  g.fillText(String(value),x+12,y+h-16,w-24);
}

/** One score tower on the right, like a desktop-era pinball cabinet. */
export function drawClassicBackglass(g, game) {
  const {x,y,w,h}=game.cabinet.panel;
  if (!w || h<200) return;
  g.save();g.translate(x,y);g.textAlign='left';g.textBaseline='alphabetic';
  const metal=g.createLinearGradient(0,0,w,0);
  metal.addColorStop(0,'#111b2c');metal.addColorStop(.5,'#27384e');metal.addColorStop(1,'#0b1422');
  g.fillStyle=metal;g.fillRect(0,0,w,h);
  g.strokeStyle='#667b91';g.lineWidth=2;g.strokeRect(1,1,w-2,h-2);
  for(const [sx,sy] of [[8,8],[w-8,8],[8,h-8],[w-8,h-8]]) {
    g.fillStyle='#aebac5';g.beginPath();g.arc(sx,sy,2.5,0,Math.PI*2);g.fill();
  }
  const compact=h<470;
  text(g,'ORBIT CADET',16,compact?28:40,compact?19:26,'#f1d889',w-32);
  text(g,'FLIGHT COMMAND',16,compact?46:62,10,'#9aafc4',w-32);
  const scoreY=compact?60:90;
  display(g,'PLAYER 1',game.score.toLocaleString('en-US'),14,scoreY,w-28,compact?64:86);
  const rankY=scoreY+(compact?74:100);
  display(g,'RANK',game.rank.toUpperCase(),14,rankY,w-28,60);
  if (compact) {
    text(g,`BALL ${game.ballNo} / 3`,16,rankY+81,12,'#d4e2ef',w-32);
    text(g,game.tilted?'TILT':game.mission?game.mission.name:'SELECT A MISSION',16,rankY+104,11,game.tilted?'#ff705d':'#cbed96',w-32);
  } else {
    text(g,`BALL ${game.ballNo} OF 3`,16,rankY+87,13,'#e0eaf4',w-32);
    text(g,`BONUS ×${game.bonusX}`,w/2,rankY+87,13,'#e0eaf4',w/2-16);
    const missionY=rankY+110;
    display(g,'MISSION CONTROL',game.mission?game.mission.name:'AWAITING ORDERS',14,missionY,w-28,72);
    text(g,game.mission?game.mission.hint:'Roll over the MISSION light',20,missionY+94,12,'#c2d3e1',w-40);
    const progress=game.mission?game.missionProgress/game.mission.goal:0;
    g.fillStyle='#090f1c';g.fillRect(20,missionY+108,w-40,8);
    g.fillStyle='#9ad987';g.fillRect(20,missionY+108,(w-40)*Math.min(1,progress),8);
    text(g,game.mission?`${game.missionProgress} / ${game.mission.goal}`:`${game.missionsDone} missions completed`,20,missionY+137,12,'#9ad987',w-40);
    if(h>=620) {
      text(g,'FLIGHT CONTROLS',20,h-133,11,'#d5bc76',w-40);
      for(const [i,row] of ['Z / M     FLIPPERS','SPACE     HOLD TO LAUNCH','N         NUDGE','P / ESC   PAUSE'].entries())
        text(g,row,20,h-108+i*21,12,'#bccbd9',w-40);
    }
  }
  g.restore();
}
