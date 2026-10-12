---
lesson: values-references-and-mutation
source: 17d9d753abab3b77
---
## 1

A Python function takes a list xs, and its only line sets xs to xs plus a one-element list containing 1. You call it with a list a. After the call, what is a?

A, extended by 1, since plus on a list appends in place. B, unchanged, because xs is rebound to a new list. C, a new list object, because Python passes by value. D, extended by 1, because lists are passed by reference.

[think]

The answer is B: unchanged, because xs is rebound to a new list.

The plus builds a new list, and the assignment rebinds the local name, so the caller's object is untouched. "Passed by reference" is the tempting half-truth: the function does receive the same object, but rebinding a name never affects the caller. A plus-equals or an append would mutate the shared object, and then the caller would see it.

## 2

A Go function receives a slice s, made with length 2 and capacity 8. It appends a 9 to get a new slice t, then sets the first element of t to 5. What does the caller's s look like afterwards?

A, 5, 0, 9: the caller's length grew as well. B, 5, 0: the append reused the backing array of s. C, 0, 0: append always copies to a new array. D, 0, 0: s was passed by value, so it is safe.

[think]

The answer is B: 5, 0, because the append reused the backing array of s.

Capacity 8 with length 2 means the append writes into the existing array and returns a header with length 3 over the same memory. So the write to t's first element is visible through s. Passing a slice copies only its header, not the array behind it, so "passed by value" does not protect it. And the caller's length stays 2, so it cannot see the 9.

## 3

Which of these makes a deep copy?

A, JavaScript's structured clone. B, in Go, assigning one slice variable to another. C, in Python, calling list on a list, or slicing the whole of it. D, in JavaScript, object assign into a new empty object.

[think]

The answer is A: JavaScript's structured clone.

Object assign, the list constructor and slicing all create a new outer container but share every element inside it. Assigning a Go slice copies only its 24-byte header. Structured clone recursively copies the whole reachable graph, although it drops functions and prototypes.

## 4

A recursive Python function processes a list by calling itself on the list with its first element sliced off. On a list of 10 thousand elements, what is the total copying work, roughly?

A, about 100 thousand reference copies. B, about 50 million reference copies. C, it depends on each element's size. D, about 10 thousand reference copies.

[think]

The answer is B: about 50 million reference copies.

Each level copies all the remaining references: 9,999, then 9,998, and so on down, which sums to about n squared over 2, or 50 million. The size of each element does not matter, because only references are copied. Pass an index instead of slicing.

## 5

In Rust, you take a shared reference to the first element of a vector, push 4 onto the vector, and then print the reference. Why does Rust reject this, while Go and Python happily run the equivalent?

A, Rust requires a clone before mutating a collection. B, Rust cannot infer how long the borrow must live. C, Rust cannot mutate a vector through any reference. D, a live shared borrow forbids the mutable borrow that push needs.

[think]

The answer is D: a live shared borrow forbids the mutable borrow that push needs.

The rule is many shared borrows or one mutable borrow, never both, and the shared borrow stays alive until its last use in the print. Push needs a mutable borrow because it may reallocate, which would leave the reference dangling: exactly the stale-alias bug that Go and Python allow. No clone is required; moving the print above the push ends the shared borrow first.

## 6

Two JavaScript factories build objects with the same two properties, x and y: one adds x first, the other adds y first. A hot function reads x from a mix of both. What does V8 do at that read?

A, it treats them as one shape, since the property sets are equal. B, it sees two hidden classes and uses a polymorphic inline cache. C, it rebuilds one object into the other's shape on first access. D, it throws, because objects with different shapes cannot be mixed.

[think]

The answer is B: it sees two hidden classes and uses a polymorphic inline cache.

Hidden classes are assigned by the order in which properties are added, so the two factories produce two of them. A site that sees a handful of hidden classes becomes polymorphic, a short chain of checks; past four, it becomes megamorphic and falls back to a generic cache lookup. V8 never rewrites objects to match, and equal property sets do not merge the hidden classes.
