/**
 * What the alchemy lab can create with Knowledge: new building blueprints
 * and improvements. Each project costs Knowledge (and sometimes metal) up
 * front, then takes alchemist working time.
 */
import type { Resource } from "./materials";

export interface Project {
  id: string;
  name: string;
  description: string;
  kind: "blueprint" | "improvement";
  knowledge: number;
  resources: Partial<Record<Resource, number>>;
  /** Alchemist-seconds of work. */
  work: number;
  requires: string[];
}

export const PROJECTS: Project[] = [
  { id: "torches", name: "Torches", kind: "improvement", knowledge: 15, resources: { wood: 10 }, work: 60, requires: [],
    description: "Miners hang torches along the tunnels." },
  { id: "bunkhouse", name: "Bunkhouse blueprint", kind: "blueprint", knowledge: 30, resources: {}, work: 90, requires: [],
    description: "A two-storey home with four beds." },
  { id: "deepShaft1", name: "Deeper shaft I", kind: "improvement", knowledge: 40, resources: { stone: 30 }, work: 120, requires: [],
    description: "Shore up the shaft to sink six more mine levels." },
  { id: "copperPicks", name: "Copper picks", kind: "improvement", knowledge: 50, resources: { copperBar: 6 }, work: 150, requires: [],
    description: "Miners dig half again as fast." },
  { id: "stoneCottage", name: "Stone cottage blueprint", kind: "blueprint", knowledge: 60, resources: {}, work: 150, requires: ["bunkhouse"],
    description: "A fireproof brick home with three beds." },
  { id: "deepShaft2", name: "Deeper shaft II", kind: "improvement", knowledge: 100, resources: { copperBar: 5 }, work: 240, requires: ["deepShaft1"],
    description: "Eight more levels, down to the silver." },
  { id: "silverQuills", name: "Silver quills", kind: "improvement", knowledge: 120, resources: { silverBar: 4 }, work: 240, requires: ["deepShaft2"],
    description: "Scholars learn half again as much from every book." },
  { id: "grandLibrary", name: "Grand library blueprint", kind: "blueprint", knowledge: 150, resources: {}, work: 300, requires: ["silverQuills"],
    description: "Two floors of stacks over a lab with twin cauldrons." },
  { id: "deepShaft3", name: "Deeper shaft III", kind: "improvement", knowledge: 250, resources: { silverBar: 5 }, work: 360, requires: ["deepShaft2"],
    description: "Twelve more levels, down to the gold above the bedrock." },
  { id: "goldLeaf", name: "Gold leaf", kind: "improvement", knowledge: 400, resources: { goldBar: 4 }, work: 480, requires: ["deepShaft3"],
    description: "Alchemists work twice as fast." }
];

export function project(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}
