// Registry of the non-reference families. Each family lives in its own file
// and exports a `Family`. (See array.tsx / graph.tsx / network.tsx for the
// three reference implementations, and system-core.tsx for a DSL-based
// family split across scenario packs.)
import type { Family } from "../engine";
import { bitsFamily } from "./bits";
import { concurrencyFamily } from "./concurrency";
import { dpFamily } from "./dp";
import { hashTableFamily } from "./hash-table";
import { heapFamily } from "./heap";
import { linkedListFamily } from "./linked-list";
import { memoryFamily } from "./memory";
import { mlFamily } from "./ml";
import { recursionFamily } from "./recursion";
import { stackQueueFamily } from "./stack-queue";
import { stringFamily } from "./string";
import { systemFamily } from "./system";
import { treeFamily } from "./tree";
import { trieFamily } from "./trie";

const f = <I, S>(x: Family<I, S>) => x as unknown as Family<never, unknown>;

export const extraFamilies: Record<string, Family<never, unknown>> = {
  "linked-list": f(linkedListFamily),
  "stack-queue": f(stackQueueFamily),
  "hash-table": f(hashTableFamily),
  tree: f(treeFamily),
  heap: f(heapFamily),
  trie: f(trieFamily),
  dp: f(dpFamily),
  recursion: f(recursionFamily),
  string: f(stringFamily),
  bits: f(bitsFamily),
  system: f(systemFamily),
  concurrency: f(concurrencyFamily),
  memory: f(memoryFamily),
  ml: f(mlFamily),
};
