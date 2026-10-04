// ---- The Great Clock: core rules (no DOM) ----
const GEAR_NAMES = ['Pinion', 'Crown Wheel', 'Escape Wheel', 'Third Wheel', 'Centre Wheel', 'Great Wheel', 'Barrel', 'Fusee'];
const GEAR_BASE = [10, 100, 1e4, 1e6, 1e9, 1e13, 1e18, 1e24];
const GEAR_STEP = [1e3, 1e4, 1e5, 1e6, 1e8, 1e10, 1e12, 1e15];
// Pacing knobs (tools/sim.js tunes these against the target timeline).
// Target (active play): first wind ~5-7 min, first clock ~1 h, Clocktower ~1.5 h,
// first strike ~5 h; the whole game (five drawings) is meant to run 30-40 h.
const TUNE = { speed: 0.3, tension: 1, clockGrowth: 5, towerSpeed: 0.15, strikeAt: 1e9, windAt: 1e6 };

const CHIME_AT = 1e60;   // ticks needed to finish the first clock; each later clock is larger
const TOWER_AT = 5;      // finished clocks before the master's first case will open

const TOWER_NAMES = ['Pendulum Arbor', 'Hour Wheel', 'Going Barrel', 'Great Turret Wheel'];
const TOWER_BASE = [1, 10, 300, 1e4];
const TOWER_STEP = [8, 60, 600, 8000];

const AUTOMATONS = [
  { id: 'pip',  name: 'Pip',  gears: [0, 1], cost: 1,  note: 'Fits gears one and two. Hums while it works.' },
  { id: 'cog',  name: 'Cog',  gears: [2, 3], cost: 3,  note: 'Handles gears three and four. Very serious.' },
  { id: 'bolt', name: 'Bolt', gears: [4, 5], cost: 8,  note: 'Gears five and six. Drops screws.' },
  { id: 'tock', name: 'Tock', gears: [6, 7], cost: 20, note: 'Gears seven and eight. The master built this one.' },
];

function newRun() {
  return { ticks: 10, runTicks: 0, gears: GEAR_NAMES.map(() => ({ amount: 0, bought: 0 })) };
}

function newGame() {
  return Object.assign(newRun(), {
    tension: 0, spring: 0, oil: 0,
    autos: {}, autoOn: {},
    winds: 0, clocks: 0, chimes: 0, tempo: 0, autoWind: false,
    tower: newTower(), bells: 0, autoChime: false, autoChimeOn: true, struck: false,
    locks: {}, journal: [],
    time: 0,
  });
}
function newTower() { return { hours: 0, wheels: TOWER_NAMES.map(() => ({ amount: 0, bought: 0 })) }; }
// Older saves kept finished clocks as a list.
function migrate(s) {
  if (Array.isArray(s.clocks)) s.clocks = s.clocks.length;
  if (!s.tower) s.tower = newTower();
  if (!s.locks) s.locks = {};
  if (!s.journal) s.journal = [];
  return s;
}

const springMult = s => Math.pow(3, s.spring);
const SPRING_MAX = 12;  // a spring can only be wound so tight
const springCost = s => s.spring >= SPRING_MAX ? Infinity : Math.pow(3, s.spring);
const oilCost = s => [5, 25, 125][s.oil] ?? Infinity;
const toothMult = s => 2 + 0.5 * s.oil;
const tempoMult = s => Math.pow(2, s.tempo);
const tempoCost = s => Math.pow(2, s.tempo);
// Each finished clock on the workbench keeps ticking and lends a little speed.
const benchMult = s => 1 + s.clocks;
// The tower's hours feed back into every clock below it.
const hoursMult = s => Math.pow(1 + s.tower.hours, 0.1);
const towerOpen = s => !!(s.locks.case1 && s.locks.case1.solved);

function gearMult(s, i) {
  return Math.pow(toothMult(s), Math.floor(s.gears[i].bought / 10)) * springMult(s) * tempoMult(s) * benchMult(s) * hoursMult(s);
}
function gearCost(s, i) {
  const sets = Math.floor(s.gears[i].bought / 10);
  // Past ten sets, each further set costs ten times more than the one before
  // (as in Antimatter Dimensions' cost scaling), which keeps late runs finite.
  const over = Math.max(0, sets - 10);
  return GEAR_BASE[i] * Math.pow(GEAR_STEP[i], sets) * Math.pow(10, over * (over + 1) / 2);
}
function gearVisible(s, i) {
  return i === 0 || s.gears[i - 1].bought > 0;
}

function buyGear(s, i, max) {
  let n = 0;
  while (gearVisible(s, i)) {
    const c = gearCost(s, i);
    if (s.ticks < c) break;
    s.ticks -= c; s.gears[i].bought++; s.gears[i].amount++; n++;
    if (!max || n >= 1000) break;
  }
  return n;
}
// Buy up to the end of the current set of ten.
function buySet(s, i) {
  let n = 0;
  do {
    const c = gearCost(s, i);
    if (!gearVisible(s, i) || s.ticks < c) break;
    s.ticks -= c; s.gears[i].bought++; s.gears[i].amount++; n++;
  } while (s.gears[i].bought % 10 !== 0);
  return n;
}

function windGain(s) {
  if (s.runTicks < TUNE.windAt) return 0;
  // Gains slow down past the first clock's size so the spring can't run away.
  const l = Math.log10(s.runTicks);
  return Math.max(1, Math.floor(TUNE.tension * Math.pow(10, Math.min(l - 10, 35) / 6 + Math.max(0, l - 45) / 20)));
}
function wind(s) {
  const g = windGain(s);
  if (g <= 0) return false;
  s.tension += g; s.winds++;
  Object.assign(s, newRun());
  return true;
}

const chimeAt = s => CHIME_AT * Math.pow(10, TUNE.clockGrowth * s.clocks);
function canChime(s) { return s.ticks >= chimeAt(s); }
const bellMult = s => Math.pow(2, s.bells);
function chimeGain(s) { return canChime(s) ? bellMult(s) * Math.max(1, Math.floor(Math.log10(s.ticks / chimeAt(s)) + 1)) : 0; }
function chime(s) {
  if (!canChime(s)) return false;
  s.chimes += chimeGain(s);
  s.clocks += 1;
  // A finished clock keeps its automatons: they move with you.
  Object.assign(s, newRun(), { tension: 0, spring: 0, oil: 0, winds: 0 });
  return true;
}

function buySpring(s) { const c = springCost(s); if (s.tension < c) return false; s.tension -= c; s.spring++; return true; }
function buyOil(s) { const c = oilCost(s); if (s.tension < c) return false; s.tension -= c; s.oil++; return true; }
function buyAuto(s, a) {
  if (s.autos[a.id] || s.tension < a.cost) return false;
  s.tension -= a.cost; s.autos[a.id] = true; s.autoOn[a.id] = true; return true;
}
function buyTempo(s) { const c = tempoCost(s); if (s.chimes < c) return false; s.chimes -= c; s.tempo++; return true; }
function buyAutoWind(s) { if (s.autoWind || s.chimes < 1) return false; s.chimes -= 1; s.autoWind = true; return true; }

// ---- Layer 4: the Clocktower ----
function towerMult(s, i) {
  // Each finished clock lends the tower a tenth more speed: the inner layer drives the outer.
  return Math.pow(2, Math.floor(s.tower.wheels[i].bought / 10)) * (1 + 0.1 * s.clocks);
}
function towerCost(s, i) { return TOWER_BASE[i] * Math.pow(TOWER_STEP[i], Math.floor(s.tower.wheels[i].bought / 10)); }
function towerVisible(s, i) { return towerOpen(s) && (i === 0 || s.tower.wheels[i - 1].bought > 0); }
function buyTower(s, i, max) {
  let n = 0;
  while (towerVisible(s, i)) {
    const c = towerCost(s, i);
    if (s.chimes < c) break;
    s.chimes -= c; s.tower.wheels[i].bought++; s.tower.wheels[i].amount++; n++;
    if (!max) break;
  }
  return n;
}
const autoChimeCost = 10;
const bellCost = s => 5 * Math.pow(3, s.bells);
function buyAutoChime(s) { if (s.autoChime || s.chimes < autoChimeCost) return false; s.chimes -= autoChimeCost; s.autoChime = true; return true; }
function buyBell(s) { const c = bellCost(s); if (s.chimes < c) return false; s.chimes -= c; s.bells++; return true; }
function canStrike(s) { return !s.struck && s.tower.hours >= TUNE.strikeAt; }
function strike(s) { if (!canStrike(s)) return false; s.struck = true; return true; }

// ---- The master's cases: gear-dial locks ----
// Each dial is tied to its neighbours by a pawl: turn one a notch and the dials
// beside it slip a notch the other way. The chain matrix is invertible mod 12,
// so every lock can be solved from any position.
const LOCKS = {
  case1: {
    marks: 12,
    dials: [
      { name: 'Hour', labels: ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'] },
      { name: 'Minute', labels: ['00','05','10','15','20','25','30','35','40','45','50','55'] },
      { name: 'Night', labels: ['1','2','3','4','5','6','7','8','9','10','11','12'] },
    ],
    start: [9, 1, 4],
    target: [2, 9, 11],
    clue: 'If you are reading this, I did not come back. Set the case to the hour I left: a quarter to four, on the night of the twelfth. —M.',
    page: 'journal1',
  },
  // Case 2 is a different kind of puzzle: a gear train to complete.
  case2: {
    type: 'train',
    clue: 'The bell must turn against the crank, or the tower will ring backwards. Set wheels on the empty pins. —M.',
    page: 'journal2',
  },
};
const PAGES = {
  journal1: { title: 'Page one: the slowing', text: [
    'Apprentice,',
    'The seconds are getting longer. I have measured them against the stars for eleven winters and the answer does not change: the world is slowing, a little each year.',
    'I do not think the world keeps its own time. I think something keeps it for us, something old, and that it is running down. I have gone to find it.',
    'If I am wrong, finish the clock anyway. It is good work. If I am right, one clock will not be enough. You will need a tower. The drawing is under this page.',
    '—M.' ] },
  journal2: { title: 'Page two: the agreeing town', text: [
    'I found a town where every clock agreed and none of them were right.',
    'The church tower, the station, the watchmaker\'s window: all a quarter of an hour slow, and all slow together. They are not broken. They are listening to something older and slower than they are.',
    'A tower keeps time for a town. A town has more clocks than any tower can hold. Build me a city, and set every clock in it to yours.',
    '—M.' ] },
};
function lockState(s, id) {
  if (!s.locks[id]) s.locks[id] = { pos: LOCKS[id].start.slice(), solved: false };
  return s.locks[id];
}
function lockAvailable(s, id) {
  if (id === 'case1') return s.clocks >= TOWER_AT;
  if (id === 'case2') return s.struck;
  return false;
}
function lockTurn(s, id, i, dir) {
  const L = LOCKS[id], st = lockState(s, id);
  if (st.solved || !lockAvailable(s, id)) return false;
  const m = L.marks, n = L.dials.length, mod = v => ((v % m) + m) % m;
  st.pos[i] = mod(st.pos[i] + dir);
  if (i > 0) st.pos[i - 1] = mod(st.pos[i - 1] - dir);
  if (i < n - 1) st.pos[i + 1] = mod(st.pos[i + 1] - dir);
  if (st.pos.every((p, k) => p === L.target[k])) {
    st.solved = true;
    if (!s.journal.includes(L.page)) s.journal.push(L.page);
  }
  return true;
}
// Breadth-first search for the next move toward the solution.
function lockHint(pos, id) {
  const L = LOCKS[id], m = L.marks, n = L.dials.length, mod = v => ((v % m) + m) % m;
  const key = p => p.join(','), goal = key(L.target);
  if (key(pos) === goal) return null;
  const seen = new Map([[key(pos), null]]), q = [pos];
  while (q.length) {
    const p = q.shift();
    for (let i = 0; i < n; i++) for (const dir of [1, -1]) {
      const nx = p.slice(); nx[i] = mod(nx[i] + dir);
      if (i > 0) nx[i - 1] = mod(nx[i - 1] - dir);
      if (i < n - 1) nx[i + 1] = mod(nx[i + 1] - dir);
      const k = key(nx); if (seen.has(k)) continue;
      seen.set(k, { from: key(p), move: { i, dir } });
      if (k === goal) {
        let cur = k, step = seen.get(cur);
        while (step.from !== key(pos)) { cur = step.from; step = seen.get(cur); }
        return { ...step.move, moves: (() => { let d = 0, c = k; while (seen.get(c)) { d++; c = seen.get(c).from; } return d; })() };
      }
      q.push(nx);
    }
  }
  return null;
}

// ---- Case 2: complete the bell train ----
// A crank (12 teeth) and the bell arbor (30 teeth) sit on fixed pins, with three
// empty pins between them. Wheels mesh only when their centres are exactly one
// radius-sum apart, so each pin has one size that fits its neighbours. The lower
// pin gives a short route that turns the bell the same way as the crank; the
// two upper pins give the long route that turns it against the crank.
const TRAIN_SIZES = [12, 16, 20, 24, 28, 32];
const BELL_TRAIN = (() => {
  const k = 1;                                   // radius per tooth (drawing scales it)
  const C = { x: 0, y: 0, n: 12, fixed: true, name: 'Crank' };
  const B = { x: 70 * k, y: 0, n: 30, fixed: true, name: 'Bell' };
  const meet = (P, rp, Q, rq, up) => {           // point at rp from P and rq from Q
    const dx = Q.x - P.x, dy = Q.y - P.y, d = Math.hypot(dx, dy);
    const a = (rp * rp - rq * rq + d * d) / (2 * d), h = Math.sqrt(Math.max(0, rp * rp - a * a));
    const mx = P.x + a * dx / d, my = P.y + a * dy / d, sgn = up ? -1 : 1;
    return { x: mx - sgn * h * dy / d, y: my + sgn * h * dx / d };
  };
  const P1 = Object.assign(meet(C, 12 + 24, B, 24 + 30, false), { solveN: 24 });
  const P2 = { x: 32 * Math.cos(-1.1), y: 32 * Math.sin(-1.1), solveN: 20 };
  const P3 = Object.assign(meet(P2, 20 + 16, B, 16 + 30, true), { solveN: 16 });
  return { k, fixed: [C, B], pins: [P1, P2, P3], solution: [null, 20, 16] };
})();
function trainGears(pins) {
  const T = BELL_TRAIN, gs = [T.fixed[0], T.fixed[1]];
  pins.forEach((n, i) => { if (n) gs.push({ x: T.pins[i].x, y: T.pins[i].y, n, pin: i }); });
  return gs;
}
// Work out which wheels mesh, which collide, and how the train turns.
function trainEval(pins) {
  const gs = trainGears(pins), edges = [], clashes = [];
  for (let a = 0; a < gs.length; a++) for (let b = a + 1; b < gs.length; b++) {
    const d = Math.hypot(gs[a].x - gs[b].x, gs[a].y - gs[b].y), want = gs[a].n + gs[b].n;
    if (Math.abs(d - want) < 0.5) edges.push([a, b]);
    else if (d < want + 3.5) clashes.push([a, b]);      // tooth tips would collide
  }
  const dir = new Array(gs.length).fill(0); dir[0] = 1;
  let jam = clashes.length > 0;
  const q = [0];
  while (q.length) {
    const a = q.shift();
    for (const [u, v] of edges) {
      const b = u === a ? v : v === a ? u : -1; if (b < 0) continue;
      if (!dir[b]) { dir[b] = -dir[a]; q.push(b); } else if (dir[b] === dir[a]) jam = true;
    }
  }
  const bellDir = jam ? 0 : dir[1];
  return { gs, edges, clashes, dir, jam, driven: !jam && dir[1] !== 0, bellDir, solved: !jam && dir[1] === -1 };
}
function trainState(s) {
  if (!s.locks.case2) s.locks.case2 = { pins: [null, null, null], solved: false };
  if (!s.locks.case2.pins) s.locks.case2.pins = [null, null, null];   // older saves had dial cases
  return s.locks.case2;
}
function trainSet(s, pin, n) {
  const st = trainState(s);
  if (st.solved || !lockAvailable(s, 'case2')) return false;
  st.pins[pin] = n;
  if (trainEval(st.pins).solved) {
    st.solved = true;
    if (!s.journal.includes(LOCKS.case2.page)) s.journal.push(LOCKS.case2.page);
  }
  return true;
}
function trainHint(s) {
  const st = trainState(s), sol = BELL_TRAIN.solution;
  for (let i = 0; i < sol.length; i++) if (st.pins[i] !== sol[i]) return { pin: i, n: sol[i] };
  return null;
}
const hintCost = 1;

function tick(s, dt) {
  s.time += dt;
  // Tower wheels: the arbor makes hours, each wheel turns the one before it.
  if (towerOpen(s)) {
    const w = s.tower.wheels;
    for (let i = w.length - 1; i >= 0; i--) {
      if (w[i].amount <= 0) continue;
      const made = w[i].amount * towerMult(s, i) * TUNE.towerSpeed * dt;
      if (i === 0) s.tower.hours += made; else w[i - 1].amount += made;
    }
  }
  for (let i = GEAR_NAMES.length - 1; i >= 0; i--) {
    const g = s.gears[i];
    if (g.amount <= 0) continue;
    const made = g.amount * gearMult(s, i) * TUNE.speed * dt;
    if (i === 0) { s.ticks = Math.min(1e300, s.ticks + made); s.runTicks = Math.min(1e300, s.runTicks + made); }
    else s.gears[i - 1].amount = Math.min(1e300, s.gears[i - 1].amount + made);
  }
  s.autoClock = (s.autoClock || 0) + dt;
  if (s.autoClock >= 0.25) {
    s.autoClock = 0;
    for (const a of AUTOMATONS) {
      if (!s.autos[a.id] || !s.autoOn[a.id]) continue;
      for (let k = a.gears.length - 1; k >= 0; k--) buyGear(s, a.gears[k], true);
    }
    // Auto-wind: wind once a run would at least double your tension.
    if (s.autoWind && windGain(s) >= Math.max(1, s.tension)) wind(s);
    if (s.autoChime && s.autoChimeOn && canChime(s)) chime(s);
  }
}
function spentTension(s) {
  let t = 0; for (let k = 0; k < s.spring; k++) t += Math.pow(3, k); t += [0, 5, 30, 155][s.oil];
  for (const a of AUTOMATONS) if (s.autos[a.id]) t += a.cost;
  return t;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  TUNE, GEAR_NAMES, AUTOMATONS, CHIME_AT, TOWER_AT, LOCKS, newGame, migrate, tick, buyGear, buySet, gearCost, gearMult, gearVisible,
  windGain, wind, canChime, chimeGain, chime, buySpring, buyOil, buyAuto, buyTempo, buyAutoWind,
  springCost, oilCost, tempoCost, spentTension, towerOpen, towerCost, buyTower, buyAutoChime, buyBell, bellCost,
  canStrike, strike, chimeAt, BELL_TRAIN, trainEval, trainSet, trainState, trainHint, lockState, lockTurn, lockHint, lockAvailable,
};
