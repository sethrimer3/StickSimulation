/**
 * The world grid: one material per pixel, simulated falling-sand style
 * (powders pile, liquids spread, gases rise, flammable things burn).
 * DOM-free; stepped at the physics rate from the main loop.
 */
import { Kind, Material, MATERIALS } from "./materials";
import { LOGICAL_SIZE } from "./world";

export { Material } from "./materials";

export const SETTLEMENT_GROUND_Y = 199;
export const RIVER_LEVEL = 203;

const W = LOGICAL_SIZE;
const H = LOGICAL_SIZE;

const KIND = Object.values(MATERIALS).map((m) => m.kind);
const DENSITY = Object.values(MATERIALS).map((m) => m.density);
const BODY_SOLID = Object.values(MATERIALS).map((m) => m.bodySolid);
const FLAMMABILITY = Object.values(MATERIALS).map((m) => m.flammability);
const SOAKS = Object.values(Material).filter((v): v is Material => typeof v === "number").map((m) =>
  m === Material.Dirt || m === Material.Ash || FLAMMABILITY[m] > 0);

/** Ground profile used for generation and for placing structures. */
export function groundHeight(x: number): number {
  if (x < 88) return SETTLEMENT_GROUND_Y + Math.round(Math.sin(x / 13) * 1.6 + Math.sin(x / 5.3) * 0.6);
  if (x < 190) return SETTLEMENT_GROUND_Y;
  if (x < 206) {
    const t = (x - 190) / 16;
    return SETTLEMENT_GROUND_Y + Math.round(t * t * 34);
  }
  return 233 + Math.round(Math.sin(x / 7) * 2);
}

export interface Environment {
  /** -1..1, sideways "gravity" bias from tilting the frame. */
  tilt: number;
  /** 0..1 sunlight, drives evaporation. */
  daylight: number;
}

export class Terrain {
  readonly width = W;
  readonly height = H;
  readonly cells = new Uint8Array(W * H);
  /** Color shade 0..3 per cell, kept when a grain moves. */
  readonly shade = new Uint8Array(W * H);
  /** Gas lifetime, or remaining burn time for a burning cell (0 = not burning). */
  readonly life = new Uint16Array(W * H);
  /** Tick stamp so a cell moves at most once per tick. */
  private readonly moved = new Uint8Array(W * H);
  private tickId = 1;
  /** Bumped whenever the grid is replaced wholesale (load/reset). */
  revision = 0;

  constructor() {
    this.generate();
  }

  generate(): void {
    this.cells.fill(0);
    this.life.fill(0);
    for (let x = 0; x < W; x++) {
      const top = groundHeight(x);
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        let m = Material.Empty;
        if (y >= top) {
          const depth = y - top;
          if (x >= 192 && depth < 3) m = Material.Sand;
          else if (depth < 2) m = Material.Grass;
          else if (depth > 22 + ((x * 7) % 5)) m = Material.Stone;
          else m = Material.Dirt;
        } else if (x >= 192 && y >= RIVER_LEVEL) {
          m = Material.Water;
        }
        this.cells[i] = m;
        this.shade[i] = (Math.random() * 4) | 0;
      }
    }
    this.revision++;
  }

  // ---- queries -----------------------------------------------------------

  index(x: number, y: number): number {
    return Math.floor(y) * W + Math.floor(x);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < W && y < H;
  }

  get(x: number, y: number): Material {
    if (!this.inBounds(x, y)) return Material.Stone;
    return this.cells[this.index(x, y)] as Material;
  }

  /** Solid for the stickman's body. */
  isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= W || y >= H) return true;
    if (y < 0) return false;
    return BODY_SOLID[this.cells[this.index(x, y)]];
  }

  isWater(x: number, y: number): boolean {
    return this.get(x, y) === Material.Water;
  }

  isBurning(i: number): boolean {
    return this.life[i] > 0 && FLAMMABILITY[this.cells[i]] > 0;
  }

  /** First body-solid pixel from the top in column x. */
  surfaceY(x: number): number {
    const cx = Math.max(0, Math.min(W - 1, Math.floor(x)));
    for (let y = 0; y < H; y++) if (BODY_SOLID[this.cells[y * W + cx]]) return y;
    return H;
  }

  // ---- edits ---------------------------------------------------------------

  set(x: number, y: number, m: Material, shade = (Math.random() * 4) | 0): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.place(i, m, shade);
  }

  private place(i: number, m: Material, shade = (Math.random() * 4) | 0): void {
    this.cells[i] = m;
    this.shade[i] = shade;
    const [lo, hi] = MATERIALS[m].life;
    this.life[i] = hi > 0 ? lo + ((Math.random() * (hi - lo)) | 0) : 0;
    this.moved[i] = this.tickId;
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
  }

  // ---- simulation ------------------------------------------------------------

  private swap(a: number, b: number): void {
    const m = this.cells[a]; this.cells[a] = this.cells[b]; this.cells[b] = m;
    const s = this.shade[a]; this.shade[a] = this.shade[b]; this.shade[b] = s;
    const l = this.life[a]; this.life[a] = this.life[b]; this.life[b] = l;
    this.moved[a] = this.tickId;
    this.moved[b] = this.tickId;
  }

  /** Can a cell of density `d` move into cell j (displacing what is there)? */
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
    for (const dx of [s, -s]) {
      const nx = x + dx;
      if (nx < 0 || nx >= W) continue;
      if (this.canSink(below + dx, d) && this.canSink(i + dx, d)) { this.swap(i, below + dx); return; }
    }
  }

  private stepLiquid(i: number, x: number, y: number, tilt: number): void {
    const d = DENSITY[this.cells[i]];
    if (y < H - 1) {
      const below = i + W;
      // Puddles on soil or wood slowly soak in (the river bed is sand/stone, so it doesn't drain).
      if (SOAKS[this.cells[below]] && Math.random() < 0.004) {
        this.place(i, Material.Empty);
        return;
      }
      if (this.canSink(below, d)) { this.swap(i, below); return; }
      const s = this.dir(tilt);
      for (const dx of [s, -s]) {
        const nx = x + dx;
        if (nx >= 0 && nx < W && this.canSink(below + dx, d)) { this.swap(i, below + dx); return; }
      }
    }
    // Spread sideways, up to a few cells, biased by tilt.
    const s = this.dir(tilt * 1.6);
    for (const dx of [s, -s]) {
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
    const free = (j: number): boolean => this.cells[j] === Material.Empty;
    if (Math.random() < rise) {
      if (free(up)) { this.swap(i, up); return; }
      const nx = x + dx;
      if (nx >= 0 && nx < W && free(up + dx)) { this.swap(i, up + dx); return; }
    }
    const nx = x + dx;
    if (nx >= 0 && nx < W && free(i + dx)) this.swap(i, i + dx);
  }

  /** Flames and burning cells ignite neighbours, and water douses them. */
  private burnNeighbors(i: number, x: number, y: number, strength: number): void {
    const neighbors = [
      y > 0 ? i - W : -1, y < H - 1 ? i + W : -1, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1
    ];
    for (const j of neighbors) {
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
    this.burnNeighbors(i, x, y, 2.5);
    if (this.life[i] === 0) return; // doused
    if (Math.random() < 0.35) {
      // Throw a flame into a random open neighbour (mostly upward).
      const dx = ((Math.random() * 3) | 0) - 1;
      const dy = Math.random() < 0.7 ? -1 : ((Math.random() * 3) | 0) - 1;
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && this.cells[ny * W + nx] === Material.Empty) this.place(ny * W + nx, Material.Fire);
    }
    if (--this.life[i] === 0) {
      const info = MATERIALS[m];
      const product = Math.random() < info.ashChance ? Material.Ash : info.burnsInto;
      this.place(i, product);
    }
  }

  private stepHearth(i: number, x: number, y: number): void {
    if (y > 0 && Math.random() < 0.45) {
      const nx = x + ((Math.random() * 3) | 0) - 1;
      const j = (y - 1) * W + Math.max(0, Math.min(W - 1, nx));
      if (this.cells[j] === Material.Empty) this.place(j, Material.Fire);
      else if (this.cells[j] === Material.Water && Math.random() < 0.05) this.place(j, Material.Steam);
    }
  }

  /** Slow processes on randomly chosen cells (growth, decay, evaporation). */
  private randomTick(env: Environment): void {
    for (let n = 0; n < 400; n++) {
      const i = (Math.random() * W * H) | 0;
      const m = this.cells[i] as Material;
      const y = (i / W) | 0;
      const x = i - y * W;
      const above = y > 0 ? this.cells[i - W] : Material.Empty;
      const below = y < H - 1 ? this.cells[i + W] : Material.Stone;
      switch (m) {
        case Material.Dirt:
          // Grass creeps back over exposed dirt next to grass.
          if (above === Material.Empty && Math.random() < 0.08) {
            const l = x > 0 ? this.cells[i - 1] : 0;
            const r = x < W - 1 ? this.cells[i + 1] : 0;
            const ul = x > 0 && y > 0 ? this.cells[i - W - 1] : 0;
            const ur = x < W - 1 && y > 0 ? this.cells[i - W + 1] : 0;
            const dl = x > 0 && y < H - 1 ? this.cells[i + W - 1] : 0;
            const dr = x < W - 1 && y < H - 1 ? this.cells[i + W + 1] : 0;
            if ([l, r, ul, ur, dl, dr].includes(Material.Grass)) this.place(i, Material.Grass);
          }
          break;
        case Material.Water:
          if (above === Material.Empty) {
            if (Math.random() < env.daylight * 0.012) this.place(i, Material.Steam);

          }
          break;
        case Material.Ash:
        case Material.Sawdust:
          if (KIND[below] !== Kind.Empty && below !== Material.Water && this.life[i] === 0
            && Math.random() < (m === Material.Ash ? 0.05 : 0.06)) {
            this.place(i, Material.Empty); // decays into the soil
          }
          break;
        default:
          break;
      }
    }
  }

  /** Keep the river at a steady level (spring on the right edge, overflow drains) and drain the left edge. */
  private regulateRiver(): void {
    const x = W - 1;
    for (let y = RIVER_LEVEL; y < H; y++) {
      const i = y * W + x;
      if (this.cells[i] === Material.Empty) this.place(i, Material.Water);
    }
    for (let y = 0; y < RIVER_LEVEL; y++) {
      const i = y * W + x;
      if (this.cells[i] === Material.Water) this.place(i, Material.Empty);
    }
    // The meadow continues past the left edge: water running off it is gone.
    for (let y = 0; y < H; y++) {
      if (this.cells[y * W] === Material.Water && Math.random() < 0.5) this.place(y * W, Material.Empty);
    }
  }

  step(env: Environment): void {
    this.tickId = (this.tickId % 255) + 1;
    const tick = this.tickId;
    const leftToRight = (tick & 1) === 0;
    for (let y = H - 1; y >= 0; y--) {
      for (let n = 0; n < W; n++) {
        const x = leftToRight ? n : W - 1 - n;
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
    this.randomTick(env);
    this.regulateRiver();
  }

  // ---- persistence ---------------------------------------------------------

  /** Run-length encode material+shade into a compact string. */
  serialize(): string {
    const out: number[] = [];
    let prev = -1;
    let run = 0;
    for (let i = 0; i < W * H; i++) {
      const v = (this.cells[i] << 2) | this.shade[i];
      if (v === prev && run < 255) { run++; continue; }
      if (run > 0) out.push(prev, run);
      prev = v;
      run = 1;
    }
    out.push(prev, run);
    let s = "";
    for (let i = 0; i < out.length; i += 4096) s += String.fromCharCode(...out.slice(i, i + 4096));
    return btoa(s);
  }

  deserialize(data: string): boolean {
    try {
      const raw = atob(data);
      const cells = new Uint8Array(W * H);
      const shade = new Uint8Array(W * H);
      let i = 0;
      for (let k = 0; k + 1 < raw.length; k += 2) {
        const v = raw.charCodeAt(k);
        const run = raw.charCodeAt(k + 1);
        const m = v >> 2;
        if (m >= KIND.length) return false;
        for (let r = 0; r < run && i < W * H; r++, i++) { cells[i] = m; shade[i] = v & 3; }
      }
      if (i !== W * H) return false;
      this.cells.set(cells);
      this.shade.set(shade);
      this.life.fill(0);
      // Gases need a lifetime again.
      for (let j = 0; j < W * H; j++) {
        const [lo, hi] = MATERIALS[cells[j] as Material].life;
        if (hi > 0) this.life[j] = lo + ((Math.random() * (hi - lo)) | 0);
      }
      this.revision++;
      return true;
    } catch {
      return false;
    }
  }
}
