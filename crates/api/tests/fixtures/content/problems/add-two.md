---
slug: add-two
title: Add Two
difficulty: easy
patterns: [math]
lists: [ascend-150]
order: 1
lesson: basics/intro/hello
hints: ["Use +."]
signatures:
  python:
    name: add_two
    starter: |
      def add_two(a, b):
          pass
tests:
  - args: [1, 2]
    expected: 3
  - args: [2, 2]
    expected: 4
    hidden: true
---
Add two numbers.

## Solution

```python
def add_two(a, b):
    return a + b
```
