// ---- The Great Clock: core rules (no DOM) ----
const GEAR_NAMES = ['Pinion', 'Crown Wheel', 'Escape Wheel', 'Third Wheel', 'Centre Wheel', 'Great Wheel', 'Barrel', 'Fusee'];
const GEAR_BASE = [10, 100, 1e4, 1e6, 1e9, 1e13, 1e18, 1e24];
const GEAR_STEP = [1e3, 1e4, 1e5, 1e6, 1e8, 1e10, 1e12, 1e15];
const WIND_AT = 1e10;    // ticks in a run before the spring can be wound
const CHIME_AT = 1e45;   // ticks needed to finish a clock

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
    winds: 0, clocks: [], chimes: 0, tempo: 0, autoWind: false,
    seen: {}, time: 0,
  });
}

const springMult = s => Math.pow(3, s.spring);
const springCost = s => Math.ceil(Math.pow(3, s.spring));
const oilCost = s => [5, 25, 125][s.oil] ?? Infinity;
const toothMult = s => 2 + 0.5 * s.oil;
const tempoMult = s => Math.pow(2, s.tempo);
const tempoCost = s => Math.pow(2, s.tempo);
// Each finished clock on the workbench keeps ticking and lends a little speed.
const benchMult = s => 1 + s.clocks.length;

function gearMult(s, i) {
  return Math.pow(toothMult(s), Math.floor(s.gears[i].bought / 10)) * springMult(s) * tempoMult(s) * benchMult(s);
}
function gearCost(s, i) {
  return GEAR_BASE[i] * Math.pow(GEAR_STEP[i], Math.floor(s.gears[i].bought / 10));
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
    if (!max) break;
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
  if (s.runTicks < WIND_AT) return 0;
  return Math.floor(Math.pow(10, (Math.log10(s.runTicks) - 10) / 6));
}
function wind(s) {
  const g = windGain(s);
  if (g <= 0) return false;
  s.tension += g; s.winds++;
  Object.assign(s, newRun());
  return true;
}

function canChime(s) { return s.ticks >= CHIME_AT; }
function chime(s) {
  if (!canChime(s)) return false;
  s.clocks.push({ n: s.clocks.length + 1, winds: s.winds, time: s.time });
  s.chimes += 1;
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

function tick(s, dt) {
  s.time += dt;
  for (let i = GEAR_NAMES.length - 1; i >= 0; i--) {
    const g = s.gears[i];
    if (g.amount <= 0) continue;
    const made = g.amount * gearMult(s, i) * dt;
    if (i === 0) { s.ticks += made; s.runTicks += made; }
    else s.gears[i - 1].amount += made;
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
  }
}
function spentTension(s) {
  let t = 0; for (let k = 0; k < s.spring; k++) t += Math.ceil(Math.pow(3, k)); t += [0, 5, 30, 155][s.oil];
  for (const a of AUTOMATONS) if (s.autos[a.id]) t += a.cost;
  return t;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
  GEAR_NAMES, AUTOMATONS, WIND_AT, CHIME_AT, newGame, tick, buyGear, buySet, gearCost, gearMult, gearVisible,
  windGain, wind, canChime, chime, buySpring, buyOil, buyAuto, buyTempo, buyAutoWind,
  springCost, oilCost, tempoCost, spentTension,
};
