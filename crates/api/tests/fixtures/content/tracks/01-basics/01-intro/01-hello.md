---
slug: hello
title: Hello
description: Fixture lesson with a quiz and an exercise.
minutes: 10
difficulty: easy
tags: [fixture, pattern:math]
problems: [add-two]
---
Opening paragraph.

## Section one

Body.

```exercise
id: add
title: Add
prompt: |
  Add two numbers.
entry: add
languages: [python, javascript, typescript]
starter:
  python: |
    def add(a, b):
        return 0
  javascript: |
    function add(a, b) {
      return 0;
    }
  typescript: |
    function add(a: number, b: number): number {
      return 0;
    }
tests:
  - args: [1, 2]
    expected: 3
  - args: [0, 0]
    expected: 0
    hidden: true
```

## Check yourself

```quiz
- q: >-
    What is 1 + 1?
  options: ["1", "2", "3"]
  answer: 1
  explanation: >-
    Arithmetic.
- q: >-
    What is 2 * 3?
  options: ["5", "6"]
  answer: 1
  explanation: >-
    Multiplication.
```
