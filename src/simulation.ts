import { DAY_SECONDS, type Task, type World } from "./world";

const DURATION: Record<Task, number> = {
  idle: 0,
  gather: 7,
  fish: 10,
  eat: 3,
  rest: 12,
  buildCampfire: 20,
  buildHut: 32,
  buildFence: 28,
  defend: 14,
  wander: 12
};

export const DESTINATION: Record<Task, number> = {
  idle: 124,
  gather: 52,
  fish: 188,
  eat: 124,
  rest: 124,
  buildCampfire: 119,
  buildHut: 129,
  buildFence: 128,
  defend: 171,
  wander: 151
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function random(world: World): number {
  // A stored seed makes event outcomes reproducible for the same simulation path.
  world.rng = (Math.imul(world.rng, 1664525) + 1013904223) >>> 0;
  return world.rng / 4294967296;
}

function canPerform(world: World, task: Task): boolean {
  return task !== "buildHut" || (!world.hut && world.campfire && world.wood >= 10);
}

function selectTask(world: World): Task {
  if (world.monster) return "defend";
  if (world.health < 15 || world.energy < 22) return "rest";
  if (world.hunger < 34 && world.fish > 0) return "eat";
  if (world.hunger < 34) return "fish";

  const requested = world.suggestion;
  world.suggestion = null;
  if (requested && canPerform(world, requested)) return requested;

  if (!world.campfire) return world.wood >= 3 ? "buildCampfire" : "gather";
  if (!world.hut) return world.wood >= 10 ? "buildHut" : "gather";
  if (!world.fence) return world.wood >= 8 ? "buildFence" : "gather";
  if (world.fish < 3) return "fish";
  if (world.wood < 22) return "gather";
  if (world.energy < 85) return "rest";
  return "wander";
}

function complete(world: World, task: Task): void {
  switch (task) {
    case "gather":
      world.wood += 2;
      world.lastEvent = "The traveler gathered some logs.";
      break;
    case "fish":
      world.fish += 1;
      world.lastEvent = "A fish was caught.";
      break;
    case "eat":
      if (world.fish > 0) {
        world.fish -= 1;
        world.hunger = clamp(world.hunger + 46);
      }
      world.lastEvent = "A meal by the river.";
      break;
    case "rest":
      world.energy = clamp(world.energy + 52);
      world.health = clamp(world.health + (world.hut ? 8 : 3));
      world.lastEvent = "A moment of rest.";
      break;
    case "buildCampfire":
      if (world.wood >= 3 && !world.campfire) {
        world.wood -= 3;
        world.campfire = true;
        world.lastEvent = "A campfire lights up the clearing!";
      }
      break;
    case "buildHut":
      if (world.wood >= 10 && !world.hut) {
        world.wood -= 10;
        world.hut = true;
        world.lastEvent = "The first hut is complete!";
      }
      break;
    case "buildFence":
      if (world.wood >= 8 && !world.fence) {
        world.wood -= 8;
        world.fence = true;
        world.lastEvent = "A sturdy fence surrounds the camp.";
      }
      break;
    case "defend":
      world.monster = false;
      world.monstersDefeated += 1;
      world.health = clamp(world.health - (world.fence ? 5 : 12));
      world.lastEvent = "The traveler defended the camp!";
      break;
    case "wander":
      world.lastEvent = "Exploring the little clearing.";
      break;
    case "idle":
      break;
  }
}

function step(world: World, dt: number): void {
  const oldDay = Math.floor(world.elapsedSeconds / DAY_SECONDS);
  world.elapsedSeconds += dt;
  world.hunger = clamp(world.hunger - dt * 0.019);
  if (world.task !== "rest" && world.task !== "idle") {
    world.energy = clamp(world.energy - dt * 0.027);
  }

  const newDay = Math.floor(world.elapsedSeconds / DAY_SECONDS);
  if (newDay > oldDay && world.hut && !world.monster && random(world) < 0.32) {
    world.monster = true;
    world.lastEvent = "A monster approaches the settlement!";
  }

  if (world.task === "idle") {
    world.task = selectTask(world);
    world.taskProgress = 0;
  }

  const target = DESTINATION[world.task];
  const maxStep = dt * 23;
  world.characterX += Math.max(-maxStep, Math.min(maxStep, target - world.characterX));

  world.taskProgress += dt;
  if (world.taskProgress >= DURATION[world.task]) {
    complete(world, world.task);
    world.task = "idle";
    world.taskProgress = 0;
  }
}

/** Progress in short deterministic steps, independent of display frame rate. */
export function simulate(world: World, elapsedSeconds: number): void {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return;
  let remaining = Math.min(elapsedSeconds, 12 * 60 * 60);
  while (remaining > 0) {
    const dt = Math.min(remaining, 1);
    step(world, dt);
    remaining -= dt;
  }
}

export function taskLabel(task: Task): string {
  const labels: Record<Task, string> = {
    idle: "Thinking", gather: "Chopping wood", fish: "Fishing",
    eat: "Eating", rest: "Resting", buildCampfire: "Making a fire",
    buildHut: "Building a hut", buildFence: "Building a fence",
    defend: "Fighting a monster", wander: "Exploring"
  };
  return labels[task];
}
