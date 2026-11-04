import { WOODPILE_X, YARD_X, type Colony, type Settler } from "./colony";
import { isBuiltWall, Material, MATERIALS, MATERIAL_LIST, WallKind, WALL_PALETTES } from "./materials";
import { bayer, hash2, mix, PixelSurface, rgb, type Rgb } from "./pixels";
import { BONES, Joint } from "./stickman";
import type { Terrain } from "./terrain";
import type { Weather } from "./weather";
import { dayFraction, daylight, LOGICAL_SIZE } from "./world";

const S = LOGICAL_SIZE;

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
  stick: rgb("#f2efe6"),
  metal: rgb("#b8c5c8"),
  metalDark: rgb("#7e8b90"),
  handle: rgb("#7c5e3a"),
  book: [rgb("#a33b32"), rgb("#3a6aa0"), rgb("#3f8a4e"), rgb("#c9a33b"), rgb("#6a3f8a")],
  shelfWood: rgb("#7a5634"),
  shelfBoard: rgb("#94704a"),
  bedPost: rgb("#a07a4c"),
  shelfBack: rgb("#2a1d12"),
  pillow: rgb("#e8e0d0"),
  blanket: rgb("#b84a4a"),
  blanketDark: rgb("#8a3434"),
  bedFrame: rgb("#8a6440"),
  deskTop: rgb("#c0955e"),
  deskLeg: rgb("#94704a"),
  paper: rgb("#e8dcc0"),
  iron: rgb("#3a3840"),
  ironLight: rgb("#55525c"),
  brew: [rgb("#5fc45a"), rgb("#8ae36a"), rgb("#3f9a4a")],
  rail: rgb("#8a6a40"),
  rung: rgb("#a07c4c"),
  doorDark: rgb("#42302a"),
  doorKnob: rgb("#d9b44a"),
  log: rgb("#6d4c2e"),
  logEnd: rgb("#c9a36b"),
  marker: rgb("#f5d36a"),
  rope: rgb("#c9b48a"),
  bucket: rgb("#5a4a3a"),
  bucketRim: rgb("#8a8f96"),
  wheel: rgb("#3e2b1a")
};

const PALETTES = MATERIAL_LIST.map((m) => MATERIALS[m].palette);
const GLOW = MATERIAL_LIST.map((m) => MATERIALS[m].glow);
const FLAMMABLE = MATERIAL_LIST.map((m) => MATERIALS[m].flammability > 0);
const BODY_SOLID = MATERIAL_LIST.map((m) => MATERIALS[m].bodySolid);

const surface = new PixelSurface(S, S);
/** 1 where the pixel shows only sky/backdrop, which firelight doesn't touch. */
const backdrop = new Uint8Array(S * S);

export interface View {
  colony: Colony;
  terrain: Terrain;
  weather: Weather;
  /** World position of the view's top-left pixel. */
  camX: number;
  camY: number;
  now: number;
  followed: Settler | null;
}

// ---- backdrop --------------------------------------------------------------------

function drawSky(s: PixelSurface, v: View, night: number): void {
  const gloom = v.weather.rainingNear(v.camX + S / 2) ? 0.7 : 0;
  const top = mix(C.skyTop, C.rainSkyTop, gloom);
  const bottom = mix(C.skyBottom, C.rainSkyBottom, gloom);
  // The gradient is tied to world height so it reads as altitude.
  for (let y = 0; y < S; y++) {
    const wy = v.camY + y;
    const t = Math.max(0, Math.min(1, (wy - 20) / 190));
    for (let x = 0; x < S; x++) {
      const band = Math.floor(t * 7 + bayer(x, y)) / 7;
      s.color[y * S + x] = mix(top, bottom, band);
    }
  }
  if (night > 0.38) {
    for (let k = 0; k < 40; k++) {
      const sx = Math.floor(hash2(k, 3) * S - v.camX * 0.05);
      const sy = Math.floor(hash2(k, 4) * 140 - v.camY * 0.1);
      if (sy >= 0 && sy < S) s.set(((sx % S) + S) % S, sy, C.star);
    }
  }
  const f = dayFraction(v.colony.elapsed);
  const sunX = 20 + f * 205;
  const sunY = 104 - Math.sin(f * Math.PI) * 72 - (v.camY - 72) * 0.15;
  s.fillCircle(sunX + 6, sunY + 6, 6, C.sun);
  s.fillCircle(sunX + 5, sunY + 5, 3, C.sunCore);
}

function drawHills(s: PixelSurface, v: View): void {
  for (let x = 0; x < S; x++) {
    const fx = v.camX * 0.4 + x;
    const far = 150 + Math.round(Math.sin(fx / 23) * 6 + Math.sin(fx / 9) * 2) - Math.round(v.camY * 0.6 - 43);
    for (let y = Math.max(0, far); y < S; y++) s.color[y * S + x] = C.hillFar;
    const nx = v.camX * 0.6 + x;
    const near = 168 + Math.round((Math.sin(nx / 31) * 9 + Math.sin(nx / 12) * 3) / 3) * 3 - Math.round(v.camY * 0.75 - 54);
    for (let y = Math.max(0, near); y < S; y++) s.color[y * S + x] = y === near ? mix(C.hillNear, C.hillFar, 0.5) : C.hillNear;
  }
}

function drawClouds(s: PixelSurface, v: View): void {
  for (const c of v.weather.clouds) {
    const raining = c.rain > 0;
    const body = raining ? C.rainCloud : C.cloud;
    const shade = raining ? C.rainCloudShade : C.cloudShade;
    const half = c.width / 2;
    for (let px = -half; px <= half; px++) {
      const x = Math.round(c.x + px - v.camX);
      if (x < 0 || x >= S) continue;
      const edge = 1 - Math.abs(px) / half;
      const lumps = Math.sin(px * 0.35 + c.seed) * 2 + Math.sin(px * 0.13 + c.seed * 2) * 3;
      const h = Math.max(1, Math.round(edge * 7 + lumps * edge + 2));
      for (let py = 0; py < h; py++) s.set(x, Math.round(c.y + 5 - py - v.camY), py < 2 ? shade : body);
    }
  }
}

// ---- cells ---------------------------------------------------------------------------

function wallColor(w: WallKind, x: number, y: number): Rgb {
  const pal = WALL_PALETTES[w];
  switch (w) {
    case WallKind.PlankWall:
      return x % 6 === 0 ? pal[3] : pal[(hash2(Math.floor(x / 6), Math.floor(y / 9)) * 3) | 0];
    case WallKind.BrickWall: {
      const row = Math.floor(y / 4);
      const mortar = y % 4 === 0 || (x + (row % 2) * 4) % 8 === 0;
      return mortar ? pal[3] : pal[(hash2(Math.floor((x + (row % 2) * 4) / 8), row) * 2) | 0];
    }
    default:
      return pal[(hash2(x >> 1, y >> 1) * 4) | 0];
  }
}

function cellColor(t: Terrain, m: Material, x: number, y: number, i: number, now: number, flick: number): Rgb {
  const pal = PALETTES[m];
  const W = t.width;
  const above = y > 0 ? t.cells[i - W] : 0;
  const below = y < t.height - 1 ? t.cells[i + W] : 0;
  const left = x > 0 ? t.cells[i - 1] : 0;
  const right = x < W - 1 ? t.cells[i + 1] : 0;
  switch (m) {
    case Material.Bookshelf: {
      // Frame round the edges, a shelf board every 7 rows, books standing on each shelf.
      const edgeL = left !== m || (x > 1 && t.cells[i - 2] !== m);
      const edgeR = right !== m || (x < W - 2 && t.cells[i + 2] !== m);
      if (edgeL || edgeR || above !== m || below !== m || y % 7 === 0) return y % 7 === 0 && !edgeL && !edgeR ? C.shelfBoard : C.shelfWood;
      const row = Math.floor(y / 7);
      const book = Math.floor((x + row * 3) / 2);
      const h = hash2(book, row);
      if (h < 0.1) return C.shelfBack;
      // Some books are shorter than the shelf.
      if (h > 0.75 && y % 7 === 1) return C.shelfBack;
      const c = C.book[(hash2(book, row + 50) * C.book.length) | 0];
      return (x + row) % 2 === 0 ? c : mix(c, C.shelfBack, 0.25);
    }
    case Material.Bed: {
      const r = t.cells;
      const mattress = left === m && right === m && r[i - 2] === m && r[i + 2] === m;
      if (!mattress) return above !== m ? C.bedPost : C.bedFrame;
      if (below !== m) return C.bedFrame;
      // Pillow near the headboard, blanket over the rest.
      let fromHead = 0;
      while (fromHead < 8 && r[i - fromHead - 1] === m) fromHead++;
      if (fromHead < 7 && above !== m) return C.pillow;
      if (fromHead < 7) return mix(C.pillow, C.bedFrame, 0.3);
      return above !== m ? C.blanket : C.blanketDark;
    }
    case Material.Desk:
      if (below === Material.Desk && above === m) return C.deskLeg;
      if (above !== m && below !== m) return C.deskTop;
      if (left !== m || right !== m) return below === Material.Desk || below === 0 ? C.deskLeg : C.deskTop;
      return t.cells[i + W * 2] === Material.Desk && below === m ? C.paper : C.deskTop;
    case Material.Cauldron:
      if (above !== m && below === m) return C.brew[(x + flick) % 3];
      if (left !== m || right !== m) return C.iron;
      return (x + y) % 5 === 0 ? C.ironLight : mix(C.iron, C.ironLight, 0.5);
    case Material.Torch:
      return C.fire[(x * 3 + y + flick) & 3];
    case Material.Ladder:
      return y % 4 === 0 ? C.rung : C.rail;
    case Material.Scaffold:
      // Rough boards with a dark underside.
      if (below !== m && below !== Material.ScaffoldPole) return pal[2];
      return x % 5 === 0 ? pal[1] : pal[0];
    case Material.Furnace: {
      // Brick courses; the edges of the mouth glow hot.
      const row = Math.floor(y / 3);
      if (y % 3 === 0 || (x + (row % 2) * 3) % 6 === 0) return pal[3];
      const nearMouth = left === Material.Empty || right === Material.Empty || below === Material.Empty || left === Material.Hearth || right === Material.Hearth;
      return nearMouth ? mix(pal[1], C.fire[1], 0.35 + ((x + flick) & 1) * 0.2) : pal[(x + row) % 2];
    }
    case Material.Anvil:
      if (above !== m) return pal[3];
      return left !== m || right !== m ? pal[2] : pal[(x + y) % 2];
    case Material.Beam:
      return (x + y) % 7 === 0 ? pal[2] : pal[(x + y) & 1];
    case Material.ScaffoldPole:
      // Lashings every few pixels.
      return y % 6 === 0 ? pal[2] : (x + y) % 2 === 0 ? pal[0] : pal[3];
    case Material.Platform:
      return below !== m && below !== Material.Ladder ? pal[3] : pal[(x >> 2) & 1];
    case Material.Door: {
      if (left !== m && right !== m) return pal[0];
      if (above !== m) return C.doorDark;
      return (y % 7 === 3 && right !== m) ? C.doorKnob : pal[1];
    }
    case Material.Fire: {
      const level = Math.min(3, Math.floor(t.life[i] / 6) + ((x + y + flick) & 1));
      return C.fire[level];
    }
    case Material.Hearth:
      return pal[(t.shade[i] + ((x * 3 + flick) % 4 === 0 ? 1 : 0)) & 3];
    case Material.Grass:
      return above === 0 && hash2(x, y) < 0.4 ? pal[2] : pal[t.shade[i]];
    case Material.Water: {
      const top = above !== Material.Water;
      const wave = Math.sin(x * 0.45 + now * 2.1 + Math.sin(y * 0.7) * 1.4);
      let c = top && wave > -0.2 ? pal[2] : pal[0];
      if (!top && wave > 0.93 && (y & 3) === 0) c = mix(pal[0], pal[2], 0.6);
      return c;
    }
    default: {
      let c = pal[t.shade[i]];
      if (t.life[i] > 0 && FLAMMABLE[m]) c = mix(c, C.fire[(x + y + flick) & 3], 0.55 + ((x ^ flick) & 1) * 0.3);
      return c;
    }
  }
}

function drawWorld(s: PixelSurface, v: View): void {
  const t = v.terrain;
  const { cells, walls } = t;
  const flick = Math.floor(v.now * 12);
  const cx = Math.floor(v.camX);
  const cy = Math.floor(v.camY);
  backdrop.fill(1);
  for (let sy = 0; sy < S; sy++) {
    const y = cy + sy;
    if (y < 0 || y >= t.height) continue;
    for (let sx = 0; sx < S; sx++) {
      const x = cx + sx;
      if (x < 0 || x >= t.width) continue;
      const i = y * t.width + x;
      const o = sy * S + sx;
      const m = cells[i] as Material;
      const w = walls[i] as WallKind;
      if (w !== WallKind.None) { s.color[o] = wallColor(w, x, y); backdrop[o] = 0; }
      if (m === Material.Empty) {
        // Ladders are drawn three pixels wide: side rails over the cells beside them.
        if ((x > 0 && cells[i - 1] === Material.Ladder) || (x < t.width - 1 && cells[i + 1] === Material.Ladder)) { s.color[o] = C.rail; backdrop[o] = 0; }
        continue;
      }
      backdrop[o] = 0;
      let c = cellColor(t, m, x, y, i, v.now, flick);
      if (m === Material.Water) c = mix(s.color[o], c, 0.82);
      else if (m === Material.Steam) c = mix(s.color[o], c, 0.45);
      else if (m === Material.Smoke) c = mix(s.color[o], c, 0.78);
      else if (m === Material.Ladder && y % 4 !== 0) c = s.color[o];
      s.color[o] = c;
    }
  }
}

// ---- piles, settlers --------------------------------------------------------------

function drawPiles(s: PixelSurface, v: View): void {
  const t = v.terrain;
  const res = v.colony.resources;
  const logs = Math.min(12, Math.floor(res.wood / 15));
  const wx = WOODPILE_X - v.camX;
  const wy = t.surfaceY(WOODPILE_X) - v.camY;
  for (let k = 0; k < logs; k++) {
    const row = Math.floor(k / 4);
    const col = k % 4;
    const lx = Math.round(wx - 10 + col * 5 + row * 2);
    const ly = Math.round(wy - 3 - row * 3);
    s.rect(lx, ly, 5, 3, C.log);
    s.set(lx, ly + 1, C.logEnd);
  }
  const ore = Math.min(40, Math.floor((res.stone + res.copper * 3 + res.silver * 4 + res.gold * 5) / 6));
  const yx = YARD_X - v.camX;
  const yy = t.surfaceY(YARD_X) - v.camY;
  const colors = [PALETTES[Material.Stone][0], PALETTES[Material.CopperOre][2], PALETTES[Material.SilverOre][2], PALETTES[Material.GoldOre][2]];
  for (let k = 0; k < ore; k++) {
    const h = Math.floor(Math.sqrt(k));
    const dx = Math.round((hash2(k, 1) - 0.5) * (14 - h * 2));
    const pick = res.gold >= 1 && k % 11 === 0 ? 3 : res.silver >= 1 && k % 7 === 0 ? 2 : res.copper >= 1 && k % 4 === 0 ? 1 : 0;
    s.set(Math.round(yx + dx), Math.round(yy - 1 - h), colors[pick]);
  }
}

/** The hoist: a spoked wheel on the headframe, the rope, and the bucket with its load. */
function drawHoist(s: PixelSurface, v: View): void {
  const h = v.colony.hoist;
  const wheel = v.colony.hoistWheel;
  const wx = Math.round(wheel.x - v.camX);
  const wy = Math.round(wheel.y - v.camY);
  const by = Math.round(h.y - v.camY);
  if (wx < -10 || wx > S + 10) return;
  // Rope down the shaft.
  s.line(wx + 4, wy, wx + 4, by - 4, C.rope);
  // Bucket, heaped when loaded.
  s.rect(wx + 2, by - 4, 5, 4, C.bucket);
  s.rect(wx + 2, by - 4, 5, 1, C.bucketRim);
  const loaded = h.load.stone + h.load.copper + h.load.silver + h.load.gold + h.load.dirt + h.load.sand > 0;
  if (loaded) {
    s.rect(wx + 3, by - 5, 3, 1, h.load.copper > 0 ? PALETTES[Material.CopperOre][2] : PALETTES[Material.Stone][0]);
    s.set(wx + 4, by - 6, h.load.gold > 0 ? PALETTES[Material.GoldOre][2] : h.load.silver > 0 ? PALETTES[Material.SilverOre][2] : PALETTES[Material.Stone][2]);
  }
  // Wheel, its spokes turning with the rope.
  s.circle(wx, wy, 4, C.wheel);
  const a = h.y * 0.25;
  for (let k = 0; k < 3; k++) {
    const ang = a + (k * Math.PI) / 3;
    s.line(wx - Math.cos(ang) * 3, wy - Math.sin(ang) * 3, wx + Math.cos(ang) * 3, wy + Math.sin(ang) * 3, C.wheel);
  }
  s.set(wx, wy, C.bucketRim);
}

/** The forge's ore heap and the smithy's bars, sparks flying while the smiths work. */
function drawForgeAndSmithy(s: PixelSurface, v: View): void {
  const col = v.colony;
  const oreColor = { copper: PALETTES[Material.CopperOre][2], silver: PALETTES[Material.SilverOre][2], gold: PALETTES[Material.GoldOre][2] };
  const barColor = { copper: rgb("#d07a3e"), silver: rgb("#dfe6ea"), gold: rgb("#f2c84a") };
  for (const r of col.roomsOf("forge")) {
    const furnace = col.rooms[r].spots.find((p) => p.kind === "furnace");
    if (!furnace) continue;
    // A heap of ore beside the furnace, coloured by what's in it.
    const total = col.forgeOre.copper + col.forgeOre.silver + col.forgeOre.gold;
    const n = Math.min(60, Math.round(total * 1.5));
    for (let k = 0; k < n; k++) {
      const h = Math.floor(Math.sqrt(k));
      const ox = Math.round((hash2(k, 5) - 0.5) * (14 - h * 2));
      const pick = k % 5 === 0 && col.forgeOre.gold > 0 ? "gold" : k % 3 === 0 && col.forgeOre.silver > 0 ? "silver" : "copper";
      s.set(Math.round(furnace.x + 8 + ox - v.camX), Math.round(furnace.y - 1 - h - v.camY), oreColor[pick]);
    }
  }
  for (const r of col.roomsOf("smithy")) {
    const spots = col.rooms[r].spots;
    const bench = spots.find((p) => p.kind === "desk");
    if (bench) {
      // Stacks of bars on the bench, a few of each metal.
      let k = 0;
      for (const m of ["copper", "silver", "gold"] as const) {
        const bars = Math.min(6, Math.floor(col.resources[`${m}Bar`]));
        for (let b = 0; b < bars; b++, k++) {
          const bx = Math.round(bench.x - 8 + (k % 6) * 3 - v.camX);
          const by = Math.round(bench.y - 15 - Math.floor(k / 6) * 2 - v.camY);
          s.rect(bx, by, 3, 1, barColor[m]);
        }
      }
    }
    if (col.ticksSince(col.smithBusyAt) < 25) {
      for (const anvil of spots.filter((p) => p.kind === "anvil")) {
        for (let k = 0; k < 4; k++) {
          const t = (v.now * 3 + k * 0.27) % 1;
          const sx = anvil.x - 13 + Math.round((hash2(k, Math.floor(v.now * 3)) - 0.5) * 14 * t);
          const sy = anvil.y - 10 - Math.round(Math.sin(t * Math.PI) * 6);
          s.set(Math.round(sx - v.camX), Math.round(sy - v.camY), C.fire[3 - (k & 1)]);
        }
      }
    }
  }
}

function drawHeld(s: PixelSurface, st: Settler, ox: number, oy: number): void {
  const p = st.body.p;
  const hand = p[Joint.HandR];
  const elbow = p[Joint.ElbowR];
  let dx = hand.x - elbow.x;
  let dy = hand.y - elbow.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const hx = hand.x - ox;
  const hy = hand.y - oy;
  const neck = p[Joint.Neck];
  switch (st.holding) {
    case "pick": {
      const ex = hx + dx * 6; const ey = hy + dy * 6;
      s.line(hx, hy, ex, ey, C.handle);
      s.line(ex - dy * 2, ey + dx * 2, ex + dy * 2, ey - dx * 2, C.metalDark);
      break;
    }
    case "axe": {
      const ex = hx + dx * 6; const ey = hy + dy * 6;
      s.line(hx, hy, ex, ey, C.handle);
      s.rect(ex - 1, ey - 1, 3, 3, C.metal);
      break;
    }
    case "hammer": {
      const ex = hx + dx * 5; const ey = hy + dy * 5;
      s.line(hx, hy, ex, ey, C.handle);
      s.rect(ex - 1, ey - 1, 3, 2, C.metalDark);
      break;
    }
    case "book":
      s.rect(hx - 1, hy - 2, 3, 3, C.book[st.name.length % C.book.length]);
      break;
    case "shovel": {
      const ex = hx + dx * 7; const ey = hy + dy * 7;
      s.line(hx, hy, ex, ey, C.handle);
      s.rect(ex - 1, ey - 1, 3, 3, C.metalDark);
      break;
    }
    case "flask":
      s.set(hx, hy - 1, C.brew[0]);
      s.set(hx, hy - 2, C.metal);
      break;
    case "log":
      s.rect(neck.x - ox - 5, neck.y - oy - 2, 10, 2, C.log);
      s.set(neck.x - ox - 5, neck.y - oy - 2, C.logEnd);
      break;
    case "ore":
      s.rect(neck.x - ox - 2, neck.y - oy - 3, 4, 3, PALETTES[Material.CopperOre][1]);
      break;
    default:
      break;
  }
}

function drawSettler(s: PixelSurface, st: Settler, v: View): void {
  const p = st.body.p;
  const ox = v.camX;
  const oy = v.camY + 0.5;
  // Remember the pixels under the figure so the ones it covers take firelight like the world.
  let x0 = S, y0 = S, x1 = -1, y1 = -1;
  for (const pt of p) { x0 = Math.min(x0, pt.x - ox); y0 = Math.min(y0, pt.y - oy); x1 = Math.max(x1, pt.x - ox); y1 = Math.max(y1, pt.y - oy); }
  const bx0 = Math.max(0, Math.floor(x0 - 8));
  const by0 = Math.max(0, Math.floor(y0 - 8));
  const bx1 = Math.min(S - 1, Math.ceil(x1 + 8));
  const by1 = Math.min(S - 1, Math.ceil(y1 + 2));
  const before: number[] = [];
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) before.push(s.color[y * S + x]);
  const head = p[Joint.Head];
  const neck = p[Joint.Neck];
  let hx = head.x - neck.x;
  let hy = head.y - neck.y;
  const hl = Math.hypot(hx, hy) || 1;
  hx /= hl; hy /= hl;
  const cxh = Math.round(head.x - ox + hx * 0.8);
  const cyh = Math.round(head.y - oy + hy * 0.8);
  for (const [a, b] of BONES) {
    if (a === Joint.Head || b === Joint.Head) continue;
    s.line(p[a].x - ox, p[a].y - oy, p[b].x - ox, p[b].y - oy, C.stick);
  }
  // The neck runs from the shoulders only up to the edge of the head, never inside it.
  const nx = neck.x - ox;
  const ny = neck.y - oy;
  const dx = nx - cxh;
  const dy = ny - cyh;
  const along = Math.max(Math.abs(dx), Math.abs(dy));
  if (along > 2.5) {
    const k = 2.5 / along;
    s.line(nx, ny, cxh + dx * k, cyh + dy * k, C.stick);
  }
  // A hollow square head, 5 pixels across.
  s.rect(cxh - 2, cyh - 2, 5, 1, C.stick);
  s.rect(cxh - 2, cyh + 2, 5, 1, C.stick);
  s.rect(cxh - 2, cyh - 1, 1, 3, C.stick);
  s.rect(cxh + 2, cyh - 1, 1, 3, C.stick);
  drawHeld(s, st, ox, oy);
  let k = 0;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (s.color[y * S + x] !== before[k++]) backdrop[y * S + x] = 0;
  if (st === v.followed) {
    const mx = Math.round(head.x - ox);
    const my = Math.round(head.y - oy - 7);
    s.set(mx, my + 1, C.marker);
    s.rect(mx - 1, my, 3, 1, C.marker);
  }
}

// ---- lighting ----------------------------------------------------------------------

const BLOCK = 4;
const MARGIN = 10;
const LB = S / BLOCK + MARGIN * 2;
const skyLight = new Float32Array(LB * LB);
const emitLight = new Float32Array(LB * LB);
const opaque = new Uint8Array(LB * LB);
let lightOriginX = 0;
let lightOriginY = 0;

/** Light spreads block by block from open sky and from glowing cells, losing strength in rock. */
function computeLight(v: View): void {
  const t = v.terrain;
  const bx0 = Math.floor(v.camX / BLOCK) - MARGIN;
  const by0 = Math.floor(v.camY / BLOCK) - MARGIN;
  lightOriginX = bx0 * BLOCK;
  lightOriginY = by0 * BLOCK;
  for (let by = 0; by < LB; by++) {
    for (let bx = 0; bx < LB; bx++) {
      const k = by * LB + bx;
      let solid = 0;
      let sky = 0;
      let glow = 0;
      for (let yy = 0; yy < BLOCK; yy++) {
        const y = (by0 + by) * BLOCK + yy;
        for (let xx = 0; xx < BLOCK; xx++) {
          const x = (bx0 + bx) * BLOCK + xx;
          if (!t.inBounds(x, y)) { if (y < 0) sky++; else solid++; continue; }
          const i = y * t.width + x;
          const m = t.cells[i];
          if (BODY_SOLID[m]) solid++;
          else {
            const w = t.walls[i] as WallKind;
            sky += w === WallKind.None ? 1 : isBuiltWall(w) ? 0.8 : 0;
          }
          glow += GLOW[m] + (t.life[i] > 0 && FLAMMABLE[m] ? 0.8 : 0);
        }
      }
      opaque[k] = solid > 10 ? 1 : 0;
      skyLight[k] = sky / 16;
      emitLight[k] = Math.min(1.6, glow * 0.9);
    }
  }
  for (const st of v.colony.settlers) {
    const bx = Math.floor(st.body.feetX / BLOCK) - bx0;
    const by = Math.floor((st.body.feetY - 8) / BLOCK) - by0;
    if (bx >= 0 && by >= 0 && bx < LB && by < LB) emitLight[by * LB + bx] = Math.max(emitLight[by * LB + bx], v.colony.forged.has("lanterns") ? 0.85 : 0.55);
  }
  spread(skyLight, 0.08, 0.24, 12);
  spread(emitLight, 0.075, 0.22, 14);
  blur(skyLight);
  blur(emitLight);
}

const scratch = new Float32Array(LB * LB);
/** A 3×3 box blur, so light pools are round rather than diamond-shaped. */
function blur(field: Float32Array): void {
  for (let by = 0; by < LB; by++) {
    for (let bx = 0; bx < LB; bx++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const y = by + dy;
        if (y < 0 || y >= LB) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const x = bx + dx;
          if (x < 0 || x >= LB) continue;
          sum += field[y * LB + x];
          n++;
        }
      }
      scratch[by * LB + bx] = sum / n;
    }
  }
  field.set(scratch);
}

function spread(field: Float32Array, airLoss: number, rockLoss: number, passes: number): void {
  for (let p = 0; p < passes; p++) {
    const forward = p % 2 === 0;
    for (let n = 0; n < LB * LB; n++) {
      const k = forward ? n : LB * LB - 1 - n;
      const bx = k % LB;
      const by = (k / LB) | 0;
      const loss = opaque[k] ? rockLoss : airLoss;
      const diag = loss * 1.41;
      let best = field[k];
      if (bx > 0) best = Math.max(best, field[k - 1] - loss);
      if (bx < LB - 1) best = Math.max(best, field[k + 1] - loss);
      if (by > 0) {
        best = Math.max(best, field[k - LB] - loss);
        if (bx > 0) best = Math.max(best, field[k - LB - 1] - diag);
        if (bx < LB - 1) best = Math.max(best, field[k - LB + 1] - diag);
      }
      if (by < LB - 1) {
        best = Math.max(best, field[k + LB] - loss);
        if (bx > 0) best = Math.max(best, field[k + LB - 1] - diag);
        if (bx < LB - 1) best = Math.max(best, field[k + LB + 1] - diag);
      }
      field[k] = best;
    }
  }
}

function sample(field: Float32Array, wx: number, wy: number): number {
  const fx = (wx - lightOriginX) / BLOCK - 0.5;
  const fy = (wy - lightOriginY) / BLOCK - 0.5;
  const x0 = Math.max(0, Math.min(LB - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(LB - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - x0));
  const ty = Math.max(0, Math.min(1, fy - y0));
  const k = y0 * LB + x0;
  const a = field[k] * (1 - tx) + field[k + 1] * tx;
  const b = field[k + LB] * (1 - tx) + field[k + LB + 1] * tx;
  return a * (1 - ty) + b * ty;
}

function makeLight(v: View, sun: number) {
  const day = 0.18 + sun * 0.82;
  const sr = day * (1 - (1 - sun) * 0.25);
  const sg = day * (1 - (1 - sun) * 0.18);
  const sb = day;
  return (x: number, y: number, out: Float32Array): void => {
    const wx = v.camX + x;
    const wy = v.camY + y;
    const sky = backdrop[y * S + x] ? 1 : Math.min(1, sample(skyLight, wx, wy));
    const emit = backdrop[y * S + x] ? 0 : Math.min(1, sample(emitLight, wx, wy));
    const d = bayer(x, y) * 0.9;
    const skyQ = Math.floor(sky * 6 + d) / 6;
    const emitQ = Math.floor(emit * 5 + d) / 5;
    // A little light everywhere, so the dug-out mine still reads as a cutaway.
    const ambient = 0.27;
    out[0] = Math.min(1.15, ambient + skyQ * sr + emitQ * 0.95);
    out[1] = Math.min(1.1, ambient + skyQ * sg + emitQ * 0.75);
    out[2] = Math.min(1.1, ambient * 1.3 + skyQ * sb + emitQ * 0.45);
    out[3] = emitQ * 18;
  };
}

export function render(ctx: CanvasRenderingContext2D, v: View): void {
  const s = surface;
  const sun = daylight(v.colony.elapsed);
  drawSky(s, v, 1 - sun);
  drawHills(s, v);
  drawClouds(s, v);
  drawWorld(s, v);
  drawPiles(s, v);
  drawHoist(s, v);
  drawForgeAndSmithy(s, v);
  for (const st of v.colony.settlers) drawSettler(s, st, v);
  computeLight(v);
  s.present(ctx, makeLight(v, sun));
}
