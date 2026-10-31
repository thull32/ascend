// The `fabric` family: data center, backbone and AI fabric networking on the
// Meridian reference network (content/tracks/15-fabric-networking). Devices
// sit on a 0..100 grid, joined by persistent links; packets move along links;
// an optional header stack shows encapsulation and per-hop rewrites; up to two
// tables show the state a device consults (MAC tables, RIBs, FIBs, LSDBs,
// queues); an optional chart plots a few series over time.
//
// ---------------------------------------------------------------------------
// AUTHORING GUIDE (for scenario pack authors)
// ---------------------------------------------------------------------------
//
// 1. A scenario is a function `(input: FabricInput) => Frame<FabricState>[]`
//    (type `FabGen`). Build it with the `Fab` DSL and return `fab.f.done()`:
//
//      export const myScenario: FabGen = (input) => {
//        const spines = int(input.spines, 2, 4, 2);       // optional input, clamped
//        const fab = new Fab(
//          [{ id: "leaf1.ams", kind: "leaf" }, { id: "spine1.ams", kind: "spine" }],
//          [["leaf1.ams", "spine1.ams", { label: "400G" }]],
//        );
//        fab.note(`What is on screen and why, in one or two exact sentences.`);
//        fab.send("leaf1.ams", "spine1.ams", "UPDATE 10.1.1.0/24", `What the packet is and why it goes there.`);
//        return fab.f.done();
//      };
//
//    Every DSL call that takes a `note` pushes exactly one frame (except
//    `hop`, one frame per hop, and `send` with `arrive`, two frames). Calls
//    without a note (`state`, `tone`, `set`, `table`, `headers`, `linkSet`,
//    `chart`, `point`, ...) only change state; it shows on the next frame.
//    So: change state first, then push the frame whose note describes it.
//
// 2. Layout. Give nodes a `kind`; with no `x`/`y` they are placed by tier
//    (internet and clouds at the top, gateways/RRs/controllers/collectors,
//    spines and routers, leaves and switches, hosts and servers, NICs, then
//    GPUs and CPUs at the bottom) and spread evenly along each row. Set `x`
//    and `y` (0..100) for anything else; nodes with the same `y` form a row
//    and their boxes shrink to fit their spacing. Keep rows to six nodes or
//    fewer so labels stay readable at phone width (360 px); use the brief's
//    small examples (2 spines, 4 leaves) and say so in a note. Labels that do
//    not fit are shortened to the part before the first dot ("leaf1.ams" →
//    "leaf1"), so name devices the Meridian way. `state` is a short readout
//    drawn under the label ("TTL 63", "Established", "queue 80%"); keep it
//    under about 14 characters. Set `new Fab(nodes, links, { height })` when a
//    layout needs more vertical room than the row count suggests.
//
// 3. Inputs. Every scenario must run with `{}` (the default run is what the
//    owning lesson uses). Optional inputs arrive raw from lesson JSON: parse
//    them with `int(v, lo, hi, def)` and `pick(v, allowed, def)`, never trust
//    their type, and document each one in the scenario's doc comment
//    ("Inputs: `spines` 2-4 (default 4); `variant: "spine-failure"` ..."). The
//    family's `normalise` only coerces `variant` to a string.
//
// 4. Notes are read aloud by a narrator. Each frame's note is one or two
//    complete, technically exact sentences that say what is on screen and why
//    it happens ("leaf1.ams decrements the TTL from 64 to 63 and recomputes
//    the header checksum, because the checksum covers the TTL."). The state
//    must agree with the note: if the note says TTL 63, the header shows 63;
//    if it says three next hops, the table has three rows. No placeholder
//    notes ("Step 3."), no repeated notes, no device configuration syntax.
//    Use Meridian names, loopbacks, VNIs and MACs (helpers below) and real
//    numbers with their provenance or what they depend on.
//
// 5. Size: 8-25 frames per run is the target; every scenario needs at least
//    6. Frames are immutable deep copies (the snapshot clones everything), so
//    mutate `fab.s` freely between frames.
//
// 6. Header stacks are outermost first. Fields whose value changed since the
//    previous frame, and headers that are new since the previous frame, are
//    highlighted automatically; `highlight: ["VNI"]` forces a field to stand
//    out. Name headers so the same header keeps the same name across frames
//    ("Outer IPv4" vs "IPv4"), because highlighting matches by name.
//
// 7. Register: add the generator to your pack's `scenarios` map and a short
//    gallery label to `labels`. fabric.test.ts picks it up automatically and
//    checks frames, notes, node references and header field types.
// ---------------------------------------------------------------------------
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { cn } from "../../lib/utils";
import { clone, Frames, type Frame, type RendererProps } from "../engine";
import { Legend, Vars, toneFill, toneStroke, type Tone } from "../primitives";

// ---------- state ----------

export type FabKind = "host" | "leaf" | "spine" | "router" | "rr" | "gw" | "isp" | "gpu" | "nic" | "switch" | "cpu" | "server" | "collector" | "controller" | "cloud";

export interface FabricInput {
  variant?: string;
  [k: string]: unknown;
}

export interface FabNode {
  id: string;
  label: string;
  kind: FabKind;
  /** 0..100 grid position; both unset means "place by tier". */
  x?: number;
  y?: number;
  tone?: Tone;
  /** Short readout under the label, e.g. "TTL 63" or "Established". */
  state?: string;
}

export interface FabLink {
  id: string;
  a: string;
  b: string;
  label?: string;
  /** Where along a→b the label sits (0..1, default 0.5). */
  labelAt?: number;
  tone?: Tone;
  down?: boolean;
  dashed?: boolean;
  /** Utilisation 0..1, drawn as line width. */
  width?: number;
}

export interface FabPacket {
  from: string;
  to: string;
  label: string;
  tone: Tone;
  /** 0 at `from`, 1 at `to`. */
  progress: number;
  lost?: boolean;
}

export interface FabField {
  k: string;
  v: string;
  /** Changed since the previous frame, or forced by `highlight`. Set by the snapshot. */
  hot?: boolean;
}

export interface FabHeader {
  name: string;
  fields: FabField[];
  tone?: Tone;
  /** Size on the wire, e.g. "20 B". */
  size?: string;
  /** Who reads or rewrites it, e.g. "every underlay hop". */
  reader?: string;
  /** Field names always highlighted. */
  highlight?: string[];
  /** Added since the previous frame. Set by the snapshot. */
  fresh?: boolean;
}

export interface FabTable {
  title: string;
  head?: string[];
  rows: string[][];
  tones?: (Tone | undefined)[];
}

export interface FabSeries {
  name: string;
  tone?: Tone;
  /** One value per time step; null leaves a gap. */
  points: (number | null)[];
}

export interface FabChart {
  title: string;
  unit?: string;
  yMax?: number;
  xLabel?: string;
  series: FabSeries[];
  /** Horizontal threshold lines (XOFF, ECN Kmin, link capacity). */
  marks?: { y: number; label: string; tone?: Tone }[];
}

export interface FabricState {
  nodes: FabNode[];
  links: FabLink[];
  packets: FabPacket[];
  /** Header stack, outermost first, with an optional "where" caption. */
  headers?: { at?: string; stack: FabHeader[] };
  /** At most two. */
  tables: FabTable[];
  chart?: FabChart;
  vars: Record<string, unknown>;
  log: string[];
  /** Optional diagram height override in px. */
  height?: number;
}

// ---------- DSL ----------

export type Cell = string | number;
export interface NodeSpec {
  id: string;
  kind: FabKind;
  label?: string;
  x?: number;
  y?: number;
  tone?: Tone;
  state?: string;
}
export type LinkOpts = Partial<Omit<FabLink, "id" | "a" | "b">>;
export type LinkSpec = [string, string] | [string, string, LinkOpts];
export type FieldsSpec = Record<string, Cell> | [string, Cell][];
export interface HeaderSpec {
  name: string;
  fields: FieldsSpec;
  tone?: Tone;
  size?: string | number;
  reader?: string;
  highlight?: string[];
}
export interface TableSpec {
  title: string;
  head?: string[];
  rows: Cell[][];
  tones?: (Tone | undefined)[];
}
export interface ChartSpec {
  title: string;
  unit?: string;
  yMax?: number;
  xLabel?: string;
  series: { name: string; tone?: Tone; points?: (number | null)[] }[];
  marks?: { y: number; label: string; tone?: Tone }[];
}
export interface PacketSpec {
  from: string;
  to: string;
  label: string;
  tone?: Tone;
  progress?: number;
  lost?: boolean;
}

export type FabGen = (input: FabricInput) => Frame<FabricState>[];

const LOG_LINES = 5;

const toFields = (f: FieldsSpec): FabField[] => (Array.isArray(f) ? f : Object.entries(f)).map(([k, v]) => ({ k, v: String(v) }));
const toHeader = (h: HeaderSpec): FabHeader => ({
  name: h.name,
  fields: toFields(h.fields),
  tone: h.tone,
  size: h.size === undefined ? undefined : typeof h.size === "number" ? `${h.size} B` : h.size,
  reader: h.reader,
  highlight: h.highlight ? [...h.highlight] : undefined,
});
const toTable = (t: TableSpec): FabTable => ({ title: t.title, head: t.head ? [...t.head] : undefined, rows: t.rows.map((r) => r.map(String)), tones: t.tones ? [...t.tones] : undefined });

export class Fab {
  s: FabricState;
  f: Frames<FabricState>;
  /** The header stack as the previous frame showed it (for change highlighting). */
  private shown: FabHeader[] | undefined;
  private macs = new Map<string, string>();

  constructor(nodes: NodeSpec[], links: LinkSpec[] = [], opts: { height?: number } = {}) {
    this.s = { nodes: [], links: [], packets: [], tables: [], vars: {}, log: [], height: opts.height };
    for (const n of nodes) this.addNode(n);
    for (const l of links) this.link(l[0], l[1], l[2]);
    this.f = new Frames<FabricState>(() => this.snapshot());
  }

  // ----- nodes -----

  node(id: string): FabNode {
    const n = this.s.nodes.find((x) => x.id === id);
    if (!n) throw new Error(`fabric: unknown node ${id}`);
    return n;
  }
  has(id: string): boolean {
    return this.s.nodes.some((n) => n.id === id);
  }
  addNode(n: NodeSpec): void {
    if (this.has(n.id)) throw new Error(`fabric: duplicate node ${n.id}`);
    this.s.nodes.push({ id: n.id, label: n.label ?? n.id, kind: n.kind, x: n.x, y: n.y, tone: n.tone, state: n.state });
  }
  /** Set a node's readout (undefined clears it) and optionally its tone. */
  state(id: string, state: string | undefined, tone?: Tone): void {
    const n = this.node(id);
    n.state = state;
    if (tone !== undefined) n.tone = tone;
  }
  /** Set (or clear, with undefined) a node's tone. */
  tone(id: string, tone?: Tone): void {
    this.node(id).tone = tone;
  }
  tones(ids: string[], tone?: Tone): void {
    for (const id of ids) this.tone(id, tone);
  }

  // ----- links -----

  /** Add a persistent link a–b. */
  link(a: string, b: string, opts: LinkOpts = {}): FabLink {
    this.node(a);
    this.node(b);
    const l: FabLink = { id: `${a}--${b}`, a, b, ...opts };
    this.s.links.push(l);
    return l;
  }
  /** The link between a and b in either direction (undefined if none). */
  linkOf(a: string, b: string): FabLink | undefined {
    return this.s.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  }
  /** Patch a link's label, tone, width, down or dashed flag. */
  linkSet(a: string, b: string, patch: LinkOpts): void {
    const l = this.linkOf(a, b);
    if (!l) throw new Error(`fabric: no link ${a}–${b}`);
    Object.assign(l, patch);
  }
  /** Mark a link down (drawn dashed red with a cross); its label is replaced by `label` (none by default). */
  down(a: string, b: string, label?: string): void {
    this.linkSet(a, b, { down: true, tone: "danger", width: 0, label });
  }
  up(a: string, b: string, label?: string): void {
    this.linkSet(a, b, { down: false, tone: undefined, ...(label !== undefined ? { label } : {}) });
  }
  /** Tone every link along a node path (e.g. the chosen ECMP path). */
  path(nodes: string[], tone: Tone = "path"): void {
    for (let i = 0; i + 1 < nodes.length; i++) this.linkSet(nodes[i]!, nodes[i + 1]!, { tone });
  }
  /** Reset every link that is not down to the default tone. */
  clearPath(): void {
    for (const l of this.s.links) if (!l.down) l.tone = undefined;
  }

  // ----- packets and frames -----

  /**
   * One packet on from→to for one frame (cleared afterwards unless `keep`).
   * `lost` draws it dropped at `progress` (default 0.65). `arrive` pushes a
   * second frame with the packet at the far end and that note.
   */
  send(from: string, to: string, label: string, note: string, opts: { tone?: Tone; lost?: boolean; tag?: string; keep?: boolean; progress?: number; arrive?: string } = {}): void {
    this.node(from);
    this.node(to);
    const p: FabPacket = { from, to, label, tone: opts.lost ? "danger" : (opts.tone ?? "active"), progress: opts.progress ?? (opts.lost ? 0.65 : 0.5), lost: opts.lost || undefined };
    this.s.packets = opts.keep ? [...this.s.packets, p] : [p];
    this.log(`${from} → ${to}: ${label}${opts.lost ? " (dropped)" : ""}`);
    this.f.push(note, opts.tag ?? (opts.lost ? "drop" : "send"));
    if (opts.arrive && !opts.lost) {
      p.progress = 1;
      this.f.push(opts.arrive, "arrive");
    }
    if (!opts.keep) this.s.packets = this.s.packets.filter((q) => q !== p);
    else if (opts.lost) this.s.packets = this.s.packets.filter((q) => q !== p);
  }

  /** Several packets at once for one frame (flows, fan-out, incast). */
  packets(list: PacketSpec[], note: string, tag = "flows"): void {
    this.s.packets = list.map((p) => {
      this.node(p.from);
      this.node(p.to);
      return { from: p.from, to: p.to, label: p.label, tone: p.lost ? "danger" : (p.tone ?? "active"), progress: p.progress ?? 0.5, lost: p.lost || undefined };
    });
    this.f.push(note, tag);
    this.s.packets = [];
  }

  /**
   * Walk a packet along a node path, one frame per hop (path[i] → path[i+1]).
   * `each(i, from, to)` runs before hop i's frame: rewrite headers, tone the
   * device, highlight a table row there. With a header stack the caption is
   * set to "from → to" unless `each` sets it.
   */
  hop(path: string[], label: string | ((i: number) => string), notes: string[] | ((i: number, from: string, to: string) => string), opts: { tone?: Tone; tag?: string; each?: (i: number, from: string, to: string) => void } = {}): void {
    for (let i = 0; i + 1 < path.length; i++) {
      const from = path[i]!;
      const to = path[i + 1]!;
      if (this.s.headers) this.s.headers.at = `on the link ${from} → ${to}`;
      opts.each?.(i, from, to);
      const text = typeof label === "function" ? label(i) : label;
      this.s.packets = [{ from, to, label: text, tone: opts.tone ?? "active", progress: 0.5 }];
      this.log(`${from} → ${to}: ${text}`);
      const note = typeof notes === "function" ? notes(i, from, to) : notes[i];
      if (note === undefined) throw new Error(`fabric: hop ${i} has no note`);
      this.f.push(note, opts.tag ?? "hop");
    }
    this.s.packets = [];
  }

  /** Push a frame (packets in flight are cleared first unless `keep`). */
  note(text: string, tag = "note", opts: { keep?: boolean } = {}): void {
    if (!opts.keep) this.s.packets = [];
    this.f.push(text, tag);
  }
  clear(): void {
    this.s.packets = [];
  }

  // ----- vars and log -----

  set(vars: Record<string, unknown>): void {
    this.s.vars = { ...this.s.vars, ...vars };
  }
  unset(...keys: string[]): void {
    const v = { ...this.s.vars };
    for (const k of keys) delete v[k];
    this.s.vars = v;
  }
  log(line: string): void {
    this.s.log = [...this.s.log.slice(-(LOG_LINES - 1)), line];
  }

  // ----- headers -----

  /** Replace the header stack (outermost first); undefined hides it. */
  headers(stack: HeaderSpec[] | undefined, at?: string): void {
    this.s.headers = stack ? { at, stack: stack.map(toHeader) } : undefined;
  }
  /** Caption above the header stack ("on the link leaf1.ams → spine1.ams"). */
  at(text: string | undefined): void {
    if (this.s.headers) this.s.headers.at = text;
  }
  /** Add a new outermost header (encapsulation). */
  pushHeader(h: HeaderSpec): void {
    if (!this.s.headers) this.s.headers = { stack: [] };
    this.s.headers.stack = [toHeader(h), ...this.s.headers.stack];
  }
  /** Remove the outermost `n` headers (decapsulation, label pop). */
  popHeader(n = 1): void {
    if (this.s.headers) this.s.headers.stack = this.s.headers.stack.slice(n);
  }
  /** Change field values of the `nth` header called `name` (adds missing fields at the end). */
  patchHeader(name: string, fields: Record<string, Cell>, nth = 0): void {
    const h = this.s.headers?.stack.filter((x) => x.name === name)[nth];
    if (!h) throw new Error(`fabric: no header ${name}`);
    for (const [k, v] of Object.entries(fields)) {
      const f = h.fields.find((x) => x.k === k);
      if (f) f.v = String(v);
      else h.fields.push({ k, v: String(v) });
    }
  }
  /** Read a field of the `nth` header called `name`. */
  field(name: string, k: string, nth = 0): string | undefined {
    return this.s.headers?.stack.filter((x) => x.name === name)[nth]?.fields.find((f) => f.k === k)?.v;
  }

  // ----- tables -----

  /** Set table 0 or 1 (undefined removes it). */
  table(slot: 0 | 1, t: TableSpec | undefined): void {
    const tables = [...this.s.tables];
    if (t) tables[slot] = toTable(t);
    else tables.splice(slot, 1);
    this.s.tables = tables.filter(Boolean);
  }
  private tbl(slot: 0 | 1): FabTable {
    const t = this.s.tables[slot];
    if (!t) throw new Error(`fabric: no table ${slot}`);
    return t;
  }
  addRow(slot: 0 | 1, row: Cell[], tone?: Tone): void {
    const t = this.tbl(slot);
    t.rows.push(row.map(String));
    t.tones = [...(t.tones ?? t.rows.slice(0, -1).map(() => undefined)), tone];
  }
  setRow(slot: 0 | 1, i: number, row: Cell[], tone?: Tone): void {
    const t = this.tbl(slot);
    t.rows[i] = row.map(String);
    if (tone !== undefined) this.rowTone(slot, i, tone);
  }
  removeRow(slot: 0 | 1, i: number): void {
    const t = this.tbl(slot);
    t.rows.splice(i, 1);
    t.tones?.splice(i, 1);
  }
  /** Tone the rows matching an index or predicate; others keep their tone. */
  rowTone(slot: 0 | 1, which: number | ((row: string[], i: number) => boolean), tone: Tone | undefined): void {
    const t = this.tbl(slot);
    const tones = t.rows.map((_, i) => t.tones?.[i]);
    t.rows.forEach((r, i) => {
      if (typeof which === "number" ? i === which : which(r, i)) tones[i] = tone;
    });
    t.tones = tones;
  }
  clearRowTones(slot: 0 | 1): void {
    this.tbl(slot).tones = undefined;
  }

  // ----- chart -----

  chart(c: ChartSpec | undefined): void {
    this.s.chart = c ? { title: c.title, unit: c.unit, yMax: c.yMax, xLabel: c.xLabel, series: c.series.map((s) => ({ name: s.name, tone: s.tone, points: [...(s.points ?? [])] })), marks: c.marks?.map((m) => ({ ...m })) } : undefined;
  }
  /** Append one time step: a value per named series (missing series get a gap). */
  point(values: Record<string, number | null>): void {
    if (!this.s.chart) throw new Error("fabric: no chart");
    for (const s of this.s.chart.series) s.points.push(Object.hasOwn(values, s.name) ? values[s.name]! : null);
  }

  // ----- Meridian helpers that need per-scenario state -----

  /**
   * A stable MAC for a router port (`device` facing `peer`), allocated from
   * the documentation range 00:00:5e:00:53:80-ff in order of first use, so
   * every port in one scenario has its own address.
   */
  portMac(device: string, peer: string): string {
    const key = `${device}>${peer}`;
    let m = this.macs.get(key);
    if (!m) {
      m = `00:00:5e:00:53:${hex2(0x80 + (this.macs.size % 0x80))}`;
      this.macs.set(key, m);
    }
    return m;
  }

  private snapshot(): FabricState {
    const st = clone(this.s);
    const prev = this.shown;
    if (st.headers) {
      const seen: Record<string, number> = {};
      st.headers.stack = st.headers.stack.map((h) => {
        const nth = (seen[h.name] = (seen[h.name] ?? -1) + 1);
        const before = prev?.filter((p) => p.name === h.name)[nth];
        return {
          ...h,
          fresh: prev && prev.length > 0 && !before ? true : undefined,
          fields: h.fields.map((f) => {
            const old = before?.fields.find((g) => g.k === f.k);
            const changed = before !== undefined && (old === undefined || old.v !== f.v);
            return { k: f.k, v: f.v, hot: changed || h.highlight?.includes(f.k) ? true : undefined };
          }),
        };
      });
    }
    this.shown = this.s.headers ? clone(this.s.headers.stack) : undefined;
    return st;
  }
}

// ---------- helpers for pack authors ----------

/** Clamp an author-supplied number to an integer in [lo, hi]. */
export const int = (v: unknown, lo: number, hi: number, def: number): number => {
  const n = Number(v);
  return v !== undefined && v !== null && v !== "" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def;
};
/** One of `allowed`, else `def`. */
export const pick = <T extends string>(v: unknown, allowed: readonly T[], def: T): T => (allowed.includes(String(v) as T) ? (String(v) as T) : def);

/** FNV-1a 32-bit: a stand-in for a switch's (vendor-specific) flow hash. */
export const fnv32 = (s: string): number => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
};
export const hex2 = (n: number): string => n.toString(16).padStart(2, "0");
export const hex4 = (n: number): string => `0x${n.toString(16).padStart(4, "0")}`;

const ipWords = (ip: string): [number, number] => {
  const o = ip.split(".").map(Number);
  return [((o[0]! << 8) | o[1]!) >>> 0, ((o[2]! << 8) | o[3]!) >>> 0];
};
/** The real IPv4 header checksum (RFC 791 ones' complement) for a 20-byte header. */
export function ipv4Checksum(h: { tos?: number; totalLength: number; id: number; flagsFragment: number; ttl: number; protocol: number; src: string; dst: string }): string {
  const words = [0x4500 | (h.tos ?? 0), h.totalLength, h.id, h.flagsFragment, (h.ttl << 8) | h.protocol, 0, ...ipWords(h.src), ...ipWords(h.dst)];
  let sum = words.reduce((a, b) => a + b, 0);
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return hex4(~sum & 0xffff);
}

// ---------- Meridian reference data (from the track brief) ----------

export const SITES = { ams: 1, sin: 2, sjc: 3 } as const;
export type Site = keyof typeof SITES;

const DEVICE = /^(spine|leaf|rr|gw)(\d+)\.(ams|sin|sjc)$/;

/** Loopback (also the VTEP address): 10.255.<site>.<n>; spines n, leaves 10+n, RRs 100+n, gateways 200+n. */
export function loopback(device: string): string {
  const m = DEVICE.exec(device);
  if (!m) throw new Error(`fabric: ${device} is not a Meridian fabric device`);
  const n = Number(m[2]);
  const base = { spine: 0, leaf: 10, rr: 100, gw: 200 }[m[1] as "spine" | "leaf" | "rr" | "gw"];
  return `10.255.${SITES[m[3] as Site]}.${base + n}`;
}

/**
 * Point-to-point /31 between `leafN.site` and `spineS.site` from 10.254.0.0/16:
 * 10.254.<(site-1)*16 + S>.<2(N-1)>/31, leaf .1 (odd), spine .0 (even). So
 * leaf1.ams–spine1.ams is 10.254.1.0/31, leaf3.ams–spine1.ams 10.254.1.4/31.
 */
export function p2p(leaf: string, spine: string): { net: string; leaf: string; spine: string } {
  const l = DEVICE.exec(leaf);
  const s = DEVICE.exec(spine);
  if (!l || !s || l[1] !== "leaf" || s[1] !== "spine" || l[3] !== s[3]) throw new Error(`fabric: no p2p link ${leaf}–${spine}`);
  const third = (SITES[l[3] as Site] - 1) * 16 + Number(s[2]);
  const fourth = 2 * (Number(l[2]) - 1);
  return { net: `10.254.${third}.${fourth}/31`, leaf: `10.254.${third}.${fourth + 1}`, spine: `10.254.${third}.${fourth}` };
}

/** Distributed anycast gateway MAC, the same on every leaf. */
export const ANYCAST_GW_MAC = "00:00:5e:00:01:01";

export interface MeridianHost {
  ip: string;
  /** From the documentation range 00:00:5e:00:53:00-7f (router ports use 80-ff). */
  mac: string;
  leaf: string;
  vlan: number;
  vni: number;
  vrf: "ACME" | "GLOBEX";
  gateway: string;
}
export const HOSTS: Record<"acme-web1" | "acme-web2" | "acme-db1" | "globex-app1", MeridianHost> = {
  "acme-web1": { ip: "10.1.1.10", mac: "00:00:5e:00:53:0a", leaf: "leaf1.ams", vlan: 100, vni: 10100, vrf: "ACME", gateway: "10.1.1.1" },
  "acme-web2": { ip: "10.1.1.11", mac: "00:00:5e:00:53:0b", leaf: "leaf2.sin", vlan: 100, vni: 10100, vrf: "ACME", gateway: "10.1.1.1" },
  "acme-db1": { ip: "10.1.2.20", mac: "00:00:5e:00:53:14", leaf: "leaf3.ams", vlan: 200, vni: 10101, vrf: "ACME", gateway: "10.1.2.1" },
  "globex-app1": { ip: "10.1.1.10", mac: "00:00:5e:00:53:1a", leaf: "leaf2.ams", vlan: 100, vni: 10200, vrf: "GLOBEX", gateway: "10.1.1.1" },
};
export const TENANTS = {
  ACME: { vrf: "ACME", l3vni: 50001, l2vnis: { 100: 10100, 200: 10101 } as Record<number, number>, subnets: ["10.1.1.0/24", "10.1.2.0/24"] },
  GLOBEX: { vrf: "GLOBEX", l3vni: 50002, l2vnis: { 100: 10200 } as Record<number, number>, subnets: ["10.1.1.0/24"] },
} as const;
/** Route distinguisher <loopback>:<vni> and route target 65000:<vni>. */
export const rd = (device: string, vni: number): string => `${loopback(device)}:${vni}`;
export const rt = (vni: number): string => `65000:${vni}`;
export const AS = { overlay: 65000, meridian: 64500, isp1: 64501, isp2: 64502, transit: 64496, content: 64511, spinesEbgp: 65100 } as const;
/** About 5 microseconds per km one way in fibre. */
export const fibreMs = (km: number): number => (km * 5) / 1000;
export const DISTANCE_KM = { "ams-sin": 10_500, "sin-sjc": 13_600 } as const;

// ---------- renderer ----------

/** Default rows by kind (top to bottom). */
const TIER: Record<FabKind, number> = { cloud: 0, isp: 0, gw: 1, rr: 1, controller: 1, collector: 1, spine: 2, router: 2, leaf: 3, switch: 3, host: 4, server: 4, nic: 5, gpu: 6, cpu: 6 };

export function layout(nodes: FabNode[]): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const auto = nodes.filter((n) => n.x === undefined || n.y === undefined);
  const tiers = [...new Set(auto.map((n) => TIER[n.kind]))].sort((a, b) => a - b);
  for (const [ti, t] of tiers.entries()) {
    const row = auto.filter((n) => TIER[n.kind] === t);
    const y = tiers.length === 1 ? 50 : 6 + (88 * ti) / (tiers.length - 1);
    row.forEach((n, i) => (out[n.id] = [((i + 0.5) * 100) / row.length, y]));
  }
  for (const n of nodes) if (n.x !== undefined && n.y !== undefined) out[n.id] = [n.x, n.y];
  return out;
}

function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(560);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const cw = el.clientWidth;
      if (cw > 0) setW(Math.round(cw));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/**
 * Shorten a label to `max` characters. Device names drop their ".site" suffix
 * first ("leaf1.ams" → "leaf1"); addresses keep their distinguishing tail
 * ("10.255.1.11" → "…5.1.11"); anything else is truncated.
 */
export function fit(label: string, max: number): string {
  if (label.length <= max) return label;
  if (/^[\d.:/]+$/.test(label)) return max <= 1 ? "…" : "…" + label.slice(label.length - (max - 1));
  const head = label.split(".")[0]!;
  if (head.length <= max && head.length < label.length) return head;
  return max <= 1 ? label.slice(0, 1) : label.slice(0, max - 1) + "…";
}

const isRouterish = (k: FabKind) => k === "leaf" || k === "spine" || k === "router" || k === "switch" || k === "gw" || k === "rr";
const halo = { paintOrder: "stroke", stroke: "var(--bg-elev)", strokeWidth: 3, strokeLinejoin: "round" } as const;
const SERIES_TONES: Tone[] = ["active", "compare", "done", "danger", "visited"];

export function FabricRenderer({ frame }: RendererProps<FabricInput, FabricState>) {
  const { state } = frame;
  const [ref, measured] = useWidth();
  const W = Math.max(280, Math.min(760, measured));
  return (
    <div ref={ref} className="flex w-full min-w-0 flex-col gap-3">
      {state.nodes.length > 0 && <Diagram state={state} W={W} />}
      {state.headers && state.headers.stack.length > 0 && <HeaderStack headers={state.headers} />}
      {state.tables.length > 0 && (
        <div className={cn("grid gap-3", state.tables.length > 1 && "sm:grid-cols-2")}>
          {state.tables.slice(0, 2).map((t, i) => (
            <Table key={i} t={t} W={W} />
          ))}
        </div>
      )}
      {state.chart && <Chart c={state.chart} W={W} />}
      {state.log.length > 0 && (
        <div className="rounded-md bg-code px-3 py-2 font-mono text-[11px] text-muted [overflow-wrap:anywhere]">
          {state.log.map((l, i) => (
            <div key={i} className={i === state.log.length - 1 ? "text-fg" : ""}>
              {l}
            </div>
          ))}
        </div>
      )}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "packet" }, { tone: "path", label: "chosen path" }, { tone: "done", label: "ok / delivered" }, { tone: "danger", label: "down / dropped" }, { tone: "compare", label: "changed field" }]} />
    </div>
  );
}

function Diagram({ state, W }: { state: FabricState; W: number }) {
  const pos = layout(state.nodes);
  const ys = [...new Set(Object.values(pos).map(([, y]) => Math.round(y)))].sort((a, b) => a - b);
  const H = state.height ?? Math.max(150, 46 + ys.length * 66);
  const M = 30;
  const TOP = 30;
  const BOTTOM = 30;
  const px = (x: number) => M + (x / 100) * (W - 2 * M);
  const py = (y: number) => TOP + (y / 100) * (H - TOP - BOTTOM);
  const centre: Record<string, [number, number]> = Object.fromEntries(Object.entries(pos).map(([id, [x, y]]) => [id, [px(x), py(y)]]));
  // Box sizes: as wide as the gap to the nearest neighbour in the same row allows.
  const size: Record<string, [number, number]> = {};
  for (const n of state.nodes) {
    const [cx, cy] = centre[n.id]!;
    let gap = Infinity;
    for (const m of state.nodes) {
      if (m === n) continue;
      const [mx, my] = centre[m.id]!;
      if (Math.abs(my - cy) < 34) gap = Math.min(gap, Math.abs(mx - cx));
    }
    const bw = Math.max(26, Math.min(100, gap - 6, 2 * Math.min(cx, W - cx) - 4));
    size[n.id] = [bw, n.state && bw >= 40 ? 38 : 28];
  }
  // Trim a segment so it starts and ends at the box edges.
  const ends = (a: string, b: string): [number, number, number, number] | undefined => {
    const p = centre[a];
    const q = centre[b];
    if (!p || !q) return undefined;
    const [x1, y1] = p;
    const [x2, y2] = q;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const trim = (id: string) => {
      const [bw, bh] = size[id]!;
      const t = Math.min(Math.abs(ux) > 1e-6 ? bw / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? bh / 2 / Math.abs(uy) : Infinity);
      return Math.min(len / 2 - 1, t + 2);
    };
    const ta = trim(a);
    const tb = trim(b);
    return [x1 + ux * ta, y1 + uy * ta, x2 - ux * tb, y2 - uy * tb];
  };
  const clampX = (x: number, chars: number, font: number) => {
    const half = (chars * font * 0.58) / 2 + 2;
    return Math.max(half, Math.min(W - half, x));
  };
  const maxPacketChars = Math.max(16, Math.floor(W / 9));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block" role="img" aria-label="Network diagram">
      {state.links.map((l) => {
        const e = ends(l.a, l.b);
        if (!e) return null;
        const [x1, y1, x2, y2] = e;
        const tone = l.tone ?? "default";
        const stroke = l.down ? "var(--danger)" : tone === "default" ? "var(--fg-muted)" : toneStroke[tone];
        const sw = l.down ? 1.5 : 1.5 + Math.max(0, Math.min(1, l.width ?? 0)) * 6;
        const t = l.labelAt ?? 0.5;
        const lx = x1 + (x2 - x1) * t;
        const ly = y1 + (y2 - y1) * t;
        return (
          <g key={l.id} opacity={tone === "muted" ? 0.35 : tone === "default" && !l.down ? 0.55 : 1}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeDasharray={l.down || l.dashed ? "5 4" : undefined} />
            {l.down && (
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 4} fontSize="12" textAnchor="middle" fill="var(--danger)" fontWeight={700} style={halo}>
                ✕
              </text>
            )}
            {l.label && (
              <text x={clampX(lx, l.label.length, 9)} y={ly - 4} fontSize="9" textAnchor="middle" fill="var(--fg)" style={halo}>
                {l.label}
              </text>
            )}
          </g>
        );
      })}
      {state.nodes.map((n) => {
        const [cx, cy] = centre[n.id]!;
        const [bw, bh] = size[n.id]!;
        const tone = n.tone ?? "default";
        // Shrink the font one step before shortening the label.
        const base = bw >= 84 ? 11 : bw >= 58 ? 10 : 9;
        const charsAt = (fs: number) => Math.max(2, Math.floor((bw - 6) / (fs * 0.6)));
        const font = n.label.length > charsAt(base) && n.label.length <= charsAt(base - 1) ? base - 1 : base;
        const chars = charsAt(font);
        const subChars = Math.max(2, Math.floor((bw - 4) / (9 * 0.56)));
        const cloudish = n.kind === "cloud" || n.kind === "isp";
        const soft = n.kind === "collector" || n.kind === "controller";
        const fill = tone === "muted" ? "var(--bg-elev)" : toneFill[tone];
        const stroke = toneStroke[tone];
        const swidth = tone === "default" || tone === "muted" ? 1.5 : 2.5;
        return (
          <g key={n.id} opacity={tone === "muted" ? 0.55 : 1}>
            <title>{`${n.label} (${n.kind})${n.state ? `: ${n.state}` : ""}`}</title>
            {cloudish ? (
              <ellipse cx={cx} cy={cy} rx={bw / 2} ry={bh / 2 + 2} fill={fill} stroke={stroke} strokeWidth={swidth} strokeDasharray="4 3" />
            ) : (
              <rect x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh} rx={isRouterish(n.kind) ? 4 : 10} fill={fill} stroke={stroke} strokeWidth={swidth} strokeDasharray={soft ? "4 3" : undefined} />
            )}
            <text x={cx} y={cy + (n.state && bh > 30 ? -2 : 4)} fontSize={font} textAnchor="middle" fill="var(--fg)" fontWeight={600}>
              {fit(n.label, chars)}
            </text>
            {n.state && bh > 30 && (
              <text x={cx} y={cy + 12} fontSize="9" textAnchor="middle" fill="var(--fg-muted)" fontFamily="var(--font-mono)">
                {fit(n.state, subChars)}
              </text>
            )}
          </g>
        );
      })}
      {state.packets.map((p, i) => {
        const e = ends(p.from, p.to);
        if (!e) return null;
        const [x1, y1, x2, y2] = e;
        const t = Math.max(0, Math.min(1, p.progress));
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
        const colour = p.lost ? "var(--danger)" : toneStroke[p.tone];
        const label = p.label.length > maxPacketChars ? p.label.slice(0, maxPacketChars - 1) + "…" : p.label;
        // On a near-horizontal link the label goes above the boxes it runs between.
        const flat = Math.abs(Math.sin((deg * Math.PI) / 180)) < 0.35;
        const above = flat ? -(Math.max(size[p.from]![1], size[p.to]![1]) / 2 + 6) : -11;
        const dy = state.packets.length > 1 && i % 2 === 1 ? 20 : above;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x} y2={y} stroke={colour} strokeWidth={2.5} strokeLinecap="round" opacity={0.7} />
            <g transform={`translate(${x} ${y}) rotate(${deg})`}>
              <path d="M -10 -6 L 5 -6 L 10 0 L 5 6 L -10 6 Z" fill={colour} stroke="var(--bg-elev)" strokeWidth={1} />
            </g>
            {p.lost && (
              <text x={x} y={y + 4} fontSize="11" textAnchor="middle" fill="white" fontWeight={700}>
                ✕
              </text>
            )}
            <text x={clampX(x, label.length, 9)} y={Math.max(10, Math.min(H - 4, y + dy))} fontSize="9" textAnchor="middle" fill="var(--fg)" fontWeight={600} style={halo}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function HeaderStack({ headers }: { headers: NonNullable<FabricState["headers"]> }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-muted">
        Headers, outermost first{headers.at ? <span className="text-fg">: {headers.at}</span> : null}
      </div>
      {headers.stack.map((h, i) => (
        <div
          key={`${h.name}-${i}`}
          className={cn("rounded-md border border-l-4 px-2 py-1 text-[11px]", h.fresh && "ring-2 ring-accent/50")}
          style={{ borderColor: h.tone && h.tone !== "default" ? toneStroke[h.tone] : "var(--border)", background: h.tone && h.tone !== "default" && h.tone !== "muted" ? `color-mix(in srgb, ${toneStroke[h.tone]} 10%, var(--bg-elev-2))` : "var(--bg-elev-2)" }}
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-fg">{h.name}</span>
            {h.size && <span className="text-muted">{h.size}</span>}
            {h.fresh && <span className="rounded bg-accent/20 px-1 text-[10px] text-fg">added</span>}
            {h.reader && <span className="text-muted">· {h.reader}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono [overflow-wrap:anywhere]">
            {h.fields.map((f) => (
              <span key={f.k} className={cn("rounded px-0.5", f.hot && "bg-warn/25 text-fg ring-1 ring-warn/60")}>
                <span className="text-muted">{f.k}</span> {f.v}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const rowClass: Partial<Record<Tone, string>> = {
  active: "bg-accent/15",
  path: "bg-accent/25",
  done: "bg-success/10",
  visited: "bg-success/5",
  danger: "bg-danger/15",
  compare: "bg-warn/15",
  frontier: "bg-warn/10",
  muted: "opacity-50",
};

function Table({ t, W }: { t: FabTable; W: number }) {
  // Cells keep short tokens (MACs, addresses) on one line; if the table still
  // overflows its box (a phone), every cell may break anywhere instead.
  const ref = useRef<HTMLDivElement | null>(null);
  const [squeeze, setSqueeze] = useState(false);
  useLayoutEffect(() => setSqueeze(false), [t, W]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !squeeze && el.scrollWidth > el.clientWidth + 1) setSqueeze(true);
  }, [t, W, squeeze]);
  const narrow = W < 420;
  return (
    <div ref={ref} className="min-w-0 overflow-x-auto">
      <div className="mb-1 text-[11px] text-muted">{t.title}</div>
      <table className={cn("w-full border-collapse", narrow ? "text-[10px]" : "text-[11px]")}>
        {t.head && (
          <thead>
            <tr>
              {t.head.map((h, i) => (
                <th key={i} className={cn("py-0.5 text-left font-medium text-muted", narrow ? "px-1" : "px-1.5")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {t.rows.map((r, i) => {
            const tone = t.tones?.[i];
            return (
              <tr key={i} className={tone ? rowClass[tone] : undefined}>
                {r.map((c, j) => (
                  <td key={j} className={cn("border-t border-line py-0.5 align-top font-mono", narrow ? "px-1" : "px-1.5", squeeze || /\s/.test(c) || c.length > 18 ? "[overflow-wrap:anywhere]" : "whitespace-nowrap")}>
                    {c}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function Chart({ c, W }: { c: FabChart; W: number }) {
  const H = 130;
  const L = 36;
  const R = 8;
  const T = 10;
  const B = 18;
  const n = Math.max(1, ...c.series.map((s) => s.points.length));
  const all = [...c.series.flatMap((s) => s.points.filter((v): v is number => v !== null)), ...(c.marks ?? []).map((m) => m.y)];
  const yMax = c.yMax ?? niceMax(Math.max(0, ...all) * 1.05);
  const x = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - Math.max(0, Math.min(yMax, v)) / yMax) * (H - T - B);
  const colour = (s: FabSeries, i: number) => toneStroke[s.tone ?? SERIES_TONES[i % SERIES_TONES.length]!];
  return (
    <div>
      <div className="mb-1 text-[11px] text-muted">
        {c.title}
        {c.unit ? ` (${c.unit})` : ""}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block" role="img" aria-label={c.title}>
        <line x1={L} y1={y(0)} x2={W - R} y2={y(0)} stroke="var(--border)" />
        <line x1={L} y1={y(yMax)} x2={W - R} y2={y(yMax)} stroke="var(--border)" strokeDasharray="2 3" />
        <text x={L - 4} y={y(0) + 3} fontSize="9" textAnchor="end" fill="var(--fg-muted)">
          0
        </text>
        <text x={L - 4} y={y(yMax) + 3} fontSize="9" textAnchor="end" fill="var(--fg-muted)">
          {yMax}
        </text>
        {c.xLabel && (
          <text x={W - R} y={H - 4} fontSize="9" textAnchor="end" fill="var(--fg-muted)">
            {c.xLabel}
          </text>
        )}
        {(c.marks ?? []).map((m, i) => (
          <g key={`m${i}`}>
            <line x1={L} y1={y(m.y)} x2={W - R} y2={y(m.y)} stroke={toneStroke[m.tone ?? "compare"]} strokeDasharray="5 4" strokeWidth={1.2} />
            <text x={W - R} y={y(m.y) - 3} fontSize="9" textAnchor="end" fill="var(--fg)" style={halo}>
              {m.label}
            </text>
          </g>
        ))}
        {c.series.map((s, si) => {
          const segs: string[] = [];
          let cur = "";
          s.points.forEach((v, i) => {
            if (v === null) {
              if (cur) segs.push(cur);
              cur = "";
              return;
            }
            cur += `${cur ? " L" : "M"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
          });
          if (cur) segs.push(cur);
          const lastI = s.points.length - 1;
          const last = s.points[lastI];
          return (
            <g key={s.name}>
              {segs.map((d, k) => (
                <path key={k} d={d} fill="none" stroke={colour(s, si)} strokeWidth={2} strokeLinejoin="round" />
              ))}
              {last !== null && last !== undefined && <circle cx={x(lastI)} cy={y(last)} r={3} fill={colour(s, si)} />}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted">
        {c.series.map((s, si) => {
          const last = [...s.points].reverse().find((v) => v !== null);
          return (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: colour(s, si) }} />
              {s.name}
              {last !== undefined && last !== null ? <span className="font-mono text-fg">{last}</span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
