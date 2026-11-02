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
  /** Interior height in pixels. */
  height: number;
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

  /** A bed 24 wide: headboard, mattress, pillow end and footboard. */
  bed(dx: number): void {
    const y = this.floorDy;
    for (let x = 0; x < BED_W; x++) {
      for (let r = 3; r <= 5; r++) this.cell(dx + x, y - r, Material.Bed);
      if (x < 2 || x >= BED_W - 2) for (let r = 1; r <= 2; r++) this.cell(dx + x, y - r, Material.Bed);
    }
    for (let r = 6; r <= 10; r++) for (let x = 0; x < 2; x++) this.cell(dx + x, y - r, Material.Bed);
    for (let r = 6; r <= 7; r++) for (let x = BED_W - 2; x < BED_W; x++) this.cell(dx + x, y - r, Material.Bed);
    this.spots.push({ kind: "bed", dx: dx + BED_W / 2, dy: y });
  }

  /** A tall bookcase, 18 wide and 42 tall. */
  shelf(dx: number): void {
    const y = this.floorDy;
    for (let yy = 1; yy <= SHELF_H; yy++) for (let x = 0; x < SHELF_W; x++) this.cell(dx + x, y - yy, Material.Bookshelf);
    this.spots.push({ kind: "shelf", dx: dx + SHELF_W / 2, dy: y });
  }

  /** A writing desk, 20 wide, with a stack of papers on it. */
  desk(dx: number): void {
    const y = this.floorDy;
    for (let x = 0; x < 20; x++) for (const r of [11, 12]) this.cell(dx + x, y - r, Material.Desk);
    for (const x of [1, 2, 17, 18]) for (let r = 1; r <= 10; r++) this.cell(dx + x, y - r, Material.Desk);
    for (let x = 4; x < 9; x++) for (const r of [13, 14]) this.cell(dx + x, y - r, Material.Desk);
    this.spots.push({ kind: "desk", dx: dx + 10, dy: y });
  }

  /** A pot-bellied iron cauldron on legs, 17 wide. */
  cauldron(dx: number): void {
    const y = this.floorDy;
    const rows = [
      "   ###########   ",
      "  #############  ",
      " ############### ",
      "#################",
      "#################",
      "#################",
      "#################",
      " ############### ",
      "  #############  ",
      "   ###########   ",
      "   ##       ##   ",
      "  ##         ##  "
    ];
    rows.forEach((row, r) => {
      for (let x = 0; x < row.length; x++) if (row[x] === "#") this.cell(dx + x, y - rows.length + r, Material.Cauldron);
    });
    this.spots.push({ kind: "cauldron", dx: dx + 8, dy: y });
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

const FLOOR = 3;
const SIDE = 3;
const DOOR_H = 26;
const STORY = 60;
const BED_W = 24;
const SHELF_W = 18;
const SHELF_H = 42;

function makeBlueprint(plan: BuildingPlan): Blueprint {
  const g: Grid = new Map();
  const spots: Spot[] = [];
  const shell = plan.brick ? Material.Brick : Material.Plank;
  const wallKind = plan.brick ? WallKind.BrickWall : WallKind.PlankWall;
  const w = plan.width;
  const roofH = Math.ceil(w / 5);
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
        if (side && r >= 30 && r <= 44) m = Material.Glass;
        put(g, x, y, m, wallKind);
      }
      if (ladderDx !== null && k < plan.stories.length - 1) put(g, ladderDx, y, Material.Ladder, wallKind);
    }
    const f = new Furnisher(g, spots, SIDE, w - SIDE, floorTop, wallKind);
    st.furnish(f);
    stories.push({ floorDy: floorTop, seed: { dx: Math.floor(w / 2), dy: floorTop - 2 }, height: st.height });
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
  width: 96,
  cost: { wood: 110 },
  stories: [{ height: STORY, furnish: (f) => { f.bed(8); f.bed(64); f.torch(48, 42); } }]
});

add({
  id: "library",
  name: "Library",
  description: "Bookshelves upstairs for study, an alchemy lab below for creating blueprints.",
  width: 170,
  ladderDx: 158,
  cost: { wood: 420, stone: 40 },
  stories: [
    { height: STORY, furnish: (f) => { f.cauldron(14); f.desk(64); f.torch(46, 42); f.torch(118, 42); } },
    { height: STORY, furnish: (f) => { f.shelf(8); f.shelf(30); f.shelf(52); f.desk(84); f.shelf(116); f.torch(98, 48); } }
  ]
});

add({
  id: "bunkhouse",
  name: "Bunkhouse",
  description: "Two floors of beds: room for four more settlers.",
  width: 100,
  ladderDx: 88,
  cost: { wood: 230 },
  stories: [
    { height: STORY, furnish: (f) => { f.bed(8); f.bed(40); f.torch(36, 42); } },
    { height: STORY, furnish: (f) => { f.bed(8); f.bed(40); f.torch(36, 42); } }
  ]
});

add({
  id: "stoneCottage",
  name: "Stone cottage",
  description: "A fireproof brick home with three beds.",
  width: 124,
  brick: true,
  cost: { stone: 300 },
  stories: [{ height: STORY, furnish: (f) => { f.bed(8); f.bed(50); f.bed(92); f.torch(42, 42); f.torch(84, 42); } }]
});

add({
  id: "grandLibrary",
  name: "Grand library",
  description: "Two floors of stacks over a lab with twin cauldrons.",
  width: 196,
  ladderDx: 184,
  cost: { wood: 700, stone: 80, copper: 15 },
  stories: [
    { height: STORY, furnish: (f) => { f.cauldron(14); f.cauldron(50); f.desk(100); f.torch(40, 42); f.torch(140, 42); } },
    { height: STORY, furnish: (f) => { f.shelf(8); f.shelf(30); f.shelf(52); f.desk(84); f.shelf(120); f.shelf(142); f.torch(112, 48); } },
    { height: STORY, furnish: (f) => { f.shelf(8); f.shelf(30); f.shelf(52); f.shelf(74); f.desk(110); f.shelf(142); f.torch(100, 48); } }
  ]
});

/** Cells in one of each piece of furniture, so rooms can count them. */
export const FURNITURE_CELLS: Record<FurnitureKind, number> = (() => {
  const counts = { bed: 0, shelf: 0, desk: 0, cauldron: 0 } as Record<FurnitureKind, number>;
  for (const kind of Object.keys(counts) as FurnitureKind[]) {
    const g: Grid = new Map();
    const f = new Furnisher(g, [], 0, 100, 100, WallKind.None);
    f[kind](0);
    counts[kind] = g.size;
  }
  return counts;
})();

/** Resource cost of placing one cell of a material (or a back wall). */
export function cellCost(m: Material | null, wall: WallKind): Partial<Record<Resource, number>> {
  const c: Partial<Record<Resource, number>> = {};
  const add = (r: Resource, n: number): void => { c[r] = (c[r] ?? 0) + n; };
  switch (m) {
    case Material.Plank: case Material.Door: case Material.Platform: case Material.Ladder: add("wood", 0.03); break;
    case Material.Thatch: add("wood", 0.012); break;
    case Material.Bookshelf: case Material.Bed: case Material.Desk: add("wood", 0.03); break;
    case Material.Torch: add("wood", 0.5); break;
    case Material.Scaffold: case Material.ScaffoldPole: add("wood", 0.005); break;
    case Material.Brick: add("stone", 0.05); break;
    case Material.Cauldron: add("stone", 0.1); break;
    default: break;
  }
  if (wall === WallKind.PlankWall) add("wood", 0.006);
  if (wall === WallKind.BrickWall) add("stone", 0.008);
  return c;
}
