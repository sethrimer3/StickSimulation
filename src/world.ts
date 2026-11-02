export const LOGICAL_SIZE = 256;
export const DAY_SECONDS = 30 * 60;
export const SAVE_VERSION = 1;

export type Task =
  | "idle"
  | "gather"
  | "fish"
  | "eat"
  | "rest"
  | "buildCampfire"
  | "buildHut"
  | "buildFence"
  | "defend"
  | "wander";

export interface World {
  version: typeof SAVE_VERSION;
  elapsedSeconds: number;
  rng: number;
  wood: number;
  fish: number;
  hunger: number;
  energy: number;
  health: number;
  campfire: boolean;
  hut: boolean;
  fence: boolean;
  monster: boolean;
  monstersDefeated: number;
  task: Task;
  taskProgress: number;
  characterX: number;
  suggestion: Task | null;
  lastEvent: string;
}

export function createWorld(): World {
  return {
    version: SAVE_VERSION,
    elapsedSeconds: 0,
    rng: 12734321,
    wood: 0,
    fish: 0,
    hunger: 90,
    energy: 100,
    health: 100,
    campfire: false,
    hut: false,
    fence: false,
    monster: false,
    monstersDefeated: 0,
    task: "idle",
    taskProgress: 0,
    characterX: 124,
    suggestion: null,
    lastEvent: "A traveler has arrived in the wilderness."
  };
}

export function dayNumber(world: World): number {
  return Math.floor(world.elapsedSeconds / DAY_SECONDS) + 1;
}

export function dayFraction(world: World): number {
  return (world.elapsedSeconds % DAY_SECONDS) / DAY_SECONDS;
}

export function suggest(world: World, task: Task): void {
  if (task === "gather" || task === "fish" || task === "buildHut") {
    world.suggestion = task;
    world.lastEvent = task === "gather"
      ? "You pointed toward the forest."
      : task === "fish"
        ? "You pointed toward the river."
        : "You pointed toward the building site.";
  }
}
