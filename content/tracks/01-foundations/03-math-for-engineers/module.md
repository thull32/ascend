---
slug: math-for-engineers
title: Math that shows up at work and in interviews
description: The small set of logarithms, modular arithmetic, counting, probability, bit tricks and number theory that recur in hashing, sharding, sampling and interview problems.
prerequisites: [foundations/complexity]
---
You do not need a mathematics degree to be a senior engineer. You do need a dozen tools fluently enough that they never slow you down: knowing that 2³⁰ is about a billion, that a hash mod a table size behaves well only under certain conditions, that the number of ways to choose k items from n has a closed form, that a random 32-bit ID collides sooner than intuition suggests, and that XOR cancels pairs. Each of those turns up in capacity planning, in hashing and sharding, in load balancing, and in a large slice of interview problems.

This module covers exactly that toolkit and nothing decorative. Logarithms and powers of two give you the reflexes for complexity and capacity estimates. Modular arithmetic explains overflow-safe code and why hash tables and rolling hashes work. Counting and combinatorics let you size search spaces and reason about brute-force feasibility. Probability gives you expected values, the birthday bound, reservoir sampling and the balls-into-bins result behind load balancing. Bit manipulation and number theory round out the techniques that appear in problems tagged "math" or "bits" and in real code that packs flags, hashes keys and computes powers modulo a prime.

Every lesson works through concrete numbers, has code you can run in the browser, and ends with what a senior engineer says when the topic appears in an interview or a design review.
