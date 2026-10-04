// ---- The Great Clock: core rules (no DOM) ----
const GEAR_NAMES = ['Pinion', 'Crown Wheel', 'Escape Wheel', 'Third Wheel', 'Centre Wheel', 'Great Wheel', 'Barrel', 'Fusee'];
const GEAR_BASE = [10, 100, 1e4, 1e6, 1e9, 1e13, 1e18, 1e24];
const GEAR_STEP = [1e3, 1e4, 1e5, 1e6, 1e8, 1e10, 1e12, 1e15];
// Pacing knobs (tools/sim.js tunes these against the target timeline).
// Target (active play): first wind ~5-7 min, first clock ~1 h, Clocktower ~1.5 h,
// first strike ~5 h, city synchronised ~13 h, orrery complete ~23 h; the whole game (five drawings)
// is meant to run 30-40 h.
const TUNE = { speed: 0.3, tension: 1, clockGrowth: 5, towerSpeed: 0.15, strikeAt: 1e9, windAt: 1e6, citySpeed: 0.03, cityGoal: 1e30, driftTime: 90, orrerySpeed: 0.001, orreryGoal: 1e40 };

const CHIME_AT = 1e60;   // ticks needed to finish the first clock; each later clock is larger
const TOWER_AT = 5;      // finished clocks before the master's first case will open

const CITY_NAMES = ['Market', 'Station', 'Cathedral', 'Docks', 'University', 'Observatory'];
const CITY_BASE = [10, 100, 1e4, 1e6, 1e9, 1e13];
const CITY_STEP = [1e3, 1e4, 1e5, 1e6, 1e8, 1e10];
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
    city: newCity(), relay: false, relayOn: true,
    governor: false, governorOn: true, ringer: false, ringerOn: true,
    orrery: newOrrery(), lamplighters: false, lamplightersOn: true, observer: false, observerOn: true,
    locks: {}, journal: [],
    time: 0,
  });
}
function newCity() { return { accord: 10, drift: 0, districts: CITY_NAMES.map(() => ({ amount: 0, bought: 0 })) }; }
function newTower() { return { hours: 0, wheels: TOWER_NAMES.map(() => ({ amount: 0, bought: 0 })) }; }
// Older saves kept finished clocks as a list.
function migrate(s) {
  if (Array.isArray(s.clocks)) s.clocks = s.clocks.length;
  if (!s.tower) s.tower = newTower();
  if (!s.city) s.city = newCity();
  if (!s.orrery) s.orrery = newOrrery();
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
// Accord from the city's synchronised dials speeds the tower.
const accordMult = s => s.city ? Math.pow(1 + s.city.accord, 0.12) : 1;
const cityOpen = s => !!(s.locks.case2 && s.locks.case2.solved);
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
  return Math.pow(2, Math.floor(s.tower.wheels[i].bought / 10)) * (1 + 0.1 * s.clocks) * accordMult(s);
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
// The governor spends tension for you: tightest spring first, then oil.
const governorCost = 25;
function buyGovernor(s) { if (s.governor || s.chimes < governorCost) return false; s.chimes -= governorCost; s.governor = true; return true; }
function runGovernor(s) { let n = 0; while (n < 50 && (buySpring(s) || buyOil(s))) n++; return n; }
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
// Case 3: the count wheel (locking plate) that tells a striking train how many
// blows to give. Notches cut into the rim divide it into runs; each run is
// one striking. The first notch is cut already.
LOCKS.case3 = {
  type: 'count',
  slots: 12,
  target: [3, 1, 4, 4],
  clue: 'Cut the plate so the bell strikes three, then one, then four, then four, and comes round to the start. —M.',
  page: 'journal3',
};
function countState(s) {
  if (!s.locks.case3) s.locks.case3 = { notches: [true, false, false, false, false, false, false, false, false, false, false, false], solved: false };
  return s.locks.case3;
}
function countRuns(notches) {
  const runs = []; let n = 0;
  for (let i = 1; i <= notches.length; i++) { n++; if (i === notches.length || notches[i]) { runs.push(n); n = 0; } }
  return runs;
}
function countToggle(s, i) {
  const st = countState(s);
  if (st.solved || i === 0 || !cityDone(s)) return false;
  st.notches[i] = !st.notches[i];
  if (countRuns(st.notches).join() === LOCKS.case3.target.join()) {
    st.solved = true;
    if (!s.journal.includes(LOCKS.case3.page)) s.journal.push(LOCKS.case3.page);
  }
  return true;
}
function countHint(s) {
  const want = [false, false, false, false, false, false, false, false, false, false, false, false];
  let p = 0; for (const r of LOCKS.case3.target) { want[p] = true; p += r; }
  const st = countState(s);
  for (let i = 1; i < 12; i++) if (st.notches[i] !== want[i]) return { slot: i, cut: want[i] };
  return null;
}
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
  journal3: { title: 'Page three: the observatory', text: [
    'The city\'s dials agree with yours now. I could hear it from the observatory hill: every bell in the valley striking together.',
    'The astronomer here keeps a book of the planets\' positions going back two hundred years. The slowing is in it too. It is not steady. It speeds and slackens with the planets, as if they were wheels in the same train.',
    'I think the planets are its hands. Build me an orrery, and we will see what it is pointing at.',
    '—M.' ] },
};
function lockState(s, id) {
  if (!s.locks[id]) s.locks[id] = { pos: LOCKS[id].start.slice(), solved: false };
  return s.locks[id];
}
function lockAvailable(s, id) {
  if (id === 'case1') return s.clocks >= TOWER_AT;
  if (id === 'case2') return s.struck;
  if (id === 'case3') return cityDone(s);
  if (id === 'case4') return orreryDone(s);
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

// ---- Layer 5: the City ----
// Dials across six districts are wired to your tower. Each district's dials
// feed the one before it, as everywhere else; the Market's dials make Accord.
// Wired dials drift out of step, which cuts their output, until the time
// signal is sent (by hand, or by the relay).
const sync = s => 1 - s.city.drift;
function cityMult(s, i) {
  return Math.pow(2, Math.floor(s.city.districts[i].bought / 10)) * (1 + Math.log10(1 + s.tower.hours)) * sync(s) * starMult(s);
}
function cityCost(s, i) {
  const sets = Math.floor(s.city.districts[i].bought / 10), over = Math.max(0, sets - 10);
  return CITY_BASE[i] * Math.pow(CITY_STEP[i], sets) * Math.pow(10, over * (over + 1) / 2);
}
function cityVisible(s, i) { return cityOpen(s) && (i === 0 || s.city.districts[i - 1].bought > 0); }
function buyDistrict(s, i, max) {
  let n = 0;
  while (cityVisible(s, i)) {
    const c = cityCost(s, i);
    if (s.city.accord < c || !isFinite(c)) break;
    s.city.accord -= c; s.city.districts[i].bought++; s.city.districts[i].amount++; n++;
    if (!max || n >= 1000) break;
  }
  return n;
}
function sendSignal(s) { if (!cityOpen(s)) return false; s.city.drift = 0; return true; }
// The bell-ringer spends chimes for you: bells, tempo, then turret wheels (largest first).
const ringerCost = 1e8;
function buyRinger(s) { if (s.ringer || s.city.accord < ringerCost) return false; s.city.accord -= ringerCost; s.ringer = true; return true; }
function runRinger(s) {
  let n = 0;
  while (n < 50 && (buyBell(s) || buyTempo(s))) n++;
  for (let i = 3; i >= 0; i--) n += buyTower(s, i, true);
  return n;
}
const relayCost = 1e14;
function buyRelay(s) { if (s.relay || s.city.accord < relayCost) return false; s.city.accord -= relayCost; s.relay = true; return true; }
// Latches: once the city is in step, spending accord never undoes it.
const cityDone = s => s.city.synced || (s.city.accord >= TUNE.cityGoal && (s.city.synced = true));

// ---- Layer 6: the Orrery ----
// Six planet arms on one brass sun. Earth's arm makes years, and each arm turns
// the one before it, as everywhere else. The arms really orbit, at true ratios:
// when a planet comes into line with Earth you can observe the conjunction, and
// every recorded conjunction makes the whole orrery run faster.
const ORRERY_NAMES = ['Earth', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
const ORRERY_BASE = [10, 100, 1e4, 1e6, 1e9, 1e13];
const ORRERY_STEP = [1e3, 1e4, 1e5, 1e6, 1e8, 1e10];
const ORBIT = [240, 58, 147, 451, 2847, 7070];   // seconds per turn of the model; Earth's year is four minutes
const CONJ_WIDTH = 0.26;                          // about 15 degrees either side of Earth's line
function newOrrery() { return { years: 10, t: 0, arms: ORRERY_NAMES.map(() => ({ amount: 0, bought: 0 })), records: 0, logged: ORRERY_NAMES.map(() => false) }; }
const orreryOpen = s => !!(s.locks.case3 && s.locks.case3.solved);
const starMult = s => orreryOpen(s) ? Math.pow(1 + s.orrery.years, 0.08) : 1;
const recordMult = s => Math.pow(2, s.orrery.records / 10);
function armMult(s, i) {
  // Recorded conjunctions speed up Earth's arm only, so they can't compound down the chain.
  return Math.pow(2, Math.floor(s.orrery.arms[i].bought / 10)) * (1 + Math.log10(1 + s.city.accord)) * (i === 0 ? recordMult(s) : 1);
}
function armCost(s, i) {
  const sets = Math.floor(s.orrery.arms[i].bought / 10), over = Math.max(0, sets - 10);
  return ORRERY_BASE[i] * Math.pow(ORRERY_STEP[i], sets) * Math.pow(10, over * (over + 1) / 2);
}
function armVisible(s, i) { return orreryOpen(s) && (i === 0 || s.orrery.arms[i - 1].bought > 0); }
function buyArm(s, i, max) {
  let n = 0;
  while (armVisible(s, i)) {
    const c = armCost(s, i);
    if (s.orrery.years < c || !isFinite(c)) break;
    s.orrery.years -= c; s.orrery.arms[i].bought++; s.orrery.arms[i].amount++; n++;
    if (!max || n >= 1000) break;
  }
  return n;
}
const armAngle = (s, i) => (s.orrery.t / ORBIT[i] % 1) * 2 * Math.PI;
// Planets (built, other than Earth) lying within the window of Earth's line.
function inLine(s) {
  const out = [], e = armAngle(s, 0);
  for (let i = 1; i < ORRERY_NAMES.length; i++) {
    if (!s.orrery.arms[i].bought) continue;
    const d = Math.abs(((armAngle(s, i) - e) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    if (d < CONJ_WIDTH) out.push(i);
  }
  return out;
}
// Seconds until planet i next comes into line with Earth (0 if it is in line now).
function nextConjunction(s, i) {
  const wE = 2 * Math.PI / ORBIT[0], wi = 2 * Math.PI / ORBIT[i], TAU = 2 * Math.PI;
  const r = ((armAngle(s, i) - armAngle(s, 0)) % TAU + TAU) % TAU;
  if (r < CONJ_WIDTH || r > TAU - CONJ_WIDTH) return 0;
  return wi > wE ? (TAU - CONJ_WIDTH - r) / (wi - wE) : (r - CONJ_WIDTH) / (wE - wi);
}
const newInLine = s => inLine(s).filter(i => !s.orrery.logged[i]);
// Two planets in line at once count four, three count nine.
function observe(s) {
  const k = newInLine(s); if (!k.length) return 0;
  for (const i of k) s.orrery.logged[i] = true;
  s.orrery.records += k.length * k.length;
  return k.length * k.length;
}
// The lamplighters' guild wires new dials in the city for you.
const lamplightersCost = 1e4;
function buyLamplighters(s) { if (s.lamplighters || s.orrery.years < lamplightersCost) return false; s.orrery.years -= lamplightersCost; s.lamplighters = true; return true; }
// The observatory camera records every conjunction for you.
const observerCost = 1e25;
function buyObserver(s) { if (s.observer || s.orrery.years < observerCost) return false; s.orrery.years -= observerCost; s.observer = true; return true; }
const orreryDone = s => s.orrery.done || (s.orrery.years >= TUNE.orreryGoal && (s.orrery.done = true));

// ---- Case 4: compound ratios ----
// Two pairs of wheels on a shared arbor carry Earth's turn to the Moon's arm.
// The Moon must go round twelve times a year; no wheel may be used twice.
const RATIO_TRAY = [10, 15, 20, 30, 40, 60];
const RATIO_TARGET = 12;
function ratioState(s) {
  if (!s.locks.case4) s.locks.case4 = { slots: [null, null, null, null], solved: false };
  return s.locks.case4;
}
const ratioOf = sl => sl.every(Boolean) ? (sl[0] / sl[1]) * (sl[2] / sl[3]) : null;
function ratioSet(s, slot, n) {
  const st = ratioState(s);
  if (st.solved || !orreryDone(s)) return false;
  if (n !== null && st.slots.some((v, k) => k !== slot && v === n)) return false;
  st.slots[slot] = n;
  if (ratioOf(st.slots) === RATIO_TARGET) {
    st.solved = true;
    if (!s.journal.includes(LOCKS.case4.page)) s.journal.push(LOCKS.case4.page);
  }
  return true;
}
function ratioSolutions() {
  const out = [], T = RATIO_TRAY;
  for (const a of T) for (const b of T) for (const c of T) for (const d of T)
    if (new Set([a, b, c, d]).size === 4 && (a * c) === RATIO_TARGET * b * d) out.push([a, b, c, d]);
  return out;
}
function ratioHint(s) {
  const st = ratioState(s);
  const best = ratioSolutions().map(sol => ({ sol, hit: sol.filter((v, k) => st.slots[k] === v).length })).sort((x, y) => y.hit - x.hit)[0].sol;
  for (let k = 0; k < 4; k++) if (st.slots[k] !== best[k]) return { slot: k, n: best[k] };
  return null;
}
LOCKS.case4 = {
  clue: 'Twelve moons to the year. Two pairs of wheels, and no wheel used twice. —M.',
  page: 'journal4',
};
PAGES.journal4 = { title: 'Page four: the watch key', text: [
  'Every arm of the orrery points the same way at the great conjunction. Not up. Down, into the hill under the observatory.',
  'There are steps there, cut long before the observatory was built, and at the bottom a door with a winding square in it. My watch key fits it.',
  'I am going down. The key is in this case. If I have not come back, the old clock has kept me, and you will have to finish it from the outside.',
  '—M.' ] };

function tick(s, dt) {
  s.time += dt;
  if (orreryOpen(s)) {
    const o = s.orrery, a = o.arms;
    o.t += dt;
    for (let i = a.length - 1; i >= 0; i--) {
      if (a[i].amount <= 0) continue;
      const made = a[i].amount * armMult(s, i) * TUNE.orrerySpeed * dt;
      if (i === 0) o.years = Math.min(1e300, o.years + made); else a[i - 1].amount = Math.min(1e300, a[i - 1].amount + made);
    }
    const now = inLine(s);
    for (let i = 1; i < a.length; i++) if (o.logged[i] && !now.includes(i)) o.logged[i] = false;
  }
  if (cityOpen(s)) {
    const c = s.city, d = c.districts;
    if (d.some(x => x.amount > 0)) c.drift += (0.8 - c.drift) * Math.min(1, dt / TUNE.driftTime);
    for (let i = d.length - 1; i >= 0; i--) {
      if (d[i].amount <= 0) continue;
      const made = d[i].amount * cityMult(s, i) * TUNE.citySpeed * dt;
      if (i === 0) c.accord = Math.min(1e300, c.accord + made); else d[i - 1].amount = Math.min(1e300, d[i - 1].amount + made);
    }
  }
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
    if (s.governor && s.governorOn) runGovernor(s);
    if (s.ringer && s.ringerOn) runRinger(s);
    if (s.lamplighters && s.lamplightersOn) for (let i = 5; i >= 0; i--) buyDistrict(s, i, true);
    if (s.observer && s.observerOn) observe(s);
    if (s.relay && s.relayOn && s.city.drift > 0.05) s.city.drift = 0;
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
  canStrike, strike, chimeAt, CITY_NAMES, cityOpen, cityCost, cityVisible, cityMult, buyDistrict, sendSignal, buyRelay, relayCost, governorCost, buyGovernor, ORRERY_NAMES, ORBIT, orreryOpen, starMult, recordMult, armMult, armCost, armVisible, buyArm, armAngle, inLine, nextConjunction, newInLine, observe, lamplightersCost, buyLamplighters, observerCost, buyObserver, orreryDone, RATIO_TRAY, RATIO_TARGET, ratioState, ratioOf, ratioSet, ratioSolutions, ratioHint, PAGES, runGovernor, ringerCost, buyRinger, runRinger, cityDone, accordMult, countState, countRuns, countToggle, countHint, BELL_TRAIN, trainEval, trainSet, trainState, trainHint, lockState, lockTurn, lockHint, lockAvailable,
};
