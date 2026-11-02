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

## Render layer

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
