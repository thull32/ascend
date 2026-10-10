---
lesson: values-references-and-mutation
source: 416ad8e282bacab4
fit: great
desk:
  - "The same sorting bug written in Python, JavaScript, Go and Rust"
  - "The CPython reference-count trace and the six-step Go append trace"
  - "The Rust borrow-checker error, read line by line"
  - "The copy-cost table and the aliasing bug catalogue"
  - "Exercise: simulate CPython reference counts"
---
## Introduction

A helper function receives a list of orders, sorts it to find the largest, and returns the top one. Two weeks later a report downstream is in the wrong order and nobody can see why. The helper sorted the caller's list in place.

A Go service appends to a slice it was handed, and a different goroutine sees the new element. Sometimes. A JavaScript component spreads its state to "copy" it, mutates a nested array, and the old state changes too. A Python function has an empty list as a default argument and quietly accumulates results across calls.

Every one of these is the same bug: two names for one piece of memory, and a write through one name that the holder of the other did not expect. The languages you use disagree about what a variable holds and when assignment copies. You need the rule for each, because it decides both correctness and cost. A copy you did not know about is an order n operation hiding in a function call. A copy you assumed but did not get is a shared-state bug.

## Two models of a variable

There are two coherent mental models, and each language picks one.

In the value model, a variable is a box of bytes. Assigning b equals a copies the bytes from one box into the other, and afterwards there are two independent values. That is C, Go, Rust, and primitive numbers everywhere. If you want sharing, you ask for it with a pointer.

In the reference model, a variable is a name bound to an object that lives elsewhere, on the heap. Assigning b equals a makes b a second name for the same object. Nothing is copied except the reference, 8 bytes. That is Python, and objects in JavaScript and Java. If you want independence, you ask for it with a copy.

The single most useful habit from this lesson: for every assignment and every function argument, ask which model applies here.

Take the opening bug. In Python and JavaScript, the helper's local name is just a second reference to the caller's list, so sorting it sorts the caller's. In Go, assigning a slice copies a 24-byte header, but the header points at the same backing array, so the sort still reaches the caller's data. Rust is different. Assigning a vector moves it: the caller's name is dead, and if the caller tries to use it afterwards, the compiler refuses. To keep its list, the caller must either pass an explicit clone, a visible order n copy, or pass a mutable reference, so the mutation appears in the function's signature. Either way, the aliasing is spelled out in the source.

## Python: one rule, not two

In CPython, every value is an object on the heap, with a reference count and a type pointer. Every variable, list slot and dictionary value is an 8-byte pointer to one. Assignment never copies an object; it changes which object a name points to and adjusts counts.

Walk it through. Make a list and call it a: count 1. Say b equals a: count 2, and 8 bytes copied, no element touched. Append through b, and a sees it too. Delete a: count 1. Set b to None: count zero, and the list is freed right then. That prompt freeing is why CPython's memory tracks live data closely.

Now the folklore: "Python passes lists by reference and integers by value". That is not two rules. It is one rule, a reference to the object everywhere, plus the fact that integers, strings and tuples are immutable, so no operation on them can be observed through another name.

[pause]

Here is a test of that. Inside a function, you write: xs equals xs plus a list containing 1. Does the caller see the change?

No. Plus builds a new list, and the assignment rebinds the local name. The caller's list is untouched. But plus-equals on a list mutates it in place, and the caller does see that. The callee receives a new name bound to the caller's object: mutating the object is visible, rebinding the name is not. The honest term is call by object reference.

Two traps follow. A mutable default argument is created once, when the function is defined, and every call shares it; the idiom is to default to None and create the list inside. And the small-integer cache: Python keeps one shared object for each integer from minus 5 to 256, so "is" happens to say true for two 256s and may say false for two 257s. "Is" compares identity. Only double-equals is a promise about values.

## JavaScript: references and hidden classes

JavaScript primitives, numbers, strings, booleans and a few others, behave as values. Everything else, objects, arrays, functions, behaves as references.

The spread operator makes a shallow copy: a new outer object whose nested arrays and objects are the same ones as before. Push to a nested array in the "copy", and the original sees it. Const means the binding cannot change; it says nothing about the object. And React's rule never to mutate state exists because its change detection compares references: mutate the existing object, set the same reference back, and nothing re-renders. A real deep copy is structured clone, which still drops functions and prototypes.

V8 adds a layer that decides performance rather than correctness. Every object points to a hidden class describing which properties it has and at which offsets, and objects built by the same sequence of property additions share one. So an object built with x then y has a different hidden class from one built with y then x. A property read caches the hidden class it last saw. One class: the read is a compare and a fixed-offset load, as fast as a struct field in C. Up to four: a short chain of checks. More than four, and the site goes megamorphic, falling back to a global lookup on every access. The rule: initialise every property in the constructor, in the same order, and never delete one.

## Go: values, with a slice-shaped trap

Go is where this matters most. A struct assignment copies every field, which is safe and sometimes expensive: a struct holding an array of 64 strings is a kilobyte copied on every call. Use a pointer when the struct is large or must be mutated.

A slice is a 24-byte header: a pointer to a backing array, a length and a capacity. Copying a slice copies the header. Both headers point at the same array.

Whether append aliases or reallocates depends on whether the new length fits inside the capacity. Picture a slice s with length 2 and capacity 4. Append one element to get t. It fits, so t shares s's array. Write to the first element of t, and s sees it. Keep appending until the capacity is exceeded, and Go allocates a new, bigger array and copies. Now write to the first element of the new slice, and s does not see it. The alias has gone stale.

Same statement, opposite outcomes, decided by a capacity the caller never sees. That is the source of a whole class of subtle Go bugs: a function appends to a slice it received and sometimes overwrites elements the caller still holds. The defences: only append to a slice you own; hand out sub-slices with their capacity capped to their length, using the three-index slice expression, so the recipient's first append is forced to reallocate; or copy explicitly. Maps and channels are pointers to runtime structures, so assignment always shares.

## Rust: moves and the borrow checker

Rust adds a third verb. Assigning a string, a vector or a box moves it: the source is no longer usable, so there is never a moment when two names own one heap buffer. Small plain types like integers are simply copied. And the borrow checker enforces one rule: at any moment, a value may have any number of shared references, or exactly one mutable reference. Never both.

Here is the Go trap written in Rust. Take a shared reference to the first element of a vector, push a new element, then print the reference. The compiler rejects it. Why? Because push may reallocate the buffer, after which the reference would point into freed memory. That is exactly what the stale Go alias does silently. The fix needs no clone. Move the print above the push, so the shared borrow ends before the mutable one begins.

The cost is that you decide ownership up front. The payoff is that every copy of heap data is spelled clone, so the order n cost is visible, and every mutation through a shared path is a compile error rather than a bug report.

## What copying costs, and the bug catalogue

"Copy" hides three operations. Copying a reference or a header: 8 or 24 bytes. A shallow copy, a new container with the same elements: for a million elements, an 8 megabyte memory copy, a millisecond or two. A deep copy, which walks and re-allocates everything reachable: for a million small dictionaries, seconds and hundreds of megabytes. Most "I need a deep copy" cases are really "I need a fresh outer container".

Slicing is the trap. In Python, slicing off the first element allocates a new list. A recursive function that recurses on the rest of the list copies about n squared over 2 references: for 10 thousand elements, about 50 million copies, for a sum. Go slicing shares instead, which is constant time but means a tiny sub-slice can pin a huge buffer in memory.

And the aliasing bugs worth recognising on sight. Multiplying a nested list in Python creates one inner list referenced many times, so setting one cell sets a whole column. A class that stores the collection its caller passed in now shares state with the caller. Removing items from a list while iterating over it skips elements. Lambdas created in a Python loop capture the variable, not its value, so they all return the last one. A getter that returns its internal cache hands out a live reference. Each has the same shape: a name you did not think of as an alias is one.

## In the interview

A follow-up the lesson expects: when does Go's append allocate, and how do you hand out a sub-slice safely?

[pause]

It allocates when the new length exceeds the capacity. Below that, it writes into the shared backing array. To hand out a sub-slice safely, set its capacity equal to its length with the three-index slice expression, so the recipient's first append must reallocate, which severs the alias. The wrong answers are "append always copies" and "slices are passed by value, so they are safe".

And: why does the borrow checker reject a push while a reference to an element is alive, and how do you fix it without cloning? Because the push may reallocate and leave the reference dangling. End the shared borrow first, by using it or copying the element out, then push. Reaching for clone compiles, but it hides an order n copy that reordering would have avoided.

## Recap

Four things to remember. Ask of every assignment whether it copies a value or creates another name. Python is one rule, a reference to the object, plus immutability; mutating is visible to the caller, rebinding is not. In Go, append shares the backing array until capacity runs out, so cap sub-slices before handing them out. And know your copies: shallow copies share the elements, deep copies cost the whole graph, and Python slicing inside recursion is quadratic.

At your desk: the bug in four languages, the reference-count and append traces, the borrow-checker error, the copy-cost table and bug catalogue, and the reference-count exercise.
