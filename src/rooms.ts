/**
 * Terraria-style room rules. A room counts when, starting from a cell inside
 * it, a flood fill stays enclosed by walls/floor/roof (solid materials, doors,
 * glass, platforms), every interior cell has a built back wall, and it has a
 * way in (a door or platform on its edge). What it is for comes from the
 * furniture inside it.
 */
import { isBuiltWall, Material, MATERIALS, MATERIAL_LIST } from "./materials";
import { FURNITURE_CELLS } from "./blueprints";
import type { Terrain } from "./terrain";

export type RoomKind = "home" | "library" | "lab" | "forge" | "smithy" | "empty";

export interface RoomCheck {
  valid: boolean;
  /** Why it doesn't count, if it doesn't. */
  reason: string;
  kind: RoomKind;
  area: number;
  beds: number;
  shelves: number;
  desks: number;
  cauldrons: number;
  furnaces: number;
  anvils: number;
}

const ENCLOSING = MATERIAL_LIST.map((m) => MATERIALS[m].enclosing);

/** Check the room containing (sx, sy), which must fit inside the given box. */
export function checkRoom(t: Terrain, sx: number, sy: number, box: { x0: number; y0: number; x1: number; y1: number }): RoomCheck {
  const result: RoomCheck = { valid: false, reason: "", kind: "empty", area: 0, beds: 0, shelves: 0, desks: 0, cauldrons: 0, furnaces: 0, anvils: 0 };
  if (ENCLOSING[t.get(sx, sy)]) { result.reason = "Filled in"; return result; }
  const seen = new Set<number>();
  const stack = [t.index(sx, sy)];
  seen.add(stack[0]);
  let entrance = false;
  let missingWall = 0;
  const counts = new Map<Material, number>();
  const maxArea = (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1);
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % t.width;
    const y = (i / t.width) | 0;
    if (x <= box.x0 || x >= box.x1 || y <= box.y0 || y >= box.y1 || seen.size > maxArea) {
      result.reason = "Open to the outside";
      return result;
    }
    const m = t.cells[i] as Material;
    counts.set(m, (counts.get(m) ?? 0) + 1);
    if (!isBuiltWall(t.walls[i])) missingWall++;
    for (const j of [i - 1, i + 1, i - t.width, i + t.width]) {
      const n = t.cells[j] as Material;
      if (ENCLOSING[n]) {
        if (n === Material.Door || n === Material.Platform) entrance = true;
        continue;
      }
      if (!seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  result.area = seen.size;
  // A piece of furniture still counts when a little of it is damaged.
  const pieces = (m: Material, cells: number): number => Math.floor((counts.get(m) ?? 0) / (cells * 0.85));
  result.beds = pieces(Material.Bed, FURNITURE_CELLS.bed);
  result.shelves = pieces(Material.Bookshelf, FURNITURE_CELLS.shelf);
  result.desks = pieces(Material.Desk, FURNITURE_CELLS.desk);
  result.cauldrons = pieces(Material.Cauldron, FURNITURE_CELLS.cauldron);
  result.furnaces = pieces(Material.Furnace, FURNITURE_CELLS.furnace);
  result.anvils = pieces(Material.Anvil, FURNITURE_CELLS.anvil);
  result.kind = result.cauldrons > 0 ? "lab" : result.furnaces > 0 ? "forge" : result.anvils > 0 ? "smithy"
    : result.shelves > 0 ? "library" : result.beds > 0 ? "home" : "empty";
  if (missingWall > 0) { result.reason = "Missing back wall"; return result; }
  if (!entrance) { result.reason = "No door"; return result; }
  if (result.area < 1200) { result.reason = "Too small"; return result; }
  result.valid = true;
  return result;
}
