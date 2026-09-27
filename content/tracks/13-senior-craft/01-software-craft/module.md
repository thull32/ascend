---
slug: software-craft
title: Software craft
description: Architecture, API and error design, testing, security, delivery, containers, observability and documentation, taught through a real production codebase.
prerequisites: [system-design/building-blocks]
---
Mid-level engineers make code work. Senior engineers make code that keeps working when requirements shift, traffic grows, dependencies fail, attackers probe it and the original author has left. That difference is not one big idea; it is dozens of small, deliberate decisions about where boundaries go, what an error means, what a test proves, what a deploy risks and what a log line lets you answer.

This module walks through those decisions in the order a request meets them: the architecture and the middleware stack, the API contract and its errors, the tests that pin behaviour down, the security controls around sessions and cookies, the pipeline and deploy strategy that ship the code, the container and infrastructure definitions it runs in, the telemetry that tells you it is healthy, and the documents that explain why it is built this way.

Every lesson cites real files in this repository (`crates/core`, `crates/api`, `migration`, `web`, the CI workflow, the Dockerfile, the infrastructure definition and the decision records in `docs/`) so you can open the code beside the prose. Where the codebase takes a shortcut, the lesson says so and explains what a senior reviewer would ask for as the system grows. Exercises turn the rules into small, testable functions: an architecture fitness check, an error-to-status mapper, a flaky-test detector, a CSRF gate, an error-budget release gate, a layer-cache simulator, a log parser and an ADR query.
