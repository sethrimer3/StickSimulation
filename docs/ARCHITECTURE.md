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

One large Terraria-style side view, **2048 × 1536 pixels**, of which the frame shows 256 × 256 through a camera.

- **Cells:** every pixel is a material (stone, dirt, grass, sand, water, steam, smoke, fire, ash, sawdust, wood, leaves, planks, thatch, glass, embers, bedrock, copper/silver/gold ore, brick, ladder, platform, door, bookshelf, desk, bed, cauldron, torch, scaffold deck and pole, headframe beam, spoil). Only the stickmen and the sky/backdrop (sky, sun, stars, clouds, distant hills) are not materials.
- **Back walls:** a second layer behind the cells: natural dirt and stone walls underground, and the plank or brick walls the builders put up. Stickmen never touch back walls.
- **Falling sand:** powders pile, liquids spread, gases rise, fire spreads by flammability and is doused by water. Only **16 × 16 chunks that are awake** are simulated (a change wakes its chunk and neighbours), so the big world stays cheap.
- **Slow processes** run on random cells: grass spreads, ash and sawdust rot, sunlit puddles evaporate, pools drain into soil. A spring keeps the lake at its level.
- **Generation:** smoothed hills (no column steps more than 2 px, so stickmen can walk them), a lake, forests either side of a flat colony site. Underground everything is laid out at 4× scale (`UNDERGROUND_SCALE`), so it reads at the stickmen's size: about 90–130 px of dirt (with sand pockets) over stone, big ore pockets by depth (copper from 100 px down, silver from 440 px, gold from 800 px), wide winding caves and caverns from 180 px down, and bedrock at the bottom.
- Tilt biases which way sand and water slide.

## Stickmen (`stickman.ts`, `nav.ts`)

- **Body:** Stick Ranger's, drawn with white limbs and a hollow square head (the neck stops at the head's edge): 11 Verlet points with distance constraints, kept upright by negative gravity on the head and hips while grounded, walking by kicking the rear knee every 15 ticks, ragdolling when airborne or asleep, and grabbable by pointer.
- **Climbing:** on a ladder the body is posed against the rungs, hands and feet alternating, moving up or down at a fixed speed. Collisions are skipped while climbing.
- **One-way platforms:** a joint that started the tick above a platform row lands on it; climbing passes through. Platforms form the floor holes where ladders go between storeys and bridge the mine shaft.
- **Pathfinding:** a breadth-first search over *stand* nodes (feet on solid ground or a platform with 16 px of headroom; roofs only count for builders) and *climb* nodes (beside a ladder or scaffold pole). Moves: walk a pixel (stepping up or down up to 5 px), drop off a ledge, mount, climb, dismount. Paths compress into walk and climb waypoints the body follows.
- **Recovery:** no progress toward a waypoint for 4 s means a replan. After 3 failed replans the settler gives up that job, skips it for a minute, and the settler climbs out to the nearest place connected to the colony. Buried bodies are pushed up.

## Buildings (`blueprints.ts`, `rooms.ts`)

Blueprints are generated from a few parameters (width, storeys, furniture, brick or wood). Each is **hollow** and sized for its stickmen (who are about 17 px tall): 3 px side walls and floors, 60 px tall rooms, 26 px doors, beds 24 px long, bookcases 42 px tall, a gable roof, a built back wall behind every interior cell, doors in the ground floor, glass windows, and a ladder through a platform hole between storeys. There is **no front wall**, so every building is seen as a dollhouse cutaway.

**Room rules (Terraria style):** a storey counts as a room when a flood fill from inside it stays enclosed by walls/floor/roof (solid materials, doors, glass, platforms), every interior cell has a built back wall, it has a door or platform on its edge, and it is big enough. Its kind comes from its furniture:

| Kind | Furniture | Used for |
| --- | --- | --- |
| Home | Bed | Sleeping; free beds let new settlers arrive |
| Library | Bookshelf | Scholars read books here for Knowledge |
| Alchemy lab | Cauldron | Alchemists research new blueprints and improvements |
| Forge | Furnace | Forge hands smelt ore into bars |
| Smithy | Anvil | Smiths work bars into Smithy points |

A room that stops counting (burnt wall, missing back wall) stops working until it is repaired.

| Blueprint | Storeys | Notes |
| --- | --- | --- |
| Cabin | 1 | Two beds. Known from the start |
| Library | 2 | Alchemy lab below, three bookshelves and a desk above. Known from the start |
| Bunkhouse | 2 | Four beds (researched) |
| Stone cottage | 1 | Brick and fireproof, three beds (researched) |
| Grand library | 3 | Twin cauldrons, two floors of stacks (researched) |
| Forge | 1 | A big brick furnace with a chimney through the roof. Built once ore comes up |
| Smithy | 1 | Two anvils and a bench. Built after the forge |

## The colony (`colony.ts`, `research.ts`, `smithy.ts`, `trees.ts`)

Each settler has a name for life and a role the player can change in the panel.

- **Miners** follow a mine plan after Tower Defense's Mine: a 9 px laddered shaft sunk from a platform-covered mouth under a timber headframe, a tunnel 20 px tall out either side at each level (40 px apart), platforms across the shaft at each level and as bridges over caves, and torches once researched. From each tunnel's end a **drift** steps up or down toward the nearest worthwhile ore pocket and ends in a lit chamber where the pocket is dug out; drifts stop short of loose sand. When a dig breaks into a natural **cave**, the crew learn its extent, light its floor and go after the ore on its walls. Ore pockets and cave work are side jobs: miners take any within 60 px first (following ore they bare), and otherwise come back to them when the main plan is done, so ore out of reach never holds the mine up. Miners carry what they dig to the **hoist**: they tip it into the bucket at the shaft on their level, and the bucket is wound up to the yard, where ore goes into the stores and dug dirt onto a falling-sand **spoil heap**. Every fifth miner (from the second) works the **night shift**. Every 30 s the plan is rechecked from the top, so passages sand fell into are dug out again. Levels: 4, then more with Deeper shaft I–III (30 in all, down near the bedrock).
- **Builders** pick the next building (homes when beds run short, the library early on), find level-ish ground near the campfire (at least 36 px from other buildings and well clear of the fire), cut down trees in the way at the trunk (their crowns come down with them) and fill a foundation. Then they put up **scaffolding**: a pole at each end, two inside each storey (one near each wall, so a chimney or tall furniture can't cut half the room off), and walkway decks every 18 px up past the roof's peak. They build the blueprint in reach-sized blocks (16 rows by 24 columns), bottom-up, from the ground, the decks, the floors and the roof itself (builders may walk on roofs; nobody else does). Where scaffolding is in the way, that pixel waits. Last, they take the scaffold down from the top, filling in what the blueprint wants where each piece stood. Their reach is an arm's length (20 px across, 28 px up). When short of wood they chop it themselves. Scholars, alchemists, forge hands and smiths with nothing to do help build, and so do woodcutters while there's plenty of wood. A site nobody can get on with for eight working minutes (nights and waits for materials don't count) is abandoned, and that ground is avoided for half an hour.
- **Woodcutters** fell the nearest grown tree (10 strikes, sawdust flying) and carry the logs to the woodpile. Felled trees regrow from the roots up.
- **Scholars** (modelled on the Library's professors) take a book from a shelf, read it at the desk and put it back. Each book read earns Knowledge, more with more shelves.
- **Alchemists** (the lab's researchers) start the next project (the player's pick, or the cheapest affordable), paying its Knowledge and metal up front, then stir the cauldron and write up notes until its work time is done.
- **Forge hands** (after Tower Defense's Mine forge) carry up to 12 ore from the yard to the forge, gold first, and tip it on the heap by the furnace (it holds 40). Then they shovel it in: four copper ore, two silver or one gold make a bar.
- **Smiths** work bars at the anvils, sparks flying. Every ten bars of a metal make a **Smithy point** of it, and Smithy points buy tools (the player's pick, or the cheapest): sharper and silver-tipped picks, keen axes, builders' and gilded hammers, silver lanterns and gold-nibbed quills, each a quarter better at its job. A trade nobody holds still goes on at a quarter of the pace. Research costs metal as bars, so the forge feeds the lab as well.
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

- `stick-simulation-colony-v4`: the colony as JSON (settlers, roles, sites, trees, resources, Knowledge, research, time).
- `stick-simulation-world-v4`: the cell and back-wall layers, run-length encoded (about 200 KB).
- Saved every 15 s and when the page hides. On load, up to an hour away is caught up on by running extra ticks within an 8 ms frame budget.
- Saves from an older world size are ignored and a new world starts.

## Hardware integration checkpoints

1. Confirm exact square touchscreen model and HDMI/DSI/USB touch interfaces.
2. Verify multi-hour fullscreen runtime without display artifacts or overheating.
3. Validate sensor bridge and axis calibration on the actual mounted orientation.
4. Test power loss, boot-to-game, auto-restart, and long-duration save integrity.
5. Design and physically test a freestanding enclosure with protected wiring and ventilation.
