/**
 * Clouds drift across the sky (sky elements, not materials). Some of them
 * rain, and every raindrop is a real Water cell in the grid: it puddles,
 * runs into the river, puts out fires, soaks away and evaporates.
 */
import { Material, WORLD_W, type Terrain } from "./terrain";

export interface Cloud {
  x: number;
  y: number;
  width: number;
  speed: number;
  /** Ticks of rain left (0 = dry cloud). */
  rain: number;
  seed: number;
}

const CLOUD_SPAWN_CHANCE = 1 / (50 * 10); // about one every 20 s across the whole world
const MAX_CLOUDS = 16;
const RAIN_CHANCE = 0.3;

export class Weather {
  readonly clouds: Cloud[] = [];

  constructor() {
    // Start with a couple of clouds already in the sky.
    for (let k = 0; k < 9; k++) this.spawn(Math.random() * WORLD_W, false);
  }

  private spawn(x: number, mayRain = true): void {
    const width = 30 + Math.random() * 50;
    this.clouds.push({
      x,
      y: 60 + Math.random() * 60,
      width,
      speed: (0.06 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1),
      rain: mayRain && Math.random() < RAIN_CHANCE ? 50 * (15 + Math.random() * 45) : 0,
      seed: Math.random() * 1000
    });
  }

  /** Is it raining within view of world column x? */
  rainingNear(x: number): boolean {
    return this.clouds.some((c) => c.rain > 0 && Math.abs(c.x - x) < 200);
  }

  get raining(): boolean {
    return this.clouds.some((c) => c.rain > 0);
  }

  step(terrain: Terrain): void {
    if (this.clouds.length < MAX_CLOUDS && Math.random() < CLOUD_SPAWN_CHANCE) {
      const fromLeft = Math.random() < 0.5;
      this.spawn(fromLeft ? -50 : WORLD_W + 50);
      const c = this.clouds[this.clouds.length - 1];
      c.speed = Math.abs(c.speed) * (fromLeft ? 1 : -1);
    }
    for (let k = this.clouds.length - 1; k >= 0; k--) {
      const c = this.clouds[k];
      c.x += c.speed;
      if (c.x < -80 || c.x > WORLD_W + 80) { this.clouds.splice(k, 1); continue; }
      if (c.rain > 0) {
        c.rain--;
        const drops = Math.random() < 0.35 ? 1 : 0;
        for (let d = 0; d < drops; d++) {
          const x = Math.floor(c.x - c.width / 2 + Math.random() * c.width);
          const y = Math.floor(c.y + 6);
          if (terrain.inBounds(x, y) && terrain.get(x, y) === Material.Empty) terrain.set(x, y, Material.Water, 3);
        }
      }
    }
  }
}
