// Pacing check: a greedy bot plays the game and logs its milestones.
// Run with: node tools/sim.js
const E = require('../engine.js');
if (process.env.TUNE) Object.assign(E.TUNE, JSON.parse(process.env.TUNE));
const s = E.newGame();
const dt = +(process.env.SIM_DT || 0.1); let t = 0;
const log = m => console.log(`${(t / 60).toFixed(1).padStart(6)}m  ${m}`);
const seen = new Set(); const once = (k, m) => { if (!seen.has(k)) { seen.add(k); log(m); } };
function spend() {
  let did = true;
  while (did) {
    did = false;
    for (const a of E.AUTOMATONS) if (!s.autos[a.id] && E.buyAuto(s, a)) did = true;
    if (E.springCost(s) <= E.oilCost(s) ? E.buySpring(s) : E.buyOil(s)) did = true;
  }
}
function spendChimes() {
  if (!s.autoWind) E.buyAutoWind(s);
  if (E.towerOpen(s)) {
    if (!s.autoChime) { E.buyAutoChime(s); return; }
    if (E.bellCost(s) <= s.chimes * 0.5) E.buyBell(s);
    for (let i = 3; i >= 0; i--) E.buyTower(s, i, true);
  } else {
    while (s.tempo < 3 && E.buyTempo(s)) {}
  }
}
let lastLog = 0;
while (t < (+process.env.SIM_HOURS || 2) * 3600 && !E.greatDone(s)) {
  if (process.env.SIM_TRACE && t - lastLog > 60) { lastLog = t; log(`  accord=${s.city.accord.toExponential(1)} clocks=${s.clocks} hours=${s.tower.hours.toExponential(1)} chimes=${Math.floor(s.chimes)} ticks=${s.ticks.toExponential(1)} spring=${s.spring} tempo=${s.tempo} m1=${E.gearMult(s, 0).toExponential(1)}`); }
  if (Math.round(t * 10) % 5 === 0) { for (let i = 7; i >= 0; i--) while (E.buySet(s, i) > 0) {} spendChimes(); }
  E.tick(s, dt); t += dt;
  spend();
  if (!s.autoWind && E.windGain(s) >= Math.max(1, s.tension + E.spentTension(s))) { E.wind(s); once('wind', 'first wind'); }
  if (E.canChime(s) && !s.autoChime) { E.chime(s); }
  if (s.clocks >= 1) once('c1', 'first clock');
  if (s.clocks >= E.TOWER_AT && !E.towerOpen(s)) {
    once('c5', `${E.TOWER_AT} clocks: case 1 opens`);
    // the bot solves the lock by following hints
    let h; while ((h = E.lockHint(E.lockState(s, 'case1').pos, 'case1'))) E.lockTurn(s, 'case1', h.i, h.dir);
  }
  if (E.towerOpen(s)) once('tower', 'clocktower open');
  if (s.tower.hours >= 1) once('h1', 'first hour');
  for (const e of [3, 6]) if (s.tower.hours >= 10 ** e) once('h' + e, `1e${e} hours, clocks=${s.clocks}, chimes=${Math.floor(s.chimes)}, bells=${s.bells}`);
  if (E.canStrike(s)) { E.strike(s); log(`strike! clocks=${s.clocks}`); }
  if (s.struck && !E.cityOpen(s)) { [null, 20, 16].forEach((n, i) => E.trainSet(s, i, n)); log('case 2 solved: city open'); }
  if (E.cityOpen(s)) {
    if (Math.round(t * 10) % 5 === 0) { if (!s.relay) E.buyRelay(s); for (let i = 5; i >= 0; i--) E.buyDistrict(s, i, true); }
    if (!s.relay && s.city.drift > 0.3) E.sendSignal(s);   // a player glancing in now and then
    if (s.relay) once('relay', 'relay bought');
    for (const e of [10, 20]) if (s.city.accord >= 10 ** e) once('a' + e, `1e${e} accord, districts=${s.city.districts.map(d => d.bought).join(',')}`);
  }
  if (E.greatOpen(s)) {
    if (Math.round(t * 10) % 5 === 0) { E.buyAstronomer(s); for (let k = 0; k < 4; k++) if (E.mesh(s, k)) log(`meshed ${E.MESH_NAMES[k].toLowerCase()} (x${E.meshValue(s, k).toFixed(0)})`); for (let i = 3; i >= 0; i--) E.buyGreat(s, i, true); }
    for (const e of [5, 10, 15, 20, 25, 30]) if (s.great.seconds >= 10 ** e) once('s' + e, `1e${e} seconds, wheels=${s.great.wheels.map(d => d.bought).join(',')}`);
  }
  if (E.cityDone(s) && !E.orreryOpen(s)) { log('city synchronised: case 3 opens'); [3, 4, 8].forEach(i => E.countToggle(s, i)); log('case 3 solved: orrery open'); }
  if (E.orreryOpen(s)) {
    if (Math.round(t * 10) % 5 === 0) { E.buyLamplighters(s); E.buyObserver(s); for (let i = 5; i >= 0; i--) E.buyArm(s, i, true); }
    // a player glances at the orrery every half minute or so
    if (!s.observer && Math.round(t * 10) % 300 === 0) E.observe(s);
    if (s.lamplighters) once('lamp', 'lamplighters bought');
    if (s.observer) once('obs', `observer bought, records=${s.orrery.records}`);
    if (E.orreryDone(s) && !E.greatOpen(s)) { log(`orrery complete: case 4 opens, records=${s.orrery.records}`); [60, 10, 40, 20].forEach((n, i) => E.ratioSet(s, i, n)); }
    for (const e of [10, 20, 30]) if (s.orrery.years >= 10 ** e) once('y' + e, `1e${e} years, arms=${s.orrery.arms.map(d => d.bought).join(',')}, records=${s.orrery.records}`);
  }
}
if (E.greatDone(s)) log(`the Great Clock runs: last case opens. meshMult=${E.meshMult(s).toExponential(1)}`);
