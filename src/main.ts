import "./style.css";
import { Actor } from "./actor";
import { MotionInput } from "./input";
import { Material } from "./materials";
import { clearSave, loadGrid, loadWorld, saveGrid, saveWorld } from "./persistence";
import { render } from "./render";
import { simulate, taskLabel } from "./simulation";
import { Structures } from "./structures";
import { Terrain } from "./terrain";
import { Weather } from "./weather";
import { createWorld, dayFraction, dayNumber, LOGICAL_SIZE, suggest } from "./world";

const canvas = document.querySelector<HTMLCanvasElement>("#world");
const context = canvas?.getContext("2d", { alpha: false });
const age = document.querySelector<HTMLElement>("#age");
const activity = document.querySelector<HTMLElement>("#activity");
const resources = document.querySelector<HTMLElement>("#resources");
const eventLabel = document.querySelector<HTMLElement>("#event");
const motionButton = document.querySelector<HTMLButtonElement>("#motion");
const resetButton = document.querySelector<HTMLButtonElement>("#reset");
const elementButtons = document.querySelectorAll<HTMLButtonElement>("[data-element]");

if (!canvas || !context || !age || !activity || !resources || !eventLabel || !motionButton || !resetButton) {
  throw new Error("Missing StickSimulation interface elements");
}

if (new URLSearchParams(window.location.search).has("frame")) {
  document.body.classList.add("frame-only");
}

let world = loadWorld();
const terrain = new Terrain();
const structures = new Structures();
const weather = new Weather();
const savedBuilt = loadGrid(terrain);
if (savedBuilt) structures.built = savedBuilt;
else structures.stampAll(terrain, world);
let actor = new Actor(world, terrain);
/** Material poured by touch, or null for "suggest" mode. */
let brush: Material | "erase" | null = null;
let painting = false;
let lastFrame = performance.now();
const motion = new MotionInput();
let keyboardTilt = 0;
let visualTilt = 0;
let lastUpdate = Date.now();
let lastStatus = 0;

function updateStatus(): void {
  age!.textContent = `Day ${dayNumber(world)}`;
  activity!.textContent = taskLabel(world.task);
  resources!.textContent = `${world.wood} wood · ${world.fish} fish`;
  eventLabel!.textContent = world.lastEvent;
}

function toLogical(event: PointerEvent): { x: number; y: number } {
  const bounds = canvas!.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * LOGICAL_SIZE,
    y: ((event.clientY - bounds.top) / bounds.height) * LOGICAL_SIZE
  };
}

function paintAt(x: number, y: number): void {
  if (brush === null) return;
  if (brush === "erase") terrain.paint(x, y, 4, Material.Empty, true);
  else terrain.paint(x, y, brush === Material.Fire ? 2 : 3, brush);
}

canvas.addEventListener("pointerdown", (event) => {
  const { x, y } = toLogical(event);

  // Like Stick Ranger, any joint of the stickman can be grabbed and flung.
  if (actor.body.grab(x, y)) {
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  if (brush !== null) {
    painting = true;
    canvas.setPointerCapture(event.pointerId);
    paintAt(x, y);
    return;
  }

  if (x < 90 && y > 90) suggest(world, "gather");
  else if (x > 195 && y > 140) suggest(world, "fish");
  else if (x >= 110 && x <= 168 && y > 115) suggest(world, "buildHut");

  updateStatus();
});

canvas.addEventListener("pointermove", (event) => {
  const { x, y } = toLogical(event);
  if (actor.body.dragging) actor.body.moveGrab(x, y);
  else if (painting) paintAt(x, y);
});

const releasePointer = (): void => {
  actor.body.release();
  painting = false;
};
canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
window.addEventListener("blur", releasePointer);

elementButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const value = button.dataset.element ?? "suggest";
    brush = value === "suggest" ? null : value === "erase" ? "erase" : Material[value as keyof typeof Material];
    elementButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  });
});

motionButton.addEventListener("click", async () => {
  motionButton.textContent = await motion.enable();
});

resetButton.addEventListener("click", () => {
  if (!window.confirm("Restart this world? Saved progression will be lost.")) return;
  clearSave();
  world = createWorld();
  terrain.generate();
  structures.stampAll(terrain, world);
  actor = new Actor(world, terrain);
  lastUpdate = Date.now();
  updateStatus();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    keyboardTilt = event.key === "ArrowLeft" ? -0.7 : 0.7;
  }
});
window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    keyboardTilt = 0;
  }
});

function saveAll(): void {
  saveWorld(world);
  saveGrid(terrain, structures.built);
}
window.addEventListener("pagehide", saveAll);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveAll();
});
window.setInterval(saveAll, 5000);

function loop(): void {
  const now = Date.now();
  // Wall-clock progression also catches up after an inactive/suspended browser tab.
  const dt = Math.max(0, Math.min((now - lastUpdate) / 1000, 12 * 60 * 60));
  lastUpdate = now;
  simulate(world, dt);
  const desiredTilt = Math.abs(keyboardTilt) > 0 ? keyboardTilt : motion.tilt;
  visualTilt += (desiredTilt - visualTilt) * 0.09;
  const frameNow = performance.now();
  const daylight = Math.max(0, Math.sin(dayFraction(world) * Math.PI * 2));
  actor.update(world, (frameNow - lastFrame) / 1000, () => {
    // One world tick: weather, falling sand, then buildings catch up.
    weather.step(terrain);
    terrain.step({ tilt: visualTilt, daylight });
    const lost = structures.update(terrain, world);
    if (lost) world.lastEvent = lost;
  });
  lastFrame = frameNow;
  render(context!, world, terrain, weather, actor, visualTilt, now / 1000);

  if (now - lastStatus > 350) {
    updateStatus();
    lastStatus = now;
  }
  window.requestAnimationFrame(loop);
}

updateStatus();
window.requestAnimationFrame(loop);
