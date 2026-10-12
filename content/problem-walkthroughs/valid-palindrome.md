---
problem: valid-palindrome
args: ["Ab, a!"]
frames: 22
source: 4e2797e580db189f
---
@0
The string is a capital A, b, a comma, a space, a, and an exclamation mark. Ignoring case and everything that is not a letter or digit, it reads a, b, a: a palindrome. The easy answer builds that cleaned string and compares it with its reverse, at the cost of a copy. The insight is that a palindrome check only ever compares a character from the left with its mirror from the right. So two pointers walk inward, each skipping what should be ignored, and the cleaned string never needs to exist. lo starts at position zero and hi at position 5.

@1-5
The capital A at lo is a letter, so lo stays. The exclamation mark at hi is not, so hi steps left, onto the a at position 4.

@6-8
Compare, lowercased: a and a match. Both pointers step inward. Without the lowercasing, capital A against small a would have failed.

@9-15
Now lo is on the b at position 1, which is a letter. hi is on the space, which is skipped, then the comma, which is skipped too. Each skip checks that lo is still below hi, and that guard is what stops hi when it reaches lo. Without it, a string of pure punctuation would run a pointer right off the end.

@16-18
Both pointers sit on the b, the middle character. It matches itself, which is harmless, and the pointers step past each other.

@19-21
lo has passed hi, so every mirrored pair matched, and we return true.

Each pointer only moves inward, so time is linear, and space is constant. The mistakes are skip loops without the guard, comparing without lowercasing, treating the underscore as a letter, which some regular expressions do but the problem does not, and returning false for the empty string, which is a palindrome. For the follow up that allows one deletion, run the same walk, and at the first mismatch, try skipping either the left or the right character and check the rest.
