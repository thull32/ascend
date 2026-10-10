// String algorithms: pattern matching (KMP, Rabin-Karp, Z), palindromes,
// anagram windows and in-place transforms. The state is a small set of
// character rows (text, pattern, auxiliary arrays) so one renderer serves
// every algorithm: the pattern row can be offset under the text to show
// the current alignment, and aux rows hold failure/Z/hash arrays.
import { Cells, Legend, Vars, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";

export interface StringInput {
  text: string;
  pattern?: string;
  /** rabin-karp: hash base and modulus (default 31 and 101). */
  base?: number;
  mod?: number;
}

export interface Row {
  label: string;
  values: (string | number | null)[];
  tones?: (Tone | undefined)[];
  pointers?: Record<string, number | undefined>;
  /** Horizontal offset in cells (used to slide the pattern under the text). */
  offset?: number;
  size?: "sm" | "md";
}

export interface StringState {
  text: Row;
  pattern?: Row;
  aux: Row[];
  vars: Record<string, unknown>;
}

type G = (input: StringInput) => ReturnType<Frames<StringState>["done"]>;

const MAX_TEXT = 40;
const MAX_PATTERN = 20;

/** Show spaces as a visible glyph inside cells. */
const glyph = (c: string) => (c === " " ? "␣" : c);

function copyRow(r: Row): Row {
  return { ...r, values: [...r.values], tones: r.tones ? [...r.tones] : undefined, pointers: r.pointers ? { ...r.pointers } : undefined };
}

function make(text: string, pattern?: string) {
  const s: StringState = {
    text: { label: "text", values: [...text].map(glyph), tones: [...text].map(() => undefined), pointers: {} },
    pattern: pattern === undefined ? undefined : { label: "pattern", values: [...pattern].map(glyph), tones: [...pattern].map(() => undefined), pointers: {}, offset: 0 },
    aux: [],
    vars: {},
  };
  const f = new Frames<StringState>(() => ({ text: copyRow(s.text), pattern: s.pattern ? copyRow(s.pattern) : undefined, aux: s.aux.map(copyRow), vars: { ...s.vars } }));
  const reset = (row?: Row) => {
    if (row?.tones) row.tones.fill(undefined);
  };
  const resetAll = () => {
    reset(s.text);
    reset(s.pattern);
    for (const a of s.aux) reset(a);
  };
  return { s, f, resetAll, reset };
}

/** A frame explaining bad input instead of throwing. */
function problem(text: string, msg: string): ReturnType<Frames<StringState>["done"]> {
  const { s, f } = make(text);
  s.vars = { n: text.length };
  f.push(msg, "input");
  return f.done();
}

// ---------- KMP ----------

const kmp: G = ({ text, pattern = "" }) => {
  if (pattern.length === 0) return problem(text, "The pattern is empty, so it matches trivially at every position; give a non-empty pattern to see KMP work.");
  const { s, f, resetAll, reset } = make(text, pattern);
  const p = [...pattern];
  const t = [...text];
  const m = p.length;
  const n = t.length;
  const lps: (number | null)[] = p.map(() => null);
  const lpsRow: Row = { label: "failure (lps): longest proper prefix that is also a suffix", values: lps, tones: p.map(() => undefined), pointers: {} };
  s.aux = [lpsRow];
  s.text.tones!.fill("muted");
  s.vars = { phase: "build failure table", n, m };
  lps[0] = 0;
  s.pattern!.pointers = { i: 0, k: 0 };
  f.push("Phase 1 builds the failure table: lps[i] is the length of the longest proper prefix of pattern[0..i] that is also a suffix of it; lps[0] is 0 by definition.", "build");
  let k = 0;
  for (let i = 1; i < m && !f.full; i++) {
    while (k > 0 && p[i] !== p[k]) {
      s.pattern!.tones![i] = "danger";
      s.pattern!.tones![k] = "danger";
      s.pattern!.pointers = { i, k };
      const nk = lps[k - 1] ?? 0;
      f.push(`pattern[${i}] = '${p[i]}' ≠ pattern[${k}] = '${p[k]}': fall back to k = lps[${k - 1}] = ${nk} and retry, since a shorter border of the prefix might still extend.`, "fallback");
      k = nk;
      reset(s.pattern!);
    }
    s.pattern!.pointers = { i, k };
    if (p[i] === p[k]) {
      s.pattern!.tones![i] = "compare";
      s.pattern!.tones![k] = "compare";
      k++;
      lps[i] = k;
      lpsRow.tones![i] = "done";
      f.push(`pattern[${i}] = '${p[i]}' equals pattern[${k - 1}]: the border grows to ${k}, so lps[${i}] = ${k}.`, "extend");
    } else {
      lps[i] = 0;
      lpsRow.tones![i] = "done";
      s.pattern!.tones![i] = "danger";
      f.push(`pattern[${i}] = '${p[i]}' ≠ pattern[0] = '${p[0]}' and k is already 0: no border ends here, so lps[${i}] = 0.`, "zero");
    }
    reset(s.pattern!);
  }
  resetAll();
  lpsRow.tones!.fill("done");
  s.pattern!.pointers = {};
  s.vars = { phase: "search", n, m };
  f.push(`Failure table done: ${JSON.stringify(lps)}. Phase 2 scans the text once; i indexes the text and never moves backwards.`, "search");

  const matches: number[] = [];
  let i = 0;
  let j = 0;
  const paint = () => {
    resetAll();
    lpsRow.tones!.fill(undefined);
    for (const mt of matches) for (let q = 0; q < m; q++) s.text.tones![mt + q] = "done";
    s.pattern!.offset = i - j;
    for (let q = 0; q < j; q++) {
      s.pattern!.tones![q] = "visited";
      if (s.text.tones![i - j + q] !== "done") s.text.tones![i - j + q] = "visited";
    }
    s.text.pointers = { i };
    s.pattern!.pointers = { j };
    s.vars = { phase: "search", i, j, matches: matches.length };
  };
  while (i < n && !f.full) {
    paint();
    if (t[i] === p[j]) {
      s.text.tones![i] = "compare";
      s.pattern!.tones![j] = "compare";
      i++;
      j++;
      if (j === m) {
        matches.push(i - m);
        paint();
        s.vars.shift = lps[m - 1];
        f.push(`Full match at text[${i - m}..${i - 1}]. Slide the pattern by its border: j = lps[${m - 1}] = ${lps[m - 1]}, and keep i where it is to find overlapping matches.`, "match");
        j = lps[m - 1] ?? 0;
      } else {
        f.push(`text[${i - 1}] = '${t[i - 1]}' matches pattern[${j - 1}]: advance both i and j.`, "compare");
      }
    } else if (j > 0) {
      s.text.tones![i] = "danger";
      s.pattern!.tones![j] = "danger";
      const nj = lps[j - 1] ?? 0;
      lpsRow.tones![j - 1] = "active";
      f.push(`text[${i}] = '${t[i]}' ≠ pattern[${j}] = '${p[j]}': the first ${j} chars matched, so slide the pattern to j = lps[${j - 1}] = ${nj} without moving i.`, "shift");
      j = nj;
    } else {
      s.text.tones![i] = "danger";
      s.pattern!.tones![0] = "danger";
      f.push(`text[${i}] = '${t[i]}' ≠ pattern[0] with nothing matched yet: move i forward by one.`, "advance");
      i++;
    }
  }
  paint();
  s.pattern!.pointers = {};
  s.pattern!.offset = Math.max(0, n - m);
  s.vars = { matches, comparisons: "≤ 2n" };
  f.push(matches.length ? `Done: ${matches.length} match(es) at ${matches.join(", ")}. Total work is O(n + m) because i only advances and j only falls back as far as it rose.` : "Done: no match. Total work is O(n + m) because i only advances and j only falls back as far as it rose.", "done");
  return f.done();
};

// ---------- Rabin-Karp ----------

/** The digits as one base-B number (exact for the short patterns the visualiser takes). */
const hashOfDigits = (chars: string[], B: number) => chars.reduce((h, c) => h * B + (c.charCodeAt(0) - 48), 0);

const rabinKarp: G = ({ text, pattern = "", base, mod }) => {
  if (pattern.length === 0) return problem(text, "The pattern is empty; give a non-empty pattern to see rolling hashes compared.");
  const { s, f, resetAll } = make(text, pattern);
  const t = [...text];
  const p = [...pattern];
  const n = t.length;
  const m = p.length;
  const B = base !== undefined && Number.isInteger(base) && base >= 2 && base <= 1000 ? base : 31;
  const M = mod !== undefined && Number.isInteger(mod) && mod >= 2 && mod <= 1_000_003 ? mod : 101;
  // All-digit text is hashed by digit value (the classic base-10 worked example); anything else by character code.
  const digits = [...text, ...pattern].every((c) => c >= "0" && c <= "9");
  const code = (c: string) => (digits ? c.charCodeAt(0) - 48 : c.charCodeAt(0));
  const hashOf = (chars: string[]) => chars.reduce((h, c) => (h * B + code(c)) % M, 0);
  if (m > n) {
    s.vars = { n, m };
    f.push(`The pattern (${m} chars) is longer than the text (${n} chars), so no window can match.`, "done");
    return f.done();
  }
  const hp = hashOf(p);
  const windows = n - m + 1;
  const hashes: (number | null)[] = Array.from({ length: windows }, () => null);
  const hashRow: Row = { label: `window hash (base ${B}, mod ${M})`, values: hashes, tones: hashes.map(() => undefined), pointers: {} };
  s.aux = [hashRow];
  s.pattern!.tones!.fill("active");
  s.vars = { "hash(pattern)": hp, B, M };
  f.push(digits ? `Hash the pattern once: read "${pattern}" as a base-${B} number, mod ${M}: ${hashOfDigits(p, B)} mod ${M} = ${hp}. Each text window gets the same treatment, but in O(1) each thanks to rolling.` : `Hash the pattern once: hash = Σ code(c)·B^k mod ${M} = ${hp}. Each text window will get the same treatment, but in O(1) each thanks to rolling.`, "hash");
  let pow = 1;
  for (let q = 0; q < m - 1; q++) pow = (pow * B) % M;
  let hw = hashOf(t.slice(0, m));
  const matches: number[] = [];
  const paintWindow = (w: number) => {
    resetAll();
    for (const mt of matches) for (let q = 0; q < m; q++) s.text.tones![mt + q] = "done";
    for (let q = 0; q < m; q++) if (s.text.tones![w + q] !== "done") s.text.tones![w + q] = "active";
    s.pattern!.offset = w;
    s.text.pointers = { w };
    for (let q = 0; q < w; q++) hashRow.tones![q] = "muted";
    hashRow.tones![w] = "active";
  };
  for (let w = 0; w < windows && !f.full; w++) {
    hashes[w] = hw;
    paintWindow(w);
    s.vars = { "hash(pattern)": hp, "hash(window)": hw, w };
    if (hw === hp) {
      f.push(`Window ${w} hashes to ${hw}, equal to the pattern's hash: a candidate, so verify character by character (hashes can collide).`, "candidate");
      let ok = true;
      for (let q = 0; q < m && !f.full; q++) {
        s.text.tones![w + q] = "compare";
        s.pattern!.tones![q] = "compare";
        if (t[w + q] !== p[q]) {
          s.text.tones![w + q] = "danger";
          s.pattern!.tones![q] = "danger";
          hashRow.tones![w] = "danger";
          f.push(`text[${w + q}] = '${t[w + q]}' ≠ pattern[${q}] = '${p[q]}': a spurious hit (hash collision), so this window is rejected.`, "collision");
          ok = false;
          break;
        }
        f.push(`text[${w + q}] = '${t[w + q]}' equals pattern[${q}]; ${q + 1}/${m} verified.`, "verify");
      }
      if (ok) {
        matches.push(w);
        hashRow.tones![w] = "done";
        paintWindow(w);
        f.push(`All ${m} characters agree: genuine match at position ${w}.`, "match");
      }
    } else {
      hashRow.tones![w] = "muted";
      f.push(`Window ${w} hashes to ${hw} ≠ ${hp}: skip it without looking at any character.`, "skip");
    }
    if (w + 1 < windows) {
      const out = t[w]!;
      const inc = t[w + m]!;
      hw = (((hw - code(out) * pow) % M) + M) % M;
      hw = (hw * B + code(inc)) % M;
      resetAll();
      s.text.tones![w] = "danger";
      s.text.tones![w + m] = "compare";
      s.pattern!.offset = w + 1;
      s.vars = { "hash(pattern)": hp, "hash(window)": hw, out: `'${out}'`, in: `'${inc}'` };
      f.push(digits ? `Roll: drop '${out}' (subtract ${out}·${B}^${m - 1}), multiply by ${B}, add ${inc}: new hash ${hw}, computed in O(1).` : `Roll: drop '${out}' (subtract code·B^${m - 1}), shift by B, add '${inc}': new hash ${hw}, computed in O(1).`, "roll");
    }
  }
  resetAll();
  for (const mt of matches) for (let q = 0; q < m; q++) s.text.tones![mt + q] = "done";
  s.pattern!.offset = Math.max(0, n - m);
  s.text.pointers = {};
  s.vars = { matches, windows };
  f.push(`Done: ${matches.length} match(es) at [${matches.join(", ")}]. Expected O(n + m): each window costs O(1) unless its hash collides.`, "done");
  return f.done();
};

// ---------- Z algorithm ----------

const zAlgorithm: G = ({ text }) => {
  const { s, f, resetAll } = make(text);
  const t = [...text];
  const n = t.length;
  if (n === 0) return problem(text, "The text is empty; give a non-empty string to compute its Z-array.");
  const z: (number | null)[] = t.map(() => null);
  const zRow: Row = { label: "z[i]: length of the longest prefix of text starting at i", values: z, tones: t.map(() => undefined), pointers: {} };
  s.aux = [zRow];
  z[0] = n;
  zRow.tones![0] = "done";
  // The Z-box [l, r] (inclusive) is the rightmost prefix match found so far; none until a match.
  let l = 0;
  let r = 0;
  let hasBox = false;
  const boxVars = () => (hasBox ? { box: `[${l}, ${r}]` } : { box: "none" });
  s.vars = { n, ...boxVars() };
  f.push(`z[0] = ${n} by convention (the whole string matches itself). The Z-box [l, r] will track the rightmost stretch known to match the prefix; there is none yet.`, "init");
  const paintBox = (i: number) => {
    resetAll();
    for (let q = 0; q < n; q++) if (z[q] !== null) zRow.tones![q] = "done";
    if (hasBox) for (let q = l; q <= r; q++) s.text.tones![q] = "active";
    s.text.pointers = { i, l: hasBox ? l : undefined, r: hasBox ? r : undefined };
    s.vars = { n, i, ...boxVars() };
  };
  for (let i = 1; i < n && !f.full; i++) {
    let zi = 0;
    paintBox(i);
    if (hasBox && i <= r) {
      const mirror = i - l;
      zi = Math.min(r - i + 1, z[mirror] ?? 0);
      z[i] = zi;
      zRow.tones![mirror] = "compare";
      zRow.tones![i] = "active";
      s.text.pointers = { i, l, r, mirror };
      f.push(`i = ${i} is inside the box [${l}, ${r}], which matches the prefix [0, ${r - l}], so text[${i}..] mirrors text[${mirror}..]: start from z[${i}] = min(r − i + 1, z[${mirror}]) = min(${r - i + 1}, ${z[mirror]}) = ${zi} without comparing.`, "copy");
    } else {
      z[i] = 0;
      zRow.tones![i] = "active";
      f.push(`i = ${i} is ${hasBox ? `outside the box [${l}, ${r}]` : "not covered by any box"}, so nothing is known: start z[${i}] at 0 and compare from scratch.`, "fresh");
    }
    while (i + zi < n && t[zi] === t[i + zi] && !f.full) {
      zi++;
      z[i] = zi;
      paintBox(i);
      zRow.tones![i] = "active";
      s.text.tones![zi - 1] = "compare";
      s.text.tones![i + zi - 1] = "compare";
      f.push(`text[${zi - 1}] = '${t[zi - 1]}' equals text[${i + zi - 1}]: extend z[${i}] to ${zi}.${i + zi === n ? " That reaches the end of the string." : ""}`, "extend");
    }
    if (i + zi < n) {
      paintBox(i);
      zRow.tones![i] = "active";
      s.text.tones![zi] = "danger";
      s.text.tones![i + zi] = "danger";
      f.push(`text[${zi}] = '${t[zi]}' ≠ text[${i + zi}] = '${t[i + zi]}': z[${i}] settles at ${zi}.`, "stop");
    }
    if (zi > 0 && (!hasBox || i + zi - 1 > r)) {
      l = i;
      r = i + zi - 1;
      hasBox = true;
      paintBox(i);
      f.push(`The match [${l}, ${r}] reaches further right than any before, so it becomes the box: [l, r] = [${l}, ${r}].`, "box");
    }
  }
  resetAll();
  zRow.tones!.fill("done");
  s.text.pointers = {};
  s.vars = { z: z.map((v) => v ?? 0) };
  f.push(`Z-array complete. Every character enters the box at most once and comparisons only extend r, so the total is O(n).`, "done");
  return f.done();
};

// ---------- Expand around centre ----------

const expandPalindrome: G = ({ text }) => {
  const { s, f, resetAll } = make(text);
  const t = [...text];
  const n = t.length;
  if (n === 0) return problem(text, "The text is empty; give a non-empty string to find its longest palindromic substring.");
  let bestLo = 0;
  let bestHi = 0;
  const paint = (lo: number, hi: number) => {
    resetAll();
    for (let q = bestLo; q <= bestHi; q++) s.text.tones![q] = "done";
    for (let q = lo + 1; q <= hi - 1; q++) if (q >= 0 && q < n) s.text.tones![q] = "active";
    s.text.pointers = { lo: lo >= 0 ? lo : undefined, hi: hi < n ? hi : undefined };
    s.vars = { best: text.slice(bestLo, bestHi + 1), bestLen: bestHi - bestLo + 1 };
  };
  f.push(`Every palindrome has a centre: one of the ${n} characters (odd length) or one of the ${n - 1} gaps between them (even length). Try all ${2 * n - 1} centres and expand each outward while the ends match.`, "start");
  for (let c = 0; c < 2 * n - 1 && !f.full; c++) {
    let lo = Math.floor(c / 2);
    let hi = lo + (c % 2);
    const odd = c % 2 === 0;
    const kind = odd ? `character ${lo} ('${t[lo]}')` : `gap between ${lo} and ${hi}`;
    paint(lo, hi);
    s.text.tones![lo] = "compare";
    s.text.tones![hi] = "compare";
    s.vars.centre = kind;
    if (t[lo] !== t[hi]) {
      s.text.tones![lo] = "danger";
      s.text.tones![hi] = "danger";
      f.push(`Centre ${c + 1} of ${2 * n - 1}, the ${kind}: '${t[lo]}' ≠ '${t[hi]}', so no even palindrome sits here.`, "centre");
      continue;
    }
    f.push(odd ? `Centre ${c + 1} of ${2 * n - 1}, the ${kind}: a single character is a palindrome of length 1; try to widen it.` : `Centre ${c + 1} of ${2 * n - 1}, the ${kind}: '${t[lo]}' = '${t[hi]}', so [${lo}, ${hi}] is a palindrome; try to widen it.`, "centre");
    while (!f.full) {
      if (lo - 1 < 0 || hi + 1 >= n) {
        paint(lo - 1, hi + 1);
        f.push(`[${lo}, ${hi}] touches the ${lo - 1 < 0 ? "start" : "end"} of the text, so it cannot widen further: length ${hi - lo + 1}.`, "edge");
        break;
      }
      if (t[lo - 1] === t[hi + 1]) {
        lo--;
        hi++;
        paint(lo - 1, hi + 1);
        s.text.tones![lo] = "compare";
        s.text.tones![hi] = "compare";
        f.push(`text[${lo}] = '${t[lo]}' matches text[${hi}]: widen to [${lo}, ${hi}], length ${hi - lo + 1}.`, "expand");
      } else {
        paint(lo - 1, hi + 1);
        s.text.tones![lo - 1] = "danger";
        s.text.tones![hi + 1] = "danger";
        f.push(`text[${lo - 1}] = '${t[lo - 1]}' ≠ text[${hi + 1}] = '${t[hi + 1]}': expansion stops at [${lo}, ${hi}], length ${hi - lo + 1}.`, "stop");
        break;
      }
    }
    if (hi - lo > bestHi - bestLo) {
      bestLo = lo;
      bestHi = hi;
      paint(-1, n);
      f.push(`New best: "${text.slice(lo, hi + 1)}" (length ${hi - lo + 1}).`, "best");
    }
  }
  paint(-1, n);
  s.text.pointers = {};
  f.push(`Longest palindromic substring is "${text.slice(bestLo, bestHi + 1)}" (length ${bestHi - bestLo + 1}). All ${2 * n - 1} centres were tried. The cost is the sum of the expansions: near-linear on text like this, quadratic when every centre grows to the edge.`, "done");
  return f.done();
};

// ---------- Anagram sliding window ----------

const anagramWindow: G = ({ text, pattern = "" }) => {
  if (pattern.length === 0) return problem(text, "The pattern is empty; give a pattern so the window has a length to slide with.");
  const { s, f, resetAll } = make(text, pattern);
  const t = [...text];
  const p = [...pattern];
  const n = t.length;
  const m = p.length;
  const alphabet = [...new Set([...p, ...t])].sort();
  const need = new Map<string, number>();
  for (const c of p) need.set(c, (need.get(c) ?? 0) + 1);
  const have = new Map<string, number>();
  const needRow: Row = { label: "need (pattern counts)", values: alphabet.map((c) => need.get(c) ?? 0), tones: alphabet.map(() => undefined), size: "sm" };
  const haveRow: Row = { label: "have (window counts)", values: alphabet.map(() => 0), tones: alphabet.map(() => undefined), size: "sm" };
  const letters: Row = { label: "character", values: alphabet.map(glyph), tones: alphabet.map(() => undefined), size: "sm" };
  s.aux = [letters, needRow, haveRow];
  s.pattern!.tones!.fill("active");
  s.vars = { n, m };
  if (m > n) {
    f.push(`The pattern (${m}) is longer than the text (${n}); no window can be an anagram of it.`, "done");
    return f.done();
  }
  f.push(`Count the pattern's characters once. A window of ${m} text characters is an anagram exactly when its counts equal these.`, "count");
  const matches: number[] = [];
  const refreshHave = () => {
    haveRow.values = alphabet.map((c) => have.get(c) ?? 0);
    haveRow.tones = alphabet.map((c) => ((have.get(c) ?? 0) === (need.get(c) ?? 0) ? "done" : (have.get(c) ?? 0) > (need.get(c) ?? 0) ? "danger" : undefined));
  };
  const paint = (lo: number) => {
    resetAll();
    for (const mt of matches) for (let q = 0; q < m; q++) s.text.tones![mt + q] = "done";
    for (let q = lo; q < lo + m; q++) if (s.text.tones![q] !== "done") s.text.tones![q] = "active";
    s.text.pointers = { lo, hi: lo + m - 1 };
    s.pattern!.offset = lo;
    refreshHave();
  };
  const equal = () => alphabet.every((c) => (have.get(c) ?? 0) === (need.get(c) ?? 0));
  for (let hi = 0; hi < n && !f.full; hi++) {
    const inc = t[hi]!;
    have.set(inc, (have.get(inc) ?? 0) + 1);
    if (hi >= m) {
      const out = t[hi - m]!;
      have.set(out, (have.get(out) ?? 0) - 1);
    }
    const lo = hi - m + 1;
    if (lo < 0) {
      paint(0);
      s.text.tones![hi] = "compare";
      for (let q = hi + 1; q < m; q++) s.text.tones![q] = undefined;
      s.text.pointers = { hi };
      s.vars = { n, m, window: `[0, ${hi}]` };
      f.push(`Add '${inc}' to the window counts (still filling the first window of ${m}).`, "fill");
      continue;
    }
    paint(lo);
    s.text.tones![hi] = "compare";
    if (hi >= m) s.text.tones![hi - m] = "danger";
    const ok = equal();
    s.vars = { n, m, window: `[${lo}, ${hi}]`, matches: matches.length + (ok ? 1 : 0) };
    if (ok) {
      matches.push(lo);
      paint(lo);
      f.push(`${hi >= m ? `Slide: drop '${t[hi - m]}', add '${inc}'. ` : ""}Every count matches need: text[${lo}..${hi}] = "${text.slice(lo, hi + 1)}" is an anagram of the pattern.`, "match");
    } else {
      const off = alphabet.filter((c) => (have.get(c) ?? 0) !== (need.get(c) ?? 0));
      f.push(`${hi >= m ? `Slide: drop '${t[hi - m]}', add '${inc}'. ` : `Window full. `}Counts differ for ${off.map(glyph).join(", ")}: not an anagram.`, "slide");
    }
  }
  paint(Math.max(0, n - m));
  s.text.pointers = {};
  s.vars = { matches };
  f.push(`Done: anagrams start at [${matches.join(", ")}]. Each character enters and leaves the window once, so O(n) with an O(alphabet) count table.`, "done");
  return f.done();
};

// ---------- Reverse words ----------

const reverseWords: G = ({ text }) => {
  const { s, f, resetAll } = make(text);
  const t = [...text];
  const n = t.length;
  if (n === 0) return problem(text, "The text is empty; give a sentence to reverse its words in place.");
  const swap = (i: number, j: number) => {
    const tmp = t[i]!;
    t[i] = t[j]!;
    t[j] = tmp;
    s.text.values = t.map(glyph);
  };
  s.vars = { phase: 1, text };
  f.push("Phase 1: reverse the whole string with two pointers. Words end up in the right order but each one is spelled backwards.", "phase");
  for (let i = 0, j = n - 1; i < j && !f.full; i++, j--) {
    swap(i, j);
    resetAll();
    for (let q = 0; q < i; q++) s.text.tones![q] = "visited";
    for (let q = j + 1; q < n; q++) s.text.tones![q] = "visited";
    s.text.tones![i] = "compare";
    s.text.tones![j] = "compare";
    s.text.pointers = { i, j };
    s.vars = { phase: 1, text: t.join("") };
    f.push(`Swap positions ${i} and ${j} ('${glyph(t[j]!)}' ↔ '${glyph(t[i]!)}'), then move both pointers inward.`, "swap");
  }
  resetAll();
  s.text.pointers = {};
  s.vars = { phase: 2, text: t.join("") };
  f.push(`Whole string reversed: "${t.join("")}". Phase 2: reverse each word individually to fix its spelling.`, "phase");
  let start = 0;
  while (start < n && !f.full) {
    while (start < n && t[start] === " ") start++;
    if (start >= n) break;
    let end = start;
    while (end + 1 < n && t[end + 1] !== " ") end++;
    resetAll();
    for (let q = 0; q < start; q++) s.text.tones![q] = "done";
    for (let q = start; q <= end; q++) s.text.tones![q] = "active";
    s.text.pointers = { start, end };
    f.push(`Word found at [${start}, ${end}]: "${t.slice(start, end + 1).join("")}". Reverse it with the same two-pointer swap.`, "word");
    for (let i = start, j = end; i < j && !f.full; i++, j--) {
      swap(i, j);
      resetAll();
      for (let q = 0; q < start; q++) s.text.tones![q] = "done";
      for (let q = start; q <= end; q++) s.text.tones![q] = "active";
      s.text.tones![i] = "compare";
      s.text.tones![j] = "compare";
      s.text.pointers = { i, j };
      s.vars = { phase: 2, text: t.join("") };
      f.push(`Swap ${i} and ${j} inside the word.`, "swap");
    }
    start = end + 1;
  }
  resetAll();
  s.text.tones!.fill("done");
  s.text.pointers = {};
  s.vars = { result: t.join("") };
  f.push(`Result: "${t.join("")}". Every character is swapped at most twice, so O(n) time and O(1) extra space.`, "done");
  return f.done();
};

// ---------- Run-length encoding ----------

const runLength: G = ({ text }) => {
  const { s, f, resetAll } = make(text);
  const t = [...text];
  const n = t.length;
  if (n === 0) return problem(text, "The text is empty; give a string with repeated characters to see it compressed.");
  const out: string[] = [];
  const outRow: Row = { label: "encoded output", values: [], tones: [] };
  s.aux = [outRow];
  let runStart = 0;
  // A run of length 1 is written as the bare character ("aaabccdddd" -> "a3bc2d4").
  const token = (c: string, count: number) => (count === 1 ? glyph(c) : `${glyph(c)}${count}`);
  f.push("Walk the string with a run pointer: count how long the current character repeats, then emit it once with its count. A run of one is written as the bare character.", "start");
  for (let i = 0; i < n && !f.full; i++) {
    if (i > 0 && t[i] !== t[i - 1]) runStart = i;
    const count = i - runStart + 1;
    const last = i === n - 1 || t[i + 1] !== t[i];
    resetAll();
    for (let q = 0; q < runStart; q++) s.text.tones![q] = "muted";
    for (let q = runStart; q <= i; q++) s.text.tones![q] = "active";
    s.text.tones![i] = "compare";
    s.text.pointers = { run: runStart, i };
    const c = glyph(t[i]!);
    const read = count === 1 ? `text[${i}] = '${c}' starts a new run: count 1.` : `text[${i}] = '${c}' continues the run: count ${count}.`;
    if (last) {
      out.push(token(t[i]!, count));
      outRow.values = [...out];
      outRow.tones = out.map((_, q) => (q === out.length - 1 ? "done" : undefined));
      s.vars = { char: `'${c}'`, count, runs: out.length };
      const why = i + 1 < n ? `text[${i + 1}] = '${glyph(t[i + 1]!)}' differs, so the run ends` : "The text ends, so the run ends";
      f.push(`${read} ${why}: emit "${out[out.length - 1]}"${count === 1 ? " (a run of one is written bare)" : ""}.`, "emit");
    } else {
      s.vars = { char: `'${c}'`, count, runs: out.length };
      f.push(`${read} text[${i + 1}] is '${c}' too, so keep counting.`, "extend");
    }
  }
  resetAll();
  s.text.tones!.fill("muted");
  s.text.pointers = {};
  outRow.tones = out.map(() => "done");
  const encoded = out.join("");
  s.vars = { encoded, "input length": n, "output length": encoded.length, ratio: `${(encoded.length / n).toFixed(2)}` };
  f.push(`Encoded "${text}" as "${encoded}" in one O(n) pass. Compression only pays off when runs are long: ${n} → ${encoded.length} characters here.`, "done");
  return f.done();
};

// ---------- Renderer ----------

function RowView({ row }: { row: Row }) {
  const size = row.size ?? "md";
  const cell = size === "sm" ? 2.25 : 2.75;
  return (
    <div>
      <div className="mb-1 text-[11px] text-muted">{row.label}</div>
      <div style={{ paddingLeft: `${(row.offset ?? 0) * cell}rem` }}>
        <Cells values={row.values} tones={row.tones} pointers={row.pointers} size={size} />
      </div>
    </div>
  );
}

function Renderer({ frame }: RendererProps<StringInput, StringState>) {
  const { state } = frame;
  return (
    <div className="flex flex-col items-start gap-3">
      <RowView row={state.text} />
      {state.pattern && <RowView row={state.pattern} />}
      {state.aux.map((row, i) => (
        <RowView key={`${row.label}-${i}`} row={row} />
      ))}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "compare", label: "comparing" }, { tone: "active", label: "window / box / run" }, { tone: "visited", label: "matched so far" }, { tone: "done", label: "match / final" }, { tone: "danger", label: "mismatch" }, { tone: "muted", label: "excluded" }]} />
    </div>
  );
}

export const stringFamily: Family<StringInput, StringState> = {
  name: "String",
  description: "Pattern matching, palindromes, anagram windows and in-place string transforms.",
  Renderer,
  algorithms: {
    kmp,
    "rabin-karp": rabinKarp,
    "z-algorithm": zAlgorithm,
    "expand-palindrome": expandPalindrome,
    "anagram-window": anagramWindow,
    "reverse-words": reverseWords,
    "run-length": runLength,
  },
  labels: {
    kmp: "KMP: failure table and search",
    "rabin-karp": "Rabin-Karp rolling hash",
    "z-algorithm": "Z-algorithm and the Z-box",
    "expand-palindrome": "Longest palindrome: expand around centre",
    "anagram-window": "Anagram search: sliding window counts",
    "reverse-words": "Reverse words in place",
    "run-length": "Run-length encoding",
  },
  examples: {
    kmp: { text: "abababca", pattern: "abab" },
    "rabin-karp": { text: "abracadabra", pattern: "abra" },
    "z-algorithm": { text: "aabxaab" },
    "expand-palindrome": { text: "babad" },
    "anagram-window": { text: "cbaebabacd", pattern: "abc" },
    "reverse-words": { text: "the quick brown fox" },
    "run-length": { text: "aaabccdddd" },
  },
  normalise: (raw) => {
    const str = (v: unknown, max: number): string | undefined => {
      if (v === undefined || v === null) return undefined;
      const s = Array.isArray(v) ? v.map(String).join("") : String(v);
      return [...s].slice(0, max).join("");
    };
    const text = str(raw.text ?? raw.s ?? raw.string ?? raw.input ?? raw.values, MAX_TEXT) ?? "";
    const pattern = str(raw.pattern ?? raw.p ?? raw.needle ?? raw.target, MAX_PATTERN);
    const num = (v: unknown) => (v === undefined || v === null || !Number.isFinite(Number(v)) ? undefined : Number(v));
    const base = num(raw.base);
    const mod = num(raw.mod);
    return { text, pattern, ...(base !== undefined ? { base } : {}), ...(mod !== undefined ? { mod } : {}) };
  },
};
