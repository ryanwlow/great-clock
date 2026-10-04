// Pacing check: a greedy bot plays the game and logs when it winds and finishes clocks.
// Run with: node tools/sim.js
const E = require('../engine.js');
const s = E.newGame();
const dt = 0.1; let t = 0, lastLog = 0; const marks = [];
function spend() {
  // greedy: automatons first, then spring/oil cheapest
  let did = true;
  while (did) {
    did = false;
    for (const a of E.AUTOMATONS) if (!s.autos[a.id] && E.buyAuto(s, a)) did = true;
    if (E.springCost(s) <= E.oilCost(s) ? E.buySpring(s) : E.buyOil(s)) did = true;
  }
  while (E.buyTempo(s)) {}
  if (!s.autoWind) E.buyAutoWind(s);
}
while (t < 3 * 3600 && s.clocks.length < 3) {
  // player: buy highest gears first, sets of ten
  if (Math.round(t * 10) % 5 === 0) for (let i = 7; i >= 0; i--) while (E.buySet(s, i) > 0) {}
  E.tick(s, dt); t += dt;
  const g = E.windGain(s);
  const owned = s.tension + E.spentTension(s); spend();
  if (!s.autoWind && g >= Math.max(1, owned)) { E.wind(s); marks.push(`${(t/60).toFixed(1)}m wind#${s.winds} tension ${s.tension}`); spend(); }
  if (E.canChime(s)) { E.chime(s); marks.push(`${(t/60).toFixed(1)}m CHIME clock ${s.clocks.length}`); spend(); }
  if (t - lastLog > 300) { lastLog = t; marks.push(`${(t/60).toFixed(1)}m ticks=${s.ticks.toExponential(2)} gears=${s.gears.map(g=>g.bought).join(',')} spring${s.spring} oil${s.oil}`); }
}
console.log(marks.join('\n'));
