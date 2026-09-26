---
slug: case-studies
title: Case studies
description: Eighteen end-to-end designs, each worked the way a senior interview loop expects, from requirements and arithmetic to deep dives, failure modes and the follow-up questions that separate levels.
prerequisites: [system-design/distributed-systems]
---
Building blocks and distributed-systems theory are necessary but not sufficient. The senior design round asks you to take a vague product ("design Netflix", "design a rate limiter") and, in forty-five minutes, turn it into a system you could defend to the people who run it. That is a skill of composition and judgement, and the only way to build it is to do it many times against real constraints.

Every case study here follows the same spine: requirements (functional and non-functional, with the questions you should ask), back-of-envelope estimates with the arithmetic shown, an API, a data model, a high-level design you can draw in five minutes, two or three deep dives where the real difficulty lives, the failure modes and how the design survives them, and a set of senior follow-up questions with the answers an interviewer is hoping to hear. The structure is deliberate: it is the order in which a strong candidate drives the conversation, and by the end of the module it should be reflex.

The systems are chosen to cover the space. Some are read-heavy (URL shortener, news feed, autocomplete), some write-heavy (click aggregation, metrics), some are about coordination (ticket booking, payments, collaborative editing), and some are about moving bytes at planetary scale (video streaming, video upload). Two lessons go deep on Netflix specifically, because Netflix is the reference bar for this curriculum and because its architecture is unusually well documented in public.

Read each case study with a pen. Redo the estimates with different assumptions, draw the high-level design from memory, and then argue with the deep dives. The point is not to memorise eighteen answers; it is to internalise one method well enough to design the nineteenth system live.
