---
slug: data-platforms
title: "Data platforms"
description: "Orchestration, dimensional modelling, data quality and lineage, and ML feature pipelines: the platform work that turns raw events into data people can trust."
---
The engines in the previous two modules are commodities. What distinguishes a data platform that a company trusts from one it works around is everything wrapped around the engines: pipelines that can be rerun without corrupting anything, tables modelled so that an analyst can answer a question without a data engineer, tests and lineage that catch a broken upstream before the finance dashboard does, and a feature pipeline that serves a model the same numbers it was trained on.

This module is written for the engineer who will be asked in a design review "how do we backfill this?", "what happens if the upstream schema changes?", or "why does the model do worse in production than in the notebook?" Each lesson gives the mechanism behind the answer: idempotent partition overwrites, slowly changing dimensions, data contracts enforced at the producer, and point-in-time correct feature joins.

The Netflix examples are limited to what the company has published about its own platform: the Keystone event pipeline, Iceberg (which started there), the Maestro workflow orchestrator and the Metaflow ML framework. Where a detail is not public, the lessons describe the general pattern instead of guessing.
