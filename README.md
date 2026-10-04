# The Great Clock

A browser incremental game. You're an apprentice clockmaker finishing your vanished master's clock, which is meant to be "large enough to keep time for the universe." You start with a pocket watch.

Open `index.html` in a browser to play. There's no build step.

## Layers in this prototype

1. **Gears.** Eight meshed gears. Gear 1 makes ticks, and every other gear turns the one before it. Every 10 of a gear sets a jewel bearing, which doubles its speed.
2. **Mainspring (Wind).** Reset your gears for tension. Spend tension on a tighter spring (up to level 12), oiled pivots, and automatons (Pip, Cog, Bolt and Tock) that buy gears for you.
3. **Finish the clock (Chime).** The finished clock moves to the workbench and keeps running, and each new clock is larger than the last. Chimes buy Tempo and a self-winding spring.
4. **The master's case.** With five clocks on the bench, a three-dial gear lock opens. It holds journal page one and Drawing No. 2.
5. **The Clocktower.** Four turret wheels, bought with chimes, make hours. Hours speed up every clock, and finished clocks speed up the tower. Striking the hour at 1e9 hours reveals the second case, which holds journal page two and Drawing No. 3.
6. **The City.** Wire six districts (Market to Observatory) whose dials make accord. Wired dials drift out of step, so you send the time signal, until a Synchronome relay does it for you. Accord speeds up the tower. Two helpers take over old chores: the spring governor (25 chimes) spends tension on the spring and oil, and the bell-ringer (1e8 accord) spends chimes on bells, tempo and turret wheels. At 1e30 accord the city is in step and the third case, a count wheel, opens with journal page three. 
7. **The Orrery.** Six planet arms orbit a brass sun at true ratios; Earth's arm makes years. When a planet crosses Earth's line you observe the conjunction, and each recorded conjunction speeds Earth's arm (an observatory camera takes this over later). Years speed the city; the lamplighters' guild wires the city for you. At 1e40 years the fourth case opens: two pairs of wheels must turn the Moon twelve times a year. 
8. **The Great Clock.** Under the hill is the old clock. Its four wheels make seconds, and you mesh your four machines (clocks, tower, city, orrery) with its great wheel one at a time; each multiplies the seconds by how far that machine has come. The astronomer sets the orrery for you. At 1e22 seconds the last case opens: set three hands from clues in the journal, and the story ends.

There are two drawing styles: Linen (sepia on paper) and Lamplight (dark). By default it follows the device setting.

## Pacing target

The whole game (five drawings: clock, tower, city, orrery, Great Clock) should take 30 to 40 hours. The targets for active play so far are:

| Milestone | Bot (sim) | Expected player |
|---|---|---|
| First wind | 7 min | 5 to 10 min |
| First clock | 45 min | about 1 h |
| Clocktower opens | 53 min | about 1.25 h |
| Tower strikes | 4 h | about 5 h |
| City in step | 10 h | about 13 h |
| Orrery complete | 17 h | about 22 h |
| The Great Clock runs | 27 h | about 34 h |

Offline progress catches up to 12 hours.

## Design rules

- Each prestige layer adds one new verb.
- Automation retires old verbs at about the same pace.
- The theme explains the math, so you can see why it works.
- Only one layer is on screen at a time, and panels appear only when you reach them.

## Files

- `engine.js`: game rules, with no DOM. Used by both the page and the simulator.
- `index.html`: page, styles and rendering.
- `tools/sim.js`: a greedy bot that checks pacing (`node tools/sim.js`, with `TUNE='{...}'` to try knob values). Pacing knobs are in `TUNE` in `engine.js`.
- `tools/build-single.js`: inlines the engine into one file for publishing as a claude.ai artifact.
