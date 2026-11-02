# StickSimulation

A tiny autonomous colony inside a **freestanding, square, touchscreen picture frame**. Stickmen with Stick Ranger bodies mine a big Terraria-style falling-sand world, fell trees, put up hollow dollhouse buildings, study in a library and research new blueprints in its alchemy lab, while you watch. The camera follows one stickman at a time; touch and tilt give optional influence without turning it into a game that needs constant attention.

## Project principles

1. **Ambient first:** It must remain interesting as an unattended living diorama.
2. **Autonomy:** The settlers decide what to do and do it without being commanded.
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
- Stick Ranger-style Verlet stickmen (11 points, upright-gravity trick, knee-kick walking, ladder climbing) at 50 Hz.
- One 2048 × 512 falling-sand world (Powder Toy style): every pixel except the stickmen and the sky is a material; a back-wall layer sits behind it. Only awake 16 × 16 chunks are simulated.
- Terraria-style rooms: hollow buildings with back walls, doors and platform floors; rooms count by their furniture (beds, bookshelves, cauldrons).
- A colony of named settlers with roles (miner, builder, woodcutter, scholar, alchemist), pathfinding across the world and up ladders, adapted from the Tower Defense Mine and Library.
- Software pixel framebuffer with a camera and light spreading from the sky, torches and fire.
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

- **Watch:** The camera follows one stickman (gold marker over their head).
- **Follow someone else:** Tap a stickman, or pick a name in the side panel's Stickmen list. In `?frame` mode a tap on empty ground switches to the next stickman.
- **Look around:** Drag the world to pan; after 90 s untouched the camera goes back to following. *Free camera* toggles it.
- **Jobs:** Each stickman's job can be changed from the list (builder, miner, woodcutter, scholar, alchemist).
- **Research:** The Alchemy lab section lists what can be researched next; pick one or let the alchemists choose.
- **Buildings:** The list shows each room, whether it counts (✓) or why not (✗), the building under construction and how far the mine is dug.
- **Fling:** Grab a stickman's joint and throw them; they get back up on their own.
- **Pour:** In the Touch section pick Sand, Water, Fire, Sawdust, Stone, Wood or Erase, then drag on the world. *Look* returns to camera mode.
- **Keys:** `[` `]` switch stickman, `WASD` pan, `←` `→` tilt (sand and water slide sideways).
- **Motion button:** Request browser orientation access (where supported) for tilt. This is *not* yet Raspberry Pi IMU support.
- **New world:** Start over after confirmation.

## Documentation

- [Vision and decisions](docs/PROJECT_NOTES.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Milestones](docs/ROADMAP.md)

## Current scope

A colony in one large world: settlers mine, chop, build cabins and a library, study, research blueprints and improvements, sleep at night, and new settlers arrive when there are beds. The first prototype's fishing, food and monsters are not in this version yet (see the roadmap). Generations, character memory and actual Raspberry Pi sensor wiring are future ideas rather than implemented systems.
