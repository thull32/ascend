// Linked-list algorithms drawn as boxes and arrows in SVG. Nodes keep a
// fixed grid position (row, column) for the whole animation so the learner
// watches the *pointers* change rather than nodes shuffling about: a
// reversed list is the same boxes with every arrow flipped.
import { Box, Legend, Vars, toneStroke, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";

export interface ListInput {
  values: number[];
  /** Second list for merge-sorted. */
  values2?: number[];
  /** Index the tail links back to (cycle-detect); omit or -1 for no cycle. */
  cycleAt?: number;
  /** remove-nth-from-end: n counted from 1 at the tail. */
  n?: number;
  /** insert-sorted: the value to insert. */
  target?: number;
}

export interface ListNode {
  id: number;
  label: string;
  tone?: Tone;
}
export interface ListRow {
  label?: string;
  nodes: ListNode[];
}
export interface ListState {
  rows: ListRow[];
  /** next pointer by node id; null = end of list. */
  next: Record<number, number | null>;
  /** Named pointers (prev/curr/slow/fast…) → node id, or null when they point at nothing. */
  pointers: Record<string, number | null>;
  vars: Record<string, unknown>;
  /** Tone override for the outgoing link of a node. */
  linkTones: Record<number, Tone>;
}

type G = (input: ListInput) => ReturnType<Frames<ListState>["done"]>;

const MAX_NODES = 20;

function make() {
  const s: ListState = { rows: [], next: {}, pointers: {}, vars: {}, linkTones: {} };
  const num: Record<number, number> = {};
  let nextId = 0;
  const f = new Frames<ListState>(() => ({
    rows: s.rows.map((r) => ({ label: r.label, nodes: r.nodes.map((n) => ({ ...n })) })),
    next: { ...s.next },
    pointers: { ...s.pointers },
    vars: { ...s.vars },
    linkTones: { ...s.linkTones },
  }));
  const newNode = (v: number | string): ListNode => {
    const n = { id: nextId++, label: String(v) };
    num[n.id] = typeof v === "number" ? v : Number.NaN;
    s.next[n.id] = null;
    return n;
  };
  const addRow = (values: (number | string)[], label?: string): ListNode[] => {
    const nodes = values.map(newNode);
    for (let i = 0; i < nodes.length; i++) s.next[nodes[i]!.id] = i + 1 < nodes.length ? nodes[i + 1]!.id : null;
    s.rows.push({ label, nodes });
    return nodes;
  };
  const find = (id: number | null | undefined): ListNode | undefined => {
    if (id === null || id === undefined) return undefined;
    for (const r of s.rows) for (const n of r.nodes) if (n.id === id) return n;
    return undefined;
  };
  const label = (id: number | null | undefined) => find(id)?.label ?? "null";
  const val = (id: number) => num[id] ?? Number.NaN;
  const nx = (id: number | null): number | null => (id === null ? null : (s.next[id] ?? null));
  const tone = (id: number | null | undefined, t: Tone | undefined) => {
    const n = find(id);
    if (n) n.tone = t;
  };
  const clearTones = () => {
    for (const r of s.rows) for (const n of r.nodes) n.tone = undefined;
    s.linkTones = {};
  };
  return { s, f, addRow, newNode, find, label, val, nx, tone, clearTones };
}

function empty(f: Frames<ListState>, what: string) {
  f.push(`The list is empty: head is null, so ${what}.`, "empty");
  return f.done();
}

const traverse: G = ({ values }) => {
  const { s, f, addRow, label, nx, tone, clearTones } = make();
  const nodes = addRow(values);
  if (nodes.length === 0) return empty(f, "the traversal visits nothing");
  const head = nodes[0]!.id;
  s.pointers = { head, curr: head };
  s.vars = { visited: 0 };
  f.push(`Start with curr = head. A list has no index: to reach node k you must follow k next pointers, one dependent load after another.`);
  let curr: number | null = head;
  let count = 0;
  const seen: number[] = [];
  while (curr !== null && !f.full) {
    count++;
    clearTones();
    for (const id of seen) tone(id, "visited");
    tone(curr, "active");
    s.linkTones[curr] = "active";
    s.pointers = { head, curr };
    s.vars = { visited: count, "curr.val": label(curr) };
    const n = nx(curr);
    f.push(n === null ? `Visit ${label(curr)}: read its value, then follow curr.next, which is null: the list ends here.` : `Visit ${label(curr)}: read its value, then follow curr.next to reach ${label(n)}.`, "visit");
    seen.push(curr);
    curr = n;
  }
  clearTones();
  for (const id of seen) tone(id, "done");
  s.pointers = { head, curr: null };
  f.push(`curr is null, so the loop stops. Visited all ${count} nodes with one pointer load each: O(n) time, O(1) extra space.`, "done");
  return f.done();
};

const reverse: G = ({ values }) => {
  const { s, f, addRow, label, nx, tone, clearTones } = make();
  const nodes = addRow(values);
  if (nodes.length === 0) return empty(f, "reversing it returns null unchanged");
  const head = nodes[0]!.id;
  let prev: number | null = null;
  let curr: number | null = head;
  s.pointers = { head, prev, curr };
  f.push(`Three pointers: prev is the already-reversed part (empty so far), curr is the node being flipped, and next will save the rest before we cut the link.`);
  const reversed: number[] = [];
  while (curr !== null && !f.full) {
    const next = nx(curr);
    clearTones();
    for (const id of reversed) tone(id, "done");
    tone(curr, "active");
    tone(next, "compare");
    s.pointers = { prev, curr, next };
    f.push(next === null ? `Save next = curr.next, which is null: ${label(curr)} is the last node.` : `Save next = curr.next (${label(next)}) so the rest of the list is not lost when we flip curr.next.`, "save");
    s.next[curr] = prev;
    s.linkTones[curr] = "active";
    f.push(prev === null ? `Flip: curr.next = prev, which is null, so ${label(curr)} becomes the new tail.` : `Flip: curr.next = prev, so ${label(curr)} now points back to ${label(prev)}.`, "flip");
    reversed.push(curr);
    prev = curr;
    curr = next;
    clearTones();
    for (const id of reversed) tone(id, "done");
    s.pointers = { prev, curr };
    f.push(`Advance: prev = curr, curr = next. The reversed prefix now ends at ${label(prev)}; ${curr === null ? "nothing is left to flip" : `${label(curr)} is next`}.`, "advance");
  }
  clearTones();
  for (const id of reversed) tone(id, "done");
  s.pointers = { head: prev };
  f.push(`curr is null, so head = prev = ${label(prev)}. Reversed in one pass: O(n) time, O(1) extra space, every next pointer rewritten exactly once.`, "done");
  return f.done();
};

const cycleDetect: G = ({ values, cycleAt }) => {
  const { s, f, addRow, label, nx, tone, clearTones } = make();
  const nodes = addRow(values);
  if (nodes.length === 0) return empty(f, "there is no cycle");
  const head = nodes[0]!.id;
  const tail = nodes[nodes.length - 1]!.id;
  const hasCycle = cycleAt !== undefined && cycleAt >= 0 && cycleAt < nodes.length;
  if (hasCycle) {
    s.next[tail] = nodes[cycleAt]!.id;
    s.linkTones[tail] = "danger";
  }
  let slow: number | null = head;
  let fast: number | null = head;
  s.pointers = { slow, fast };
  f.push(
    hasCycle
      ? `The tail (${label(tail)}) points back to node ${cycleAt} (value ${label(nodes[cycleAt]!.id)}), so a plain traversal would loop forever. Floyd's tortoise and hare uses two speeds instead of a visited set.`
      : `No node points backwards here. Floyd's tortoise and hare: slow moves one node per step, fast moves two; if fast ever reaches null there is no cycle.`,
  );
  let steps = 0;
  let met = false;
  while (fast !== null && nx(fast) !== null && !f.full) {
    slow = nx(slow);
    fast = nx(nx(fast));
    steps++;
    clearTones();
    if (hasCycle) s.linkTones[tail] = "danger";
    tone(slow, "compare");
    tone(fast, "active");
    s.pointers = { slow, fast };
    s.vars = { steps };
    if (slow !== null && slow === fast) {
      tone(slow, "danger");
      met = true;
      f.push(`Step ${steps}: slow and fast both land on ${label(slow)}. They can only meet if fast lapped slow inside a loop, so a cycle exists.`, "meet");
      break;
    }
    f.push(`Step ${steps}: slow moves one node to ${label(slow)}, fast moves two to ${label(fast)}. ${hasCycle ? "Once both are inside the loop the gap shrinks by one per step, so they must meet." : "fast runs ahead; if the list ends it will hit null."}`, "step");
  }
  if (!met) {
    clearTones();
    s.pointers = { slow, fast: null };
    f.push(`fast reached null after ${steps} steps: no cycle. O(n) time, O(1) space, no visited set needed.`, "done");
    return f.done();
  }
  slow = head;
  clearTones();
  if (hasCycle) s.linkTones[tail] = "danger";
  tone(slow, "compare");
  tone(fast, "active");
  s.pointers = { slow, fast };
  f.push(`Phase 2: reset slow to head and move both one node per step. The distance from head to the cycle entry equals the distance from the meeting point to the entry (modulo the cycle length), so they meet exactly at the entry.`, "phase 2");
  let steps2 = 0;
  while (slow !== fast && !f.full) {
    slow = nx(slow);
    fast = nx(fast);
    steps2++;
    clearTones();
    if (hasCycle) s.linkTones[tail] = "danger";
    tone(slow, "compare");
    tone(fast, "active");
    s.pointers = { slow, fast };
    s.vars = { steps, steps2 };
    if (slow === fast) break;
    f.push(`Both advance one: slow at ${label(slow)}, fast at ${label(fast)}.`, "step");
  }
  clearTones();
  if (hasCycle) s.linkTones[tail] = "danger";
  tone(slow, "danger");
  s.pointers = { entry: slow };
  f.push(`They meet at ${label(slow)} (index ${cycleAt}): the node where the cycle begins. Whole algorithm: O(n) time, O(1) space.`, "done");
  return f.done();
};

const middle: G = ({ values }) => {
  const { s, f, addRow, label, nx, tone, clearTones } = make();
  const nodes = addRow(values);
  if (nodes.length === 0) return empty(f, "there is no middle node");
  const head = nodes[0]!.id;
  let slow: number | null = head;
  let fast: number | null = head;
  s.pointers = { slow, fast };
  f.push(`Runner technique: slow moves one node per step, fast moves two. When fast runs out, slow has covered half the distance, so it sits on the middle, with no length count needed.`);
  let steps = 0;
  while (fast !== null && nx(fast) !== null && !f.full) {
    slow = nx(slow);
    fast = nx(nx(fast));
    steps++;
    clearTones();
    tone(slow, "compare");
    tone(fast, "active");
    s.pointers = { slow, fast };
    s.vars = { steps };
    f.push(`Step ${steps}: slow → ${label(slow)}, fast → ${label(fast)}. fast has visited ${Math.min(2 * steps, nodes.length - 1)} links, slow ${steps}: exactly half.`, "step");
  }
  clearTones();
  tone(slow, "done");
  s.pointers = { middle: slow, fast };
  const even = nodes.length % 2 === 0;
  f.push(`${fast === null ? "fast is null" : "fast.next is null"}, so the loop stops: the middle is ${label(slow)}${even ? ` (an even length of ${nodes.length} has two middles; this loop picks the second)` : ""}. One pass, O(n) time, O(1) space.`, "done");
  return f.done();
};

const mergeSorted: G = ({ values, values2 = [] }) => {
  const { s, f, addRow, newNode, label, val, nx, tone, clearTones } = make();
  const A = addRow(values, "list A");
  const B = addRow(values2, "list B");
  const M: ListRow = { label: "merged", nodes: [] };
  s.rows.push(M);
  let a: number | null = A[0]?.id ?? null;
  let b: number | null = B[0]?.id ?? null;
  let tail: number | null = null;
  s.pointers = { a, b };
  if (a === null && b === null) return empty(f, "merging two empty lists gives an empty list");
  f.push(`Both lists are sorted, so the smallest remaining value is always one of the two heads: compare them, append the smaller to the merged list and advance that pointer. This is the merge step of merge sort on lists.`);
  let comparisons = 0;
  const append = (id: number, t: Tone) => {
    const n = newNode(label(id));
    n.tone = t;
    M.nodes.push(n);
    if (tail !== null) s.next[tail] = n.id;
    tail = n.id;
    tone(id, "muted");
    return n.id;
  };
  while (a !== null && b !== null && !f.full) {
    comparisons++;
    clearTones();
    for (const n of M.nodes) n.tone = "done";
    tone(a, "compare");
    tone(b, "compare");
    const takeA = val(a) <= val(b);
    const taken = takeA ? a : b;
    const [x, y] = [label(a), label(b)];
    const id = append(taken, "active");
    if (takeA) a = nx(a);
    else b = nx(b);
    s.pointers = { a, b, tail: id };
    s.vars = { comparisons };
    f.push(`${x} ${takeA ? "≤" : ">"} ${y}: take ${label(id)} from list ${takeA ? "A" : "B"} and advance ${takeA ? "a" : "b"}.${takeA && x === y ? " Ties take from A, which keeps the merge stable." : ""}`, "take");
  }
  const rest = a !== null ? a : b;
  if (rest !== null) {
    clearTones();
    for (const n of M.nodes) n.tone = "done";
    const restLabels: string[] = [];
    for (let r: number | null = rest; r !== null; r = nx(r)) {
      restLabels.push(label(r));
      append(r, "visited");
    }
    s.pointers = { a: null, b: null, tail };
    s.vars = { comparisons };
    f.push(`List ${a !== null ? "B" : "A"} is exhausted, so link the tail to the remaining sorted nodes (${restLabels.join(" → ")}) in one pointer assignment: no more comparisons needed.`, "attach");
  }
  clearTones();
  for (const n of M.nodes) n.tone = "done";
  s.pointers = { head: M.nodes[0]?.id ?? null };
  f.push(`Merged ${M.nodes.length} nodes with ${comparisons} comparisons: O(n + m) time. Done in place, it allocates nothing and only rewrites next pointers.`, "done");
  return f.done();
};

const removeNthFromEnd: G = ({ values, n = 1 }) => {
  const { s, f, addRow, label, nx, tone, clearTones } = make();
  const nodes = addRow(["dummy", ...values]);
  const dummy = nodes[0]!.id;
  tone(dummy, "muted");
  const len = values.length;
  if (len === 0) return empty(f, "there is nothing to remove");
  const nn = Math.max(1, Math.floor(n));
  let slow: number = dummy;
  let fast: number | null = dummy;
  s.pointers = { slow, fast };
  s.vars = { n: nn };
  f.push(`Remove the ${nn}${ord(nn)} node from the end in one pass by keeping two pointers ${nn} apart. A dummy node in front of head makes removing the head itself a normal case.`);
  for (let i = 1; i <= nn; i++) {
    fast = nx(fast);
    if (fast === null) {
      clearTones();
      tone(dummy, "muted");
      s.pointers = { slow, fast: null };
      f.push(`fast fell off the end after ${i - 1} of ${nn} steps: n = ${nn} is larger than the length ${len}, so there is no such node and the list is unchanged.`, "done");
      return f.done();
    }
    clearTones();
    tone(dummy, "muted");
    tone(fast, "active");
    s.pointers = { slow, fast };
    s.vars = { n: nn, gap: i };
    f.push(`Advance fast ${i} of ${nn}: it is now ${i} node${i === 1 ? "" : "s"} ahead of slow.`, "gap");
    if (f.full) return f.done();
  }
  while (nx(fast) !== null && !f.full) {
    slow = nx(slow)!;
    fast = nx(fast);
    clearTones();
    tone(dummy, "muted");
    tone(slow, "compare");
    tone(fast, "active");
    s.pointers = { slow, fast };
    f.push(`Move both one node: the gap stays ${nn}, so when fast reaches the tail, slow will be just before the node to delete.`, "step");
  }
  const target = nx(slow)!;
  clearTones();
  tone(dummy, "muted");
  tone(slow, "compare");
  tone(fast, "active");
  tone(target, "danger");
  s.pointers = { slow, fast, target };
  f.push(`fast is on the tail, so slow.next = ${label(target)} is the ${nn}${ord(nn)} node from the end.`, "found");
  s.next[slow] = nx(target);
  s.linkTones[slow] = "active";
  f.push(`Splice: slow.next = slow.next.next. ${label(target)} is unlinked in O(1); no other node moves.`, "splice");
  const row = s.rows[0]!;
  row.nodes = row.nodes.filter((x) => x.id !== target);
  delete s.next[target];
  clearTones();
  tone(dummy, "muted");
  for (const x of row.nodes) if (x.id !== dummy) tone(x.id, "done");
  s.pointers = { head: nx(dummy) };
  f.push(`Done: one pass, O(n) time, O(1) space. Returning dummy.next as the head is what makes "remove the first node" need no special case.`, "done");
  return f.done();
};

const insertSorted: G = ({ values, target }) => {
  const { s, f, addRow, newNode, label, val, nx, tone, clearTones } = make();
  const nodes = addRow(values, "sorted list");
  const t = target ?? (values.length ? Math.round((values[0]! + values[values.length - 1]!) / 2) : 0);
  const fresh = newNode(t);
  fresh.tone = "active";
  s.rows.push({ label: "new node", nodes: [fresh] });
  let prev: number | null = null;
  let curr: number | null = nodes[0]?.id ?? null;
  s.pointers = { prev, curr, new: fresh.id };
  s.vars = { target: t };
  f.push(`Insert ${t} keeping the list sorted: walk with prev and curr until curr is null or curr.val ≥ ${t}; the new node goes between them.`);
  while (curr !== null && val(curr) < t && !f.full) {
    clearTones();
    tone(prev, "visited");
    tone(curr, "compare");
    f.push(`${label(curr)} < ${t}: not yet, so prev = curr and curr = curr.next.`, "walk");
    prev = curr;
    curr = nx(curr);
    s.pointers = { prev, curr, new: fresh.id };
  }
  clearTones();
  tone(prev, "visited");
  tone(curr, "compare");
  f.push(curr === null ? `curr is null: every value is < ${t}, so the new node becomes the tail.` : `${label(curr)} ≥ ${t}: this is the first node not smaller than ${t}, so insert just before it.`, "found");
  s.next[fresh.id] = curr;
  s.linkTones[fresh.id] = "active";
  f.push(`new.next = curr${curr === null ? " (null)" : ` (${label(curr)})`}. Set the new node's link first so the rest of the list is never unreachable.`, "link 1");
  if (prev === null) {
    s.pointers = { head: fresh.id, curr, new: fresh.id };
    f.push(`prev is null, so the new node goes in front: head = new.`, "link 2");
  } else {
    s.next[prev] = fresh.id;
    s.linkTones[prev] = "active";
    f.push(`prev.next = new: ${label(prev)} now points at ${t}, and the splice is complete.`, "link 2");
  }
  const row = s.rows[0]!;
  const at = prev === null ? 0 : row.nodes.findIndex((x) => x.id === prev) + 1;
  row.nodes.splice(at, 0, fresh);
  s.rows.splice(1, 1);
  clearTones();
  tone(fresh.id, "done");
  s.pointers = { head: row.nodes[0]?.id ?? null };
  f.push(`Inserted at position ${at}: O(n) to find the spot, O(1) to splice. No element shifts, which is exactly what an array cannot offer for a middle insert.`, "done");
  return f.done();
};

function ord(n: number): string {
  const r = n % 100;
  if (r >= 11 && r <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

// ---- renderer ----

const BW = 44;
const BH = 34;
const PITCH = 80;
const ROWH = 96;
const PADX = 16;
const PADTOP = 36;
const TONES: Tone[] = ["default", "active", "compare", "done", "danger", "muted", "path", "visited", "frontier"];

interface Pos {
  x: number;
  y: number;
  r: number;
  c: number;
}

function linkPath(a: Pos, b: Pos): string {
  const acx = a.x + BW / 2;
  const bcx = b.x + BW / 2;
  const cy = a.y + BH / 2;
  if (a.r === b.r) {
    if (b.c === a.c + 1) return `M ${a.x + BW} ${cy} L ${b.x - 2} ${cy}`;
    if (b.c === a.c - 1) return `M ${a.x} ${cy} L ${b.x + BW + 2} ${cy}`;
    if (a.c === b.c) return `M ${acx + 10} ${a.y + BH} C ${acx + 34} ${a.y + BH + 34}, ${acx - 34} ${a.y + BH + 34}, ${acx - 10} ${a.y + BH + 2}`;
    const depth = BH / 2 + 12 + Math.min(4, Math.abs(b.c - a.c)) * 6;
    return `M ${acx} ${a.y + BH} Q ${(acx + bcx) / 2} ${a.y + BH + depth} ${bcx} ${b.y + BH + 2}`;
  }
  if (b.r > a.r) return `M ${acx} ${a.y + BH} L ${bcx} ${b.y - 2}`;
  return `M ${acx} ${a.y} L ${bcx} ${b.y + BH + 2}`;
}

function Renderer({ frame }: RendererProps<ListInput, ListState>) {
  const { state } = frame;
  const pos: Record<number, Pos> = {};
  let cols = 1;
  state.rows.forEach((row, r) => {
    cols = Math.max(cols, row.nodes.length);
    row.nodes.forEach((n, c) => {
      pos[n.id] = { x: PADX + c * PITCH, y: PADTOP + r * ROWH, r, c };
    });
  });
  const W = PADX * 2 + cols * PITCH;
  const H = PADTOP + Math.max(1, state.rows.length) * ROWH - 20;
  const ptrByNode: Record<number, string[]> = {};
  const ptrVars: Record<string, string> = {};
  for (const [name, id] of Object.entries(state.pointers)) {
    if (id === null || id === undefined) {
      ptrVars[name] = "null";
      continue;
    }
    (ptrByNode[id] ??= []).push(name);
    const n = state.rows.flatMap((r) => r.nodes).find((x) => x.id === id);
    ptrVars[name] = n ? n.label : "?";
  }
  return (
    <div className="flex flex-col gap-1">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-none" role="img" aria-label="Linked list">
        <defs>
          {TONES.map((t) => (
            <marker key={t} id={`ll-arrow-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={toneStroke[t]} />
            </marker>
          ))}
        </defs>
        {state.rows.map((row, r) =>
          row.label ? (
            <text key={`row-${r}`} x={PADX} y={PADTOP + r * ROWH - 22} fontSize="9" fill="var(--fg-muted)" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {row.label}
            </text>
          ) : null,
        )}
        {state.rows.flatMap((row) =>
          row.nodes.map((n) => {
            const a = pos[n.id]!;
            const to = state.next[n.id];
            if (to === null || to === undefined) {
              return (
                <text key={`null-${n.id}`} x={a.x + BW + 5} y={a.y + 11} fontSize="11" fill="var(--fg-muted)" fontFamily="var(--font-mono)">
                  ∅
                </text>
              );
            }
            const b = pos[to];
            if (!b) return null;
            const tone = state.linkTones[n.id] ?? (n.tone === "muted" ? "muted" : "default");
            return <path key={`link-${n.id}`} d={linkPath(a, b)} fill="none" stroke={toneStroke[tone]} strokeWidth={tone === "default" || tone === "muted" ? 1.5 : 2.5} opacity={tone === "muted" ? 0.4 : 1} markerEnd={`url(#ll-arrow-${tone})`} />;
          }),
        )}
        {state.rows.flatMap((row) =>
          row.nodes.map((n) => {
            const p = pos[n.id]!;
            return <Box key={n.id} x={p.x} y={p.y} w={BW} h={BH} label={n.label} tone={n.tone ?? "default"} />;
          }),
        )}
        {Object.entries(ptrByNode).map(([id, names]) => {
          const p = pos[Number(id)]!;
          const cx = p.x + BW / 2;
          return (
            <g key={`ptr-${id}`}>
              <text x={cx} y={p.y - 9} fontSize="10" fontWeight={600} textAnchor="middle" fill="var(--accent)" style={{ paintOrder: "stroke", stroke: "var(--bg-elev)", strokeWidth: 3 }}>
                {names.join(",")}
              </text>
              <path d={`M ${cx - 3} ${p.y - 7} L ${cx + 3} ${p.y - 7} L ${cx} ${p.y - 2} z`} fill="var(--accent)" />
            </g>
          );
        })}
      </svg>
      <Vars vars={{ ...ptrVars, ...state.vars }} />
      <Legend items={[{ tone: "active", label: "current / fast" }, { tone: "compare", label: "comparing / slow" }, { tone: "done", label: "final" }, { tone: "danger", label: "cycle / removed" }, { tone: "muted", label: "consumed" }]} />
    </div>
  );
}

const nums = (v: unknown, cap = MAX_NODES): number[] | undefined => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)).slice(0, cap) : undefined);
const optNum = (v: unknown): number | undefined => (v === undefined || v === null || v === "" ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);

export const linkedListFamily: Family<ListInput, ListState> = {
  name: "Linked list",
  description: "Pointer manipulation on singly linked lists: traversal, reversal, runners, merging and splicing.",
  Renderer,
  algorithms: {
    traverse,
    reverse,
    "cycle-detect": cycleDetect,
    middle,
    "merge-sorted": mergeSorted,
    "remove-nth-from-end": removeNthFromEnd,
    "insert-sorted": insertSorted,
  },
  labels: {
    traverse: "Traversal",
    reverse: "Reverse in place",
    "cycle-detect": "Cycle detection (Floyd)",
    middle: "Middle node (runner)",
    "merge-sorted": "Merge two sorted lists",
    "remove-nth-from-end": "Remove nth from end",
    "insert-sorted": "Insert into a sorted list",
  },
  examples: {
    traverse: { values: [4, 8, 15, 16, 23, 42] },
    reverse: { values: [1, 2, 3, 4, 5] },
    "cycle-detect": { values: [1, 2, 3, 4, 5, 6], cycleAt: 2 },
    middle: { values: [1, 2, 3, 4, 5, 6] },
    "merge-sorted": { values: [1, 3, 5, 7], values2: [2, 4, 6] },
    "remove-nth-from-end": { values: [1, 2, 3, 4, 5], n: 2 },
    "insert-sorted": { values: [2, 5, 9, 14], target: 7 },
  },
  normalise: (raw) => ({
    values: nums(raw.values) ?? nums(raw.list) ?? nums(raw.a) ?? [1, 2, 3],
    values2: nums(raw.values2) ?? nums(raw.other) ?? nums(raw.list2) ?? nums(raw.b),
    cycleAt: optNum(raw.cycleAt ?? raw.cycle ?? raw.pos),
    n: optNum(raw.n ?? raw.k),
    target: optNum(raw.target ?? raw.value ?? raw.insert),
  }),
};
