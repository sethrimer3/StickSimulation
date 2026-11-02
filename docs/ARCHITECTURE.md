# Technical architecture

## Goal

A lightweight square pixel-art simulation that runs in a desktop browser today and can later use a kiosk browser on a Raspberry Pi-class computer.

## Boundaries

```text
Touch / mouse / keyboard       Browser device orientation       Future physical IMU
           |                               |                            |
           +-------------------------------+----------------------------+
                                           |
                                     Input adapters
                                           |
                                    Player suggestions
                                           |
             clock / offline catch-up -> Simulation <-> World state
                                           |
                         +-----------------+-------------------+
                         |                                     |
                    Renderer                              Persistence
                         |                                     |
                   Canvas 2D                             localStorage
                         |                           (future: indexedDB/file)
                    Square display
```

The simulation must **not** import DOM APIs or depend on the renderer. Input events should request or suggest actions; they should not directly manipulate construction or economy state.

## Simulation

- Fixed world-time semantics, independent from refresh rate.
- Autonomous task selection based on survival needs and construction milestones.
- Task duration and resource costs are data and can later be balance-tuned.
- Offline catch-up executes bounded world simulation after restart (initial cap: 12 hours).
- A version number is stored with saves, allowing schema migrations.
- Random encounters currently use a stored pseudo-random seed for repeatable future behavior given identical inputs.

The initial prototype uses short task durations to make its behavior observable in minutes. Final ambient pacing is undecided.

## Input layer

- Pointer events work for both mouse and touchscreen.
- Browser `deviceorientation` is a **development stand-in** for actual motion.
- A physical Raspberry Pi IMU may require a small Python/Node companion service that sends readings to the browser over a local transport such as WebSocket. This bridge is **not yet implemented**.
- Ask permission where browser platforms require it. The simulation must work if permission is denied or sensors are absent.
- Motion should be low-pass-filtered and dead-zoned before affecting the game. Do not assume tilt means the same thing in portrait and landscape.

## Stickman body physics (`src/stickman.ts`, `src/actor.ts`)

The inhabitant's body uses the same scheme as Stick Ranger's player characters:

- 11 Verlet points (head, neck, waist, elbows, hands, knees, feet) joined by distance constraints (3.6 px spine segments, 4.8 px limbs, a soft 6 px knee spacer), damping 0.99, stepped at a fixed 50 Hz.
- **Upright trick:** for 10 ticks after any point touches the ground, the head gets −0.2 gravity, the waist −0.1, the feet +0.3 and everything else 0. Airborne longer than that (or resting), every point gets 0.05 and the body becomes a limp ragdoll.
- **Walking:** every 15 ticks, while touching the ground, the rear knee is kicked 4 px forward and lifted (higher when a ledge is ahead, so the figure climbs). Gravity and constraints turn that into the bobbing gait.
- **Collision:** each point's motion is replayed in ≤4 px sub-steps against the per-pixel terrain; on contact the normal component reflects and the tangential component is halved. Water applies 0.95 drag.
- **Actions:** chopping, hammering and fighting are short arm thrusts applied to the joints, not keyframes.
- Joints can be grabbed and flung with the pointer, like Stick Ranger.

The simulation (`World.characterX`, task) stays the persistent source of truth. `Actor` is presentation-level physics that walks the body toward the simulated position and teleports it after large offline jumps. Body state is not saved.

## Terrain (`src/terrain.ts`)

A 256 × 256 per-pixel material grid (empty, dirt, grass, stone, sand, water). It is static for now and is the base for upcoming falling-sand elements.

## Render layer

- All drawing goes into a software framebuffer (`src/pixels.ts`): 1 px Bresenham lines, midpoint circles, dithered gradients. One `putImageData` per frame, so nothing is anti-aliased.
- Night and campfire light are applied per pixel in quantized, Bayer-dithered bands.
- Canvas logical size: 256 × 256.
- CSS scales the canvas while preserving a square aspect ratio.
- Nearest-neighbor sampling for crisp pixel art.
- Light and weather derived from world state, with display effects separated from gameplay.
- Ambient mode should minimize overlays.

## Hardware integration checkpoints

1. Confirm exact square touchscreen model and HDMI/DSI/USB touch interfaces.
2. Verify multi-hour fullscreen runtime without display artifacts or overheating.
3. Validate sensor bridge and axis calibration on the actual mounted orientation.
4. Test power loss, boot-to-game, auto-restart, and long-duration save integrity.
5. Design and physically test a freestanding enclosure with protected wiring and ventilation.

## Quality gates

- Simulate 12 hours of world time with no crashes or non-finite state.
- Save, close, reopen, and correctly recover bounded elapsed-time progress.
- Touch targets remain usable at the intended physical display size.
- Simulation remains functional without internet or motion permissions.
- Fullscreen rendering maintains 1:1 aspect ratio on non-square test monitors.
