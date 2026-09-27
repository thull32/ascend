---
slug: typescript-deep-dive
title: "TypeScript deep dive: structural types, narrowing, generics and discriminated unions"
description: How TypeScript's structural type system, control-flow narrowing, generics and discriminated unions work, where the types stop being true at runtime, and how this app's frontend uses them.
minutes: 32
difficulty: medium
tags: [typescript, javascript, type-system, generics, discriminated-unions, narrowing, event-loop, languages]
---
The first line of `web/src/lib/types.ts` reads: "Mirrors the JSON shapes produced by crates/api. Keep in sync with the Rust `Serialize` structs; the API is the source of truth." That comment is the whole TypeScript story in two sentences. The types describe values the compiler never sees. They are erased before the code runs. If the Rust side renames a field, the frontend still compiles, and the bug appears in a user's browser as `undefined`.

And yet TypeScript removes whole categories of bugs, *if* you model data so the compiler can reason about it. The senior skill has three parts: design types so illegal states cannot be written down, know exactly where types are claims rather than facts, and keep those places few, obvious and guarded. This lesson works through the mechanisms using the app's own frontend.

## Structural typing: shapes, not names

TypeScript decides assignability by shape. A value fits a type if it has at least the required properties with compatible types; the name of the type is irrelevant.

```typescript
interface LessonRef { slug: string; title: string } // from lib/types.ts

const summary = { slug: "hash-tables", title: "Hash tables", minutes: 40 };
const ref: LessonRef = summary; // OK: summary has slug and title; minutes is ignored
const ref2: LessonRef = { slug: "x", title: "y", minutes: 1 };
// error TS2353: Object literal may only specify known properties
```

The second assignment fails only because of **excess property checking**, a lint-like rule that applies to *fresh* object literals. Route the same object through a variable and it passes. This is why a typo in an optional property (`{ titel: "..." }` against a type where `title` is optional) sometimes slips through and sometimes does not.

Structural typing has a cost: every `string` is interchangeable. In `types.ts`, `User.id`, `Interview.id` and `Conversation.id` are all `string`, so passing an interview ID to a function expecting a user ID compiles. When that matters, use a *branded* type: `type UserId = string & { readonly __brand: "UserId" }`. The brand exists only in the type system, and producing one requires a deliberate cast at the point where you know it is valid.

Because types are erased, runtime checks can only use what JavaScript has: `typeof`, `instanceof` on classes, property checks with `in`, and literal comparisons. An `interface` has no runtime existence at all.

## Unions, literal types and narrowing

A union says a value is one of several types; literal types make individual values into types:

```typescript
export type Difficulty = "intro" | "easy" | "medium" | "hard" | "expert";
preferred_language: "python" | "javascript" | "typescript";
target_company: string | null;
```

Given a union, the compiler performs **control-flow narrowing**: after a check, it knows which members remain. The checks it understands are `typeof x === "string"`, `x === null`, `x instanceof C`, `"prop" in x`, truthiness, equality with a literal, and user-defined guards (`function isRun(m): m is RunResponse`). The interview report page (`pages/InterviewRoom.tsx`) uses `in`:

```typescript
const ev = interview.evaluation as Evaluation | { summary: string } | null;
const full = ev && "dimensions" in ev ? ev : null; // full: Evaluation | null
```

Truthiness narrowing is the trap. `if (user.weekly_hours)` is false for a user who set zero hours, and `if (name)` rejects the empty string. Compare with `null` explicitly when zero or `""` are legal values.

The app compiles with `noUncheckedIndexedAccess`, which makes `arr[i]` have type `T | undefined`. That matches JavaScript's behaviour (an out-of-range read returns `undefined` rather than throwing) and forces you to handle it. The `!` you see in places like `assign[i]!` in the ML visualiser is the author asserting "this index is in bounds"; each one is a small, reviewable claim.

## Discriminated unions: the runner protocol

The UI talks to the code runners (Web Workers executing Python or JavaScript) over `postMessage`. `web/src/runner/protocol.ts` defines the messages:

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

Every member has a `kind` property whose type is a distinct string literal. That property is the **discriminant**: checking it narrows the whole object. Even `id: -1` is a literal type, documenting that lifecycle messages are not replies to any request.

Narrowing by elimination is what `runner/index.ts` does: after `if (msg.kind === "ready") return;` and `if (msg.kind === "status") return;`, the compiler knows `msg` is `RunResponse | EvalResponse`, so `msg.id` is a real request ID. The stronger form is a `switch` with an exhaustiveness check:

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

In each `case`, `msg` has exactly the right type: `msg.results` exists only in the `"run"` branch. In `default`, every member has been eliminated and `msg` has type `never`. Add a `CrashedResponse` with `kind: "crashed"` to the union and the assignment to `never` fails to compile, pointing at every switch that has to decide what a crash means. It is the same guarantee Rust gives with an exhaustive `match` on `AppError`, and it is not a coincidence: serde's `#[serde(tag = "kind")]` serialises a Rust enum into exactly this JSON shape, so a tagged Rust enum and a TypeScript discriminated union are two views of one type.

Compare `Interview.evaluation` in `types.ts`: `Evaluation | { summary: string } | null`. The members share `summary` and have no discriminant, so the page must sniff for `"dimensions" in ev`, and the check silently breaks the day the fallback shape gains a `dimensions` field. A tag (`{ status: "complete"; ... } | { status: "failed"; summary: string }`) makes the intent explicit and checkable.

The same idea fixes the most common state-modelling bug in frontends:

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

Every consumer of `Bad` must defend against impossible combinations; consumers of `Status` cannot even write them.

## Generics: the visualisation engine

A generic type is a function from types to types. `web/src/viz/engine.ts` defines the engine behind every visualiser in this course:

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

`I` is a family's input type and `S` its per-frame state. Within one family, the generator's input, the examples, `normalise`'s output and the renderer's props must all agree on `I`, and the compiler checks that agreement. `Family<I = Record<string, unknown>, S = unknown>` gives the parameters defaults, so `Family` alone is valid. The `Frames<S>` builder is constructed with a snapshot closure, `new Frames(() => clone(state))`, and TypeScript infers `S` from the closure's return type without annotation.

The interesting line is in `viz/families/index.ts`, where every family goes into one registry:

```typescript
const f = <I, S>(x: Family<I, S>) => x as unknown as Family<never, unknown>;
```

Why a double cast? The registry wants a map whose values are "a family, for *some* `I` and `S`". That is an existential type, and TypeScript does not have one. Could it use `Family<unknown, unknown>` as a common supertype? No, because of **variance**. `I` appears as a function parameter (in `Generator<I, S>`), where subtyping runs backwards: a function that needs an `ArrayInput` cannot stand in for one that accepts anything. `I` also appears in output positions (`examples`, `normalise`'s return), where subtyping runs forwards. A type parameter used both ways is *invariant*: `Family<ArrayInput, ...>` is assignable to neither `Family<unknown, unknown>` nor `Family<never, unknown>`, and the compiler says so. The cast is an honest admission that the registry erases types. What keeps it safe is a runtime convention rather than the compiler: `VizBlock` hands each family the output of that family's own `normalise` (or the raw spec, for families without one).

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

Being able to say *why* a cast is needed ("the type is invariant in `I` and we need an existential") rather than casting until the red squiggle goes away is a clear senior signal in a frontend review.

## Utility, mapped and conditional types

TypeScript can compute types from types. The app uses the standard utilities throughout:

| In the code | What it computes |
|---|---|
| `interface Track extends Omit<TrackOverview, "modules">` | `TrackOverview` without `modules`, so `Track` can redefine it as `Module[]` |
| `Partial<Record<"js" \| "py", WorkerHandle>>` | An object with optional `js` and `py` keys, filled lazily with `??=` |
| `ReturnType<typeof setTimeout>` | Whatever the timer handle type is in this environment (a number in browsers, an object in Node) |
| `Omit<RunRequest, "id"> \| Omit<EvalRequest, "id">` | A request before the handle assigns its ID |

That last one, from `WorkerHandle.send`, hides a trap. Why not write `Omit<RunnerRequest, "id">`? Because `Omit` is not **distributive**. It computes `keyof (RunRequest | EvalRequest)`, which is only the keys the members share (`id`, `kind`, `code`, `timeLimitMs`), and builds one object type from those. `entry` and `tests` vanish, and so does the link between `kind: "run"` and the fields that go with it. Distribution over a union requires a conditional type, because conditional types on a naked type parameter apply to each member separately:

```typescript
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type NewRequest = DistributiveOmit<RunnerRequest, "id">;
// = Omit<RunRequest, "id"> | Omit<EvalRequest, "id">
```

Conditional types can also extract types with `infer`: `type ElementOf<T> = T extends readonly (infer E)[] ? E : never`. With `const SPEEDS = [0.5, 1, 2, 4] as const` (from the visualisation player), `ElementOf<typeof SPEEDS>` is the union `0.5 | 1 | 2 | 4`, so a speed setting of `3` is a compile error. `as const` makes the array a readonly tuple of literal types instead of `number[]`.

## Where types stop being true

Every `as`, every `any`, and every annotation on data that crosses a boundary is a claim the compiler does not check. The app's API client (`lib/api.ts`) ends with:

```typescript
return data as T;
```

`data` is whatever JSON the server sent. `api.get<Curriculum>("/curriculum")` asserts it is a `Curriculum`. If a backend change renames `lesson_count`, the frontend compiles and renders "undefined lessons". There are three ways to make the boundary honest, with different costs:

- **Validate at runtime** with a schema library (zod, valibot): parse the JSON into a typed value or fail loudly at the edge. Costs bundle size and some CPU per response.
- **Generate the TypeScript from the Rust types** (ts-rs, specta) or from an OpenAPI spec: drift becomes a build failure. Costs build integration.
- **Contract tests** that call the real API and check shapes. Costs CI time and catches drift later.

The worker boundary is typed the same way (`ev: MessageEvent<RunnerResponse>`) and is acceptable because both sides are this app's code, built together. The senior move is to know which boundaries are external and guard those.

Two tools reduce the number of claims. `unknown` is the safe top type: you can assign anything to it but do nothing with it until you narrow, unlike `any`, which switches checking off and spreads. Each visualiser family's `normalise(raw: Record<string, unknown>)` is the "parse, don't validate" pattern: it turns loose JSON from lesson content into a valid typed input (the array family converts values with `Number`, drops non-finite ones and caps the length at 40). And `satisfies` checks a value against a type *without* casting it:

```typescript
self.postMessage({ id: -1, kind: "ready" } satisfies RunnerResponse); // from py.worker.ts

const a = { id: -1, kind: "status" } as RunnerResponse;        // compiles: 'message' silently missing
const b = { id: -1, kind: "status" } satisfies RunnerResponse; // error: property 'message' is missing
```

`as` accepts any type that sufficiently overlaps, so it lets a missing required field through. `satisfies` demands that the literal actually conform, and it keeps the literal's narrow type for later inference.

## The runtime underneath: one thread and an event loop

TypeScript compiles to JavaScript, so its concurrency model is JavaScript's: one thread per page or worker, an event loop, and queues. The loop runs the current script to completion, then drains *all* microtasks (promise reactions), then runs *one* macrotask (a timer, an I/O callback, a message), then drains microtasks again.

```viz
{"type": "concurrency", "algorithm": "event-loop",
 "title": "Why await never makes CPU work parallel",
 "caption": "Timers and network I/O happen on host threads, but every callback runs on the one JavaScript thread. A long synchronous loop delays every timer, click and response queued behind it."}
```

`async`/`await` is syntax over promises; it gives you interleaving, not parallelism. A synchronous loop never yields, so no timer, promise callback or message handler on that thread can run until it finishes. That is why the runner executes learner code in Web Workers, and why `runner/index.ts` enforces time limits by calling `worker.terminate()` from the main thread: its comment calls that "the only reliable way to stop a runaway loop in JS or Python". A `setTimeout` inside the worker would never fire.

Three async bugs worth recognising in review. `items.forEach(async (x) => await save(x))` does not wait for anything; use `for...of` with `await` for sequence or `Promise.all` for concurrency. Sequential `await`s in a loop over independent requests turn 10 × 100 ms into a second instead of 100 ms. And cancellation is cooperative: `fetch` accepts an `AbortSignal` (the app's `request` helper threads one through), but nothing cancels a promise from outside.

## TypeScript and JavaScript in interviews

JavaScript is a reasonable coding-interview language if you know its traps: the default `sort()` compares as strings (`[10, 9, 1].sort()` gives `[1, 10, 9]`; pass `(a, b) => a - b`), there is no built-in heap or ordered map, `Map` keeps insertion order and accepts any key while plain objects coerce keys to strings, all numbers are doubles (integers are exact only up to 2^53 − 1), and `%` keeps the sign of the dividend (`-7 % 2` is `-1`, while Python gives `1`). In an interview, annotate function signatures and skip elaborate types. In frontend interview loops, expect type-level questions: write a discriminated-union reducer, implement `DeepPartial<T>`, explain `unknown` versus `any`. The exercise below is the reducer.

## Exercise

The app's SSE client consumes a stream of `delta`, `done` and `error` events, the browser-side mirror of the Rust `pump` function. Fold such a stream into a final result, treating the events as a discriminated union on `kind`.

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

## Senior signals

- You model state and messages as discriminated unions and let a `never` check turn a new variant into a compile error at every site that must handle it.
- You can list every place in a codebase where types are claims (`as`, `any`, annotated `JSON.parse` or `postMessage` data) and guard the external ones with validation, generated types or contract tests.
- You justify a cast by naming the reason (invariance, missing existential types) and contain it behind a function, rather than casting until it compiles.
- You know `Omit` does not distribute over unions and how a conditional type fixes that.
- You prefer `satisfies` to `as` for checking literals, and `unknown` to `any` for untrusted input.
- You keep CPU-heavy work off the main thread and never confuse `async` with parallel.

## Check yourself

```quiz
- q: >-
    Which line reports that the required `message` property is missing?
  options: ["const a = { id: -1, kind: \"status\" } as RunnerResponse", "const b = { id: -1, kind: \"status\" } satisfies RunnerResponse", "Both", "Neither, because types are erased"]
  answer: 1
  explanation: >-
    An `as` assertion only requires the types to overlap sufficiently, and an object missing `message` is a supertype of StatusResponse, so it is accepted. `satisfies` requires the literal to conform to the type and keeps its narrow type for inference.
- q: >-
    What is `Omit<RunnerRequest, "id">`, where RunnerRequest = RunRequest | EvalRequest?
  options: ["Omit<RunRequest, \"id\"> | Omit<EvalRequest, \"id\">", "never", "RunnerRequest unchanged", "One object type with only the keys the members share, minus id: kind, code and timeLimitMs"]
  answer: 3
  explanation: >-
    Omit is built on keyof of the whole union, which yields only common keys, and it produces a single object type. Fields like entry and tests disappear. Distributing requires a conditional type such as T extends unknown ? Omit<T, K> : never.
- q: >-
    Why does viz/families/index.ts cast each family to Family<never, unknown> instead of assigning it to Family<unknown, unknown>?
  options: ["I appears both as a function parameter and in output positions, so Family is invariant in I and no safe common supertype exists for a heterogeneous registry", "TypeScript cannot infer generic parameters from objects", "React components cannot be generic", "never is cheaper at runtime"]
  answer: 0
  explanation: >-
    Parameters are checked contravariantly and properties covariantly; a parameter used both ways admits no subtyping. Without existential types the registry must erase, and the cast records that decision. unknown would fail for the same reason, as the compiler reports.
- q: >-
    The backend renames `lesson_count` to `lessons` in the curriculum response. The frontend calls api.get<Curriculum>(...). What happens?
  options: ["tsc fails the frontend build", "request() throws a TypeError when parsing", "The build passes and the UI reads undefined at runtime", "The HTTP request fails"]
  answer: 2
  explanation: >-
    `return data as T` is an unchecked claim; types are erased and nothing compares the JSON with Curriculum. Runtime validation, generated types or contract tests are the ways to turn this drift into an early failure.
- q: >-
    A component's state is typed `{ loading: boolean; error?: string; data?: Curriculum }`. What is the strongest review comment?
  options: ["Use an interface instead of a type alias", "It admits combinations that cannot happen, such as loading with both data and an error; a union tagged by status makes them unrepresentable", "Optional properties are slow in V8", "Replace Curriculum with any to simplify"]
  answer: 1
  explanation: >-
    Three independent fields allow eight combinations and every consumer must defend against the impossible ones. A discriminated union has exactly the four real states and narrows automatically in a switch.
- q: >-
    A learner submits `while (true) {}` to the JavaScript runner. Why does the runner terminate the Worker from the main thread instead of setting a timeout inside the worker?
  options: ["The loop never yields to the worker's event loop, so no timer or message callback inside the worker can ever run", "Promises cannot have timeouts", "Workers do not implement setTimeout", "terminate() is cheaper than clearTimeout()"]
  answer: 0
  explanation: >-
    Callbacks run only when the call stack is empty. A synchronous infinite loop never empties it, so the worker cannot stop itself; only another thread can kill it, which is what WorkerHandle does on its wall-clock budget.
```
