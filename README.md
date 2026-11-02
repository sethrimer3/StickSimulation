# StickSimulation

A tiny autonomous wilderness inside a **freestanding, square, touchscreen picture frame**. A stick-figure inhabitant gathers resources, fishes, builds a settlement, survives threats, and gradually changes the world while you watch. Touch and tilt provide optional influence without turning it into a game that requires constant attention.

## Project principles

1. **Ambient first:** It must remain interesting as an unattended living diorama.
2. **Autonomy:** The inhabitant makes decisions and performs tasks without being commanded.
3. **Optional influence:** Touch encourages a task or inspects the world; tilting affects presentation or subtle world interactions.
4. **Persistence:** Progress survives restarts; elapsed real time can advance the simulation.
5. **Hardware independence:** Develop on desktop first, connect the physical frame later.
6. **Readable miniature:** Square pixel-art layout, large visual actions, minimal text, no intrusive UI.

## Target hardware (provisional)

- Freestanding 5–8 inch **square IPS touchscreen** in a custom frame.
- Raspberry Pi-class computer or other low-power computer capable of running a fullscreen browser.
- Small accelerometer/IMU module, connected through an adapter to the app.
- Quiet, always-on display; automatic dimming and sleep scheduling are future options.
- Power and cooling planned around a safe enclosed design.

No display model or sensor has been selected or purchased. Browser device-orientation events can serve as a prototype; a wired IMU will need its own bridge on the final device.

## Prototype stack

- TypeScript + Vite + Canvas 2D.
- Logical rendering resolution: **256 × 256** (1:1 aspect ratio), nearest-neighbor scaling.
- Fixed-step simulation loop, separated from drawing.
- Stick Ranger-style Verlet stickman (11 points, upright-gravity trick, knee-kick walking) at 50 Hz.
- Falling-sand world: every pixel except the stickman, creatures and sky is a material (sand, water, fire, wood, ...), Powder Toy style.
- Software pixel framebuffer with light from burning/glowing cells.
- Local storage saves, including bounded offline catch-up.
- Pointer/touch events and optional browser orientation input.

## Quick start

```bash
npm install
npm run dev
```

Open the development URL printed by Vite. For a production build:

```bash
npm run build
npm run preview
```

Node.js 20.19+ or 22.12+ is recommended for the chosen Vite major version. The desktop browser is the first test platform.

## Prototype controls

- **Drag the stickman:** Grab any joint and fling it; it gets back up on its own.
- **Element buttons (side panel):** Pick Sand, Water, Fire, Sawdust, Stone, Wood or Erase, then touch/drag on the world to pour it. *Suggest* returns to task suggestions.
- **Tap a tree:** Suggest gathering wood.
- **Tap the water:** Suggest fishing.
- **Tap near the settlement:** Suggest building (when enough resources exist).
- **Motion button:** Request browser orientation access (where supported) and apply subtle parallax. This is *not* yet Raspberry Pi IMU support.
- **Keyboard left/right:** Preview tilt on a desktop (parallax plus sideways sand and water).
- **Reset button:** Clear local progress after confirmation.

The prototype uses deliberately accelerated task durations to demonstrate the loop. These are not final idle-game progression rates.

## Documentation

- [Vision and decisions](docs/PROJECT_NOTES.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Milestones](docs/ROADMAP.md)

## Initial scope

The first vertical slice demonstrates one character, wood gathering, fishing, campfire/hut/fence construction, day-night lighting, occasional monster threats, input suggestions, and persistent progress. Everything beyond that, including generations, character memory, village population, advanced physics, and actual Raspberry Pi sensor wiring, is a proposed future feature rather than an implemented system.
