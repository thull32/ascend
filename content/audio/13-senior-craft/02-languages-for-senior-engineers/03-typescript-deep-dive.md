---
lesson: typescript-deep-dive
source: cfe2c27c0c82b303
fit: partial
desk:
  - "The source file and its emitted JavaScript, and the erasure table"
  - "The narrowing trace through the worker message handler"
  - "The runner protocol types and the exhaustive switch with its never check"
  - "The Family variance errors, traced through the compiler's message chain, and the cast-free erase function"
  - "The distributive Omit and the utility-type table"
  - "The boundary-strategy table and the as versus satisfies example"
  - "The interview idiom table"
  - "Exercises: fold a stream of tagged events, and parse a Server-Sent Events stream"
---
## Introduction

The first line of the frontend's types file says: "Mirrors the JSON shapes produced by the API. Keep in sync with the Rust structs; the API is the source of truth." That comment is the whole TypeScript story in two sentences. The types describe values the compiler never sees. They are erased before the code runs. If the Rust side renames a field, the frontend still compiles, and the bug appears in a user's browser as "undefined".

And yet TypeScript removes whole categories of bugs, if you model data so the compiler can reason about it. The senior skill has three parts. Design types so illegal states cannot be written down. Know exactly where types are claims rather than facts. And keep those places few, obvious and guarded.

The route: what survives compilation, structural typing, narrowing and discriminated unions, variance, where the types stop being true, and the single thread underneath it all.

## Two jobs, and only one survives

The TypeScript compiler does two independent things. It type-checks the program, and it emits JavaScript by deleting the types. The check never influences the output. A program with type errors still emits by default, and the emitted code is the same either way.

So interfaces, type aliases, generics, casts with "as", the non-null assertion, and "satisfies" all vanish. Nothing is left to check anything at run time. The checks that do run are the ones that were JavaScript all along: typeof, the "in" operator, instanceof.

A few constructs are not erasable, because they generate code. The main one is enum, which emits a function that builds a two-way lookup object. And runtimes now enforce the difference. Node 24 runs TypeScript files directly by stripping types. A file with casts, interfaces and satisfies ran unchanged. A file with an enum was rejected: enums are not supported in strip-only mode. TypeScript 5.8 added a flag to reject those constructs at compile time. Use a union of string literals instead of an enum, and the question disappears.

The check's whole cost is at build time. Type-checking this app's frontend, about 21 thousand lines, took 2.6 seconds and 508 megabytes of memory, and added zero bytes to the bundle.

## Shapes, not names

TypeScript decides assignability by shape. A value fits a type if it has at least the required properties with compatible types. The name of the type is irrelevant.

Take a lesson reference type with a slug and a title. A summary object with a slug, a title and a minutes field assigns to it fine; minutes is ignored. Write the same object as a fresh literal directly in the assignment, and it fails, but only because of excess property checking, a lint-like rule for fresh literals. Route it through a variable and it passes. That is why a typo in an optional property sometimes slips through.

Structural typing also makes every string interchangeable. A user ID, an interview ID and a conversation ID are all just strings, so passing an interview ID where a user ID belongs compiles. A branded type fixes that: a string intersected with a marker property that exists only in the checker. Producing one requires a deliberate cast at the one place you know it is valid.

## Narrowing and discriminated unions

A union says a value is one of several types, and literal types make individual values into types: difficulty is "intro" or "easy" or "medium" and so on. Given a union, the checker performs control-flow narrowing. After a check, it knows which members remain.

Picture the runner's message handler. A message is one of four kinds: run, eval, ready or status. Inside "if kind equals status", the message is exactly the status type, so its message field is available. That block returns. So does the one for ready. After both, only run and eval remain, and the message's ID is a number, because the minus-one ID belonged only to the two members that were eliminated.

Truthiness narrowing is the trap. "If user dot weekly hours" is false for a user who set zero hours. "If name" rejects the empty string. A real failure: users who chose zero weekly hours saw the onboarding prompt again. Compare with null explicitly whenever zero or the empty string are legal.

Now the strongest pattern. Every message type has a kind field whose type is a distinct string literal: the discriminant. Switch on it, one case per kind, and in the default case, assign the message to a variable of type never. In each case, the message has exactly the right type. In the default, every member is eliminated, so it is never. Add a "crashed" kind to the union and the compiler errors at that line, and at every switch that must decide what a crash means. It is the same guarantee Rust gives with an exhaustive match, and not by coincidence: serde can serialise a Rust enum into exactly this tagged JSON shape.

The same idea fixes the commonest frontend state bug. A loading boolean, an optional error and optional data admit two times two times two, eight combinations, several of them nonsense, like loading with data and an error. A union of idle, loading, error with a message, and success with data admits exactly the four real states.

## Variance, and where the type system is unsound

Variance sounds abstract, so here it is in words. The visualisation engine has a family type, generic over its input type. A family holds generator functions that take an input, and a set of example inputs.

The registry wants to hold every family together, so why not treat a family over array input as a family over unknown input? Before I tell you: what goes wrong?

[pause]

The generators take an input as a parameter. A function that needs an array input cannot stand in for one that accepts anything. In parameter position, subtyping runs backwards; that is contravariance. So unknown fails. What about never, the bottom type? The examples hold input values, an output position, where subtyping runs forwards; that is covariance. An array input is not a never, so that fails too. The input type appears in both positions, so the family type is invariant: no other instantiation is a supertype.

The codebase records that decision with a double cast, kept safe by a run-time convention: each family is handed the output of its own normalise function. The lesson also shows a cast-free alternative that hides the type inside a closure, which is worth reading at your desk.

Now the soundness holes, because both compiled cleanly under strict mode. Arrays are covariant even though they are mutable: assign a list of dogs to a list of animals, push a cat, and the dogs list now holds a cat. And methods written in method shorthand have their parameters checked bivariantly, in both directions, so a handler that needs a dog is accepted where any animal may arrive. The same thing written as a function-typed property fails as it should. Prefer property syntax for callbacks, and readonly arrays.

One more trap. Omit is not distributive over unions. Omit the ID from a union of run request and eval request, and it computes only the keys the two share, and builds one merged object type. So an object with kind "run" but no entry and no tests type-checked. The fix is a conditional type that applies Omit to each member separately. The symptom in production: a request field silently dropped in one code path.

## Where types stop being true

Every "as", every "any", and every annotation on data that crosses a boundary is a claim. The app's one request function, which every JSON call goes through, ends by returning the data "as T". So asking for the curriculum asserts the JSON is a curriculum. If the backend renames lesson count, the frontend compiles and renders "undefined lessons", with no error in the console.

"Satisfies" checks without casting, and it is the tool for literals. Build a status message without its required message field. With "as", it compiles, because "as" only needs the types to overlap, and the message renders blank in production. With "satisfies", the compiler reports the missing property and keeps the literal's narrow type. Both erase to nothing.

What does honesty cost at the boundary? On 100 thousand lesson-shaped objects, JSON parse took 281 nanoseconds each, and a hand-written guard checking every field took about 7. About 2.5 percent on top. A schema library costs more, but the parse dominates either way. So cost is rarely the reason to skip validation; the real choice is where you want drift to be caught.

Five strategies. Trust the cast, and drift is caught in a user's browser; fine for code you build and ship together. Hand-written guards catch it at the edge, loudly. A schema library does the same, with error paths. Types generated from the Rust structs catch it at build time, which fits one team owning both sides, as here. And contract tests catch it in CI, for many consumers of one API. For untrusted input use unknown, which forces you to narrow before use, never any, which switches checking off and spreads.

## One thread and an event loop

TypeScript's concurrency model is JavaScript's: one thread per page or worker, an event loop, and queues. The loop runs the current script to completion, then drains all microtasks, the promise reactions, then runs one macrotask, a timer or a message, then drains microtasks again. Measured: a zero-millisecond timer scheduled before a 50 millisecond loop fired at 50.2 milliseconds, never in the middle.

Async and await give interleaving, not parallelism. A learner submits an infinite loop to the JavaScript runner. Why can't a timeout inside the worker stop it? Because the loop never yields, so no timer can ever fire. That is why the app runs learner code in Web Workers and terminates the worker from the main thread.

Three async bugs to recognise in review. forEach with an async callback waits for nothing. Sequential awaits over independent requests turn ten 100-millisecond calls into a second. And cancellation is cooperative: fetch takes an abort signal, but nothing cancels a promise from outside.

## In the interview

A follow-up the lesson expects. Where are the types in this codebase not true?

[pause]

Every "as", every "any", and every annotated JSON parse or worker message result. Here, the request function's "data as T", and the done handler that takes JSON parse output directly. Guard the external ones with validation, generated types or contract tests. The wrong answer is "nowhere, we use strict mode".

And: is TypeScript's type system sound? No, deliberately. Covariant mutable arrays, bivariant method parameters, and narrowings that survive function calls all compile. You avoid them with readonly arrays, property-style callbacks and re-checking after calls. In a coding round, annotate the signature only; elaborate types cost minutes and earn nothing. Remember that the default sort compares strings, so ten, nine and one sort as one, ten, nine.

## Recap

Five things to remember. Types are erased: the check and the emit are separate, and enum is the construct that does not erase. Typing is structural, so IDs are interchangeable until you brand them. Model state and messages as discriminated unions, and let a never check turn a new variant into a compile error. A type used both as a parameter and as an output is invariant, and strict mode still admits covariant arrays and bivariant methods. And every cast at a boundary is a claim: prefer satisfies for literals, and guard external data, which costs about 2.5 percent of the parse.

At your desk: the emitted JavaScript, the narrowing trace, the runner protocol and exhaustive switch, the variance error chain, the distributive Omit, the boundary table, and the two stream exercises.
