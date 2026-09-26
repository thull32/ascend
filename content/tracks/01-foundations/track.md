---
slug: foundations
title: Engineering Foundations
description: Reason about cost, memory and correctness precisely enough that every later track, and every interview, starts from solid ground.
icon: compass
phase: 1
---
You have shipped production code for years, and you can feel when something is slow or leaky. What you have probably never been asked to do is *prove* it: put a number on the cost of a loop, say exactly why a linked list loses to an array on modern hardware, explain what your runtime does with a variable you stop using, or argue that a piece of two-pointer code is correct before you run it. Senior interviews and senior design reviews ask for exactly that, and they ask it in the first ten minutes.

This track builds that vocabulary from the mechanism up. **Complexity & the cost model** turns "it's O(n)" into something you can derive and, just as importantly, distrust when constant factors and caches take over. **How your code actually runs** follows a function call through stack frames, heap allocations, garbage collectors, integer widths and the compiler or interpreter that executes it, so that "Python is slow" and "Rust is fast" become statements about mechanisms instead of folklore. **Math that shows up at work and in interviews** covers the small set of logarithms, modular arithmetic, counting, probability, bit tricks and number theory that appear again and again in hashing, sharding, sampling and interview problems. **How to think about problems** gives you the protocol used in every lesson on the platform: understand, examples, brute force, optimise, code, test, and communicate while doing it.

Nothing here is a prerequisite you can skip because you "already know it". Each lesson goes one level deeper than the textbook definition, states the case where the textbook is wrong in practice, and ends with the senior signals a top-tier interviewer listens for. Every later track, from data structures to distributed systems, links back to these lessons when it needs a cost argument, a memory model or a correctness proof.
