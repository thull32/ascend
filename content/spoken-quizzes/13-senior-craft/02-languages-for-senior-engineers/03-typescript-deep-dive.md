---
lesson: typescript-deep-dive
source: 7a6054eb6c635861
---
## 1

In TypeScript, an object literal with an ID of minus one and a kind of "status", but no message field, fails to compile when written with "satisfies" the runner response type. Yet it compiles when written with "as" the runner response type. Why?

A, satisfies runs a check at run time, while as is erased before running. B, as is checked by the linter instead of the compiler, so it passes the compiler. C, satisfies requires the literal to conform; as only requires the types to overlap. D, as widens the literal to the whole union, so nothing is checked at all.

[think]

The answer is C: satisfies requires the literal to conform; as only requires the types to overlap.

An object missing its message still overlaps the status response type, which is enough for an assertion. Satisfies demands that the literal actually conform, and reports the missing property. Both are erased entirely from the emitted JavaScript, so neither does anything at run time.

## 2

Ascend's visualisation Family type takes an input type I. Assigning a family whose input is the array input type to a Family of unknown fails on its algorithms field. Assigning it to a Family of never fails on its examples field. What property of Family does this show?

A, it is invariant in I, since I is both a parameter and an output. B, it is bivariant in I, since methods are checked in both directions. C, it is covariant in I, since examples returns I values to callers. D, it is contravariant in I, since generators consume their inputs.

[think]

The answer is A: it is invariant in I, since I is both a parameter and an output.

The algorithms field holds functions that take an I, a contravariant position, so unknown would have to be assignable to the array input type. The examples field holds I values, a covariant position, so the array input would have to be assignable to never. A parameter used both ways is invariant. Method bivariance applies only to methods declared in shorthand, and the generators here are properties with function types.

## 3

A variable is typed as Omit of the union of run request and eval request, without the ID. It is assigned an object with kind "run" and some code, and it compiles, although a run request requires an entry and tests. Why?

A, Omit removes every required property, so all the remaining fields are optional. B, the kind field narrows the union to run request only after compilation. C, Omit keeps only the keys the members share, and merges them into one type. D, excess property checks are skipped when a literal is assigned to an Omit.

[think]

The answer is C: Omit keeps only the keys the members share, and merges them into one type.

Omit is built on the keys of the whole union, which here are only the ID, the kind, the code and the time limit, and it produces a single object type. So the entry and the tests disappear, along with the link between the kind and its fields. A distributive version, which applies Omit to each member of the union separately, keeps one Omit per member, and rejects the literal.

## 4

Node 24 can run a TypeScript file directly by stripping its types. Which file does it reject with an "unsupported TypeScript syntax" error?

A, one that declares a generic interface, a box of T. B, one that casts a string value as a user ID type. C, one that declares an enum of levels, low and high. D, one that uses satisfies on an object literal.

[think]

The answer is C: one that declares an enum.

Type stripping deletes type syntax and leaves JavaScript. Casts, interfaces, generics and satisfies all erase cleanly, but an enum must generate an object at run time, so strip-only mode rejects it. TypeScript 5.8's erasable syntax only flag reports the same constructs at compile time.

## 5

Measured in Node 24, parsing a 114 byte lesson object with JSON parse took 281 nanoseconds, and a hand-written guard over all its fields took 6.9 nanoseconds. What does that imply for validating API responses?

A, validation is free, because V8 optimises the guard away after the first call. B, validation doubles the cost of every response, so reserve it for untrusted APIs. C, validation only matters in development, since production data always matches. D, validation adds a few percent to parsing, so cost is rarely the reason to skip it.

[think]

The answer is D: validation adds a few percent to parsing, so cost is rarely the reason to skip it.

The guard added about two and a half percent on top of the parse, which dominates. A schema library costs more than a hand-written guard, but the decision is usually about maintenance, and where drift gets caught, not CPU. The guard runs on every call; it is cheap, not eliminated.

## 6

A learner submits an infinite "while true" loop to the JavaScript runner. Why does the runner terminate the Worker from the main thread, instead of setting a timeout inside the worker?

A, Web Workers do not implement set timeout, so only the page has timers. B, the loop never yields, so no timer inside the worker can ever fire. C, promises cannot carry a timeout, and the runner is built on promises. D, terminating is cheaper than clearing a timeout for a worker that is idle.

[think]

The answer is B: the loop never yields, so no timer inside the worker can ever fire.

Callbacks run only when the call stack is empty. A zero millisecond timer queued before a 50 millisecond loop fired at 50.2 milliseconds, and an infinite loop never empties the stack at all. Only another thread can stop it, which the runner's worker handle does when its wall-clock budget runs out. Workers do have set timeout, and promise code can race a timer; neither helps when the thread never yields.
