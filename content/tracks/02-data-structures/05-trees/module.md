---
slug: trees
title: Trees
description: Binary trees, search trees, balance and the recursion patterns that solve every tree interview question, plus the general trees that file systems, DOMs and databases are actually made of.
prerequisites: [data-structures/linked-lists]
---
A linked list gives every node one successor. Allow two, and you get a structure whose height is logarithmic in its size when it is balanced, and that is the whole reason trees exist: any operation that walks one root-to-leaf path costs O(log n) instead of O(n). Search trees, heaps, tries, B-trees, segment trees, syntax trees and every hierarchical namespace you have used are variations on that one idea.

Trees are also the first structure where recursion stops being a curiosity and becomes the only sane way to write code. A tree is a node plus two smaller trees; almost every tree algorithm is "solve the two smaller trees, then combine". Interviewers love trees because they test whether you can define a recursive contract precisely, and senior interviewers push further: what happens when the tree is degenerate, when the recursion is 100,000 frames deep, or when the tree lives on disk in 16 KiB pages.

This module builds from terminology and representations through the four traversals, binary search trees and their validation, why and how trees are kept balanced, the top-down and bottom-up recursion patterns that cover the whole interview problem family, and finally general n-ary trees and serialisation. The [balanced trees](/learn/advanced-data-structures/balanced-trees/avl-trees) and [range queries](/learn/advanced-data-structures/range-queries/segment-trees) modules in the advanced track pick up where this one stops.
