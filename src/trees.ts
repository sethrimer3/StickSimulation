/**
 * Trees are material templates stamped into the grid. Woodcutters fell
 * them; a felled tree regrows from the roots up after a while.
 */
import { Material } from "./materials";
import { hash2 } from "./pixels";
import { COLONY_X, FLAT_FROM, FLAT_TO, groundHeight, LAKE_FROM, LAKE_TO, MINE_X, WORLD_W, type Terrain } from "./terrain";

export interface TreeCell { x: number; y: number; m: Material; shade: number }

export interface TreeState {
  x: number;
  /** 0..1 grown, or negative seconds until it starts regrowing. */
  growth: number;
  /** Removed for good (built over). */
  gone?: boolean;
}

export function treeCells(x: number, seed: number): TreeCell[] {
  const cells = new Map<number, TreeCell>();
  const base = groundHeight(x, seed);
  const variation = Math.round(hash2(x, seed + 5) * 7);
  const set = (cx: number, cy: number, m: Material, shade: number): void => { cells.set(cy * 4096 + cx, { x: cx, y: cy, m, shade }); };
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
        set(X, Y, Material.Leaf, light > 0.75 ? 3 : light > 0.15 ? 2 : light > -0.5 ? 1 : 0);
      }
    }
  }
  for (let y = base - 26; y < base; y++) {
    for (let dx = -2; dx < 2; dx++) set(x + dx, y, Material.Bark, dx === -2 ? 0 : 1);
  }
  set(x - 3, base - 1, Material.Bark, 1);
  set(x + 2, base - 1, Material.Bark, 1);
  return [...cells.values()].sort((a, b) => b.y - a.y || a.x - b.x);
}

/** Where trees stand in a fresh world (forests either side of the colony). */
export function initialTrees(seed: number): TreeState[] {
  const trees: TreeState[] = [];
  let x = 24;
  while (x < WORLD_W - 24) {
    const inLake = x > LAKE_FROM - 16 && x < LAKE_TO + 16;
    const inColony = x > FLAT_FROM - 10 && x < FLAT_TO + 10;
    const nearMine = Math.abs(x - MINE_X) < 30;
    const nearFire = Math.abs(x - COLONY_X) < 30;
    if (!inLake && !inColony && !nearMine && !nearFire) trees.push({ x, growth: 1 });
    x += 26 + Math.round(hash2(x, seed + 9) * 22);
  }
  return trees;
}

export function stampTree(t: Terrain, tree: TreeState, fraction = 1): void {
  const cells = treeCells(tree.x, t.seed);
  const count = Math.ceil(cells.length * Math.max(0, Math.min(1, fraction)));
  for (let k = 0; k < count; k++) {
    const c = cells[k];
    const cur = t.get(c.x, c.y);
    if (cur === Material.Empty || cur === Material.Smoke || cur === Material.Steam) t.set(c.x, c.y, c.m, c.shade);
  }
}

/** Share of the tree's trunk still standing. */
export function trunkLeft(t: Terrain, tree: TreeState): number {
  const base = groundHeight(tree.x, t.seed);
  let n = 0;
  for (let y = base - 26; y < base; y++) if (t.get(tree.x, y) === Material.Bark) n++;
  return n / 26;
}

/** Remove a tree's wood and leaves; returns wood gained. */
export function fellTree(t: Terrain, tree: TreeState): number {
  let wood = 0;
  for (const c of treeCells(tree.x, t.seed)) {
    const cur = t.get(c.x, c.y);
    if (cur === Material.Bark) { wood += 0.2; t.set(c.x, c.y, Math.random() < 0.08 ? Material.Sawdust : Material.Empty); }
    else if (cur === Material.Leaf) { wood += 0.01; t.set(c.x, c.y, Material.Empty); }
  }
  return Math.round(wood);
}
