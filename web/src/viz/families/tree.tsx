// Binary trees: BST operations, traversals, recursive tree algorithms,
// AVL rebalancing and (de)serialisation. The tree is stored as a flat
// array of nodes indexed by a stable id, so frames can carry tones per
// node/edge and the renderer lays the tree out (in-order x, depth y) per
// frame.
import { Cells, Circle, Legend, Vars, toneStroke, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";

export interface TreeInput {
  /** Keys inserted in order into a BST (unless `levelOrder` gives the shape). */
  values: number[];
  /** Explicit shape, level by level, with `null` for missing children. */
  levelOrder?: (number | null)[];
  target?: number;
  a?: number;
  b?: number;
  /** Unit for heights in notes and labels (bst-insert, diameter, avl-insert): "edges" (default; leaf 0, empty −1) or "nodes" (leaf 1, empty 0). */
  heightUnit?: "edges" | "nodes";
  /** bst-insert: after the inserts, walk the tree in order to show sorted iteration. */
  thenInorder?: boolean;
  /** inorder: the iterative version with an explicit stack (push the left spine, pop, visit, go right). */
  iterative?: boolean;
  /** serialize: "preorder" (default, recursive with null markers) or "level" (BFS, decoded with a queue). */
  order?: "preorder" | "level";
}

export interface TreeNode {
  id: number;
  val: number;
  left: number | null;
  right: number | null;
}

export interface Readout {
  label: string;
  values: (string | number | null)[];
  tones?: (Tone | undefined)[];
  /** Cell captions; pass `[]` to hide the index row. */
  labels?: (string | number | null | undefined)[];
  pointers?: Record<string, number | undefined>;
}

export interface TreeState {
  nodes: (TreeNode | null)[];
  root: number | null;
  nodeTones: Record<number, Tone>;
  /** Keyed by the child id (each node has exactly one incoming edge). */
  edgeTones: Record<number, Tone>;
  labels: Record<number, string>;
  vars: Record<string, unknown>;
  readouts: Readout[];
}

const MAX_NODES = 31;

type G = (input: TreeInput) => ReturnType<Frames<TreeState>["done"]>;

/** Mutable tree builder; `f.push` snapshots it. */
class Tree {
  s: TreeState = { nodes: [], root: null, nodeTones: {}, edgeTones: {}, labels: {}, vars: {}, readouts: [] };
  f = new Frames<TreeState>(() => ({
    nodes: this.s.nodes.map((n) => (n ? { ...n } : null)),
    root: this.s.root,
    nodeTones: { ...this.s.nodeTones },
    edgeTones: { ...this.s.edgeTones },
    labels: { ...this.s.labels },
    vars: { ...this.s.vars },
    readouts: this.s.readouts.map((r) => ({ ...r, values: [...r.values], tones: r.tones ? [...r.tones] : undefined, labels: r.labels ? [...r.labels] : undefined, pointers: r.pointers ? { ...r.pointers } : undefined })),
  }));

  add(val: number): number {
    const id = this.s.nodes.length;
    this.s.nodes.push({ id, val, left: null, right: null });
    return id;
  }
  node(id: number): TreeNode {
    const n = this.s.nodes[id];
    if (!n) throw new Error(`no node ${id}`);
    return n;
  }
  val(id: number | null): string {
    return id === null ? "∅" : String(this.node(id).val);
  }
  get size(): number {
    return this.s.nodes.filter(Boolean).length;
  }
  /** Reset tones (labels and readouts are kept). */
  clear(): void {
    this.s.nodeTones = {};
    this.s.edgeTones = {};
  }
  /** Tone every node id in `ids` and the edge leading into each. */
  tonePath(ids: number[], node: Tone, edge: Tone = "path"): void {
    ids.forEach((id, i) => {
      this.s.nodeTones[id] = node;
      if (i > 0) this.s.edgeTones[id] = edge;
    });
  }
  parentOf(id: number): { parent: number; side: "left" | "right" } | null {
    for (const n of this.s.nodes) {
      if (!n) continue;
      if (n.left === id) return { parent: n.id, side: "left" };
      if (n.right === id) return { parent: n.id, side: "right" };
    }
    return null;
  }
  setChild(parent: number | null, side: "left" | "right", child: number | null): void {
    if (parent === null) this.s.root = child;
    else this.node(parent)[side] = child;
  }
  remove(id: number): void {
    this.s.nodes[id] = null;
    delete this.s.nodeTones[id];
    delete this.s.edgeTones[id];
    delete this.s.labels[id];
  }
  /** Insert without frames (used to build the starting tree). */
  bstInsertSilent(v: number): void {
    if (this.s.root === null) {
      this.s.root = this.add(v);
      return;
    }
    let cur = this.s.root;
    for (let guard = 0; guard <= MAX_NODES; guard++) {
      const n = this.node(cur);
      if (v === n.val) return;
      const side = v < n.val ? "left" : "right";
      const next = n[side];
      if (next === null) {
        n[side] = this.add(v);
        return;
      }
      cur = next;
    }
  }
  fromLevelOrder(items: (number | null)[]): void {
    if (items.length === 0 || items[0] === null || items[0] === undefined) return;
    this.s.root = this.add(items[0]);
    const queue = [this.s.root];
    let i = 1;
    while (queue.length && i < items.length) {
      const id = queue.shift()!;
      const n = this.node(id);
      const l = items[i++];
      if (l !== null && l !== undefined) {
        n.left = this.add(l);
        queue.push(n.left);
      }
      const r = items[i++];
      if (r !== null && r !== undefined) {
        n.right = this.add(r);
        queue.push(n.right);
      }
    }
  }
  height(id: number | null): number {
    // Height in edges; empty tree = -1.
    if (id === null) return -1;
    const n = this.node(id);
    return 1 + Math.max(this.height(n.left), this.height(n.right));
  }
  isBst(): boolean {
    const ok = (id: number | null, lo: number, hi: number): boolean => {
      if (id === null) return true;
      const n = this.node(id);
      return n.val > lo && n.val < hi && ok(n.left, lo, n.val) && ok(n.right, n.val, hi);
    };
    return ok(this.s.root, -Infinity, Infinity);
  }
  find(v: number): number | null {
    for (const n of this.s.nodes) if (n && n.val === v) return n.id;
    return null;
  }
  inorderVals(): number[] {
    const out: number[] = [];
    const go = (id: number | null) => {
      if (id === null) return;
      const n = this.node(id);
      go(n.left);
      out.push(n.val);
      go(n.right);
    };
    go(this.s.root);
    return out;
  }
}

function make(input: TreeInput, buildFromValues = true): Tree {
  const t = new Tree();
  if (input.levelOrder && input.levelOrder.length > 0) t.fromLevelOrder(input.levelOrder);
  else if (buildFromValues) for (const v of input.values) t.bstInsertSilent(v);
  return t;
}

function emptyFrame(t: Tree, what: string) {
  t.f.push(`The tree is empty, so there is nothing to ${what}. Give \`values\` (inserted in BST order) or a \`levelOrder\` array with nulls.`, "empty");
  return t.f.done();
}

const stackReadout = (t: Tree, stack: number[], label = "call stack (bottom → top)"): Readout => ({ label, values: stack.map((id) => t.node(id).val), labels: [] });

// ---- BST operations ----

const bstInsert: G = (input) => {
  const t = make(input, false);
  const vals = input.values;
  if (vals.length === 0 && t.s.root === null) return emptyFrame(t, "insert into");
  if (vals.length === 0) {
    t.f.push(`No keys to insert; this is the given tree.`, "empty");
    return t.f.done();
  }
  t.f.push(
    t.s.root === null
      ? `Insert ${vals.join(", ")} in that order into an empty BST. Invariant: every key in a left subtree is smaller than its ancestor, every key in a right subtree is larger.`
      : `Insert ${vals.join(", ")} in that order into the given tree, keeping the BST invariant (left < node < right).`,
  );
  for (const v of vals) {
    t.clear();
    t.s.vars = { inserting: v };
    if (t.s.root === null) {
      t.s.root = t.add(v);
      t.s.nodeTones[t.s.root] = "done";
      t.f.push(`The tree is empty, so ${v} becomes the root.`, "insert");
      continue;
    }
    const path: number[] = [];
    let cur: number = t.s.root;
    for (;;) {
      const n = t.node(cur);
      t.clear();
      t.tonePath(path, "visited");
      t.s.nodeTones[cur] = "active";
      if (path.length) t.s.edgeTones[cur] = "path";
      t.s.vars = { inserting: v, comparing: n.val, depth: path.length };
      if (v === n.val) {
        t.s.nodeTones[cur] = "compare";
        t.f.push(`${v} equals ${n.val}: the key is already present, so nothing is inserted (this BST keeps distinct keys).`, "duplicate");
        break;
      }
      const goLeft = v < n.val;
      const side = goLeft ? "left" : "right";
      const next = n[side];
      if (next === null) {
        const id = t.add(v);
        n[side] = id;
        t.s.nodeTones[id] = "done";
        t.s.edgeTones[id] = "path";
        t.f.push(`${v} ${goLeft ? "<" : ">"} ${n.val} and the ${side} child is empty: attach ${v} there as a new leaf at depth ${path.length + 1}.`, "insert");
        break;
      }
      t.f.push(`${v} ${goLeft ? "<" : ">"} ${n.val}: go ${side}.`, "compare");
      path.push(cur);
      cur = next;
      if (t.f.full) return t.f.done();
    }
    if (t.f.full) return t.f.done();
  }
  t.clear();
  const inNodes = input.heightUnit === "nodes";
  const h = t.height(t.s.root) + (inNodes ? 1 : 0);
  const best = Math.ceil(Math.log2(t.size + 1)) - (inNodes ? 0 : 1);
  t.s.vars = { nodes: t.size, height: h, [inNodes ? "⌈log₂(n+1)⌉" : "⌈log₂(n+1)⌉−1"]: best };
  t.f.push(`Done: ${t.size} nodes, height ${h} (${inNodes ? "counting nodes" : "counting edges"}; the shortest possible is ${best}). Each insert costs O(height): O(log n) when the tree is balanced, O(n) for a chain, and the insertion order decides which you get.`, "done");
  if (input.thenInorder && t.s.root !== null) {
    // Sorted iteration: an in-order walk reads the keys back in order.
    const order: number[] = [];
    const go = (id: number | null) => {
      if (id === null) return;
      go(t.node(id).left);
      order.push(id);
      go(t.node(id).right);
    };
    go(t.s.root);
    const out: number[] = [];
    t.clear();
    t.s.vars = {};
    t.s.readouts = [{ label: "in-order output", values: [] }];
    t.f.push(`Now iterate: an in-order walk (left subtree, node, right subtree) visits the keys from smallest to largest, because every left subtree holds smaller keys and every right subtree larger ones.`, "inorder");
    for (const id of order) {
      out.push(id);
      t.clear();
      for (const o of out) t.s.nodeTones[o] = "visited";
      t.s.nodeTones[id] = "active";
      t.s.readouts = [{ label: "in-order output", values: out.map((o) => t.node(o).val) }];
      const n = t.node(id);
      const leftDone = n.left === null ? "it has no left subtree" : "its left subtree is done";
      t.f.push(`Visit ${n.val}: ${leftDone}, so it is the next key in sorted order.`, "visit");
      if (t.f.full) return t.f.done();
    }
    t.clear();
    for (const o of out) t.s.nodeTones[o] = "done";
    t.f.push(`In-order output ${out.map((o) => t.node(o).val).join(", ")}: sorted, with no sorting step. That walk is the sorted iteration and range scan an ordered map gives and a hash map cannot. O(n) for all keys.`, "done");
  }
  return t.f.done();
};

const bstSearch: G = (input) => {
  const t = make(input);
  if (t.s.root === null) return emptyFrame(t, "search");
  const target = input.target ?? t.node(t.s.root).val;
  // Floor (largest key < target) and ceiling (smallest key > target) seen so
  // far: the last node where the walk turned right, and where it turned left.
  let floor: number | null = null;
  let ceil: number | null = null;
  const show = () => {
    t.s.labels = {};
    if (floor !== null) t.s.labels[floor] = "floor";
    if (ceil !== null) t.s.labels[ceil] = "ceiling";
  };
  const fc = () => ({ floor: floor === null ? "none yet" : t.node(floor).val, ceiling: ceil === null ? "none yet" : t.node(ceil).val });
  t.s.vars = { target, ...fc() };
  t.f.push(`Search for ${target}: at each node one comparison rules out an entire subtree. Track two candidates on the way: the floor (the last key passed that is smaller than ${target}) and the ceiling (the last key passed that is larger).`);
  const path: number[] = [];
  let cur: number | null = t.s.root;
  let comparisons = 0;
  while (cur !== null) {
    const n: TreeNode = t.node(cur);
    comparisons++;
    t.clear();
    t.tonePath(path, "visited");
    t.s.nodeTones[cur] = "active";
    if (path.length) t.s.edgeTones[cur] = "path";
    if (target === n.val) {
      t.s.nodeTones[cur] = "done";
      t.s.vars = { target, comparisons };
      t.s.labels = {};
      t.f.push(`${n.val} equals the target: found after ${comparisons} comparison${comparisons === 1 ? "" : "s"} at depth ${path.length}.`, "found");
      return t.f.done();
    }
    const goLeft = target < n.val;
    const prev = goLeft ? ceil : floor;
    if (goLeft) ceil = cur;
    else floor = cur;
    show();
    t.s.vars = { target, comparisons, ...fc() };
    const role = goLeft ? "ceiling" : "floor";
    const why = prev === null ? `the first key passed that is ${goLeft ? "larger" : "smaller"} than ${target}` : `${goLeft ? "larger" : "smaller"} than ${target} and closer to it than the previous ${role} candidate, ${t.node(prev).val}`;
    t.f.push(`${target} ${goLeft ? "<" : ">"} ${n.val}: the target can only be in the ${goLeft ? "left" : "right"} subtree, so go ${goLeft ? "left" : "right"}. ${n.val} is ${why}, so it is the ${role} candidate now.`, "compare");
    path.push(cur);
    cur = goLeft ? n.left : n.right;
    if (t.f.full) return t.f.done();
  }
  t.clear();
  t.tonePath(path, "visited");
  if (floor !== null) t.s.nodeTones[floor] = "done";
  if (ceil !== null) t.s.nodeTones[ceil] = "done";
  const fv = floor === null ? null : t.node(floor).val;
  const cv = ceil === null ? null : t.node(ceil).val;
  t.s.vars = { target, comparisons, floor: fv ?? "none", ceiling: cv ?? "none" };
  t.f.push(
    `Reached an empty child: ${target} is not in the tree, after ${comparisons} comparisons. The walk has also answered floor and ceiling: ${fv === null ? `no key is smaller than ${target}, so there is no floor` : `the floor is ${fv}, the last node where it turned right`}, and ${cv === null ? `no key is larger, so there is no ceiling` : `the ceiling is ${cv}, the last node where it turned left`}. All O(height).`,
    "miss",
  );
  return t.f.done();
};

const bstDelete: G = (input) => {
  const t = make(input);
  if (t.s.root === null) return emptyFrame(t, "delete from");
  const target = input.target ?? t.node(t.s.root).val;
  t.s.vars = { target };
  t.f.push(`Delete ${target}. First find it; the fix-up depends on how many children it has.`);
  const path: number[] = [];
  let cur: number | null = t.s.root;
  while (cur !== null && t.node(cur).val !== target) {
    const n: TreeNode = t.node(cur);
    t.clear();
    t.tonePath(path, "visited");
    t.s.nodeTones[cur] = "active";
    if (path.length) t.s.edgeTones[cur] = "path";
    const goLeft: boolean = target < n.val;
    t.f.push(`${target} ${goLeft ? "<" : ">"} ${n.val}: go ${goLeft ? "left" : "right"}.`, "compare");
    path.push(cur);
    cur = goLeft ? n.left : n.right;
    if (t.f.full) return t.f.done();
  }
  if (cur === null) {
    t.clear();
    t.tonePath(path, "visited");
    t.f.push(`${target} is not in the tree; deleting a missing key is a no-op.`, "miss");
    return t.f.done();
  }
  const id = cur;
  const n = t.node(id);
  const link = t.parentOf(id);
  t.clear();
  t.tonePath(path, "visited");
  t.s.nodeTones[id] = "danger";
  if (link) t.s.edgeTones[id] = "path";
  const kids = (n.left === null ? 0 : 1) + (n.right === null ? 0 : 1);
  if (kids === 0) {
    t.f.push(`Found ${target}: it is a leaf, so it can simply be unlinked from its parent.`, "found");
    t.setChild(link?.parent ?? null, link?.side ?? "left", null);
    t.remove(id);
    t.clear();
    if (link) t.s.nodeTones[link.parent] = "done";
    t.f.push(`Unlink ${target}. The ordering of the other keys is untouched.`, "delete");
  } else if (kids === 1) {
    const child = n.left ?? n.right!;
    t.s.nodeTones[child] = "compare";
    t.f.push(`Found ${target}: it has one child (${t.val(child)}), so the child takes its place under ${link ? t.val(link.parent) : "the root"}.`, "found");
    t.setChild(link?.parent ?? null, link?.side ?? "left", child);
    t.remove(id);
    t.clear();
    t.s.nodeTones[child] = "done";
    if (link) t.s.edgeTones[child] = "path";
    t.f.push(`Splice: ${link ? `${t.val(link.parent)}.${link.side}` : "root"} now points at ${t.val(child)}. Every key in that subtree was already on the correct side.`, "delete");
  } else {
    t.f.push(`Found ${target}: it has two children. Replace its value with the in-order successor (the smallest key in the right subtree), then delete that successor.`, "found");
    let sp: number = id;
    let s: number = n.right!;
    const spath: number[] = [];
    t.s.nodeTones[s] = "compare";
    t.s.edgeTones[s] = "compare";
    t.f.push(`Step into the right subtree at ${t.val(s)}, then go left as far as possible.`, "successor");
    while (t.node(s).left !== null) {
      spath.push(s);
      sp = s;
      s = t.node(s).left!;
      t.tonePath(spath, "visited", "compare");
      t.s.nodeTones[id] = "danger";
      t.s.nodeTones[s] = "compare";
      t.s.edgeTones[s] = "compare";
      t.f.push(`${t.val(s)} has a left child? ${t.node(s).left === null ? "No: it is the successor." : "Yes: keep going left."}`, "successor");
      if (t.f.full) return t.f.done();
    }
    const succ = t.node(s);
    n.val = succ.val;
    t.s.nodeTones[id] = "done";
    t.s.nodeTones[s] = "danger";
    t.f.push(`Successor is ${succ.val}: copy it over ${target}. It is the next key in sorted order, so left < ${succ.val} < right still holds.`, "copy");
    const side: "left" | "right" = sp === id ? "right" : "left";
    t.setChild(sp, side, succ.right);
    t.remove(s);
    t.clear();
    t.s.nodeTones[id] = "done";
    if (succ.right !== null) t.s.nodeTones[succ.right] = "compare";
    t.f.push(`Delete the old successor node: it had no left child, so ${succ.right === null ? "it is unlinked" : `its right child ${t.val(succ.right)} takes its place`}.`, "delete");
  }
  t.s.vars = { target, inorder: t.inorderVals() };
  t.f.push(`In-order traversal is still sorted. Deletion costs O(height): the search plus at most one walk to the successor.`, "done");
  return t.f.done();
};

// ---- traversals ----

const traversal = (order: "inorder" | "preorder" | "postorder"): G => (input) => {
  if (order === "inorder" && input.iterative) return inorderIterative(input);
  const t = make(input);
  if (t.s.root === null) return emptyFrame(t, "traverse");
  const stack: number[] = [];
  const out: number[] = [];
  const sync = () => {
    t.s.readouts = [stackReadout(t, stack), { label: "output", values: out.map((id) => t.node(id).val) }];
    t.s.vars = { depth: stack.length, visited: out.length };
  };
  const intro = {
    inorder: "In-order: recurse left, visit the node, recurse right. On a BST this yields the keys in sorted order.",
    preorder: "Pre-order: visit the node, then recurse left, then right. Parents come before children, which is what copying or serialising needs.",
    postorder: "Post-order: recurse left, recurse right, then visit. Children are finished before their parent, which is what freeing or tree DP needs.",
  }[order];
  sync();
  t.f.push(intro);
  const paint = (cur: number) => {
    t.clear();
    for (const id of out) t.s.nodeTones[id] = "visited";
    t.tonePath(stack, "path");
    t.s.nodeTones[cur] = "active";
    if (stack.length > 1) t.s.edgeTones[cur] = "path";
  };
  const visit = (id: number | null) => {
    if (id === null || t.f.full) return;
    const n = t.node(id);
    stack.push(id);
    sync();
    paint(id);
    if (order === "preorder") {
      out.push(id);
      sync();
      t.s.nodeTones[id] = "done";
      t.f.push(`Enter ${n.val} and visit it immediately (pre-order); output is now ${out.map((i) => t.node(i).val).join(" ")}. Then recurse left.`, "visit");
    } else {
      t.f.push(`Enter ${n.val}: push it on the stack and recurse into the left child (${t.val(n.left)}).`, "enter");
    }
    visit(n.left);
    if (order === "inorder") {
      out.push(id);
      sync();
      paint(id);
      t.s.nodeTones[id] = "done";
      t.f.push(`Left subtree of ${n.val} is finished, so visit ${n.val}: output is ${out.map((i) => t.node(i).val).join(" ")}. Now recurse right (${t.val(n.right)}).`, "visit");
    }
    visit(n.right);
    if (order === "postorder") {
      out.push(id);
      sync();
      paint(id);
      t.s.nodeTones[id] = "done";
      t.f.push(`Both subtrees of ${n.val} are finished, so visit ${n.val}: output is ${out.map((i) => t.node(i).val).join(" ")}.`, "visit");
    }
    stack.pop();
    sync();
    if (order !== "postorder") {
      paint(id);
      t.s.nodeTones[id] = "visited";
      t.f.push(`Return from ${n.val}: pop it off the stack.`, "return");
    }
  };
  // Recursion depth is bounded by MAX_NODES, so no explicit guard is needed.
  visit(t.s.root);
  t.clear();
  for (const id of out) t.s.nodeTones[id] = "done";
  sync();
  t.f.push(`${order === "inorder" ? "In-order" : order === "preorder" ? "Pre-order" : "Post-order"} output: ${out.map((i) => t.node(i).val).join(", ")}. Every node is entered and left once: O(n) time, O(height) stack space.`, "done");
  return t.f.done();
};

/** Iterative in-order: push the left spine, pop and visit, then move to the right child. */
const inorderIterative: G = (input) => {
  const t = make(input);
  if (t.s.root === null) return emptyFrame(t, "traverse");
  const stack: number[] = [];
  const out: number[] = [];
  const sync = () => {
    t.s.readouts = [stackReadout(t, stack, "stack (bottom → top)"), { label: "output", values: out.map((id) => t.node(id).val) }];
    t.s.vars = { "stack size": stack.length, visited: out.length };
  };
  const paint = (cur: number | null) => {
    t.clear();
    for (const id of out) t.s.nodeTones[id] = "visited";
    for (const id of stack) t.s.nodeTones[id] = "path";
    if (cur !== null) t.s.nodeTones[cur] = "active";
  };
  sync();
  t.f.push(`Iterative in-order with an explicit stack: push the left spine (the node and every left child below it), pop the top and visit it, then move to its right child and push that subtree's left spine. Each pop yields the next key in ascending order.`);
  let cur: number | null = t.s.root;
  while ((cur !== null || stack.length) && !t.f.full) {
    while (cur !== null && !t.f.full) {
      const n: TreeNode = t.node(cur);
      stack.push(cur);
      sync();
      paint(cur);
      t.f.push(`Push ${n.val} and go left${n.left === null ? `: ${n.val} has no left child, so the spine ends here` : ` to ${t.val(n.left)}`}.`, "push");
      cur = n.left;
    }
    const id = stack.pop()!;
    const n = t.node(id);
    out.push(id);
    sync();
    paint(null);
    t.s.nodeTones[id] = "done";
    t.f.push(`Pop ${n.val} and visit it: everything smaller is already output, so it is number ${out.length} in sorted order. Output: ${out.map((i) => t.node(i).val).join(", ")}. ${n.right !== null ? `Move to its right child, ${t.val(n.right)}.` : stack.length ? "It has no right child, so the next pop comes straight from the stack." : "It has no right child and the stack is empty, so the walk is over."}`, "visit");
    cur = n.right;
  }
  t.clear();
  for (const id of out) t.s.nodeTones[id] = "done";
  sync();
  t.f.push(`In-order output: ${out.map((i) => t.node(i).val).join(", ")}. Every node is pushed and popped once: O(n) time, and the stack never holds more than one root-to-leaf path, O(height) space. Stopping after the kth pop gives the kth smallest in O(height + k).`, "done");
  return t.f.done();
};

const levelOrder: G = (input) => {
  const t = make(input);
  if (t.s.root === null) return emptyFrame(t, "traverse");
  const queue: number[] = [t.s.root];
  const out: number[] = [];
  const levels: number[][] = [];
  const sync = (level: number) => {
    t.s.readouts = [
      { label: "queue (front → back)", values: queue.map((id) => t.node(id).val), tones: queue.map(() => "frontier" as Tone), labels: [] },
      { label: "output", values: out.map((id) => t.node(id).val) },
    ];
    t.s.vars = { level, "queue size": queue.length, levels: levels.map((l) => l.map((id) => t.node(id).val)) };
  };
  const paint = () => {
    t.clear();
    for (const id of out) t.s.nodeTones[id] = "visited";
    for (const id of queue) t.s.nodeTones[id] = "frontier";
  };
  sync(0);
  paint();
  t.f.push(`Level order (BFS): a FIFO queue holds the frontier. Start with the root in the queue.`);
  let level = 0;
  while (queue.length) {
    const width = queue.length;
    levels.push([]);
    paint();
    sync(level);
    t.f.push(`Level ${level} has ${width} node${width === 1 ? "" : "s"} in the queue: drain exactly that many, so the loop body sees one whole level.`, "level");
    for (let i = 0; i < width; i++) {
      const id = queue.shift()!;
      const n = t.node(id);
      out.push(id);
      levels[level]!.push(id);
      for (const c of [n.left, n.right]) if (c !== null) queue.push(c);
      paint();
      t.s.nodeTones[id] = "active";
      for (const c of [n.left, n.right]) if (c !== null) t.s.edgeTones[c] = "path";
      sync(level);
      const kids = [n.left, n.right].filter((c): c is number => c !== null).map((c) => t.node(c).val);
      t.f.push(`Dequeue ${n.val} and visit it; enqueue its children ${kids.length ? kids.join(", ") : "(none)"} at the back.`, "dequeue");
      if (t.f.full) return t.f.done();
    }
    level++;
  }
  t.clear();
  for (const id of out) t.s.nodeTones[id] = "done";
  sync(level);
  t.f.push(`Output ${out.map((i) => t.node(i).val).join(", ")} in ${levels.length} levels. O(n) time; the queue peaks at the widest level, O(w).`, "done");
  return t.f.done();
};

// ---- recursive tree algorithms ----

const height: G = (input) => {
  const t = make(input);
  if (t.s.root === null) return emptyFrame(t, "measure");
  const stack: number[] = [];
  const sync = () => {
    t.s.readouts = [stackReadout(t, stack)];
  };
  sync();
  t.f.push(`height(node) = 1 + max(height(left), height(right)), with height(∅) = −1 so a leaf has height 0. Post-order: children first.`);
  const go = (id: number | null): number => {
    if (id === null || t.f.full) return -1;
    const n = t.node(id);
    stack.push(id);
    sync();
    t.clear();
    t.tonePath(stack, "path");
    t.s.nodeTones[id] = "active";
    t.s.vars = { at: n.val, depth: stack.length - 1 };
    t.f.push(`Call height(${n.val}): recurse into the left child (${t.val(n.left)}), then the right (${t.val(n.right)}).`, "enter");
    const hl = go(n.left);
    const hr = go(n.right);
    const h = 1 + Math.max(hl, hr);
    stack.pop();
    sync();
    t.s.labels[id] = `h=${h}`;
    t.clear();
    t.tonePath(stack, "path");
    t.s.nodeTones[id] = "done";
    if (n.left !== null) t.s.nodeTones[n.left] = "visited";
    if (n.right !== null) t.s.nodeTones[n.right] = "visited";
    t.s.vars = { at: n.val, "height(left)": hl, "height(right)": hr, returns: h };
    t.f.push(`height(${n.val}) = 1 + max(${hl}, ${hr}) = ${h}: return it to the parent.`, "return");
    return h;
  };
  const h = go(t.s.root);
  t.clear();
  t.s.vars = { height: h, nodes: t.size };
  t.f.push(`Height is ${h}. Each node is visited once: O(n) time, O(height) recursion stack.`, "done");
  return t.f.done();
};

const diameter: G = (input) => {
  const t = make(input);
  if (t.s.root === null) return emptyFrame(t, "measure");
  const stack: number[] = [];
  let best = 0;
  let bestAt: number | null = null;
  const hs: Record<number, number> = {};
  // Heights in nodes (empty 0, leaf 1): the path through a node is hl + hr
  // edges. Heights in edges (empty −1, leaf 0): it is hl + hr + 2.
  const inNodes = input.heightUnit === "nodes";
  const empty = inNodes ? 0 : -1;
  const plus = inNodes ? 0 : 2;
  const sync = () => {
    t.s.readouts = [stackReadout(t, stack)];
  };
  sync();
  t.f.push(
    inNodes
      ? `Diameter = longest path between two nodes, counted in edges. Each call returns its subtree height, counted in nodes (an empty child is 0, a leaf 1), and updates a global best with left + right.`
      : `Diameter = longest path between two nodes, counted in edges. Each call returns its subtree height in edges (an empty child is −1, a leaf 0) and updates a global best with left + right + 2, the 2 being the edges from the node down into each subtree.`,
  );
  const go = (id: number | null): number => {
    if (id === null || t.f.full) return empty;
    const n = t.node(id);
    stack.push(id);
    sync();
    t.clear();
    t.tonePath(stack, "path");
    t.s.nodeTones[id] = "active";
    t.s.vars = { at: n.val, best };
    t.f.push(`Enter ${n.val}: it needs the heights of both children before it can do anything, so recurse first (post-order).`, "enter");
    const hl = go(n.left);
    const hr = go(n.right);
    const through = hl + hr + plus;
    const h = 1 + Math.max(hl, hr);
    hs[id] = h;
    let tag = "return";
    let extra = `best stays ${best}`;
    if (through > best) {
      best = through;
      bestAt = id;
      tag = "new best";
      extra = `that beats the previous best, so best = ${best}`;
    }
    stack.pop();
    sync();
    t.s.labels[id] = `h=${h}`;
    t.clear();
    t.tonePath(stack, "path");
    t.s.nodeTones[id] = through === best && bestAt === id ? "compare" : "done";
    if (n.left !== null) t.s.nodeTones[n.left] = "visited";
    if (n.right !== null) t.s.nodeTones[n.right] = "visited";
    t.s.vars = { at: n.val, "h(left)": hl, "h(right)": hr, "path through": through, best, returns: h };
    const sgn = (x: number) => (x < 0 ? `−${-x}` : String(x));
    const sum = inNodes ? `h(left) + h(right) = ${hl} + ${hr}` : `h(left) + h(right) + 2 = ${sgn(hl)} + ${sgn(hr)} + 2`;
    t.f.push(`At ${n.val}: the longest path through it is ${sum} = ${through} edge${through === 1 ? "" : "s"}; ${extra}. Return height 1 + max(${sgn(hl)}, ${sgn(hr)}) = ${h}.`, tag);
    return h;
  };
  go(t.s.root);
  t.clear();
  if (bestAt !== null) {
    const down = (start: number | null, first: boolean): number[] => {
      const ids: number[] = [];
      let cur = start;
      let guard = 0;
      while (cur !== null && guard++ <= MAX_NODES) {
        ids.push(cur);
        const n = t.node(cur);
        const l = n.left === null ? empty : (hs[n.left] ?? empty);
        const r = n.right === null ? empty : (hs[n.right] ?? empty);
        cur = first ? (l >= r ? n.left : n.right) : (r >= l ? n.right : n.left);
      }
      return ids;
    };
    const bn = t.node(bestAt);
    const left = down(bn.left, true);
    const right = down(bn.right, false);
    t.s.nodeTones[bestAt] = "compare";
    for (const id of [...left, ...right]) {
      t.s.nodeTones[id] = "done";
      t.s.edgeTones[id] = "path";
    }
  }
  t.s.vars = { diameter: best };
  t.f.push(`Diameter is ${best} edges, highlighted. One post-order pass: O(n). The naive "height at every node" version is O(n²) on a chain.`, "done");
  return t.f.done();
};

const lca: G = (input) => {
  const t = make(input);
  if (t.s.root === null) return emptyFrame(t, "search");
  const vals = t.inorderVals();
  const a = input.a ?? vals[0]!;
  const b = input.b ?? vals[vals.length - 1]!;
  const ia = t.find(a);
  const ib = t.find(b);
  t.s.vars = { a, b };
  if (ia === null || ib === null) {
    t.f.push(`${ia === null ? a : b} is not in the tree, so the lowest common ancestor is undefined. Give \`a\` and \`b\` that both exist.`, "miss");
    return t.f.done();
  }
  t.s.nodeTones[ia] = "compare";
  t.s.nodeTones[ib] = "compare";
  if (t.isBst()) {
    t.f.push(`Lowest common ancestor of ${a} and ${b} in a BST: walk down from the root; the first node that is not strictly above or below both targets splits them.`);
    const path: number[] = [];
    let cur: number | null = t.s.root;
    while (cur !== null) {
      const n: TreeNode = t.node(cur);
      t.clear();
      t.tonePath(path, "visited");
      t.s.nodeTones[ia] = "compare";
      t.s.nodeTones[ib] = "compare";
      t.s.nodeTones[cur] = "active";
      if (path.length) t.s.edgeTones[cur] = "path";
      t.s.vars = { a, b, at: n.val };
      if (a < n.val && b < n.val) {
        t.f.push(`Both ${a} and ${b} are smaller than ${n.val}, so both lie in the left subtree: go left.`, "left");
        path.push(cur);
        cur = n.left;
      } else if (a > n.val && b > n.val) {
        t.f.push(`Both ${a} and ${b} are larger than ${n.val}, so both lie in the right subtree: go right.`, "right");
        path.push(cur);
        cur = n.right;
      } else {
        t.s.nodeTones[cur] = "done";
        t.s.vars = { a, b, lca: n.val };
        t.f.push(`${n.val} splits them (${Math.min(a, b)} ≤ ${n.val} ≤ ${Math.max(a, b)}): the targets are in different subtrees, or one is this node, so ${n.val} is the LCA. O(height), no recursion needed.`, "found");
        return t.f.done();
      }
      if (t.f.full) return t.f.done();
    }
    t.f.push(`Walked off the tree, which cannot happen when both keys exist.`, "miss");
    return t.f.done();
  }
  // General binary tree: post-order, each call reports whether it found a target.
  const stack: number[] = [];
  const sync = () => {
    t.s.readouts = [stackReadout(t, stack)];
  };
  sync();
  t.f.push(`Not a BST, so no ordering to exploit. Recursive rule: lca(node) returns node if it is a target; otherwise if both subtrees report a hit, node is the answer; otherwise pass up whichever side hit.`);
  const paint = (id: number) => {
    t.clear();
    t.tonePath(stack, "path");
    t.s.nodeTones[ia] = "compare";
    t.s.nodeTones[ib] = "compare";
    t.s.nodeTones[id] = "active";
  };
  const go = (id: number | null): number | null => {
    if (id === null || t.f.full) return null;
    const n = t.node(id);
    stack.push(id);
    sync();
    paint(id);
    if (id === ia || id === ib) {
      t.s.nodeTones[id] = "done";
      t.s.labels[id] = "hit";
      t.f.push(`${n.val} is one of the targets: return it immediately (the other target is either below it, making it the LCA, or elsewhere).`, "hit");
      stack.pop();
      sync();
      return id;
    }
    t.f.push(`Enter ${n.val}: ask both subtrees whether they contain a target.`, "enter");
    const l = go(n.left);
    const r = go(n.right);
    stack.pop();
    sync();
    paint(id);
    let res: number | null;
    if (l !== null && r !== null) {
      res = id;
      t.s.nodeTones[id] = "done";
      t.s.labels[id] = "LCA";
      t.f.push(`${n.val}: left reports ${t.val(l)} and right reports ${t.val(r)}. Both sides hit, so ${n.val} is the lowest common ancestor.`, "found");
    } else {
      res = l ?? r;
      t.s.labels[id] = res === null ? "∅" : `↑${t.val(res)}`;
      t.s.nodeTones[id] = res === null ? "visited" : "path";
      t.f.push(`${n.val}: left reports ${t.val(l)}, right reports ${t.val(r)}. Pass ${res === null ? "nothing" : t.val(res)} up to the parent.`, "return");
    }
    return res;
  };
  const res = go(t.s.root);
  t.clear();
  t.s.nodeTones[ia] = "compare";
  t.s.nodeTones[ib] = "compare";
  if (res !== null) t.s.nodeTones[res] = "done";
  t.s.vars = { a, b, lca: res === null ? null : t.node(res).val };
  t.f.push(`LCA(${a}, ${b}) = ${res === null ? "none" : t.node(res).val}. One post-order pass over the tree: O(n).`, "done");
  return t.f.done();
};

const validateBst: G = (input) => {
  const t = make(input);
  if (t.s.root === null) {
    t.f.push(`An empty tree is trivially a valid BST.`, "done");
    return t.f.done();
  }
  const stack: number[] = [];
  const bound = (v: number) => (v === Infinity ? "+∞" : v === -Infinity ? "−∞" : String(v));
  const sync = () => {
    t.s.readouts = [stackReadout(t, stack)];
  };
  sync();
  t.f.push(`Validate with inherited bounds: every node must satisfy lo < key < hi, where lo and hi come from its ancestors. Checking only against the parent misses violations deeper down.`);
  const go = (id: number | null, lo: number, hi: number): boolean => {
    if (id === null || t.f.full) return true;
    const n = t.node(id);
    stack.push(id);
    sync();
    t.s.labels[id] = `(${bound(lo)}, ${bound(hi)})`;
    t.clear();
    t.tonePath(stack, "path");
    t.s.nodeTones[id] = "active";
    t.s.vars = { at: n.val, lo: bound(lo), hi: bound(hi) };
    if (!(n.val > lo && n.val < hi)) {
      t.s.nodeTones[id] = "danger";
      t.f.push(`${n.val} is outside (${bound(lo)}, ${bound(hi)}): it sits in the ${n.val <= lo ? "right" : "left"} subtree of ${bound(n.val <= lo ? lo : hi)} but is not ${n.val <= lo ? "larger" : "smaller"}. Not a BST; stop.`, "violation");
      return false;
    }
    t.f.push(`${bound(lo)} < ${n.val} < ${bound(hi)} holds. Left child inherits (${bound(lo)}, ${n.val}); right child inherits (${n.val}, ${bound(hi)}).`, "check");
    const ok = go(n.left, lo, n.val) && go(n.right, n.val, hi);
    stack.pop();
    sync();
    if (ok) t.s.nodeTones[id] = "visited";
    return ok;
  };
  const ok = go(t.s.root, -Infinity, Infinity);
  if (ok) {
    t.clear();
    for (const n of t.s.nodes) if (n) t.s.nodeTones[n.id] = "done";
    t.s.readouts = [];
    t.s.vars = { valid: true, inorder: t.inorderVals() };
    t.f.push(`Every node respects its bounds: a valid BST. Equivalent check: the in-order traversal is strictly increasing. O(n).`, "done");
  } else {
    stack.length = 0;
    sync();
    t.s.vars = { valid: false };
    t.f.push(`The tree is not a BST. A single violating node is enough; O(n) worst case.`, "done");
  }
  return t.f.done();
};

const avlInsert: G = (input) => {
  const t = make(input, false);
  const vals = input.values;
  if (vals.length === 0 && t.s.root === null) return emptyFrame(t, "insert into");
  const inNodes = input.heightUnit === "nodes";
  // Heights are kept internally in nodes (empty = 0, leaf = 1) and shown in
  // the lesson's unit: edges (empty = −1, leaf = 0) unless `heightUnit` says nodes.
  const H: Record<number, number> = {};
  const h = (id: number | null) => (id === null ? 0 : (H[id] ?? 1));
  const shown = (x: number) => (inNodes ? x : x - 1);
  const hs = (id: number | null) => shown(h(id));
  const bf = (id: number) => h(t.node(id).left) - h(t.node(id).right);
  const sign = (b: number) => `${b > 0 ? "+" : ""}${b}`;
  const label = (id: number) => {
    t.s.labels[id] = `h${hs(id)} b${sign(bf(id))}`;
  };
  const update = (id: number) => {
    const n = t.node(id);
    H[id] = 1 + Math.max(h(n.left), h(n.right));
    label(id);
  };
  const relabelAll = () => {
    const go = (id: number | null): void => {
      if (id === null) return;
      const n = t.node(id);
      go(n.left);
      go(n.right);
      update(id);
    };
    go(t.s.root);
  };
  /** Point whatever held `old` (the parent's child slot, or the root) at `id`. */
  const relink = (parent: number | null, old: number, id: number) => {
    if (parent === null) t.s.root = id;
    else if (t.node(parent).left === old) t.node(parent).left = id;
    else t.node(parent).right = id;
  };
  relabelAll();
  const unit = inNodes ? "counted in nodes: a leaf has height 1, an empty subtree 0" : "counted in edges: a leaf has height 0, an empty subtree −1";
  t.f.push(`AVL tree: after every insert, each node's balance factor b = height(left) − height(right) must stay in {−1, 0, +1}. Labels show height h (${unit}) and balance b. Insert ${vals.join(", ")}.`);
  const rotateRight = (id: number): number => {
    const x = t.node(id);
    const l = x.left!;
    const y = t.node(l);
    x.left = y.right;
    y.right = id;
    update(id);
    update(l);
    return l;
  };
  const rotateLeft = (id: number): number => {
    const x = t.node(id);
    const r = x.right!;
    const y = t.node(r);
    x.right = y.left;
    y.left = id;
    update(id);
    update(r);
    return r;
  };
  // Every structural change is linked into the tree before its frame is
  // pushed, so each frame draws the whole tree as it really is.
  const insert = (id: number | null, v: number, path: number[]): number => {
    const parent = path.length ? path[path.length - 1]! : null;
    if (id === null) {
      const nid = t.add(v);
      H[nid] = 1;
      label(nid);
      if (parent === null) t.s.root = nid;
      else t.node(parent)[v < t.node(parent).val ? "left" : "right"] = nid;
      t.clear();
      t.tonePath(path, "visited");
      t.s.nodeTones[nid] = "done";
      if (path.length) t.s.edgeTones[nid] = "path";
      t.f.push(
        parent === null
          ? `The tree is empty, so ${v} becomes the root (h${shown(1)} b0).`
          : `Empty slot: attach ${v} as a leaf (h${shown(1)} b0). Now unwind, updating heights and checking balance on the way up.`,
        "insert",
      );
      return nid;
    }
    const n = t.node(id);
    if (t.f.full) return id;
    t.clear();
    t.tonePath(path, "visited");
    t.s.nodeTones[id] = "active";
    if (path.length) t.s.edgeTones[id] = "path";
    if (v === n.val) {
      t.f.push(`${v} is already present; nothing to insert.`, "duplicate");
      return id;
    }
    const goLeft = v < n.val;
    t.f.push(`${v} ${goLeft ? "<" : ">"} ${n.val}: go ${goLeft ? "left" : "right"} (ordinary BST descent).`, "compare");
    const before = h(id);
    const child = insert(goLeft ? n.left : n.right, v, [...path, id]);
    if (goLeft) n.left = child;
    else n.right = child;
    update(id);
    const b = bf(id);
    t.clear();
    t.tonePath(path, "visited");
    t.s.nodeTones[id] = "active";
    if (path.length) t.s.edgeTones[id] = "path";
    t.s.vars = { inserting: v, at: n.val, height: hs(id), balance: b };
    if (Math.abs(b) <= 1) {
      t.f.push(`Back at ${n.val}: h = 1 + max(${hs(n.left)}, ${hs(n.right)}) = ${hs(id)}, balance ${sign(b)} is within ±1, no rotation.`, "unwind");
      return id;
    }
    t.s.nodeTones[id] = "danger";
    let kind: string;
    let newRoot: number;
    if (b > 1 && v < t.node(n.left!).val) {
      kind = "LL";
      t.s.nodeTones[n.left!] = "compare";
      t.f.push(`Back at ${n.val}: balance ${sign(b)}, left-heavy, and the new key went into the left child's left side (LL case). One right rotation about ${n.val} fixes it.`, "imbalance");
      newRoot = rotateRight(id);
    } else if (b < -1 && v > t.node(n.right!).val) {
      kind = "RR";
      t.s.nodeTones[n.right!] = "compare";
      t.f.push(`Back at ${n.val}: balance ${b}, right-heavy, and the new key went into the right child's right side (RR case). One left rotation about ${n.val} fixes it.`, "imbalance");
      newRoot = rotateLeft(id);
    } else if (b > 1) {
      kind = "LR";
      const l = n.left!;
      t.s.nodeTones[l] = "compare";
      t.s.nodeTones[t.node(l).right!] = "compare";
      t.f.push(`Back at ${n.val}: balance ${sign(b)} but the new key went into the left child's right side (LR case). First rotate ${t.node(l).val} left to turn it into an LL shape.`, "imbalance");
      n.left = rotateLeft(l);
      t.clear();
      t.tonePath(path, "visited");
      t.s.nodeTones[id] = "danger";
      t.s.nodeTones[n.left] = "compare";
      t.s.nodeTones[t.node(n.left).left!] = "compare";
      t.f.push(`After the left rotation at ${t.node(l).val}, ${t.node(n.left).val} is ${n.val}'s left child and the three keys form a straight left-leaning line (LL shape); now rotate ${n.val} right.`, "rotate");
      newRoot = rotateRight(id);
    } else {
      kind = "RL";
      const r = n.right!;
      t.s.nodeTones[r] = "compare";
      t.s.nodeTones[t.node(r).left!] = "compare";
      t.f.push(`Back at ${n.val}: balance ${b} but the new key went into the right child's left side (RL case). First rotate ${t.node(r).val} right to turn it into an RR shape.`, "imbalance");
      n.right = rotateRight(r);
      t.clear();
      t.tonePath(path, "visited");
      t.s.nodeTones[id] = "danger";
      t.s.nodeTones[n.right] = "compare";
      t.s.nodeTones[t.node(n.right).right!] = "compare";
      t.f.push(`After the right rotation at ${t.node(r).val}, ${t.node(n.right).val} is ${n.val}'s right child and the three keys form a straight right-leaning line (RR shape); now rotate ${n.val} left.`, "rotate");
      newRoot = rotateLeft(id);
    }
    relink(parent, id, newRoot);
    t.clear();
    t.tonePath(path, "visited");
    t.s.nodeTones[newRoot] = "done";
    const nr = t.node(newRoot);
    if (nr.left !== null) t.s.nodeTones[nr.left] = "visited";
    if (nr.right !== null) t.s.nodeTones[nr.right] = "visited";
    if (path.length) t.s.edgeTones[newRoot] = "path";
    t.s.vars = { inserting: v, rotation: kind, "new subtree root": nr.val, height: hs(newRoot) };
    const where = parent === null ? "the new root of the whole tree" : `the new root of this subtree, under ${t.node(parent).val}`;
    const restored = h(newRoot) === before ? `, back to the height ${shown(before)} it had before this insert, so no ancestor's balance changes` : "";
    t.f.push(`${kind} rotation done: ${nr.val} is ${where}, with ${t.val(nr.left)} and ${t.val(nr.right)} as its children. Its height is ${hs(newRoot)}${restored}. In-order order is unchanged, so it is still a BST.`, "rotate");
    return newRoot;
  };
  for (const v of vals) {
    t.s.vars = { inserting: v };
    t.s.root = insert(t.s.root, v, []);
    if (t.f.full) return t.f.done();
  }
  t.clear();
  const plain = new Tree();
  if (input.levelOrder && input.levelOrder.length > 0) plain.fromLevelOrder(input.levelOrder);
  for (const v of vals) plain.bstInsertSilent(v);
  const plainHeight = shown(plain.height(plain.s.root) + 1);
  t.s.vars = { nodes: t.size, height: hs(t.s.root), "plain BST height": plainHeight };
  t.f.push(`Final AVL height ${hs(t.s.root)} (${inNodes ? "counting nodes" : "counting edges"}) for ${t.size} keys; a plain BST on the same insertion order would have height ${plainHeight}. AVL height stays ≤ 1.44 log₂ n, so every operation is O(log n).`, "done");
  return t.f.done();
};

const invert: G = (input) => {
  const t = make(input);
  if (t.s.root === null) return emptyFrame(t, "invert");
  t.f.push(`Invert (mirror) the tree: at every node swap the left and right children, then recurse. Pre-order or post-order both work.`);
  const stack: number[] = [];
  const go = (id: number | null) => {
    if (id === null || t.f.full) return;
    const n = t.node(id);
    stack.push(id);
    t.s.readouts = [stackReadout(t, stack)];
    t.clear();
    t.tonePath(stack, "path");
    t.s.nodeTones[id] = "active";
    if (n.left !== null) t.s.nodeTones[n.left] = "compare";
    if (n.right !== null) t.s.nodeTones[n.right] = "compare";
    const before = `left=${t.val(n.left)}, right=${t.val(n.right)}`;
    [n.left, n.right] = [n.right, n.left];
    if (n.left === null && n.right === null) t.f.push(`${n.val} is a leaf: swapping two empty children changes nothing.`, "leaf");
    else t.f.push(`At ${n.val}: swap children (${before} → left=${t.val(n.left)}, right=${t.val(n.right)}), then recurse into both.`, "swap");
    go(n.left);
    go(n.right);
    stack.pop();
    t.s.readouts = [stackReadout(t, stack)];
    t.s.nodeTones[id] = "visited";
  };
  go(t.s.root);
  t.clear();
  for (const n of t.s.nodes) if (n) t.s.nodeTones[n.id] = "done";
  t.s.readouts = [];
  t.s.vars = { inorder: t.inorderVals() };
  t.f.push(`Mirrored: the in-order sequence is now reversed. One visit per node, O(n).`, "done");
  return t.f.done();
};

const serialize: G = (input) => {
  if (input.order === "level") return serializeLevel(input);
  const t = make(input);
  if (t.s.root === null) return emptyFrame(t, "serialise");
  const tokens: string[] = [];
  const stack: number[] = [];
  const sync = (ptr?: number) => {
    t.s.readouts = [stackReadout(t, stack), { label: "tokens (pre-order, # = null)", values: [...tokens], pointers: ptr === undefined ? undefined : { i: ptr } }];
  };
  sync();
  t.f.push(`Serialise with a pre-order walk, writing "#" for every empty child. The null markers are what make the string decodable without a second traversal.`);
  const go = (id: number | null) => {
    if (t.f.full) return;
    if (id === null) {
      tokens.push("#");
      sync();
      t.clear();
      t.tonePath(stack, "path");
      t.f.push(`Empty child of ${stack.length ? t.val(stack[stack.length - 1]!) : "root"}: emit "#".`, "null");
      return;
    }
    const n = t.node(id);
    stack.push(id);
    tokens.push(String(n.val));
    sync();
    t.clear();
    t.tonePath(stack, "path");
    t.s.nodeTones[id] = "done";
    t.f.push(`Visit ${n.val}: emit "${n.val}", then serialise its left subtree, then its right.`, "emit");
    go(n.left);
    go(n.right);
    stack.pop();
  };
  go(t.s.root);
  const encoded = tokens.join(" ");
  t.clear();
  for (const n of t.s.nodes) if (n) t.s.nodeTones[n.id] = "visited";
  sync();
  t.s.vars = { encoded };
  t.f.push(`Encoded: "${encoded}" (${tokens.length} tokens for ${t.size} nodes: n values + n + 1 nulls). Now decode it by consuming tokens in the same pre-order.`, "encoded");
  // Deserialise: rebuild from scratch in the same state (the Frames
  // snapshot closure is bound to `t.s`, so we reset it rather than make a
  // new Tree).
  const d = t;
  d.s.nodes = [];
  d.s.root = null;
  d.s.labels = {};
  d.clear();
  d.s.vars = { encoded };
  const dstack: number[] = [];
  let i = 0;
  const dsync = () => {
    d.s.readouts = [stackReadout(d, dstack, "build stack (bottom → top)"), { label: "tokens (pre-order, # = null)", values: [...tokens], tones: tokens.map((_, j) => (j < i ? "visited" : j === i ? "active" : undefined)), pointers: { i } }];
  };
  // Each node is linked to its parent the moment it is created, so the
  // partial tree is always drawn whole.
  const build = (parent: number | null, side: "left" | "right"): number | null => {
    if (d.f.full) return null;
    const tok = tokens[i];
    dsync();
    d.clear();
    d.tonePath(dstack, "path");
    if (tok === undefined) return null;
    if (tok === "#") {
      i++;
      dsync();
      d.f.push(`Token "#": ${parent === null ? "the tree is empty" : `${d.val(parent)}'s ${side} child is empty`}, return null.`, "null");
      return null;
    }
    const id = d.add(Number(tok));
    if (parent === null) d.s.root = id;
    else d.node(parent)[side] = id;
    i++;
    dstack.push(id);
    dsync();
    d.s.nodeTones[id] = "done";
    if (parent !== null) d.s.edgeTones[id] = "path";
    d.f.push(`Token "${tok}": create the node${parent === null ? " as the root" : ` as ${d.val(parent)}'s ${side} child`}, then read its left subtree, then its right.`, "build");
    build(id, "left");
    build(id, "right");
    dstack.pop();
    return id;
  };
  build(null, "left");
  d.clear();
  for (const n of d.s.nodes) if (n) d.s.nodeTones[n.id] = "done";
  dsync();
  d.f.push(`Decoded the same tree from the token stream. Both directions are O(n); the encoding is unique because pre-order plus null markers fixes the shape.`, "done");
  return d.f.done();
};

/** Level-order (BFS) serialisation, and decoding with a queue of parents. */
const serializeLevel: G = (input) => {
  const t = make(input);
  if (t.s.root === null) return emptyFrame(t, "serialise");
  const tokens: string[] = [];
  const LABEL = "tokens (level order, # = null)";
  // Queue entries remember their parent so a "#" can say whose child it is.
  let queue: { id: number | null; parent: number | null; side: "left" | "right" }[] = [{ id: t.s.root, parent: null, side: "left" }];
  const sync = () => {
    t.s.readouts = [
      { label: "queue (front → back)", values: queue.map((q) => (q.id === null ? "#" : t.node(q.id).val)), tones: queue.map((q) => (q.id === null ? "muted" : "frontier")), labels: [] },
      { label: LABEL, values: [...tokens] },
    ];
  };
  const emitted: number[] = [];
  const paint = () => {
    t.clear();
    for (const id of emitted) t.s.nodeTones[id] = "visited";
    for (const q of queue) if (q.id !== null) t.s.nodeTones[q.id] = "frontier";
  };
  sync();
  paint();
  t.f.push(`Serialise level by level: a queue starts with the root. Each dequeued node emits its value and enqueues both children, empty ones included; an empty child emits "#" when it reaches the front.`);
  while (queue.length && !t.f.full) {
    const q = queue[0]!;
    queue = queue.slice(1);
    if (q.id === null) {
      tokens.push("#");
      sync();
      paint();
      t.f.push(`Dequeue the empty ${q.side} child of ${t.val(q.parent)}: emit "#".`, "null");
      continue;
    }
    const n = t.node(q.id);
    tokens.push(String(n.val));
    emitted.push(q.id);
    queue.push({ id: n.left, parent: q.id, side: "left" }, { id: n.right, parent: q.id, side: "right" });
    sync();
    paint();
    t.s.nodeTones[q.id] = "active";
    for (const c of [n.left, n.right]) if (c !== null) t.s.edgeTones[c] = "path";
    const kids = [n.left, n.right].map((c) => (c === null ? "#" : String(t.node(c).val)));
    t.f.push(`Dequeue ${n.val}: emit "${n.val}" and enqueue its children, ${kids[0]} and ${kids[1]}.`, "emit");
  }
  const encoded = tokens.join(",");
  t.clear();
  for (const n of t.s.nodes) if (n) t.s.nodeTones[n.id] = "visited";
  sync();
  t.s.vars = { encoded };
  t.f.push(`Encoded: "${encoded}" (${tokens.length} tokens for ${t.size} nodes: n values + n + 1 nulls). Now decode it: every node waiting in a queue takes the next two tokens as its children.`, "encoded");
  // Decode into the same state.
  const d = t;
  d.s.nodes = [];
  d.s.root = null;
  d.s.labels = {};
  d.clear();
  d.s.vars = { encoded };
  let dq: number[] = [];
  let i = 0;
  const dsync = (span: number) => {
    d.s.readouts = [
      { label: "queue: nodes waiting for children", values: dq.map((id) => d.node(id).val), tones: dq.map(() => "frontier" as Tone), labels: [] },
      { label: LABEL, values: [...tokens], tones: tokens.map((_, j) => (j < i - span ? "visited" : j < i ? "active" : undefined)), pointers: i < tokens.length ? { i } : undefined },
    ];
  };
  const root = d.add(Number(tokens[0]));
  d.s.root = root;
  dq = [root];
  i = 1;
  dsync(1);
  d.s.nodeTones[root] = "done";
  d.f.push(`Token "${tokens[0]}" becomes the root; put it in the queue, since its children have not been read yet.`, "build");
  while (dq.length && i < tokens.length && !d.f.full) {
    const p = dq[0]!;
    dq = dq.slice(1);
    const made: string[] = [];
    const before = i;
    for (const side of ["left", "right"] as const) {
      const tok = tokens[i];
      if (tok === undefined) break;
      i++;
      if (tok === "#") continue;
      const id = d.add(Number(tok));
      d.node(p)[side] = id;
      dq.push(id);
      made.push(`${tok} as its ${side} child`);
    }
    dsync(i - before);
    d.clear();
    d.s.nodeTones[p] = "active";
    const pn = d.node(p);
    for (const c of [pn.left, pn.right]) {
      if (c === null) continue;
      d.s.nodeTones[c] = "done";
      d.s.edgeTones[c] = "path";
    }
    const pair = tokens.slice(before, i).map((x) => `"${x}"`).join(" and ");
    d.f.push(`Dequeue ${pn.val}: it takes the next two tokens, ${pair}. ${made.length ? `Create ${made.join(" and ")}, and enqueue ${made.length === 1 ? "it" : "them"}.` : `Both are empty, so ${pn.val} is a leaf.`}`, "build");
  }
  d.clear();
  for (const n of d.s.nodes) if (n) d.s.nodeTones[n.id] = "done";
  dsync(0);
  d.f.push(`Decoded the same tree. The queue and the token index advance in lockstep: the queue always holds, in order, exactly the nodes whose children have not been read. O(n) each way.`, "done");
  return d.f.done();
};

// ---- renderer ----

interface Layout {
  pos: Record<number, [number, number]>;
  cols: number;
  rows: number;
}

function layout(nodes: (TreeNode | null)[], root: number | null): Layout {
  const pos: Record<number, [number, number]> = {};
  let col = 0;
  let rows = 0;
  const go = (id: number | null, depth: number, guard: number) => {
    if (id === null || guard > MAX_NODES * 2) return;
    const n = nodes[id];
    if (!n) return;
    go(n.left, depth + 1, guard + 1);
    pos[id] = [col++, depth];
    rows = Math.max(rows, depth + 1);
    go(n.right, depth + 1, guard + 1);
  };
  go(root, 0, 0);
  return { pos, cols: col, rows };
}

export function TreeSvg({ state, r = 14 }: { state: TreeState; r?: number }) {
  const { pos, cols, rows } = layout(state.nodes, state.root);
  const SX = 2 * r + 8;
  const SY = rows > 12 ? 34 : 50;
  const hasSub = Object.keys(state.labels).length > 0;
  const W = Math.max(cols, 1) * SX + 8;
  const H = Math.max(rows, 1) * SY + (hasSub ? 18 : 6);
  const px = (c: number) => 4 + c * SX + SX / 2;
  const py = (d: number) => r + 4 + d * SY;
  if (state.root === null) return <div className="rounded-md border border-dashed border-line px-3 py-6 text-center text-xs text-muted">empty tree</div>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0" role="img" aria-label="Binary tree">
      {state.nodes.map((n) => {
        if (!n) return null;
        const p = pos[n.id];
        if (!p) return null;
        return [n.left, n.right].map((c) => {
          if (c === null) return null;
          const q = pos[c];
          if (!q) return null;
          const tone = state.edgeTones[c] ?? "default";
          const strong = tone !== "default" && tone !== "muted";
          return <line key={`${n.id}-${c}`} x1={px(p[0])} y1={py(p[1])} x2={px(q[0])} y2={py(q[1])} stroke={toneStroke[tone]} strokeWidth={strong ? 2.5 : 1.5} opacity={tone === "muted" ? 0.35 : 1} />;
        });
      })}
      {state.nodes.map((n) => {
        if (!n) return null;
        const p = pos[n.id];
        if (!p) return null;
        return <Circle key={n.id} x={px(p[0])} y={py(p[1])} r={r} label={n.val} tone={state.nodeTones[n.id] ?? "default"} sub={state.labels[n.id]} />;
      })}
    </svg>
  );
}

export function Readouts({ readouts }: { readouts: Readout[] }) {
  if (readouts.length === 0) return null;
  return (
    <div className="flex min-w-[140px] flex-col gap-3">
      {readouts.map((r) => (
        <div key={r.label}>
          <div className="mb-1 text-[11px] text-muted">{r.label}</div>
          {r.values.length === 0 ? <div className="font-mono text-xs text-muted">∅</div> : <Cells values={r.values} tones={r.tones} labels={r.labels} pointers={r.pointers} size="sm" />}
        </div>
      ))}
    </div>
  );
}

function Renderer({ frame }: RendererProps<TreeInput, TreeState>) {
  const { state } = frame;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-6">
        <TreeSvg state={state} />
        <Readouts readouts={state.readouts} />
      </div>
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "current" }, { tone: "path", label: "on the stack / path" }, { tone: "compare", label: "being compared" }, { tone: "visited", label: "finished" }, { tone: "done", label: "result" }, { tone: "danger", label: "removed / violation" }]} />
    </div>
  );
}

const nums = (v: unknown, cap = MAX_NODES): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)).slice(0, cap) : []);
const num = (v: unknown): number | undefined => (v === undefined || v === null || v === "" ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);

const EX = [8, 3, 10, 1, 6, 14, 4, 7, 13];

export const treeFamily: Family<TreeInput, TreeState> = {
  name: "Binary tree",
  description: "BST operations, traversals, recursive tree algorithms, AVL rotations and serialisation.",
  Renderer,
  algorithms: {
    "bst-insert": bstInsert,
    "bst-search": bstSearch,
    "bst-delete": bstDelete,
    inorder: traversal("inorder"),
    preorder: traversal("preorder"),
    postorder: traversal("postorder"),
    "level-order": levelOrder,
    height,
    diameter,
    lca,
    "validate-bst": validateBst,
    "avl-insert": avlInsert,
    invert,
    serialize,
  },
  labels: {
    "bst-insert": "BST insert",
    "bst-search": "BST search",
    "bst-delete": "BST delete",
    inorder: "In-order traversal",
    preorder: "Pre-order traversal",
    postorder: "Post-order traversal",
    "level-order": "Level-order traversal",
    height: "Height (post-order)",
    diameter: "Diameter",
    lca: "Lowest common ancestor",
    "validate-bst": "Validate BST",
    "avl-insert": "AVL insert with rotations",
    invert: "Invert a binary tree",
    serialize: "Serialise and deserialise",
  },
  examples: {
    "bst-insert": { values: [8, 3, 10, 1, 6, 14] },
    "bst-search": { values: EX, target: 7 },
    "bst-delete": { values: EX, target: 3 },
    inorder: { values: [8, 3, 10, 1, 6, 14] },
    preorder: { values: [8, 3, 10, 1, 6, 14] },
    postorder: { values: [8, 3, 10, 1, 6, 14] },
    "level-order": { values: EX },
    height: { values: EX },
    diameter: { values: [8, 3, 10, 1, 6, 4, 7, 5] },
    lca: { values: [6, 2, 8, 0, 4, 7, 9, 3, 5], a: 3, b: 5 },
    "validate-bst": { values: [], levelOrder: [8, 3, 10, 1, 6, null, 14, null, null, 4, 11] },
    "avl-insert": { values: [10, 20, 30, 40, 50, 25] },
    invert: { values: [4, 2, 7, 1, 3, 6, 9] },
    serialize: { values: [8, 3, 10, 1, 6] },
  },
  normalise: (raw) => {
    const lo = raw.levelOrder ?? raw.level_order ?? raw.levelorder ?? raw.tree;
    let levelOrder = Array.isArray(lo) ? (lo as unknown[]).slice(0, 2 * MAX_NODES + 1).map((v) => (v === null || v === undefined || v === "null" || v === "#" ? null : Number.isFinite(Number(v)) ? Number(v) : null)) : undefined;
    // `values` is merged over the example; if it is the example's own array
    // and the author supplied a shape, do not insert the example keys.
    const valuesFromExample = Object.values(treeFamily.examples).some((e) => e.values === raw.values);
    const levelOrderFromExample = Object.values(treeFamily.examples).some((e) => e.levelOrder !== undefined && e.levelOrder === lo);
    let values = nums(raw.values ?? raw.keys ?? raw.items);
    if (levelOrder && levelOrder.length && valuesFromExample) values = [];
    if (levelOrder && levelOrderFromExample && !valuesFromExample) levelOrder = undefined;
    if (levelOrder) {
      // Keep at most MAX_NODES real nodes.
      let count = 0;
      for (let i = 0; i < levelOrder.length; i++) {
        if (levelOrder[i] !== null) count++;
        if (count > MAX_NODES) levelOrder[i] = null;
      }
    }
    const target = num(raw.target ?? raw.key ?? raw.value ?? raw.search ?? raw.delete);
    const unit = String(raw.heightUnit ?? raw.height_unit ?? "").toLowerCase();
    const order = String(raw.order ?? "").toLowerCase();
    const flag = (v: unknown) => v === true || v === "true";
    return {
      values,
      levelOrder: levelOrder && levelOrder.length ? levelOrder : undefined,
      target,
      a: num(raw.a ?? raw.p),
      b: num(raw.b ?? raw.q),
      heightUnit: unit.startsWith("node") ? "nodes" : unit.startsWith("edge") ? "edges" : undefined,
      thenInorder: flag(raw.thenInorder ?? raw.then_inorder) || undefined,
      iterative: flag(raw.iterative) || undefined,
      order: order.startsWith("level") || order === "bfs" ? "level" : order.startsWith("pre") ? "preorder" : undefined,
    };
  },
};
