---
lesson: math-and-geometry
source: 7a229879e867948a
fit: partial
desk:
  - "The four templates in Python and JavaScript: digit addition, repeated squaring and its modular form, cross product and squared distance, the spiral fill"
  - "The near-misses table and the four clarifying questions"
  - "The traces: Pow(x, n) for 2 to the 13, Multiply Strings for 123 times 45, Detect Squares, Spiral Matrix II for n equals 3"
  - "The variations and complexity tables"
  - "The float, JavaScript-number and Python-integer measurements"
  - "Exercises: do four points form a square, and modular exponentiation without overflow"
---
## Introduction

"Implement pow of x and n." "Multiply two numbers given as strings." "Count the squares these points can form." "Fill the matrix in spiral order." These problems have no data-structure trick and no search space to prune. They test whether you can turn school arithmetic and geometry into code that is exact, does not overflow, and has no off-by-one errors, under time pressure.

Candidates rarely fail them for lack of the idea. They fail on the details: a negative exponent, a carry that ripples one place too far, a floating-point equality, a JavaScript remainder that returns minus 1, a spiral that writes over its own corner.

The pattern is to name which of four shapes you are looking at, and use the template whose invariant rules those details out. Digit arithmetic, with an explicit carry. Repeated squaring, over the bits of an exponent. Integer-only geometry, with squared distances, cross products, and points as hash keys. And simulation, with direction vectors and a blocked-cell test.

## The signal, and four questions

Numbers that arrive as strings or digit arrays, "up to 200 digits", or "do not convert to an integer": digit arithmetic. An exponent up to 2 to the 31 or 10 to the 18: repeated squaring. Points, coordinates, rectangles, "axis-aligned", "count the shapes": integer geometry, usually with a hash map of points. "Fill in spiral order", "simulate the robot", "rotate": simulation. And "return 0 if it overflows 32 bits", or "modulo 10 to the 9 plus 7": the arithmetic is easy, and the width is the question.

What rules it out? An optimum over choices, like the most points a robot can collect, involves numbers but is DP or greedy. And a built-in that trivialises the question. Converting to integers solves Multiply Strings, and the power operator solves Pow. Say you know they exist, then ask whether the interviewer wants the algorithm. They almost always do.

Four clarifying questions each change the code you write. Can inputs be negative? A negative exponent adds an inversion, and negative values make JavaScript's remainder differ from Python's. What is the integer width? 32-bit signed means an overflow check before every multiply by 10. Is the answer taken modulo something? Then reduce after every product, never only at the end. And may I use the built-in big integers or power function? Asking shows you know the difference.

## Digit arithmetic

Add from the least significant digit, with an explicit carry. The invariant: after k steps, the output holds the correct lowest k digits, and the carry holds everything above them. Two digits and a carry make at most 9 plus 9 plus 1, 19, so the carry is 0 or 1. The loop must run while either input has digits or a carry remains, which is what emits the final 1 of 999 plus 1. Forget that, and 999 plus 1 returns 000.

Multiply Strings is the school method with a landing slot for every carry. The product of an m-digit and an n-digit number has at most m plus n digits, because the two are below 10 to the m and 10 to the n. So an array of m plus n slots never overflows. Digit i of one number times digit j of the other lands in slot i plus j plus 1, and its carry goes into slot i plus j. Iterating from the right lets every carry land in a slot that a more significant product visits later, so one pass normalises everything. 123 times 45 fills to 0, 5, 5, 3, 5; strip the leading zero and you have 5535. One more edge: zero times anything strips down to an empty string, so return "0" in that case.

In Python, the built-in integers are dramatically faster. Multiplying two integers of a thousand digits each took about 5 microseconds; the digit-by-digit loop took 83 milliseconds. And since Python 3.11, converting between integers and decimal strings is limited to 4,300 digits by default, because the conversion is quadratic and was a denial-of-service vector. A solution that stays in digit arrays never meets that limit.

## Repeated squaring

The naive power loop does up to 2 billion multiplications for an exponent near 2 to the 31. Repeated squaring does about 32. The invariant: result times x to the n stays equal to the original x to the n. If n is odd, move one factor of x into the result. Then square x and halve n. Both steps preserve the invariant, and when n reaches 0, the result is the answer.

Take 2 to the 13. Thirteen in binary is 1101. The low bit is 1, so the result takes 2, and x becomes 4. The next bit is 0, so x just becomes 16. The next bit is 1, so the result becomes 2 times 16, which is 32, and x becomes 256. The last bit is 1, so the result becomes 32 times 256: 8,192. One factor per set bit: 2 to the 1, 2 to the 4, and 2 to the 8.

How many iterations does that take for an exponent of a billion?

[pause]

Each iteration halves n, so the floor of log base 2 of n, plus one: 30. And at most 30 multiplications into the result, one per set bit.

Three edge cases decide a strong pass. A negative n: invert x once. In Java or C++, negating minus 2 to the 31 overflows back to itself, so widen to 64 bits first. Zero to a negative power divides by zero, so state an assumption or ask. And 0 to the 0 is conventionally 1, which the template returns.

The same proof holds for any associative multiplication. Modulo m, reduce after every product, so nothing exceeds m squared. For the n-th Fibonacci number with n at 10 to the 18, raise the two-by-two matrix 1, 1, 1, 0 to the n: about 60 squarings, where the simple loop is 10 to the 18 steps.

On floats it is fast but not perfectly accurate. A rounding error in an early square is raised to every later power, so the final relative error grows roughly in proportion to n. For 1.0000001 to the power 2 to the 31, the template was off by about one part in 100 million; the library power function, by about one in 10 to the 17. Judges for this problem compare at five decimal places, so the template passes. Production code calls the library.

## Integer geometry

When coordinates are integers, which they nearly always are, never leave the integers. Compare squared lengths, never square roots. And use the cross product: taken at a corner towards two points, it equals the lengths of the two arms times the sine of the angle between them, so its sign says which way you turn. Positive is a counter-clockwise turn, negative clockwise, zero collinear. With integer inputs, it is an exact integer, so the zero test is exact.

Floats merge things that are not equal. Take the origin, the point a hundred million across and a hundred million and one up, and the point one further along each axis. The two float slopes are identical, about 1.00000001. The cross product is minus 1: not collinear. For Max Points on a Line, key each slope as a reduced fraction, the rise and run divided by their greatest common divisor, with one sign convention. Equal ratios have exactly one reduced form.

Detect Squares stores points, duplicates counting separately, and asks how many axis-aligned squares of positive area three stored points form with a query point. The trick is to iterate over candidate diagonal corners. A stored point is a diagonal corner when its horizontal and vertical distances from the query are equal and non-zero. That fixes the square, and the two other corners are known, so multiply the three counts. With points at 3, 10, at 11, 2, and at 3, 2, a query at 11, 10 finds one square. Add a second copy of 11, 2, and the same query finds two. One candidate per stored point, linear, instead of one per triple.

## Simulation

The spiral fill keeps going straight until blocked, then turns clockwise. The invariant: the cells written so far are exactly the first k cells of the spiral, and the next cell is straight ahead or, when that is blocked, one clockwise turn away. The test must come before the move. Turning after stepping into a filled cell has already overwritten it.

For a three-by-three grid, the walk fills the top row, comes down the right side, goes back along the bottom, and climbs the left side. At 8, the cell ahead is the top-left corner, already filled: the blocker is a filled cell, not an edge. That is the step that boundary-shrinking code gets wrong, and a "this cell is non-zero" test catches it without tracking four boundaries. The 9 lands in the centre.

Two more simulations hide simple structure. Rotating an image 90 degrees in place is a transpose followed by reversing each row: two reflections compose into a rotation. And Happy Number, repeatedly summing the squares of the digits, must cycle because the values stay bounded, so it is cycle detection with a set or Floyd's two pointers.

## The number traps

JavaScript's remainder truncates toward zero, so minus 1 modulo 4 is minus 1, where Python gives 3. A spiral or robot that turns left by subtracting one from its direction index, modulo 4, reads index minus 1 on its first left turn from direction 0, gets undefined, and crashes. Add 3, modulo 4, instead.

Every JavaScript number is a double, exact only up to 2 to the 53. A product of two residues near 10 to the 9 is near 10 to the 18, so it is rounded before the remainder is taken: 999,999,999 times 999,999,998, modulo 10 to the 9 plus 7, gives 70 where the true answer is 72, with no error. Multiply with BigInt, or split one factor into 16-bit halves. Coordinates near 10 to the 9 hit the same wall in cross products.

And the bitwise operators force 32 bits, so halving an exponent of 2 to the 31 with a right shift makes it negative, and the loop stops at once: 0.5 to the 2 to the 31 came back as 1. Halve with floor division instead.

## In the interview

"Count is called far more often than add, in Detect Squares."

[pause]

Index the points by column. The query's vertical side shares its x, so iterate only the points in the query's column, take the side length from the difference in y, and check the squares on both sides. Measured with 20 thousand random points and 2 thousand queries: 11 milliseconds indexed, against 1.8 seconds scanning every point. The wrong answer is precomputing every square at add time.

"The answer must be returned modulo 10 to the 9 plus 7, and you are writing JavaScript." Sums of two residues are safe; products are not. Multiply with BigInt and reduce after every operation. Reducing only at the end, or trusting a product because it ran without an error, is the wrong answer.

## Recap

Five things to remember. Name the shape: digit arithmetic, repeated squaring, integer geometry, or simulation, and state its invariant before the loop. Repeated squaring keeps result times x to the n constant, and takes about 30 steps for a billion. Stay in integers: squared distances, cross products, slopes as reduced fractions. Test before you move in a simulation. And know each language's numbers: doubles exact to 2 to the 53, JavaScript's truncating remainder and 32-bit operators, Python's unbounded integers with a 4,300-digit string limit.

At your desk: the four templates in both languages, the near-misses table and clarifying questions, the four traces, the measurements, and the two exercises on four points forming a square and modular exponentiation.
