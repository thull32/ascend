// Registry of visualisation families. Content references `type` (family)
// and `algorithm`/`scenario`. Keep content/CONTENT_GUIDE.md's catalogue in
// sync with this file; `catalogue()` is what the gallery renders.
import type { Family } from "./engine";
import { arrayFamily } from "./families/array";
import { graphFamily } from "./families/graph";
import { networkFamily } from "./families/network";
import { extraFamilies } from "./families";

const families: Record<string, Family<never, unknown>> = {
  array: arrayFamily as unknown as Family<never, unknown>,
  graph: graphFamily as unknown as Family<never, unknown>,
  network: networkFamily as unknown as Family<never, unknown>,
  ...extraFamilies,
};

export function getFamily(type: string): Family<never, unknown> | undefined {
  return families[type];
}

export function catalogue(): { type: string; family: Family<never, unknown>; algorithms: string[] }[] {
  return Object.entries(families).map(([type, family]) => ({ type, family, algorithms: Object.keys(family.algorithms) }));
}
