/**
 * Clouds drift across the sky (sky elements, not materials). Some of them
 * rain, and every raindrop is a real Water cell in the grid: it puddles,
 * runs into the river, puts out fires, soaks away and evaporates.
 */
import { Material, type Terrain } from "./terrain";

export interface Cloud {
  x: number;
  y: number;
  width: number;
  speed: number;
  /** Ticks of rain left (0 = dry cloud). */
  rain: number;
  seed: number;
}

const CLOUD_SPAWN_CHANCE = 1 / (50 * 50); // about one every 50 s
const RAIN_CHANCE = 0.35;

export class Weather {
  readonly clouds: Cloud[] = [];

  constructor() {
    // Start with a couple of clouds already in the sky.
    for (let k = 0; k < 2; k++) this.spawn(30 + Math.random() * 180, false);
  }

  private spawn(x: number, mayRain = true): void {
    const width = 24 + Math.random() * 36;
    this.clouds.push({
      x,
      y: 22 + Math.random() * 40,
      width,
      speed: (0.04 + Math.random() * 0.08) * (Math.random() < 0.5 ? -1 : 1),
      rain: mayRain && Math.random() < RAIN_CHANCE ? 50 * (15 + Math.random() * 45) : 0,
      seed: Math.random() * 1000
    });
  }

  get raining(): boolean {
    return this.clouds.some((c) => c.rain > 0);
  }

  step(terrain: Terrain): void {
    if (this.clouds.length < 4 && Math.random() < CLOUD_SPAWN_CHANCE) {
      const fromLeft = Math.random() < 0.5;
      this.spawn(fromLeft ? -50 : 300);
      const c = this.clouds[this.clouds.length - 1];
      c.speed = Math.abs(c.speed) * (fromLeft ? 1 : -1);
    }
    for (let k = this.clouds.length - 1; k >= 0; k--) {
      const c = this.clouds[k];
      c.x += c.speed;
      if (c.x < -80 || c.x > 340) { this.clouds.splice(k, 1); continue; }
      if (c.rain > 0) {
        c.rain--;
        const drops = Math.random() < 0.7 ? 1 : 0;
        for (let d = 0; d < drops; d++) {
          const x = Math.floor(c.x - c.width / 2 + Math.random() * c.width);
          const y = Math.floor(c.y + 6);
          if (terrain.inBounds(x, y) && terrain.get(x, y) === Material.Empty) terrain.set(x, y, Material.Water, 3);
        }
      }
    }
  }
}
