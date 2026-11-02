# StickSimulation: concept and design notes

## Confirmed direction (November 2026)

A freestanding, square, **touchscreen** picture frame with an **accelerometer** contains an autonomous, persistent stick-figure wilderness simulation. The experience is primarily to **watch a small world evolve**, with optional interaction. Its intended role is ambient, amusing, and visually interesting in an office.

A single inhabitant begins with a primitive camp. Over time they fish, gather resources, construct a hut, fight monsters, improve tools and defenses, and eventually build more elaborate settlements such as a castle.

## Core fantasy

Look away for several hours, then look back to see that something has changed. The player influences, rather than micromanages, the little civilization.

### Three experience modes

1. **Passive:** A self-directed world with day/night, work, surprises, and long-term progression.
2. **Touch:** Tap a world object to inspect it or gently prioritize the related task. No constant tapping is required.
3. **Physical:** Tilt, knock, or rotate the frame to produce legible, playful world interactions. Effects must not unintentionally destroy hours of progress.

### Potential simulation systems

- Survival: hunger, rest, injury, weather, shelter.
- Work: woodcutting, fishing, farming, crafting, mining.
- Construction: campfire → hut → fence → workshops → walls → castle.
- Threats: wildlife, wandering monsters, raids.
- People: visitors, neighbors, eventually multiple autonomous inhabitants.
- World history: memorable events, character habits, ruins and rebuilt structures.
- Presentation: ambient animation, weather, stars, sunrise/sunset, seasons, visible construction phases.

These are **ideas**, not implementation promises.

## Proposed interaction vocabulary

| Input | Early prototype | Future possibilities |
| --- | --- | --- |
| Tap tree | Suggest gathering wood | Inspect tree, mark logging zone |
| Tap water | Suggest fishing | Inspect fish, place fishing spot |
| Tap settlement | Suggest construction | Select next building project |
| Tilt frame | Subtle parallax | Pan view or shift loose objects |
| Knock/shake | Not implemented | Alert inhabitant or scare wildlife |
| Leave it alone | Autonomous tasks | Events and meaningful long-term progression |

## Visual and product constraints

- 1:1 square screen and square game world. Logical 256 × 256 is a starting point, not the final hardware resolution.
- Pixel art readable from across an office. Prefer clear silhouettes and large-scale motion.
- Quiet by default; optional sound later.
- Avoid persistent menus, bright flashes, or frequent required interaction.
- Frame should be stable and freestanding, with enclosed electronics and safe power routing.
- IPS LCD is preferred initially for an always-on image with static elements; OLED remains optional with burn-in precautions.
- Design for occasional shutdowns, application restarts, and storage failure.

## Unresolved design decisions

1. One persistent, potentially immortal protagonist vs. a multigenerational population.
2. Fixed single screen vs. larger world revealed through camera panning.
3. How much agency touch should have: suggestion, direct command, or mixed mode.
4. How quickly a hut, village and castle should appear in real-world time.
5. Whether failure destroys structures permanently or triggers recovery arcs.
6. Whether physical motion is mostly decorative or substantially changes mechanics.
7. Actual screen dimensions, board, IMU model, power supply, mounting, and cooling.
8. Whether future displays need multiple settlements/world slots.

## Design guardrails

- No progress-blocking mandatory input.
- No save corruption from shutdown or time changes.
- No world progression tied directly to frame rate.
- No assumption that browser orientation events represent the final Raspberry Pi hardware.
- No purchase decisions until a display/sensor hardware spike validates compatibility.
