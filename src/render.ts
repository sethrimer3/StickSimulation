import type { Actor } from "./actor";
import { bayer, hash2, mix, PixelSurface, rgb, type Rgb } from "./pixels";
import { BONES, Joint } from "./stickman";
import { Material, type Terrain } from "./terrain";
import { dayFraction, LOGICAL_SIZE, type World } from "./world";

const C = {
  skyTop: rgb("#243c63"),
  skyBottom: rgb("#a1c3a8"),
  sun: rgb("#f3db8b"),
  sunCore: rgb("#fff1bd"),
  star: rgb("#f6e9c5"),
  hillFar: rgb("#6d8c7b"),
  hillNear: rgb("#527c69"),
  grass: rgb("#72995d"),
  grassDark: rgb("#5f8a4f"),
  dirt: rgb("#6b4f35"),
  dirtDark: rgb("#5a412c"),
  stone: rgb("#5e6066"),
  stoneDark: rgb("#4c4e55"),
  sand: rgb("#c9b07a"),
  water: rgb("#3a72a0"),
  waterDeep: rgb("#24507a"),
  waterFoam: rgb("#9cc6d8"),
  bark: rgb("#66492d"),
  barkDark: rgb("#4e3722"),
  leaf: [rgb("#235638"), rgb("#307348"), rgb("#408451"), rgb("#56995a")],
  wood: rgb("#9e7648"),
  woodDark: rgb("#82613c"),
  roof: rgb("#7b4840"),
  roofDark: rgb("#6c3c33"),
  door: rgb("#42302a"),
  window: rgb("#eab86d"),
  fire: [rgb("#db863e"), rgb("#f0b85a"), rgb("#f0d47c"), rgb("#fff3c4")],
  monster: rgb("#583c66"),
  monsterLight: rgb("#795184"),
  monsterEye: rgb("#f1b1a5"),
  stick: rgb("#15181d"),
  metal: rgb("#b8c5c8"),
  metalDark: rgb("#7e8b90"),
  handle: rgb("#7c5e3a"),
  line: rgb("#d6d4ba")
};

const STARS: Array<[number, number]> = [
  [11, 13], [35, 26], [56, 9], [79, 33], [103, 15], [141, 22], [167, 10],
  [198, 31], [224, 14], [246, 34], [21, 62], [95, 57], [158, 49], [231, 67]
];

const surface = new PixelSurface(LOGICAL_SIZE, LOGICAL_SIZE);

function drawSky(s: PixelSurface, world: World, tilt: number, night: number): void {
  // Dithered vertical gradient instead of a smooth one.
  for (let y = 0; y < LOGICAL_SIZE; y++) {
    const t = Math.min(1, y / 190);
    for (let x = 0; x < LOGICAL_SIZE; x++) {
      const band = Math.floor(t * 7 + bayer(x, y)) / 7;
      s.color[y * LOGICAL_SIZE + x] = mix(C.skyTop, C.skyBottom, band);
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
    for (let y = far; y < 200; y++) s.set(x, y, C.hillFar);
    const nx = x - nearShift;
    // Stepped terraces give the near hills a chunky, hand-placed look.
    const near = 150 + Math.round((Math.sin(nx / 31) * 9 + Math.sin(nx / 12) * 3) / 3) * 3;
    for (let y = near; y < 205; y++) s.set(x, y, (y - near) < 1 ? mix(C.hillNear, C.hillFar, 0.5) : C.hillNear);
  }
}

function drawTree(s: PixelSurface, x: number, base: number, variation: number): void {
  s.rect(x - 2, base - 26, 4, 26, C.bark);
  s.rect(x - 2, base - 26, 1, 26, C.barkDark);
  s.set(x - 3, base - 1, C.bark);
  s.set(x + 2, base - 1, C.bark);
  // Blobby canopy: stacked circles, shaded by height with per-pixel noise.
  const blobs: Array<[number, number, number]> = [
    [0, -38, 13], [-7, -46 - variation, 9], [7, -47 - variation, 9], [0, -55 - variation, 9]
  ];
  for (const [bx, by, r] of blobs) {
    for (let py = -r; py <= r; py++) {
      for (let px = -r; px <= r; px++) {
        if (px * px + py * py > r * r) continue;
        const X = x + bx + px;
        const Y = base + by + py;
        const light = (-py - px * 0.5) / r + (hash2(X, Y) - 0.5) * 0.9;
        const shade = light > 0.75 ? 3 : light > 0.15 ? 2 : light > -0.5 ? 1 : 0;
        s.set(X, Y, C.leaf[shade]);
      }
    }
  }
}

function drawTerrain(s: PixelSurface, terrain: Terrain, now: number): void {
  const { width, height, cells } = terrain;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const m = cells[y * width + x] as Material;
      if (m === Material.Empty) continue;
      const n = hash2(x, y);
      let c: Rgb;
      switch (m) {
        case Material.Grass: c = n < 0.3 ? C.grassDark : C.grass; break;
        case Material.Dirt: c = n < 0.22 ? C.dirtDark : C.dirt; break;
        case Material.Stone: c = n < 0.35 ? C.stoneDark : C.stone; break;
        case Material.Sand: c = n < 0.25 ? mix(C.sand, C.dirt, 0.3) : C.sand; break;
        case Material.Water: {
          const above = terrain.get(x, y - 1) !== Material.Water;
          const depth = y - 203;
          const wave = Math.sin(x * 0.45 + now * 2.1 + Math.sin(y * 0.7) * 1.4);
          c = depth > 14 ? C.waterDeep : C.water;
          if (above && wave > -0.2) c = C.waterFoam;
          else if (wave > 0.93 && (y & 3) === 0) c = mix(C.water, C.waterFoam, 0.6);
          break;
        }
        default: c = C.dirt;
      }
      s.color[y * width + x] = c;
    }
  }
  // Grass tufts on the surface.
  for (let x = 4; x < 188; x += 7) {
    const top = terrain.surfaceY(x);
    if (hash2(x, 3) < 0.6) {
      s.set(x, top - 1, C.grass);
      if (hash2(x, 9) < 0.5) s.set(x + 1, top - 2, C.grassDark);
    }
  }
}

function drawHut(s: PixelSurface, world: World, ground: number): void {
  if (world.hut) {
    s.rect(106, ground - 46, 57, 46, C.woodDark);
    for (let y = ground - 42; y < ground; y += 4) s.rect(110, y, 49, 3, C.wood);
    s.rect(101, ground - 52, 67, 7, C.door);
    s.rect(108, ground - 59, 53, 7, C.roof);
    s.rect(117, ground - 66, 35, 7, C.roofDark);
    for (let x = 101; x < 168; x += 4) s.set(x, ground - 46, C.roofDark);
    s.rect(127, ground - 21, 13, 21, C.door);
    s.set(137, ground - 11, C.window);
    s.rect(144, ground - 35, 9, 8, C.window);
    s.rect(148, ground - 35, 1, 8, C.woodDark);
    s.rect(144, ground - 31, 9, 1, C.woodDark);
  } else {
    s.rect(119, ground - 4, 34, 4, C.woodDark);
    s.rect(117, ground - 8, 38, 4, C.wood);
    if (world.task === "buildHut") {
      s.rect(123, ground - 28, 3, 20, C.woodDark);
      s.rect(145, ground - 28, 3, 20, C.woodDark);
      s.rect(121, ground - 30, 29, 3, C.wood);
    }
  }
}

function drawFence(s: PixelSurface, ground: number): void {
  s.rect(92, ground - 17, 97, 3, C.wood);
  s.rect(92, ground - 8, 97, 3, C.wood);
  for (let x = 92; x < 189; x += 11) {
    s.rect(x, ground - 21, 4, 21, C.woodDark);
    s.set(x + 1, ground - 22, C.woodDark);
    s.set(x + 2, ground - 22, C.woodDark);
  }
}

function drawCampfire(s: PixelSurface, ground: number, now: number): void {
  s.rect(96, ground - 3, 18, 3, C.barkDark);
  s.rect(98, ground - 5, 14, 2, C.bark);
  for (let i = 0; i < 26; i++) {
    const fx = 100 + (i % 10);
    const life = (now * 3.2 + hash2(i, 7)) % 1;
    const h = Math.round((1 - Math.abs(fx - 104.5) / 6) * 11 * (0.6 + hash2(i, Math.floor(now * 9)) * 0.4));
    const y = ground - 5 - Math.round(life * h);
    const level = Math.min(3, Math.floor((1 - life) * 3.4 + (Math.abs(fx - 104.5) < 2 ? 1 : 0)));
    s.set(fx, y, C.fire[level]);
    s.set(fx, y + 1, C.fire[Math.max(0, level - 1)]);
  }
  // Rising embers.
  for (let i = 0; i < 3; i++) {
    const t = (now * 0.6 + i / 3) % 1;
    s.set(103 + Math.round(Math.sin(t * 9 + i) * 3), ground - 14 - Math.round(t * 18), C.fire[1]);
  }
}

function drawMonster(s: PixelSurface, ground: number, now: number): void {
  const bob = Math.round(Math.sin(now * 3) * 1);
  s.rect(182, ground - 21 + bob, 15, 21 - bob, C.monster);
  s.rect(180, ground - 29 + bob, 19, 12, C.monsterLight);
  s.rect(185, ground - 25 + bob, 3, 3, C.monsterEye);
  s.rect(193, ground - 25 + bob, 3, 3, C.monsterEye);
  s.rect(186, ground - 20 + bob, 8, 1, C.monster);
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
      s.set(bobX, bobY - 1, rgb("#d9524a"));
      break;
    }
    case "none":
      break;
  }
}

function drawStickman(s: PixelSurface, actor: Actor, now: number): void {
  const p = actor.body.p;
  // Sample half a pixel up so feet resting on a surface sit on top of it.
  for (const [a, b] of BONES) {
    s.line(p[a].x, p[a].y - 0.5, p[b].x, p[b].y - 0.5, C.stick);
  }
  const head = p[Joint.Head];
  const neck = p[Joint.Neck];
  // Head circle sits above the neck point, in the direction of the spine.
  let hx = head.x - neck.x;
  let hy = head.y - neck.y;
  const hl = Math.hypot(hx, hy) || 1;
  hx /= hl;
  hy /= hl;
  s.circle(head.x + hx * 0.8, head.y - 0.5 + hy * 0.8, 3, C.stick);
  drawTool(s, actor, now);
}

/** Stepped light: multiplicative night tint plus banded warm firelight. */
function makeLight(world: World, night: number, ground: number, now: number) {
  const mr = 1 - night * 0.62;
  const mg = 1 - night * 0.55;
  const mb = 1 - night * 0.36;
  const fire = world.campfire && night > 0.2;
  const fx = 105;
  const fy = ground - 6;
  const flicker = 1 + Math.sin(now * 11) * 0.04 + Math.sin(now * 17) * 0.03;
  const radius = 34 * flicker;
  return (x: number, y: number, out: Float32Array): void => {
    out[0] = mr; out[1] = mg; out[2] = mb; out[3] = 0;
    if (!fire) return;
    const d = Math.hypot(x - fx, (y - fy) * 1.25) / radius;
    if (d >= 1) return;
    const level = Math.floor((1 - d) * 4 + bayer(x, y) * 0.9) / 4;
    const k = level * night;
    out[0] = mr + (1 - mr) * k;
    out[1] = mg + (1 - mg) * k * 0.85;
    out[2] = mb + (1 - mb) * k * 0.5;
    out[3] = k * 36;
  };
}

export function render(
  ctx: CanvasRenderingContext2D,
  world: World,
  terrain: Terrain,
  actor: Actor,
  tilt: number,
  nowSeconds: number
): void {
  const s = surface;
  const daylight = Math.max(0, Math.sin(dayFraction(world) * Math.PI * 2));
  const night = 1 - daylight;
  const ground = terrain.surfaceY(130);

  drawSky(s, world, tilt, night);
  drawHills(s, tilt);
  drawTree(s, 28, terrain.surfaceY(28), 4);
  drawTree(s, 60, terrain.surfaceY(60), 0);
  drawTree(s, 82, terrain.surfaceY(82), 7);
  if (world.fence) drawFence(s, ground);
  drawHut(s, world, ground);
  drawTerrain(s, terrain, nowSeconds);
  if (world.campfire) drawCampfire(s, ground, nowSeconds);
  if (world.monster) drawMonster(s, ground, nowSeconds);
  drawStickman(s, actor, nowSeconds);

  s.present(ctx, makeLight(world, night, ground, nowSeconds));
}
