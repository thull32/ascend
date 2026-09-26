---
slug: decode-string
title: Decode String
difficulty: medium
patterns: [stack]
lists: [ascend-150]
companies: [google, amazon, meta, bloomberg]
order: 8
lesson: interview-patterns/sequence-patterns/stack-patterns
hints:
  - Brackets nest, so the innermost group must be expanded first. When you meet `]` you need to know the string built since the matching `[` and the number just before it.
  - Push the current partial string and the pending repeat count onto a stack when you see `[`; start a fresh partial string. On `]`, pop both, repeat the inner string, and append it to the outer partial string.
  - Numbers can have several digits. Accumulate `count = count * 10 + digit` until you hit `[`.
signatures:
  python:
    name: decode_string
    starter: |
      def decode_string(s: str) -> str:
          pass
  javascript:
    name: decode_string
    starter: |
      function decode_string(s) {
      }
tests:
  - args: ["3[a]2[bc]"]
    expected: "aaabcbc"
  - args: ["3[a2[c]]"]
    expected: "accaccacc"
    label: nested
  - args: ["2[abc]3[cd]ef"]
    expected: "abcabccdcdcdef"
    label: trailing plain text
  - args: ["abc"]
    expected: "abc"
    label: no brackets at all
  - args: [""]
    expected: ""
    label: empty
  - args: ["10[x]"]
    expected: "xxxxxxxxxx"
    hidden: true
    label: multi-digit count
  - args: ["2[a3[b]c]"]
    expected: "abbbcabbbc"
    hidden: true
    label: text before and after an inner group
  - args: ["1[z]"]
    expected: "z"
  - args: ["2[2[y]pq]"]
    expected: "yypqyypq"
    hidden: true
time_limit_ms: 4000
---
A string has been compressed with a simple scheme: wherever a substring `inner` repeats `k` times in a row, it is written as `k[inner]`. Groups can nest, so `2[a3[b]]` means `a` followed by three `b`s, twice. Plain letters outside any brackets appear as-is. Given the encoded string `s`, return the decoded string.

The input is always valid: every `[` has a matching `]`, every group is preceded by a positive integer, and digits only ever appear as repeat counts (never inside the decoded text).

### Examples

| Input | Output | Why |
|---|---|---|
| `"3[a]2[bc]"` | `"aaabcbc"` | Two independent groups |
| `"3[a2[c]]"` | `"accaccacc"` | Inner `2[c]` expands to `cc` first, giving `acc`, repeated three times |
| `"2[abc]3[cd]ef"` | `"abcabccdcdcdef"` | `ef` at the end is not repeated |
| `"10[x]"` | `"xxxxxxxxxx"` | Counts can have more than one digit |

### Constraints

- `0 ≤ len(s) ≤ 30`
- Repeat counts are in `1..300`
- The decoded string has length at most `10⁵`

### Follow-up

The interviewer asks: "Return the character at index `i` of the decoded string without decoding it; the decoded string may be gigabytes." Then: "Write a recursive-descent version. Which one would you ship, and why?"

## Solution

### The naive approach

Find the innermost `k[...]` with a regex, expand it, and repeat until no brackets remain. Each pass rescans and rebuilds the string, so it is `O(n × depth × output)` and the code is a loop around a regex, which is hard to reason about. It also does not generalise to the follow-ups.

### The insight

When you reach a `]`, you need two things: the string accumulated since the matching `[`, and the count that came just before that `[`. Everything *outside* the group must be set aside until the group is finished. "Set it aside and come back to it in reverse order of nesting" is a stack. Each `[` pushes the outer context (the partial string so far and the pending count) and starts a fresh partial; each `]` pops it, repeats the inner partial, and appends it to the outer one.

### The optimal approach

```python
def decode_string(s: str) -> str:
    stack: list[tuple[str, int]] = []  # (outer partial string, repeat count)
    current: list[str] = []            # characters of the partial string being built
    count = 0
    for ch in s:
        if ch.isdigit():
            count = count * 10 + int(ch)
        elif ch == "[":
            stack.append(("".join(current), count))
            current = []
            count = 0
        elif ch == "]":
            outer, k = stack.pop()
            current = [outer + "".join(current) * k]
        else:
            current.append(ch)
    return "".join(current)
```

Time is `O(len(output))`: each output character is written a constant number of times per nesting level it lives in, and nesting depth is bounded by the input length, so for the given constraints this is effectively linear in the output. Space is `O(len(output) + depth)`.

Trace `"2[a3[b]c]"`:

| ch | action | stack | current | count |
|---|---|---|---|---|
| `2` | count | `[]` | `""` | 2 |
| `[` | push `("", 2)` | `[("", 2)]` | `""` | 0 |
| `a` | append | | `"a"` | 0 |
| `3` | count | | `"a"` | 3 |
| `[` | push `("a", 3)` | `[("", 2), ("a", 3)]` | `""` | 0 |
| `b` | append | | `"b"` | |
| `]` | pop → `"a" + "b"*3` | `[("", 2)]` | `"abbb"` | |
| `c` | append | | `"abbbc"` | |
| `]` | pop → `"" + "abbbc"*2` | `[]` | `"abbbcabbbc"` | |

### Common mistakes

- Treating each digit as a complete count, so `10[x]` becomes `"x" * 0` after a `"" * 1`.
- Pushing only the count and losing the outer partial string, which drops the `a` in `2[a3[b]c]`.
- Building strings with `+=` inside the inner loop in languages where strings are immutable; use a list and join, or a builder.

### How to discuss it

Say "it's a stack of contexts; `[` saves the outer context and `]` restores it" and write the tuple you push before writing the loop. For the `k`-th character follow-up, compute lengths instead of strings: walk the encoded string tracking the decoded length so far; on a group, if `i` falls inside the group's total length, reduce `i` modulo the inner length and recurse into it, otherwise skip the whole group. That is `O(n)` per query with `O(1)` output, which is the difference between a solution that runs and one that runs on gigabytes. The recursive-descent version is the same algorithm with the call stack replacing the explicit one; it reads more clearly but can overflow on deep nesting, so in production prefer the explicit stack or bound the depth. The shape is identical to [Evaluate Reverse Polish Notation](/practice/evaluate-rpn): a closing token resolves state that was saved on the way in.
