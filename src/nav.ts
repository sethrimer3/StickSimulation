/**
 * Pathfinding for stickmen: a breadth-first search over where a body can
 * stand (feet on top of a solid or platform cell with headroom above) and
 * where it can hang on a ladder. Moves: walk a pixel sideways (stepping up or
 * down a few pixels), drop off a ledge, mount/dismount a ladder, climb.
 */
import { HEADROOM, type Terrain } from "./terrain";

export interface NavNode { x: number; y: number; climb: boolean }

export type Waypoint =
  | { kind: "walk"; x: number; y: number }
  | { kind: "climb"; x: number; y: number };

const STEP = 5;
const DROP = 48;
const MAX_EXPANSIONS = 120000;

/** Is there ladder near a body whose feet are at row y in column x? */
export function ladderNear(t: Terrain, x: number, y: number): boolean {
  for (let k = -13; k <= 3; k++) if (t.isLadder(x, y + k)) return true;
  return false;
}

function clearAbove(t: Terrain, x: number, y: number): boolean {
  for (let k = 0; k <= HEADROOM; k++) if (t.isSolid(x, y - k)) return false;
  return true;
}

export class Navigator {
  private stamp: Uint32Array;
  private parent: Int32Array;
  private gen = 0;
  private queue: Int32Array;

  constructor(private readonly t: Terrain) {
    const n = t.width * t.height * 2;
    this.stamp = new Uint32Array(n);
    this.parent = new Int32Array(n);
    this.queue = new Int32Array(MAX_EXPANSIONS + 16);
  }

  private id(x: number, y: number, climb: boolean): number {
    return ((y * this.t.width + x) << 1) | (climb ? 1 : 0);
  }

  private node(id: number): NavNode {
    const climb = (id & 1) === 1;
    const c = id >> 1;
    return { x: c % this.t.width, y: Math.floor(c / this.t.width), climb };
  }

  /** The nearest node to a body at feet position (fx, fy). */
  locate(fx: number, fy: number, climbing: boolean, roofs = false): NavNode | null {
    const t = this.t;
    const x0 = Math.round(fx);
    const y0 = Math.round(fy);
    if (climbing) {
      for (let dx = 0; dx <= 2; dx++) {
        for (const sx of [x0 - dx, x0 + dx]) {
          if (ladderNear(t, sx, y0)) return { x: sx, y: y0, climb: true };
        }
      }
    }
    for (let r = 0; r <= 8; r++) {
      for (const dx of [0, -1, 1, -2, 2, -3, 3]) {
        for (const dy of [r, -r]) {
          const x = x0 + dx;
          const y = y0 + dy;
          if (t.standable(x, y, roofs)) return { x, y, climb: false };
        }
      }
    }
    // Hanging in a shaft: grab the nearest ladder.
    for (let dx = 0; dx <= 4; dx++) {
      for (const sx of [x0 - dx, x0 + dx]) if (ladderNear(t, sx, y0)) return { x: sx, y: y0, climb: true };
    }
    return null;
  }

  /**
   * Breadth-first search from `start` to the first node satisfying `goal`.
   * Returns the node path (start first), or null. Builders may walk on roofs.
   */
  search(start: NavNode, goal: (n: NavNode) => boolean, limit = MAX_EXPANSIONS, roofs = false): NavNode[] | null {
    const t = this.t;
    const standable = (x: number, y: number): boolean => t.standable(x, y, roofs);
    this.gen = (this.gen + 1) >>> 0;
    if (this.gen === 0) { this.stamp.fill(0); this.gen = 1; }
    const gen = this.gen;
    const { stamp, parent, queue } = this;
    let head = 0;
    let tail = 0;
    const startId = this.id(start.x, start.y, start.climb);
    stamp[startId] = gen;
    parent[startId] = -1;
    queue[tail++] = startId;

    const push = (from: number, x: number, y: number, climb: boolean): void => {
      if (tail >= queue.length) return;
      const id = this.id(x, y, climb);
      if (stamp[id] === gen) return;
      stamp[id] = gen;
      parent[id] = from;
      queue[tail++] = id;
    };

    let expansions = 0;
    while (head < tail && expansions < limit) {
      const cur = queue[head++];
      expansions++;
      const n = this.node(cur);
      if (goal(n)) {
        const path: NavNode[] = [];
        for (let k = cur; k !== -1; k = parent[k]) path.push(this.node(k));
        return path.reverse();
      }
      const { x, y } = n;
      if (!n.climb) {
        for (const dx of [-1, 1]) {
          const nx = x + dx;
          let found = false;
          for (let k = 0; k <= STEP && !found; k++) {
            for (const dy of k === 0 ? [0] : [-k, k]) {
              if (standable(nx, y + dy)) { push(cur, nx, y + dy, false); found = true; break; }
            }
          }
          if (!found && clearAbove(t, nx, y - 1)) {
            for (let dy = STEP + 1; dy <= DROP; dy++) {
              if (t.isSolid(nx, y + dy - 1) && !t.isOneWay(nx, y + dy - 1)) break;
              if (standable(nx, y + dy)) { push(cur, nx, y + dy, false); break; }
            }
          }
        }
        if (ladderNear(t, x, y)) push(cur, x, y, true);
      } else {
        if (ladderNear(t, x, y - 1) && clearAbove(t, x, y - 1)) push(cur, x, y - 1, true);
        if (ladderNear(t, x, y + 1) && !t.isSolid(x, y)) push(cur, x, y + 1, true);
        if (standable(x, y)) push(cur, x, y, false);
      }
    }
    return null;
  }

  /** Compress a node path into walk and climb waypoints. */
  static waypoints(path: NavNode[]): Waypoint[] {
    const out: Waypoint[] = [];
    for (let i = 1; i < path.length; i++) {
      const n = path[i];
      const prev = path[i - 1];
      const next = path[i + 1];
      if (n.climb) {
        // Keep only the last node of a run of climbing.
        if (!next || !next.climb) out.push({ kind: "climb", x: n.x, y: n.y });
        continue;
      }
      if (prev.climb) { out.push({ kind: "walk", x: n.x, y: n.y }); continue; }
      const dirChange = next && !next.climb && Math.sign(next.x - n.x) !== Math.sign(n.x - prev.x);
      const drop = Math.abs(n.y - prev.y) > STEP;
      const beforeLadder = next && next.climb;
      if (!next || dirChange || drop || beforeLadder || i % 24 === 0) out.push({ kind: "walk", x: n.x, y: n.y });
    }
    return out;
  }
}
