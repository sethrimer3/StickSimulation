/**
 * The world: one material per pixel in a large Terraria-style side view,
 * plus a back-wall layer behind it. Simulated falling-sand style (powders
 * pile, liquids spread, gases rise, flammable things burn), but only in
 * 16 × 16 chunks that are awake, so a big world stays cheap.
 * DOM-free; stepped at the physics rate.
 */
import { hash2 } from "./pixels";
import { Kind, Material, MATERIALS, MATERIAL_LIST, WallKind } from "./materials";

export { Material, WallKind } from "./materials";

export const WORLD_W = 1024;
export const WORLD_H = 512;
export const CHUNK = 16;
const CW = WORLD_W / CHUNK;
const CH = WORLD_H / CHUNK;
const W = WORLD_W;
const H = WORLD_H;

/** Fixed places in the generated world. */
export const SURFACE_Y = 200;
export const COLONY_X = 520;
export const FLAT_FROM = 420;
export const FLAT_TO = 712;
export const MINE_X = 690;
export const LAKE_FROM = 286;
export const LAKE_TO = 372;
export const LAKE_LEVEL = 203;
/** Body headroom (pixels above the feet that must be clear to stand). */
export const HEADROOM = 16;

const KIND = MATERIAL_LIST.map((m) => MATERIALS[m].kind);
const DENSITY = MATERIAL_LIST.map((m) => MATERIALS[m].density);
const BODY_SOLID = MATERIAL_LIST.map((m) => MATERIALS[m].bodySolid);
const ONE_WAY = MATERIAL_LIST.map((m) => MATERIALS[m].oneWay);
const FLAMMABILITY = MATERIAL_LIST.map((m) => MATERIALS[m].flammability);
const SOAKS = MATERIAL_LIST.map((m) => m === Material.Dirt || m === Material.Grass || m === Material.Ash || FLAMMABILITY[m] > 0);

// ---- noise -----------------------------------------------------------------

function smooth(t: number): number { return t * t * (3 - 2 * t); }

function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = smooth(x - i);
  return hash2(i, seed) * (1 - f) + hash2(i + 1, seed) * f;
}

function noise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash2(ix + seed * 131, iy) * (1 - fx) + hash2(ix + 1 + seed * 131, iy) * fx;
  const b = hash2(ix + seed * 131, iy + 1) * (1 - fx) + hash2(ix + 1 + seed * 131, iy + 1) * fx;
  return a * (1 - fy) + b * fy;
}

const heightCache = new Map<number, Int16Array>();

/** Natural ground height before any digging or building (smoothed so walkers can climb it). */
export function groundHeight(x: number, seed = 1): number {
  let table = heightCache.get(seed);
  if (!table) {
    table = new Int16Array(W);
    for (let i = 0; i < W; i++) table[i] = rawHeight(i, seed);
    // No column may step more than 2 pixels from its neighbour.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < W; i++) table[i] = Math.max(table[i - 1] - 2, Math.min(table[i - 1] + 2, table[i]));
      for (let i = W - 2; i >= 0; i--) table[i] = Math.max(table[i + 1] - 2, Math.min(table[i + 1] + 2, table[i]));
    }
    heightCache.set(seed, table);
  }
  return table[Math.max(0, Math.min(W - 1, Math.round(x)))];
}

function rawHeight(x: number, seed: number): number {
  const hills = (noise1(x / 90, seed) - 0.5) * 46 + (noise1(x / 23, seed + 7) - 0.5) * 9;
  let flatness = 0;
  if (x > FLAT_FROM - 40 && x < FLAT_TO + 40) {
    flatness = Math.min(1, Math.min(x - (FLAT_FROM - 40), FLAT_TO + 40 - x) / 40);
  }
  let y = SURFACE_Y + hills * (1 - flatness);
  if (x > LAKE_FROM - 30 && x < LAKE_TO + 30) {
    const t = Math.min(1, Math.min(x - (LAKE_FROM - 30), LAKE_TO + 30 - x) / 30);
    y = y * (1 - t) + SURFACE_Y * t;
    if (x >= LAKE_FROM && x <= LAKE_TO) {
      const u = (x - LAKE_FROM) / (LAKE_TO - LAKE_FROM);
      y += Math.sin(u * Math.PI) * 22;
    }
  }
  return Math.round(y);
}

export interface Environment {
  /** -1..1, sideways "gravity" bias from tilting the frame. */
  tilt: number;
  /** 0..1 sunlight, drives evaporation. */
  daylight: number;
}

interface Spring { x: number; y: number; top: number }

export class Terrain {
  readonly width = W;
  readonly height = H;
  readonly cells = new Uint8Array(W * H);
  /** Back walls (WallKind) behind each cell. */
  readonly walls = new Uint8Array(W * H);
  /** Color shade 0..3 per cell, kept when a grain moves. */
  readonly shade = new Uint8Array(W * H);
  /** Gas lifetime, or remaining burn time for a burning cell (0 = not burning). */
  readonly life = new Uint16Array(W * H);
  private readonly moved = new Uint8Array(W * H);
  private awake = new Uint8Array(CW * CH);
  private nextAwake = new Uint8Array(CW * CH);
  private tickId = 1;
  /** Bumped whenever a static (structural) cell or wall changes; rooms recheck on change. */
  structureVersion = 0;
  /** Bumped when the whole grid is replaced. */
  revision = 0;
  seed = 1;
  readonly springs: Spring[] = [];

  constructor(seed = 1) {
    this.generate(seed);
  }

  // ---- generation ----------------------------------------------------------

  generate(seed: number): void {
    this.seed = seed;
    const { cells, walls, shade } = this;
    cells.fill(0);
    walls.fill(0);
    this.life.fill(0);
    this.springs.length = 0;
    for (let x = 0; x < W; x++) {
      const top = groundHeight(x, seed);
      const dirtDepth = 22 + Math.round(noise1(x / 17, seed + 3) * 12);
      for (let y = top; y < H; y++) {
        const i = y * W + x;
        const depth = y - top;
        let m: Material;
        if (y >= H - 4 - Math.round(hash2(x, seed) * 3)) m = Material.Bedrock;
        else if (depth < 2) m = Material.Grass;
        else if (depth < dirtDepth) m = Material.Dirt;
        else m = Material.Stone;
        if (m === Material.Dirt && noise2(x / 9, y / 7, seed + 11) > 0.83) m = Material.Sand;
        if (m === Material.Stone) {
          if (depth > 30 && depth < 150 && noise2(x / 6, y / 5, seed + 17) > 0.86) m = Material.CopperOre;
          else if (depth > 110 && depth < 240 && noise2(x / 5, y / 5, seed + 23) > 0.89) m = Material.SilverOre;
          else if (depth > 200 && noise2(x / 4, y / 4, seed + 29) > 0.91) m = Material.GoldOre;
        }
        cells[i] = m;
        if (depth > 3) walls[i] = depth < dirtDepth + 2 ? WallKind.DirtWall : WallKind.StoneWall;
      }
    }
    // Caves: winding noise tunnels in the stone, kept away from the mine shaft.
    for (let y = 0; y < H - 8; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (cells[i] !== Material.Stone && cells[i] !== Material.CopperOre) continue;
        if (Math.abs(x - MINE_X) < 40) continue;
        const depth = y - groundHeight(x, seed);
        if (depth < 45) continue;
        const n = noise2(x / 34, y / 16, seed + 41) * 0.65 + noise2(x / 11, y / 9, seed + 43) * 0.35;
        if (Math.abs(n - 0.5) < 0.035) cells[i] = Material.Empty;
      }
    }
    // The lake: water over a stone and sand bed, kept topped up by a spring.
    for (let x = LAKE_FROM; x <= LAKE_TO; x++) {
      const top = groundHeight(x, seed);
      for (let y = LAKE_LEVEL; y < top; y++) cells[y * W + x] = Material.Water;
      for (let y = top; y < top + 3; y++) cells[y * W + x] = y === top ? Material.Sand : Material.Stone;
    }
    this.addLakeSpring();
    for (let i = 0; i < W * H; i++) shade[i] = (hash2(i % W, (i / W) | 0) * 4) | 0;
    this.awake.fill(1);
    this.nextAwake.fill(1);
    this.structureVersion++;
    this.revision++;
  }

  private addLakeSpring(): void {
    this.springs.length = 0;
    const lakeMid = Math.round((LAKE_FROM + LAKE_TO) / 2);
    this.springs.push({ x: lakeMid, y: groundHeight(lakeMid, this.seed) - 1, top: LAKE_LEVEL });
  }

  // ---- queries -----------------------------------------------------------

  index(x: number, y: number): number {
    return Math.floor(y) * W + Math.floor(x);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < W && y < H;
  }

  get(x: number, y: number): Material {
    if (!this.inBounds(x, y)) return Material.Bedrock;
    return this.cells[this.index(x, y)] as Material;
  }

  wall(x: number, y: number): WallKind {
    if (!this.inBounds(x, y)) return WallKind.None;
    return this.walls[this.index(x, y)] as WallKind;
  }

  /** Solid for the stickman's body (one-way platforms excluded). */
  isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= W || y >= H) return true;
    if (y < 0) return false;
    return BODY_SOLID[this.cells[this.index(x, y)]];
  }

  isOneWay(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return ONE_WAY[this.cells[this.index(x, y)]];
  }

  isLadder(x: number, y: number): boolean {
    return this.get(x, y) === Material.Ladder;
  }

  isWater(x: number, y: number): boolean {
    return this.get(x, y) === Material.Water;
  }

  isBurning(i: number): boolean {
    return this.life[i] > 0 && FLAMMABILITY[this.cells[i]] > 0;
  }

  /** Something to stand on at row y (solid ground or a platform; roofs don't count). */
  supports(x: number, y: number): boolean {
    if (this.get(x, y) === Material.Thatch) return false;
    return this.isSolid(x, y) || this.isOneWay(x, y);
  }

  /** Can a stickman stand with feet resting on top of cell (x, y)? */
  standable(x: number, y: number): boolean {
    if (x < 3 || x >= W - 3 || y < HEADROOM + 1 || y >= H) return false;
    if (!this.supports(x, y)) return false;
    for (let k = 1; k <= HEADROOM; k++) if (this.isSolid(x, y - k)) return false;
    return true;
  }

  /** First body-solid or platform pixel from the top in column x. */
  surfaceY(x: number): number {
    const cx = Math.max(0, Math.min(W - 1, Math.floor(x)));
    for (let y = 0; y < H; y++) {
      const m = this.cells[y * W + cx];
      if (BODY_SOLID[m] || ONE_WAY[m]) return y;
    }
    return H;
  }

  // ---- edits ---------------------------------------------------------------

  private wake(i: number): void {
    const y = (i / W) | 0;
    const x = i - y * W;
    const cx = (x / CHUNK) | 0;
    const cy = (y / CHUNK) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= CH) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        if (nx >= 0 && nx < CW) this.nextAwake[ny * CW + nx] = 1;
      }
    }
  }

  set(x: number, y: number, m: Material, shade?: number): void {
    if (!this.inBounds(x, y)) return;
    this.place(this.index(x, y), m, shade);
  }

  setWall(x: number, y: number, w: WallKind): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    if (this.walls[i] === w) return;
    this.walls[i] = w;
    this.structureVersion++;
  }

  private place(i: number, m: Material, shade = (Math.random() * 4) | 0): void {
    const before = this.cells[i];
    this.cells[i] = m;
    this.shade[i] = shade;
    const [lo, hi] = MATERIALS[m].life;
    this.life[i] = hi > 0 ? lo + ((Math.random() * (hi - lo)) | 0) : 0;
    this.moved[i] = this.tickId;
    if (KIND[before] === Kind.Static || KIND[m] === Kind.Static) this.structureVersion++;
    this.wake(i);
  }

  /** Paint a disc of material. Only fills empty/gas cells unless `overwrite`. */
  paint(cx: number, cy: number, radius: number, m: Material, overwrite = false): void {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y > radius * radius) continue;
        const px = Math.floor(cx + x);
        const py = Math.floor(cy + y);
        if (!this.inBounds(px, py)) continue;
        const i = py * W + px;
        const current = this.cells[i];
        if (current === Material.Bedrock) continue;
        if (m === Material.Fire && FLAMMABILITY[current] > 0) { this.ignite(i); continue; }
        if (overwrite || current === Material.Empty || KIND[current] === Kind.Gas) {
          if (Math.random() < 0.6 || m === Material.Empty) this.place(i, m);
        }
      }
    }
  }

  ignite(i: number): void {
    const m = this.cells[i] as Material;
    if (FLAMMABILITY[m] <= 0 || this.life[i] > 0) return;
    const t = MATERIALS[m].burnTime;
    this.life[i] = Math.max(1, Math.round(t * (0.6 + Math.random() * 0.8)));
    this.wake(i);
  }

  // ---- simulation ------------------------------------------------------------

  private swap(a: number, b: number): void {
    const m = this.cells[a]; this.cells[a] = this.cells[b]; this.cells[b] = m;
    const s = this.shade[a]; this.shade[a] = this.shade[b]; this.shade[b] = s;
    const l = this.life[a]; this.life[a] = this.life[b]; this.life[b] = l;
    this.moved[a] = this.tickId;
    this.moved[b] = this.tickId;
    this.wake(a);
    this.wake(b);
  }

  private canSink(j: number, d: number): boolean {
    const k = KIND[this.cells[j]];
    return k === Kind.Empty || ((k === Kind.Gas || k === Kind.Liquid) && DENSITY[this.cells[j]] < d);
  }

  private dir(tilt: number): number {
    return Math.random() < 0.5 + tilt * 0.45 ? 1 : -1;
  }

  private stepPowder(i: number, x: number, y: number, tilt: number): void {
    if (y >= H - 1) return;
    const d = DENSITY[this.cells[i]];
    const below = i + W;
    if (this.canSink(below, d)) { this.swap(i, below); return; }
    const s = this.dir(tilt);
    for (let k = 0; k < 2; k++) {
      const dx = k === 0 ? s : -s;
      const nx = x + dx;
      if (nx < 0 || nx >= W) continue;
      if (this.canSink(below + dx, d) && this.canSink(i + dx, d)) { this.swap(i, below + dx); return; }
    }
  }

  private stepLiquid(i: number, x: number, y: number, tilt: number): void {
    const d = DENSITY[this.cells[i]];
    if (y < H - 1) {
      const below = i + W;
      if (this.canSink(below, d)) { this.swap(i, below); return; }
      const s = this.dir(tilt);
      for (let k = 0; k < 2; k++) {
        const dx = k === 0 ? s : -s;
        const nx = x + dx;
        if (nx >= 0 && nx < W && this.canSink(below + dx, d)) { this.swap(i, below + dx); return; }
      }
    }
    const s = this.dir(tilt * 1.6);
    for (let n = 0; n < 2; n++) {
      const dx = n === 0 ? s : -s;
      let target = -1;
      for (let k = 1; k <= 4; k++) {
        const nx = x + dx * k;
        if (nx < 0 || nx >= W) break;
        const j = i + dx * k;
        if (!this.canSink(j, d)) break;
        target = j;
        if (y < H - 1 && this.canSink(j + W, d)) break;
      }
      if (target !== -1) { this.swap(i, target); return; }
    }
  }

  private stepGas(i: number, x: number, y: number, m: Material): void {
    this.wake(i);
    if (--this.life[i] <= 0) {
      if (m === Material.Fire && Math.random() < 0.12) this.place(i, Material.Smoke);
      else this.place(i, Material.Empty);
      return;
    }
    if (m === Material.Fire) this.burnNeighbors(i, x, y, 1);
    if (y === 0) {
      if (Math.random() < 0.2) this.place(i, Material.Empty);
      return;
    }
    const rise = m === Material.Fire ? 0.75 : 0.6;
    const dx = Math.random() < 0.5 ? -1 : 1;
    const up = i - W;
    if (Math.random() < rise) {
      if (this.cells[up] === Material.Empty) { this.swap(i, up); return; }
      const nx = x + dx;
      if (nx >= 0 && nx < W && this.cells[up + dx] === Material.Empty) { this.swap(i, up + dx); return; }
    }
    const nx = x + dx;
    if (nx >= 0 && nx < W && this.cells[i + dx] === Material.Empty) this.swap(i, i + dx);
  }

  private burnNeighbors(i: number, x: number, y: number, strength: number): void {
    for (let k = 0; k < 4; k++) {
      const j = k === 0 ? (y > 0 ? i - W : -1) : k === 1 ? (y < H - 1 ? i + W : -1) : k === 2 ? (x > 0 ? i - 1 : -1) : (x < W - 1 ? i + 1 : -1);
      if (j < 0) continue;
      const n = this.cells[j];
      if (n === Material.Water) {
        if (this.cells[i] === Material.Fire) { this.place(i, Material.Steam); return; }
        this.life[i] = 0;
        if (Math.random() < 0.3) this.place(j, Material.Steam);
        return;
      }
      const f = FLAMMABILITY[n];
      if (f > 0 && this.life[j] === 0 && Math.random() < f * strength) this.ignite(j);
    }
  }

  private stepBurning(i: number, x: number, y: number, m: Material): void {
    this.wake(i);
    this.burnNeighbors(i, x, y, 2.5);
    if (this.life[i] === 0) return;
    if (Math.random() < 0.35) {
      const dx = ((Math.random() * 3) | 0) - 1;
      const dy = Math.random() < 0.7 ? -1 : ((Math.random() * 3) | 0) - 1;
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && this.cells[ny * W + nx] === Material.Empty) this.place(ny * W + nx, Material.Fire);
    }
    if (--this.life[i] === 0) {
      const info = MATERIALS[m];
      this.place(i, Math.random() < info.ashChance ? Material.Ash : info.burnsInto);
    }
  }

  private stepHearth(i: number, x: number, y: number): void {
    this.wake(i);
    if (y > 0 && Math.random() < 0.45) {
      const nx = Math.max(0, Math.min(W - 1, x + ((Math.random() * 3) | 0) - 1));
      const j = (y - 1) * W + nx;
      if (this.cells[j] === Material.Empty) this.place(j, Material.Fire);
      else if (this.cells[j] === Material.Water && Math.random() < 0.05) this.place(j, Material.Steam);
    }
  }

  /** Slow processes on randomly chosen cells (growth, decay, evaporation, soaking). */
  private randomTick(env: Environment): void {
    const offsets = [-1, 1, -W - 1, -W + 1, W - 1, W + 1];
    for (let n = 0; n < 3000; n++) {
      const i = (Math.random() * W * H) | 0;
      const m = this.cells[i] as Material;
      if (m === Material.Empty || m === Material.Stone) continue;
      const y = (i / W) | 0;
      const above = y > 0 ? this.cells[i - W] : Material.Empty;
      const below = y < H - 1 ? this.cells[i + W] : Material.Bedrock;
      switch (m) {
        case Material.Dirt:
          if (y > 0 && above === Material.Empty && this.walls[i - W] === WallKind.None && Math.random() < 0.3) {
            for (const o of offsets) {
              const j = i + o;
              if (j >= 0 && j < W * H && this.cells[j] === Material.Grass) { this.place(i, Material.Grass); break; }
            }
          }
          break;
        case Material.Water:
          // Pools drain into soil through their bottom layer; their surface evaporates in the sun.
          if (SOAKS[below] && Math.random() < 0.3) this.place(i, Material.Empty);
          else if (above === Material.Empty && this.walls[i] === WallKind.None && Math.random() < env.daylight * 0.05) this.place(i, Material.Steam);
          break;
        case Material.Ash:
        case Material.Sawdust:
          if (KIND[below] !== Kind.Empty && below !== Material.Water && this.life[i] === 0 && Math.random() < 0.15) {
            this.place(i, Material.Empty);
          }
          break;
        default:
          break;
      }
    }
  }

  /** Springs keep their pools topped up to a level. */
  private stepSprings(): void {
    for (const s of this.springs) {
      let y = s.y;
      while (y > s.top && this.cells[y * W + s.x] === Material.Water) y--;
      if (y >= s.top && this.cells[y * W + s.x] === Material.Empty) this.place(y * W + s.x, Material.Water);
    }
  }

  step(env: Environment): void {
    this.tickId = (this.tickId % 255) + 1;
    const tick = this.tickId;
    const swapped = this.awake;
    this.awake = this.nextAwake;
    this.nextAwake = swapped;
    this.nextAwake.fill(0);
    const awake = this.awake;
    const leftToRight = (tick & 1) === 0;
    for (let cy = CH - 1; cy >= 0; cy--) {
      let any = false;
      for (let cx = 0; cx < CW; cx++) if (awake[cy * CW + cx]) { any = true; break; }
      if (!any) continue;
      for (let y = cy * CHUNK + CHUNK - 1; y >= cy * CHUNK; y--) {
        for (let n = 0; n < CW; n++) {
          const cx = leftToRight ? n : CW - 1 - n;
          if (!awake[cy * CW + cx]) continue;
          const x0 = cx * CHUNK;
          for (let k = 0; k < CHUNK; k++) {
            const x = leftToRight ? x0 + k : x0 + CHUNK - 1 - k;
            const i = y * W + x;
            const m = this.cells[i] as Material;
            if (m === Material.Empty || this.moved[i] === tick) continue;
            switch (KIND[m]) {
              case Kind.Powder:
                if (this.life[i] > 0) { this.stepBurning(i, x, y, m); if (this.cells[i] !== m) break; }
                this.stepPowder(i, x, y, env.tilt);
                break;
              case Kind.Liquid:
                this.stepLiquid(i, x, y, env.tilt);
                break;
              case Kind.Gas:
                this.stepGas(i, x, y, m);
                break;
              case Kind.Static:
                if (m === Material.Hearth) this.stepHearth(i, x, y);
                else if (this.life[i] > 0) this.stepBurning(i, x, y, m);
                break;
              default:
                break;
            }
          }
        }
      }
    }
    this.randomTick(env);
    this.stepSprings();
  }

  /** Number of chunks that will be simulated next tick (diagnostics). */
  awakeChunks(): number {
    let n = 0;
    for (const a of this.nextAwake) n += a;
    return n;
  }

  // ---- persistence ---------------------------------------------------------

  serialize(): string {
    return rle(this.cells) + "|" + rle(this.walls);
  }

  deserialize(data: string): boolean {
    try {
      const [c, w] = data.split("|");
      const cells = unrle(c, W * H, MATERIAL_LIST.length);
      const walls = unrle(w, W * H, 5);
      if (!cells || !walls) return false;
      this.cells.set(cells);
      this.walls.set(walls);
      this.life.fill(0);
      for (let i = 0; i < W * H; i++) {
        const [lo, hi] = MATERIALS[cells[i] as Material].life;
        if (hi > 0) this.life[i] = lo + ((Math.random() * (hi - lo)) | 0);
        this.shade[i] = (hash2(i % W, (i / W) | 0) * 4) | 0;
      }
      this.addLakeSpring();
      this.awake.fill(1);
      this.nextAwake.fill(1);
      this.structureVersion++;
      this.revision++;
      return true;
    } catch {
      return false;
    }
  }
}

function rle(data: Uint8Array): string {
  const out: number[] = [];
  let prev = data[0];
  let run = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v === prev && run < 255) { run++; continue; }
    out.push(prev, run);
    prev = v;
    run = 1;
  }
  out.push(prev, run);
  let s = "";
  for (let i = 0; i < out.length; i += 4096) s += String.fromCharCode(...out.slice(i, i + 4096));
  return btoa(s);
}

function unrle(data: string, size: number, maxValue: number): Uint8Array | null {
  const raw = atob(data);
  const out = new Uint8Array(size);
  let i = 0;
  for (let k = 0; k + 1 < raw.length; k += 2) {
    const v = raw.charCodeAt(k);
    const run = raw.charCodeAt(k + 1);
    if (v >= maxValue) return null;
    out.fill(v, i, Math.min(size, i + run));
    i += run;
  }
  return i === size ? out : null;
}
