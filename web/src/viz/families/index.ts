// Additional families are registered here. Each family lives in its own
// file and exports a `Family`. (See array.tsx / graph.tsx / network.tsx for
// the three reference implementations, and system-core.tsx for a DSL-based
// family split across scenario packs.)
import type { Family } from "../engine";
import { dpFamily } from "./dp";
import { recursionFamily } from "./recursion";
import { systemFamily } from "./system";

export const extraFamilies: Record<string, Family<never, unknown>> = {
  system: systemFamily as unknown as Family<never, unknown>,
  dp: dpFamily as unknown as Family<never, unknown>,
  recursion: recursionFamily as unknown as Family<never, unknown>,
};
