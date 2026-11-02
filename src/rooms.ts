/**
 * Terraria-style room rules. A room counts when, starting from a cell inside
 * it, a flood fill stays enclosed by walls/floor/roof (solid materials, doors,
 * glass, platforms), every interior cell has a built back wall, and it has a
 * way in (a door or platform on its edge). What it is for comes from the
 * furniture inside it.
 */
import { isBuiltWall, Material, MATERIALS, MATERIAL_LIST } from "./materials";
import type { Terrain } from "./terrain";

export type RoomKind = "home" | "library" | "lab" | "empty";

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
}

const ENCLOSING = MATERIAL_LIST.map((m) => MATERIALS[m].enclosing);

/** Check the room containing (sx, sy), which must fit inside the given box. */
export function checkRoom(t: Terrain, sx: number, sy: number, box: { x0: number; y0: number; x1: number; y1: number }): RoomCheck {
  const result: RoomCheck = { valid: false, reason: "", kind: "empty", area: 0, beds: 0, shelves: 0, desks: 0, cauldrons: 0 };
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
  result.beds = Math.floor((counts.get(Material.Bed) ?? 0) / 19);
  result.shelves = Math.floor((counts.get(Material.Bookshelf) ?? 0) / 100);
  result.desks = Math.floor((counts.get(Material.Desk) ?? 0) / 14);
  result.cauldrons = Math.floor((counts.get(Material.Cauldron) ?? 0) / 20);
  result.kind = result.cauldrons > 0 ? "lab" : result.shelves > 0 ? "library" : result.beds > 0 ? "home" : "empty";
  if (missingWall > 0) { result.reason = "Missing back wall"; return result; }
  if (!entrance) { result.reason = "No door"; return result; }
  if (result.area < 120) { result.reason = "Too small"; return result; }
  result.valid = true;
  return result;
}
