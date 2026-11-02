/**
 * Bridges the autonomous simulation (what the inhabitant intends to do) and
 * the physical stick body (how it actually moves). The simulation stays the
 * persistent source of truth; the body is presentation-level physics that
 * walks toward wherever the simulation says the character is.
 */
import { DESTINATION } from "./simulation";
import { PHYSICS_HZ, StickBody } from "./stickman";
import type { Terrain } from "./terrain";
import type { Task, World } from "./world";

export type Tool = "none" | "axe" | "hammer" | "rod" | "sword";

/** Where each task's work happens, and what the arm strikes toward. */
const WORK: Partial<Record<Task, { faceX: number; tool: Tool; strikeEvery: number }>> = {
  gather: { faceX: 60, tool: "axe", strikeEvery: 24 },
  fish: { faceX: 215, tool: "rod", strikeEvery: 0 },
  buildCampfire: { faceX: 105, tool: "hammer", strikeEvery: 20 },
  buildHut: { faceX: 136, tool: "hammer", strikeEvery: 20 },
  buildFence: { faceX: 140, tool: "hammer", strikeEvery: 20 },
  defend: { faceX: 189, tool: "sword", strikeEvery: 16 }
};

const TELEPORT_DISTANCE = 80;
const MAX_TICKS_PER_FRAME = 5;

export class Actor {
  readonly body: StickBody;
  tool: Tool = "none";
  /** True while standing at the work spot doing the task. */
  working = false;
  faceX = 0;
  private accumulator = 0;
  private ticks = 0;

  constructor(world: World, private readonly terrain: Terrain) {
    this.body = new StickBody(world.characterX, terrain.surfaceY(world.characterX));
  }

  update(world: World, dtSeconds: number): void {
    const body = this.body;
    if (!body.dragging && (Math.abs(body.feetX - world.characterX) > TELEPORT_DISTANCE || !body.isFinite())) {
      // After offline catch-up the character may be far away; just place it.
      body.reset(world.characterX, this.terrain.surfaceY(world.characterX));
    }

    const work = WORK[world.task];
    const arrived = Math.abs(world.characterX - DESTINATION[world.task]) < 1
      && Math.abs(body.feetX - world.characterX) < 4;
    this.working = !!work && arrived;
    this.tool = work ? work.tool : "none";
    this.faceX = work ? work.faceX : world.characterX;

    this.accumulator = Math.min(this.accumulator + dtSeconds, MAX_TICKS_PER_FRAME / PHYSICS_HZ);
    while (this.accumulator >= 1 / PHYSICS_HZ) {
      this.accumulator -= 1 / PHYSICS_HZ;
      this.ticks++;
      body.tick(this.terrain, {
        targetX: world.characterX,
        relaxed: world.task === "rest"
      });
      if (this.working && work && work.strikeEvery > 0 && this.ticks % work.strikeEvery === 0 && body.airborne === 0) {
        body.strike(work.faceX);
      }
    }
  }
}
