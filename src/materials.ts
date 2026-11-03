/**
 * Every pixel of the world is one of these materials (falling-sand style).
 * Only the stickmen and the sky/backdrop are not materials.
 * Behind the materials sits a separate back-wall layer (see `WallKind`).
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
  Hearth,
  Bedrock,
  CopperOre,
  SilverOre,
  GoldOre,
  Brick,
  Ladder,
  Platform,
  Door,
  Bookshelf,
  Desk,
  Bed,
  Cauldron,
  Torch,
  /** Temporary scaffold deck: a one-way walkway builders stand on. */
  Scaffold,
  /** Temporary scaffold pole: climbed like a ladder. */
  ScaffoldPole,
  /** Timber of the mine's headframe: stands over the shaft without blocking anyone. */
  Beam,
  /** Dug dirt and rubble tipped on the spoil heap: loose, it slides and piles. */
  Spoil
}

export enum Kind {
  Empty,
  /** Never moves (structures, ground, furniture). */
  Static,
  /** Falls and piles (sand, ash). */
  Powder,
  /** Falls and spreads sideways (water). */
  Liquid,
  /** Rises and drifts (steam, smoke, fire). */
  Gas
}

/** What a stickman gets for digging or chopping a cell. */
export type Resource = "wood" | "stone" | "copper" | "silver" | "gold" | "dirt" | "sand";

export interface MaterialInfo {
  name: string;
  kind: Kind;
  /** Heavier materials sink through lighter non-static ones. */
  density: number;
  /** Whether the stickman's body collides with it. */
  bodySolid: boolean;
  /** One-way floor: the body lands on it from above and can climb through it. */
  oneWay: boolean;
  /** Counts as a wall/floor/roof/entrance when checking whether a room is enclosed. */
  enclosing: boolean;
  /** Can be dug out by miners/builders (bedrock cannot). */
  diggable: boolean;
  /** Resource gained when this cell is dug. */
  yields: Resource | null;
  /** Chance per tick per touching flame of catching fire (0 = never). */
  flammability: number;
  burnTime: number;
  burnsInto: Material;
  ashChance: number;
  /** Lifetime range in ticks for gases. */
  life: [number, number];
  /** Light emitted (0..1). */
  glow: number;
  palette: [Rgb, Rgb, Rgb, Rgb];
}

const P = (...hex: [string, string, string, string]): [Rgb, Rgb, Rgb, Rgb] =>
  hex.map(rgb) as [Rgb, Rgb, Rgb, Rgb];

function info(partial: Partial<MaterialInfo> & Pick<MaterialInfo, "name" | "kind" | "palette">): MaterialInfo {
  return {
    density: partial.kind === Kind.Static ? 9 : 0,
    bodySolid: false,
    oneWay: false,
    enclosing: false,
    diggable: true,
    yields: null,
    flammability: 0,
    burnTime: 0,
    burnsInto: Material.Empty,
    ashChance: 0,
    life: [0, 0],
    glow: 0,
    ...partial
  };
}

const ground = { bodySolid: true, enclosing: true } as const;
const wooden = (burnTime: number) => ({ flammability: 0.01, burnTime, ashChance: 0.25 });

export const MATERIALS: Record<Material, MaterialInfo> = {
  [Material.Empty]: info({ name: "Empty", kind: Kind.Empty, palette: P("#000000", "#000000", "#000000", "#000000") }),
  [Material.Stone]: info({ name: "Stone", kind: Kind.Static, ...ground, yields: "stone", palette: P("#5e6066", "#4c4e55", "#6b6d72", "#55575d") }),
  [Material.Dirt]: info({ name: "Dirt", kind: Kind.Static, ...ground, yields: "dirt", palette: P("#6b4f35", "#5a412c", "#735638", "#634830") }),
  [Material.Grass]: info({
    name: "Grass", kind: Kind.Static, ...ground, yields: "dirt",
    flammability: 0.004, burnTime: 8, burnsInto: Material.Dirt,
    palette: P("#72995d", "#5f8a4f", "#7ba363", "#689356")
  }),
  [Material.Sand]: info({ name: "Sand", kind: Kind.Powder, density: 3, bodySolid: true, yields: "sand", palette: P("#c9b07a", "#bba26c", "#d4bc88", "#b39a66") }),
  [Material.Water]: info({ name: "Water", kind: Kind.Liquid, density: 2, diggable: false, palette: P("#3a72a0", "#24507a", "#9cc6d8", "#4580ad") }),
  [Material.Steam]: info({ name: "Steam", kind: Kind.Gas, density: 0.2, diggable: false, life: [60, 140], palette: P("#d8e4ea", "#c6d4dc", "#e6eef2", "#bfcdd6") }),
  [Material.Smoke]: info({ name: "Smoke", kind: Kind.Gas, density: 0.3, diggable: false, life: [40, 90], palette: P("#5a5a60", "#4a4a50", "#6a6a70", "#55555b") }),
  [Material.Fire]: info({ name: "Fire", kind: Kind.Gas, density: 0.1, diggable: false, life: [8, 22], glow: 1, palette: P("#db863e", "#f0b85a", "#f0d47c", "#fff3c4") }),
  [Material.Ash]: info({ name: "Ash", kind: Kind.Powder, density: 1.5, palette: P("#8d8a85", "#77746f", "#a19e98", "#6b6863") }),
  [Material.Sawdust]: info({
    name: "Sawdust", kind: Kind.Powder, density: 1.2, bodySolid: true,
    flammability: 0.08, burnTime: 14, ashChance: 0.4,
    palette: P("#c9a36b", "#b48f5a", "#d6b37c", "#a8844f")
  }),
  [Material.Bark]: info({ name: "Wood", kind: Kind.Static, yields: "wood", ...wooden(140), flammability: 0.012, palette: P("#4e3722", "#66492d", "#5a3f27", "#704f31") }),
  [Material.Leaf]: info({
    name: "Leaf", kind: Kind.Static, flammability: 0.022, burnTime: 22, ashChance: 0.1,
    palette: P("#235638", "#307348", "#408451", "#56995a")
  }),
  [Material.Plank]: info({ name: "Plank", kind: Kind.Static, ...ground, yields: "wood", ...wooden(110), palette: P("#82613c", "#9e7648", "#42302a", "#6d5032") }),
  [Material.Thatch]: info({ name: "Thatch", kind: Kind.Static, ...ground, ...wooden(45), flammability: 0.025, palette: P("#6c3c33", "#7b4840", "#8a5446", "#42302a") }),
  [Material.Glass]: info({ name: "Glass", kind: Kind.Static, enclosing: true, bodySolid: true, glow: 0.1, palette: P("#a9cfd8", "#8fbcc8", "#c4e0e6", "#7aa9b6") }),
  [Material.Hearth]: info({ name: "Embers", kind: Kind.Static, glow: 0.8, palette: P("#7a2d1a", "#b84a22", "#db863e", "#5c2416") }),
  [Material.Bedrock]: info({ name: "Bedrock", kind: Kind.Static, ...ground, diggable: false, palette: P("#2c2a30", "#3a3740", "#25232a", "#332f38") }),
  [Material.CopperOre]: info({ name: "Copper ore", kind: Kind.Static, ...ground, yields: "copper", palette: P("#a85f30", "#c4733a", "#e08a4a", "#5e6066") }),
  [Material.SilverOre]: info({ name: "Silver ore", kind: Kind.Static, ...ground, yields: "silver", palette: P("#9aa4ab", "#c9d2d8", "#eef3f6", "#5e6066") }),
  [Material.GoldOre]: info({ name: "Gold ore", kind: Kind.Static, ...ground, yields: "gold", palette: P("#c4952c", "#e8b83a", "#ffe07a", "#4c4a52") }),
  [Material.Brick]: info({ name: "Brick", kind: Kind.Static, ...ground, yields: "stone", palette: P("#8a5a4a", "#9c6a56", "#5f3e34", "#7a4e40") }),
  [Material.Ladder]: info({ name: "Ladder", kind: Kind.Static, yields: "wood", ...wooden(80), palette: P("#8a6a40", "#a07c4c", "#5a4228", "#000000") }),
  [Material.Platform]: info({ name: "Platform", kind: Kind.Static, oneWay: true, enclosing: true, yields: "wood", ...wooden(80), palette: P("#9e7648", "#82613c", "#b48a56", "#6d5032") }),
  [Material.Door]: info({ name: "Door", kind: Kind.Static, enclosing: true, yields: "wood", ...wooden(110), palette: P("#5a3f27", "#704f31", "#42302a", "#c9a36b") }),
  [Material.Bookshelf]: info({ name: "Bookshelf", kind: Kind.Static, yields: "wood", ...wooden(90), flammability: 0.03, palette: P("#4e3722", "#a33b32", "#3a6aa0", "#3f8a4e") }),
  [Material.Desk]: info({ name: "Desk", kind: Kind.Static, yields: "wood", ...wooden(90), palette: P("#704f31", "#5a3f27", "#e8dcc0", "#42302a") }),
  [Material.Bed]: info({ name: "Bed", kind: Kind.Static, yields: "wood", ...wooden(60), flammability: 0.03, palette: P("#5a3f27", "#b84a4a", "#e8e0d0", "#8a3434") }),
  [Material.Cauldron]: info({ name: "Cauldron", kind: Kind.Static, glow: 0.35, palette: P("#2e2c33", "#45424c", "#6fd36a", "#1e1d22") }),
  [Material.Torch]: info({ name: "Torch", kind: Kind.Static, glow: 1, yields: "wood", palette: P("#704f31", "#f0b85a", "#fff3c4", "#db863e") }),
  [Material.Scaffold]: info({ name: "Scaffold", kind: Kind.Static, oneWay: true, ...wooden(60), palette: P("#b58f5a", "#9e7a48", "#6d5032", "#c9a46c") }),
  [Material.ScaffoldPole]: info({ name: "Scaffold pole", kind: Kind.Static, ...wooden(60), palette: P("#a0855a", "#8a7048", "#6d5032", "#b8996a") }),
  [Material.Beam]: info({ name: "Beam", kind: Kind.Static, ...wooden(150), palette: P("#5e4228", "#4e3722", "#704f31", "#3e2b1a") }),
  [Material.Spoil]: info({ name: "Spoil", kind: Kind.Powder, density: 3, bodySolid: true, yields: "dirt", palette: P("#7a5c40", "#6b4f35", "#86684a", "#5f6066") })
};

/** Back walls: drawn behind cells, never collided with. Built walls make rooms. */
export enum WallKind {
  None = 0,
  DirtWall,
  StoneWall,
  PlankWall,
  BrickWall
}

export const WALL_PALETTES: Record<WallKind, [Rgb, Rgb, Rgb, Rgb]> = {
  [WallKind.None]: P("#000000", "#000000", "#000000", "#000000"),
  [WallKind.DirtWall]: P("#3a2a1d", "#33251a", "#402e20", "#2e2117"),
  [WallKind.StoneWall]: P("#2f3036", "#2a2b30", "#35363c", "#26272c"),
  [WallKind.PlankWall]: P("#5e4630", "#523d29", "#674d35", "#3e2e1f"),
  [WallKind.BrickWall]: P("#5c3d33", "#6a463a", "#402922", "#523730")
};

export function isBuiltWall(w: WallKind): boolean {
  return w === WallKind.PlankWall || w === WallKind.BrickWall;
}

export const MATERIAL_LIST = (Object.values(Material).filter((v) => typeof v === "number") as Material[]);
