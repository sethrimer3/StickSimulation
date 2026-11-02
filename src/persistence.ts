import { createWorld, SAVE_VERSION, type World } from "./world";
import { simulate } from "./simulation";
import type { BuiltFlags } from "./structures";
import type { Terrain } from "./terrain";

const KEY = "stick-simulation-v1";
const GRID_KEY = "stick-simulation-grid-v1";
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
    localStorage.removeItem(GRID_KEY);
  } catch {
    // Reset the in-memory world even if browser storage is unavailable.
  }
}

interface SavedGrid {
  cells: string;
  built: BuiltFlags;
}

/** Restore the material grid. Returns the saved build flags, or null if none. */
export function loadGrid(terrain: Terrain): BuiltFlags | null {
  try {
    const raw = localStorage.getItem(GRID_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedGrid>;
    if (typeof saved.cells !== "string" || !saved.built) return null;
    if (!terrain.deserialize(saved.cells)) return null;
    return {
      campfire: saved.built.campfire === true,
      hut: saved.built.hut === true,
      fence: saved.built.fence === true
    };
  } catch {
    return null;
  }
}

export function saveGrid(terrain: Terrain, built: BuiltFlags): void {
  try {
    localStorage.setItem(GRID_KEY, JSON.stringify({ cells: terrain.serialize(), built }));
  } catch {
    // Storage full or unavailable: the world just starts fresh next time.
  }
}
