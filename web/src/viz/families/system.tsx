// Assembles the `system` family from the core DSL and the scenario packs.
import { consistentHashing, makeSystemFamily, raftElection, requestFlow, type SysGen } from "./system-core";
import { scenariosA, labelsA } from "./system-scenarios-a";
import { scenariosB, labelsB } from "./system-scenarios-b";

const base: Record<string, SysGen> = { "request-flow": requestFlow, "consistent-hashing": consistentHashing, "raft-election": raftElection };
const baseLabels = { "request-flow": "Request flow through a web stack", "consistent-hashing": "Consistent hashing ring", "raft-election": "Raft leader election" };

export const systemFamily = makeSystemFamily({ ...base, ...scenariosA, ...scenariosB }, { ...baseLabels, ...labelsA, ...labelsB });
