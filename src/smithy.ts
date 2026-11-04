/**
 * The smithy, after the Tower Defense Mine's: forge hands smelt ore into bars
 * (four copper ore, two silver or one gold to a bar), smiths work the bars,
 * and every ten bars of a metal make a Smithy point of it. Smithy points buy
 * the colony's tools.
 */
export type Metal = "copper" | "silver" | "gold";
export const METALS: Metal[] = ["copper", "silver", "gold"];
export const ORE_PER_BAR: Record<Metal, number> = { copper: 4, silver: 2, gold: 1 };
export const BARS_PER_POINT = 10;
/** Ore the forge holds; a short-handed forge leaves the rest waiting in the yard. */
export const FORGE_CAP = 40;

export interface SmithyUpgrade {
  id: string;
  name: string;
  description: string;
  metal: Metal;
  points: number;
  requires?: string;
}

export const SMITHY_UPGRADES: SmithyUpgrade[] = [
  { id: "sharpPicks", name: "Sharp picks", metal: "copper", points: 1, description: "Miners dig a quarter faster." },
  { id: "steelAxes", name: "Keen axes", metal: "copper", points: 1, description: "Trees come down in seven strokes instead of ten." },
  { id: "hammers", name: "Builders' hammers", metal: "copper", points: 2, description: "Builders place a quarter more with every blow." },
  { id: "lanterns", name: "Silver lanterns", metal: "silver", points: 1, description: "Everyone's lantern shines brighter." },
  { id: "silverPicks", name: "Silver-tipped picks", metal: "silver", points: 2, requires: "sharpPicks", description: "Miners dig a quarter faster again." },
  { id: "goldQuills", name: "Gold-nibbed quills", metal: "gold", points: 1, description: "Scholars learn a quarter more from every book." },
  { id: "goldHammers", name: "Gilded hammers", metal: "gold", points: 2, requires: "hammers", description: "Builders place a quarter more again." }
];

export function smithyUpgrade(id: string): SmithyUpgrade | undefined {
  return SMITHY_UPGRADES.find((u) => u.id === id);
}
