# The Great Clock

A browser incremental game. You're an apprentice clockmaker finishing your vanished master's clock, which is meant to be "large enough to keep time for the universe." You start with a pocket watch.

Open `index.html` in a browser to play. There's no build step.

## Layers in this prototype

1. **Gears.** Eight gears in a chain. Gear 1 makes ticks, and every other gear turns the one before it. Every 10 of a gear adds a tooth and doubles its speed.
2. **Mainspring (Wind).** Reset your gears for tension. Spend tension on a tighter spring, oiled teeth, and automatons (Pip, Cog, Bolt and Tock) that buy gears for you.
3. **Finish the clock (Chime).** At 1e45 ticks the clock is finished. It moves to the workbench and keeps running, your automatons stay with you, and you start the next clock. Chimes buy Tempo and a self-winding spring.

Next up: the Clocktower, where finished clocks become the parts you build with.

## Design rules

- Each prestige layer adds one new verb.
- Automation retires old verbs at about the same pace.
- The theme explains the math, so you can see why it works.
- Only one layer is on screen at a time, and panels appear only when you reach them.

## Files

- `engine.js`: game rules, with no DOM. Used by both the page and the simulator.
- `index.html`: page, styles and rendering.
- `tools/sim.js`: a greedy bot that checks pacing (`node tools/sim.js`). Right now it finishes the first clock in about 19 minutes.
