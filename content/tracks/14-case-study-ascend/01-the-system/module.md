---
slug: the-system
title: The system end to end
description: How a request, a lesson, a login and a row of progress actually move through Ascend, from the Railway edge to PostgreSQL, with the trade-offs behind each step.
prerequisites: [senior-craft/software-craft]
---
This module reads Ascend's backend from the outside in. You start with the repository layout and a one-hour protocol for reading any unfamiliar codebase, then follow a single HTTP request through every middleware layer, extractor and error mapping in the order the code actually applies them.

From there the module turns to the three subsystems where the interesting decisions live. The content engine compiles hundreds of Markdown lessons into the binary, strips quiz answers, validates cross-references at build time and serves everything from memory with ETags. Authentication uses Argon2id, hashed opaque session tokens and a three-layer CSRF defence instead of JWTs. The data model keeps content out of the database entirely, uses composite keys and single-statement upserts, and evolves through append-only migrations that run on boot.

Every lesson quotes the real code, names the alternative that was rejected, and ends with what would break first at 100x. Expect to find bugs: several were discovered while this module was being written, from a registration race that answered 500 to heading anchors that pointed nowhere. Most have since been fixed, and each lesson shows the code before and after, the failure it allowed and why that fix was chosen; the ones still open are named as open.
