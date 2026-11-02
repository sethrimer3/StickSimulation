# Technical architecture

## Goal

A lightweight square pixel-art simulation that runs in a desktop browser today and can later use a kiosk browser on a Raspberry Pi-class computer.

## Overview

```text
Touch / mouse / keyboard      Browser orientation      Future physical IMU
          |                           |                        |
          +---------------------------+------------------------+
                                      |
                        Camera, pouring, role picks, research picks
                                      |
   fixed 50 Hz tick / catch-up -> Colony (settlers, jobs) <-> Terrain (cells, back walls)
                                      |                          ^
                                      |                          |
                                   Weather (clouds drop water) --+
                                      |
                      +---------------+----------------+
                      |                                |
                 Renderer (camera view)           Persistence
                      |                                |
                 Canvas 2D 256 × 256              localStorage
```

Everything under `Colony` and `Terrain` is DOM-free and steps at a fixed 50 Hz (Stick Ranger's rate), independent of the frame rate. `main.ts` owns the loop, the camera and the side panel.

## The world (`terrain.ts`, `materials.ts`)

One large Terraria-style side view, **1024 × 512 pixels**, of which the frame shows 256 × 256 through a camera.

- **Cells:** every pixel is a material (stone, dirt, grass, sand, water, steam, smoke, fire, ash, sawdust, wood, leaves, planks, thatch, glass, embers, bedrock, copper/silver/gold ore, brick, ladder, platform, door, bookshelf, desk, bed, cauldron, torch). Only the stickmen and the sky/backdrop (sky, sun, stars, clouds, distant hills) are not materials.
- **Back walls:** a second layer behind the cells: natural dirt and stone walls underground, and the plank or brick walls the builders put up. Stickmen never touch back walls.
- **Falling sand:** powders pile, liquids spread, gases rise, fire spreads by flammability and is doused by water. Only **16 × 16 chunks that are awake** are simulated (a change wakes its chunk and neighbours), so the big world stays cheap.
- **Slow processes** run on random cells: grass spreads, ash and sawdust rot, sunlit puddles evaporate, pools drain into soil. A spring keeps the lake at its level.
- **Generation:** smoothed hills (no column steps more than 2 px, so stickmen can walk them), a lake, forests either side of a flat colony site, dirt over stone, ore veins by depth (copper, then silver, then gold), winding caves, and bedrock.
- Tilt biases which way sand and water slide.

## Stickmen (`stickman.ts`, `nav.ts`)

- **Body:** Stick Ranger's: 11 Verlet points with distance constraints, kept upright by negative gravity on the head and hips while grounded, walking by kicking the rear knee every 15 ticks, ragdolling when airborne or asleep, and grabbable by pointer.
- **Climbing:** on a ladder the body is posed against the rungs, hands and feet alternating, moving up or down at a fixed speed. Collisions are skipped while climbing.
- **One-way platforms:** a joint that started the tick above a platform row lands on it; climbing passes through. Platforms form the floor holes where ladders go between storeys and bridge the mine shaft.
- **Pathfinding:** a breadth-first search over *stand* nodes (feet on solid ground or a platform with 16 px of headroom; roofs don't count) and *climb* nodes (beside a ladder). Moves: walk a pixel (stepping up or down up to 5 px), drop off a ledge, mount, climb, dismount. Paths compress into walk and climb waypoints the body follows.
- **Recovery:** no progress toward a waypoint for 4 s means a replan. After 3 failed replans the settler gives up that job, the job is skipped by everyone for a minute, and the settler climbs out to the nearest place connected to the colony. Buried bodies are pushed up.

## Buildings (`blueprints.ts`, `rooms.ts`)

Blueprints are generated from a few parameters (width, storeys, furniture, brick or wood). Each is **hollow**: 2 px side walls, 2 px floors, a gable roof, a built back wall behind every interior cell, doors in the ground floor, glass windows upstairs, and a ladder through a platform hole between storeys. There is **no front wall**, so every building is seen as a dollhouse cutaway.

**Room rules (Terraria style):** a storey counts as a room when a flood fill from inside it stays enclosed by walls/floor/roof (solid materials, doors, glass, platforms), every interior cell has a built back wall, it has a door or platform on its edge, and it is big enough. Its kind comes from its furniture:

| Kind | Furniture | Used for |
| --- | --- | --- |
| Home | Bed | Sleeping; free beds let new settlers arrive |
| Library | Bookshelf | Scholars read books here for Knowledge |
| Alchemy lab | Cauldron | Alchemists research new blueprints and improvements |

A room that stops counting (burnt wall, missing back wall) stops working until it is repaired.

| Blueprint | Storeys | Notes |
| --- | --- | --- |
| Cabin | 1 | Two beds. Known from the start |
| Library | 2 | Alchemy lab below, three bookshelves and a desk above. Known from the start |
| Bunkhouse | 2 | Four beds (researched) |
| Stone cottage | 1 | Brick and fireproof, three beds (researched) |
| Grand library | 3 | Twin cauldrons, two floors of stacks (researched) |

## The colony (`colony.ts`, `research.ts`, `trees.ts`)

Each settler has a name for life and a role the player can change in the panel.

- **Miners** follow a mine plan modelled on Tower Defense's Mine: a 9 px laddered shaft sunk from a platform-covered mouth, a tunnel 20 px tall out either side at each level (28 px apart), platforms across the shaft at each level and as bridges over caves, torches once researched. They dig what they can reach, a few cells a strike, and carry stone and ore up to the yard. Levels: 3, then more with Deeper shaft I–III.
- **Builders** pick the next building (homes when beds run short, the library early on), find level-ish ground near the campfire, clear trees, fill a foundation, then place the blueprint bottom-up a few cells a strike, paying for each cell. When short of wood they chop it themselves.
- **Woodcutters** fell the nearest grown tree (10 strikes, sawdust flying) and carry the logs to the woodpile. Felled trees regrow from the roots up.
- **Scholars** (modelled on the Library's professors) take a book from a shelf, read it at the desk and put it back. Each book read earns Knowledge, more with more shelves.
- **Alchemists** (the lab's researchers) start the next project (the player's pick, or the cheapest affordable), paying its Knowledge and metal up front, then stir the cauldron and write up notes until its work time is done.
- Everyone sleeps at night: in their own bed if a home has one free, otherwise by the fire as a ragdoll.
- A new settler arrives every 90 s while there are more beds than settlers (minimum four). Roles follow a fixed mix.

## Camera and input (`main.ts`)

- The camera follows one stickman (a small gold marker over their head). Tap a stickman or pick a name in the panel to follow them; in `?frame` mode a tap on empty ground switches to the next one.
- Dragging pans freely. After 90 s untouched it goes back to following.
- Grabbing a stickman's joint flings them (Stick Ranger style).
- The Touch section's element buttons pour sand, water, fire, sawdust, stone or wood, or erase. *Look* returns to camera mode.
- Keys: `[` `]` switch stickman, `WASD` pan, `←` `→` tilt.

## Render layer (`render.ts`, `pixels.ts`)

- A 256 × 256 software framebuffer: 1 px Bresenham lines, midpoint circles, a dithered sky tied to altitude, parallax hills, one `putImageData` per frame.
- Materials have patterned looks: bookshelves with book spines, beds with pillows and blankets, desks, a bubbling cauldron, three-pixel ladders, doors with knobs, ore flecks.
- **Light** is computed on 4 px blocks around the view: sky light enters where there is no back wall (half through built walls), glowing cells (fire, embers, torches, cauldrons, burning wood) and each stickman's lantern emit light, and both spread with loss (more through rock), then are blurred and applied per pixel in Bayer-dithered bands. Firelight never lights the sky backdrop.

## Persistence (`persistence.ts`)

- `stick-simulation-colony-v2`: the colony as JSON (settlers, roles, sites, trees, resources, Knowledge, research, time).
- `stick-simulation-world-v2`: the cell and back-wall layers, run-length encoded (about 70 KB).
- Saved every 15 s and when the page hides. On load, up to an hour away is caught up on by running extra ticks within an 8 ms frame budget.
- Old saves from the single-stickman prototype are ignored and a new world starts.

## Hardware integration checkpoints

1. Confirm exact square touchscreen model and HDMI/DSI/USB touch interfaces.
2. Verify multi-hour fullscreen runtime without display artifacts or overheating.
3. Validate sensor bridge and axis calibration on the actual mounted orientation.
4. Test power loss, boot-to-game, auto-restart, and long-duration save integrity.
5. Design and physically test a freestanding enclosure with protected wiring and ventilation.
