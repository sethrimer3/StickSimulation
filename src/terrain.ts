import { LOGICAL_SIZE } from "./world";

/**
 * Per-pixel material grid. Every pixel of the world is a cell, which is the
 * foundation for later falling-sand elements (sand, water flow, fire, ...).
 * For now the grid is static: solid ground, a riverbed, and water.
 */
export enum Material {
  Empty = 0,
  Dirt = 1,
  Grass = 2,
  Stone = 3,
  Water = 4,
  Sand = 5
}

export const SETTLEMENT_GROUND_Y = 199;
export const RIVER_X = 199;

export class Terrain {
  readonly width = LOGICAL_SIZE;
  readonly height = LOGICAL_SIZE;
  readonly cells = new Uint8Array(LOGICAL_SIZE * LOGICAL_SIZE);
  /** Top solid pixel per column (cached; terrain is static for now). */
  private readonly surface = new Int16Array(LOGICAL_SIZE);

  constructor() {
    this.generate();
  }

  private groundHeight(x: number): number {
    if (x < 88) return SETTLEMENT_GROUND_Y + Math.round(Math.sin(x / 13) * 1.6 + Math.sin(x / 5.3) * 0.6);
    if (x < 190) return SETTLEMENT_GROUND_Y;
    if (x < 206) {
      // Bank sloping into the river.
      const t = (x - 190) / 16;
      return SETTLEMENT_GROUND_Y + Math.round(t * t * 34);
    }
    return 233 + Math.round(Math.sin(x / 7) * 2);
  }

  private generate(): void {
    const { width, height, cells } = this;
    for (let x = 0; x < width; x++) {
      const top = this.groundHeight(x);
      for (let y = 0; y < height; y++) {
        const i = y * width + x;
        if (y >= top) {
          const depth = y - top;
          if (x >= 192 && depth < 3) cells[i] = Material.Sand;
          else if (depth < 2) cells[i] = Material.Grass;
          else if (depth > 22 + ((x * 7) % 5)) cells[i] = Material.Stone;
          else cells[i] = Material.Dirt;
        } else if (x >= RIVER_X && y >= 203) {
          cells[i] = Material.Water;
        }
      }
    }
    this.refreshSurface();
  }

  refreshSurface(): void {
    for (let x = 0; x < this.width; x++) {
      let y = 0;
      while (y < this.height && !this.isSolid(x, y)) y++;
      this.surface[x] = y;
    }
  }

  get(x: number, y: number): Material {
    const cx = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    const cy = Math.max(0, Math.min(this.height - 1, Math.floor(y)));
    return this.cells[cy * this.width + cx] as Material;
  }

  isSolid(x: number, y: number): boolean {
    const m = this.get(x, y);
    return m !== Material.Empty && m !== Material.Water;
  }

  isWater(x: number, y: number): boolean {
    return this.get(x, y) === Material.Water;
  }

  surfaceY(x: number): number {
    return this.surface[Math.max(0, Math.min(this.width - 1, Math.floor(x)))];
  }
}
