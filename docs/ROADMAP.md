# Development roadmap

## Phase 0: foundation

- [x] Record product vision, device assumptions and open decisions.
- [x] Establish TypeScript + Vite + Canvas 2D project structure.
- [x] Define a simulation/input/render/persistence split.
- [ ] Test the project locally with `npm install && npm run build`.
- [ ] Validate actual display and IMU candidates before purchasing.

## Phase 1: watchable vertical slice

- [x] One autonomous stickman with a work loop (first prototype).
- [x] Simple day/night cycle.
- [x] Save and capped offline catch-up.
- [x] Stick Ranger-style Verlet body, physical walking and joint dragging.
- [x] Pixel-art software renderer with per-pixel terrain and banded lighting.
- [x] Falling-sand elements: everything but the stickman, creatures and sky is a material (sand, water, fire, smoke, steam, ash, sawdust, wood, ...).
- [x] Fire spreads, buildings can burn down and be rebuilt, trees regrow, rain falls as water.
- [x] One big Terraria-style world with a following/panning camera.
- [x] Several named stickmen with roles: miners, builders, woodcutters, scholars, alchemists.
- [x] Pathfinding with ladders and one-way platforms; Stick Ranger climbing.
- [x] Hollow dollhouse buildings with back walls; Terraria-style room rules by furniture.
- [x] Mine (laddered shaft and tunnels, torches) and library with an alchemy lab, after Tower Defense.
- [x] Research tree of blueprints and improvements; settlers arrive when there are free beds.
- [ ] Bring back food (fishing, farming), monsters and the fence.
- [x] Scaffolding for builders; builders walk on roofs.
- [ ] Repairs after fire (including mid-construction), and firefighting.
- [x] Mine drifts, caves, hoist and bucket, spoil heap, night shift (after Tower Defense's Mine).
- [ ] Forge and smithy, supplies, shoring, ore sense, prospects (Tower Defense's Mine).
- [ ] Mine hazards: floods, cave-ins, lava.
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
- [ ] Social behavior and visitors.
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
