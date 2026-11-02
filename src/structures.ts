/**
 * Trees, the hut, the fence and the campfire are stamped into the material
 * grid from templates. Once placed they are ordinary cells: fire can burn
 * them, sand can bury them. This module keeps the grid and the autonomous
 * simulation in agreement:
 *  - construction tasks place cells bottom-up as the task progresses,
 *  - a building that loses most of its cells is lost (the simulation then
 *    decides to rebuild it),
 *  - burnt trees slowly regrow.
 */
import { hash2 } from "./pixels";
import { Kind, Material, MATERIALS } from "./materials";
import { DURATION } from "./simulation";
import { groundHeight, SETTLEMENT_GROUND_Y, type Terrain } from "./terrain";
import type { World } from "./world";

interface Cell { x: number; y: number; m: Material; shade: number }

class Stamp {
  private readonly map = new Map<number, Cell>();
  set(x: number, y: number, m: Material, shade: number): void {
    x = Math.round(x); y = Math.round(y);
    this.map.set(y * 1024 + x, { x, y, m, shade });
  }
  rect(x: number, y: number, w: number, h: number, m: Material, shade: number): void {
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) this.set(x + px, y + py, m, shade);
  }
  /** Cells ordered bottom-up, so construction rises from the ground. */
  cells(): Cell[] {
    return [...this.map.values()].sort((a, b) => b.y - a.y || a.x - b.x);
  }
}

export const TREE_XS = [22, 48, 72];
export const CAMPFIRE_X = 101;

function treeTemplate(x: number, variation: number): Cell[] {
  const s = new Stamp();
  const base = groundHeight(x);
  const blobs: Array<[number, number, number]> = [
    [0, -38, 13], [-7, -46 - variation, 9], [7, -47 - variation, 9], [0, -55 - variation, 9]
  ];
  for (const [bx, by, r] of blobs) {
    for (let py = -r; py <= r; py++) {
      for (let px = -r; px <= r; px++) {
        if (px * px + py * py > r * r) continue;
        const X = x + bx + px;
        const Y = base + by + py;
        const light = (-py - px * 0.5) / r + (hash2(X, Y) - 0.5) * 0.9;
        s.set(X, Y, Material.Leaf, light > 0.75 ? 3 : light > 0.15 ? 2 : light > -0.5 ? 1 : 0);
      }
    }
  }
  s.rect(x - 2, base - 26, 4, 26, Material.Bark, 1);
  s.rect(x - 2, base - 26, 1, 26, Material.Bark, 0);
  s.set(x - 3, base - 1, Material.Bark, 1);
  s.set(x + 2, base - 1, Material.Bark, 1);
  return s.cells();
}

function hutTemplate(): Cell[] {
  const s = new Stamp();
  const g = SETTLEMENT_GROUND_Y;
  s.rect(120, g - 36, 41, 36, Material.Plank, 0);
  for (let y = g - 33; y < g - 2; y += 4) s.rect(122, y, 37, 3, Material.Plank, 1);
  s.rect(115, g - 41, 51, 5, Material.Thatch, 3);
  s.rect(118, g - 47, 45, 6, Material.Thatch, 1);
  s.rect(126, g - 53, 29, 6, Material.Thatch, 0);
  for (let x = 116; x < 165; x += 4) s.set(x, g - 41, Material.Thatch, 0);
  s.rect(127, g - 18, 11, 18, Material.Plank, 2);
  s.rect(145, g - 29, 9, 8, Material.Glass, 0);
  s.rect(149, g - 29, 1, 8, Material.Plank, 0);
  s.rect(145, g - 25, 9, 1, Material.Plank, 0);
  return s.cells();
}

function fenceTemplate(): Cell[] {
  const s = new Stamp();
  const g = SETTLEMENT_GROUND_Y;
  for (const x of [168, 178, 188]) {
    s.rect(x, g - 21, 3, 21, Material.Plank, 0);
    s.set(x + 1, g - 22, Material.Plank, 0);
  }
  s.rect(168, g - 17, 23, 2, Material.Plank, 1);
  s.rect(168, g - 8, 23, 2, Material.Plank, 1);
  return s.cells();
}

function campfireTemplate(): Cell[] {
  const s = new Stamp();
  const g = SETTLEMENT_GROUND_Y;
  s.rect(CAMPFIRE_X - 5, g - 2, 11, 2, Material.Hearth, 1);
  for (let x = CAMPFIRE_X - 4; x <= CAMPFIRE_X + 4; x += 2) s.set(x, g - 2, Material.Hearth, 2);
  s.set(CAMPFIRE_X - 6, g - 1, Material.Stone, 2);
  s.set(CAMPFIRE_X + 6, g - 1, Material.Stone, 0);
  return s.cells();
}

/** Cells a structure may be built into: open air or drifting gas. */
function canBuildInto(t: Terrain, i: number): boolean {
  const m = t.cells[i] as Material;
  return m === Material.Empty || MATERIALS[m].kind === Kind.Gas;
}

class Structure {
  constructor(readonly cells: Cell[]) {}

  present(t: Terrain): number {
    let n = 0;
    for (const c of this.cells) if (t.cells[t.index(c.x, c.y)] === c.m) n++;
    return n / this.cells.length;
  }

  /** Fraction of the template that is open air/gas, i.e. burnt or knocked away (not just buried or flooded). */
  gone(t: Terrain): number {
    let n = 0;
    for (const c of this.cells) if (canBuildInto(t, t.index(c.x, c.y))) n++;
    return n / this.cells.length;
  }

  burning(t: Terrain): boolean {
    for (const c of this.cells) if (t.isBurning(t.index(c.x, c.y))) return true;
    return false;
  }

  /** Place the first `fraction` of the template (bottom-up). */
  buildUpTo(t: Terrain, fraction: number): void {
    const count = Math.min(this.cells.length, Math.ceil(this.cells.length * fraction));
    for (let k = 0; k < count; k++) this.placeCell(t, this.cells[k]);
  }

  /** Place up to n random missing cells. */
  repair(t: Terrain, n: number): void {
    for (let k = 0; k < n; k++) {
      this.placeCell(t, this.cells[(Math.random() * this.cells.length) | 0]);
    }
  }

  private placeCell(t: Terrain, c: Cell): void {
    if (!t.inBounds(c.x, c.y)) return;
    const i = t.index(c.x, c.y);
    if (t.cells[i] === c.m || !canBuildInto(t, i)) return;
    t.set(c.x, c.y, c.m, c.shade);
  }
}

/** Which buildings have been placed into the grid (saved alongside it). */
export interface BuiltFlags { campfire: boolean; hut: boolean; fence: boolean }

const LOST_BELOW = 0.35;

export class Structures {
  readonly trees = TREE_XS.map((x, k) => new Structure(treeTemplate(x, [4, 0, 7][k])));
  readonly hut = new Structure(hutTemplate());
  readonly fence = new Structure(fenceTemplate());
  readonly campfire = new Structure(campfireTemplate());
  built: BuiltFlags = { campfire: false, hut: false, fence: false };
  /** Growth fraction for each regrowing tree, or -1 when not regrowing. */
  private growth = this.trees.map(() => -1);
  private ticks = 0;

  /** Fresh world: stamp trees, plus whatever the simulation has built. */
  stampAll(t: Terrain, world: World): void {
    for (const tree of this.trees) tree.buildUpTo(t, 1);
    this.built = { campfire: false, hut: false, fence: false };
    this.reconcile(t, world);
  }

  /** Index of the tree nearest to x. */
  treeNear(x: number): number {
    let best = 0;
    TREE_XS.forEach((tx, k) => { if (Math.abs(tx - x) < Math.abs(TREE_XS[best] - x)) best = k; });
    return best;
  }

  treeStanding(k: number, t: Terrain): boolean {
    return this.trees[k].present(t) > 0.5;
  }

  /** Called every physics tick; returns an event message if something was lost. */
  update(t: Terrain, world: World): string | null {
    this.ticks++;
    if (this.ticks % 5 !== 0) return null;
    return this.reconcile(t, world);
  }

  private reconcile(t: Terrain, world: World): string | null {
    let event: string | null = null;
    const progress = world.taskProgress / Math.max(1, DURATION[world.task]);

    const building = (
      key: keyof BuiltFlags,
      s: Structure,
      task: World["task"],
      lostMessage: string
    ): void => {
      if (world[key]) {
        if (!this.built[key]) { s.buildUpTo(t, 1); this.built[key] = true; }
        else if (key !== "campfire" && s.gone(t) > 1 - LOST_BELOW && !s.burning(t)) {
          world[key] = false;
          this.built[key] = false;
          event = lostMessage;
        } else if (!s.burning(t) && Math.random() < 0.2) {
          s.repair(t, 1);
        }
      } else if (world.task === task) {
        s.buildUpTo(t, progress);
      }
    };

    building("campfire", this.campfire, "buildCampfire", "");
    building("hut", this.hut, "buildHut", "The hut burned down!");
    building("fence", this.fence, "buildFence", "The fence was destroyed.");

    this.trees.forEach((tree, k) => {
      const present = tree.present(t);
      if (this.growth[k] < 0 && present < 0.55 && !tree.burning(t)) this.growth[k] = 0;
      if (this.growth[k] >= 0) {
        // Regrow from the roots up.
        this.growth[k] += 0.0015;
        tree.buildUpTo(t, this.growth[k]);
        if (this.growth[k] >= 1) this.growth[k] = -1;
      }
    });
    return event;
  }
}
