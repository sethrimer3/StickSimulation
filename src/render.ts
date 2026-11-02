import { dayFraction, LOGICAL_SIZE, type Task, type World } from "./world";

const STARS: Array<[number, number]> = [
  [11, 13], [35, 26], [56, 9], [79, 33], [103, 15], [141, 22], [167, 10],
  [198, 31], [224, 14], [246, 34], [21, 62], [95, 57], [158, 49], [231, 67]
];

function rect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, variation: number): void {
  rect(ctx, "#66492d", x - 3, y - 26, 6, 26);
  rect(ctx, "#235638", x - 16, y - 45, 32, 19);
  rect(ctx, "#307348", x - 13, y - 57 - variation, 26, 17);
  rect(ctx, "#408451", x - 8, y - 64 - variation, 17, 15);
  rect(ctx, "#56995a", x - 8, y - 47, 7, 4);
}

function drawHut(ctx: CanvasRenderingContext2D, world: World): void {
  if (world.hut) {
    rect(ctx, "#82613c", 106, 153, 57, 44);
    rect(ctx, "#9e7648", 112, 158, 44, 32);
    rect(ctx, "#483b35", 101, 147, 67, 8);
    rect(ctx, "#7b4840", 108, 139, 53, 8);
    rect(ctx, "#6c3c33", 117, 131, 35, 8);
    rect(ctx, "#42302a", 127, 177, 13, 20);
    rect(ctx, "#eab86d", 144, 163, 9, 8);
  } else {
    rect(ctx, "#94774f", 119, 190, 34, 5);
    rect(ctx, "#c5a16d", 117, 186, 38, 4);
    if (world.task === "buildHut") rect(ctx, "#ad8455", 123, 171, 24, 15);
  }
}

function drawFence(ctx: CanvasRenderingContext2D): void {
  for (let x = 92; x < 189; x += 11) {
    rect(ctx, "#77583b", x, 178, 5, 21);
    rect(ctx, "#a47d4c", x + 1, 174, 3, 5);
  }
  rect(ctx, "#a47d4c", 92, 182, 97, 4);
  rect(ctx, "#a47d4c", 92, 192, 97, 4);
  rect(ctx, "#42533c", 120, 182, 22, 17);
}

function drawCharacter(ctx: CanvasRenderingContext2D, world: World, nowSeconds: number): void {
  const x = Math.round(world.characterX);
  const walking = world.task === "gather" || world.task === "fish" || world.task === "wander";
  const swing = walking ? Math.round(Math.sin(nowSeconds * 8) * 4) : 0;
  const chopping = world.task === "gather" ? Math.round(Math.sin(nowSeconds * 6) * 6) : 0;
  const y = 193 + (walking ? Math.round(Math.sin(nowSeconds * 16)) : 0);
  // A bright outline preserves readability at tiny physical sizes.
  rect(ctx, "#f3dfad", x - 4, y - 29, 9, 9);
  rect(ctx, "#293b3b", x - 5, y - 31, 10, 4);
  rect(ctx, "#243e50", x - 3, y - 19, 7, 12);
  rect(ctx, "#22323c", x - 3 - swing, y - 7, 3, 9);
  rect(ctx, "#22323c", x + 3 + swing, y - 7, 3, 9);
  rect(ctx, "#e6c899", x - 9, y - 18, 5, 3);
  rect(ctx, "#e6c899", x + 4, y - 18 + chopping, 6, 3);
  if (world.task === "gather") {
    rect(ctx, "#b8c5c8", x + 9, y - 22 + chopping, 8, 4);
    rect(ctx, "#7c5e3a", x + 9, y - 21 + chopping, 3, 9);
  }
  if (world.task === "fish") {
    rect(ctx, "#c0b295", x + 8, y - 26, 2, 21);
    rect(ctx, "#d6d4ba", x + 9, y - 26, 15, 1);
    rect(ctx, "#d6d4ba", x + 23, y - 26, 1, 17);
  }
  if (world.task === "defend") {
    rect(ctx, "#b9c4d3", x + 7, y - 27, 3, 18);
    rect(ctx, "#a68255", x + 3, y - 13, 11, 3);
  }
}

export function render(
  ctx: CanvasRenderingContext2D,
  world: World,
  tilt: number,
  nowSeconds: number
): void {
  ctx.imageSmoothingEnabled = false;
  const daylight = Math.max(0, Math.sin(dayFraction(world) * Math.PI * 2));
  const night = 1 - daylight;
  const sky = ctx.createLinearGradient(0, 0, 0, 190);
  sky.addColorStop(0, "#243c63");
  sky.addColorStop(1, "#a1c3a8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

  ctx.save();
  ctx.translate(Math.round(tilt * 4), 0);
  const sunX = 20 + dayFraction(world) * 205;
  const sunY = 104 - Math.sin(dayFraction(world) * Math.PI) * 72;
  rect(ctx, "#f3db8b", sunX, sunY, 12, 12);
  for (const [sx, sy] of STARS) {
    if (night > 0.38) rect(ctx, "#f6e9c5", sx, sy, 2, 2);
  }
  rect(ctx, "#6d8c7b", 0, 129, 260, 54);
  for (let x = -14; x < 270; x += 36) {
    rect(ctx, "#527c69", x, 124 + (x % 3) * 7, 48, 57);
  }
  rect(ctx, "#63885c", 0, 183, 256, 73);
  rect(ctx, "#517248", 0, 207, 256, 49);
  rect(ctx, "#72995d", 0, 200, 256, 6);
  for (let x = 9; x < 195; x += 23) {
    rect(ctx, "#86a465", x, 205 + (x % 4) * 7, 3, 5);
  }
  rect(ctx, "#315e84", 199, 192, 57, 64);
  rect(ctx, "#427ba4", 204, 196, 52, 60);
  for (let y = 205; y < 253; y += 12) {
    rect(ctx, "#82acc1", 210 + (y % 13), y, 14, 2);
  }
  drawTree(ctx, 28, 194, 4);
  drawTree(ctx, 60, 197, 0);
  drawTree(ctx, 82, 201, 7);
  if (world.fence) drawFence(ctx);
  drawHut(ctx, world);
  if (world.campfire) {
    rect(ctx, "#6f4b2d", 96, 195, 18, 4);
    rect(ctx, "#db863e", 102, 187, 8, 8);
    rect(ctx, "#f0d47c", 105, 183 + Math.sin(nowSeconds * 8) * 2, 3, 7);
  }
  if (world.monster) {
    rect(ctx, "#583c66", 182, 174, 15, 21);
    rect(ctx, "#795184", 180, 166, 19, 13);
    rect(ctx, "#f1b1a5", 185, 171, 3, 3);
    rect(ctx, "#f1b1a5", 193, 171, 3, 3);
  }
  drawCharacter(ctx, world, nowSeconds);
  ctx.restore();

  rect(ctx, `rgba(8, 17, 36, ${(night * 0.58).toFixed(3)})`, 0, 0, 256, 256);
  // A tiny simulated fire glow breaks up the nighttime darkness.
  if (world.campfire && night > 0.3) {
    rect(ctx, `rgba(245, 165, 71, ${(night * 0.34).toFixed(3)})`, 92, 177, 26, 25);
  }
}
