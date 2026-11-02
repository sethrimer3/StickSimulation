import "./style.css";
import { Colony, RESOURCES, ROLE_LABEL, ROLES, type Role, type Settler } from "./colony";
import { MotionInput } from "./input";
import { Material } from "./materials";
import { clearSave, loadSave, saveAll } from "./persistence";
import { render } from "./render";
import { project } from "./research";
import { Terrain, WORLD_H, WORLD_W } from "./terrain";
import { Weather } from "./weather";
import { dayNumber, LOGICAL_SIZE, TICK_HZ } from "./world";

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing ${sel}`);
  return el;
};

const canvas = $<HTMLCanvasElement>("#world");
const context = canvas.getContext("2d", { alpha: false });
if (!context) throw new Error("Canvas 2D unavailable");
const ui = {
  age: $("#age"),
  people: $("#people"),
  knowledge: $("#knowledge"),
  supplies: $("#resources"),
  event: $("#event"),
  settlers: $("#settlers"),
  freeCam: $<HTMLButtonElement>("#free-cam"),
  researchNow: $("#research-now"),
  researchList: $("#research-list"),
  rooms: $("#rooms"),
  catchup: $("#catchup"),
  motion: $<HTMLButtonElement>("#motion"),
  reset: $<HTMLButtonElement>("#reset")
};
const elementButtons = document.querySelectorAll<HTMLButtonElement>("[data-element]");
const frameOnly = new URLSearchParams(window.location.search).has("frame");
if (frameOnly) document.body.classList.add("frame-only");

// ---- world ---------------------------------------------------------------------

const terrain = new Terrain(1);
let colony: Colony;
let weather = new Weather();
/** Ticks of time away still to catch up on. */
let bankTicks = 0;
{
  const saved = loadSave(terrain);
  if (saved) {
    colony = new Colony(terrain, saved.colony);
    bankTicks = Math.floor(saved.awaySeconds * TICK_HZ);
  } else {
    terrain.generate(1 + Math.floor(Math.random() * 100000));
    colony = new Colony(terrain);
  }
}

// ---- camera ----------------------------------------------------------------------

const cam = {
  x: 0,
  y: 0,
  following: colony.settlers[0]?.name ?? "",
  free: false,
  lastTouch: 0
};
/** After this long untouched, a panned camera goes back to following someone. */
const FREE_CAMERA_TIMEOUT = 90_000;

function followed(): Settler | null {
  if (cam.free) return null;
  return colony.settlers.find((s) => s.name === cam.following) ?? colony.settlers[0] ?? null;
}

function clampCam(): void {
  cam.x = Math.max(0, Math.min(WORLD_W - LOGICAL_SIZE, cam.x));
  cam.y = Math.max(0, Math.min(WORLD_H - LOGICAL_SIZE, cam.y));
}

function snapToFollowed(): void {
  const s = followed();
  if (!s) return;
  cam.x = s.body.feetX - LOGICAL_SIZE / 2;
  cam.y = s.body.feetY - LOGICAL_SIZE * 0.6;
  clampCam();
}

function updateCamera(): void {
  if (cam.free && performance.now() - cam.lastTouch > FREE_CAMERA_TIMEOUT) cam.free = false;
  const s = followed();
  if (!s) return;
  const tx = s.body.feetX - LOGICAL_SIZE / 2;
  const ty = s.body.feetY - LOGICAL_SIZE * 0.6;
  cam.x += (tx - cam.x) * 0.1;
  cam.y += (ty - cam.y) * 0.1;
  clampCam();
}

function follow(name: string): void {
  cam.following = name;
  cam.free = false;
  renderSettlerList(true);
}

function cycleFollow(dir: number): void {
  const list = colony.settlers;
  if (!list.length) return;
  const i = Math.max(0, list.findIndex((s) => s.name === cam.following));
  follow(list[(i + dir + list.length) % list.length].name);
}

// ---- pointer ---------------------------------------------------------------------

type Brush = Material | "erase" | null;
let brush: Brush = null;
let pointer: { id: number; sx: number; sy: number; camX: number; camY: number; moved: boolean; mode: "pan" | "paint" | "grab" } | null = null;
let grabbed: Settler | null = null;

function toLogical(event: PointerEvent): { x: number; y: number } {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * LOGICAL_SIZE,
    y: ((event.clientY - bounds.top) / bounds.height) * LOGICAL_SIZE
  };
}

function settlerAt(wx: number, wy: number, radius: number): Settler | null {
  let best: Settler | null = null;
  let bestD = radius * radius;
  for (const s of colony.settlers) {
    for (const p of s.body.p) {
      const d = (p.x - wx) ** 2 + (p.y - wy) ** 2;
      if (d < bestD) { bestD = d; best = s; }
    }
  }
  return best;
}

function paintAt(wx: number, wy: number): void {
  if (brush === null) return;
  if (brush === "erase") terrain.paint(wx, wy, 4, Material.Empty, true);
  else terrain.paint(wx, wy, brush === Material.Fire ? 2 : 3, brush);
}

canvas.addEventListener("pointerdown", (event) => {
  const { x, y } = toLogical(event);
  const wx = cam.x + x;
  const wy = cam.y + y;
  cam.lastTouch = performance.now();
  canvas.setPointerCapture(event.pointerId);
  const base = { id: event.pointerId, sx: x, sy: y, camX: cam.x, camY: cam.y, moved: false };
  // Like Stick Ranger, any joint can be grabbed and flung.
  const hit = settlerAt(wx, wy, 5);
  if (hit && hit.body.grab(wx, wy)) {
    grabbed = hit;
    follow(hit.name);
    pointer = { ...base, mode: "grab" };
    return;
  }
  if (brush !== null) {
    pointer = { ...base, mode: "paint" };
    paintAt(wx, wy);
    return;
  }
  pointer = { ...base, mode: "pan" };
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const { x, y } = toLogical(event);
  cam.lastTouch = performance.now();
  if (Math.abs(x - pointer.sx) + Math.abs(y - pointer.sy) > 3) pointer.moved = true;
  if (pointer.mode === "grab") grabbed?.body.moveGrab(cam.x + x, cam.y + y);
  else if (pointer.mode === "paint") paintAt(cam.x + x, cam.y + y);
  else if (pointer.moved) {
    if (!cam.free) renderSettlerList(true);
    cam.free = true;
    cam.x = pointer.camX - (x - pointer.sx);
    cam.y = pointer.camY - (y - pointer.sy);
    clampCam();
  }
});

function endPointer(event: PointerEvent): void {
  if (!pointer || pointer.id !== event.pointerId) return;
  if (pointer.mode === "pan" && !pointer.moved) {
    // A tap: follow whoever was tapped, or (in frame mode) the next stickman.
    const { x, y } = toLogical(event);
    const hit = settlerAt(cam.x + x, cam.y + y, 9);
    if (hit) follow(hit.name);
    else if (frameOnly) cycleFollow(1);
  }
  grabbed?.body.release();
  grabbed = null;
  pointer = null;
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
window.addEventListener("blur", () => { grabbed?.body.release(); grabbed = null; pointer = null; });

elementButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const value = button.dataset.element ?? "camera";
    brush = value === "camera" ? null : value === "erase" ? "erase" : Material[value as keyof typeof Material];
    elementButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  });
});

ui.freeCam.addEventListener("click", () => {
  cam.free = !cam.free;
  cam.lastTouch = performance.now();
  renderSettlerList(true);
});

// ---- keyboard & motion -------------------------------------------------------------

const motion = new MotionInput();
let keyboardTilt = 0;
let visualTilt = 0;
const panKeys = new Set<string>();

window.addEventListener("keydown", (event) => {
  if ((event.target as HTMLElement)?.tagName === "SELECT") return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    keyboardTilt = event.key === "ArrowLeft" ? -0.7 : 0.7;
  } else if (event.key === "[" || event.key === "]") {
    cycleFollow(event.key === "]" ? 1 : -1);
  } else if (["w", "a", "s", "d"].includes(event.key.toLowerCase())) {
    panKeys.add(event.key.toLowerCase());
  }
});
window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") keyboardTilt = 0;
  panKeys.delete(event.key.toLowerCase());
});

ui.motion.addEventListener("click", async () => {
  ui.motion.textContent = await motion.enable();
});

ui.reset.addEventListener("click", () => {
  if (!window.confirm("Start a new world? The colony and everything built will be lost.")) return;
  clearSave();
  terrain.generate(1 + Math.floor(Math.random() * 100000));
  colony = new Colony(terrain);
  weather = new Weather();
  bankTicks = 0;
  cam.following = colony.settlers[0].name;
  cam.free = false;
  snapToFollowed();
  renderSettlerList(true);
});

// ---- saving ------------------------------------------------------------------------

const save = (): void => saveAll(colony);
window.addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
window.setInterval(save, 15000);

// ---- panel -------------------------------------------------------------------------

let settlerKey = "";

function renderSettlerList(force = false): void {
  const key = colony.settlers.map((s) => s.name + s.role).join("|") + (cam.free ? "!" : cam.following);
  if (!force && key === settlerKey) {
    ui.settlers.querySelectorAll<HTMLElement>("[data-name]").forEach((li) => {
      const s = colony.settlers.find((x) => x.name === li.dataset.name);
      const act = li.querySelector(".activity");
      if (s && act && act.textContent !== s.activity) act.textContent = s.activity;
    });
    return;
  }
  settlerKey = key;
  const current = followed();
  ui.settlers.innerHTML = colony.settlers.map((s) => `
    <li data-name="${s.name}" class="${s === current ? "followed" : ""}">
      <button type="button" class="follow" aria-pressed="${s === current}" title="Follow ${s.name}">${s.name}</button>
      <select aria-label="${s.name}'s job">${ROLES.map((r) => `<option value="${r}"${r === s.role ? " selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select>
      <span class="activity">${s.activity}</span>
    </li>`).join("");
  ui.freeCam.setAttribute("aria-pressed", String(cam.free));
}

ui.settlers.addEventListener("click", (event) => {
  const li = (event.target as HTMLElement).closest(".follow")?.closest<HTMLElement>("[data-name]");
  if (li?.dataset.name) follow(li.dataset.name);
});
ui.settlers.addEventListener("change", (event) => {
  const select = event.target as HTMLSelectElement;
  const li = select.closest<HTMLElement>("[data-name]");
  if (li?.dataset.name) colony.setRole(li.dataset.name, select.value as Role);
  renderSettlerList(true);
});

let researchKey = "";
function renderResearch(): void {
  const r = colony.research;
  const p = r ? project(r.id) : undefined;
  ui.researchNow.innerHTML = p && r
    ? `<strong>${p.name}</strong><div class="bar"><span style="width:${Math.min(100, (r.progress / p.work) * 100).toFixed(1)}%"></span></div>`
    : colony.labRooms().length ? "<em>Nothing being researched.</em>" : "<em>Needs a working alchemy lab (the library's ground floor).</em>";
  const options = colony.available();
  const key = options.map((o) => o.id + colony.canAfford(o)).join() + colony.chosen;
  if (key === researchKey) return;
  researchKey = key;
  ui.researchList.innerHTML = options.map((o) => {
    const cost = [`${o.knowledge} knowledge`, ...Object.entries(o.resources).map(([k, n]) => `${n} ${k}`)].join(", ");
    return `<button type="button" data-project="${o.id}" aria-pressed="${colony.chosen === o.id}" class="${colony.canAfford(o) ? "" : "short"}" title="${o.description}">
      <span>${o.name}</span><small>${cost}</small></button>`;
  }).join("") || "<em>Everything has been researched.</em>";
}
ui.researchList.addEventListener("click", (event) => {
  const b = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-project]");
  if (!b?.dataset.project) return;
  colony.chosen = colony.chosen === b.dataset.project ? null : b.dataset.project;
  researchKey = "";
  renderResearch();
});

const ROOM_LABEL = { home: "Home", library: "Library", lab: "Alchemy lab", empty: "Empty room" };
const BUILDING_NAME: Record<string, string> = { cabin: "cabin", library: "library", bunkhouse: "bunkhouse", stoneCottage: "stone cottage", grandLibrary: "grand library" };
function renderRooms(): void {
  const lines = colony.rooms.map((r) => {
    const site = colony.sites[r.site];
    const ok = r.check.valid;
    return `<li class="${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"} ${ROOM_LABEL[r.check.kind]} <small>(${BUILDING_NAME[site.blueprint] ?? site.blueprint}, floor ${r.story + 1})${ok ? "" : " — " + r.check.reason}</small></li>`;
  });
  const b = colony.buildProgress;
  if (b) lines.push(`<li class="building">⚒ Building a ${b.name.toLowerCase()} <small>${Math.round((b.done / Math.max(1, b.total)) * 100)}%</small></li>`);
  const m = colony.mineProgress;
  lines.push(`<li>⛏ Mine <small>${Math.round((m.done / Math.max(1, m.total)) * 100)}% dug, ${colony.maxLevels()} levels planned</small></li>`);
  const html = lines.join("");
  if (ui.rooms.innerHTML !== html) ui.rooms.innerHTML = html;
}

function updatePanel(): void {
  ui.age.textContent = `Day ${dayNumber(colony.elapsed)}`;
  ui.people.textContent = `${colony.population} · ${colony.bedSpots().length} beds`;
  ui.knowledge.textContent = colony.knowledge.toFixed(1);
  ui.supplies.textContent = RESOURCES.filter((r) => r !== "dirt").map((r) => `${Math.floor(colony.resources[r])} ${r}`).join(" · ");
  ui.event.textContent = colony.events[colony.events.length - 1] ?? "";
  ui.catchup.hidden = bankTicks <= 0;
  ui.catchup.textContent = `Catching up on time away… ${Math.ceil(bankTicks / TICK_HZ)} s`;
  renderSettlerList();
  renderResearch();
  renderRooms();
}

// ---- loop --------------------------------------------------------------------------

let last = performance.now();
let accumulator = 0;
let lastPanel = 0;

function tick(): void {
  weather.step(terrain);
  terrain.step({ tilt: visualTilt, daylight: colony.daylight });
  colony.step();
}

function loop(now: number): void {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  accumulator += dt;
  let due = Math.floor(accumulator * TICK_HZ);
  accumulator -= due / TICK_HZ;
  due = Math.min(due, 8);
  for (let k = 0; k < due; k++) tick();
  // Catch up on time away within a frame budget.
  const budgetEnd = performance.now() + 8;
  while (bankTicks > 0 && performance.now() < budgetEnd) { tick(); bankTicks--; }

  const desiredTilt = Math.abs(keyboardTilt) > 0 ? keyboardTilt : motion.tilt;
  visualTilt += (desiredTilt - visualTilt) * 0.09;
  if (panKeys.size) {
    if (!cam.free) renderSettlerList(true);
    cam.free = true;
    cam.lastTouch = performance.now();
    if (panKeys.has("a")) cam.x -= 3;
    if (panKeys.has("d")) cam.x += 3;
    if (panKeys.has("w")) cam.y -= 3;
    if (panKeys.has("s")) cam.y += 3;
    clampCam();
  }
  updateCamera();
  render(context!, {
    colony,
    terrain,
    weather,
    camX: Math.round(cam.x),
    camY: Math.round(cam.y),
    now: now / 1000,
    followed: followed()
  });
  if (now - lastPanel > 300) { updatePanel(); lastPanel = now; }
  window.requestAnimationFrame(loop);
}

snapToFollowed();
updatePanel();
window.requestAnimationFrame(loop);

// Debug handle for the console.
(window as unknown as { stick: unknown }).stick = { get colony() { return colony; }, terrain, cam };
