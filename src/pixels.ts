/**
 * A tiny software framebuffer. Everything in the world is drawn pixel by pixel
 * into one 256 × 256 buffer and then blitted once, so there is no anti-aliasing,
 * sub-pixel blending or smoothing anywhere: pure pixel art, like Stick Ranger.
 */
export type Rgb = number; // 0xRRGGBB

export function rgb(hex: string): Rgb {
  return parseInt(hex.replace("#", ""), 16);
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** 4×4 Bayer matrix, used for dithered gradients and lighting bands. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x: number, y: number): number {
  return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

/** Deterministic per-pixel noise in [0, 1). */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class PixelSurface {
  readonly width: number;
  readonly height: number;
  /** Colors as 0xRRGGBB, one per pixel. */
  readonly color: Uint32Array;
  private readonly image: ImageData;
  private readonly out: Uint32Array;
  private readonly lightSample = new Float32Array(4);

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.color = new Uint32Array(width * height);
    this.image = new ImageData(width, height);
    this.out = new Uint32Array(this.image.data.buffer);
  }

  set(x: number, y: number, c: Rgb): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.color[y * this.width + x] = c;
  }

  get(x: number, y: number): Rgb {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.color[y * this.width + x];
  }

  rect(x: number, y: number, w: number, h: number, c: Rgb): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x) + w);
    const y1 = Math.min(this.height, Math.round(y) + h);
    for (let py = y0; py < y1; py++) {
      this.color.fill(c, py * this.width + x0, py * this.width + Math.max(x0, x1));
    }
  }

  /** Bresenham line: exactly one pixel wide, no smoothing. */
  line(ax: number, ay: number, bx: number, by: number, c: Rgb): void {
    let x0 = Math.round(ax);
    let y0 = Math.round(ay);
    const x1 = Math.round(bx);
    const y1 = Math.round(by);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 1024; guard++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Midpoint circle outline. */
  circle(cx: number, cy: number, r: number, c: Rgb): void {
    const x0 = Math.round(cx);
    const y0 = Math.round(cy);
    let x = r;
    let y = 0;
    let err = 1 - r;
    while (x >= y) {
      this.set(x0 + x, y0 + y, c); this.set(x0 - x, y0 + y, c);
      this.set(x0 + x, y0 - y, c); this.set(x0 - x, y0 - y, c);
      this.set(x0 + y, y0 + x, c); this.set(x0 - y, y0 + x, c);
      this.set(x0 + y, y0 - x, c); this.set(x0 - y, y0 - x, c);
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
  }

  fillCircle(cx: number, cy: number, r: number, c: Rgb): void {
    const x0 = Math.round(cx);
    const y0 = Math.round(cy);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r + r * 0.8) this.set(x0 + x, y0 + y, c);
      }
    }
  }

  /**
   * Copy to the canvas. `light(x, y, out)` writes per-pixel RGB brightness
   * multipliers and an additive warm tint into `out`, applied in quantized steps so night and
   * firelight stay banded like hand-made pixel art.
   */
  present(ctx: CanvasRenderingContext2D, light?: (x: number, y: number, out: Float32Array) => void): void {
    const { width, height, color, out } = this;
    const l = this.lightSample;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const c = color[i];
        let r = (c >> 16) & 255;
        let g = (c >> 8) & 255;
        let b = c & 255;
        if (light) {
          light(x, y, l);
          r = Math.min(255, r * l[0] + l[3]);
          g = Math.min(255, g * l[1] + l[3] * 0.62);
          b = Math.min(255, b * l[2] + l[3] * 0.22);
        }
        // ImageData is RGBA in memory; on little-endian hosts that is 0xAABBGGRR.
        out[i] = 0xff000000 | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
      }
    }
    ctx.putImageData(this.image, 0, 0);
  }
}
