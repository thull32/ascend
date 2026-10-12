---
problem: valid-parentheses
args: ["{[]}([)]"]
frames: 27
source: 7d7df29df8bd4bf5
---
@0
The string has two parts. First, an open curly brace, an open square bracket, a close square bracket, a close curly brace: properly nested. Then an open round bracket, an open square, a close round, a close square: interleaved, which is invalid. Notice that counting cannot tell them apart: in both halves, every kind of bracket has as many closers as openers. The rule is about order: a closing bracket must match the most recently opened bracket that is still open. "Most recent, not yet dealt with" is exactly what a stack tracks.

@1-2
A table maps each closer to its opener, and the stack of open brackets starts empty.

@3-8
The curly brace opens, so it is pushed. The square bracket opens, so it is pushed on top. The stack holds curly, then square.

@9-12
A close square. The stack is not empty, and its top is an open square, the matching opener, so we pop it. Only the curly brace is left.

@13-16
A close curly. The top is the open curly, a match, so it is popped. The stack is empty, and the first part was valid.

@17-22
The round bracket opens and is pushed, then the square bracket opens and is pushed on top of it.

@23-26
Now a close round bracket. The top of the stack is the open square, not the open round. The round bracket is still open underneath, but the square one was opened more recently and must close first. So we return false right here, without reading the last character.

Each character is pushed and popped at most once, so time is linear, and the stack can grow to the full length for a string of nothing but openers. The mistakes are forgetting the final check that the stack is empty, which would accept two open brackets on their own; popping from an empty stack when the string starts with a closer, which crashes instead of returning false; and counting openers and closers, which this example defeats. With only one bracket type, the stack shrinks to a counter.
