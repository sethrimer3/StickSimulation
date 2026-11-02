/**
 * Stick-figure body physics modeled on Stick Ranger's player characters.
 *
 * The body is 11 Verlet points joined by distance constraints. Nothing is
 * animated by hand: the figure stays upright because, for a few ticks after a
 * foot touches the ground, the head and hips feel *negative* gravity while the
 * feet feel extra gravity. Walking is a periodic "kick" that lifts the rear
 * knee forward; gravity and the constraints do the rest, which produces the
 * characteristic bobbing Stick Ranger gait. When the figure is airborne for a
 * while (or relaxed) it becomes a limp ragdoll.
 *
 * Units are pixels and fixed ticks of 1/50 s (Stick Ranger's native rate).
 * This module is DOM-free so it can be stepped from tests or the simulation.
 */
import type { Terrain } from "./terrain";

export const PHYSICS_HZ = 50;

export enum Joint {
  Head = 0,
  Neck = 1,
  Waist = 2,
  ElbowL = 3,
  ElbowR = 4,
  HandL = 5,
  HandR = 6,
  KneeL = 7,
  KneeR = 8,
  FootL = 9,
  FootR = 10
}

/** Bones drawn as 1px lines (pairs of joint indices). */
export const BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [1, 3], [3, 5], [1, 4], [4, 6], [2, 7], [7, 9], [2, 8], [8, 10]
];

export interface Vec { x: number; y: number }

/** Standing pose relative to the point between the feet. */
const REST_POSE: ReadonlyArray<readonly [number, number]> = [
  [0, -16.8], [0, -13.2], [0, -9.6], [-2.5, -9.5], [2.5, -9.5],
  [-3, -5.2], [3, -5.2], [-2.8, -5], [2.8, -5], [-3, 0], [3, 0]
];

const DAMPING = 0.99;
const STEP_COOLDOWN = 15;
const AIRBORNE_GRACE = 10;
const TANGENT_FRICTION = 0.5;
const WATER_DRAG = 0.95;
const DRAG_FOLLOW = 0.2;

export interface BodyControl {
  /** Where the figure is trying to walk, or null to stand still. */
  targetX: number | null;
  /** Lie down as a limp ragdoll (resting). */
  relaxed: boolean;
}

export class StickBody {
  readonly p: Vec[] = [];
  /** Previous positions; velocity is implicit (p - prev). */
  readonly prev: Vec[] = [];
  /** Bit 1: touched solid ground this tick. Bit 2: in water. */
  contact = 0;
  /** Ticks since the last ground contact. */
  airborne = 0;
  private stepCooldown = 0;
  private dragJoint = -1;
  private readonly dragTarget: Vec = { x: 0, y: 0 };

  constructor(x: number, groundY: number) {
    for (let i = 0; i < REST_POSE.length; i++) {
      this.p.push({ x: 0, y: 0 });
      this.prev.push({ x: 0, y: 0 });
    }
    this.reset(x, groundY);
  }

  reset(x: number, groundY: number): void {
    REST_POSE.forEach(([ox, oy], i) => {
      this.p[i].x = this.prev[i].x = x + ox;
      this.p[i].y = this.prev[i].y = groundY - 0.01 + oy;
    });
    this.airborne = 0;
    this.stepCooldown = 0;
  }

  get feetX(): number { return (this.p[Joint.FootL].x + this.p[Joint.FootR].x) * 0.5; }
  get feetY(): number { return (this.p[Joint.FootL].y + this.p[Joint.FootR].y) * 0.5; }
  get dragging(): boolean { return this.dragJoint !== -1; }

  /** Verlet integration with per-point gravity. */
  private integrate(i: number, gravity: number): void {
    const a = this.p[i];
    const b = this.prev[i];
    const vx = (a.x - b.x) * DAMPING;
    const vy = (a.y - b.y + gravity) * DAMPING;
    b.x = a.x;
    b.y = a.y;
    a.x += vx;
    a.y += vy;
  }

  /** Move two points toward a rest length, each by its own weight. */
  private constrain(i: number, j: number, length: number, wa: number, wb: number): void {
    const a = this.p[i];
    const b = this.p[j];
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;
    dx /= dist;
    dy /= dist;
    const delta = length - dist;
    if (i === this.dragJoint) wa = 0;
    if (j === this.dragJoint) wb = 0;
    a.x += dx * delta * wa;
    a.y += dy * delta * wa;
    b.x -= dx * delta * wb;
    b.y -= dy * delta * wb;
  }

  private applyConstraints(): void {
    this.constrain(0, 1, 3.6, 0.5, 0.5);
    this.constrain(1, 2, 3.6, 0.5, 0.5);
    this.constrain(1, 3, 4.8, 0.5, 0.5);
    this.constrain(1, 4, 4.8, 0.5, 0.5);
    this.constrain(3, 5, 4.8, 0.5, 0.5);
    this.constrain(4, 6, 4.8, 0.5, 0.5);
    this.constrain(2, 7, 4.8, 0.5, 0.5);
    this.constrain(2, 8, 4.8, 0.5, 0.5);
    this.constrain(7, 9, 4.8, 0.5, 0.5);
    this.constrain(8, 10, 4.8, 0.5, 0.5);
    // Soft knee spacing keeps the legs from scissoring through each other.
    this.constrain(7, 8, 6, 0.1, 0.1);
  }

  /**
   * One walking step: kick the rear knee forward and up. Obstacles directly
   * ahead make the kick higher so the figure can climb ledges.
   */
  private walk(terrain: Terrain, targetX: number): void {
    if (this.stepCooldown > 0) { this.stepCooldown--; return; }
    const fx = this.feetX;
    const fy = this.feetY;
    if (Math.abs(targetX - fx) < 2.5) return;
    this.stepCooldown = STEP_COOLDOWN;
    const dir = targetX > fx ? 1 : -1;
    let lift = 0.6;
    if (terrain.isSolid(fx + dir * 7, fy - 3)) lift = 2;
    if (terrain.isSolid(fx + dir * 7, fy - 7)) lift = 4;
    const leftIsRear = dir > 0
      ? this.p[Joint.FootL].x < this.p[Joint.FootR].x
      : this.p[Joint.FootL].x > this.p[Joint.FootR].x;
    const knee = this.p[leftIsRear ? Joint.KneeL : Joint.KneeR];
    knee.x += 4 * dir;
    knee.y -= 3 * lift;
  }

  /** A quick arm thrust toward `x` (used for chopping, hammering, fighting). */
  strike(x: number): void {
    const dir = x > this.p[Joint.Waist].x ? 1 : -1;
    const hand = this.p[Joint.HandR];
    hand.x += 4 * dir;
    this.p[Joint.ElbowL].x -= 4 * dir;
    this.p[Joint.Waist].y += 1;
  }

  /** Collide one point with the terrain, sub-stepping its motion this tick. */
  private collide(terrain: Terrain, i: number): void {
    const c = this.p[i];
    const start = this.prev[i];
    let dx = c.x - start.x;
    let dy = c.y - start.y;
    c.x = start.x;
    c.y = start.y;
    const steps = (Math.sqrt(dx * dx + dy * dy) >> 2) + 1;
    dx /= steps;
    dy /= steps;
    if (terrain.isWater(c.x, c.y)) {
      dx *= WATER_DRAG;
      dy *= WATER_DRAG;
      this.contact |= 2;
    }
    for (let s = 0; s < steps; s++) {
      const ny = c.y + dy;
      if (ny < terrain.height) {
        if (terrain.isSolid(c.x, ny)) {
          dx *= TANGENT_FRICTION;
          dy = -dy;
          this.contact |= 1;
        } else {
          c.y = ny;
        }
      }
      const nx = c.x + dx;
      if (nx >= 0 && nx < terrain.width) {
        if (terrain.isSolid(nx, c.y)) {
          dy *= TANGENT_FRICTION;
          dx = -dx;
          this.contact |= 1;
        } else {
          c.x = nx;
        }
      }
    }
  }

  tick(terrain: Terrain, control: BodyControl): void {
    const upright = !control.relaxed && this.airborne < AIRBORNE_GRACE;
    this.airborne++;
    for (let i = 0; i < this.p.length; i++) {
      let g = 0.05;
      if (upright) {
        // The trick that keeps a Stick Ranger figure standing.
        g = i === Joint.Head ? -0.2 : i === Joint.Waist ? -0.1 : i >= Joint.FootL ? 0.3 : 0;
      }
      this.integrate(i, g);
    }

    if (this.dragJoint !== -1) {
      const d = this.p[this.dragJoint];
      d.x += (this.dragTarget.x - d.x) * DRAG_FOLLOW;
      d.y += (this.dragTarget.y - d.y) * DRAG_FOLLOW;
    }

    if (this.contact !== 0 && !control.relaxed && !this.dragging && control.targetX !== null) {
      this.walk(terrain, control.targetX);
    }

    this.applyConstraints();

    if (this.contact & 1) this.airborne = 0;
    this.contact = 0;
    for (let i = 0; i < this.p.length; i++) this.collide(terrain, i);
  }

  /** Returns true if a joint near (x, y) was grabbed. */
  grab(x: number, y: number, radius = 7): boolean {
    let best = radius * radius;
    this.dragJoint = -1;
    this.p.forEach((pt, i) => {
      const d = (pt.x - x) ** 2 + (pt.y - y) ** 2;
      if (d < best) { best = d; this.dragJoint = i; }
    });
    if (this.dragJoint !== -1) this.moveGrab(x, y);
    return this.dragJoint !== -1;
  }

  moveGrab(x: number, y: number): void {
    this.dragTarget.x = x;
    this.dragTarget.y = y;
  }

  release(): void {
    this.dragJoint = -1;
  }

  isFinite(): boolean {
    return this.p.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y));
  }
}
