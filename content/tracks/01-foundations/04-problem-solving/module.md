---
slug: problem-solving
title: How to think about problems
description: The protocol every lesson on Ascend uses to go from an unfamiliar problem to correct, tested, well-explained code, and how to argue that code is right before you run it.
prerequisites: [foundations/complexity]
---
Most engineers who fail a senior coding round do not fail because they lack knowledge. They fail because they start typing before they understand the problem, they cannot tell whether their loop is correct without running it, they do not recognise which of a dozen standard patterns the problem is hiding, they test only the happy path, and they go silent when they get stuck. Each of those is a skill, and each can be practised deliberately.

This module makes those skills explicit and puts numbers on them. The problem-solving loop (understand, examples, brute force, optimise, code, test) is the protocol used by every lesson and problem on the platform; here it runs end to end on real problems with operation counts and measured timings, down to what CPython does per iteration of the code it produces. Loop invariants and pre/post conditions turn "I think this works" into an argument you can state out loud, with the three bracketing conventions for binary search compared and what asserts and compilers do with the invariants you write. The pattern catalogue maps the signals in a statement to the technique that fits, and shows where the operations-per-second budget that decides between patterns comes from. The testing lesson applies an edge-case taxonomy row by row to real problems, with what each plausible bug returns, and explains how the platform's harness compares your answer. The final lesson gives annotated transcripts of a senior thinking aloud, the four-step protocol for taking a hint, and how a coding round is graded after you leave the room.

Nothing here requires a specific data structure or algorithm; the later tracks supply those. What this module supplies is the discipline that makes them usable under pressure, and the numbers that turn "too slow" and "good enough" into decisions.
