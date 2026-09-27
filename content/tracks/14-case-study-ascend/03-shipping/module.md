---
slug: shipping
title: Shipping and operating
description: How Ascend is tested, built, deployed and kept running, and a candid design review of what would have to change at 10k and 100k daily users.
prerequisites: [case-study-ascend/product-systems]
---
A system is only as good as the evidence that it works and the path by which changes reach users. This module reads that path in Ascend from end to end: the test portfolio (Rust unit tests, API tests against a real PostgreSQL, validators that execute every piece of content, Vitest property tests for animations, and live Playwright runs), the multi-stage Docker build with cargo-chef and a distroless runtime, infrastructure as code on Railway, and rollouts gated by a readiness probe with migrations that run on boot.

The incidents in this module are the ones that shaped the tooling: a runaway reference solution that exhausted a machine's memory while many validators ran in parallel, a YAML front matter line where an unquoted `: ` silently turned a string into a mapping, a rate limiter that trusted a header the client controls, and a deploy path that shipped to production without waiting for the CI that was meant to guard it.

The final lesson is a design review of the codebase itself. It prices the AI features at 10k and 100k daily users using the budgets in the deployment config, projects table growth and retention, lists what the review found, what has since been fixed and what is still open, and orders the remaining work the way you would in a real scaling plan.
