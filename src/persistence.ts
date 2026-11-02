import { Colony, type ColonySave } from "./colony";
import type { Terrain } from "./terrain";

const KEY = "stick-simulation-colony-v3";
const GRID_KEY = "stick-simulation-world-v3";
/** At most this much time away is caught up on when the page opens again. */
export const MAX_AWAY_SECONDS = 60 * 60;

interface SavedColony {
  savedAt: number;
  colony: ColonySave;
}

/** The saved colony and how long it has been away, or null for a new world. */
export function loadSave(terrain: Terrain): { colony: ColonySave; awaySeconds: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    const grid = localStorage.getItem(GRID_KEY);
    if (!raw || !grid) return null;
    const saved = JSON.parse(raw) as Partial<SavedColony>;
    if (!Colony.validSave(saved.colony) || typeof saved.savedAt !== "number") return null;
    terrain.seed = saved.colony.seed;
    if (!terrain.deserialize(grid)) return null;
    const away = Math.max(0, Math.min((Date.now() - saved.savedAt) / 1000, MAX_AWAY_SECONDS));
    return { colony: saved.colony, awaySeconds: away };
  } catch {
    return null;
  }
}

export function saveAll(colony: Colony): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), colony: colony.toSave() }));
    localStorage.setItem(GRID_KEY, colony.terrain.serialize());
  } catch {
    // Storage full or unavailable: the colony just starts fresh next time.
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
