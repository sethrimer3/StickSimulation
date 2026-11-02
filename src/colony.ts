/**
 * The colony: settlers (each a Stick Ranger body with a name and a role),
 * what they own, what they know, and the jobs that keep them busy.
 *
 *  - Miners sink a laddered shaft level by level and drive tunnels out each
 *    side, carrying what they dig to the yard by the shaft.
 *  - Builders put up buildings from blueprints, cell by cell, bottom-up.
 *  - Woodcutters fell trees and carry logs to the woodpile.
 *  - Scholars read in a library room, earning Knowledge.
 *  - Alchemists turn Knowledge into new blueprints and improvements in a lab.
 *
 * Everyone sleeps at night (in a bed if a home room has one free). DOM-free.
 */
import { BLUEPRINTS, cellCost, type Blueprint, type FurnitureKind } from "./blueprints";
import { Kind, Material, MATERIALS, WallKind, type Resource } from "./materials";
import { Navigator, type NavNode, type Waypoint } from "./nav";
import { PROJECTS, project, type Project } from "./research";
import { checkRoom, type RoomCheck } from "./rooms";
import { Joint, StickBody, type BodyControl } from "./stickman";
import { COLONY_X, groundHeight, LAKE_FROM, LAKE_TO, MINE_X, type Terrain } from "./terrain";
import { fellTree, initialTrees, stampTree, trunkLeft, type TreeState } from "./trees";
import { daylight, DAY_SECONDS, isNight, TICK_HZ } from "./world";

export type Role = "builder" | "miner" | "woodcutter" | "scholar" | "alchemist";
export const ROLES: Role[] = ["builder", "miner", "woodcutter", "scholar", "alchemist"];
export const ROLE_LABEL: Record<Role, string> = {
  builder: "Builder", miner: "Miner", woodcutter: "Woodcutter", scholar: "Scholar", alchemist: "Alchemist"
};
export const RESOURCES: Resource[] = ["wood", "stone", "copper", "silver", "gold", "sand", "dirt"];
/** The order new settlers' roles are picked in, as the colony grows. */
const ROLE_CYCLE: Role[] = ["builder", "miner", "woodcutter", "scholar", "alchemist", "woodcutter", "miner", "scholar", "builder", "miner", "woodcutter", "scholar", "alchemist", "miner", "builder"];

export const YARD_X = MINE_X - 18;
export const WOODPILE_X = COLONY_X - 24;
const CARRY_LIMIT = 12;
/** How far above their feet builders can reach (long-handled tools). */
const BUILD_REACH_UP = 28;
const BUILD_REACH_X = 20;
const BUILD_REACH_DOWN = 20;
/** Empty ground kept between buildings (and their scaffolding). */
const BUILDING_GAP = 36;
/** Rows between scaffold decks. */
const DECK_EVERY = 18;
/** What one dug pixel is worth. */
const YIELD: Amounts = { wood: 0.3, stone: 0.08, copper: 0.5, silver: 0.5, gold: 0.5, sand: 0.08, dirt: 0 };
const ARRIVAL_SECONDS = 90;
const SAVE_VERSION = 3;

type Amounts = Record<Resource, number>;
const emptyAmounts = (): Amounts => ({ wood: 0, stone: 0, copper: 0, silver: 0, gold: 0, sand: 0, dirt: 0 });

// ---- names -------------------------------------------------------------------

const FIRST = ["Ab", "Bel", "Cor", "Dun", "El", "Fen", "Gar", "Hol", "Ivo", "Jun", "Kel", "Lor", "Mab", "Nel", "Ott", "Pim", "Quin", "Ros", "Sib", "Tam", "Ul", "Vin", "Wren", "Yar", "Zel"];
const LAST = ["a", "an", "ric", "wyn", "o", "is", "ette", "ard", "en", "ia", "us", "elle", "ock", "ina", "ey"];

function settlerName(n: number, seed: number): string {
  const h = Math.imul(n + 1, 2654435761) ^ Math.imul(seed, 40503);
  return FIRST[(h >>> 3) % FIRST.length] + LAST[(h >>> 11) % LAST.length];
}

// ---- jobs ----------------------------------------------------------------------

interface CellJob {
  x: number; y: number; m: Material | null; wall: WallKind;
  /** Only place into empty cells (scaffolding). */
  ifEmpty?: boolean;
  /** Take down scaffolding here. */
  unscaffold?: boolean;
}

interface Op {
  kind: "dig" | "place";
  cells: CellJob[];
  /** Bounding box. */
  x0: number; y0: number; x1: number; y1: number;
}

function op(kind: Op["kind"], cells: CellJob[]): Op {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cells) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }
  return { kind, cells, x0, y0, x1, y1 };
}

/** Fittings a dug passage may keep (they don't block the way). */
const FITTING = new Set<Material>([Material.Platform, Material.Ladder, Material.Torch, Material.Scaffold, Material.ScaffoldPole]);
const SCAFFOLD = new Set<Material>([Material.Scaffold, Material.ScaffoldPole]);

function cellDone(t: Terrain, c: CellJob): boolean {
  const cur = t.get(c.x, c.y);
  const info = MATERIALS[cur];
  if (c.unscaffold) return !SCAFFOLD.has(cur);
  // Building over scaffolding waits: the scaffold's removal puts the right material there.
  if (c.m !== null && !c.ifEmpty && SCAFFOLD.has(cur)) return true;
  if (c.m === null) {
    const clear = cur === Material.Empty || !info.diggable || info.kind === Kind.Gas || info.kind === Kind.Liquid || FITTING.has(cur);
    return clear && (c.wall === WallKind.None || t.wall(c.x, c.y) === c.wall);
  }
  if (c.ifEmpty) return cur !== Material.Empty && info.kind !== Kind.Gas;
  return cur === c.m && (c.wall === WallKind.None || t.wall(c.x, c.y) === c.wall);
}

/** Bands of rows and blocks of columns a builder can finish from one spot. */
const BAND = 16;
const BLOCK = 24;

/** Split cells into reach-sized blocks: bands from the bottom up (or top down), blocks left to right. */
function blocks(cells: CellJob[], bottom: number, left: number, upward: boolean): CellJob[][] {
  const groups = new Map<string, { band: number; block: number; cells: CellJob[] }>();
  for (const c of cells) {
    const band = Math.floor((bottom - c.y) / BAND);
    const block = Math.floor((c.x - left) / BLOCK);
    const key = `${band}:${block}`;
    let g = groups.get(key);
    if (!g) { g = { band, block, cells: [] }; groups.set(key, g); }
    g.cells.push(c);
  }
  return [...groups.values()]
    .sort((a, b) => (upward ? a.band - b.band : b.band - a.band) || a.block - b.block)
    .map((g) => g.cells.sort((a, b) => (upward ? b.y - a.y : a.y - b.y) || a.x - b.x));
}

function opDone(t: Terrain, o: Op): boolean {
  return o.cells.every((c) => cellDone(t, c));
}

// ---- tasks -------------------------------------------------------------------

type Task =
  | { kind: "mine"; op: number; phase: "go" | "work"; timer: number; idle: number }
  | { kind: "build"; op: number; phase: "go" | "work"; timer: number; idle: number }
  | { kind: "haul"; to: number; phase: "go" }
  | { kind: "chop"; tree: number; phase: "go" | "work"; timer: number; strikes: number }
  | { kind: "read"; room: number; phase: "goShelf" | "take" | "goDesk" | "read" | "goBack" | "return"; timer: number; shelf: Spot; desk: Spot }
  | { kind: "research"; room: number; phase: "goCauldron" | "stir" | "goDesk" | "write"; timer: number; cauldron: Spot; desk: Spot }
  | { kind: "sleep"; phase: "go" | "rest" }
  | { kind: "idle"; phase: "go" | "wait"; timer: number };

interface Spot { kind: FurnitureKind; x: number; y: number }

export class Settler {
  readonly body: StickBody;
  carry: Amounts = emptyAmounts();
  task: Task | null = null;
  waypoints: Waypoint[] = [];
  private goal: ((n: NavNode) => boolean) | null = null;
  private stuck = 0;
  private best = Infinity;
  /** Set when a path had to be given up on; the colony helps the settler out. */
  failed = false;
  /** Consecutive times this settler couldn't path anywhere. */
  failures = 0;
  /** The last job this settler claimed. */
  lastClaim = "";
  /** Where to stay while working (strikes push the body back a little each time). */
  anchorX: number | null = null;
  replans = 0;
  cooldown = 0;
  activity = "Arriving";
  bed: Spot | null = null;
  relaxed = false;
  /** Holding something to draw (book, log, ore, tool). */
  holding: "none" | "book" | "log" | "ore" | "pick" | "hammer" | "axe" | "flask" = "none";

  constructor(readonly name: string, public role: Role, x: number, y: number) {
    this.body = new StickBody(x, y);
  }

  carried(): number {
    return RESOURCES.reduce((s, r) => s + (r === "dirt" ? 0 : this.carry[r]), 0);
  }

  /** Path to the first node satisfying `goal`. */
  goTo(nav: Navigator, goal: (n: NavNode) => boolean): boolean {
    // Builders may walk on roofs; nobody else does.
    const roofs = this.role === "builder";
    const start = nav.locate(this.body.feetX, this.body.feetY, this.body.climbing, roofs);
    if (!start) return false;
    const path = nav.search(start, goal, undefined, roofs);
    if (!path) return false;
    this.waypoints = Navigator.waypoints(path);
    this.goal = goal;
    this.anchorX = null;
    this.stuck = 0;
    this.best = Infinity;
    return true;
  }

  get arrived(): boolean {
    return this.waypoints.length === 0 && !this.body.climbing;
  }

  stop(): void {
    this.waypoints = [];
    this.goal = null;
  }

  private advance(): void {
    this.waypoints.shift();
    this.best = Infinity;
    this.stuck = 0;
    if (this.waypoints.length === 0) this.replans = 0;
  }

  /** Steer the body along the current path; replans if stuck. */
  control(nav: Navigator): BodyControl {
    const body = this.body;
    const wp = this.waypoints[0];
    if (!wp) {
      // Nothing to do while on a ladder: hold on rather than fall.
      if (body.climbing) return { targetX: null, relaxed: false, climb: { x: body.feetX, y: body.climbFeet } };
      return { targetX: null, relaxed: this.relaxed };
    }
    const tx = wp.x + 0.5;
    // Stuck detection: no progress toward the current waypoint for a few seconds.
    const dist = Math.abs(body.feetX - tx) + Math.abs((body.climbing ? body.climbFeet : body.feetY) - wp.y);
    if (dist < this.best - 0.5) { this.best = dist; this.stuck = 0; }
    else if (++this.stuck > TICK_HZ * 4 && this.goal) {
      this.stuck = 0;
      this.best = Infinity;
      this.replans++;
      if (this.replans > 3 || !this.goTo(nav, this.goal)) { this.stop(); this.task = null; this.replans = 0; this.failed = true; }
      return { targetX: null, relaxed: false };
    }
    if (wp.kind === "walk") {
      // Step off the ladder first (releasing the climb), then walk on.
      if (body.climbing) return { targetX: tx, relaxed: false };
      // The Stick Ranger step rule stops stepping within 2.5 px of the target.
      if (Math.abs(body.feetX - tx) < 2.6 && Math.abs(body.feetY - wp.y) < 10) {
        this.advance();
        return this.control(nav);
      }
      return { targetX: tx, relaxed: false };
    }
    if (!body.climbing && Math.abs(body.feetX - tx) > 3) return { targetX: tx, relaxed: false };
    if (body.climbing && Math.abs(body.climbFeet - wp.y) < 0.3) {
      this.advance();
      return this.control(nav);
    }
    return { targetX: null, relaxed: false, climb: { x: tx, y: wp.y } };
  }
}

// ---- saves -------------------------------------------------------------------

export interface SettlerSave { name: string; role: Role; x: number; y: number; carry: Amounts }
export interface SiteSave { blueprint: string; x: number; y: number; done: boolean }
export interface ColonySave {
  version: number;
  seed: number;
  elapsed: number;
  resources: Amounts;
  knowledge: number;
  known: string[];
  research: { id: string; progress: number } | null;
  chosen: string | null;
  settlers: SettlerSave[];
  sites: SiteSave[];
  trees: TreeState[];
  nextArrival: number;
  hired: number;
  events: string[];
}

export interface Site extends SiteSave {
  ops: Op[];
  cursor: number;
  /** Construction checks since the cursor last moved. */
  stalled?: number;
}

export interface RoomInfo {
  site: number;
  story: number;
  check: RoomCheck;
  spots: Spot[];
}

// ---- the colony -----------------------------------------------------------------

export class Colony {
  readonly nav: Navigator;
  settlers: Settler[] = [];
  sites: Site[] = [];
  trees: TreeState[] = [];
  resources: Amounts = emptyAmounts();
  knowledge = 0;
  known = new Set<string>();
  research: { id: string; progress: number } | null = null;
  /** The player's pick for the next research, if any. */
  chosen: string | null = null;
  elapsed = DAY_SECONDS * 0.12;
  rooms: RoomInfo[] = [];
  events: string[] = [];
  private mineOps: Op[] = [];
  private mineCursor = 0;
  private mineKey = "";
  private claims = new Map<string, string>();
  /** Ops a settler gave up on ("op|name"), skipped by them until the given tick. */
  private blocked = new Map<string, number>();
  private roomVersion = -1;
  private ticks = 0;
  private nextArrival = ARRIVAL_SECONDS;
  private hired = 0;
  seed: number;

  constructor(readonly terrain: Terrain, save?: ColonySave | null) {
    this.nav = new Navigator(terrain);
    this.seed = terrain.seed;
    if (save) this.load(save);
    else this.found();
    this.planMine();
  }

  // ---- setup / saves ---------------------------------------------------------------

  private found(): void {
    const t = this.terrain;
    this.trees = initialTrees(t.seed);
    for (const tree of this.trees) stampTree(t, tree);
    // The campfire: embers in a stone ring.
    const g = groundHeight(COLONY_X, t.seed);
    for (let x = COLONY_X - 5; x <= COLONY_X + 5; x++) t.set(x, g - 1, Material.Hearth);
    t.set(COLONY_X - 6, g - 1, Material.Stone);
    t.set(COLONY_X + 6, g - 1, Material.Stone);
    this.resources.wood = 60;
    for (const role of ["builder", "miner", "woodcutter", "scholar"] as Role[]) this.addSettler(role, COLONY_X - 21 + this.settlers.length * 14);
    this.log("Four settlers made camp by the fire.");
  }

  private addSettler(role: Role, x: number): Settler {
    const name = settlerName(this.hired++, this.seed);
    const s = new Settler(name, role, x, this.terrain.surfaceY(x));
    this.settlers.push(s);
    return s;
  }

  private load(save: ColonySave): void {
    this.elapsed = save.elapsed;
    this.resources = { ...emptyAmounts(), ...save.resources };
    this.knowledge = save.knowledge;
    this.known = new Set(save.known);
    this.research = save.research;
    this.chosen = save.chosen;
    this.trees = save.trees;
    this.nextArrival = save.nextArrival;
    this.hired = save.hired;
    this.events = save.events.slice(-6);
    for (const ss of save.settlers) {
      const s = new Settler(ss.name, ss.role, ss.x, this.terrain.surfaceY(ss.x));
      if (this.terrain.standable(Math.round(ss.x), Math.round(ss.y))) s.body.reset(ss.x, Math.round(ss.y));
      s.carry = { ...emptyAmounts(), ...ss.carry };
      this.settlers.push(s);
    }
    for (const site of save.sites) this.addSite(site.blueprint, site.x, site.y, site.done);
  }

  toSave(): ColonySave {
    return {
      version: SAVE_VERSION,
      seed: this.seed,
      elapsed: this.elapsed,
      resources: this.resources,
      knowledge: this.knowledge,
      known: [...this.known],
      research: this.research,
      chosen: this.chosen,
      settlers: this.settlers.map((s) => ({ name: s.name, role: s.role, x: s.body.feetX, y: Math.round(s.body.feetY), carry: s.carry })),
      sites: this.sites.map((s) => ({ blueprint: s.blueprint, x: s.x, y: s.y, done: s.done })),
      trees: this.trees,
      nextArrival: this.nextArrival,
      hired: this.hired,
      events: this.events
    };
  }

  static validSave(v: unknown): v is ColonySave {
    if (!v || typeof v !== "object") return false;
    const s = v as Partial<ColonySave>;
    return s.version === SAVE_VERSION && typeof s.elapsed === "number" && Array.isArray(s.settlers)
      && Array.isArray(s.sites) && Array.isArray(s.trees) && typeof s.knowledge === "number" && !!s.resources;
  }

  log(message: string): void {
    this.events.push(message);
    if (this.events.length > 6) this.events.shift();
  }

  // ---- queries ---------------------------------------------------------------------

  get population(): number { return this.settlers.length; }

  bedSpots(): Spot[] {
    return this.rooms.filter((r) => r.check.valid && r.check.kind === "home").flatMap((r) => r.spots.filter((s) => s.kind === "bed"));
  }

  maxLevels(): number {
    return 3 + (this.known.has("deepShaft1") ? 3 : 0) + (this.known.has("deepShaft2") ? 4 : 0) + (this.known.has("deepShaft3") ? 3 : 0);
  }

  available(): Project[] {
    return PROJECTS.filter((p) => !this.known.has(p.id) && p.requires.every((r) => this.known.has(r)));
  }

  canAfford(p: Project): boolean {
    if (this.knowledge < p.knowledge) return false;
    return Object.entries(p.resources).every(([r, n]) => this.resources[r as Resource] >= (n ?? 0));
  }

  labRooms(): number[] {
    return this.rooms.map((r, i) => (r.check.valid && r.check.kind === "lab" ? i : -1)).filter((i) => i >= 0);
  }

  libraryRooms(): number[] {
    return this.rooms.map((r, i) => (r.check.valid && r.check.kind === "library" ? i : -1)).filter((i) => i >= 0);
  }

  // ---- research ----------------------------------------------------------------------

  private startResearch(): boolean {
    if (this.research) return true;
    const options = this.available();
    let pick = this.chosen ? options.find((p) => p.id === this.chosen) : undefined;
    if (!pick) pick = options.filter((p) => this.canAfford(p)).sort((a, b) => a.knowledge - b.knowledge)[0];
    if (!pick || !this.canAfford(pick)) return false;
    this.knowledge -= pick.knowledge;
    for (const [r, n] of Object.entries(pick.resources)) this.resources[r as Resource] -= n ?? 0;
    this.research = { id: pick.id, progress: 0 };
    if (this.chosen === pick.id) this.chosen = null;
    this.log(`The alchemists began work on ${pick.name}.`);
    return true;
  }

  private advanceResearch(seconds: number): void {
    if (!this.research) return;
    const p = project(this.research.id);
    if (!p) { this.research = null; return; }
    this.research.progress += seconds * (this.known.has("goldLeaf") ? 2 : 1);
    if (this.research.progress >= p.work) {
      this.known.add(p.id);
      this.research = null;
      this.log(`${p.name} complete!`);
      if (p.id.startsWith("deepShaft") || p.id === "torches") this.planMine();
    }
  }

  // ---- mine plan -----------------------------------------------------------------------

  /** The mine: a laddered shaft with tunnels out either side at each level. */
  private planMine(): void {
    const levels = this.maxLevels();
    const torches = this.known.has("torches");
    const key = `${levels}:${torches}`;
    if (key === this.mineKey) return;
    this.mineKey = key;
    const t = this.terrain;
    const top = groundHeight(MINE_X, t.seed);
    const x0 = MINE_X - 4;
    const x1 = MINE_X + 4;
    const ops: Op[] = [];
    const rect = (ax: number, ay: number, bx: number, by: number, m: Material | null, ifEmpty = false): CellJob[] => {
      const cells: CellJob[] = [];
      for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) cells.push({ x, y, m, wall: WallKind.None, ifEmpty });
      return cells;
    };
    // Surface cover: the shaft's mouth is bridged by platforms.
    ops.push(op("dig", rect(x0, top - 3, x1, top - 1, null)));
    ops.push(op("place", rect(x0, top, x1, top + 1, Material.Platform)));
    const platformRows = new Set<number>([top, top + 1]);
    let y = top + 2;
    for (let k = 0; k < levels; k++) {
      const yf = top + 30 + 28 * k;
      if (yf + 4 >= t.height - 10) break;
      while (y <= yf + 1) {
        const yb = Math.min(y + 5, yf + 1);
        ops.push(op("dig", rect(x0, y, x1, yb, null)));
        const ladder: CellJob[] = [];
        for (let ly = y; ly <= yb; ly++) if (ly < yf) ladder.push({ x: MINE_X, y: ly, m: Material.Ladder, wall: WallKind.None });
        if (ladder.length) ops.push(op("place", ladder));
        y = yb + 1;
      }
      ops.push(op("place", rect(x0, yf, x1, yf + 1, Material.Platform)));
      platformRows.add(yf);
      platformRows.add(yf + 1);
      const reach = 46 + 14 * k;
      for (let d = 4; d <= reach; d += 4) {
        for (const side of [1, -1]) {
          const ax = side > 0 ? x1 + d - 3 : x0 - d;
          const bx = ax + 3;
          ops.push(op("dig", rect(ax, yf - 20, bx, yf - 1, null)));
          ops.push(op("place", rect(ax, yf, bx, yf + 1, Material.Platform, true)));
          if (torches && d % 24 === 0) ops.push(op("place", [{ x: ax + 1, y: yf - 14, m: Material.Torch, wall: WallKind.None, ifEmpty: true }]));
        }
      }
      // The ladder continues down past this level's floor.
      y = yf + 2;
    }
    this.mineOps = ops;
    this.mineCursor = 0;
    this.advanceMineCursor();
  }

  private advanceMineCursor(): void {
    while (this.mineCursor < this.mineOps.length && opDone(this.terrain, this.mineOps[this.mineCursor])) this.mineCursor++;
  }

  get mineProgress(): { done: number; total: number } {
    return { done: this.mineCursor, total: this.mineOps.length };
  }

  // ---- construction -------------------------------------------------------------------

  private addSite(id: string, x: number, y: number, done: boolean): Site | null {
    const bp = BLUEPRINTS[id];
    if (!bp) return null;
    const site: Site = { blueprint: id, x, y, done, ops: done ? [] : this.siteOps(bp, x, y), cursor: 0 };
    this.sites.push(site);
    return site;
  }

  /** Ops to build a blueprint whose ground floor surface is row y, left edge x. */
  private siteOps(bp: Blueprint, x: number, y: number): Op[] {
    const t = this.terrain;
    const oy = y - (bp.height - 2);
    const ops: Op[] = [];
    // Clear trees nearby.
    for (const tree of this.trees) {
      if (!tree.gone && tree.x > x - 18 && tree.x < x + bp.width + 18) tree.gone = true;
    }
    const treeCells: CellJob[] = [];
    for (let ty = oy - 30; ty < y; ty++) {
      for (let tx = x - 20; tx < x + bp.width + 20; tx++) {
        const m = t.get(tx, ty);
        if (m === Material.Bark || m === Material.Leaf) treeCells.push({ x: tx, y: ty, m: null, wall: WallKind.None });
      }
    }
    for (let k = 0; k < treeCells.length; k += 40) ops.push(op("dig", treeCells.slice(k, k + 40)));
    // Foundation: fill under the floor down to solid ground.
    const fill: CellJob[] = [];
    for (let fx = x; fx < x + bp.width; fx++) {
      for (let fy = y + 2; fy < y + 40; fy++) {
        if (t.isSolid(fx, fy)) break;
        fill.push({ x: fx, y: fy, m: Material.Dirt, wall: WallKind.None });
      }
    }
    fill.sort((a, b) => b.y - a.y);
    for (let k = 0; k < fill.length; k += 24) ops.push(op("place", fill.slice(k, k + 24)));
    // Scaffolding: a pole at each end and one inside every storey, decks every
    // DECK_EVERY rows up past the roof's peak. Put up bottom-up first, taken down top-down last.
    const scaffold = this.scaffoldCells(bp, x, y);
    for (const block of blocks(scaffold, y, x, true)) ops.push(op("place", block));
    // The building itself, in reach-sized blocks, band by band from the bottom.
    const cells = bp.cells.map((c) => ({ x: x + c.dx, y: oy + c.dy, m: c.m, wall: c.wall }));
    for (const block of blocks(cells, y + 2, x, true)) ops.push(op("place", block));
    // Taking the scaffold down leaves what the blueprint wants in its place.
    const wanted = new Map<number, CellJob>();
    for (const c of cells) wanted.set(c.y * 8192 + c.x, c);
    const down = scaffold.map((c) => {
      const w = wanted.get(c.y * 8192 + c.x);
      return { x: c.x, y: c.y, m: w?.m ?? null, wall: w?.wall ?? WallKind.None, ifEmpty: false, unscaffold: true };
    });
    // Decks come down first (top-down), then the poles, so there is always a way up.
    const decks = down.filter((c) => scaffold.find((sc) => sc.x === c.x && sc.y === c.y)?.m === Material.Scaffold);
    const poles = down.filter((c) => !decks.includes(c));
    for (const block of blocks(decks, y + 2, x, false)) ops.push(op("dig", block));
    for (const block of blocks(poles, y + 2, x, false)) ops.push(op("dig", block));
    return ops;
  }

  private scaffoldCells(bp: Blueprint, x: number, y: number): CellJob[] {
    const t = this.terrain;
    const oy = y - (bp.height - 2);
    const cells = new Map<number, CellJob>();
    const put = (cx: number, cy: number, m: Material): void => {
      cells.set(cy * 8192 + cx, { x: cx, y: cy, m, wall: WallKind.None, ifEmpty: true });
    };
    const left = x - 6;
    const right = x + bp.width + 5;
    const decks: number[] = [];
    for (let d = y - DECK_EVERY; d > oy - 3; d -= DECK_EVERY) decks.push(d);
    const top = decks[decks.length - 1] ?? y - DECK_EVERY;
    // Outside poles stand on the ground beside the building.
    for (const px of [left + 2, right - 2]) {
      const ground = Math.min(t.surfaceY(px), y + 2);
      for (let py = ground - 1; py >= top; py--) put(px, py, Material.ScaffoldPole);
    }
    // A pole inside each storey, from its floor to its ceiling.
    for (const story of bp.stories) {
      const floor = oy + story.floorDy;
      for (let py = floor - 1; py >= floor - story.height; py--) put(x + 6, py, Material.ScaffoldPole);
    }
    for (const d of decks) for (let cx = left; cx <= right; cx++) put(cx, d, Material.Scaffold);
    return [...cells.values()];
  }

  /** Where a new building of this width can go: nearest level-ish ground to the campfire. */
  private findSiteSpot(bp: Blueprint): { x: number; y: number } | null {
    const t = this.terrain;
    const blocked = (a: number, b: number): boolean => {
      if (a < 12 || b > t.width - 12) return true;
      const overlaps = (lo: number, hi: number): boolean => a < hi && b > lo;
      // Keep well clear of the campfire's flames.
      if (overlaps(COLONY_X - 45, COLONY_X + 45)) return true;
      if (overlaps(MINE_X - 26, MINE_X + 26)) return true;
      if (overlaps(LAKE_FROM - 12, LAKE_TO + 12)) return true;
      if (overlaps(WOODPILE_X - 6, WOODPILE_X + 6)) return true;
      return this.sites.some((s) => overlaps(s.x - BUILDING_GAP, s.x + BLUEPRINTS[s.blueprint].width + BUILDING_GAP));
    };
    for (let d = 0; d < 1000; d += 3) {
      for (const x of [COLONY_X + 16 + d, COLONY_X - 16 - d - bp.width]) {
        if (blocked(x, x + bp.width)) continue;
        const heights: number[] = [];
        for (let k = 0; k < bp.width; k += 2) heights.push(t.surfaceY(x + k));
        heights.sort((a, b) => a - b);
        if (heights[heights.length - 1] - heights[0] > 16) continue;
        return { x, y: heights[Math.floor(heights.length / 2)] };
      }
    }
    return null;
  }

  private nextBuilding(): string | null {
    const built = (id: string): number => this.sites.filter((s) => s.blueprint === id).length;
    const beds = this.sites.reduce((n, s) => n + BLUEPRINTS[s.blueprint].spots.filter((p) => p.kind === "bed").length, 0);
    if (built("cabin") === 0) return "cabin";
    if (built("library") === 0) return "library";
    if (beds < this.population + 1 && beds < 16) {
      if (this.known.has("stoneCottage") && built("stoneCottage") <= built("bunkhouse")) return "stoneCottage";
      if (this.known.has("bunkhouse")) return "bunkhouse";
      return "cabin";
    }
    if (this.known.has("grandLibrary") && built("grandLibrary") === 0) return "grandLibrary";
    return null;
  }

  private manageConstruction(): void {
    const active = this.sites.find((s) => !s.done);
    if (!active) {
      const id = this.nextBuilding();
      if (!id) return;
      const bp = BLUEPRINTS[id];
      const spot = this.findSiteSpot(bp);
      if (!spot) return;
      this.addSite(id, spot.x, spot.y, false);
      this.log(`The builders marked out a ${bp.name.toLowerCase()}.`);
      return;
    }
    const before = active.cursor;
    while (active.cursor < active.ops.length && opDone(this.terrain, active.ops[active.cursor])) active.cursor++;
    active.stalled = active.cursor === before ? (active.stalled ?? 0) + 1 : 0;
    // Safety net: scaffolding nobody can get at for three minutes is knocked out from inside.
    if (active.stalled > (3 * 60 * TICK_HZ) / 25 && active.ops[active.cursor]?.cells.every((c) => c.unscaffold)) {
      for (const o of active.ops.slice(active.cursor)) {
        for (const c of o.cells) {
          if (!SCAFFOLD.has(this.terrain.get(c.x, c.y))) continue;
          this.terrain.set(c.x, c.y, c.m ?? Material.Empty);
          if (c.wall !== WallKind.None) this.terrain.setWall(c.x, c.y, c.wall);
        }
      }
      active.stalled = 0;
    }
    if (active.cursor >= active.ops.length) {
      active.done = true;
      active.ops = [];
      this.log(`The ${BLUEPRINTS[active.blueprint].name.toLowerCase()} is finished!`);
      this.roomVersion = -1;
    }
  }

  get buildProgress(): { name: string; done: number; total: number } | null {
    const s = this.sites.find((x) => !x.done);
    if (!s) return null;
    return { name: BLUEPRINTS[s.blueprint].name, done: s.cursor, total: s.ops.length };
  }

  // ---- rooms ----------------------------------------------------------------------------

  private updateRooms(): void {
    if (this.roomVersion === this.terrain.structureVersion) return;
    this.roomVersion = this.terrain.structureVersion;
    const rooms: RoomInfo[] = [];
    this.sites.forEach((site, si) => {
      if (!site.done) return;
      const bp = BLUEPRINTS[site.blueprint];
      const oy = site.y - (bp.height - 2);
      const box = { x0: site.x - 1, y0: oy - 1, x1: site.x + bp.width, y1: site.y + 2 };
      bp.stories.forEach((story, k) => {
        const check = checkRoom(this.terrain, site.x + story.seed.dx, oy + story.seed.dy, box);
        const spots = bp.spots.filter((p) => p.dy === story.floorDy).map((p) => ({ kind: p.kind, x: site.x + p.dx, y: oy + p.dy }));
        rooms.push({ site: si, story: k, check, spots });
      });
    });
    this.rooms = rooms;
    // Hand out beds.
    const beds = this.bedSpots();
    this.settlers.forEach((s, i) => { s.bed = beds[i] ?? null; });
  }

  // ---- settlers' jobs ---------------------------------------------------------------------

  private claimKey(kind: string, id: number): string { return `${kind}:${id}`; }

  private claim(kind: string, id: number, who: Settler): boolean {
    const key = this.claimKey(kind, id);
    if ((this.blocked.get(`${key}|${who.name}`) ?? 0) > this.ticks) return false;
    const owner = this.claims.get(key);
    if (owner && owner !== who.name) return false;
    this.claims.set(key, who.name);
    who.lastClaim = key;
    return true;
  }

  private release(who: Settler): void {
    for (const [k, v] of this.claims) if (v === who.name) this.claims.delete(k);
  }

  /** A place to stand comfortably within reach of some unfinished cell of the op. */
  private reachGoal(o: Op, rx: number, up: number, down: number): (n: NavNode) => boolean {
    // Leave a margin: the body never stands exactly where the plan says.
    rx = Math.max(4, rx - 4);
    up = Math.max(4, up - 6);
    down = Math.max(4, down - 4);
    const pending = o.cells.filter((c) => !cellDone(this.terrain, c));
    const sample = pending.length > 64 ? pending.filter((_, i) => i % Math.ceil(pending.length / 64) === 0) : pending;
    return (n) => {
      if (n.climb) return false;
      for (const c of sample) {
        const dy = c.y - n.y;
        if (Math.abs(c.x - n.x) <= rx && dy >= -up && dy <= down) return true;
      }
      return false;
    };
  }

  private standNear(x: number, y: number, rx: number, ry = 6): (n: NavNode) => boolean {
    return (n) => !n.climb && Math.abs(n.x - x) <= rx && Math.abs(n.y - y) <= ry;
  }

  /** The resource a cell is short of, or null if it can be paid for. */
  private shortOf(m: Material | null, wall: WallKind, current: Material, currentWall: WallKind): Resource | null {
    const cost = cellCost(current === m ? null : m, currentWall === wall ? WallKind.None : wall);
    for (const [r, n] of Object.entries(cost)) if (this.resources[r as Resource] < (n ?? 0)) return r as Resource;
    return null;
  }

  /** Spend resources for a cell, or report that there isn't enough. */
  private pay(m: Material | null, wall: WallKind, current: Material, currentWall: WallKind): boolean {
    if (this.shortOf(m, wall, current, currentWall)) return false;
    const cost = cellCost(current === m ? null : m, currentWall === wall ? WallKind.None : wall);
    for (const [r, n] of Object.entries(cost)) this.resources[r as Resource] -= n ?? 0;
    return true;
  }

  /** What an op is waiting for, if it can't be finished with what the colony has. */
  private opShortOf(o: Op): Resource | null {
    const need: Partial<Amounts> = {};
    for (const c of o.cells) {
      if (cellDone(this.terrain, c)) continue;
      const cur = this.terrain.get(c.x, c.y);
      const cost = cellCost(cur === c.m ? null : c.m, this.terrain.wall(c.x, c.y) === c.wall ? WallKind.None : c.wall);
      for (const [r, n] of Object.entries(cost)) need[r as Resource] = (need[r as Resource] ?? 0) + (n ?? 0);
    }
    for (const [r, n] of Object.entries(need)) if (this.resources[r as Resource] < (n ?? 0)) return r as Resource;
    return null;
  }

  /** Work on an op's cells nearest the settler; returns cells changed, or -1 if short of materials. */
  private workOp(s: Settler, o: Op, count: number, digInto: Amounts | null, reach: { x: number; up: number; down: number }): number {
    const t = this.terrain;
    const fx = s.body.feetX;
    const fy = s.body.feetY;
    // Only what is within arm's (or pick's) reach.
    const pending = o.cells.filter((c) => !cellDone(t, c)
      && Math.abs(c.x - fx) <= reach.x + 2 && fy - c.y <= reach.up + 2 && c.y - fy <= reach.down + 2);
    pending.sort((a, b) => Math.abs(a.x - fx) + Math.abs(a.y - (fy - 8)) - (Math.abs(b.x - fx) + Math.abs(b.y - (fy - 8))));
    let n = 0;
    for (const c of pending.slice(0, count)) {
      const cur = t.get(c.x, c.y);
      const info = MATERIALS[cur];
      if (c.unscaffold) {
        if (SCAFFOLD.has(cur)) {
          if (c.m !== null && !this.pay(c.m, c.wall, Material.Empty, t.wall(c.x, c.y))) return n > 0 ? n : -1;
          t.set(c.x, c.y, c.m ?? Material.Empty);
          if (c.wall !== WallKind.None) t.setWall(c.x, c.y, c.wall);
        }
      } else if (c.m === null) {
        if (cur !== Material.Empty && info.diggable && info.kind !== Kind.Gas && info.kind !== Kind.Liquid && !FITTING.has(cur)) {
          if (info.yields && digInto) digInto[info.yields] += YIELD[info.yields];
          else if (info.yields) this.resources[info.yields] += YIELD[info.yields];
          t.set(c.x, c.y, Material.Empty);
        }
        if (c.wall !== WallKind.None && t.wall(c.x, c.y) !== c.wall) {
          if (!this.pay(null, c.wall, cur, t.wall(c.x, c.y))) return n > 0 ? n : -1;
          t.setWall(c.x, c.y, c.wall);
        }
      } else {
        if (cur === Material.Bedrock || (c.ifEmpty && cur !== Material.Empty) || (!c.ifEmpty && SCAFFOLD.has(cur))) continue;
        if (!this.pay(c.m, c.wall, cur, t.wall(c.x, c.y))) return n > 0 ? n : -1;
        if (cur !== c.m) t.set(c.x, c.y, c.m);
        if (c.wall !== WallKind.None) t.setWall(c.x, c.y, c.wall);
      }
      n++;
    }
    return n;
  }

  private chooseTask(s: Settler): void {
    if (s.failed) {
      // Whatever they were heading for couldn't be reached: leave it for a minute.
      if (s.lastClaim) this.blocked.set(`${s.lastClaim}|${s.name}`, this.ticks + TICK_HZ * 60);
      this.unstick(s);
    }
    s.relaxed = false;
    s.holding = "none";
    if (isNight(this.elapsed)) { s.task = { kind: "sleep", phase: "go" }; return; }
    if (s.cooldown > 0) { this.idle(s); return; }
    switch (s.role) {
      case "miner":
        if (s.carried() >= CARRY_LIMIT) { this.haul(s, YARD_X); return; }
        if (this.mineTask(s)) return;
        if (s.carried() > 0) { this.haul(s, YARD_X); return; }
        break;
      case "builder":
        if (this.buildTask(s)) return;
        if (s.activity === "Waiting for wood" && this.chopTask(s)) { s.activity = "Chopping wood for the build"; return; }
        break;
      case "woodcutter":
        if (s.carry.wood > 0) { this.haul(s, WOODPILE_X); return; }
        // With plenty of wood in store, lend the builders a hand.
        if (this.resources.wood > 400 && this.buildTask(s)) { s.activity = "Helping build"; return; }
        if (this.chopTask(s)) return;
        break;
      case "scholar":
        if (this.readTask(s)) return;
        if (s.carry.wood > 0) { this.haul(s, WOODPILE_X); return; }
        if (this.buildTask(s)) { s.activity = "Helping build (no library yet)"; return; }
        if (this.chopTask(s)) { s.activity = "Chopping wood (no library yet)"; return; }
        break;
      case "alchemist":
        if (this.researchTask(s)) return;
        if (s.carry.wood > 0) { this.haul(s, WOODPILE_X); return; }
        if (this.buildTask(s)) { s.activity = "Helping build"; return; }
        if (this.chopTask(s)) { s.activity = this.labRooms().length ? "Chopping wood (nothing to research)" : "Chopping wood (no lab yet)"; return; }
        break;
    }
    this.idle(s);
  }

  private idle(s: Settler): void {
    const x = COLONY_X + Math.round((Math.random() - 0.5) * 70);
    if (s.goTo(this.nav, this.standNear(x, groundHeight(x, this.seed), 4, 12))) {
      s.task = { kind: "idle", phase: "go", timer: 0 };
      s.activity = "Wandering";
      s.failures = 0;
    } else {
      s.task = { kind: "idle", phase: "wait", timer: TICK_HZ * 3 };
      s.activity = "Resting";
      // Can't get anywhere from here (fell into a hole, boxed in): climb out.
      if (++s.failures >= 3 || s.failed) this.unstick(s);
    }
  }

  /** Put a settler who can't path anywhere at the nearest spot a stickman can stand. */
  private unstick(s: Settler): void {
    const t = this.terrain;
    const fx = Math.round(s.body.feetX);
    const fy = Math.round(s.body.feetY);
    for (let r = 1; r < 60; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (const dx of [-r, r, ...Array.from({ length: 2 * r - 1 }, (_, k) => k - r + 1)]) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = fx + dx;
          const y = fy + dy;
          if (!t.standable(x, y)) continue;
          // Prefer somewhere that connects to the colony.
          const start = { x, y, climb: false };
          if (!this.nav.search(start, (n) => Math.abs(n.x - COLONY_X) < 40 && Math.abs(n.y - groundHeight(COLONY_X, this.seed)) < 6, 40000)) continue;
          s.body.reset(x + 0.5, y);
          s.failures = 0;
          s.failed = false;
          s.activity = "Climbed out";
          return;
        }
      }
    }
    s.body.reset(COLONY_X, t.surfaceY(COLONY_X));
    s.failures = 0;
    s.failed = false;
  }

  private haul(s: Settler, x: number): void {
    if (s.goTo(this.nav, this.standNear(x, groundHeight(x, this.seed), 3, 8))) {
      s.task = { kind: "haul", to: x, phase: "go" };
      s.activity = x === YARD_X ? "Carrying ore up" : "Carrying logs";
      s.holding = x === YARD_X ? "ore" : "log";
    } else {
      this.idle(s);
    }
  }

  private mineTask(s: Settler): boolean {
    this.advanceMineCursor();
    for (let k = this.mineCursor; k < Math.min(this.mineOps.length, this.mineCursor + 8); k++) {
      const o = this.mineOps[k];
      if (opDone(this.terrain, o) || !this.claim("mine", k, s)) continue;
      if (o.kind === "place" && this.resources.wood < 2) { this.release(s); s.activity = "Waiting for wood"; return false; }
      if (s.goTo(this.nav, this.reachGoal(o, 9, 24, 7))) {
        s.task = { kind: "mine", op: k, phase: "go", timer: 0, idle: 0 };
        s.activity = o.kind === "dig" ? (o.y0 > groundHeight(MINE_X, this.seed) + 8 ? "Digging" : "Opening the shaft") : "Fitting ladders and platforms";
        s.holding = "pick";
        return true;
      }
      this.claims.delete(this.claimKey("mine", k));
    }
    s.activity = this.mineCursor >= this.mineOps.length ? "The mine is dug out" : "Can't reach the face";
    return false;
  }

  private buildTask(s: Settler): boolean {
    const si = this.sites.findIndex((x) => !x.done);
    if (si < 0) { s.activity = "Nothing to build"; return false; }
    const site = this.sites[si];
    let short: Resource | null = null;
    for (let k = site.cursor; k < Math.min(site.ops.length, site.cursor + 8); k++) {
      const o = site.ops[k];
      if (opDone(this.terrain, o)) continue;
      const missing = this.opShortOf(o);
      if (missing) { short = short ?? missing; continue; }
      if (!this.claim(`site${si}`, k, s)) continue;
      if (s.goTo(this.nav, this.reachGoal(o, BUILD_REACH_X, BUILD_REACH_UP, BUILD_REACH_DOWN))) {
        s.task = { kind: "build", op: k, phase: "go", timer: 0, idle: 0 };
        s.activity = `Building the ${BLUEPRINTS[site.blueprint].name.toLowerCase()}`;
        s.holding = "hammer";
        return true;
      }
      this.claims.delete(this.claimKey(`site${si}`, k));
    }
    if (short) s.activity = `Waiting for ${short}`;
    return false;
  }

  private chopTask(s: Settler): boolean {
    const t = this.terrain;
    const order = this.trees
      .map((tree, i) => ({ tree, i }))
      .filter(({ tree }) => !tree.gone && tree.growth >= 1 && trunkLeft(t, tree) > 0.6)
      .sort((a, b) => Math.abs(a.tree.x - s.body.feetX) - Math.abs(b.tree.x - s.body.feetX));
    for (const { tree, i } of order.slice(0, 4)) {
      if (!this.claim("tree", i, s)) continue;
      const base = groundHeight(tree.x, t.seed);
      const side = s.body.feetX < tree.x ? -5 : 5;
      if (s.goTo(this.nav, this.standNear(tree.x + side, base, 2, 6))) {
        s.task = { kind: "chop", tree: i, phase: "go", timer: 0, strikes: 0 };
        s.activity = "Felling a tree";
        s.holding = "axe";
        return true;
      }
      this.claims.delete(this.claimKey("tree", i));
    }
    return false;
  }

  private readTask(s: Settler): boolean {
    const libs = this.libraryRooms();
    if (!libs.length) { s.activity = "No library to study in"; return false; }
    const room = libs[Math.floor(Math.random() * libs.length)];
    const spots = this.rooms[room].spots;
    const shelves = spots.filter((p) => p.kind === "shelf");
    const desks = spots.filter((p) => p.kind === "desk");
    if (!shelves.length) return false;
    const shelf = shelves[Math.floor(Math.random() * shelves.length)];
    const desk = desks.length ? desks[Math.floor(Math.random() * desks.length)] : shelf;
    if (!s.goTo(this.nav, this.standNear(shelf.x, shelf.y, 2, 2))) return false;
    s.task = { kind: "read", room, phase: "goShelf", timer: 0, shelf, desk };
    s.activity = "Fetching a book";
    return true;
  }

  private researchTask(s: Settler): boolean {
    const labs = this.labRooms();
    if (!labs.length) return false;
    if (!this.startResearch()) { s.activity = "Waiting for Knowledge"; return false; }
    const room = labs[Math.floor(Math.random() * labs.length)];
    const spots = this.rooms[room].spots;
    const cauldrons = spots.filter((p) => p.kind === "cauldron");
    const desks = spots.filter((p) => p.kind === "desk");
    if (!cauldrons.length) return false;
    const cauldron = cauldrons[Math.floor(Math.random() * cauldrons.length)];
    const desk = desks[0] ?? cauldron;
    if (!s.goTo(this.nav, this.standNear(cauldron.x + 6, cauldron.y, 2, 2))) return false;
    s.task = { kind: "research", room, phase: "goCauldron", timer: 0, cauldron, desk };
    s.activity = `Researching ${project(this.research!.id)?.name ?? ""}`;
    s.holding = "flask";
    return true;
  }

  private endTask(s: Settler, cooldown = 0): void {
    s.anchorX = null;
    this.release(s);
    s.task = null;
    s.stop();
    s.cooldown = cooldown;
  }

  /** Run one settler's current task for a tick. */
  private runTask(s: Settler): void {
    const task = s.task;
    if (!task) return;
    const t = this.terrain;
    if (task.kind !== "sleep" && isNight(this.elapsed)) { this.endTask(s); return; }
    switch (task.kind) {
      case "idle":
        if (task.phase === "go") { if (s.arrived) { task.phase = "wait"; task.timer = TICK_HZ * (3 + Math.random() * 5); } }
        else if (--task.timer <= 0) this.endTask(s);
        break;
      case "haul":
        if (s.arrived) {
          for (const r of Object.keys(s.carry) as Resource[]) {
            if (r !== "dirt") this.resources[r] += s.carry[r];
            s.carry[r] = 0;
          }
          this.endTask(s);
        }
        break;
      case "mine":
      case "build": {
        const list = task.kind === "mine" ? this.mineOps : this.sites.find((x) => !x.done)?.ops;
        const o = list?.[task.op];
        if (!o || opDone(t, o)) { this.endTask(s); break; }
        if (task.phase === "go") { if (s.arrived) { task.phase = "work"; s.anchorX = s.body.feetX; } break; }
        const every = task.kind === "mine" ? (this.known.has("copperPicks") ? 9 : 14) : 10;
        if (++task.timer % every !== 0) break;
        const target = { x: (o.x0 + o.x1) / 2, y: (o.y0 + o.y1) / 2 };
        if (s.body.airborne === 0) s.body.strike(target.x);
        const changed = task.kind === "mine"
          ? this.workOp(s, o, 8, s.carry, { x: 9, up: 24, down: 7 })
          : this.workOp(s, o, 32, null, { x: BUILD_REACH_X, up: BUILD_REACH_UP, down: BUILD_REACH_DOWN });
        if (changed < 0) {
          s.activity = task.kind === "mine" ? "Waiting for wood" : `Waiting for ${this.opShortOf(o) ?? "materials"}`;
          this.endTask(s, TICK_HZ * 4);
          break;
        }
        task.idle = changed === 0 ? task.idle + 1 : 0;
        // Nothing left within reach from here: move on to where there is.
        if (task.idle > (task.kind === "build" ? 0 : 4)) {
          // Out of reach from here (fell, or the face moved): walk again.
          if (s.goTo(this.nav, this.reachGoal(o, task.kind === "mine" ? 9 : BUILD_REACH_X, task.kind === "mine" ? 24 : BUILD_REACH_UP, task.kind === "mine" ? 7 : BUILD_REACH_DOWN))) {
            task.phase = "go";
            task.idle = 0;
          } else this.endTask(s, TICK_HZ * 2);
        }
        if (task.kind === "mine" && s.carried() >= CARRY_LIMIT) this.endTask(s);
        break;
      }
      case "chop": {
        const tree = this.trees[task.tree];
        if (!tree || tree.gone || tree.growth < 1) { this.endTask(s); break; }
        if (task.phase === "go") { if (s.arrived) { task.phase = "work"; s.anchorX = s.body.feetX; } break; }
        if (++task.timer % 22 !== 0) break;
        s.body.strike(tree.x);
        const hand = s.body.p[Joint.HandR];
        if (t.get(hand.x, hand.y) === Material.Empty && Math.random() < 0.5) t.set(hand.x, hand.y - 1, Material.Sawdust);
        if (++task.strikes >= 10) {
          s.carry.wood += fellTree(t, tree);
          tree.growth = -60 - Math.random() * 60;
          this.endTask(s);
        }
        break;
      }
      case "read": {
        const knowledgeMult = this.known.has("silverQuills") ? 1.5 : 1;
        if (!this.rooms[task.room]?.check.valid) { this.endTask(s); break; }
        switch (task.phase) {
          case "goShelf":
            if (s.arrived) { task.phase = "take"; task.timer = TICK_HZ * 1.5; s.body.strike(task.shelf.x); }
            break;
          case "take":
            if (--task.timer <= 0) {
              s.holding = "book";
              if (s.goTo(this.nav, this.standNear(task.desk.x, task.desk.y, 3, 2))) { task.phase = "goDesk"; s.activity = "Reading"; }
              else { task.phase = "read"; task.timer = TICK_HZ * 12; }
            }
            break;
          case "goDesk":
            if (s.arrived) { task.phase = "read"; task.timer = TICK_HZ * 12; }
            break;
          case "read":
            if (--task.timer <= 0) {
              const shelves = this.rooms[task.room].check.shelves;
              this.knowledge += (1 + 0.25 * shelves) * knowledgeMult;
              if (s.goTo(this.nav, this.standNear(task.shelf.x, task.shelf.y, 2, 2))) { task.phase = "goBack"; s.activity = "Returning a book"; }
              else this.endTask(s);
            }
            break;
          case "goBack":
            if (s.arrived) { task.phase = "return"; task.timer = TICK_HZ; s.body.strike(task.shelf.x); }
            break;
          case "return":
            if (--task.timer <= 0) { s.holding = "none"; this.endTask(s); }
            break;
        }
        break;
      }
      case "research": {
        if (!this.rooms[task.room]?.check.valid || !this.research) { this.endTask(s); break; }
        switch (task.phase) {
          case "goCauldron":
            if (s.arrived) { task.phase = "stir"; task.timer = TICK_HZ * 8; }
            break;
          case "stir":
            if (task.timer % 25 === 0) s.body.strike(task.cauldron.x);
            this.advanceResearch(1 / TICK_HZ);
            if (--task.timer <= 0) {
              if (s.goTo(this.nav, this.standNear(task.desk.x, task.desk.y, 3, 2))) { task.phase = "goDesk"; s.activity = "Writing up notes"; }
              else this.endTask(s);
            }
            break;
          case "goDesk":
            if (s.arrived) { task.phase = "write"; task.timer = TICK_HZ * 6; }
            break;
          case "write":
            this.advanceResearch(1 / TICK_HZ);
            if (--task.timer <= 0) this.endTask(s);
            break;
        }
        break;
      }
      case "sleep":
        if (!isNight(this.elapsed)) { s.relaxed = false; this.endTask(s); break; }
        if (task.phase === "go") {
          if (s.waypoints.length === 0 && !s.relaxed && s.activity !== "Heading to bed") {
            const bed = s.bed;
            const x = bed ? bed.x : COLONY_X + (this.settlers.indexOf(s) % 2 ? 1 : -1) * (14 + (this.settlers.indexOf(s) * 5) % 20);
            const y = bed ? bed.y : groundHeight(x, this.seed);
            if (!s.goTo(this.nav, this.standNear(x, y, 3, 3))) { task.phase = "rest"; s.relaxed = true; }
            s.activity = "Heading to bed";
          } else if (s.arrived) {
            task.phase = "rest";
            s.relaxed = true;
            s.activity = s.bed ? "Asleep in bed" : "Asleep by the fire";
          }
        }
        break;
    }
  }

  // ---- the tick ---------------------------------------------------------------------------

  /** One fixed tick (1/50 s). */
  step(): void {
    const dt = 1 / TICK_HZ;
    this.elapsed += dt;
    this.ticks++;
    if (this.ticks % 25 === 0) {
      this.manageConstruction();
      this.updateRooms();
      this.growTrees(25 * dt);
      this.arrivals(25 * dt);
    }
    for (const s of this.settlers) {
      if (s.cooldown > 0) s.cooldown--;
      if (!s.task) this.chooseTask(s);
      // Left hanging on a ladder with nowhere to go: climb to the nearest place to stand.
      if (s.task && s.waypoints.length === 0 && s.body.climbing && s.task.kind !== "sleep") s.goTo(this.nav, (n) => !n.climb);
      this.runTask(s);
      const control = s.control(this.nav);
      // Hold position while working.
      if (s.anchorX !== null && control.targetX === null && !control.climb && !control.relaxed && s.waypoints.length === 0) control.targetX = s.anchorX;
      if (s.task?.kind === "sleep" && s.task.phase === "rest") { control.relaxed = true; control.targetX = null; }
      s.body.tick(this.terrain, control);
      this.rescue(s);
    }
  }

  /** A body that fell out of the world or got buried is set back on its feet. */
  private rescue(s: Settler): void {
    const b = s.body;
    const t = this.terrain;
    const buried = [Joint.Waist, Joint.FootL, Joint.FootR].filter((j) => t.isSolid(b.p[j].x, b.p[j].y)).length;
    if (buried >= 2 && !b.climbing) {
      for (let i = 0; i < b.p.length; i++) { b.p[i].y -= 1; b.prev[i].y -= 1; }
    }
    if (!b.isFinite() || b.feetY > this.terrain.height - 2 || b.feetX < 1 || b.feetX > this.terrain.width - 2) {
      const x = COLONY_X;
      b.reset(x, this.terrain.surfaceY(x));
      this.endTask(s);
    }
  }

  private growTrees(seconds: number): void {
    for (const tree of this.trees) {
      if (tree.gone || tree.growth >= 1) continue;
      if (tree.growth < 0) { tree.growth = Math.min(0, tree.growth + seconds); continue; }
      tree.growth = Math.min(1, tree.growth + seconds / 120);
      stampTree(this.terrain, tree, tree.growth);
    }
  }

  private arrivals(seconds: number): void {
    const cap = Math.max(4, this.bedSpots().length);
    if (this.population >= cap) { this.nextArrival = ARRIVAL_SECONDS; return; }
    this.nextArrival -= seconds;
    if (this.nextArrival > 0) return;
    this.nextArrival = ARRIVAL_SECONDS;
    const counts = new Map<Role, number>();
    for (const s of this.settlers) counts.set(s.role, (counts.get(s.role) ?? 0) + 1);
    const want = ROLE_CYCLE.slice(0, this.population + 1);
    let role: Role = "miner";
    for (const r of ROLES) {
      const target = want.filter((x) => x === r).length;
      if ((counts.get(r) ?? 0) < target) { role = r; break; }
    }
    const x = Math.random() < 0.5 ? COLONY_X - 150 : COLONY_X + 260;
    const s = this.addSettler(role, x);
    this.log(`${s.name} arrived and became ${role === "alchemist" ? "an" : "a"} ${ROLE_LABEL[role].toLowerCase()}.`);
    this.roomVersion = -1;
  }

  setRole(name: string, role: Role): void {
    const s = this.settlers.find((x) => x.name === name);
    if (!s || s.role === role) return;
    s.role = role;
    this.endTask(s);
    s.relaxed = false;
  }

  /** Daylight 0..1 for the current time. */
  get daylight(): number { return daylight(this.elapsed); }
}

