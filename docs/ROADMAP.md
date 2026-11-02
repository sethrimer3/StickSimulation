# Development roadmap

## Phase 0: foundation

- [x] Record product vision, device assumptions and open decisions.
- [x] Establish TypeScript + Vite + Canvas 2D project structure.
- [x] Define a simulation/input/render/persistence split.
- [ ] Test the project locally with `npm install && npm run build`.
- [ ] Validate actual display and IMU candidates before purchasing.

## Phase 1: watchable vertical slice

- [x] One autonomous stickman with a work loop.
- [x] Gather wood, fish, eat and rest.
- [x] Build campfire, hut and fence.
- [x] Simple day/night cycle and occasional monster threat.
- [x] Tap-to-suggest task.
- [x] Save and capped offline catch-up.
- [x] Stick Ranger-style Verlet body, physical walking and joint dragging.
- [x] Pixel-art software renderer with per-pixel terrain and banded lighting.
- [x] Falling-sand elements: everything but the stickman, creatures and sky is a material (sand, water, fire, smoke, steam, ash, sawdust, wood, ...).
- [x] Fire spreads, buildings can burn down and be rebuilt, trees regrow, rain falls as water.
- [ ] More elements (lava, snow/ice, oil, plants, seeds) and seasons.
- [ ] Improve construction stages.
- [ ] Add a simple event log that persists.
- [ ] Tune the simulation so it remains engaging when unattended.

## Phase 2: interacting with the frame

- [ ] Desktop sensor emulation and sensitivity settings.
- [ ] Touch inspection UI and clear interaction feedback.
- [ ] Real IMU hardware bridge, calibration and disconnect recovery.
- [ ] Optional tap/knock and shake gestures.
- [ ] Boot directly into kiosk display; dim/sleep controls.

## Phase 3: deeper living world

- [ ] Weather and seasons.
- [ ] Crafting and equipment.
- [ ] Exploration and discoveries.
- [ ] Multiple autonomous agents, social behavior and visitors.
- [ ] Persistent world events, structures with histories.
- [ ] Castle/settlement progression.

## Phase 4: physical enclosure

- [ ] Choose square display and touchscreen controller.
- [ ] Choose low-power computer and sensor.
- [ ] Design freestanding housing and concealed cable routing.
- [ ] Check thermals, screen burn-in risk and safe power.
- [ ] 72-hour unattended stability run.

## Explicit non-goals for first prototype

No account system, multiplayer, cloud backend, live service, monetization, high-detail sprites, full crafting trees, or direct character control.
