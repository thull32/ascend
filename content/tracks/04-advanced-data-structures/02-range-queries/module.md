---
slug: range-queries
title: Range query structures
description: Segment trees, lazy propagation, Fenwick trees and sparse tables, so you can answer "what is the sum/min over this interval" in logarithmic time while the data keeps changing.
prerequisites: [data-structures/trees]
---
A prefix sum answers "what is the total between index 3 and index 900" in one subtraction, but only while the array never changes. The moment a single element can be updated, every prefix after it is stale, and you are back to a linear rebuild. Time-series dashboards, order books, leaderboards, rate limiters and analytics pipelines all live in exactly that gap: values arrive continuously and the queries ask about intervals.

This module builds the four structures that close the gap. A segment tree turns the array into a binary tree of interval summaries and makes point update and range query both `O(log n)`. Lazy propagation extends it to range *updates* without touching every element. A Fenwick tree does the same job for prefix-decomposable operations in a fraction of the memory and about ten lines of code, and its `lowbit` trick is a small masterpiece of bit manipulation. Sparse tables and square-root decomposition cover the cases the others handle badly: `O(1)` idempotent queries on static data, and operations with no clean inverse.

By the end you will be able to pick the right one from the shape of the query and the update, implement it from memory under interview conditions, and recognise the same ideas inside columnar databases, monitoring systems and matching engines.
