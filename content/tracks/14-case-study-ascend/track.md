---
slug: case-study-ascend
title: "Case Study: How Ascend Is Built"
description: Read the platform you have been learning on as a production reference, with every design choice, rejected alternative and known weakness named.
icon: shield
phase: 6
---
The last case study is the one you have been using all along. Every lesson you read, every quiz you graded, every line of Python that ran in your browser went through a real system with real trade-offs: one Rust binary, one PostgreSQL database, a curriculum compiled into the executable, a paid AI API behind a free product. This track opens that system up and reads it the way a senior engineer reads any codebase on their first week: critically, with the code open, checking every claim against the evidence.

How to read it. Keep the repository open next to the lesson (`crates/`, `migration/`, `content/`, `web/`, `docs/`). Every excerpt names its file, and the function or type it comes from; the code will keep moving after these lessons were written, so search for the function name rather than trusting line numbers. Each design choice is presented the same way: what the code does, the alternative that was rejected and why, the failure mode the choice prevents, and what would have to change at 100x the traffic or team size. Weaknesses are named on purpose. Some are deliberate trade-offs, some are bugs found while writing this track, and telling the two apart is the senior skill being practised. Many of those bugs have since been fixed, and the lessons keep them as before-and-after case studies: what the code did, the failure it allowed, what it does now and why that fix won over the alternatives.

Module 1 walks the system end to end: the repository and its one important boundary, the life of a request through the middleware stack, the content engine, authentication and security, and the data model with its migrations. Module 2 covers the product systems (the AI coach, mock interviews, in-browser code execution, the visualisation engine), and module 3 covers testing, building, deploying and the scaling roadmap. By the end you should be able to defend each decision in a design review, and to say precisely what you would change first.
