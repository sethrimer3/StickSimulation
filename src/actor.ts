/**
 * Bridges the autonomous simulation (what the inhabitant intends to do) and
 * the physical stick body (how it actually moves). The simulation stays the
 * persistent source of truth; the body is presentation-level physics that
 * walks toward wherever the simulation says the character is.
 */
import { DESTINATION } from "./simulation";
import { Joint, PHYSICS_HZ, StickBody } from "./stickman";
import { Material, type Terrain } from "./terrain";
import type { Task, World } from "./world";

export type Tool = "none" | "axe" | "hammer" | "rod" | "sword";

/** Where each task's work happens, and what the arm strikes toward. */
const WORK: Partial<Record<Task, { faceX: number; tool: Tool; strikeEvery: number }>> = {
  gather: { faceX: 72, tool: "axe", strikeEvery: 24 },
  fish: { faceX: 215, tool: "rod", strikeEvery: 0 },
  buildCampfire: { faceX: 101, tool: "hammer", strikeEvery: 20 },
  buildHut: { faceX: 150, tool: "hammer", strikeEvery: 20 },
  buildFence: { faceX: 175, tool: "hammer", strikeEvery: 20 },
  defend: { faceX: 194, tool: "sword", strikeEvery: 16 }
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

  /** If sand or debris buries the body, push it up out of the pile. */
  private unbury(): void {
    const body = this.body;
    const buried = [Joint.Waist, Joint.FootL, Joint.FootR].filter((j) => this.terrain.isSolid(body.p[j].x, body.p[j].y)).length;
    if (buried < 2) return;
    for (let i = 0; i < body.p.length; i++) {
      body.p[i].y -= 1;
      body.prev[i].y -= 1;
    }
  }

  /** Chopping knocks sawdust off the trunk. */
  private chips(faceX: number): void {
    const hand = this.body.p[Joint.HandR];
    const dir = faceX > hand.x ? 1 : -1;
    for (let k = 0; k < 2; k++) {
      if (Math.random() < 0.6) continue;
      const x = Math.floor(hand.x + dir * (1 + Math.random() * 2));
      const y = Math.floor(hand.y - Math.random() * 3);
      if (this.terrain.get(x, y) === Material.Empty) this.terrain.set(x, y, Material.Sawdust);
    }
  }

  /** Advances physics in fixed ticks; `onTick` steps the world grid in lockstep. */
  update(world: World, dtSeconds: number, onTick?: () => void): void {
    const body = this.body;
    if (!body.dragging && (Math.abs(body.feetX - world.characterX) > TELEPORT_DISTANCE || !body.isFinite())) {
      // After offline catch-up the character may be far away; just place it.
      body.reset(world.characterX, this.terrain.surfaceY(world.characterX));
    }

    const work = WORK[world.task];
    const arrived = Math.abs(world.characterX - DESTINATION[world.task]) < 1
      && Math.abs(body.feetX - world.characterX) < 4;
    this.working = !!work && arrived;
    const arrivedAtSpot = Math.abs(world.characterX - DESTINATION[world.task]) < 1
      && Math.abs(body.p[Joint.Waist].x - world.characterX) < 6;
    this.tool = work ? work.tool : "none";
    this.faceX = work ? work.faceX : world.characterX;

    this.accumulator = Math.min(this.accumulator + dtSeconds, MAX_TICKS_PER_FRAME / PHYSICS_HZ);
    while (this.accumulator >= 1 / PHYSICS_HZ) {
      this.accumulator -= 1 / PHYSICS_HZ;
      this.ticks++;
      onTick?.();
      this.unbury();
      body.tick(this.terrain, {
        targetX: world.characterX,
        // Only lie down once at the resting spot.
        relaxed: world.task === "rest" && arrivedAtSpot
      });
      if (this.working && work && work.strikeEvery > 0 && this.ticks % work.strikeEvery === 0 && body.airborne === 0) {
        body.strike(work.faceX);
        if (work.tool === "axe") this.chips(work.faceX);
      }
    }
  }
}
