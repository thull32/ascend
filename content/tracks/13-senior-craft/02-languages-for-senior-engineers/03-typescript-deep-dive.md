---
slug: typescript-deep-dive
title: "TypeScript deep dive: structural types, narrowing, variance, discriminated unions and erasure"
description: How TypeScript's structural type system, control-flow narrowing, generics and variance, satisfies and discriminated unions work, what erases before the code runs, where the types stop being true, and how this app's frontend uses them, with real compiler errors traced and runtime costs measured.
minutes: 32
difficulty: medium
tags: [typescript, javascript, type-system, generics, variance, discriminated-unions, narrowing, event-loop, languages]
---
The first line of `web/src/lib/types.ts` reads: "Mirrors the JSON shapes produced by crates/api. Keep in sync with the Rust `Serialize` structs; the API is the source of truth." That comment is the whole TypeScript story in two sentences. The types describe values the compiler never sees. They are erased before the code runs. If the Rust side renames a field, the frontend still compiles, and the bug appears in a user's browser as `undefined`.

And yet TypeScript removes whole categories of bugs, *if* you model data so the compiler can reason about it. The senior skill has three parts: design types so illegal states cannot be written down, know exactly where types are claims rather than facts, and keep those places few, obvious and guarded. This lesson works through the mechanisms using the app's own frontend. Every error message below is real output from `tsc 5.9.3` with `--strict`, and every timing is from Node 24.21 on a Ryzen 9 9950X3D under WSL2.

## Under the hood: two jobs, and only one survives

`tsc` does two independent things. It **type-checks** the program, and it **emits** JavaScript by deleting the types. The check never influences the output: a program with type errors still emits (unless `noEmitOnError` is set), and the emitted code is the same either way. Here is a file and what `tsc --target ES2022` produced from it:

```typescript
interface User { id: string; name: string }
type UserId = string & { readonly __brand: "UserId" };

function greet(u: User, id: UserId): string {
  const tag = id as string;
  return `${u.name} (${tag})`;
}

const cfg = { retries: 3 } satisfies Record<string, number>;
console.log(greet({ id: "u1", name: "Ana" } as User, "u1" as UserId), cfg.retries);
```

```javascript
function greet(u, id) {
    const tag = id;
    return `${u.name} (${tag})`;
}
const cfg = { retries: 3 };
console.log(greet({ id: "u1", name: "Ana" }, "u1"), cfg.retries);
```

The interface, the brand, both `as` casts and the `satisfies` vanished; nothing is left to check anything at run time. A few constructs are not erasable because they generate code: `enum` (the same file with `enum Level { Low, High }` emitted an IIFE that builds a two-way lookup object), `namespace` with values, and constructor parameter properties. The distinction is now enforced by runtimes. Node 24 runs `.ts` files directly by stripping types: the first file ran unchanged, and the `enum` file failed with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript enum is not supported in strip-only mode`. TypeScript 5.8 added `--erasableSyntaxOnly` to reject those constructs at compile time. Use a union of string literals or an `as const` object instead of an `enum` and the question disappears.

| Construct | Emitted code | Checked at run time? |
|---|---|---|
| `interface`, `type`, annotations, generics | Nothing | No |
| `x as T`, `x!`, `x satisfies T` | The bare expression | No |
| `enum`, value `namespace`, parameter properties | Real JavaScript | Only what that code does |
| `typeof x === "string"`, `"k" in x`, `x instanceof C` | Unchanged | Yes: these are JavaScript |

The check's cost is all at build time: type-checking this app's frontend (71 source files, 21,284 lines, tests excluded as `tsconfig.app.json` does) took 2.6 s and 508 MB of memory, and added zero bytes to the bundle.

## Structural typing: shapes, not names

TypeScript decides assignability by shape. A value fits a type if it has at least the required properties with compatible types; the type's name is irrelevant:

```typescript
interface LessonRef { slug: string; title: string } // from lib/types.ts

const summary = { slug: "hash-tables", title: "Hash tables", minutes: 40 };
const ref: LessonRef = summary; // OK: summary has slug and title; minutes is ignored
const ref2: LessonRef = { slug: "x", title: "y", minutes: 1 };
// error TS2353: Object literal may only specify known properties, and 'minutes' does not exist in type 'LessonRef'.
```

The second assignment fails only because of **excess property checking**, a lint-like rule for *fresh* object literals. Route the same object through a variable and it passes, which is why a typo in an optional property (`{ titel: "..." }`) sometimes slips through. Structural typing also makes every `string` interchangeable: `User.id`, `Interview.id` and `Conversation.id` are all `string` in `types.ts`, so passing an interview ID where a user ID belongs compiles. A *branded* type such as `UserId` above fixes that; the brand exists only in the checker, and producing one requires a deliberate cast where you know it is valid.

## Unions and narrowing, traced

A union says a value is one of several types, and literal types make individual values into types (`export type Difficulty = "intro" | "easy" | "medium" | "hard" | "expert";`). Given a union, the checker performs **control-flow narrowing**: after a check it knows which members remain. It understands `typeof`, `=== null`, `instanceof`, `"prop" in x`, truthiness, equality with a literal, and user-defined guards (`function isRun(m): m is RunResponse`). Trace the worker message handler in `web/src/runner/index.ts`:

```typescript
w.onmessage = (ev: MessageEvent<RunnerResponse>) => {
  const msg = ev.data;
  if (msg.kind === "ready") { /* ... */ return; }
  if (msg.kind === "status") {
    this.statusListeners.forEach((l) => l(msg.message));
    return;
  }
  const p = this.pending.get(msg.id);
  // ...
};
```

| Point in the code | Type of `msg` | Why |
|---|---|---|
| After `const msg = ev.data` | `RunResponse \| EvalResponse \| ReadyResponse \| StatusResponse` | The declared message type |
| Inside `if (msg.kind === "status")` | `StatusResponse` | Only one member has that literal `kind` |
| Inside the arrow function passed to `forEach` | `StatusResponse` | `msg` is `const`, so the narrowing survives into the closure |
| After both `if` blocks | `RunResponse \| EvalResponse` | Each block returned, eliminating two members |
| `msg.id` at `pending.get` | `number` | `-1` belonged only to the two eliminated members |

The closure row has a version-sensitive twin. Declare `msg` with `let` and the narrowing still reaches the closure on TypeScript 5.4 and later, provided there is no assignment to `msg` after the closure is created; add one and `tsc` reports `Property 'message' does not exist on type 'RunnerResponse'`. Narrowing is also deliberately unsound in one direction: calling a function does not reset narrowed *properties*, even though the function could have changed them. The checker chose usability over soundness there.

Truthiness narrowing is the trap. `if (user.weekly_hours)` is false for a user who set zero hours, and `if (name)` rejects the empty string. Compare with `null` explicitly when zero or `""` are legal. The app compiles with `noUncheckedIndexedAccess`, which types `arr[i]` as `T | undefined`, matching JavaScript's behaviour for out-of-range reads; each `!` you see, as in `assign[i]!` in the ML visualiser, is a small reviewable claim that the index is in bounds.

## Discriminated unions: the runner protocol

The UI talks to the code runners (Web Workers executing Python or JavaScript) over `postMessage`. `web/src/runner/protocol.ts`, condensed to one line per type:

```typescript
export interface RunRequest { id: number; kind: "run"; code: string; entry: string; tests: TestCase[]; timeLimitMs: number }
export interface EvalRequest { id: number; kind: "eval"; code: string; timeLimitMs: number }
export type RunnerRequest = RunRequest | EvalRequest;

export interface RunResponse { id: number; kind: "run"; results: TestResult[]; compileError?: string; totalMs: number }
export interface EvalResponse { id: number; kind: "eval"; stdout: string; error?: string; ms: number }
export interface ReadyResponse { id: -1; kind: "ready" }
export interface StatusResponse { id: -1; kind: "status"; message: string }
export type RunnerResponse = RunResponse | EvalResponse | ReadyResponse | StatusResponse;
```

Every member has a `kind` whose type is a distinct string literal: the **discriminant**. Even `id: -1` is a literal type, documenting that lifecycle messages answer no request. The strongest consumer is a `switch` with an exhaustiveness check:

```typescript
function describe(msg: RunnerResponse): string {
  switch (msg.kind) {
    case "run":
      return `${msg.results.filter((r) => r.passed).length}/${msg.results.length} passed`;
    case "eval":
      return msg.error ?? msg.stdout;
    case "ready":
      return "runtime ready";
    case "status":
      return msg.message;
    default: {
      const unreachable: never = msg; // compile error if a kind is added and not handled
      return unreachable;
    }
  }
}
```

In each `case`, `msg` has exactly the right type. In `default`, every member is eliminated and `msg` is `never`. Adding `interface CrashedResponse { id: number; kind: "crashed"; reason: string }` to the union produced `error TS2322: Type 'CrashedResponse' is not assignable to type 'never'` at that line, and would at every switch that must decide what a crash means. It is the guarantee Rust gives with an exhaustive `match` on `AppError`, and not by coincidence: serde's `#[serde(tag = "kind")]` serialises a Rust enum into exactly this JSON shape.

`Interview.evaluation` in `types.ts` shows the alternative: `Evaluation | { summary: string } | null`. The members have no discriminant, so `InterviewRoom.tsx` sniffs with `"dimensions" in ev`, a check that silently breaks the day the fallback shape gains a `dimensions` field. The same idea fixes the commonest frontend state bug:

```typescript
// Admits 2 × 2 × 2 = 8 combinations, several nonsensical (loading with data and an error)
interface Bad<T> { loading: boolean; error?: string; data?: T }

// Admits exactly the four real states
type Status<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: T };
```

## The SSE boundary: from bytes to typed events

Streaming replies from the coach and interviewer arrive over Server-Sent Events. `EventSource` cannot POST a JSON body, so `streamPost` in `web/src/lib/api.ts` reads the response with `fetch` and feeds text into `createSseParser` from `web/src/lib/sse.ts`. The parser is the honest part of the boundary: it types its output as `{ event: string; data: string }`, nothing more, and implements the WHATWG line rules precisely (a line ends at CRLF, LF or a lone CR; a CR at the end of a chunk is held back until the next chunk shows whether an LF follows; a blank line dispatches; `:` lines are the server's keep-alive comments). The Rust side, `respond` in `crates/api/src/routes/sse.rs`, writes `delta`, `done` and `error` events, with `done` carrying JSON.

The claim is one layer up. `streamPost` dispatches on the event name and calls `handlers.onDone?.(JSON.parse(data))`. `JSON.parse` returns `any`, and `any` is assignable to the handler's parameter type `{ input_tokens: number; output_tokens: number; stop_reason: string | null }` without a check. It is well contained: a `try`/`catch` substitutes zeros when the payload is not JSON. The shape is still a claim, though, and the types would not notice if the Rust side renamed `stop_reason`. The exercises below build the parser and fold its events.

## Generics and variance, traced through the visualisation engine

A generic type is a function from types to types. `web/src/viz/engine.ts` defines the engine behind every visualiser:

```typescript
export interface Frame<S> { state: S; note: string; tag?: string }
export type Generator<I, S> = (input: I) => Frame<S>[];

export interface Family<I = Record<string, unknown>, S = unknown> {
  name: string;
  algorithms: Record<string, Generator<I, S>>;
  Renderer: ComponentType<RendererProps<I, S>>;
  examples: Record<string, I>;
  normalise?: (raw: Record<string, unknown>) => I;
  // ...
}
```

Within one family the generator's input, the examples, `normalise`'s output and the renderer's props must agree on `I`, and the compiler checks that. The interesting line is in `viz/families/index.ts`, which puts every family in one registry:

```typescript
const f = <I, S>(x: Family<I, S>) => x as unknown as Family<never, unknown>;
```

The registry wants "a family for *some* `I`": an existential type, which TypeScript lacks. Why not assign each family to `Family<unknown, unknown>`? **Variance.** Assigning `Family<ArrayInput, ...>` to both candidate supertypes, `tsc` reported:

```text
error TS2322: Type 'Family<ArrayInput, { i: number; }>' is not assignable to type 'Family<unknown, unknown>'.
  Types of property 'algorithms' are incompatible.
    ...
        Type 'Generator<ArrayInput, { i: number; }>' is not assignable to type 'Generator<unknown, unknown>'.
          Type 'unknown' is not assignable to type 'ArrayInput'.
error TS2322: Type 'Family<ArrayInput, { i: number; }>' is not assignable to type 'Family<never, unknown>'.
  Types of property 'examples' are incompatible.
    Type 'Record<string, ArrayInput>' is not assignable to type 'Record<string, never>'.
```

Trace both. For `unknown`: `algorithms` holds functions that *take* an `I`. A function that needs an `ArrayInput` cannot stand in for one that accepts anything, so in parameter position subtyping runs backwards (**contravariance**) and the check demands `unknown` be assignable to `ArrayInput`, which fails. For `never`: `examples` *holds* `I` values, an output position where subtyping runs forwards (**covariance**), so `ArrayInput` must be assignable to `never`, which fails. `I` appears in both positions, so `Family` is **invariant** in `I`: no other instantiation is a supertype. The double cast records that decision; what keeps it safe is a run-time convention, since `VizBlock` hands each family the output of that family's own `normalise`. TypeScript 4.7 lets you state variance explicitly (`interface Box<in out T>`), which turns an accidental use in the wrong position into an error at the declaration.

Two soundness holes are worth knowing because both compiled cleanly under `--strict`. Arrays are covariant even though they are mutable, so `const animals: Animal[] = dogs; animals.push(cat)` puts a cat in `dogs`. And methods declared with method shorthand (`handle(a: Animal): void`) have their parameters checked **bivariantly**: an object whose `handle` needs a `Dog` was accepted as a `MethodStyle`, while the same object against `handle: (a: Animal) => void` failed with "Types of parameters 'd' and 'a' are incompatible". Prefer property syntax for callbacks in interfaces you want checked.

A cast-free alternative erases with a closure, so the pairing of `normalise` and generator is checked inside a generic function and only a type-free interface escapes:

```typescript
interface ErasedFamily {
  algorithms: string[];
  run(algorithm: string, raw: Record<string, unknown>): Frame<unknown>[];
}

function erase<I, S>(family: Family<I, S>): ErasedFamily {
  return {
    algorithms: Object.keys(family.algorithms),
    run(algorithm, raw) {
      const generate = family.algorithms[algorithm]; // Generator<I, S> | undefined
      if (!generate || !family.normalise) return [];
      return generate(family.normalise(raw)); // I flows from normalise to generate, checked
    },
  };
}
```

## Utility, mapped and conditional types

| In the code | What it computes |
|---|---|
| `interface Track extends Omit<TrackOverview, "modules">` | `TrackOverview` without `modules`, so `Track` can redefine it as `Module[]` |
| `Partial<Record<"js" \| "py", WorkerHandle>>` | Optional `js` and `py` keys, filled lazily with `??=` |
| `ReturnType<typeof setTimeout>` | The timer handle type in this environment (a number in browsers, an object in Node) |
| `Omit<RunRequest, "id"> \| Omit<EvalRequest, "id">` | A request before the handle assigns its ID |

That last one, from `WorkerHandle.send`, hides a trap: why not `Omit<RunnerRequest, "id">`? Because `Omit` is not **distributive**. It computes `keyof (RunRequest | EvalRequest)`, only the shared keys, and builds one object type from them. The object `{ kind: "run", code: "x" }`, which has no `entry` and no `tests`, type-checked against that merged `Omit`. Against the per-member version it failed with "Property 'entry' is missing". Conditional types on a naked type parameter apply to each member separately, which gives the fix:

```typescript
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type NewRequest = DistributiveOmit<RunnerRequest, "id">;
// = Omit<RunRequest, "id"> | Omit<EvalRequest, "id">
```

`infer` extracts types: `type ElementOf<T> = T extends readonly (infer E)[] ? E : never`. With `const SPEEDS = [0.5, 1, 2, 4] as const` in `VizPlayer.tsx`, the element type is `0.5 | 1 | 2 | 4`, so a speed of `3` is a compile error; the player writes it as `(typeof SPEEDS)[number]`.

## Where types stop being true

Every `as`, every `any`, and every annotation on data that crosses a boundary is a claim. `request` in `lib/api.ts`, which every JSON call goes through, ends with `return data as T;`, so `api.get<Curriculum>("/curriculum")` asserts the JSON is a `Curriculum`. If the backend renames `lesson_count`, the frontend compiles and renders "undefined lessons".

`satisfies` checks without casting, and it is the tool for literals:

```typescript
self.postMessage({ id: -1, kind: "ready" } satisfies RunnerResponse); // from py.worker.ts

const a = { id: -1, kind: "status" } as RunnerResponse;        // compiles: 'message' silently missing
const b = { id: -1, kind: "status" } satisfies RunnerResponse;
// error TS1360: Type '{ id: -1; kind: "status"; }' does not satisfy the expected type 'RunnerResponse'.
//   Property 'message' is missing in type '{ id: -1; kind: "status"; }' but required in type 'StatusResponse'.
```

`as` accepts any type that sufficiently overlaps; `satisfies` demands conformance and keeps the literal's narrow type. In review, look for casts that could be `satisfies`: `WorkerHandle.send` posts `{ ...req, id } as RunnerRequest`, and the same expression with `satisfies RunnerRequest` type-checked, so the cast gives up a check it did not need to.

What does honesty cost at the boundary? Measured on 100,000 lesson-shaped objects (114 bytes of JSON each): `JSON.parse` took 281 ns per object, and a hand-written guard checking every field's type took 6.9 ns, about 2.5% on top. A schema library costs more than a hand-written guard because it builds error paths, but the parse dominates either way. `unknown` is the safe top type for untrusted input (you must narrow before use, unlike `any`, which switches checking off and spreads), and each visualiser family's `normalise(raw: Record<string, unknown>)` is "parse, don't validate": the array family converts values with `Number`, drops non-finite ones and caps the length at 40.

| Boundary strategy | Catches drift | Run-time cost | Build or CI cost | Fits |
|---|---|---|---|---|
| Trust (`data as T`) | In a user's browser | None | None | Code you build and ship together (the worker protocol) |
| Hand-written guards | At the edge, loudly | About 7 ns per object measured | Guards to maintain | A few hot payloads |
| Schema library (zod, valibot) | At the edge, with error paths | More than a guard; bundle size | A dependency | Many external payloads |
| Types generated from Rust or OpenAPI (ts-rs, specta) | At build time | None | Build integration | One team owning both sides, as here |
| Contract tests | In CI | None | CI time | Many consumers of one API |

## The runtime underneath: one thread and an event loop

TypeScript's concurrency model is JavaScript's: one thread per page or worker, an event loop, and queues. The loop runs the current script to completion, then drains *all* microtasks (promise reactions), then runs *one* macrotask (a timer, an I/O callback, a message), then drains microtasks again. Measured: a `setTimeout(..., 0)` scheduled before a 50 ms synchronous loop fired at 50.2 ms, after two queued microtasks, never in the middle.

```viz
{"type": "concurrency", "algorithm": "event-loop",
 "title": "Why await never makes CPU work parallel",
 "caption": "Timers and network I/O happen on host threads, but every callback runs on the one JavaScript thread. A long synchronous loop delays every timer, click and response queued behind it."}
```

`async`/`await` gives interleaving, not parallelism. That is why the runner executes learner code in Web Workers and why `runner/index.ts` enforces time limits by calling `worker.terminate()` from the main thread, "the only reliable way to stop a runaway loop in JS or Python" in its own comment. Three async bugs to recognise in review: `items.forEach(async (x) => await save(x))` waits for nothing; sequential `await`s over independent requests turn 10 × 100 ms into a second; and cancellation is cooperative (`fetch` takes an `AbortSignal`, which `request` threads through, but nothing cancels a promise from outside).

## Failure modes in production

**Symptom: a page renders "undefined lessons" after a backend deploy; no error in the console, and `tsc` passed.** Diagnosis: API drift behind `data as T`; the network tab shows the renamed field. Fix: generate the types from the Rust structs or validate the payload at `request`, so drift fails the build or fails loudly at the edge.

**Symptom: a status message renders as blank in production, though the code "type-checks".** Diagnosis: an object literal built with `as RunnerResponse` omitted a required field; `as` only needs overlap. Fix: `satisfies` for literals, and a lint rule against `as` on object literals.

**Symptom: a new request field is silently dropped in one code path.** Diagnosis: a plain `Omit` over a union collapsed it to the shared keys, so the object type-checked without the member-specific fields. Fix: a distributive `Omit`, and a test that sends each request kind.

**Symptom: users who chose 0 weekly hours see the onboarding prompt again.** Diagnosis: truthiness narrowing, `if (user.weekly_hours)`, treats 0 as missing. Fix: compare with `null` or `undefined` explicitly.

**Symptom: a queue-based BFS in the browser takes a second on a large graph.** Diagnosis: `Array.prototype.shift` is O(n) once arrays are large: measured in Node 24, draining 10,000 items with `shift()` cost 31 ns per call, 100,000 items cost 2.1 µs per call, and 200,000 cost 4.8 µs, 0.95 s in total. Fix: a head index or a ring buffer.

## TypeScript and JavaScript in interviews

| Interview need | JavaScript or TypeScript idiom | Trap |
|---|---|---|
| Numeric sort | `xs.sort((a, b) => a - b)` | Default sort compares strings: `[10, 9, 1].sort()` gave `[1, 10, 9]` |
| Frequency count | `m.set(k, (m.get(k) ?? 0) + 1)` on a `Map` | Plain objects coerce keys to strings |
| Queue | Array plus head index | `shift()` is O(n) on large arrays |
| Heap | Write one (about 30 lines) | None built in |
| Integer maths | `Number.isSafeInteger`, `BigInt` | `2 ** 53 + 1` printed 9007199254740992 |
| Modulo | `((a % m) + m) % m` | `-7 % 2` is `-1` |
| Typing a solution | Annotate the signature only | Elaborate types cost minutes and earn nothing in a coding round |

In frontend loops, expect type-level questions: write a discriminated-union reducer, implement `DeepPartial<T>`, explain `unknown` versus `any`, or explain why a cast is needed.

## Interviewer follow-ups

**"What is the difference between `as` and `satisfies`?"** Model answer: `as` asserts and is accepted whenever the types overlap, so it can hide a missing field; `satisfies` checks that the expression conforms and keeps its narrow inferred type; both erase to nothing. Common wrong answer: "`satisfies` validates at run time".

**"Why can't `Family<ArrayInput>` be assigned to `Family<unknown>`?"** Model answer: `I` is a function parameter in `algorithms` (contravariant) and an output in `examples` (covariant), so the type is invariant in `I`; the compiler's error chain points at `algorithms` for `unknown` and at `examples` for `never`. Common wrong answer: "`unknown` is the top type, so everything is assignable", which is true of values, not of generic instantiations.

**"How do you make a switch over a union exhaustive?"** Model answer: switch on a literal discriminant and assign the value to `never` in `default`; adding a member becomes a compile error at every such switch, and you keep a run-time default for unknown wire values anyway. Common wrong answer: "add a `default` that throws", which only fails at run time, in production.

**"Where are the types in this codebase not true?"** Model answer: every `as`, `any` and annotated `JSON.parse` or `postMessage` result; here `request`'s `data as T` and `onDone(JSON.parse(data))`; guard the external ones with validation, generated types or contract tests. Common wrong answer: "nowhere, we use strict mode".

**"Is TypeScript's type system sound?"** Model answer: no, deliberately: covariant mutable arrays, bivariant method parameters and narrowings that survive function calls all compile; you avoid them with `readonly` arrays, property-style callbacks and re-checking after calls. Common wrong answer: "yes, with `strict: true`".

## What mid-level engineers get wrong

- **Casting until the red squiggle disappears.** Consequence: the type now lies, and the bug surfaces at run time far from the cast.
- **Treating `strict` as a guarantee.** Consequence: API drift, `as` literals and array covariance still reach production.
- **Using `enum` by habit.** Consequence: code that Node's type stripping and `--erasableSyntaxOnly` reject, plus a runtime object you did not need.
- **Modelling state as independent booleans and optionals.** Consequence: eight representable states for four real ones, and defensive code in every consumer.
- **`forEach(async ...)` and sequential awaits.** Consequence: unawaited writes, or latency that adds up instead of overlapping.
- **Plain `Omit` or `Pick` over a union.** Consequence: member-specific fields vanish from the type without an error.

## Exercises

The first exercise folds the events that the app's SSE client consumes, the browser-side mirror of the Rust `pump` function, treating them as a discriminated union on `kind`. The second builds the parser that produces those events, with every expected output generated by running the app's own `createSseParser`.

```exercise
id: fold-stream-events
title: Fold a stream of tagged events
prompt: |
  `events` is a list of objects, each with a `kind` field. Fold them into a
  single result object with exactly these keys:
  `text` (string, starts ""), `input_tokens` and `output_tokens` (start 0),
  `stop_reason` and `error` (start null), and `ignored` (starts 0).

  Rules, applied in order:
  - `{"kind": "delta", "text": s}` appends `s` to `text`.
  - `{"kind": "done", "input_tokens": a, "output_tokens": b, "stop_reason": r}`
    copies those three values and ends the stream.
  - `{"kind": "error", "message": m}` sets `error` to `m` and ends the stream.
  - Any event after the stream has ended increments `ignored` and changes nothing else.
  - An event with any other `kind` (a newer server may send kinds you do not know)
    increments `ignored` and does not end the stream.
languages: [python, javascript]
entry: fold_stream
starter:
  python: |
    def fold_stream(events):
        state = {"text": "", "input_tokens": 0, "output_tokens": 0,
                 "stop_reason": None, "error": None, "ignored": 0}
        # your code here
        return state
  javascript: |
    function fold_stream(events) {
      const state = { text: "", input_tokens: 0, output_tokens: 0,
                      stop_reason: null, error: null, ignored: 0 };
      // your code here
      return state;
    }
tests:
  - args: [[{"kind": "delta", "text": "Hel"}, {"kind": "delta", "text": "lo"}, {"kind": "done", "input_tokens": 12, "output_tokens": 2, "stop_reason": "end_turn"}]]
    expected: {"text": "Hello", "input_tokens": 12, "output_tokens": 2, "stop_reason": "end_turn", "error": null, "ignored": 0}
  - args: [[]]
    expected: {"text": "", "input_tokens": 0, "output_tokens": 0, "stop_reason": null, "error": null, "ignored": 0}
    label: empty stream
  - args: [[{"kind": "delta", "text": "par"}, {"kind": "error", "message": "overloaded"}, {"kind": "delta", "text": "tial"}]]
    expected: {"text": "par", "input_tokens": 0, "output_tokens": 0, "stop_reason": null, "error": "overloaded", "ignored": 1}
    label: error ends the stream
  - args: [[{"kind": "ping"}, {"kind": "delta", "text": "ok"}, {"kind": "done", "input_tokens": 3, "output_tokens": 1, "stop_reason": null}]]
    expected: {"text": "ok", "input_tokens": 3, "output_tokens": 1, "stop_reason": null, "error": null, "ignored": 1}
    label: unknown kinds are counted, not fatal
  - args: [[{"kind": "delta", "text": "a"}, {"kind": "done", "input_tokens": 1, "output_tokens": 1, "stop_reason": "max_tokens"}, {"kind": "done", "input_tokens": 9, "output_tokens": 9, "stop_reason": "end_turn"}, {"kind": "error", "message": "late"}]]
    expected: {"text": "a", "input_tokens": 1, "output_tokens": 1, "stop_reason": "max_tokens", "error": null, "ignored": 2}
    hidden: true
    label: nothing changes after done
  - args: [[{"kind": "thinking", "text": "x"}, {"kind": "usage"}]]
    expected: {"text": "", "input_tokens": 0, "output_tokens": 0, "stop_reason": null, "error": null, "ignored": 2}
    hidden: true
    label: only unknown kinds
hints:
  - "Keep a `finished` flag. Check it before looking at `kind` at all."
  - "Switch on `kind` with one branch per known kind and a default branch that counts the event as ignored."
  - "In TypeScript you would type the known events as a union and still keep a runtime default: exhaustiveness is a compile-time promise, the wire is not."
```

```exercise
id: parse-sse-stream
title: Parse a Server-Sent Events stream across chunk boundaries
prompt: |
  `chunks` is the list of text chunks read from a response body, in order.
  Return the list of dispatched events as `[event, data]` pairs, following
  the rules `web/src/lib/sse.ts` implements:

  - A line ends at "\r\n", "\n" or a lone "\r". A "\r" that ends a chunk
    may be the first half of a "\r\n" split across chunks: count one line
    end, not two.
  - A blank line dispatches the pending event, if it has any data lines.
    The event name defaults to "message", and both name and data reset.
  - A line starting with ":" is a comment and is ignored.
  - Otherwise split the line at the first ":" into field and value (no
    colon: the whole line is the field and the value is ""), and remove one
    leading space from the value. `event` sets the name; each `data` line
    appends to a list joined with "\n" at dispatch; other fields are ignored.
  - At the end of the stream, a final unterminated line is processed and a
    pending event is dispatched.
languages: [python, javascript]
entry: parse_sse
starter:
  python: |
    def parse_sse(chunks):
        # your code here
        return []
  javascript: |
    function parse_sse(chunks) {
      // your code here
      return [];
    }
tests:
  - args: [["event: delta\ndata: Hel\n\nevent: delta\ndata: lo\n\n"]]
    expected: [["delta", "Hel"], ["delta", "lo"]]
  - args: [["data: a\ndata: b\n\n"]]
    expected: [["message", "a\nb"]]
    label: data lines join with a newline; the name defaults to message
  - args: [[": ping\n\nevent: done\ndata: {}\n\ndata: y\n\n"]]
    expected: [["done", "{}"], ["message", "y"]]
    label: comments are ignored and the name resets after dispatch
  - args: [["data: a\r", "\ndata: b\n\n"]]
    expected: [["message", "a\nb"]]
    label: a CRLF split across chunks is one line end
  - args: [["data: one\rdata: two\r\r"]]
    expected: [["message", "one\ntwo"]]
    label: lone CR line endings
  - args: [[]]
    expected: []
    label: empty stream
  - args: [["event: error\ndata: overloaded"]]
    expected: [["error", "overloaded"]]
    hidden: true
    label: the end of the stream flushes the last event
  - args: [["data:no-space\nevent\ndata\n\n"]]
    expected: [["message", "no-space\n"]]
    hidden: true
    label: fields without a colon
hints:
  - "Keep a text buffer across chunks. Emit complete lines from it, and leave a trailing \\r in the buffer unless the stream has ended."
  - "Hold the pending event as a name and a list of data lines; a blank line dispatches only if the list is non-empty, then resets both."
  - "At the end, process whatever is left in the buffer as a line, then dispatch."
```

## Senior signals

- You know what erases and what emits code, avoid non-erasable syntax, and never mistake a type for a run-time check.
- You model state and messages as discriminated unions and let a `never` check turn a new variant into a compile error everywhere it matters.
- You can list every place in a codebase where types are claims and guard the external ones, with the cost of each strategy in mind.
- You justify a cast by naming the reason (invariance, a missing existential) and contain it, and you replace casts on literals with `satisfies`.
- You can trace a variance error through the compiler's message chain, and you know the soundness holes (`strict` still admits covariant arrays and bivariant methods).
- You know `Omit` does not distribute over unions and how a conditional type fixes it.
- You keep CPU-heavy work off the main thread and never confuse `async` with parallel.

## Check yourself

```quiz
- q: >-
    `const b = { id: -1, kind: "status" } satisfies RunnerResponse` fails to compile, while the same literal with `as RunnerResponse` compiles. Why?
  options: ["satisfies runs a check at run time, while as is erased before running", "as is checked by the linter instead of the compiler, so it passes tsc", "satisfies requires conformance; as only requires the types to overlap", "as widens the literal to the whole union, so nothing is checked at all"]
  answer: 2
  explanation: >-
    An object missing message still overlaps StatusResponse, which is enough for an assertion; satisfies demands the literal actually conform and reports the missing property. Both are erased entirely in the emitted JavaScript, so neither does anything at run time.
- q: >-
    Assigning `Family<ArrayInput, S>` to `Family<unknown, unknown>` fails on `algorithms`, and to `Family<never, unknown>` fails on `examples`. What property of Family does this show?
  options: ["It is invariant in I, since I is both a parameter and an output", "It is bivariant in I, since methods are checked in both directions", "It is covariant in I, since examples returns I values to callers", "It is contravariant in I, since generators consume their inputs"]
  answer: 0
  explanation: >-
    algorithms holds functions taking I, a contravariant position, so unknown would have to be assignable to ArrayInput; examples holds I values, a covariant position, so ArrayInput would have to be assignable to never. A parameter used both ways is invariant. Method bivariance applies only to method-shorthand declarations, and generators here are function-typed properties.
- q: >-
    `const bad: Omit<RunRequest | EvalRequest, "id"> = { kind: "run", code: "x" }` compiles although RunRequest requires entry and tests. Why?
  options: ["Omit removes every required property, so all the remaining fields are optional", "The kind field narrows the union to RunRequest only after compilation", "Omit keeps only the keys the members share and merges them into one type", "Excess property checks are skipped when a literal is assigned to an Omit"]
  answer: 2
  explanation: >-
    Omit is built on keyof the whole union, which yields only id, kind, code and timeLimitMs here, and it produces a single object type, so entry and tests disappear along with the link between kind and its fields. A distributive version, T extends unknown ? Omit<T, K> : never, keeps one Omit per member and rejects the literal.
- q: >-
    Node 24 runs `node app.ts` directly. Which file does it reject with ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX?
  options: ["One that declares a generic interface Box<T>", "One that uses x as UserId on a string value", "One that declares enum Level { Low, High }", "One that uses satisfies on an object literal"]
  answer: 2
  explanation: >-
    Type stripping deletes type syntax and leaves JavaScript. Casts, interfaces, generics and satisfies erase cleanly, but an enum must generate a runtime object, so strip-only mode rejects it. TypeScript 5.8's erasableSyntaxOnly flag reports the same constructs at compile time.
- q: >-
    Measured in Node 24, parsing a 114-byte lesson object with JSON.parse took 281 ns and a hand-written guard over all its fields took 6.9 ns. What does that imply for validating API responses?
  options: ["Validation is free, because V8 optimises the guard away after the first call", "Validation doubles the cost of every response, so reserve it for untrusted APIs", "Validation only matters in development, since production data always matches", "Validation adds a few percent to parsing, so cost is rarely the reason to skip it"]
  answer: 3
  explanation: >-
    The guard added about 2.5 percent on top of the parse, which dominates. A schema library costs more than a hand-written guard, but the decision is usually about maintenance and where drift is caught, not CPU. The guard runs on every call; it is cheap, not eliminated.
- q: >-
    A learner submits `while (true) {}` to the JavaScript runner. Why does the runner terminate the Worker from the main thread instead of setting a timeout inside the worker?
  options: ["Web Workers do not implement setTimeout, so only the page has timers", "The loop never yields, so no timer inside the worker can ever fire", "Promises cannot carry a timeout, and the runner is promise-based", "terminate() is cheaper than clearTimeout() for a worker that is idle"]
  answer: 1
  explanation: >-
    Callbacks run only when the call stack is empty; a 0 ms timer queued before a 50 ms loop fired at 50.2 ms, and an infinite loop never empties the stack at all. Only another thread can stop it, which WorkerHandle does on its wall-clock budget. Workers do have setTimeout, and promise code can race a timer; neither helps when the thread never yields.
```
