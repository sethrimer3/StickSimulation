/**
 * Building blueprints. A blueprint is a list of cells (materials and back
 * walls) relative to its top-left corner, plus where its rooms and furniture
 * are. Buildings are hollow: side walls, floors and a roof of solid
 * material, a built back wall behind every interior cell, doors in the
 * ground floor, and one-way platforms with a ladder between floors. There is
 * no front wall, so every building is seen as a dollhouse cutaway.
 */
import { Material, WallKind, type Resource } from "./materials";

export type FurnitureKind = "bed" | "shelf" | "desk" | "cauldron";

export interface BlueprintCell { dx: number; dy: number; m: Material | null; wall: WallKind }

export interface Spot { kind: FurnitureKind; dx: number; dy: number }

export interface StoryInfo {
  /** Row (from the top) the story's floor surface is on: feet stand on top of it. */
  floorDy: number;
  /** A cell inside the room, used to check enclosure. */
  seed: { dx: number; dy: number };
}

export interface Blueprint {
  id: string;
  name: string;
  width: number;
  height: number;
  cells: BlueprintCell[];
  stories: StoryInfo[];
  spots: Spot[];
  ladderDx: number | null;
  cost: Partial<Record<Resource, number>>;
  /** Shown in the UI. */
  description: string;
}

type Grid = Map<number, BlueprintCell>;

function put(g: Grid, dx: number, dy: number, m: Material | null, wall: WallKind): void {
  g.set(dy * 4096 + dx, { dx, dy, m, wall });
}

interface StoryPlan {
  height: number;
  furnish: (f: Furnisher) => void;
}

/** Places furniture on one story. x is from the building's left edge, y is the floor row. */
class Furnisher {
  constructor(private g: Grid, private spots: Spot[], readonly left: number, readonly right: number, readonly floorDy: number, private wall: WallKind) {}

  private cell(dx: number, dy: number, m: Material): void {
    put(this.g, dx, dy, m, this.wall);
  }

  bed(dx: number): void {
    const y = this.floorDy;
    for (let x = 0; x < 9; x++) {
      this.cell(dx + x, y - 2, Material.Bed);
      if (x === 0 || x === 8) { this.cell(dx + x, y - 1, Material.Bed); this.cell(dx + x, y - 3, Material.Bed); }
      else this.cell(dx + x, y - 1, Material.Bed);
    }
    this.cell(dx, y - 4, Material.Bed);
    this.spots.push({ kind: "bed", dx: dx + 4, dy: y });
  }

  shelf(dx: number, height = 16): void {
    const y = this.floorDy;
    for (let yy = 1; yy <= height; yy++) for (let x = 0; x < 7; x++) this.cell(dx + x, y - yy, Material.Bookshelf);
    this.spots.push({ kind: "shelf", dx: dx + 3, dy: y });
  }

  desk(dx: number): void {
    const y = this.floorDy;
    for (let x = 0; x < 8; x++) this.cell(dx + x, y - 5, Material.Desk);
    for (const x of [0, 7]) for (let yy = 1; yy <= 4; yy++) this.cell(dx + x, y - yy, Material.Desk);
    this.cell(dx + 2, y - 6, Material.Desk);
    this.cell(dx + 3, y - 6, Material.Desk);
    this.spots.push({ kind: "desk", dx: dx + 4, dy: y });
  }

  cauldron(dx: number): void {
    const y = this.floorDy;
    const rows = ["  ###  ", " ##### ", "#######", "#######", " #   # "];
    rows.forEach((row, r) => {
      for (let x = 0; x < row.length; x++) if (row[x] === "#") this.cell(dx + x, y - rows.length + r, Material.Cauldron);
    });
    this.spots.push({ kind: "cauldron", dx: dx + 3, dy: y });
  }

  torch(dx: number, dyFromFloor: number): void {
    this.cell(dx, this.floorDy - dyFromFloor, Material.Torch);
  }
}

interface BuildingPlan {
  id: string;
  name: string;
  description: string;
  width: number;
  stories: StoryPlan[];
  brick?: boolean;
  ladderDx?: number;
  cost: Partial<Record<Resource, number>>;
}

const FLOOR = 2;
const SIDE = 2;
const DOOR_H = 18;

function makeBlueprint(plan: BuildingPlan): Blueprint {
  const g: Grid = new Map();
  const spots: Spot[] = [];
  const shell = plan.brick ? Material.Brick : Material.Plank;
  const wallKind = plan.brick ? WallKind.BrickWall : WallKind.PlankWall;
  const w = plan.width;
  const roofH = Math.ceil(w / 4);
  const bodyH = plan.stories.reduce((s, st) => s + st.height + FLOOR, 0) + FLOOR;
  const height = roofH + bodyH;
  const multi = plan.stories.length > 1;
  const ladderDx = multi ? plan.ladderDx ?? w - 7 : null;

  // Roof: a solid stepped thatch (or brick) gable.
  for (let r = 0; r < roofH; r++) {
    const inset = Math.round(((roofH - r) * (w / 2 + 2)) / (roofH + 1)) - 2;
    for (let x = inset; x < w - inset; x++) put(g, x, r, plan.brick ? Material.Brick : Material.Thatch, WallKind.None);
  }

  // Stories from the bottom up.
  const stories: StoryInfo[] = [];
  let floorTop = height - FLOOR; // top row of the ground floor
  for (let k = 0; k < plan.stories.length; k++) {
    const st = plan.stories[k];
    // Floor under this story.
    for (let r = 0; r < FLOOR; r++) {
      for (let x = 0; x < w; x++) {
        const hole = k > 0 && ladderDx !== null && Math.abs(x - ladderDx) <= 3;
        put(g, x, floorTop + r, hole ? Material.Platform : shell, wallKind);
      }
    }
    // Interior and side walls.
    for (let r = 1; r <= st.height; r++) {
      const y = floorTop - r;
      for (let x = 0; x < w; x++) {
        const side = x < SIDE || x >= w - SIDE;
        let m: Material | null = side ? shell : null;
        if (side && k === 0 && r <= DOOR_H) m = Material.Door;
        if (side && k > 0 && r >= 9 && r <= 14) m = Material.Glass;
        put(g, x, y, m, wallKind);
      }
      if (ladderDx !== null && k < plan.stories.length - 1) put(g, ladderDx, y, Material.Ladder, wallKind);
    }
    const f = new Furnisher(g, spots, SIDE, w - SIDE, floorTop, wallKind);
    st.furnish(f);
    stories.push({ floorDy: floorTop, seed: { dx: Math.floor(w / 2), dy: floorTop - 2 } });
    floorTop -= st.height + FLOOR;
  }
  // Top ceiling under the roof.
  for (let r = 0; r < FLOOR; r++) for (let x = 0; x < w; x++) put(g, x, floorTop + r, shell, wallKind);

  // Make sure each story's room seed is an interior cell.
  for (const s of stories) {
    for (let dx = SIDE; dx < w - SIDE; dx++) {
      const c = g.get(s.seed.dy * 4096 + dx);
      if (c && c.m === null) { s.seed.dx = dx; break; }
    }
  }

  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    width: w,
    height,
    cells: [...g.values()],
    stories,
    spots,
    ladderDx,
    cost: plan.cost
  };
}

export const BLUEPRINTS: Record<string, Blueprint> = {};

function add(plan: BuildingPlan): void {
  BLUEPRINTS[plan.id] = makeBlueprint(plan);
}

add({
  id: "cabin",
  name: "Cabin",
  description: "A one-room wooden home with two beds.",
  width: 34,
  cost: { wood: 70 },
  stories: [{ height: 22, furnish: (f) => { f.bed(4); f.bed(20); f.torch(17, 16); } }]
});

add({
  id: "library",
  name: "Library",
  description: "Bookshelves upstairs for study, an alchemy lab below for creating blueprints.",
  width: 60,
  ladderDx: 52,
  cost: { wood: 140, stone: 30 },
  stories: [
    { height: 22, furnish: (f) => { f.cauldron(6); f.desk(22); f.torch(17, 16); f.torch(40, 16); } },
    { height: 26, furnish: (f) => { f.shelf(4); f.shelf(13); f.desk(24); f.shelf(36); f.torch(22, 20); } }
  ]
});

add({
  id: "bunkhouse",
  name: "Bunkhouse",
  description: "Two floors of beds: room for four more settlers.",
  width: 34,
  ladderDx: 28,
  cost: { wood: 130 },
  stories: [
    { height: 22, furnish: (f) => { f.bed(3); f.bed(14); f.torch(12, 16); } },
    { height: 22, furnish: (f) => { f.bed(3); f.bed(14); f.torch(12, 16); } }
  ]
});

add({
  id: "stoneCottage",
  name: "Stone cottage",
  description: "A fireproof brick home with three beds.",
  width: 40,
  brick: true,
  cost: { stone: 150 },
  stories: [{ height: 22, furnish: (f) => { f.bed(3); f.bed(15); f.bed(27); f.torch(20, 17); } }]
});

add({
  id: "grandLibrary",
  name: "Grand library",
  description: "Two floors of stacks over a bigger lab with twin cauldrons.",
  width: 64,
  ladderDx: 56,
  cost: { wood: 220, stone: 60, copper: 15 },
  stories: [
    { height: 22, furnish: (f) => { f.cauldron(5); f.cauldron(17); f.desk(30); f.torch(27, 16); f.torch(45, 16); } },
    { height: 26, furnish: (f) => { f.shelf(4); f.shelf(13); f.desk(24); f.shelf(36); f.shelf(45); f.torch(33, 20); } },
    { height: 26, furnish: (f) => { f.shelf(4); f.shelf(13); f.shelf(22); f.desk(32); f.shelf(45); f.torch(42, 20); } }
  ]
});

/** Resource cost of placing one cell of a material (or a back wall). */
export function cellCost(m: Material | null, wall: WallKind): Partial<Record<Resource, number>> {
  const c: Partial<Record<Resource, number>> = {};
  const add = (r: Resource, n: number): void => { c[r] = (c[r] ?? 0) + n; };
  switch (m) {
    case Material.Plank: case Material.Door: case Material.Platform: case Material.Ladder: add("wood", 0.12); break;
    case Material.Thatch: add("wood", 0.05); break;
    case Material.Bookshelf: case Material.Bed: case Material.Desk: add("wood", 0.15); break;
    case Material.Torch: add("wood", 0.5); break;
    case Material.Brick: add("stone", 0.2); break;
    case Material.Cauldron: add("stone", 0.3); break;
    case Material.Glass: add("sand", 0.1); break;
    default: break;
  }
  if (wall === WallKind.PlankWall) add("wood", 0.02);
  if (wall === WallKind.BrickWall) add("stone", 0.03);
  return c;
}
