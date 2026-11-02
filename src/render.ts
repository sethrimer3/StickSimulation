import type { Actor } from "./actor";
import { Material, MATERIALS } from "./materials";
import { bayer, mix, PixelSurface, rgb, type Rgb } from "./pixels";
import { BONES, Joint } from "./stickman";
import type { Terrain } from "./terrain";
import type { Weather } from "./weather";
import { dayFraction, LOGICAL_SIZE, type World } from "./world";

const C = {
  skyTop: rgb("#243c63"),
  skyBottom: rgb("#a1c3a8"),
  rainSkyTop: rgb("#2c3a4c"),
  rainSkyBottom: rgb("#7f9396"),
  sun: rgb("#f3db8b"),
  sunCore: rgb("#fff1bd"),
  star: rgb("#f6e9c5"),
  hillFar: rgb("#6d8c7b"),
  hillNear: rgb("#527c69"),
  cloud: rgb("#e8eef0"),
  cloudShade: rgb("#c4d0d6"),
  rainCloud: rgb("#8a96a0"),
  rainCloudShade: rgb("#6d7882"),
  fire: [rgb("#db863e"), rgb("#f0b85a"), rgb("#f0d47c"), rgb("#fff3c4")],
  monster: rgb("#583c66"),
  monsterLight: rgb("#795184"),
  monsterEye: rgb("#f1b1a5"),
  stick: rgb("#15181d"),
  metal: rgb("#b8c5c8"),
  metalDark: rgb("#7e8b90"),
  handle: rgb("#7c5e3a"),
  line: rgb("#d6d4ba"),
  bobber: rgb("#d9524a")
};

const STARS: Array<[number, number]> = [
  [11, 13], [35, 26], [56, 9], [79, 33], [103, 15], [141, 22], [167, 10],
  [198, 31], [224, 14], [246, 34], [21, 62], [95, 57], [158, 49], [231, 67]
];

const PALETTES = Object.values(MATERIALS).map((m) => m.palette);
const GLOW = Object.values(MATERIALS).map((m) => m.glow);
const FLAMMABLE = Object.values(MATERIALS).map((m) => m.flammability > 0);

const surface = new PixelSurface(LOGICAL_SIZE, LOGICAL_SIZE);

// ---- sky & backdrop (not materials) ------------------------------------------

function drawSky(s: PixelSurface, world: World, weather: Weather, tilt: number, night: number): void {
  const gloom = weather.raining ? 1 : 0;
  const top = mix(C.skyTop, C.rainSkyTop, gloom * 0.7);
  const bottom = mix(C.skyBottom, C.rainSkyBottom, gloom * 0.7);
  for (let y = 0; y < LOGICAL_SIZE; y++) {
    const t = Math.min(1, y / 190);
    for (let x = 0; x < LOGICAL_SIZE; x++) {
      const band = Math.floor(t * 7 + bayer(x, y)) / 7;
      s.color[y * LOGICAL_SIZE + x] = mix(top, bottom, band);
    }
  }
  if (night > 0.38) {
    const shift = Math.round(tilt * 2);
    for (const [sx, sy] of STARS) {
      s.set(sx + shift, sy, C.star);
      if ((sx + sy) % 3 === 0) s.set(sx + shift + 1, sy, C.star);
    }
  }
  const f = dayFraction(world);
  const sunX = 20 + f * 205 + Math.round(tilt * 2);
  const sunY = 104 - Math.sin(f * Math.PI) * 72;
  s.fillCircle(sunX + 6, sunY + 6, 6, C.sun);
  s.fillCircle(sunX + 5, sunY + 5, 3, C.sunCore);
}

function drawHills(s: PixelSurface, tilt: number): void {
  const farShift = Math.round(tilt * 2);
  const nearShift = Math.round(tilt * 4);
  for (let x = 0; x < LOGICAL_SIZE; x++) {
    const fx = x - farShift;
    const far = 130 + Math.round(Math.sin(fx / 23) * 6 + Math.sin(fx / 9) * 2);
    for (let y = far; y < 210; y++) s.set(x, y, C.hillFar);
    const nx = x - nearShift;
    const near = 150 + Math.round((Math.sin(nx / 31) * 9 + Math.sin(nx / 12) * 3) / 3) * 3;
    for (let y = near; y < 215; y++) s.set(x, y, (y - near) < 1 ? mix(C.hillNear, C.hillFar, 0.5) : C.hillNear);
  }
}

function drawClouds(s: PixelSurface, weather: Weather): void {
  for (const c of weather.clouds) {
    const raining = c.rain > 0;
    const body = raining ? C.rainCloud : C.cloud;
    const shade = raining ? C.rainCloudShade : C.cloudShade;
    const half = c.width / 2;
    for (let px = -half; px <= half; px++) {
      const x = Math.round(c.x + px);
      const edge = 1 - Math.abs(px) / half;
      const lumps = Math.sin(px * 0.35 + c.seed) * 2 + Math.sin(px * 0.13 + c.seed * 2) * 3;
      const h = Math.max(1, Math.round(edge * 7 + lumps * edge + 2));
      for (let py = 0; py < h; py++) s.set(x, Math.round(c.y + 5 - py), py < 2 ? shade : body);
    }
  }
}

// ---- materials -------------------------------------------------------------

function drawCells(s: PixelSurface, terrain: Terrain, now: number): void {
  const { width, height, cells, shade, life } = terrain;
  const flick = Math.floor(now * 12);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const m = cells[i] as Material;
      if (m === Material.Empty) continue;
      const pal = PALETTES[m];
      let c: Rgb = pal[shade[i]];
      switch (m) {
        case Material.Water: {
          const top = y > 0 && cells[i - width] !== Material.Water;
          const wave = Math.sin(x * 0.45 + now * 2.1 + Math.sin(y * 0.7) * 1.4);
          c = y > 218 ? pal[1] : pal[0];
          if (top && wave > -0.2) c = pal[2];
          else if (wave > 0.93 && (y & 3) === 0) c = mix(pal[0], pal[2], 0.6);
          // Slightly see-through.
          c = mix(s.color[i], c, 0.82);
          break;
        }
        case Material.Fire: {
          const level = Math.min(3, Math.floor(life[i] / 6) + ((x + y + flick) & 1));
          c = C.fire[level];
          break;
        }
        case Material.Steam:
        case Material.Smoke:
          c = mix(s.color[i], c, m === Material.Steam ? 0.45 : 0.78);
          break;
        case Material.Hearth:
          c = pal[(shade[i] + ((x * 3 + flick) % 4 === 0 ? 1 : 0)) & 3];
          break;
        default:
          if (life[i] > 0 && FLAMMABLE[m]) {
            // Burning: flicker between the material and flame colors.
            c = mix(c, C.fire[(x + y + flick) & 3], 0.55 + ((x ^ flick) & 1) * 0.3);
          }
          break;
      }
      s.color[i] = c;
    }
  }
}

// ---- creatures ---------------------------------------------------------------

function drawMonster(s: PixelSurface, terrain: Terrain, now: number): void {
  const x = 192;
  const ground = terrain.surfaceY(x + 2);
  const bob = Math.round(Math.sin(now * 3));
  s.rect(x - 7, ground - 21 + bob, 15, 21 - bob, C.monster);
  s.rect(x - 9, ground - 29 + bob, 19, 12, C.monsterLight);
  s.rect(x - 4, ground - 25 + bob, 3, 3, C.monsterEye);
  s.rect(x + 4, ground - 25 + bob, 3, 3, C.monsterEye);
  s.rect(x - 3, ground - 20 + bob, 8, 1, C.monster);
}

function drawTool(s: PixelSurface, actor: Actor, now: number): void {
  const p = actor.body.p;
  const hand = p[Joint.HandR];
  const elbow = p[Joint.ElbowR];
  let dx = hand.x - elbow.x;
  let dy = hand.y - elbow.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const at = (k: number): [number, number] => [hand.x + dx * k, hand.y + dy * k];
  switch (actor.tool) {
    case "axe": {
      const [ex, ey] = at(6);
      s.line(hand.x, hand.y, ex, ey, C.handle);
      s.rect(ex - 1, ey - 1, 3, 3, C.metal);
      s.set(ex + 1, ey + 1, C.metalDark);
      break;
    }
    case "hammer": {
      const [ex, ey] = at(5);
      s.line(hand.x, hand.y, ex, ey, C.handle);
      s.rect(ex - 1, ey - 1, 3, 2, C.metalDark);
      break;
    }
    case "sword": {
      const [gx, gy] = at(1);
      const [ex, ey] = at(9);
      s.line(gx, gy, ex, ey, C.metal);
      s.line(gx - dy * 2, gy + dx * 2, gx + dy * 2, gy - dx * 2, C.handle);
      break;
    }
    case "rod": {
      if (!actor.working) {
        const [ex, ey] = at(8);
        s.line(hand.x, hand.y, ex, ey, C.handle);
        break;
      }
      const dir = actor.faceX > hand.x ? 1 : -1;
      const tipX = hand.x + dir * 14;
      const tipY = hand.y - 9;
      s.line(hand.x, hand.y, tipX, tipY, C.handle);
      const bobX = tipX + dir * 6;
      const bobY = 203 + Math.round(Math.sin(now * 2.4));
      s.line(tipX, tipY, bobX, bobY - 1, C.line);
      s.set(bobX, bobY - 1, C.bobber);
      break;
    }
    case "none":
      break;
  }
}

function drawStickman(s: PixelSurface, actor: Actor, now: number): void {
  const p = actor.body.p;
  for (const [a, b] of BONES) {
    s.line(p[a].x, p[a].y - 0.5, p[b].x, p[b].y - 0.5, C.stick);
  }
  const head = p[Joint.Head];
  const neck = p[Joint.Neck];
  let hx = head.x - neck.x;
  let hy = head.y - neck.y;
  const hl = Math.hypot(hx, hy) || 1;
  hx /= hl;
  hy /= hl;
  s.circle(head.x + hx * 0.8, head.y - 0.5 + hy * 0.8, 3, C.stick);
  drawTool(s, actor, now);
}

// ---- lighting ----------------------------------------------------------------

const LIGHT_BLOCK = 8;
const LB = LOGICAL_SIZE / LIGHT_BLOCK;
const emit = new Float32Array(LB * LB);
const lightMap = new Float32Array(LB * LB);
const LIGHT_RADIUS = 5; // in blocks

/** Glowing cells (fire, embers, burning wood, lit windows) light the night. */
function computeLight(terrain: Terrain): void {
  emit.fill(0);
  const { width, cells, life } = terrain;
  for (let i = 0; i < cells.length; i++) {
    const m = cells[i];
    if (m === Material.Empty) continue;
    const g = GLOW[m] + (life[i] > 0 && FLAMMABLE[m] ? 0.8 : 0);
    if (g <= 0) continue;
    const x = i % width;
    const y = (i / width) | 0;
    emit[((y / LIGHT_BLOCK) | 0) * LB + ((x / LIGHT_BLOCK) | 0)] += g;
  }
  for (let by = 0; by < LB; by++) {
    for (let bx = 0; bx < LB; bx++) {
      let sum = 0;
      for (let oy = -LIGHT_RADIUS; oy <= LIGHT_RADIUS; oy++) {
        const y = by + oy;
        if (y < 0 || y >= LB) continue;
        for (let ox = -LIGHT_RADIUS; ox <= LIGHT_RADIUS; ox++) {
          const x = bx + ox;
          if (x < 0 || x >= LB) continue;
          const e = emit[y * LB + x];
          if (e === 0) continue;
          const d = Math.sqrt(ox * ox + oy * oy) / LIGHT_RADIUS;
          if (d < 1) sum += e * (1 - d) * (1 - d);
        }
      }
      lightMap[by * LB + bx] = Math.min(1, sum / 14);
    }
  }
}

function sampleLight(x: number, y: number): number {
  // Bilinear between block centres, then banded with ordered dithering.
  const fx = x / LIGHT_BLOCK - 0.5;
  const fy = y / LIGHT_BLOCK - 0.5;
  const x0 = Math.max(0, Math.min(LB - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(LB - 1, Math.floor(fy)));
  const x1 = Math.min(LB - 1, x0 + 1);
  const y1 = Math.min(LB - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));
  const a = lightMap[y0 * LB + x0] * (1 - tx) + lightMap[y0 * LB + x1] * tx;
  const b = lightMap[y1 * LB + x0] * (1 - tx) + lightMap[y1 * LB + x1] * tx;
  const v = a * (1 - ty) + b * ty;
  return Math.floor(v * 4 + bayer(x, y) * 0.9) / 4;
}

function makeLight(night: number) {
  const mr = 1 - night * 0.62;
  const mg = 1 - night * 0.55;
  const mb = 1 - night * 0.36;
  return (x: number, y: number, out: Float32Array): void => {
    const k = night > 0.05 ? sampleLight(x, y) * night : 0;
    out[0] = mr + (1 - mr) * k;
    out[1] = mg + (1 - mg) * k * 0.75;
    out[2] = mb + (1 - mb) * k * 0.3;
    out[3] = k * 52;
  };
}

export function render(
  ctx: CanvasRenderingContext2D,
  world: World,
  terrain: Terrain,
  weather: Weather,
  actor: Actor,
  tilt: number,
  nowSeconds: number
): void {
  const s = surface;
  const daylight = Math.max(0, Math.sin(dayFraction(world) * Math.PI * 2));
  const night = 1 - daylight;

  drawSky(s, world, weather, tilt, night);
  drawHills(s, tilt);
  drawClouds(s, weather);
  drawCells(s, terrain, nowSeconds);
  if (world.monster) drawMonster(s, terrain, nowSeconds);
  drawStickman(s, actor, nowSeconds);

  computeLight(terrain);
  s.present(ctx, makeLight(night));
}

