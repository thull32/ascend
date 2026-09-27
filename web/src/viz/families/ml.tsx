// Machine-learning and LLM scenarios. State is a set of optional panels
// (scatter plot, loss curve, layered network, heat grid, token rows, bar
// chart, pipeline of boxes, layered graph, tree) that the shared renderer
// draws in order; each generator fills the panels it needs with concrete
// numbers so the notes can say exactly what changed.
import { useId } from "react";
import { Arrow, Box, Circle, Legend, Vars, toneClass, toneFill, toneStroke, type Tone } from "../primitives";
import { Frames, clone, type Family, type RendererProps } from "../engine";
import { cn } from "../../lib/utils";

export interface Pt {
  x: number;
  y: number;
  label?: number;
}

export interface MlInput {
  text?: string;
  points?: Pt[];
  k?: number;
  steps?: number;
  lr?: number;
  temperature?: number;
  topP?: number;
  query?: [number, number] | string;
  target?: number;
  x?: number[];
  [k: string]: unknown;
}

export interface PlotPoint {
  x: number;
  y: number;
  tone?: Tone;
  label?: string;
  shape?: "dot" | "x" | "ring";
}
export interface PlotLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone?: Tone;
  dashed?: boolean;
  label?: string;
}
export interface Plot {
  points: PlotPoint[];
  lines?: PlotLine[];
  xLabel?: string;
  yLabel?: string;
}
export interface Curve {
  label: string;
  values: number[];
}
export interface NetNode {
  name: string;
  value?: string;
  tone?: Tone;
}
export interface Net {
  layers: { name: string; nodes: NetNode[] }[];
  edges: { from: [number, number]; to: [number, number]; label?: string; tone?: Tone }[];
}
export interface Heat {
  title: string;
  rows: string[];
  cols: string[];
  values: (number | null)[][];
  active?: [number, number];
  /** Highlight a whole row. */
  activeRow?: number;
}
export interface TokenRow {
  label: string;
  cells: { text: string; sub?: string; tone?: Tone }[];
}
export interface BarChart {
  label: string;
  items: { label: string; value: number; tone?: Tone; sub?: string }[];
  max?: number;
  format?: (v: number) => string;
}
export interface Pipeline {
  boxes: { id: string; label: string; sub?: string; tone?: Tone }[];
  edges?: { from: string; to: string; label?: string; tone?: Tone; dashed?: boolean }[];
  cols?: number;
}
export interface LayerGraph {
  layers: { name: string; nodes: { id: string; x: number; y: number; tone?: Tone }[]; edges: [string, string][]; edgeTones?: Record<string, Tone> }[];
  query?: { x: number; y: number };
}
export interface TreeDiagram {
  nodes: { id: string; label: string; sub?: string; x: number; y: number; tone?: Tone }[];
  edges: { from: string; to: string; label?: string; tone?: Tone; dashed?: boolean }[];
}

export interface MlState {
  plot?: Plot;
  curve?: Curve;
  net?: Net;
  heat?: Heat;
  tokens?: TokenRow[];
  bars?: { label: string; items: BarChart["items"]; max?: number };
  pipeline?: Pipeline;
  layers?: LayerGraph;
  tree?: TreeDiagram;
  log?: string[];
  vars: Record<string, unknown>;
}

class Ml {
  s: MlState = { vars: {} };
  f = new Frames<MlState>(() => clone(this.s));
  push(note: string, tag?: string): void {
    this.f.push(note, tag);
  }
  set(vars: Record<string, unknown>): void {
    this.s.vars = { ...this.s.vars, ...vars };
  }
  log(line: string): void {
    this.s.log = [...(this.s.log ?? []).slice(-5), line];
  }
}

type G = (input: MlInput) => ReturnType<Frames<MlState>["done"]>;

// ---------- helpers ----------

const r2 = (v: number) => Math.round(v * 100) / 100;
const f2 = (v: number) => (Object.is(r2(v), -0) ? "0.00" : r2(v).toFixed(2));
const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const vec = (xs: number[]) => `(${xs.map(f2).join(", ")})`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};
const clusterTones: Tone[] = ["active", "compare", "done", "danger", "path"];
const hash = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
};
const words = (text: string | undefined, dflt: string, max: number) => {
  const ws = (text ?? "").split(/\s+/).filter(Boolean).slice(0, max);
  return ws.length ? ws : dflt.split(" ");
};
const bbox = (pts: { x: number; y: number }[]) => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

const DEFAULT_LINE: Pt[] = [{ x: 1, y: 1.8 }, { x: 2, y: 3.9 }, { x: 3, y: 6.2 }, { x: 4, y: 8.1 }, { x: 5, y: 9.8 }, { x: 6, y: 12.3 }];
const DEFAULT_CLASSES: Pt[] = [{ x: 1, y: 2, label: 0 }, { x: 2, y: 1, label: 0 }, { x: 2, y: 3, label: 0 }, { x: 3, y: 2.5, label: 0 }, { x: 5, y: 5, label: 1 }, { x: 6, y: 4, label: 1 }, { x: 6, y: 6, label: 1 }, { x: 7, y: 5, label: 1 }];
const DEFAULT_CLUSTERS: Pt[] = [{ x: 1, y: 1 }, { x: 1.5, y: 2 }, { x: 2, y: 1.2 }, { x: 8, y: 8 }, { x: 8.5, y: 9 }, { x: 9, y: 8.2 }, { x: 1, y: 8 }, { x: 1.5, y: 9 }, { x: 2, y: 8.4 }];

/** Ensure every point has a 0/1 label (split on x + y when authors omitted labels). */
function labelled(pts: Pt[]): (Pt & { label: number })[] {
  const m = mean(pts.map((p) => p.x + p.y));
  return pts.map((p) => ({ ...p, label: p.label === undefined ? (p.x + p.y > m ? 1 : 0) : p.label > 0 ? 1 : 0 }));
}

// ---------- regression & classification ----------

const linearRegression: G = ({ points }) => {
  const pts = points && points.length ? points : DEFAULT_LINE;
  const m = new Ml();
  const n = pts.length;
  m.s.plot = { points: pts.map((p) => ({ x: p.x, y: p.y })), xLabel: "x", yLabel: "y" };
  m.push(`${n} observation${n !== 1 ? "s" : ""} (x, y). Goal: the line ŷ = w·x + b that minimises the mean squared error — ordinary least squares, which has a closed form.`);
  if (n < 2) {
    m.push(`A line needs at least two points; with ${n} the slope is undefined. Add more points.`, "error");
    return m.f.done();
  }
  const bb = bbox(pts);
  const xm = mean(pts.map((p) => p.x));
  const ym = mean(pts.map((p) => p.y));
  m.s.plot.lines = [{ x1: xm, y1: bb.y0, x2: xm, y2: bb.y1, dashed: true, tone: "muted", label: "x̄" }, { x1: bb.x0, y1: ym, x2: bb.x1, y2: ym, dashed: true, tone: "muted", label: "ȳ" }];
  m.set({ "x̄": f2(xm), "ȳ": f2(ym) });
  m.push(`Centre the data: x̄ = ${f2(xm)}, ȳ = ${f2(ym)}. The least-squares line always passes through (x̄, ȳ).`, "means");
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - xm) * (p.y - ym);
    sxx += (p.x - xm) ** 2;
  }
  m.set({ Sxy: f2(sxy), Sxx: f2(sxx) });
  m.push(`Sxy = Σ(x−x̄)(y−ȳ) = ${f2(sxy)} measures how x and y move together; Sxx = Σ(x−x̄)² = ${f2(sxx)} is the spread of x.`, "sums");
  if (sxx < 1e-9) {
    m.push(`All x values are equal, so Sxx = 0 and the slope is undefined (a vertical line). The data needs variation in x.`, "error");
    return m.f.done();
  }
  const w = sxy / sxx;
  const b = ym - w * xm;
  const lineAt = (x: number) => w * x + b;
  m.s.plot.lines = [{ x1: bb.x0, y1: lineAt(bb.x0), x2: bb.x1, y2: lineAt(bb.x1), tone: "active", label: "ŷ" }];
  m.set({ w: f2(w), b: f2(b) });
  m.push(`Slope w = Sxy / Sxx = ${f2(w)}; intercept b = ȳ − w·x̄ = ${f2(b)}. Fitted line: ŷ = ${f2(w)}·x ${b < 0 ? "−" : "+"} ${f2(Math.abs(b))}.`, "fit");
  let sse = 0;
  let sst = 0;
  for (const p of pts) {
    sse += (p.y - lineAt(p.x)) ** 2;
    sst += (p.y - ym) ** 2;
    m.s.plot.lines.push({ x1: p.x, y1: p.y, x2: p.x, y2: lineAt(p.x), tone: "danger", dashed: true });
  }
  const p0 = pts[0]!;
  m.set({ MSE: f2(sse / n), "R²": sst > 0 ? f2(1 - sse / sst) : "n/a" });
  m.push(`Residuals y − ŷ (red): at x = ${f1(p0.x)}, ${f2(p0.y)} − ${f2(lineAt(p0.x))} = ${f2(p0.y - lineAt(p0.x))}. MSE = ${f2(sse / n)}; R² = ${sst > 0 ? f2(1 - sse / sst) : "n/a"} of the variance is explained.`, "residuals");
  const xq = bb.x1 + 1;
  m.s.plot.lines = [{ x1: bb.x0, y1: lineAt(bb.x0), x2: xq, y2: lineAt(xq), tone: "active", label: "ŷ" }];
  m.s.plot.points.push({ x: xq, y: lineAt(xq), tone: "done", shape: "ring", label: "ŷ" });
  m.push(`Predict at x = ${f1(xq)}: ŷ = ${f2(w)}·${f1(xq)} + ${f2(b)} = ${f2(lineAt(xq))}. The closed form is O(n) here; with many features solve (XᵀX)w = Xᵀy, or use gradient descent when XᵀX is too big to invert.`, "done");
  return m.f.done();
};

const gradientDescent: G = ({ points, steps, lr }) => {
  const pts = points && points.length ? points : DEFAULT_LINE;
  const S = clampInt(steps, 1, 40, 8);
  const m = new Ml();
  const n = pts.length;
  const mx2 = mean(pts.map((p) => p.x * p.x));
  const eta = lr !== undefined && Number.isFinite(lr) && lr > 0 ? lr : 0.15 / Math.max(1, mx2);
  let w = 0;
  let b = 0;
  const bb = bbox(pts);
  const lossOf = (ww: number, bbias: number) => mean(pts.map((p) => (ww * p.x + bbias - p.y) ** 2));
  const setLine = (prev?: [number, number]) => {
    m.s.plot = {
      points: pts.map((p) => ({ x: p.x, y: p.y })),
      xLabel: "x",
      yLabel: "y",
      lines: [...(prev ? [{ x1: bb.x0, y1: prev[0] * bb.x0 + prev[1], x2: bb.x1, y2: prev[0] * bb.x1 + prev[1], tone: "muted" as Tone, dashed: true }] : []), { x1: bb.x0, y1: w * bb.x0 + b, x2: bb.x1, y2: w * bb.x1 + b, tone: "active", label: "ŷ" }],
    };
  };
  setLine();
  let loss = lossOf(w, b);
  m.s.curve = { label: "loss (MSE) after each step", values: [loss] };
  m.set({ step: 0, w: f2(w), b: f2(b), η: eta.toFixed(4), loss: f2(loss) });
  m.push(`Start at w = 0, b = 0 (a flat line). Loss L = mean (ŷ − y)² = ${f2(loss)}. Gradient descent: w ← w − η·∂L/∂w, b ← b − η·∂L/∂b with learning rate η = ${eta.toFixed(4)}.`);
  for (let s = 1; s <= S; s++) {
    let dw = 0;
    let db = 0;
    for (const p of pts) {
      const err = w * p.x + b - p.y;
      dw += (2 / n) * err * p.x;
      db += (2 / n) * err;
    }
    const nw = w - eta * dw;
    const nb = b - eta * db;
    const nl = lossOf(nw, nb);
    const prev: [number, number] = [w, b];
    const oldLoss = loss;
    w = nw;
    b = nb;
    loss = nl;
    setLine(prev);
    m.s.curve!.values.push(loss);
    m.set({ step: s, w: f2(w), b: f2(b), loss: f2(loss) });
    if (!Number.isFinite(loss) || loss > 1e9) {
      m.push(`Step ${s}: loss exploded to ${loss.toExponential(1)} — η is too large, each step overshoots the minimum and lands further up the other side. Reduce η.`, "diverge");
      return m.f.done();
    }
    m.push(`Step ${s}: ∂L/∂w = ${f2(dw)}, ∂L/∂b = ${f2(db)} → w ${f2(prev[0])} → ${f2(w)}, b ${f2(prev[1])} → ${f2(b)}; loss ${f2(oldLoss)} → ${f2(loss)}.`, "step");
    if (m.f.full) return m.f.done();
  }
  const xm = mean(pts.map((p) => p.x));
  const ym = mean(pts.map((p) => p.y));
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += (p.x - xm) * (p.y - ym);
    sxx += (p.x - xm) ** 2;
  }
  const wStar = sxx > 0 ? sxy / sxx : w;
  const bStar = ym - wStar * xm;
  m.set({ "w*": f2(wStar), "b*": f2(bStar), "loss*": f2(lossOf(wStar, bStar)) });
  m.push(`After ${S} steps: w = ${f2(w)}, b = ${f2(b)}, loss ${f2(m.s.curve!.values[0]!)} → ${f2(loss)}; the exact optimum is w* = ${f2(wStar)}, b* = ${f2(bStar)}. Each step costs O(n·d). Too large an η diverges, too small crawls — which is why optimisers like Adam adapt it per parameter.`, "done");
  return m.f.done();
};

const logisticRegression: G = ({ points, steps, lr }) => {
  const pts = labelled(points && points.length ? points : DEFAULT_CLASSES);
  const S = clampInt(steps, 1, 40, 10);
  const eta = lr !== undefined && Number.isFinite(lr) && lr > 0 ? lr : 0.5;
  const m = new Ml();
  const n = pts.length;
  let w1 = 0;
  let w2 = 0;
  let b = 0;
  const bb = bbox(pts);
  const prob = (p: Pt) => sigmoid(w1 * p.x + w2 * p.y + b);
  const lossOf = () => mean(pts.map((p) => -(p.label! * Math.log(Math.max(1e-9, prob(p))) + (1 - p.label!) * Math.log(Math.max(1e-9, 1 - prob(p))))));
  const acc = () => pts.filter((p) => (prob(p) >= 0.5 ? 1 : 0) === p.label).length;
  const draw = () => {
    const lines: PlotLine[] = [];
    if (Math.abs(w2) > 1e-6) {
      const yAt = (x: number) => -(w1 * x + b) / w2;
      lines.push({ x1: bb.x0 - 1, y1: yAt(bb.x0 - 1), x2: bb.x1 + 1, y2: yAt(bb.x1 + 1), tone: "active", label: "p = 0.5" });
    } else if (Math.abs(w1) > 1e-6) {
      const x = -b / w1;
      lines.push({ x1: x, y1: bb.y0 - 1, x2: x, y2: bb.y1 + 1, tone: "active", label: "p = 0.5" });
    }
    m.s.plot = { points: pts.map((p) => ({ x: p.x, y: p.y, tone: p.label === 1 ? "active" : "compare" })), lines, xLabel: "x₁", yLabel: "x₂" };
  };
  draw();
  let loss = lossOf();
  m.s.curve = { label: "cross-entropy loss per step", values: [loss] };
  m.set({ step: 0, w: vec([w1, w2]), b: f2(b), loss: f2(loss), accuracy: `${acc()}/${n}` });
  m.push(`Two classes (blue = 1, amber = 0). Model: p(y = 1 | x) = σ(w·x + b) with σ(z) = 1/(1 + e^−z). Loss = mean −[y ln p + (1−y) ln(1−p)]. At w = 0 every p is 0.5, so loss = ln 2 = ${f2(loss)} and there is no boundary yet.`);
  for (let s = 1; s <= S; s++) {
    let g1 = 0;
    let g2 = 0;
    let gb = 0;
    for (const p of pts) {
      const e = prob(p) - p.label!;
      g1 += (e * p.x) / n;
      g2 += (e * p.y) / n;
      gb += e / n;
    }
    const old = [w1, w2, b, loss] as const;
    w1 -= eta * g1;
    w2 -= eta * g2;
    b -= eta * gb;
    loss = lossOf();
    draw();
    m.s.curve!.values.push(loss);
    m.set({ step: s, w: vec([w1, w2]), b: f2(b), loss: f2(loss), accuracy: `${acc()}/${n}` });
    m.push(`Step ${s}: gradient = mean (p − y)·x = (${f2(g1)}, ${f2(g2)}), ∂L/∂b = ${f2(gb)} → w = (${f2(old[0])}, ${f2(old[1])}) → (${f2(w1)}, ${f2(w2)}), b = ${f2(b)}; loss ${f2(old[3])} → ${f2(loss)}; accuracy ${acc()}/${n}.`, "step");
    if (m.f.full) return m.f.done();
  }
  m.push(`The boundary is the line w·x + b = 0 where p = 0.5; distance from it scales confidence. The loss is convex, so gradient descent reaches the global optimum — but on separable data |w| keeps growing (loss → 0 only at infinity), which is why L2 regularisation is standard.`, "done");
  return m.f.done();
};

// ---------- neural network ----------

const W1: number[][] = [[0.5, -0.4], [0.3, 0.8], [-0.6, 0.2]];
const B1 = [0.1, -0.2, 0.05];
const W2 = [0.7, -0.5, 0.9];
const B2 = 0.1;

function buildNet(x: number[], w1: number[][], b1: number[], w2: number[], showValues: boolean): { net: Net; z: number[]; a: number[]; zo: number; yhat: number } {
  const z = w1.map((row, j) => row[0]! * x[0]! + row[1]! * x[1]! + b1[j]!);
  const a = z.map((v) => Math.max(0, v));
  const zo = a.reduce((acc, v, j) => acc + v * w2[j]!, B2);
  const yhat = sigmoid(zo);
  const net: Net = {
    layers: [
      { name: "input", nodes: x.map((v, i) => ({ name: `x${i + 1}`, value: f2(v), tone: "visited" })) },
      { name: "hidden (ReLU)", nodes: z.map((_, j) => ({ name: `h${j + 1}`, value: showValues ? f2(a[j]!) : "?" })) },
      { name: "output (σ)", nodes: [{ name: "ŷ", value: showValues ? f2(yhat) : "?" }] },
    ],
    edges: [...w1.flatMap((row, j) => row.map((wv, i) => ({ from: [0, i] as [number, number], to: [1, j] as [number, number], label: f2(wv) }))), ...w2.map((wv, j) => ({ from: [1, j] as [number, number], to: [2, 0] as [number, number], label: f2(wv) }))],
  };
  return { net, z, a, zo, yhat };
}

const inputVec = (input: MlInput): number[] => {
  const raw = Array.isArray(input.x) && input.x.length >= 2 ? input.x.slice(0, 2).map(Number) : input.points && input.points[0] ? [input.points[0].x, input.points[0].y] : [1.0, 0.5];
  return raw.every((v) => Number.isFinite(v)) ? raw : [1.0, 0.5];
};

const neuralNetForward: G = (input) => {
  const x = inputVec(input);
  const m = new Ml();
  const { net, z, a, zo, yhat } = buildNet(x, W1, B1, W2, false);
  m.s.net = net;
  m.set({ x: vec(x), "b₁": vec(B1), "b₂": f2(B2) });
  m.push(`A 2 → 3 → 1 network. Input x = ${vec(x)}; the number on each edge is its weight, biases are in the readout. Each hidden unit computes z = w·x + b, then a = ReLU(z) = max(0, z).`);
  for (let j = 0; j < 3; j++) {
    const n = net.layers[1]!.nodes[j]!;
    n.value = f2(a[j]!);
    n.tone = a[j]! > 0 ? "active" : "danger";
    net.edges.forEach((e) => {
      e.tone = e.to[0] === 1 && e.to[1] === j ? "active" : e.to[0] === 1 && e.to[1] < j ? "visited" : undefined;
    });
    const row = W1[j]!;
    m.push(`h${j + 1}: z = ${f2(row[0]!)}·${f2(x[0]!)} + (${f2(row[1]!)})·${f2(x[1]!)} + ${f2(B1[j]!)} = ${f2(z[j]!)} → ReLU → ${f2(a[j]!)}${a[j]! === 0 ? " (the unit is off: negative z is clipped to 0)" : ""}.`, "hidden");
  }
  net.layers[1]!.nodes.forEach((n) => (n.tone = "visited"));
  net.edges.forEach((e) => (e.tone = e.from[0] === 1 ? "active" : "visited"));
  const out = net.layers[2]!.nodes[0]!;
  out.value = f2(yhat);
  out.tone = "done";
  m.set({ z_out: f2(zo), "ŷ": f2(yhat) });
  m.push(`Output: z = ${a.map((v, j) => `${f2(W2[j]!)}·${f2(v)}`).join(" + ")} + ${f2(B2)} = ${f2(zo)}; ŷ = σ(${f2(zo)}) = 1/(1 + e^${f2(-zo)}) = ${f2(yhat)}.`, "output");
  m.push(`Prediction ŷ = ${f2(yhat)} is the probability of class 1. The forward pass is two matrix multiplies (2×3 and 3×1) plus non-linearities; without the ReLU the whole network would collapse into a single linear map, however many layers it had.`, "done");
  return m.f.done();
};

const backprop: G = (input) => {
  const x = inputVec(input);
  const y = input.target !== undefined && Number.isFinite(Number(input.target)) ? (Number(input.target) > 0 ? 1 : 0) : 1;
  const eta = input.lr !== undefined && Number.isFinite(input.lr) && input.lr > 0 ? input.lr : 0.5;
  const m = new Ml();
  const fwd = buildNet(x, W1, B1, W2, true);
  const net = fwd.net;
  m.s.net = net;
  const bce = (p: number) => -(y * Math.log(Math.max(1e-9, p)) + (1 - y) * Math.log(Math.max(1e-9, 1 - p)));
  const loss = bce(fwd.yhat);
  m.set({ x: vec(x), y, "ŷ": f2(fwd.yhat), loss: f2(loss), η: eta });
  m.push(`Forward pass (see neural-net-forward): hidden activations a = ${vec(fwd.a)}, ŷ = ${f2(fwd.yhat)}; target y = ${y}. Cross-entropy loss L = −[y ln ŷ + (1−y) ln(1−ŷ)] = ${f2(loss)}. Backprop computes ∂L/∂w for every weight, output first.`);
  const dOut = fwd.yhat - y;
  net.layers[2]!.nodes[0]!.value = `δ ${f2(dOut)}`;
  net.layers[2]!.nodes[0]!.tone = "danger";
  m.set({ "δ_out": f2(dOut) });
  m.push(`Output error: with sigmoid + cross-entropy the derivative simplifies to δ_out = ∂L/∂z_out = ŷ − y = ${f2(fwd.yhat)} − ${y} = ${f2(dOut)}.`, "delta");
  const gW2 = fwd.a.map((av) => dOut * av);
  net.edges.forEach((e) => {
    if (e.from[0] === 1) {
      e.label = `∂ ${f2(gW2[e.from[1]]!)}`;
      e.tone = "danger";
    }
  });
  m.push(`Gradient of each output weight = δ_out × the activation feeding it: ∂L/∂w₂ = ${vec(gW2)}; ∂L/∂b₂ = δ_out = ${f2(dOut)}. A unit that was off (a = 0) contributes no gradient to its weight.`, "grad");
  const dH = fwd.z.map((zv, j) => (zv > 0 ? dOut * W2[j]! : 0));
  net.layers[1]!.nodes.forEach((n, j) => {
    n.value = `δ ${f2(dH[j]!)}`;
    n.tone = dH[j] === 0 ? "muted" : "danger";
  });
  m.set({ "δ_h": vec(dH) });
  m.push(`Backpropagate through W₂ and the ReLU gate: δ_h = δ_out·w₂ ⊙ [z > 0] = ${vec(dH)}.${dH.some((d) => d === 0) ? ` h${dH.findIndex((d) => d === 0) + 1} had z ≤ 0, so its gate is closed and δ = 0: no gradient flows through a dead ReLU.` : ""}`, "delta");
  const gW1 = W1.map((row, j) => row.map((_, i) => dH[j]! * x[i]!));
  net.edges.forEach((e) => {
    if (e.from[0] === 0) {
      e.label = `∂ ${f2(gW1[e.to[1]]![e.from[1]]!)}`;
      e.tone = "danger";
    }
  });
  m.push(`Gradient of each first-layer weight = δ_h × its input: ∂L/∂w₁ = [${gW1.map(vec).join(", ")}]; ∂L/∂b₁ = δ_h. Every gradient is a local derivative times the error arriving from above — the chain rule, applied layer by layer.`, "grad");
  const nW1 = W1.map((row, j) => row.map((wv, i) => wv - eta * gW1[j]![i]!));
  const nB1 = B1.map((bv, j) => bv - eta * dH[j]!);
  const nW2 = W2.map((wv, j) => wv - eta * gW2[j]!);
  const after = buildNet(x, nW1, nB1, nW2, true);
  m.s.net = after.net;
  after.net.edges.forEach((e) => (e.tone = "done"));
  m.set({ "w₂": `${vec(W2)} → ${vec(nW2)}` });
  m.push(`Update every parameter: w ← w − η·∂L/∂w with η = ${eta}. For example w₂[1] ${f2(W2[0]!)} → ${f2(nW2[0]!)} and w₁[1,1] ${f2(W1[0]![0]!)} → ${f2(nW1[0]![0]!)}.`, "update");
  const newLoss = bce(after.yhat);
  m.set({ "ŷ after": f2(after.yhat), "loss after": f2(newLoss) });
  m.push(`Re-run the forward pass: ŷ ${f2(fwd.yhat)} → ${f2(after.yhat)}, loss ${f2(loss)} → ${f2(newLoss)} — one step moved the prediction toward y = ${y}. Backprop costs about 2× a forward pass; autograd frameworks build this chain automatically for millions of parameters.`, "done");
  return m.f.done();
};

// ---------- trees and clustering ----------

const decisionTree: G = ({ points }) => {
  const rows = labelled(points && points.length ? points : DEFAULT_CLASSES);
  const m = new Ml();
  const gini = (rs: Pt[]) => {
    if (rs.length === 0) return 0;
    const p1 = rs.filter((r) => r.label === 1).length / rs.length;
    return 1 - p1 * p1 - (1 - p1) * (1 - p1);
  };
  const tree: TreeDiagram = { nodes: [], edges: [] };
  m.s.tree = tree;
  const bb = bbox(rows);
  const basePlot = (): Plot => ({ points: rows.map((r) => ({ x: r.x, y: r.y, tone: r.label === 1 ? "active" : "compare" })), lines: [], xLabel: "x₁", yLabel: "x₂" });
  m.s.plot = basePlot();
  const kept: PlotLine[] = [];
  m.push(`${rows.length} labelled points. A decision tree splits the space with axis-aligned thresholds, greedily choosing the split that makes the children purest. Purity is measured with Gini impurity 1 − Σ p_c²: 0 for a pure node, 0.5 for a 50/50 mix.`);
  const positions: Record<string, [number, number]> = { r: [50, 14], rL: [26, 52], rR: [74, 52], rLL: [12, 90], rLR: [38, 90], rRL: [62, 90], rRR: [88, 90] };
  type Region = { x0: number; x1: number; y0: number; y1: number };
  const build = (rs: (Pt & { label: number })[], id: string, depth: number, region: Region, parent?: string, edgeLabel?: string) => {
    if (m.f.full) return;
    const g = gini(rs);
    const n1 = rs.filter((r) => r.label === 1).length;
    const majority = n1 * 2 >= rs.length ? 1 : 0;
    const pos = positions[id] ?? [50, 50];
    const leaf = (why: string) => {
      tree.nodes.push({ id, label: `class ${majority}`, sub: `n=${rs.length} · gini ${f2(g)}`, x: pos[0], y: pos[1], tone: majority === 1 ? "active" : "compare" });
      if (parent) tree.edges.push({ from: parent, to: id, label: edgeLabel });
      m.s.plot = { ...basePlot(), lines: [...kept] };
      m.push(`Leaf: ${why} → predict class ${majority} (${n1} of ${rs.length} are class 1).`, "leaf");
    };
    if (g === 0) return leaf(`all ${rs.length} points here are class ${majority}, gini 0`);
    if (depth >= 2) return leaf(`maximum depth reached with gini ${f2(g)}`);
    if (rs.length < 2) return leaf(`only ${rs.length} point left`);
    let best: { feat: "x" | "y"; thr: number; score: number; left: typeof rs; right: typeof rs } | undefined;
    for (const feat of ["x", "y"] as const) {
      const vals = [...new Set(rs.map((r) => r[feat]))].sort((a, b) => a - b);
      let bestF: typeof best;
      for (let i = 0; i + 1 < vals.length; i++) {
        const thr = (vals[i]! + vals[i + 1]!) / 2;
        const left = rs.filter((r) => r[feat] <= thr);
        const right = rs.filter((r) => r[feat] > thr);
        const score = (left.length * gini(left) + right.length * gini(right)) / rs.length;
        if (!bestF || score < bestF.score) bestF = { feat, thr, score, left, right };
      }
      if (!bestF) continue;
      const line: PlotLine = bestF.feat === "x" ? { x1: bestF.thr, y1: region.y0, x2: bestF.thr, y2: region.y1, tone: "compare", dashed: true } : { x1: region.x0, y1: bestF.thr, x2: region.x1, y2: bestF.thr, tone: "compare", dashed: true };
      m.s.plot = { ...basePlot(), lines: [...kept, line] };
      m.push(`Node ${id === "r" ? "root" : id.slice(1)} (n=${rs.length}, gini ${f2(g)}): best threshold on ${feat === "x" ? "x₁" : "x₂"} is ${feat === "x" ? "x₁" : "x₂"} ≤ ${f2(bestF.thr)} → left n=${bestF.left.length} gini ${f2(gini(bestF.left))}, right n=${bestF.right.length} gini ${f2(gini(bestF.right))}; weighted ${f2(bestF.score)}.`, "candidate");
      if (!best || bestF.score < best.score) best = bestF;
    }
    if (!best) return leaf(`no split possible`);
    const featName = best.feat === "x" ? "x₁" : "x₂";
    const line: PlotLine = best.feat === "x" ? { x1: best.thr, y1: region.y0, x2: best.thr, y2: region.y1, tone: "active", label: `${featName} ≤ ${f2(best.thr)}` } : { x1: region.x0, y1: best.thr, x2: region.x1, y2: best.thr, tone: "active", label: `${featName} ≤ ${f2(best.thr)}` };
    kept.push(line);
    tree.nodes.push({ id, label: `${featName} ≤ ${f2(best.thr)}`, sub: `n=${rs.length} · gini ${f2(g)}`, x: pos[0], y: pos[1], tone: "path" });
    if (parent) tree.edges.push({ from: parent, to: id, label: edgeLabel });
    m.s.plot = { ...basePlot(), lines: [...kept] };
    m.push(`Choose ${featName} ≤ ${f2(best.thr)} (weighted gini ${f2(best.score)}): impurity drops from ${f2(g)} to ${f2(best.score)}, a gain of ${f2(g - best.score)}. Recurse into each side.`, "split");
    const lRegion: Region = best.feat === "x" ? { ...region, x1: best.thr } : { ...region, y1: best.thr };
    const rRegion: Region = best.feat === "x" ? { ...region, x0: best.thr } : { ...region, y0: best.thr };
    build(best.left, id + "L", depth + 1, lRegion, id, "yes");
    build(best.right, id + "R", depth + 1, rRegion, id, "no");
  };
  build(rows, "r", 0, { x0: bb.x0 - 0.5, x1: bb.x1 + 0.5, y0: bb.y0 - 0.5, y1: bb.y1 + 0.5 });
  m.set({ depth: 2, "leaves": tree.nodes.filter((n) => n.label.startsWith("class")).length });
  m.push(`Greedy, top-down, no backtracking: each node costs O(d·n log n) to scan thresholds. Depth controls overfitting (a deep tree memorises noise); random forests and gradient boosting average many such trees to fix that.`, "done");
  return m.f.done();
};

const kMeans: G = ({ points, k }) => {
  const pts = points && points.length ? points : DEFAULT_CLUSTERS;
  const K = clampInt(k, 1, Math.min(5, pts.length), Math.min(3, pts.length));
  const m = new Ml();
  const n = pts.length;
  let centroids = Array.from({ length: K }, (_, i) => ({ x: pts[Math.floor((i * n) / K)]!.x, y: pts[Math.floor((i * n) / K)]!.y }));
  let assign = pts.map(() => -1);
  const draw = () => {
    m.s.plot = { points: [...pts.map((p, i) => ({ x: p.x, y: p.y, tone: assign[i]! < 0 ? ("muted" as Tone) : clusterTones[assign[i]!]! })), ...centroids.map((c, j) => ({ x: c.x, y: c.y, tone: clusterTones[j]!, shape: "x" as const, label: `C${j + 1}` }))], xLabel: "x", yLabel: "y" };
  };
  draw();
  m.set({ k: K, n });
  m.push(`${n} unlabelled points, k = ${K}. Initialise the ${K} centroids (×) at chosen data points — real code uses k-means++ to spread them out. Then repeat: assign each point to its nearest centroid, move each centroid to the mean of its points.`);
  let it = 0;
  for (it = 1; it <= 8 && !m.f.full; it++) {
    let changed = 0;
    const example = pts[0]!;
    const dists = centroids.map((c) => dist(example, c));
    assign = pts.map((p, i) => {
      let bestJ = 0;
      for (let j = 1; j < K; j++) if (dist(p, centroids[j]!) < dist(p, centroids[bestJ]!)) bestJ = j;
      if (bestJ !== assign[i]) changed++;
      return bestJ;
    });
    draw();
    m.set({ iteration: it, "assignments changed": changed });
    m.push(`Iteration ${it} — assign: point (${f1(example.x)}, ${f1(example.y)}) is ${dists.map((d, j) => `${f2(d)} from C${j + 1}`).join(", ")} → cluster ${assign[0]! + 1}. ${changed} assignment${changed !== 1 ? "s" : ""} changed.`, "assign");
    if (changed === 0 && it > 1) {
      m.push(`No assignment changed, so the centroids will not move either: converged.`, "converged");
      break;
    }
    const moved = centroids.map((c, j) => {
      const mine = pts.filter((_, i) => assign[i] === j);
      return mine.length ? { x: mean(mine.map((p) => p.x)), y: mean(mine.map((p) => p.y)) } : c;
    });
    const shifts = moved.map((c, j) => dist(c, centroids[j]!));
    const big = shifts.indexOf(Math.max(...shifts));
    const from = centroids[big]!;
    centroids = moved;
    draw();
    m.set({ "max centroid shift": f2(shifts[big]!) });
    m.push(`Iteration ${it} — update: C${big + 1} moves to the mean of its points, (${f2(from.x)}, ${f2(from.y)}) → (${f2(moved[big]!.x)}, ${f2(moved[big]!.y)}), a shift of ${f2(shifts[big]!)}.`, "update");
    if (Math.max(...shifts) < 1e-9) {
      m.push(`Centroids did not move: converged.`, "converged");
      break;
    }
  }
  const inertia = pts.reduce((acc, p, i) => acc + dist(p, centroids[assign[i]!]!) ** 2, 0);
  m.set({ inertia: f2(inertia), iterations: Math.min(it, 8) });
  m.push(`Inertia (sum of squared distances to the assigned centroid) = ${f2(inertia)}. Each iteration is O(n·k·d); the result depends on initialisation, so run several seeds and keep the lowest inertia, and pick k with the elbow or silhouette method.`, "done");
  return m.f.done();
};

const knn: G = ({ points, k, query }) => {
  const pts = labelled(points && points.length ? points : DEFAULT_CLASSES);
  const K = clampInt(k, 1, pts.length, Math.min(3, pts.length));
  const q = Array.isArray(query) && query.length >= 2 && Number.isFinite(Number(query[0])) && Number.isFinite(Number(query[1])) ? { x: Number(query[0]), y: Number(query[1]) } : { x: 4, y: 3.5 };
  const m = new Ml();
  const base = (): PlotPoint[] => [...pts.map((p) => ({ x: p.x, y: p.y, tone: p.label === 1 ? ("active" as Tone) : ("compare" as Tone) })), { x: q.x, y: q.y, shape: "ring", tone: "danger", label: "q" }];
  m.s.plot = { points: base(), xLabel: "x₁", yLabel: "x₂" };
  m.set({ k: K, query: `(${f1(q.x)}, ${f1(q.y)})` });
  m.push(`Query q = (${f1(q.x)}, ${f1(q.y)}) (red ring), ${pts.length} labelled points (blue = 1, amber = 0). k-NN has no training step: it stores the data and, at query time, lets the k = ${K} nearest neighbours vote.`);
  const ranked = pts.map((p, i) => ({ p, i, d: dist(p, q) })).sort((a, b) => a.d - b.d);
  m.set({ "nearest distances": ranked.slice(0, Math.min(5, ranked.length)).map((r) => f2(r.d)).join(", ") });
  m.push(`Compute the Euclidean distance from q to all ${pts.length} points — O(n·d) per query. Nearest is (${f1(ranked[0]!.p.x)}, ${f1(ranked[0]!.p.y)}) at ${f2(ranked[0]!.d)}${ranked[1] ? `, then (${f1(ranked[1].p.x)}, ${f1(ranked[1].p.y)}) at ${f2(ranked[1].d)}` : ""}.`, "distances");
  const top = ranked.slice(0, K);
  m.s.plot = { points: base().map((pp, i) => (i < pts.length && !top.some((t) => t.i === i) ? { ...pp, tone: "muted" as Tone } : pp)), lines: top.map((t) => ({ x1: q.x, y1: q.y, x2: t.p.x, y2: t.p.y, tone: t.p.label === 1 ? "active" : "compare", label: f2(t.d) })), xLabel: "x₁", yLabel: "x₂" };
  m.push(`The ${K} nearest: ${top.map((t) => `(${f1(t.p.x)}, ${f1(t.p.y)}) class ${t.p.label} at ${f2(t.d)}`).join("; ")}.`, "neighbours");
  const c1 = top.filter((t) => t.p.label === 1).length;
  const c0 = K - c1;
  const pred = c1 > c0 ? 1 : c0 > c1 ? 0 : top[0]!.p.label;
  m.s.plot.points[pts.length] = { x: q.x, y: q.y, shape: "ring", tone: pred === 1 ? "active" : "compare", label: `q → ${pred}` };
  m.set({ votes: `class 1: ${c1}, class 0: ${c0}`, prediction: pred });
  m.push(`Vote: class 1 gets ${c1}, class 0 gets ${c0} → predict ${pred}${c1 === c0 ? " (tie broken by the single nearest neighbour)" : ""}. Weighting votes by 1/distance is a common refinement.`, "vote");
  m.push(`Use odd k to avoid ties and scale features first (a feature with range 0–1000 would dominate the distance). Brute force is O(n) per query; use a KD-tree at low dimension or an HNSW index at high dimension.`, "done");
  return m.f.done();
};

// ---------- embeddings, tokens, attention ----------

const VOCAB: Record<string, number[]> = {
  king: [0.9, 0.8, 0.1, 0.1],
  queen: [0.9, 0.1, 0.8, 0.1],
  man: [0.2, 0.9, 0.1, 0.1],
  woman: [0.2, 0.1, 0.9, 0.1],
  prince: [0.8, 0.7, 0.2, 0.1],
  apple: [0.1, 0.1, 0.1, 0.9],
  banana: [0.1, 0.1, 0.05, 0.85],
  bread: [0.05, 0.1, 0.1, 0.8],
};
const DIMS = ["royal", "male", "female", "food"];

const embeddingsSimilarity: G = ({ text }) => {
  const asked = (text ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w in VOCAB);
  const ws = [...new Set(asked.length >= 2 ? asked : ["king", "queen", "man", "woman", "apple"])].slice(0, 6);
  const m = new Ml();
  const V = ws.map((w) => VOCAB[w]!);
  const norm = (v: number[]) => Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  const dot = (a: number[], b: number[]) => a.reduce((acc, v, i) => acc + v * b[i]!, 0);
  const cos = (a: number[], b: number[]) => dot(a, b) / (norm(a) * norm(b));
  m.s.tokens = ws.map((w, i) => ({ label: w, cells: V[i]!.map((v, d) => ({ text: f2(v), sub: DIMS[d] })) }));
  m.push(`Each word is a vector — 4 dimensions here, 768–4096 in real models. Real dimensions are learned and unnamed; these are labelled royal / male / female / food so the geometry is visible.`);
  m.set(Object.fromEntries(ws.map((w, i) => [`‖${w}‖`, f2(norm(V[i]!))])));
  m.push(`Vector length ‖v‖ = √Σvᵢ²: ${ws.map((w, i) => `${w} ${f2(norm(V[i]!))}`).join(", ")}. Similarity should ignore length and compare direction, so we use cosine: cos(a, b) = a·b / (‖a‖‖b‖).`, "norms");
  const heat: Heat = { title: "cosine similarity", rows: ws, cols: ws, values: ws.map(() => ws.map(() => null)) };
  m.s.heat = heat;
  for (let i = 0; i < ws.length && !m.f.full; i++) {
    let bestJ = -1;
    for (let j = 0; j < ws.length; j++) {
      heat.values[i]![j] = cos(V[i]!, V[j]!);
      if (j !== i && (bestJ < 0 || heat.values[i]![j]! > heat.values[i]![bestJ]!)) bestJ = j;
    }
    heat.activeRow = i;
    heat.active = bestJ >= 0 ? [i, bestJ] : undefined;
    const ex = ws[(i + 1) % ws.length]!;
    m.push(`Row "${ws[i]}": cos(${ws[i]}, ${ex}) = ${f2(dot(V[i]!, V[(i + 1) % ws.length]!))} / (${f2(norm(V[i]!))} × ${f2(norm(V[(i + 1) % ws.length]!))}) = ${f2(heat.values[i]![(i + 1) % ws.length]!)}${bestJ >= 0 ? `; its nearest neighbour is "${ws[bestJ]}" (${f2(heat.values[i]![bestJ]!)})` : ""}.`, "cosine");
  }
  heat.activeRow = undefined;
  heat.active = undefined;
  const has = (w: string) => ws.includes(w);
  if (has("king") && has("man") && has("woman")) {
    const v = VOCAB.king!.map((kv, d) => kv - VOCAB.man![d]! + VOCAB.woman![d]!);
    const cands = Object.entries(VOCAB).filter(([w]) => !["king", "man", "woman"].includes(w));
    const best = cands.map(([w, u]) => ({ w, c: cos(v, u) })).sort((a, b) => b.c - a.c)[0]!;
    m.s.tokens = [...m.s.tokens, { label: "king − man + woman", cells: v.map((x, d) => ({ text: f2(x), sub: DIMS[d], tone: "done" })) }];
    m.set({ analogy: `→ ${best.w} (cos ${f2(best.c)})` });
    m.push(`Analogy by arithmetic: king − man + woman = ${vec(v)}; the nearest vocabulary vector is "${best.w}" (cos ${f2(best.c)}). Directions in the space encode relations, not just similarity.`, "analogy");
  }
  m.push(`This is the whole of semantic search and RAG retrieval: embed the query, compare with stored vectors, return the top-k by cosine. Normalise every vector once and cosine becomes a plain dot product.`, "done");
  return m.f.done();
};

const tokenization: G = ({ text }) => {
  const raw = (text && text.trim() ? text : "low lower lowest").slice(0, 60);
  const wordsIn = raw.split(/\s+/).filter(Boolean);
  const m = new Ml();
  let seqs = wordsIn.map((w) => ["▁", ...w]);
  const vocab: string[] = [...new Set(seqs.flat())];
  const nChars = seqs.reduce((a, s) => a + s.length, 0);
  const rows = (highlight?: string): TokenRow[] => [{ label: "tokens", cells: seqs.flatMap((s) => s.map((t) => ({ text: t, tone: highlight !== undefined && t === highlight ? ("done" as Tone) : t === "▁" ? ("muted" as Tone) : undefined }))) }];
  m.s.tokens = rows();
  m.set({ text: `"${raw}"`, tokens: nChars, vocabulary: vocab.length });
  m.push(`Byte-pair encoding starts from single characters (▁ marks a word start): "${raw}" is ${nChars} symbols. Training repeatedly merges the most frequent adjacent pair into a new token.`);
  for (let merge = 1; merge <= 10 && !m.f.full; merge++) {
    const counts = new Map<string, number>();
    for (const s of seqs) for (let i = 0; i + 1 < s.length; i++) counts.set(`${s[i]}\u0000${s[i + 1]}`, (counts.get(`${s[i]}\u0000${s[i + 1]}`) ?? 0) + 1);
    let best: [string, number] | undefined;
    for (const [pair, c] of counts) if (!best || c > best[1]) best = [pair, c];
    if (!best || best[1] < 2) {
      m.push(`No adjacent pair occurs more than once, so training stops after ${merge - 1} merge${merge - 1 !== 1 ? "s" : ""}.`, "stop");
      break;
    }
    const [a, b] = best[0].split("\u0000") as [string, string];
    const tok = a + b;
    seqs = seqs.map((s) => {
      const out: string[] = [];
      for (let i = 0; i < s.length; i++) {
        if (s[i] === a && s[i + 1] === b) {
          out.push(tok);
          i++;
        } else out.push(s[i]!);
      }
      return out;
    });
    vocab.push(tok);
    m.s.tokens = rows(tok);
    m.set({ tokens: seqs.reduce((x, s) => x + s.length, 0), vocabulary: vocab.length, "last merge": `"${a}" + "${b}" → "${tok}" (×${best[1]})` });
    m.push(`Merge ${merge}: the most frequent pair is ("${a}", "${b}") with ${best[1]} occurrences → new token "${tok}". Vocabulary ${vocab.length}, sequence now ${seqs.reduce((x, s) => x + s.length, 0)} tokens.`, "merge");
  }
  m.s.tokens = [{ label: "token ids", cells: seqs.flatMap((s) => s.map((t) => ({ text: t, sub: String(vocab.indexOf(t)), tone: "active" as Tone }))) }];
  const finalCount = seqs.reduce((x, s) => x + s.length, 0);
  m.set({ tokens: finalCount, compression: `${nChars} → ${finalCount}` });
  m.push(`Encode: each token becomes its vocabulary id, ${nChars} characters → ${finalCount} tokens. Production tokenizers learn 50k–200k merges over terabytes of text: common words become one token, rare words split into several — so cost, context limits and "why does it miscount letters" are all about tokens, not words.`, "done");
  return m.f.done();
};

const KNOWN_EMB: Record<string, [number, number]> = { the: [0.2, 0.9], cat: [0.8, 0.3], sat: [0.5, -0.6], down: [-0.7, 0.4] };
const embed2 = (w: string): [number, number] => {
  const k = KNOWN_EMB[w.toLowerCase()];
  if (k) return k;
  const h = hash(w.toLowerCase());
  return [((h % 19) - 9) / 10, (((h >>> 5) % 19) - 9) / 10];
};
const WQ = [[0.9, 0.1], [-0.2, 1.0]];
const WK = [[1.0, -0.3], [0.4, 0.8]];
const WV = [[0.5, 0.5], [-0.5, 1.0]];
const mat2 = (M: number[][], v: [number, number]): [number, number] => [M[0]![0]! * v[0] + M[0]![1]! * v[1], M[1]![0]! * v[0] + M[1]![1]! * v[1]];
const softmax = (xs: number[]) => {
  const mx = Math.max(...xs.filter((x) => Number.isFinite(x)));
  const ex = xs.map((x) => (Number.isFinite(x) ? Math.exp(x - mx) : 0));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / s);
};

const attention: G = ({ text }) => {
  const ws = words(text, "the cat sat down", 4);
  const m = new Ml();
  const E = ws.map(embed2);
  const Q = E.map((e) => mat2(WQ, e));
  const K = E.map((e) => mat2(WK, e));
  const V = E.map((e) => mat2(WV, e));
  const n = ws.length;
  const sqrtD = Math.SQRT2;
  m.s.tokens = [{ label: "embedding e", cells: ws.map((w, i) => ({ text: w, sub: vec(E[i]!) })) }];
  m.push(`${n} tokens, each with a 2-d embedding (real models: 768–8192 dims). Self-attention lets every token gather information from the others, weighted by relevance.`);
  m.s.tokens = [
    { label: "q = W_q·e", cells: ws.map((w, i) => ({ text: w, sub: vec(Q[i]!), tone: "active" })) },
    { label: "k = W_k·e", cells: ws.map((w, i) => ({ text: w, sub: vec(K[i]!), tone: "compare" })) },
    { label: "v = W_v·e", cells: ws.map((w, i) => ({ text: w, sub: vec(V[i]!), tone: "done" })) },
  ];
  m.push(`Three learned projections turn each embedding into a query ("what am I looking for"), a key ("what do I offer") and a value ("what I pass on"): q = W_q·e, k = W_k·e, v = W_v·e. For "${ws[0]}": q = ${vec(Q[0]!)}, k = ${vec(K[0]!)}.`, "project");
  const heat: Heat = { title: "attention weights (row attends to column)", rows: ws, cols: ws, values: ws.map(() => ws.map(() => null)) };
  m.s.heat = heat;
  const weights: number[][] = [];
  for (let i = 0; i < n && !m.f.full; i++) {
    const scores = K.map((k) => (Q[i]![0] * k[0] + Q[i]![1] * k[1]) / sqrtD);
    heat.values[i] = scores.map((s) => s);
    heat.activeRow = i;
    heat.active = undefined;
    m.push(`Row "${ws[i]}": scores = q·k / √d = ${vec(scores)} — e.g. q(${ws[i]})·k(${ws[(i + 1) % n]}) / 1.41 = ${f2(scores[(i + 1) % n]!)}. Dividing by √d stops dot products growing with dimension and saturating the softmax.`, "scores");
    const w = softmax(scores);
    weights.push(w);
    heat.values[i] = w;
    const top = w.indexOf(Math.max(...w));
    heat.active = [i, top];
    m.push(`softmax turns the scores into weights that sum to 1: ${vec(w)}. "${ws[i]}" attends most to "${ws[top]}" (${f2(w[top]!)}).`, "softmax");
  }
  heat.activeRow = undefined;
  heat.active = undefined;
  const out = weights.map((w) => [w.reduce((a, wj, j) => a + wj * V[j]![0], 0), w.reduce((a, wj, j) => a + wj * V[j]![1], 0)]);
  m.s.tokens = [...m.s.tokens, { label: "out = Σ w·v", cells: ws.map((w, i) => ({ text: w, sub: vec(out[i]!), tone: "path" })) }];
  m.push(`Each output is the weighted sum of the values: out("${ws[0]}") = ${weights[0]!.map((w, j) => `${f2(w)}·v(${ws[j]})`).join(" + ")} = ${vec(out[0]!)}. The token now carries context from the whole sequence.`, "output");
  if (n > 1) {
    const causal = ws.map((_, i) => {
      const scores = K.map((k, j) => (j > i ? -Infinity : (Q[i]![0] * k[0] + Q[i]![1] * k[1]) / sqrtD));
      return softmax(scores).map((w, j) => (j > i ? null : w));
    });
    m.s.heat = { title: "causal (masked) attention", rows: ws, cols: ws, values: causal, activeRow: 1 };
    m.push(`A decoder masks future positions (score = −∞ before softmax): "${ws[1]}" may only attend to "${ws[0]}" and itself, ${vec(causal[1]!.slice(0, 2).map((v) => v ?? 0))}. That is what makes next-token prediction well-posed during training.`, "mask");
  }
  m.set({ tokens: n, "scores per head": `${n}² = ${n * n}`, "at 4k context": "16.8M per head per layer" });
  m.push(`Cost is n² scores per head per layer (${n}² = ${n * n} here, 4096² ≈ 16.8M at a 4k context): the reason for KV caches, FlashAttention and sparse/linear variants. Multi-head attention runs several of these in parallel with different W_q, W_k, W_v.`, "done");
  return m.f.done();
};

const transformerBlock: G = ({ text }) => {
  const ws = words(text, "the cat sat", 3);
  const tok = ws[Math.min(1, ws.length - 1)]!;
  const m = new Ml();
  const boxes: Pipeline["boxes"] = [
    { id: "emb", label: "token + position" },
    { id: "ln1", label: "LayerNorm" },
    { id: "attn", label: "self-attention" },
    { id: "res1", label: "+ residual" },
    { id: "ln2", label: "LayerNorm" },
    { id: "mlp", label: "MLP (4× wide)" },
    { id: "res2", label: "+ residual" },
    { id: "out", label: "→ next block" },
  ];
  m.s.pipeline = { boxes, cols: 4 };
  const stage = (id: string) => {
    boxes.forEach((b) => (b.tone = b.id === id ? "active" : boxes.findIndex((x) => x.id === b.id) < boxes.findIndex((x) => x.id === id) ? "visited" : undefined));
  };
  const show = (label: string, v: number[], tone?: Tone) => {
    m.s.tokens = [...(m.s.tokens ?? []).slice(-2), { label, cells: v.map((x, i) => ({ text: f2(x), sub: `d${i + 1}`, tone })) }];
  };
  const e = [0.6, -0.4, 0.3, 0.2];
  const p = [0.2, 0.1, 0.2, -0.1];
  const x0 = e.map((v, i) => v + p[i]!);
  stage("emb");
  show(`x("${tok}") = e + pos`, x0, "active");
  m.set({ token: tok, d_model: 4 });
  m.push(`Follow one token, "${tok}", through one transformer block with d = 4 (GPT-2 small uses 768). Its input is the token embedding plus a position embedding: e = ${vec(e)} + pos = ${vec(p)} → x = ${vec(x0)}.`, "embed");
  const ln = (v: number[]) => {
    const mu = mean(v);
    const sd = Math.sqrt(mean(v.map((x) => (x - mu) ** 2)) + 1e-5);
    return { out: v.map((x) => (x - mu) / sd), mu, sd };
  };
  const l1 = ln(x0);
  stage("ln1");
  show("LayerNorm(x)", l1.out);
  m.push(`LayerNorm: subtract the mean (${f2(l1.mu)}) and divide by the standard deviation (${f2(l1.sd)}) across the 4 features → ${vec(l1.out)}. It keeps activations on a stable scale so deep stacks train.`, "norm");
  const ctx = [0.1, 0.5, -0.2, 0.3];
  const att = l1.out.map((v, i) => 0.6 * v + 0.4 * ctx[i]!);
  stage("attn");
  show("attention output", att, "compare");
  m.push(`Self-attention mixes in other positions (weights from the attention viz): 0.6 × itself + 0.4 × the context vector ${vec(ctx)} from the other tokens → ${vec(att)}. This is the only place tokens exchange information.`, "attention");
  const x1 = x0.map((v, i) => v + att[i]!);
  stage("res1");
  show("x + attention", x1, "active");
  m.push(`Residual connection: add the attention output to the original x → ${vec(x1)}. The block only has to learn a correction, and gradients have a direct path back through the sum.`, "residual");
  const l2 = ln(x1);
  stage("ln2");
  show("LayerNorm(x)", l2.out);
  m.push(`Second LayerNorm (mean ${f2(l2.mu)}, sd ${f2(l2.sd)}) → ${vec(l2.out)}.`, "norm");
  const hidden = Array.from({ length: 16 }, (_, h) => Math.max(0, l2.out.reduce((acc, v, i) => acc + v * (((hash(`w1-${h}-${i}`) % 200) - 100) / 100), 0)));
  const mlp = Array.from({ length: 4 }, (_, i) => hidden.reduce((acc, v, h) => acc + v * (((hash(`w2-${i}-${h}`) % 200) - 100) / 250), 0));
  stage("mlp");
  show("MLP output", mlp, "compare");
  m.set({ "MLP hidden": 16, "active hidden units": hidden.filter((v) => v > 0).length });
  m.push(`MLP: expand to 4×d = 16 units with ReLU (${hidden.filter((v) => v > 0).length} fire), then project back to 4 → ${vec(mlp)}. It runs per position, no mixing — this is where most parameters (and, by most accounts, most "knowledge") live.`, "mlp");
  const x2 = x1.map((v, i) => v + mlp[i]!);
  stage("res2");
  show("x + MLP", x2, "active");
  m.push(`Residual again: ${vec(x1)} + ${vec(mlp)} → ${vec(x2)}. The token leaves the block as a 4-vector in the same space it entered, ready for the next block.`, "residual");
  stage("out");
  m.set({ "params per block": "≈ 12·d² (4d² attention + 8d² MLP)", "GPT-2 small": "12 blocks, d = 768, 12 heads", "70B-class": "≈ 80 blocks, d = 8192" });
  m.push(`One block = attention (move information between positions) + MLP (transform each position) with residuals and LayerNorms around them. Stack N of these, then a final linear layer over the vocabulary gives next-token logits.`, "done");
  return m.f.done();
};

const nextTokenSampling: G = ({ text, temperature, topP }) => {
  const ctx = text && text.trim() ? text.trim().slice(0, 60) : "The capital of France is";
  const T = temperature !== undefined && Number.isFinite(temperature) && temperature > 0 ? Math.min(5, temperature) : 0.8;
  const P = topP !== undefined && Number.isFinite(topP) && topP > 0 && topP <= 1 ? topP : 0.9;
  const m = new Ml();
  const cands = [" Paris", " a", " the", " Lyon", " not", " famous"];
  const logits = [6.1, 4.0, 3.6, 3.1, 2.5, 2.2];
  m.s.bars = { label: "logits (top 6 of 50k)", items: cands.map((c, i) => ({ label: c, value: logits[i]!, sub: f1(logits[i]!) })), max: Math.max(...logits) };
  m.set({ context: `"${ctx}"`, T, "top-p": P });
  m.push(`Context: "${ctx}". The model's last layer outputs one logit (an unnormalised score) per vocabulary token; here the top 6 of ~50,000.`);
  const p1 = softmax(logits);
  m.s.bars = { label: "softmax probabilities (T = 1)", items: cands.map((c, i) => ({ label: c, value: p1[i]!, sub: f2(p1[i]!) })), max: 1 };
  m.push(`softmax: pᵢ = e^{zᵢ} / Σⱼ e^{zⱼ} → "${cands[0]}" ${f2(p1[0]!)}, "${cands[1]}" ${f2(p1[1]!)}, "${cands[2]}" ${f2(p1[2]!)}, … Greedy decoding (argmax) would always pick "${cands[0]}".`, "softmax");
  const pT = softmax(logits.map((z) => z / T));
  m.s.bars = { label: `softmax(z / T), T = ${T}`, items: cands.map((c, i) => ({ label: c, value: pT[i]!, sub: `${f2(p1[i]!)} → ${f2(pT[i]!)}`, tone: "compare" })), max: 1 };
  m.push(`Temperature ${T}: divide the logits by T before softmax. ${T < 1 ? "T < 1 sharpens the distribution" : T > 1 ? "T > 1 flattens it" : "T = 1 leaves it unchanged"}: "${cands[0]}" ${f2(p1[0]!)} → ${f2(pT[0]!)}, "${cands[5]}" ${f2(p1[5]!)} → ${f2(pT[5]!)}. As T → 0 this becomes argmax; large T approaches uniform.`, "temperature");
  const order = pT.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
  let cum = 0;
  const kept: number[] = [];
  for (const o of order) {
    kept.push(o.i);
    cum += o.p;
    if (cum >= P - 1e-12) break;
  }
  const mass = kept.reduce((a, i) => a + pT[i]!, 0);
  const pN = pT.map((p, i) => (kept.includes(i) ? p / mass : 0));
  m.s.bars = { label: `top-p = ${P}: keep the nucleus, renormalise`, items: order.map((o) => ({ label: cands[o.i]!, value: pN[o.i]!, sub: kept.includes(o.i) ? f2(pN[o.i]!) : "dropped", tone: kept.includes(o.i) ? "active" : "muted" })), max: 1 };
  m.set({ nucleus: kept.map((i) => `"${cands[i]}"`).join(", "), "mass kept": f2(mass) });
  m.push(`Top-p (nucleus) ${P}: sort by probability and keep the smallest prefix whose mass reaches ${P} — ${kept.length} token${kept.length !== 1 ? "s" : ""} (${f2(mass)}); the tail is dropped and the rest renormalised. This removes the long tail of unlikely tokens that pure temperature sampling would occasionally pick.`, "top-p");
  const u = ((hash(ctx) % 1000) / 1000) * 0.999 + 0.0005;
  let acc = 0;
  let pick = kept[kept.length - 1]!;
  const walk: string[] = [];
  for (const i of kept) {
    acc += pN[i]!;
    walk.push(`${f2(acc)}`);
    if (u <= acc) {
      pick = i;
      break;
    }
  }
  m.s.bars = { label: "sampled", items: order.map((o) => ({ label: cands[o.i]!, value: pN[o.i]!, sub: o.i === pick ? "← sampled" : kept.includes(o.i) ? f2(pN[o.i]!) : "dropped", tone: o.i === pick ? "done" : kept.includes(o.i) ? "active" : "muted" })), max: 1 };
  m.set({ u: f2(u), "next token": `"${cands[pick]}"` });
  m.push(`Draw u = ${f2(u)} uniformly in [0, 1) and walk the cumulative distribution (${walk.join(" → ")}): u falls in "${cands[pick]}", which becomes the next token. Append it to the context and repeat for the token after.`, "sample");
  m.push(`Same model, different knobs: T = 0 is deterministic and repetitive; T ≈ 0.7–1 with top-p ≈ 0.9 is the usual balance; high T invents. Sampling is also why "hallucinations" happen — a plausible-looking low-probability token is still sometimes drawn.`, "done");
  return m.f.done();
};

// ---------- LLM systems pipelines ----------

const kvCache: G = ({ text }) => {
  const prompt = words(text, "The cat sat", 5);
  const gen = ["on", "the", "mat"];
  const m = new Ml();
  const seq = [...prompt];
  const cells = (kind: "seq" | "cache", upto: number, active?: number): TokenRow["cells"] => seq.slice(0, upto).map((t, i) => ({ text: t, tone: i === active ? "active" : kind === "cache" ? "done" : i < prompt.length ? "visited" : "path", sub: kind === "cache" ? `k${i + 1},v${i + 1}` : undefined }));
  let withCache = 0;
  let without = 0;
  const p = prompt.length;
  withCache += p;
  without += p;
  m.s.tokens = [{ label: "sequence", cells: cells("seq", p) }, { label: "K/V cache (per layer)", cells: cells("cache", p) }];
  m.set({ "prompt tokens": p, "K/V pairs computed (cached)": withCache, "K/V pairs computed (no cache)": without });
  m.push(`Prefill: one forward pass over the ${p} prompt tokens computes each token's key and value vectors in every layer and stores them: ${p} K/V pairs. Attention needs K and V of every earlier token for every new token — the cache means computing them once.`, "prefill");
  for (let s = 0; s < gen.length && !m.f.full; s++) {
    seq.push(gen[s]!);
    const len = seq.length;
    withCache += 1;
    without += len;
    m.s.tokens = [{ label: "sequence", cells: cells("seq", len, len - 1) }, { label: "K/V cache (per layer)", cells: cells("cache", len, len - 1) }];
    m.set({ "K/V pairs computed (cached)": withCache, "K/V pairs computed (no cache)": without, "attention span": len });
    m.push(`Decode step ${s + 1}: only the new token "${gen[s]}" runs through the layers (1 new K/V pair, appended), then attends over all ${len} cached pairs. Without the cache we would recompute K and V for all ${len} tokens: ${without} pairs so far versus ${withCache} with the cache.`, "decode");
  }
  const n = seq.length;
  m.set({ "cost without cache": `Σ = O(n²), ${without} for n = ${n}`, "cost with cache": `O(n), ${withCache}`, "cache per token (Llama-2-7B, fp16)": "2 × 32 layers × 4096 × 2 B ≈ 0.5 MB" });
  m.push(`Generation is O(n) instead of O(n²) in K/V work, at the price of memory: 2 × layers × d × bytes per token — about 0.5 MB per token for a 7B model in fp16, so a 4k-token sequence holds ≈ 2 GB. That memory, not compute, limits batch size; paged attention (vLLM) manages it like virtual memory.`, "done");
  return m.f.done();
};

const ragPipeline: G = ({ text, k }) => {
  const q = text && text.trim() ? text.trim().slice(0, 80) : "What is the refund window?";
  const K = clampInt(k, 1, 4, 2);
  const m = new Ml();
  const boxes: Pipeline["boxes"] = [
    { id: "q", label: "user query" },
    { id: "emb", label: "embed query" },
    { id: "idx", label: "vector index" },
    { id: "top", label: `top-${K} chunks` },
    { id: "prompt", label: "assemble prompt" },
    { id: "llm", label: "LLM" },
    { id: "ans", label: "answer + citations" },
  ];
  m.s.pipeline = { boxes, cols: 4 };
  const stage = (id: string, sub?: string) => {
    const at = boxes.findIndex((b) => b.id === id);
    boxes.forEach((b, i) => {
      b.tone = i === at ? "active" : i < at ? "visited" : undefined;
      if (i === at && sub) b.sub = sub;
    });
  };
  const chunks = [
    { id: "policy.md#3", text: "Refunds accepted within 30 days of delivery", sim: 0.91 },
    { id: "returns.md#1", text: "Return address and RMA process", sim: 0.63 },
    { id: "warranty.md#2", text: "Two-year limited warranty", sim: 0.55 },
    { id: "shipping.md#4", text: "Standard shipping takes 3–5 days", sim: 0.42 },
  ];
  stage("q", `"${q.length > 22 ? q.slice(0, 21) + "…" : q}"`);
  m.set({ query: `"${q}"`, "k": K });
  m.push(`Retrieval-augmented generation: instead of hoping the model memorised your documents, fetch the relevant passages at query time and put them in the prompt. Query: "${q}".`);
  const qv = [0.82, -0.31, 0.44];
  stage("emb", vec(qv).slice(0, 16) + "…");
  m.push(`Embed the query with the same embedding model used to index the documents → a vector like ${vec(qv)}… (1536 dims in practice). Same model on both sides, or the spaces do not line up.`, "embed");
  stage("idx", "12,400 chunks");
  m.s.bars = { label: "cosine similarity to query", items: chunks.map((c) => ({ label: c.id, value: c.sim, sub: f2(c.sim) })), max: 1 };
  m.push(`Search the vector index (HNSW over 12,400 chunks, each ~300 tokens with overlap) for nearest neighbours by cosine: ${chunks.map((c) => `${c.id} ${f2(c.sim)}`).join(", ")}.`, "search");
  const top = chunks.slice(0, K);
  stage("top", top.map((c) => c.id).join(", "));
  m.s.bars = { label: "cosine similarity to query", items: chunks.map((c, i) => ({ label: c.id, value: c.sim, sub: i < K ? `${f2(c.sim)} ✓` : f2(c.sim), tone: i < K ? "done" : "muted" })), max: 1 };
  m.push(`Keep the top-${K}: ${top.map((c) => `${c.id} ("${c.text}")`).join("; ")}. A reranker (cross-encoder) often re-scores these candidates for precision.`, "top-k");
  const promptTokens = 60 + top.length * 80 + Math.ceil(q.length / 4);
  stage("prompt", `≈ ${promptTokens} tokens`);
  m.s.tokens = [{ label: "prompt", cells: [{ text: "system: answer from the context, cite sources", tone: "muted" }, ...top.map((c) => ({ text: `[${c.id}] ${c.text}`, tone: "done" as Tone })), { text: `user: ${q}`, tone: "active" }] }];
  m.push(`Assemble the prompt: instructions + the retrieved chunks with their ids + the question, ≈ ${promptTokens} tokens. The chunks are data, not instructions — say so in the system prompt to blunt prompt injection hidden in documents.`, "prompt");
  stage("llm", "grounded generation");
  m.push(`The LLM answers from the context it was given rather than from memory, so it can be up to date and can point at sources.`, "generate");
  stage("ans", "cites policy.md#3");
  m.log(`"Refunds are accepted within 30 days of delivery [policy.md#3]."`);
  m.set({ "retrieval latency": "~20 ms", "LLM latency": "~1–2 s", "evaluate": "retrieval recall@k + answer faithfulness" });
  m.push(`Answer: "Refunds are accepted within 30 days of delivery [policy.md#3]." Most RAG failures are retrieval failures — measure recall@k on a labelled set before tuning the prompt, and re-index when documents change.`, "done");
  return m.f.done();
};

const agentLoop: G = ({ text }) => {
  const task = text && text.trim() ? text.trim().slice(0, 80) : "How many open PRs are older than 7 days?";
  const m = new Ml();
  const boxes: Pipeline["boxes"] = [
    { id: "user", label: "user task" },
    { id: "llm", label: "LLM decides" },
    { id: "tool", label: "tool runs" },
    { id: "obs", label: "observation" },
    { id: "done", label: "final answer" },
  ];
  m.s.pipeline = { boxes, cols: 5, edges: [{ from: "user", to: "llm" }, { from: "llm", to: "tool" }, { from: "tool", to: "obs" }, { from: "obs", to: "llm", label: "loop", dashed: true }, { from: "llm", to: "done" }] };
  const stage = (id: string, sub?: string) => boxes.forEach((b) => {
    b.tone = b.id === id ? "active" : b.tone === "active" ? "visited" : b.tone;
    if (b.id === id) b.sub = sub;
  });
  let iter = 0;
  let tokens = 0;
  const maxIter = 6;
  stage("user", task.length > 22 ? task.slice(0, 21) + "…" : task);
  m.set({ task: `"${task}"`, iteration: iter, "max iterations": maxIter, "tokens used": tokens });
  m.push(`An agent is an LLM in a loop: read the task and the history, decide on a tool call or a final answer, run the tool, append the result, repeat. Tools: list_prs(state), today(). Task: "${task}".`);
  const step = (thought: string, call: string, result: string, cost: number) => {
    iter++;
    tokens += cost;
    stage("llm", call);
    m.set({ iteration: iter, "tokens used": tokens });
    m.log(`assistant: ${thought} → ${call}`);
    m.push(`Iteration ${iter}: the model reads the transcript and decides. ${thought} It emits a structured tool call: ${call}. Prompt so far ≈ ${tokens} tokens.`, "decide");
    stage("tool", call.split("(")[0]);
    m.push(`The harness — not the model — executes ${call}. Tool results are the agent's only contact with reality; validate arguments and sandbox side effects here.`, "act");
    stage("obs", result.length > 22 ? result.slice(0, 21) + "…" : result);
    m.log(`tool: ${result}`);
    m.push(`Observation appended to the transcript: ${result}. Everything in the transcript is context for the next decision, so a verbose tool output costs tokens on every later iteration.`, "observe");
  };
  step(`It needs the list first.`, `list_prs(state="open")`, `12 PRs with created_at dates`, 340);
  step(`"Older than 7 days" needs today's date.`, `today()`, `2026-09-26`, 410);
  iter++;
  tokens += 460;
  stage("llm", "answer");
  stage("done", "4 PRs");
  boxes.find((b) => b.id === "done")!.tone = "done";
  m.set({ iteration: iter, "tokens used": tokens });
  m.log(`assistant: 4 open PRs are older than 7 days: #412, #418, #421, #430.`);
  m.push(`Iteration ${iter}: with the dates and today in context the model computes the answer itself and stops: "4 open PRs are older than 7 days: #412, #418, #421, #430." No tool call means the loop ends.`, "answer");
  m.push(`Loop guards matter: an iteration cap (${maxIter}), a token budget, timeouts on tools, and human confirmation for irreversible actions. Total: ${iter} LLM calls, 2 tool calls, ≈ ${tokens} prompt tokens — cost grows roughly quadratically with loop length because the transcript is resent each time.`, "done");
  return m.f.done();
};

const fineTuning: G = ({ steps }) => {
  const epochs = clampInt(steps, 1, 6, 3);
  const m = new Ml();
  const boxes: Pipeline["boxes"] = [
    { id: "base", label: "base model", sub: "7B, frozen" },
    { id: "data", label: "SFT dataset", sub: "prompt → response" },
    { id: "fwd", label: "forward" },
    { id: "loss", label: "loss" },
    { id: "bwd", label: "backward" },
    { id: "upd", label: "update adapters" },
  ];
  m.s.pipeline = { boxes, cols: 3 };
  const stage = (id: string) => {
    const at = boxes.findIndex((b) => b.id === id);
    boxes.forEach((b, i) => (b.tone = i === at ? "active" : i < at ? "visited" : undefined));
  };
  stage("base");
  m.set({ "full fine-tune": "6.7B trainable params, ~80 GB optimizer state", "LoRA r=8": "4.2M trainable (0.06%), ~16 GB total" });
  m.push(`Fine-tuning adapts a pretrained model to a task with a small labelled dataset. Full fine-tuning updates all 6.7B weights (and needs optimizer state for each); LoRA freezes them and trains low-rank adapters A·B (r = 8) on the attention matrices — 4.2M parameters, 0.06%.`);
  stage("data");
  m.s.tokens = [{ label: "one training example", cells: [{ text: "### Instruction: Summarise the ticket", tone: "muted" }, { text: "### Response: Customer cannot log in after…", tone: "active" }] }];
  m.push(`Supervised fine-tuning data: ~2,000 prompt/response pairs. The loss is computed only on the response tokens (prompt tokens are masked), so the model learns to answer, not to write prompts.`, "data");
  const losses = [2.31, 1.42, 0.98, 0.81, 0.74, 0.71];
  const evalLoss = [2.28, 1.51, 1.12, 1.06, 1.09, 1.15];
  m.s.curve = { label: "training loss per epoch", values: [losses[0]!] };
  for (let e = 1; e <= epochs && !m.f.full; e++) {
    stage("fwd");
    m.push(`Epoch ${e}, forward: run each batch through the frozen base plus the adapters, get next-token logits for the response.`, "forward");
    stage("loss");
    m.set({ epoch: e, "train loss": f2(losses[Math.min(e, losses.length - 1)]!), "eval loss": f2(evalLoss[Math.min(e, evalLoss.length - 1)]!) });
    m.push(`Cross-entropy on the response tokens: ${f2(losses[e - 1]!)} → ${f2(losses[Math.min(e, losses.length - 1)]!) } this epoch (eval ${f2(evalLoss[Math.min(e, evalLoss.length - 1)]!)}).`, "loss");
    stage("bwd");
    m.push(`Backward: gradients flow through the frozen weights but are only stored for the adapters, so memory stays small.`, "backward");
    stage("upd");
    m.s.curve.values.push(losses[Math.min(e, losses.length - 1)]!);
    m.push(`AdamW updates the 4.2M adapter weights with learning rate 2e-4 (full fine-tunes use ~1e-5 — a tenth). ${e >= 3 && evalLoss[Math.min(e, evalLoss.length - 1)]! > evalLoss[Math.min(e - 1, evalLoss.length - 1)]! ? "Eval loss is rising while train loss falls: the model is starting to memorise the 2,000 examples — stop here." : ""}`, "update");
  }
  m.set({ "merge for serving": "W + A·B, zero inference overhead" });
  m.push(`Train loss ${f2(losses[0]!)} → ${f2(losses[Math.min(epochs, losses.length - 1)]!)} in ${epochs} epoch${epochs > 1 ? "s" : ""}. Watch eval loss, not train loss. Merge A·B into W for serving. Fine-tune for format, style and narrow skills; use RAG for facts that change.`, "done");
  return m.f.done();
};

const rlhf: G = () => {
  const m = new Ml();
  const boxes: Pipeline["boxes"] = [
    { id: "sft", label: "SFT model" },
    { id: "sample", label: "sample 2 answers" },
    { id: "human", label: "human prefers" },
    { id: "rm", label: "reward model" },
    { id: "ppo", label: "PPO update" },
    { id: "policy", label: "aligned policy" },
  ];
  m.s.pipeline = { boxes, cols: 3, edges: [{ from: "sft", to: "sample" }, { from: "sample", to: "human" }, { from: "human", to: "rm" }, { from: "rm", to: "ppo" }, { from: "ppo", to: "policy" }, { from: "policy", to: "sample", label: "repeat", dashed: true }] };
  const stage = (id: string, sub?: string) => boxes.forEach((b) => {
    b.tone = b.id === id ? "active" : b.tone === "active" ? "visited" : b.tone;
    if (b.id === id) b.sub = sub;
  });
  stage("sft");
  m.push(`Reinforcement learning from human feedback. Start from a supervised fine-tuned model that can follow instructions but has no sense of which of two acceptable answers people prefer.`);
  stage("sample", "A and B");
  m.s.tokens = [{ label: "prompt", cells: [{ text: "Explain recursion to a 10-year-old", tone: "muted" }] }, { label: "A", cells: [{ text: "Recursion is when a function calls itself, like Russian dolls…", tone: "active" }] }, { label: "B", cells: [{ text: "Recursion: f(n) = f(n−1) + … (formal definition)", tone: "compare" }] }];
  m.push(`Sample two answers to the same prompt from the SFT model.`, "sample");
  stage("human", "A ≻ B");
  m.push(`A labeller picks the better one: A ≻ B (age-appropriate). Comparisons are far more consistent across people than absolute scores, so the data is pairwise.`, "label");
  const rA = 1.8;
  const rB = 0.6;
  const rmLoss = -Math.log(sigmoid(rA - rB));
  stage("rm", `r(A) ${f1(rA)}, r(B) ${f1(rB)}`);
  m.s.bars = { label: "reward model scores", items: [{ label: "A", value: rA, sub: f1(rA), tone: "active" }, { label: "B", value: rB, sub: f1(rB), tone: "compare" }], max: 3 };
  m.set({ "RM loss": `−ln σ(r_A − r_B) = −ln σ(${f1(rA - rB)}) = ${f2(rmLoss)}` });
  m.push(`Train a reward model on ~100k comparisons with the Bradley–Terry loss −ln σ(r_A − r_B): it learns to score A above B. Here r(A) = ${f1(rA)}, r(B) = ${f1(rB)}, loss ${f2(rmLoss)}. The RM is a proxy for human judgement — and can be gamed.`, "reward");
  const kl = 0.12;
  const beta = 0.1;
  stage("ppo", `r − β·KL`);
  m.set({ reward: f1(rA), KL: f2(kl), β: beta, objective: `${f1(rA)} − ${beta}·${f2(kl)} = ${f2(rA - beta * kl)}` });
  m.push(`PPO: the policy generates, the RM scores, and the policy is nudged toward higher reward while a KL penalty keeps it near the SFT model: objective = r − β·KL = ${f1(rA)} − ${beta}·${f2(kl)} = ${f2(rA - beta * kl)}. Without the penalty the policy drifts to gibberish that the RM happens to like (reward hacking).`, "ppo");
  stage("policy", "iterate");
  m.s.bars = { label: "after training: preference win-rate vs SFT", items: [{ label: "RLHF policy", value: 0.68, sub: "68%", tone: "done" }, { label: "SFT", value: 0.32, sub: "32%", tone: "muted" }], max: 1 };
  m.push(`Repeat sampling → scoring → updating. The aligned policy wins 68% of blind comparisons against the SFT model. DPO reaches a similar result without an explicit reward model by optimising the preference pairs directly; constitutional AI replaces some human labels with model-written critiques.`, "done");
  return m.f.done();
};

const speculativeDecoding: G = ({ k, text }) => {
  const K = clampInt(k, 2, 6, 4);
  const ctx = words(text, "The quick brown", 4);
  const m = new Ml();
  const seq = [...ctx];
  const rounds: { draft: string[]; accept: boolean[]; fix?: string }[] = [
    { draft: ["fox", "jumps", "over", "a", "small", "log"].slice(0, K), accept: [true, true, true, false, true, true].slice(0, K), fix: "the" },
    { draft: ["lazy", "dog", ".", "It", "was", "late"].slice(0, K), accept: [true, true, true, true, true, true].slice(0, K) },
  ];
  let targetPasses = 0;
  let produced = 0;
  const seqRow = (extra: TokenRow["cells"] = []): TokenRow => ({ label: "sequence", cells: [...seq.map((t) => ({ text: t, tone: "visited" as Tone })), ...extra] });
  m.s.tokens = [seqRow()];
  m.set({ "draft model": "1B, ~2 ms/token", "target model": "70B, ~40 ms/token", "K": K });
  m.push(`Autoregressive decoding runs the big model once per token, mostly waiting on memory bandwidth. Speculative decoding lets a small draft model guess K = ${K} tokens cheaply, then the big model checks all of them in one pass.`);
  for (const r of rounds) {
    if (m.f.full) break;
    m.s.tokens = [seqRow(), { label: "draft proposes", cells: r.draft.map((t) => ({ text: t, tone: "compare" })) }];
    m.push(`Draft model proposes ${K} tokens one at a time (≈ ${K * 2} ms): "${r.draft.join(" ")}".`, "draft");
    targetPasses++;
    const firstReject = r.accept.indexOf(false);
    const accepted = firstReject < 0 ? r.draft.length : firstReject;
    m.s.tokens = [seqRow(), { label: "target verifies (one pass)", cells: r.draft.map((t, i) => ({ text: t, tone: i < accepted ? "done" : i === accepted ? "danger" : "muted", sub: i < accepted ? "accept" : i === accepted ? "reject" : "discard" })) }];
    m.push(`The target model scores all ${K} positions in one forward pass (≈ 40 ms) and compares its distribution with the draft's: ${accepted} accepted${firstReject >= 0 ? `, "${r.draft[firstReject]}" rejected (target preferred "${r.fix}"), the rest discarded` : ", all of them"}.`, "verify");
    const gained = firstReject >= 0 ? [...r.draft.slice(0, accepted), r.fix!] : [...r.draft, "…"];
    for (const t of gained) if (t !== "…") seq.push(t);
    produced += gained.filter((t) => t !== "…").length;
    m.s.tokens = [seqRow()];
    m.set({ "target passes": targetPasses, "tokens produced": produced, "tokens per pass": f2(produced / targetPasses) });
    m.push(firstReject >= 0 ? `Keep the ${accepted} accepted tokens plus the target's own replacement "${r.fix}": ${accepted + 1} tokens from one big-model pass instead of 1. The output distribution is exactly the target's — rejection sampling guarantees it.` : `All ${K} accepted, plus the target's next token for free: ${K + 1} tokens from one pass.`, "commit");
  }
  m.push(`${produced} tokens from ${targetPasses} target passes (${f2(produced / targetPasses)} per pass) versus ${produced} passes normally: a 2–3× speed-up when the draft agrees often (code, boilerplate), less on creative text. Same quality, since every kept token is one the target would have sampled.`, "done");
  return m.f.done();
};

const DEFAULT_HNSW: Pt[] = [{ x: 1, y: 1 }, { x: 3, y: 2 }, { x: 5, y: 1.5 }, { x: 7, y: 2.5 }, { x: 9, y: 1 }, { x: 2, y: 4 }, { x: 4, y: 5 }, { x: 6, y: 4.5 }, { x: 8, y: 5 }, { x: 1.5, y: 7 }, { x: 4, y: 8 }, { x: 7, y: 7.5 }];

const vectorSearchHnsw: G = ({ points, query }) => {
  const pts = (points && points.length >= 4 ? points : DEFAULT_HNSW).slice(0, 24);
  const q = Array.isArray(query) && query.length >= 2 && Number.isFinite(Number(query[0])) && Number.isFinite(Number(query[1])) ? { x: Number(query[0]), y: Number(query[1]) } : { x: 7.2, y: 3.1 };
  const m = new Ml();
  const n = pts.length;
  const L = 2;
  const ids = pts.map((_, i) => `n${i}`);
  const member = (i: number, l: number) => i % 3 ** l === 0;
  const layerNodes = Array.from({ length: L + 1 }, (_, l) => ids.filter((_, i) => member(i, l)));
  const edgesOf = (l: number): [string, string][] => {
    const M = l === 0 ? 3 : 2;
    const set = new Set<string>();
    const out: [string, string][] = [];
    for (const a of layerNodes[l]!) {
      const ia = ids.indexOf(a);
      const near = layerNodes[l]!.filter((b) => b !== a).map((b) => ({ b, d: dist(pts[ia]!, pts[ids.indexOf(b)]!) })).sort((x, y) => x.d - y.d).slice(0, M);
      for (const { b } of near) {
        const key = [a, b].sort().join("-");
        if (!set.has(key)) {
          set.add(key);
          out.push([a, b]);
        }
      }
    }
    return out;
  };
  const graph: LayerGraph = { layers: Array.from({ length: L + 1 }, (_, l) => ({ name: `layer ${l}`, nodes: layerNodes[l]!.map((id) => ({ id, x: pts[ids.indexOf(id)]!.x, y: pts[ids.indexOf(id)]!.y })), edges: edgesOf(l), edgeTones: {} })).reverse(), query: q };
  m.s.layers = graph;
  const layerOf = (l: number) => graph.layers[L - l]!;
  const neighbours = (l: number, id: string) => layerOf(l).edges.filter((e) => e.includes(id)).map((e) => (e[0] === id ? e[1] : e[0]));
  const d = (id: string) => dist(pts[ids.indexOf(id)]!, q);
  m.set({ vectors: n, layers: L + 1, "layer sizes": layerNodes.map((x) => x.length).reverse().join(" / "), query: `(${f1(q.x)}, ${f1(q.y)})` });
  m.push(`HNSW (hierarchical navigable small world): ${n} vectors in a graph where each node links to its nearest neighbours. Each node is also promoted to higher, sparser layers with geometric probability (${layerNodes.map((x) => x.length).reverse().join(" / ")} nodes per layer, top to bottom). Query q (ring) = (${f1(q.x)}, ${f1(q.y)}).`);
  let cur = layerNodes[L]![0]!;
  let comparisons = 0;
  const mark = (l: number, id: string, tone: Tone) => {
    const nd = layerOf(l).nodes.find((x) => x.id === id);
    if (nd) nd.tone = tone;
  };
  mark(L, cur, "active");
  m.push(`Enter at the top layer's entry point ${cur} (distance to q ${f2(d(cur))}). The top layer is a coarse map — long jumps across the whole space.`, "enter");
  for (let l = L; l >= 0 && !m.f.full; l--) {
    if (l < L) {
      mark(l, cur, "active");
      m.push(`Descend to layer ${l} at ${cur}: the same node exists below, and the graph gets denser (M = ${l === 0 ? 3 : 2} links), so the steps get shorter and more precise.`, "descend");
    }
    for (let guard = 0; guard < 20 && !m.f.full; guard++) {
      const nb = neighbours(l, cur);
      comparisons += nb.length;
      let best = cur;
      for (const b of nb) if (d(b) < d(best)) best = b;
      const desc = nb.map((b) => `${b} ${f2(d(b))}`).join(", ");
      if (best === cur) {
        m.push(`Layer ${l} at ${cur} (${f2(d(cur))}): neighbours ${desc || "none"} — none is closer to q, so this is a local minimum for this layer.`, "local-min");
        break;
      }
      layerOf(l).edgeTones![[cur, best].sort().join("-")] = "path";
      mark(l, cur, "visited");
      mark(l, best, "active");
      m.push(`Layer ${l} at ${cur} (${f2(d(cur))}): neighbours ${desc}. Greedily move to the closest, ${best} (${f2(d(best))}).`, "step");
      cur = best;
    }
  }
  const exact = ids.map((id) => ({ id, d: d(id) })).sort((a, b) => a.d - b.d)[0]!;
  mark(0, cur, "done");
  m.set({ result: `${cur} at ${f2(d(cur))}`, "exact nearest": `${exact.id} at ${f2(exact.d)}`, "distance computations": comparisons, "brute force": n });
  m.push(`Result: ${cur} at distance ${f2(d(cur))}${exact.id === cur ? " — the exact nearest neighbour" : ` (exact nearest is ${exact.id} at ${f2(exact.d)}: approximate search can miss, which a larger ef beam fixes)`}, after ${comparisons} distance computations instead of ${n}. Search is O(log n) per query; production indexes hold 10⁸ vectors with recall ≈ 0.95–0.99, tuned by M (links per node) and ef (beam width).`, "done");
  return m.f.done();
};

// ---------- renderer ----------

function PlotView({ plot }: { plot: Plot }) {
  const clip = useId();
  const W = 300;
  const H = 210;
  const ml = 36;
  const mr = 12;
  const mt = 12;
  const mb = 28;
  const xs = plot.points.map((p) => p.x);
  const ys = plot.points.map((p) => p.y);
  const range = (vals: number[]) => {
    let lo = vals.length ? Math.min(...vals) : 0;
    let hi = vals.length ? Math.max(...vals) : 1;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.12;
    return [lo - pad, hi + pad] as const;
  };
  const [x0, x1] = range(xs);
  const [y0, y1] = range(ys);
  const sx = (x: number) => ml + ((x - x0) / (x1 - x0)) * (W - ml - mr);
  const sy = (y: number) => H - mb - ((y - y0) / (y1 - y0)) * (H - mt - mb);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[380px]" role="img" aria-label="Scatter plot">
      <defs>
        <clipPath id={clip}>
          <rect x={ml} y={mt} width={W - ml - mr} height={H - mt - mb} />
        </clipPath>
      </defs>
      <line x1={ml} y1={H - mb} x2={W - mr} y2={H - mb} stroke="var(--border)" />
      <line x1={ml} y1={mt} x2={ml} y2={H - mb} stroke="var(--border)" />
      {[x0, x1].map((v, i) => (
        <text key={`x${i}`} x={sx(v)} y={H - mb + 12} fontSize="9" textAnchor="middle" fill="var(--fg-muted)" fontFamily="var(--font-mono)">
          {f1(v)}
        </text>
      ))}
      {[y0, y1].map((v, i) => (
        <text key={`y${i}`} x={ml - 4} y={sy(v) + 3} fontSize="9" textAnchor="end" fill="var(--fg-muted)" fontFamily="var(--font-mono)">
          {f1(v)}
        </text>
      ))}
      {plot.xLabel && (
        <text x={(ml + W - mr) / 2} y={H - 4} fontSize="9" textAnchor="middle" fill="var(--fg-muted)">
          {plot.xLabel}
        </text>
      )}
      {plot.yLabel && (
        <text x={10} y={(mt + H - mb) / 2} fontSize="9" textAnchor="middle" fill="var(--fg-muted)" transform={`rotate(-90 10 ${(mt + H - mb) / 2})`}>
          {plot.yLabel}
        </text>
      )}
      <g clipPath={`url(#${clip})`}>
        {(plot.lines ?? []).map((l, i) => (
          <g key={i}>
            <line x1={sx(l.x1)} y1={sy(l.y1)} x2={sx(l.x2)} y2={sy(l.y2)} stroke={toneStroke[l.tone ?? "default"]} strokeWidth={l.tone === "active" || l.tone === "path" ? 2 : 1.2} strokeDasharray={l.dashed ? "4 3" : undefined} opacity={l.tone === "muted" ? 0.6 : 1} />
            {l.label && (
              <text x={sx((l.x1 + l.x2) / 2) + 4} y={sy((l.y1 + l.y2) / 2) - 4} fontSize="9" fill="var(--fg-muted)" style={{ paintOrder: "stroke", stroke: "var(--bg-elev)", strokeWidth: 3 }}>
                {l.label}
              </text>
            )}
          </g>
        ))}
      </g>
      {plot.points.map((p, i) => {
        const tone = p.tone ?? "default";
        const cx = sx(p.x);
        const cy = sy(p.y);
        return (
          <g key={i}>
            {p.shape === "x" ? (
              <g stroke={toneStroke[tone]} strokeWidth={2.5}>
                <line x1={cx - 6} y1={cy - 6} x2={cx + 6} y2={cy + 6} />
                <line x1={cx - 6} y1={cy + 6} x2={cx + 6} y2={cy - 6} />
              </g>
            ) : p.shape === "ring" ? (
              <circle cx={cx} cy={cy} r={7} fill="none" stroke={toneStroke[tone]} strokeWidth={2.5} />
            ) : (
              <circle cx={cx} cy={cy} r={4.5} fill={tone === "default" ? "var(--fg-muted)" : toneStroke[tone]} stroke="var(--bg-elev)" strokeWidth={1} opacity={tone === "muted" ? 0.35 : 1} />
            )}
            {p.label && (
              <text x={cx + 8} y={cy - 6} fontSize="9" fill="var(--fg)" style={{ paintOrder: "stroke", stroke: "var(--bg-elev)", strokeWidth: 3 }}>
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function CurveView({ curve }: { curve: Curve }) {
  const W = 300;
  const H = 96;
  const ml = 40;
  const vals = curve.values.filter((v) => Number.isFinite(v));
  const hi = Math.max(1e-9, ...vals);
  const lo = Math.min(0, ...vals);
  const sx = (i: number) => ml + (vals.length > 1 ? (i / (vals.length - 1)) * (W - ml - 10) : 0);
  const sy = (v: number) => 10 + (1 - (v - lo) / (hi - lo || 1)) * (H - 30);
  return (
    <div>
      <div className="mb-1 text-[11px] text-muted">{curve.label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[380px]" role="img" aria-label="Loss curve">
        <line x1={ml} y1={H - 20} x2={W - 10} y2={H - 20} stroke="var(--border)" />
        <line x1={ml} y1={10} x2={ml} y2={H - 20} stroke="var(--border)" />
        <text x={ml - 4} y={14} fontSize="9" textAnchor="end" fill="var(--fg-muted)" fontFamily="var(--font-mono)">
          {f2(hi)}
        </text>
        <text x={ml - 4} y={H - 18} fontSize="9" textAnchor="end" fill="var(--fg-muted)" fontFamily="var(--font-mono)">
          {f2(lo)}
        </text>
        <text x={W - 10} y={H - 6} fontSize="9" textAnchor="end" fill="var(--fg-muted)">
          step {Math.max(0, vals.length - 1)}
        </text>
        {vals.length > 1 && <polyline points={vals.map((v, i) => `${sx(i)},${sy(v)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2} />}
        {vals.map((v, i) => (
          <circle key={i} cx={sx(i)} cy={sy(v)} r={i === vals.length - 1 ? 4 : 2.5} fill={i === vals.length - 1 ? "var(--warn)" : "var(--accent)"} />
        ))}
        {vals.length > 0 && (
          <text x={Math.min(W - 30, sx(vals.length - 1))} y={sy(vals[vals.length - 1]!) - 7} fontSize="9" textAnchor="middle" fill="var(--fg)" fontFamily="var(--font-mono)" style={{ paintOrder: "stroke", stroke: "var(--bg-elev)", strokeWidth: 3 }}>
            {f2(vals[vals.length - 1]!)}
          </text>
        )}
      </svg>
    </div>
  );
}

function NetView({ net }: { net: Net }) {
  const cols = net.layers.length;
  const W = 80 + cols * 130;
  const H = 210;
  const x = (li: number) => 60 + li * 130;
  const y = (li: number, ni: number) => {
    const n = net.layers[li]!.nodes.length;
    return 30 + ((ni + 0.5) / n) * (H - 50);
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W * 1.2 }} role="img" aria-label="Network diagram">
      {net.edges.map((e, i) => {
        const x1 = x(e.from[0]) + 18;
        const y1 = y(e.from[0], e.from[1]);
        const x2 = x(e.to[0]) - 18;
        const y2 = y(e.to[0], e.to[1]);
        const t = 0.28 + 0.16 * (e.to[1] % 3);
        const tone = e.tone ?? "default";
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={toneStroke[tone]} strokeWidth={tone === "default" || tone === "muted" ? 1 : 2} opacity={tone === "muted" ? 0.4 : tone === "default" ? 0.7 : 1} />
            {e.label && (
              <text x={x1 + (x2 - x1) * t} y={y1 + (y2 - y1) * t - 3} fontSize="9" textAnchor="middle" fill={tone === "danger" ? "var(--danger)" : tone === "done" ? "var(--success)" : "var(--fg-muted)"} fontFamily="var(--font-mono)" style={{ paintOrder: "stroke", stroke: "var(--bg-elev)", strokeWidth: 3 }}>
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {net.layers.map((l, li) => (
        <g key={li}>
          <text x={x(li)} y={14} fontSize="9" textAnchor="middle" fill="var(--fg-muted)">
            {l.name}
          </text>
          {l.nodes.map((nd, ni) => (
            <Circle key={ni} x={x(li)} y={y(li, ni)} r={18} label={nd.value ?? nd.name} tone={nd.tone ?? "default"} sub={nd.name} />
          ))}
        </g>
      ))}
    </svg>
  );
}

function HeatView({ heat }: { heat: Heat }) {
  const finite = heat.values.flat().filter((v): v is number => v !== null && Number.isFinite(v));
  const lo = Math.min(0, ...finite);
  const hi = Math.max(1e-9, ...finite);
  return (
    <div className="overflow-x-auto">
      <div className="mb-1 text-[11px] text-muted">{heat.title}</div>
      <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `minmax(48px, auto) repeat(${heat.cols.length}, 52px)` }}>
        <div />
        {heat.cols.map((c) => (
          <div key={c} className="truncate text-center text-[10px] text-muted" title={c}>
            {c}
          </div>
        ))}
        {heat.rows.map((r, i) => (
          <RowOfHeat key={r} r={r} i={i} heat={heat} lo={lo} hi={hi} />
        ))}
      </div>
    </div>
  );
}

function RowOfHeat({ r, i, heat, lo, hi }: { r: string; i: number; heat: Heat; lo: number; hi: number }) {
  return (
    <>
      <div className={cn("truncate pr-2 text-right text-[10px]", heat.activeRow === i ? "font-semibold text-fg" : "text-muted")} title={r}>
        {r}
      </div>
      {heat.cols.map((_, j) => {
        const v = heat.values[i]?.[j] ?? null;
        const pct = v === null || !Number.isFinite(v) ? 0 : Math.round(((v - lo) / (hi - lo || 1)) * 75);
        const active = heat.active && heat.active[0] === i && heat.active[1] === j;
        return (
          <div key={j} className={cn("flex h-8 items-center justify-center rounded border font-mono text-[10px]", active ? "border-accent ring-2 ring-accent/50" : heat.activeRow === i ? "border-accent/50" : "border-line", v === null && "text-muted")} style={{ background: v === null ? "transparent" : `color-mix(in srgb, var(--accent) ${pct}%, var(--bg-elev-2))` }}>
            {v === null ? "·" : Number.isFinite(v) ? f2(v) : "−∞"}
          </div>
        );
      })}
    </>
  );
}

function TokensView({ rows }: { rows: TokenRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`}>
          <div className="mb-1 text-[11px] text-muted">{row.label}</div>
          <div className="flex flex-wrap gap-1">
            {row.cells.map((c, j) => (
              <span key={j} className={cn("inline-flex flex-col items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px]", toneClass[c.tone ?? "default"])}>
                <span className="max-w-[260px] truncate" title={c.text}>
                  {c.text}
                </span>
                {c.sub && <span className="text-[9px] text-muted">{c.sub}</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BarsView({ bars }: { bars: NonNullable<MlState["bars"]> }) {
  const max = bars.max ?? Math.max(1e-9, ...bars.items.map((i) => i.value));
  return (
    <div>
      <div className="mb-1 text-[11px] text-muted">{bars.label}</div>
      <div className="flex flex-col gap-1">
        {bars.items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-24 truncate text-right font-mono" title={it.label}>
              {it.label}
            </span>
            <div className="h-4 flex-1 rounded bg-elev-2">
              <div className={cn("h-4 rounded border", toneClass[it.tone ?? "active"])} style={{ width: `${Math.max(1, Math.min(100, (it.value / max) * 100))}%` }} />
            </div>
            <span className="w-24 truncate font-mono text-[10px] text-muted">{it.sub ?? f2(it.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineView({ p }: { p: Pipeline }) {
  const cols = Math.max(1, Math.min(p.cols ?? 4, p.boxes.length));
  const bw = 112;
  const bh = 44;
  const gx = 34;
  const gy = 30;
  const rows = Math.ceil(p.boxes.length / cols);
  const W = cols * bw + (cols - 1) * gx + 20;
  const H = rows * bh + (rows - 1) * gy + 20;
  const pos = (i: number): [number, number] => {
    const r = Math.floor(i / cols);
    const c = r % 2 === 0 ? i % cols : cols - 1 - (i % cols);
    return [10 + c * (bw + gx), 10 + r * (bh + gy)];
  };
  const idx = new Map(p.boxes.map((b, i) => [b.id, i]));
  const edges: { from: string; to: string; label?: string; tone?: Tone; dashed?: boolean }[] = p.edges ?? p.boxes.slice(1).map((b, i) => ({ from: p.boxes[i]!.id, to: b.id }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W * 1.15 }} role="img" aria-label="Pipeline">
      {edges.map((e, i) => {
        const a = idx.get(e.from);
        const b = idx.get(e.to);
        if (a === undefined || b === undefined) return null;
        const [ax, ay] = pos(a);
        const [bx, by] = pos(b);
        const tone = e.tone ?? (p.boxes[b]!.tone === "active" || p.boxes[b]!.tone === "visited" || p.boxes[b]!.tone === "done" ? "active" : "muted");
        if (ay === by) {
          const dir = bx > ax ? 1 : -1;
          return <Arrow key={i} x1={ax + (dir > 0 ? bw : 0) + dir * 2} y1={ay + bh / 2} x2={bx + (dir > 0 ? 0 : bw) - dir * 2} y2={by + bh / 2} tone={tone} dashed={e.dashed} label={e.label} />;
        }
        const down = by > ay;
        return <Arrow key={i} x1={ax + bw / 2} y1={ay + (down ? bh : 0)} x2={bx + bw / 2} y2={by + (down ? 0 : bh)} tone={tone} dashed={e.dashed} label={e.label} />;
      })}
      {p.boxes.map((b, i) => {
        const [x, y] = pos(i);
        return <Box key={b.id} x={x} y={y} w={bw} h={bh} label={b.label.length > 18 ? b.label.slice(0, 17) + "…" : b.label} sub={b.sub && b.sub.length > 22 ? b.sub.slice(0, 21) + "…" : b.sub} tone={b.tone ?? "default"} />;
      })}
    </svg>
  );
}

function LayerGraphView({ g }: { g: LayerGraph }) {
  const W = 320;
  const LH = 84;
  const gap = 12;
  const H = g.layers.length * (LH + gap);
  const all = g.layers.flatMap((l) => l.nodes);
  const xs = [...all.map((n) => n.x), ...(g.query ? [g.query.x] : [])];
  const ys = [...all.map((n) => n.y), ...(g.query ? [g.query.y] : [])];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const sx = (x: number) => 56 + ((x - x0) / (x1 - x0 || 1)) * (W - 72);
  const sy = (y: number, li: number) => li * (LH + gap) + 12 + (1 - (y - y0) / (y1 - y0 || 1)) * (LH - 24);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[420px]" role="img" aria-label="HNSW layers">
      {g.layers.map((l, li) => (
        <g key={l.name}>
          <rect x={44} y={li * (LH + gap)} width={W - 48} height={LH} rx={8} fill="var(--bg-elev-2)" stroke="var(--border)" opacity={0.6} />
          <text x={6} y={li * (LH + gap) + LH / 2 + 3} fontSize="9" fill="var(--fg-muted)">
            {l.name}
          </text>
          {l.edges.map(([a, b]) => {
            const na = l.nodes.find((n) => n.id === a);
            const nb = l.nodes.find((n) => n.id === b);
            if (!na || !nb) return null;
            const tone = l.edgeTones?.[[a, b].sort().join("-")] ?? "default";
            return <line key={`${a}-${b}`} x1={sx(na.x)} y1={sy(na.y, li)} x2={sx(nb.x)} y2={sy(nb.y, li)} stroke={toneStroke[tone]} strokeWidth={tone === "default" ? 1 : 2.5} opacity={tone === "default" ? 0.5 : 1} />;
          })}
          {li + 1 < g.layers.length &&
            l.nodes
              .filter((n) => n.tone === "active" || n.tone === "visited" || n.tone === "done")
              .map((n) => {
                const below = g.layers[li + 1]!.nodes.find((x) => x.id === n.id);
                if (!below) return null;
                return <line key={`down-${n.id}`} x1={sx(n.x)} y1={sy(n.y, li)} x2={sx(below.x)} y2={sy(below.y, li + 1)} stroke="var(--accent)" strokeDasharray="3 3" opacity={0.5} />;
              })}
          {l.nodes.map((n) => (
            <g key={n.id}>
              <circle cx={sx(n.x)} cy={sy(n.y, li)} r={n.tone ? 7 : 5} fill={toneFill[n.tone ?? "default"]} stroke={toneStroke[n.tone ?? "default"]} strokeWidth={n.tone ? 2 : 1.2} />
              <text x={sx(n.x)} y={sy(n.y, li) - 9} fontSize="8" textAnchor="middle" fill="var(--fg-muted)" fontFamily="var(--font-mono)">
                {n.id}
              </text>
            </g>
          ))}
          {g.query && <circle cx={sx(g.query.x)} cy={sy(g.query.y, li)} r={7} fill="none" stroke="var(--danger)" strokeWidth={2.5} />}
        </g>
      ))}
    </svg>
  );
}

function TreeView({ t }: { t: TreeDiagram }) {
  const W = 380;
  const H = 230;
  const bw = 88;
  const bh = 36;
  const px = (v: number) => 10 + (v / 100) * (W - 20);
  const py = (v: number) => 8 + (v / 100) * (H - 30);
  const pos = new Map(t.nodes.map((n) => [n.id, [px(n.x), py(n.y)] as const]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[440px]" role="img" aria-label="Decision tree">
      {t.edges.map((e, i) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        return <Arrow key={i} x1={a[0]} y1={a[1] + bh / 2} x2={b[0]} y2={b[1] - bh / 2} tone={e.tone ?? "default"} label={e.label} />;
      })}
      {t.nodes.map((n) => {
        const p = pos.get(n.id)!;
        return <Box key={n.id} x={p[0] - bw / 2} y={p[1] - bh / 2} w={bw} h={bh} label={n.label} sub={n.sub} tone={n.tone ?? "default"} />;
      })}
    </svg>
  );
}

function Renderer({ frame }: RendererProps<MlInput, MlState>) {
  const { state } = frame;
  return (
    <div className="flex flex-col gap-3">
      {state.pipeline && <PipelineView p={state.pipeline} />}
      {state.net && <NetView net={state.net} />}
      {state.tree && <TreeView t={state.tree} />}
      {state.plot && <PlotView plot={state.plot} />}
      {state.layers && <LayerGraphView g={state.layers} />}
      {state.curve && <CurveView curve={state.curve} />}
      {state.heat && <HeatView heat={state.heat} />}
      {state.tokens && state.tokens.length > 0 && <TokensView rows={state.tokens} />}
      {state.bars && <BarsView bars={state.bars} />}
      {state.log && state.log.length > 0 && (
        <div className="rounded-md bg-code px-3 py-2 font-mono text-[11px] text-muted">
          {state.log.map((l, i) => (
            <div key={i} className={i === state.log!.length - 1 ? "text-fg" : ""}>
              {l}
            </div>
          ))}
        </div>
      )}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "current / class 1" }, { tone: "compare", label: "candidate / class 0" }, { tone: "done", label: "accepted / result" }, { tone: "danger", label: "error / gradient / query" }, { tone: "visited", label: "processed" }, { tone: "muted", label: "dropped / inactive" }]} />
    </div>
  );
}

function parsePoints(raw: unknown, labels?: unknown): Pt[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ls = Array.isArray(labels) ? labels.map(Number) : [];
  const out: Pt[] = [];
  raw.slice(0, 40).forEach((p, i) => {
    let x: number;
    let y: number;
    let label: number | undefined;
    if (Array.isArray(p)) {
      x = Number(p[0]);
      y = Number(p[1]);
      label = p[2] === undefined ? undefined : Number(p[2]);
    } else if (p && typeof p === "object") {
      const o = p as Record<string, unknown>;
      x = Number(o.x);
      y = Number(o.y);
      label = o.label === undefined ? (o.class === undefined ? undefined : Number(o.class)) : Number(o.label);
    } else return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (label === undefined && Number.isFinite(ls[i])) label = ls[i];
    out.push(label !== undefined && Number.isFinite(label) ? { x, y, label } : { x, y });
  });
  return out;
}

export const mlFamily: Family<MlInput, MlState> = {
  name: "ML & LLMs",
  description: "Regression, classification, clustering, neural networks, attention, tokenisation, sampling, and the systems around large language models.",
  Renderer,
  algorithms: {
    "linear-regression": linearRegression,
    "gradient-descent": gradientDescent,
    "logistic-regression": logisticRegression,
    "neural-net-forward": neuralNetForward,
    backprop,
    "decision-tree": decisionTree,
    "k-means": kMeans,
    knn,
    "embeddings-similarity": embeddingsSimilarity,
    tokenization,
    attention,
    "transformer-block": transformerBlock,
    "next-token-sampling": nextTokenSampling,
    "kv-cache": kvCache,
    "rag-pipeline": ragPipeline,
    "agent-loop": agentLoop,
    "fine-tuning": fineTuning,
    rlhf,
    "speculative-decoding": speculativeDecoding,
    "vector-search-hnsw": vectorSearchHnsw,
  },
  labels: {
    "linear-regression": "Linear regression (least squares)",
    "gradient-descent": "Gradient descent on a line fit",
    "logistic-regression": "Logistic regression",
    "neural-net-forward": "Neural network: forward pass",
    backprop: "Backpropagation",
    "decision-tree": "Decision tree (Gini splits)",
    "k-means": "k-means clustering",
    knn: "k-nearest neighbours",
    "embeddings-similarity": "Embeddings and cosine similarity",
    tokenization: "Byte-pair tokenization",
    attention: "Self-attention",
    "transformer-block": "Inside a transformer block",
    "next-token-sampling": "Next-token sampling: temperature and top-p",
    "kv-cache": "KV cache during generation",
    "rag-pipeline": "Retrieval-augmented generation",
    "agent-loop": "Agent tool-use loop",
    "fine-tuning": "Fine-tuning with LoRA",
    rlhf: "RLHF: reward model and PPO",
    "speculative-decoding": "Speculative decoding",
    "vector-search-hnsw": "Vector search with HNSW",
  },
  examples: {
    "linear-regression": { points: DEFAULT_LINE },
    "gradient-descent": { points: DEFAULT_LINE, steps: 8 },
    "logistic-regression": { points: DEFAULT_CLASSES, steps: 10 },
    "neural-net-forward": { x: [1.0, 0.5] },
    backprop: { x: [1.0, 0.5], target: 1 },
    "decision-tree": { points: DEFAULT_CLASSES },
    "k-means": { points: DEFAULT_CLUSTERS, k: 3 },
    knn: { points: DEFAULT_CLASSES, k: 3, query: [4, 3.5] },
    "embeddings-similarity": { text: "king queen man woman apple" },
    tokenization: { text: "low lower lowest" },
    attention: { text: "the cat sat down" },
    "transformer-block": { text: "the cat sat" },
    "next-token-sampling": { text: "The capital of France is", temperature: 0.8, topP: 0.9 },
    "kv-cache": { text: "The cat sat" },
    "rag-pipeline": { text: "What is the refund window?", k: 2 },
    "agent-loop": { text: "How many open PRs are older than 7 days?" },
    "fine-tuning": { steps: 3 },
    rlhf: {},
    "speculative-decoding": { k: 4, text: "The quick brown" },
    "vector-search-hnsw": { points: DEFAULT_HNSW, query: [7.2, 3.1] },
  },
  normalise: (raw) => {
    const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));
    const q = raw.query ?? raw.q;
    let query: MlInput["query"];
    if (typeof q === "string") query = q;
    else if (Array.isArray(q) && q.length >= 2) query = [Number(q[0]), Number(q[1])];
    else if (q && typeof q === "object") query = [Number((q as Record<string, unknown>).x), Number((q as Record<string, unknown>).y)];
    const xr = raw.x ?? raw.input;
    return {
      ...raw,
      text: raw.text === undefined ? (typeof raw.prompt === "string" ? raw.prompt : typeof raw.sentence === "string" ? raw.sentence : undefined) : String(raw.text).slice(0, 200),
      points: parsePoints(raw.points ?? raw.data ?? raw.values, raw.labels),
      k: num(raw.k),
      steps: num(raw.steps ?? raw.epochs ?? raw.iterations),
      lr: num(raw.lr ?? raw.learningRate ?? raw.learning_rate),
      temperature: num(raw.temperature ?? raw.T),
      topP: num(raw.topP ?? raw.top_p),
      query,
      target: num(raw.target ?? raw.y),
      x: Array.isArray(xr) ? xr.map(Number) : undefined,
    };
  },
};
