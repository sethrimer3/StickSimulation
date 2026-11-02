/**
 * Every pixel of the world is one of these materials (falling-sand style).
 * Only the stickman, creatures and the sky/backdrop are not materials.
 */
import { rgb, type Rgb } from "./pixels";

export enum Material {
  Empty = 0,
  Stone,
  Dirt,
  Grass,
  Sand,
  Water,
  Steam,
  Smoke,
  Fire,
  Ash,
  Sawdust,
  Bark,
  Leaf,
  Plank,
  Thatch,
  Glass,
  Hearth
}

export enum Kind {
  Empty,
  /** Never moves (structures, ground). */
  Static,
  /** Falls and piles (sand, ash). */
  Powder,
  /** Falls and spreads sideways (water). */
  Liquid,
  /** Rises and drifts (steam, smoke, fire). */
  Gas
}

export interface MaterialInfo {
  name: string;
  kind: Kind;
  /** Heavier materials sink through lighter non-static ones. */
  density: number;
  /** Whether the stickman's body collides with it. */
  bodySolid: boolean;
  /** Chance per tick per touching flame of catching fire (0 = never). */
  flammability: number;
  /** Ticks a cell burns before turning into `burnsInto`. */
  burnTime: number;
  burnsInto: Material;
  /** Chance that burning leaves ash instead of `burnsInto`. */
  ashChance: number;
  /** Lifetime range in ticks for gases. */
  life: [number, number];
  /** Light emitted (0..1) for the lighting pass. */
  glow: number;
  /** Four color shades; each cell stores which shade it uses. */
  palette: [Rgb, Rgb, Rgb, Rgb];
}

const P = (...hex: [string, string, string, string]): [Rgb, Rgb, Rgb, Rgb] =>
  hex.map(rgb) as [Rgb, Rgb, Rgb, Rgb];

function info(partial: Partial<MaterialInfo> & Pick<MaterialInfo, "name" | "kind" | "palette">): MaterialInfo {
  return {
    density: 0,
    bodySolid: false,
    flammability: 0,
    burnTime: 0,
    burnsInto: Material.Empty,
    ashChance: 0,
    life: [0, 0],
    glow: 0,
    ...partial
  };
}

export const MATERIALS: Record<Material, MaterialInfo> = {
  [Material.Empty]: info({ name: "Empty", kind: Kind.Empty, palette: P("#000000", "#000000", "#000000", "#000000") }),
  [Material.Stone]: info({ name: "Stone", kind: Kind.Static, density: 9, bodySolid: true, palette: P("#5e6066", "#4c4e55", "#6b6d72", "#55575d") }),
  [Material.Dirt]: info({ name: "Dirt", kind: Kind.Static, density: 9, bodySolid: true, palette: P("#6b4f35", "#5a412c", "#735638", "#634830") }),
  [Material.Grass]: info({
    name: "Grass", kind: Kind.Static, density: 9, bodySolid: true,
    flammability: 0.004, burnTime: 8, burnsInto: Material.Dirt,
    palette: P("#72995d", "#5f8a4f", "#7ba363", "#689356")
  }),
  [Material.Sand]: info({ name: "Sand", kind: Kind.Powder, density: 3, bodySolid: true, palette: P("#c9b07a", "#bba26c", "#d4bc88", "#b39a66") }),
  [Material.Water]: info({ name: "Water", kind: Kind.Liquid, density: 2, palette: P("#3a72a0", "#24507a", "#9cc6d8", "#4580ad") }),
  [Material.Steam]: info({ name: "Steam", kind: Kind.Gas, density: 0.2, life: [60, 140], palette: P("#d8e4ea", "#c6d4dc", "#e6eef2", "#bfcdd6") }),
  [Material.Smoke]: info({ name: "Smoke", kind: Kind.Gas, density: 0.3, life: [40, 90], palette: P("#5a5a60", "#4a4a50", "#6a6a70", "#55555b") }),
  [Material.Fire]: info({ name: "Fire", kind: Kind.Gas, density: 0.1, life: [8, 22], glow: 1, palette: P("#db863e", "#f0b85a", "#f0d47c", "#fff3c4") }),
  [Material.Ash]: info({ name: "Ash", kind: Kind.Powder, density: 1.5, palette: P("#8d8a85", "#77746f", "#a19e98", "#6b6863") }),
  [Material.Sawdust]: info({
    name: "Sawdust", kind: Kind.Powder, density: 1.2, bodySolid: true,
    flammability: 0.08, burnTime: 14, ashChance: 0.4,
    palette: P("#c9a36b", "#b48f5a", "#d6b37c", "#a8844f")
  }),
  [Material.Bark]: info({
    name: "Wood", kind: Kind.Static, density: 9,
    flammability: 0.012, burnTime: 140, ashChance: 0.25,
    palette: P("#4e3722", "#66492d", "#5a3f27", "#704f31")
  }),
  [Material.Leaf]: info({
    name: "Leaf", kind: Kind.Static, density: 9,
    flammability: 0.022, burnTime: 22, ashChance: 0.1,
    palette: P("#235638", "#307348", "#408451", "#56995a")
  }),
  [Material.Plank]: info({
    name: "Plank", kind: Kind.Static, density: 9,
    flammability: 0.01, burnTime: 110, ashChance: 0.25,
    palette: P("#82613c", "#9e7648", "#42302a", "#6d5032")
  }),
  [Material.Thatch]: info({
    name: "Thatch", kind: Kind.Static, density: 9,
    flammability: 0.025, burnTime: 45, ashChance: 0.2,
    palette: P("#6c3c33", "#7b4840", "#8a5446", "#42302a")
  }),
  [Material.Glass]: info({ name: "Glass", kind: Kind.Static, density: 9, glow: 0.25, palette: P("#eab86d", "#d9a75c", "#f2c987", "#c99a55") }),
  [Material.Hearth]: info({ name: "Embers", kind: Kind.Static, density: 9, glow: 0.8, palette: P("#7a2d1a", "#b84a22", "#db863e", "#5c2416") })
};

export const MATERIAL_COUNT = Object.keys(MATERIALS).length;
