import { createWorld, SAVE_VERSION, type World } from "./world";
import { simulate } from "./simulation";

const KEY = "stick-simulation-v1";
const MAX_OFFLINE_SECONDS = 12 * 60 * 60;

interface SavedWorld {
  savedAt: number;
  world: World;
}

function isValidWorld(world: unknown): world is World {
  if (!world || typeof world !== "object") return false;
  const value = world as Partial<World>;
  return value.version === SAVE_VERSION
    && typeof value.elapsedSeconds === "number"
    && Number.isFinite(value.elapsedSeconds)
    && value.elapsedSeconds >= 0
    && typeof value.wood === "number"
    && typeof value.fish === "number"
    && typeof value.rng === "number"
    && typeof value.campfire === "boolean"
    && typeof value.hut === "boolean"
    && typeof value.fence === "boolean"
    && typeof value.lastEvent === "string";
}

export function loadWorld(): World {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createWorld();
    const saved = JSON.parse(raw) as Partial<SavedWorld>;
    if (!isValidWorld(saved.world) || typeof saved.savedAt !== "number") {
      return createWorld();
    }
    const elapsed = Math.max(0, Math.min(
      (Date.now() - saved.savedAt) / 1000,
      MAX_OFFLINE_SECONDS
    ));
    simulate(saved.world, elapsed);
    if (elapsed >= 60) {
      saved.world.lastEvent = "The world kept moving while you were away.";
    }
    return saved.world;
  } catch {
    return createWorld();
  }
}

export function saveWorld(world: World): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), world }));
  } catch {
    // Browsers can disable or fill localStorage; simulation still runs.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Reset the in-memory world even if browser storage is unavailable.
  }
}
