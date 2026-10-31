// Assembles the `fabric` family (data center, backbone and AI fabric
// networking on the Meridian reference network) from the core DSL, the three
// reference scenarios and the eight scenario packs. See fabric-core.tsx for
// the authoring guide.
import type { Family } from "../engine";
import { FabricRenderer, type FabGen, type FabricInput, type FabricState } from "./fabric-core";
import { coreLabels, coreScenarios } from "./fabric-scenarios-core";
import * as ai1 from "./fabric-scenarios-ai1";
import * as ai2 from "./fabric-scenarios-ai2";
import * as arch from "./fabric-scenarios-arch";
import * as bgp1 from "./fabric-scenarios-bgp1";
import * as bgp2 from "./fabric-scenarios-bgp2";
import * as ops from "./fabric-scenarios-ops";
import * as overlay from "./fabric-scenarios-overlay";
import * as zero from "./fabric-scenarios-zero";

/** Every pack, in curriculum order (exported for fabric.test.ts). */
export const fabricPacks: Record<string, { scenarios: Record<string, FabGen>; labels: Record<string, string> }> = {
  core: { scenarios: coreScenarios, labels: coreLabels },
  zero,
  arch,
  bgp1,
  bgp2,
  overlay,
  ai1,
  ai2,
  ops,
};

const scenarios: Record<string, FabGen> = Object.assign({}, ...Object.values(fabricPacks).map((p) => p.scenarios));
const labels: Record<string, string> = Object.assign({}, ...Object.values(fabricPacks).map((p) => p.labels));

export const fabricFamily: Family<FabricInput, FabricState> = {
  name: "Fabric",
  description: "Data center, backbone and AI fabric networking on the Meridian reference network: leaf-spine, ECMP, IS-IS and BGP, VXLAN/EVPN, RDMA and RoCE, operations.",
  Renderer: FabricRenderer,
  algorithms: scenarios,
  labels,
  examples: Object.fromEntries(Object.keys(scenarios).map((k) => [k, {}])),
  normalise: (raw) => ({ ...raw, variant: raw.variant === undefined || raw.variant === null ? undefined : String(raw.variant) }),
};
