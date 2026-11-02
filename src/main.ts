import "./style.css";
import { MotionInput } from "./input";
import { clearSave, loadWorld, saveWorld } from "./persistence";
import { render } from "./render";
import { simulate, taskLabel } from "./simulation";
import { createWorld, dayNumber, LOGICAL_SIZE, suggest } from "./world";

const canvas = document.querySelector<HTMLCanvasElement>("#world");
const context = canvas?.getContext("2d", { alpha: false });
const age = document.querySelector<HTMLElement>("#age");
const activity = document.querySelector<HTMLElement>("#activity");
const resources = document.querySelector<HTMLElement>("#resources");
const eventLabel = document.querySelector<HTMLElement>("#event");
const motionButton = document.querySelector<HTMLButtonElement>("#motion");
const resetButton = document.querySelector<HTMLButtonElement>("#reset");

if (!canvas || !context || !age || !activity || !resources || !eventLabel || !motionButton || !resetButton) {
  throw new Error("Missing StickSimulation interface elements");
}

if (new URLSearchParams(window.location.search).has("frame")) {
  document.body.classList.add("frame-only");
}

let world = loadWorld();
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

canvas.addEventListener("pointerdown", (event) => {
  const bounds = canvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * LOGICAL_SIZE;
  const y = ((event.clientY - bounds.top) / bounds.height) * LOGICAL_SIZE;

  if (x < 90 && y > 90) suggest(world, "gather");
  else if (x > 195 && y > 140) suggest(world, "fish");
  else if (x >= 95 && x <= 190 && y > 115) suggest(world, "buildHut");

  updateStatus();
});

motionButton.addEventListener("click", async () => {
  motionButton.textContent = await motion.enable();
});

resetButton.addEventListener("click", () => {
  if (!window.confirm("Restart this world? Saved progression will be lost.")) return;
  clearSave();
  world = createWorld();
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

window.addEventListener("pagehide", () => saveWorld(world));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveWorld(world);
});
window.setInterval(() => saveWorld(world), 5000);

function loop(): void {
  const now = Date.now();
  // Wall-clock progression also catches up after an inactive/suspended browser tab.
  const dt = Math.max(0, Math.min((now - lastUpdate) / 1000, 12 * 60 * 60));
  lastUpdate = now;
  simulate(world, dt);
  const desiredTilt = Math.abs(keyboardTilt) > 0 ? keyboardTilt : motion.tilt;
  visualTilt += (desiredTilt - visualTilt) * 0.09;
  render(context!, world, visualTilt, now / 1000);

  if (now - lastStatus > 350) {
    updateStatus();
    lastStatus = now;
  }
  window.requestAnimationFrame(loop);
}

updateStatus();
window.requestAnimationFrame(loop);
