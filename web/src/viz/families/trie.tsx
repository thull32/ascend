// Tries: insert/search/prefix walks, autocomplete by subtree enumeration,
// and word-break as a DP that walks the trie from every reachable position.
// Nodes are a flat array (id 0 is the root) with ordered child lists, so
// the renderer lays the tree out by leaf count and depth per frame.
import { Legend, Vars, toneFill, toneStroke, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";
import { Readouts, type Readout } from "./tree";

export type TrieOpName = "insert" | "search" | "prefix" | "delete";
export interface TrieOp {
  op: TrieOpName;
  word: string;
}

export interface TrieInput {
  operations: TrieOp[];
  /** Dictionary for word-break (also accepted as `dictionary` / `dict`). */
  words: string[];
  /** Text to segment for word-break (also accepted as `s` / `target`). */
  text?: string;
}

export interface TrieNode {
  id: number;
  ch: string;
  parent: number | null;
  children: number[];
  terminal: boolean;
}

export interface TrieState {
  nodes: TrieNode[];
  nodeTones: Record<number, Tone>;
  /** Keyed by child id. */
  edgeTones: Record<number, Tone>;
  labels: Record<number, string>;
  readouts: Readout[];
  vars: Record<string, unknown>;
}

const MAX_OPS = 30;
const MAX_WORD = 12;
const MAX_CHARS = 200;
const MAX_TEXT = 24;

type G = (input: TrieInput) => ReturnType<Frames<TrieState>["done"]>;

class Trie {
  s: TrieState = { nodes: [{ id: 0, ch: "", parent: null, children: [], terminal: false }], nodeTones: {}, edgeTones: {}, labels: {}, readouts: [], vars: {} };
  f = new Frames<TrieState>(() => ({
    nodes: this.s.nodes.map((n) => ({ ...n, children: [...n.children] })),
    nodeTones: { ...this.s.nodeTones },
    edgeTones: { ...this.s.edgeTones },
    labels: { ...this.s.labels },
    readouts: this.s.readouts.map((r) => ({ ...r, values: [...r.values], tones: r.tones ? [...r.tones] : undefined, labels: r.labels ? [...r.labels] : undefined, pointers: r.pointers ? { ...r.pointers } : undefined })),
    vars: { ...this.s.vars },
  }));
  node(id: number): TrieNode {
    const n = this.s.nodes[id];
    if (!n) throw new Error(`no node ${id}`);
    return n;
  }
  child(id: number, ch: string): number | null {
    for (const c of this.node(id).children) if (this.node(c).ch === ch) return c;
    return null;
  }
  add(parent: number, ch: string): number {
    const id = this.s.nodes.length;
    this.s.nodes.push({ id, ch, parent, children: [], terminal: false });
    const kids = this.node(parent).children;
    kids.push(id);
    kids.sort((a, b) => (this.node(a).ch < this.node(b).ch ? -1 : 1));
    return id;
  }
  /** Ids from the root to `id` (exclusive of the root). */
  pathTo(id: number): number[] {
    const ids: number[] = [];
    let cur: number | null = id;
    let guard = 0;
    while (cur !== null && cur !== 0 && guard++ < 64) {
      ids.push(cur);
      cur = this.node(cur).parent;
    }
    return ids.reverse();
  }
  word(id: number): string {
    return this.pathTo(id).map((i) => this.node(i).ch).join("");
  }
  clear(): void {
    this.s.nodeTones = {};
    this.s.edgeTones = {};
  }
  /** Highlight the walk from the root down to `id`. */
  tonePath(id: number, node: Tone = "visited", edge: Tone = "path"): void {
    for (const i of this.pathTo(id)) {
      this.s.nodeTones[i] = node;
      this.s.edgeTones[i] = edge;
    }
  }
  insertSilent(word: string): number[] {
    let cur = 0;
    const created: number[] = [];
    for (const ch of word) {
      let next = this.child(cur, ch);
      if (next === null) {
        next = this.add(cur, ch);
        created.push(next);
      }
      cur = next;
    }
    if (word.length) this.node(cur).terminal = true;
    return created;
  }
  get wordCount(): number {
    return this.s.nodes.filter((n) => n.terminal).length;
  }
}

const queryReadout = (label: string, word: string, i: number, tones: (Tone | undefined)[]): Readout => ({ label, values: word.split(""), tones, pointers: i < word.length ? { i } : undefined });

/** Walk `word` from the root, one frame per character. Returns the node reached, or null. */
function walk(t: Trie, word: string, label: string, opts: { create?: boolean; readouts?: () => Readout[] }): number | null {
  const extra = opts.readouts ?? (() => []);
  const tones: (Tone | undefined)[] = word.split("").map(() => undefined);
  let cur = 0;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i]!;
    const existing = t.child(cur, ch);
    t.clear();
    t.tonePath(cur);
    if (existing !== null) {
      cur = existing;
      tones[i] = "visited";
      t.s.nodeTones[cur] = "active";
      t.s.edgeTones[cur] = "path";
      t.s.readouts = [queryReadout(label, word, i + 1, tones), ...extra()];
      t.f.push(`'${ch}': an edge for '${ch}' already exists under "${t.word(t.node(cur).parent ?? 0) || "root"}", so follow it${opts.create ? " (shared prefix, no new node)" : ""}.`, "follow");
    } else if (opts.create) {
      cur = t.add(cur, ch);
      tones[i] = "done";
      t.s.nodeTones[cur] = "done";
      t.s.edgeTones[cur] = "done";
      t.s.readouts = [queryReadout(label, word, i + 1, tones), ...extra()];
      t.f.push(`'${ch}': no edge for '${ch}' under "${t.word(t.node(cur).parent ?? 0) || "root"}", so create a new node.`, "create");
    } else {
      tones[i] = "danger";
      t.s.nodeTones[cur] = "danger";
      t.s.readouts = [queryReadout(label, word, i, tones), ...extra()];
      t.f.push(`'${ch}': node "${t.word(cur) || "root"}" has no child '${ch}', so no stored key starts with "${word.slice(0, i + 1)}". Stop after ${i + 1} step${i ? "s" : ""}.`, "miss");
      return null;
    }
    if (t.f.full) return null;
  }
  t.s.readouts = [queryReadout(label, word, word.length, tones), ...extra()];
  return cur;
}

const insertSearch: G = (input) => {
  const t = new Trie();
  const ops = input.operations;
  const results: string[] = [];
  const resultTones: (Tone | undefined)[] = [];
  const extra = () => [{ label: "results", values: [...results], tones: [...resultTones], labels: [] }];
  if (ops.length === 0) {
    t.f.push(`No operations: give \`operations\` like [["insert", "cat"], ["search", "car"], ["prefix", "ca"]].`, "empty");
    return t.f.done();
  }
  t.f.push(`A trie stores strings character by character along root-to-node paths; keys with a common prefix share the nodes of that prefix. A terminal marker (double ring) says "a key ends here".`);
  for (const { op, word } of ops) {
    if (t.f.full) break;
    t.s.vars = { op, word, nodes: t.s.nodes.length, keys: t.wordCount };
    const label = `${op} "${word}"`;
    if (op === "insert") {
      const id = walk(t, word, label, { create: true, readouts: extra });
      if (id === null) continue;
      t.node(id).terminal = true;
      t.clear();
      t.tonePath(id);
      t.s.nodeTones[id] = "done";
      results.push(`+${word}`);
      resultTones.push("done");
      t.s.readouts = [t.s.readouts[0]!, ...extra()];
      t.s.vars = { op, word, nodes: t.s.nodes.length, keys: t.wordCount };
      t.f.push(`End of "${word}": mark this node terminal. Without the marker "${word}" would only be a prefix of longer keys, not a key itself.`, "terminal");
    } else if (op === "search") {
      const id = walk(t, word, label, { readouts: extra });
      if (id === null) {
        results.push(`${word}: no`);
        resultTones.push("danger");
        t.s.readouts = [t.s.readouts[0]!, ...extra()];
        t.f.push(`search("${word}") = false: the walk fell off the trie.`, "result");
        continue;
      }
      const ok = t.node(id).terminal;
      t.clear();
      t.tonePath(id);
      t.s.nodeTones[id] = ok ? "done" : "danger";
      results.push(`${word}: ${ok ? "yes" : "no"}`);
      resultTones.push(ok ? "done" : "danger");
      t.s.readouts = [t.s.readouts[0]!, ...extra()];
      t.f.push(ok ? `Every character matched and the node is terminal: search("${word}") = true.` : `Every character matched but the node is not terminal: "${word}" is only a prefix of a stored key, so search("${word}") = false.`, "result");
    } else if (op === "prefix") {
      const id = walk(t, word, label, { readouts: extra });
      if (id === null) {
        results.push(`${word}*: no`);
        resultTones.push("danger");
        t.s.readouts = [t.s.readouts[0]!, ...extra()];
        t.f.push(`startsWith("${word}") = false.`, "result");
        continue;
      }
      t.clear();
      t.tonePath(id);
      t.s.nodeTones[id] = "done";
      results.push(`${word}*: yes`);
      resultTones.push("done");
      t.s.readouts = [t.s.readouts[0]!, ...extra()];
      t.f.push(`Reached the node for "${word}": startsWith("${word}") = true. A prefix check needs no terminal flag, just that the path exists.`, "result");
    } else {
      const id = walk(t, word, label, { readouts: extra });
      if (id === null || !t.node(id).terminal) {
        results.push(`−${word}: absent`);
        resultTones.push("muted");
        t.s.readouts = [t.s.readouts[0]!, ...extra()];
        t.f.push(`"${word}" is not a stored key, so delete is a no-op.`, "result");
        continue;
      }
      t.node(id).terminal = false;
      t.clear();
      t.tonePath(id);
      t.s.nodeTones[id] = "danger";
      results.push(`−${word}`);
      resultTones.push("danger");
      t.s.readouts = [t.s.readouts[0]!, ...extra()];
      t.f.push(`Unmark the terminal flag on "${word}". Nodes are only removed if nothing else needs them.`, "unmark");
      let cur: number | null = id;
      while (cur !== null && cur !== 0 && !t.node(cur).terminal && t.node(cur).children.length === 0) {
        const n: TrieNode = t.node(cur);
        const parent: number = n.parent ?? 0;
        const kids = t.node(parent).children;
        kids.splice(kids.indexOf(cur), 1);
        t.clear();
        t.tonePath(parent);
        t.s.nodeTones[parent] = "active";
        t.f.push(`Node '${n.ch}' is now a childless non-terminal node: prune it from "${t.word(parent) || "root"}".`, "prune");
        cur = parent;
        if (t.f.full) break;
      }
    }
  }
  t.clear();
  for (const n of t.s.nodes) if (n.terminal) t.s.nodeTones[n.id] = "done";
  t.s.vars = { nodes: t.s.nodes.length, keys: t.wordCount };
  t.f.push(`${t.wordCount} keys in ${t.s.nodes.length} nodes. Insert, search and prefix all cost O(L) for a key of length L, independent of how many keys are stored.`, "done");
  return t.f.done();
};

const prefixAutocomplete: G = (input) => {
  const t = new Trie();
  const inserts = input.operations.filter((o) => o.op === "insert").map((o) => o.word);
  const queries = input.operations.filter((o) => o.op !== "insert" && o.op !== "delete").map((o) => o.word);
  if (inserts.length === 0) {
    t.f.push(`No keys: give \`operations\` with ["insert", word] entries followed by ["prefix", p] queries.`, "empty");
    return t.f.done();
  }
  t.f.push(`Autocomplete: walk to the prefix node (O(L)), then enumerate the subtree below it, emitting a suggestion at every terminal node.`);
  for (const w of inserts) {
    const created = t.insertSilent(w);
    t.clear();
    let cur = 0;
    for (const ch of w) cur = t.child(cur, ch) ?? cur;
    t.tonePath(cur);
    for (const id of created) {
      t.s.nodeTones[id] = "done";
      t.s.edgeTones[id] = "done";
    }
    t.s.vars = { inserted: w, "new nodes": created.length, keys: t.wordCount };
    t.f.push(`Insert "${w}": ${created.length === 0 ? "every node already existed, only the terminal flag is set" : `${w.length - created.length} shared, ${created.length} new node${created.length === 1 ? "" : "s"}`}.`, "insert");
    if (t.f.full) return t.f.done();
  }
  for (const q of queries.length ? queries : [inserts[0]!.slice(0, 2)]) {
    const suggestions: string[] = [];
    const stack: number[] = [];
    const extra = () => [
      { label: "DFS stack", values: stack.map((id) => t.word(id)), labels: [] },
      { label: "suggestions", values: [...suggestions], tones: suggestions.map(() => "done" as Tone), labels: [] },
    ];
    const id = walk(t, q, `prefix "${q}"`, { readouts: extra });
    if (id === null) {
      t.s.vars = { prefix: q, suggestions: [] };
      t.f.push(`No key starts with "${q}", so there are no suggestions: the answer is decided after at most ${q.length} steps.`, "result");
      continue;
    }
    t.clear();
    t.tonePath(id);
    t.s.nodeTones[id] = "active";
    t.f.push(`Reached the node for "${q}". Every key in the subtree below it starts with "${q}": enumerate it depth-first, children in sorted order.`, "prefix");
    const dfs = (n: number) => {
      if (t.f.full) return;
      stack.push(n);
      const node = t.node(n);
      t.clear();
      t.tonePath(id, "visited", "path");
      for (const sid of stack) t.s.nodeTones[sid] = "path";
      t.s.nodeTones[n] = "active";
      t.s.edgeTones[n] = "path";
      const w = t.word(n);
      if (node.terminal) {
        suggestions.push(w);
        t.s.nodeTones[n] = "done";
        t.s.readouts = [t.s.readouts[0]!, ...extra()];
        t.s.vars = { prefix: q, suggestions: [...suggestions] };
        t.f.push(`"${w}" is terminal: emit it as suggestion #${suggestions.length}.${node.children.length ? " Keep going: longer keys may follow." : ""}`, "emit");
      } else {
        t.s.readouts = [t.s.readouts[0]!, ...extra()];
        t.f.push(`"${w}" is not terminal (an internal prefix only): descend into its ${node.children.length} child${node.children.length === 1 ? "" : "ren"}.`, "descend");
      }
      for (const c of node.children) dfs(c);
      stack.pop();
    };
    dfs(id);
    t.clear();
    t.tonePath(id);
    for (const n of t.s.nodes) if (n.terminal && t.word(n.id).startsWith(q)) t.s.nodeTones[n.id] = "done";
    t.s.readouts = [t.s.readouts[0]!, ...extra()];
    t.s.vars = { prefix: q, suggestions: [...suggestions] };
    t.f.push(`Suggestions for "${q}": ${suggestions.join(", ") || "none"}, already in lexicographic order because children are visited sorted. Cost O(L + size of subtree).`, "result");
  }
  t.f.push(`Enumerating a subtree costs its size, which is why production autocomplete caches the top-k completions at each node instead of walking every time.`, "done");
  return t.f.done();
};

const wordBreak: G = (input) => {
  const t = new Trie();
  const dict = input.words.length ? input.words : input.operations.filter((o) => o.op === "insert").map((o) => o.word);
  const text = input.text ?? "";
  const n = text.length;
  if (dict.length === 0 || n === 0) {
    t.f.push(`Word break needs \`words\` (the dictionary) and \`text\` (the string to segment).`, "empty");
    return t.f.done();
  }
  const dp: boolean[] = Array.from({ length: n + 1 }, () => false);
  const from: (number | null)[] = Array.from({ length: n + 1 }, () => null);
  dp[0] = true;
  const dpTones: (Tone | undefined)[] = dp.map(() => undefined);
  const textTones: (Tone | undefined)[] = text.split("").map(() => undefined);
  const sync = (i?: number, j?: number) => {
    t.s.readouts = [
      { label: "text", values: text.split(""), tones: [...textTones], pointers: i === undefined ? undefined : { i, j } },
      { label: "dp[j] = text[0..j) can be segmented", values: dp.map((v) => (v ? "T" : "F")), tones: dp.map((v, k) => dpTones[k] ?? (v ? "done" : undefined)) },
    ];
  };
  sync();
  t.f.push(`Build a trie of the dictionary, then dp[j] = "the first j characters can be split into dictionary words". dp[0] is true (empty prefix). From each true dp[i], walk the trie along the text; every terminal node reached at position j sets dp[j].`);
  for (const w of dict) {
    const created = t.insertSilent(w);
    t.clear();
    let cur = 0;
    for (const ch of w) cur = t.child(cur, ch) ?? cur;
    t.tonePath(cur);
    for (const id of created) t.s.nodeTones[id] = "done";
    t.s.nodeTones[cur] = "done";
    t.s.vars = { inserted: w };
    t.f.push(`Insert "${w}" into the dictionary trie.`, "insert");
    if (t.f.full) return t.f.done();
  }
  for (let i = 0; i < n; i++) {
    if (t.f.full) break;
    if (!dp[i]) continue;
    dpTones.fill(undefined);
    dpTones[i] = "active";
    textTones.fill(undefined);
    for (let k = 0; k < i; k++) textTones[k] = "visited";
    t.clear();
    t.s.nodeTones[0] = "active";
    sync(i);
    t.s.vars = { i, "dp[i]": true };
    t.f.push(`dp[${i}] is true, so a word may start at position ${i}: walk the trie from the root along text[${i}..].`, "start");
    let cur = 0;
    for (let j = i; j < n; j++) {
      const ch = text[j]!;
      const next = t.child(cur, ch);
      t.clear();
      t.tonePath(cur);
      textTones[j] = "active";
      if (next === null) {
        t.s.nodeTones[cur] = "danger";
        textTones[j] = "danger";
        sync(i, j);
        t.f.push(`text[${j}] = '${ch}' has no edge under "${t.word(cur) || "root"}": no dictionary word starts with "${text.slice(i, j + 1)}", stop this walk.`, "miss");
        break;
      }
      cur = next;
      t.s.nodeTones[cur] = "active";
      t.s.edgeTones[cur] = "path";
      textTones[j] = "compare";
      if (t.node(cur).terminal) {
        const wasSet = dp[j + 1];
        dp[j + 1] = true;
        if (!wasSet) from[j + 1] = i;
        dpTones[j + 1] = "done";
        t.s.nodeTones[cur] = "done";
        sync(i, j);
        t.s.vars = { i, j: j + 1, word: text.slice(i, j + 1) };
        t.f.push(`"${text.slice(i, j + 1)}" is a dictionary word ending at position ${j + 1}: dp[${j + 1}] = true${wasSet ? " (already known)" : ""}.`, "word");
      } else {
        sync(i, j);
        t.f.push(`text[${j}] = '${ch}': follow the edge; "${text.slice(i, j + 1)}" is a prefix of a dictionary word but not a whole one, keep extending.`, "follow");
      }
      if (t.f.full) break;
    }
  }
  t.clear();
  dpTones.fill(undefined);
  textTones.fill(undefined);
  if (dp[n]) {
    const parts: string[] = [];
    let j = n;
    let guard = 0;
    while (j > 0 && guard++ <= n) {
      const i = from[j] ?? 0;
      parts.unshift(text.slice(i, j));
      for (let k = i; k < j; k++) textTones[k] = parts.length % 2 ? "done" : "visited";
      j = i;
    }
    dpTones[n] = "done";
    sync();
    t.s.vars = { "dp[n]": true, segmentation: parts.join(" | ") };
    t.f.push(`dp[${n}] is true: "${text}" = ${parts.map((p) => `"${p}"`).join(" + ")}. Each start position walks at most the longest word: O(n · L) with the trie, versus O(n · L · |dict|) checking every word.`, "done");
  } else {
    dpTones[n] = "danger";
    sync();
    t.s.vars = { "dp[n]": false };
    t.f.push(`dp[${n}] stayed false: no segmentation of "${text}" exists. O(n · L) time.`, "done");
  }
  return t.f.done();
};

// ---- renderer ----

function layout(nodes: TrieNode[]): { pos: Record<number, [number, number]>; leaves: number; rows: number } {
  const pos: Record<number, [number, number]> = {};
  let rows = 0;
  const width = (id: number, guard: number): number => {
    const n = nodes[id];
    if (!n || guard > 64) return 1;
    return Math.max(1, n.children.reduce((acc, c) => acc + width(c, guard + 1), 0));
  };
  const place = (id: number, x0: number, depth: number, guard: number): void => {
    const n = nodes[id];
    if (!n || guard > 64) return;
    const w = width(id, 0);
    pos[id] = [x0 + w / 2, depth];
    rows = Math.max(rows, depth + 1);
    let x = x0;
    for (const c of n.children) {
      const cw = width(c, 0);
      place(c, x, depth + 1, guard + 1);
      x += cw;
    }
  };
  place(0, 0, 0, 0);
  return { pos, leaves: width(0, 0), rows };
}

function TrieSvg({ state }: { state: TrieState }) {
  const { pos, leaves, rows } = layout(state.nodes);
  const r = 12;
  const SX = 2 * r + 6;
  const SY = 38;
  const W = leaves * SX + 8;
  const H = rows * SY + 8;
  const px = (x: number) => 4 + x * SX;
  const py = (d: number) => r + 4 + d * SY;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0" role="img" aria-label="Trie">
      {state.nodes.map((n) => {
        if (n.parent === null) return null;
        const p = pos[n.parent];
        const q = pos[n.id];
        if (!p || !q) return null;
        const tone = state.edgeTones[n.id] ?? "default";
        const strong = tone !== "default" && tone !== "muted";
        return <line key={n.id} x1={px(p[0])} y1={py(p[1])} x2={px(q[0])} y2={py(q[1])} stroke={toneStroke[tone]} strokeWidth={strong ? 2.5 : 1.5} />;
      })}
      {state.nodes.map((n) => {
        const q = pos[n.id];
        if (!q) return null;
        const tone = state.nodeTones[n.id] ?? "default";
        const x = px(q[0]);
        const y = py(q[1]);
        return (
          <g key={n.id}>
            <circle cx={x} cy={y} r={r} fill={toneFill[tone]} stroke={toneStroke[tone]} strokeWidth={tone === "default" ? 1.5 : 2.5} />
            {n.terminal && <circle cx={x} cy={y} r={r - 3.5} fill="none" stroke={toneStroke[tone === "default" ? "done" : tone]} strokeWidth={1.5} />}
            <text x={x} y={y + 4} fontSize="12" textAnchor="middle" fill={n.parent === null ? "var(--fg-muted)" : "var(--fg)"} fontFamily="var(--font-mono)">
              {n.parent === null ? "·" : n.ch}
            </text>
            {state.labels[n.id] && (
              <text x={x} y={y + r + 10} fontSize="9" textAnchor="middle" fill="var(--fg-muted)">
                {state.labels[n.id]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Renderer({ frame }: RendererProps<TrieInput, TrieState>) {
  const { state } = frame;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-6">
        <TrieSvg state={state} />
        <Readouts readouts={state.readouts} />
      </div>
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "current node" }, { tone: "path", label: "walked / on stack" }, { tone: "done", label: "created / matched / terminal" }, { tone: "visited", label: "matched prefix" }, { tone: "danger", label: "missing edge / removed" }]} />
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <circle cx="7" cy="7" r="6" fill={toneFill.default} stroke={toneStroke.default} strokeWidth="1.5" />
          <circle cx="7" cy="7" r="3" fill="none" stroke={toneStroke.done} strokeWidth="1.5" />
        </svg>
        double ring = terminal node (a key ends here)
      </div>
    </div>
  );
}

const cleanWord = (w: unknown, max = MAX_WORD): string => String(w ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, max);

function parseOps(raw: unknown): TrieOp[] {
  if (!Array.isArray(raw)) return [];
  const ops: TrieOp[] = [];
  let chars = 0;
  for (const item of raw) {
    let op = "";
    let word = "";
    if (Array.isArray(item)) {
      op = String(item[0] ?? "");
      word = cleanWord(item[1]);
    } else if (typeof item === "string") {
      const [a, b] = item.trim().split(/[\s(]+/);
      if (b === undefined) {
        op = "insert";
        word = cleanWord(a);
      } else {
        op = a ?? "";
        word = cleanWord(b);
      }
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      op = String(o.op ?? o.type ?? o.action ?? "insert");
      word = cleanWord(o.word ?? o.key ?? o.value ?? o.prefix);
    }
    op = op.toLowerCase();
    const name: TrieOpName | null = op === "insert" || op === "add" || op === "put" ? "insert" : op === "search" || op === "find" || op === "contains" || op === "lookup" ? "search" : op === "prefix" || op === "startswith" || op === "starts_with" || op === "autocomplete" || op === "complete" ? "prefix" : op === "delete" || op === "remove" || op === "erase" ? "delete" : null;
    if (!name) continue;
    if (name !== "prefix" && word.length === 0) continue;
    chars += word.length;
    if (chars > MAX_CHARS) break;
    ops.push({ op: name, word });
    if (ops.length >= MAX_OPS) break;
  }
  return ops;
}

export const trieFamily: Family<TrieInput, TrieState> = {
  name: "Trie",
  description: "Prefix trees: insert, search and prefix walks, autocomplete by subtree enumeration, and word break.",
  Renderer,
  algorithms: {
    "insert-search": insertSearch,
    "prefix-autocomplete": prefixAutocomplete,
    "word-break": wordBreak,
  },
  labels: {
    "insert-search": "Insert, search and prefix",
    "prefix-autocomplete": "Autocomplete from a prefix",
    "word-break": "Word break with a trie",
  },
  examples: {
    "insert-search": { words: [], operations: [{ op: "insert", word: "car" }, { op: "insert", word: "cart" }, { op: "insert", word: "cat" }, { op: "insert", word: "do" }, { op: "insert", word: "dog" }, { op: "search", word: "car" }, { op: "search", word: "ca" }, { op: "prefix", word: "ca" }, { op: "search", word: "dot" }] },
    "prefix-autocomplete": { words: [], operations: [{ op: "insert", word: "net" }, { op: "insert", word: "netflix" }, { op: "insert", word: "network" }, { op: "insert", word: "nest" }, { op: "insert", word: "new" }, { op: "prefix", word: "net" }] },
    "word-break": { operations: [], words: ["apple", "pen", "applepen", "pine", "pineapple"], text: "pineapplepenapple" },
  },
  normalise: (raw) => {
    const wordsRaw = raw.words ?? raw.dictionary ?? raw.dict ?? raw.wordDict;
    const words = Array.isArray(wordsRaw) ? (wordsRaw as unknown[]).map((w) => cleanWord(w)).filter((w) => w.length > 0).slice(0, MAX_OPS) : [];
    const textRaw = raw.text ?? raw.s ?? raw.target ?? raw.string ?? raw.query;
    const text = textRaw === undefined || textRaw === null ? undefined : cleanWord(textRaw, MAX_TEXT);
    return { operations: parseOps(raw.operations ?? raw.ops), words, text: text && text.length ? text : undefined };
  },
};
