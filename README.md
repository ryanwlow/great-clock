# The Great Clock

A browser incremental game. You're an apprentice clockmaker finishing your vanished master's clock, which is meant to be "large enough to keep time for the universe." You start with a pocket watch.

Open `index.html` in a browser to play. There's no build step.

## Layers in this prototype

1. **Gears.** Eight meshed gears. Gear 1 makes ticks, and every other gear turns the one before it. Every 10 of a gear sets a jewel bearing, which doubles its speed.
2. **Mainspring (Wind).** Reset your gears for tension. Spend tension on a tighter spring (up to level 12), oiled pivots, and automatons (Pip, Cog, Bolt and Tock) that buy gears for you.
3. **Finish the clock (Chime).** The finished clock moves to the workbench and keeps running, and each new clock is larger than the last. Chimes buy Tempo and a self-winding spring.
4. **The master's case.** With five clocks on the bench, a three-dial gear lock opens. It holds journal page one and Drawing No. 2.
5. **The Clocktower.** Four turret wheels, bought with chimes, make hours. Hours speed up every clock, and finished clocks speed up the tower. Striking the hour at 1e9 hours reveals the second case, which holds journal page two. The city is next.

There are two drawing styles: Linen (sepia on paper) and Lamplight (dark). By default it follows the device setting.

## Design rules

- Each prestige layer adds one new verb.
- Automation retires old verbs at about the same pace.
- The theme explains the math, so you can see why it works.
- Only one layer is on screen at a time, and panels appear only when you reach them.

## Files

- `engine.js`: game rules, with no DOM. Used by both the page and the simulator.
- `index.html`: page, styles and rendering.
- `tools/sim.js`: a greedy bot that checks pacing (`node tools/sim.js`). The bot finishes the first clock at about 19 minutes, opens the tower at about 23, and strikes at about 43.
- `tools/build-single.js`: inlines the engine into one file for publishing as a claude.ai artifact.
