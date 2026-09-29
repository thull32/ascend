---
slug: product-systems
title: Product systems
description: The four systems that make Ascend more than a static site, the AI coach, mock interviews, code execution in the browser and on the server, and the visualisation engine, read as production case studies.
prerequisites: [case-study-ascend/the-system]
---
Module 1 followed a request through the core of the backend. This module reads the four product systems built on top of it, each of which is a small case study in one senior skill.

The **AI coach** is a paid, slow, streaming dependency behind a free product: the lesson is how to stream through a channel so a closed tab cannot lose a reply or skip its bill, how prompt caching really works, and why a budget check was not a budget until it became atomic, and not a hard limit until each call held its worst case up front. **Mock interviews** add state, roles and grading: three different prompts share one transcript, a JSON-schema rubric replaces parsing, a read-modify-write on a JSONB column lost data until it became a single SQL append, and a grade could disagree with its own transcript until a `grading` state froze it first. **Running code in the browser** began by trading an authoritative judge for zero marginal cost (Web Workers, Pyodide, time limits enforced by killing threads, and an explicit trust model) and then added one: the server now re-runs every recorded attempt in a WebAssembly sandbox, which is a lesson in when a trust model has to change and how to contain untrusted code cheaply. The **visualisation engine** makes roughly 230 animations testable by treating every animation as a pure function from input to a list of snapshots.

Each lesson quotes the real code, gives the rejected alternative, names the failure mode the design prevents, and ends with what changes at 100x. Two incidents from building the system are told in full: a React route change that remounted the coach mid-stream and dropped the reply, and a Pyodide loader that failed because module workers cannot call `importScripts`.
