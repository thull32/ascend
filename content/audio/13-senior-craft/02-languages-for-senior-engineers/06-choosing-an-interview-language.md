---
lesson: choosing-an-interview-language
source: 2f22c255f99c668a
fit: great
desk:
  - "The six-language benchmark table: lines, times at a million and at 100 thousand"
  - "The Rust solution and the Go heap boilerplate"
  - "The per-language trade-offs table and the language-choice flowchart"
  - "The five-operation toolkit in Python, Java and JavaScript"
  - "The JavaScript min-heap to memorise"
  - "The follow-ups-per-language table"
  - "Exercise: shortest-job-first scheduler"
---
## Introduction

A 45-minute coding round typically leaves about 30 minutes for actual coding. If your language costs you 30 seconds every time you reach for an idiom, the heap API, a comparator, a type the compiler rejects, then six of those moments cost three minutes. That is ten percent of the round, and usually the follow-up question you never reach.

An engineer who writes Java every day but interviews in Python "because it is shorter" can lose more to unfamiliarity than they save in keystrokes. The reverse is common too: a fluent Python programmer who picks Java for a Java shop spends the round wrestling generics.

So the choice is an optimisation with measurable inputs: what the role requires, how fluent you are, how much the standard library does for you, how fast the result runs, and which traps the language sets. The lesson measures those inputs on one problem written six times.

## What interviewers actually expect

Large companies commonly let candidates use any mainstream language in general coding rounds. Rubrics score problem solving, correctness, code quality, testing and communication, not the language itself. But fluency is visible within minutes: whether you write idiomatic code, whether you know the cost of the calls you make, whether you stop to look things up.

The language is constrained in three situations. Domain roles expect the domain's language: Swift or Kotlin for mobile, C plus plus for low-latency systems, TypeScript for frontend. Some teams run practical rounds in their production stack. And some online assessments support a fixed list. Ask your recruiter.

At the senior bar the language also becomes a topic. Interviewers follow up on what you chose: what does that sort cost, how would you make this cache thread-safe in Java, why does this recursion fail at 100 thousand. Pick Rust and expect ownership questions. Pick Go and expect goroutine-leak questions. Choose a language whose runtime you can explain.

## One problem, six languages

The problem: a single worker runs jobs shortest-first among those that have arrived, breaking ties by index, and idles until the next arrival when nothing is waiting. It needs a sort, a priority queue with a two-part key, and careful loop control: a fair sample of a medium interview problem. Each version was written the way a fluent candidate would write it, run on the same million jobs, and checked against the same output.

Lines first. Python took 14. Java and Rust, 21 each. C plus plus, 22. Go, 38, of which 18 are the five methods its heap package demands before any solution is written. JavaScript, 49, of which 32 are a hand-written heap, because it has none.

Now time, at a million jobs. Rust, about 150 milliseconds. C plus plus, about 160. Go, about 490. Java, about 780. JavaScript, about 1.2 seconds. Python, about 2.9 seconds. A factor of 20 from Rust to Python.

So does that mean you should interview in Rust?

[pause]

No. Read the table in two directions. Down the time column, the spread is 20 times. But at 100 thousand jobs, the slowest version, Python, finished in about a tenth of a second. Interview inputs are usually sized so that any reasonable complexity passes in any mainstream language. Across the rows, the spread that matters is lines: Python's 14 against JavaScript's 49 is 35 lines you type, test and can get wrong while the clock runs. Runtime decides only when a platform has one tight time limit for every language, and you can ask about that beforehand.

## Why the same algorithm ran at six speeds

The algorithm was n log n everywhere. The differences are runtime mechanisms, and naming them is exactly the follow-up answer an interviewer wants.

Rust and C plus plus store the duration and index pairs inline in one contiguous array and compare them with inlined code. No allocation per entry, no indirect call.

Go was about three times slower than Rust. Its heap package takes values of the empty interface type, so every push converts the struct to an interface, which escapes to the heap, and every comparison is a call through an interface.

Java's heap entries are each a separate small int array object, and the sort works on boxed Integers with a lambda comparator, so the run is dominated by allocation and pointer chasing. Repeating the call in the same JVM ran at 620 to 710 milliseconds, so warm-up explains little of the gap. Boxing does.

JavaScript's engine compiles the hand-written heap well, but each entry is a two-element array object and every comparison calls a closure.

And Python's heap and sort run in C, which is why Python was only 20 times slower than Rust and not 50. Each push still allocates a tuple, and the loop around it is interpreted.

## The trade-offs that decide

Two rows of the comparison decide most choices. Ordered structures: if a problem needs the largest key at most x, with inserts, Java's tree map floor key and C plus plus's ordered map are one call. Python and JavaScript need a workaround. In Python, that is bisect on a sorted list, stating out loud that each insert costs linear time and that a balanced tree would make it logarithmic. A heap cannot help, because it only exposes its minimum.

Heaps: JavaScript has none, so any Dijkstra, top-k or scheduling problem starts with writing one. Have a 30-line binary heap with a comparator memorised. When n is small, a few thousand, saying "I will sort instead of writing a heap; that is n log n and fine here, and I can write the heap if you want the streaming version" is a legitimate senior move. What is not legitimate is sorting the array on every insertion.

Then each language's signature trap. Python: the recursion limit and interpreter speed. Java: double equals on boxed Integers, and comparator overflow. A comparator written as a subtraction, given the integer maximum and minus 5, overflowed and reported the maximum as the smallest. Use Integer compare. C plus plus: undefined behaviour and iterator invalidation. JavaScript: the default sort compares strings, so ten, nine and one sorted as one, ten, nine; always pass a numeric comparator and test with a two-digit value. Also, shift on a large array is linear, so a BFS queue needs a head index. Go: boilerplate and no set type. Rust: the borrow checker on trees and graphs.

## The readiness test, and switching safely

How do you know your language is ready? Can you write each of these from memory, correctly, in under five minutes: a heap-based Dijkstra, BFS on a grid, union-find with path compression, a trie, binary search on the answer, and an LRU cache. If yes, the language is ready. If not, that list is your practice plan.

The decision itself is short. If the role mandates a language, use it and drill its collections. If you use one language daily and know its collections cold, use it, unless it lacks a standard library, like C, or you cannot pass the drills. Otherwise, Python if you can reach fluency before the loop, and if not, the mainstream language you know best.

Switching is worth it when your language has no usable standard library, when you are not fluent in any language, or when a role mandates it. It is rarely worth it three weeks before an onsite.

A plan that works in about six weeks at five to seven hours a week. Weeks one and two, translate: re-solve 20 problems you already solved, so all the friction you feel is language friction, and put every idiom you looked up on a one-page cheat sheet. Weeks three and four, produce: 30 new problems against a timer across every pattern family. Weeks five and six, perform: at least three mock interviews out loud. Mocks surface what solo practice hides: going silent while you remember an API.

And if you blank on an API in the real round, do not spend three minutes guessing. Say what you need and move on: "I want a min-heap push here; I will double-check the argument order when we test." Most interviewers will confirm it.

## In the interview

A follow-up the lesson expects. This passes, but would it be fast enough at 10 million?

[pause]

Estimate from the runtime's throughput. About 3 seconds at a million in Python means about 30 at 10 million, so in Python you would reduce allocation per item or change language. A compiled language at around 150 milliseconds per million is fine. The wrong answer is "it's n log n, so yes", which ignores constant factors.

And: why did you choose this language? Fluency first, then fit: "I write Java daily, and its tree map and priority queue cover what these problems need." The wrong answer is "Python is shorter", with no evidence of fluency, which invites questions about its costs.

Language knowledge shows up in other rounds too. In system design, nobody wants syntax; they want runtime consequences. A Go proxy holding 50 thousand idle connections is a strong choice if you can say why: goroutines parked on the netpoller cost kilobytes, not a thread each. A JVM service on a latency-critical path invites "what about GC pauses?", and the senior answer names a collector, a heap size and an allocation budget. In behavioural rounds, a language decision is a story about leading a decision with long consequences.

## Recap

Four things to remember. Choose the most fluent language, not the shortest: six half-minute stalls are ten percent of the round. At interview sizes every mainstream language finishes in about a tenth of a second, so runtime rarely decides, but lines and pauses always do. Explain speed differences by mechanism: inline values against boxed objects, interface calls, interpreter loops. And know your language's traps and its heap and ordered-map story, and never switch in the final weeks before a loop.

At your desk: the six-language benchmark, the Rust and Go code, the trade-offs table, the toolkit snippets, the JavaScript heap to memorise, and the shortest-job-first exercise.
