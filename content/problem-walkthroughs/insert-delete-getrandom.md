---
problem: insert-delete-getrandom
args: [["insert", 10], ["insert", 20], ["insert", 30], ["insert", 20], ["remove", 10], ["remove", 30]]
frames: 39
source: 6956dda5328df198
---
@0-2
We need a set where insert, remove and get random are all constant time. A hash set cannot pick a uniform random element cheaply, and a list cannot remove cheaply. So we keep both, in sync: a list of values, so a random index is a fair pick, and a dictionary from each value to its position in that list. Both start empty.

@3-7
Insert ten. It is not in the dictionary, so we record its position, which is the current length of the list, zero, and append it. The dictionary says ten lives at zero, and the list holds ten.

@8-17
Insert twenty and thirty the same way. Twenty lives at one, thirty at two, and the list reads ten, twenty, thirty.

@18-20
Insert twenty again. The dictionary already has it, so insert returns false and changes nothing. That membership check is one dictionary lookup.

@21-23
Now the interesting part: remove ten. The dictionary tells us where it lives, position zero, without a search. Deleting from the front of a list would shift every later element down, which is linear. But the order of the list does not matter, so we do something cheaper. We look at the last value, which is thirty.

@24-25
We copy thirty into ten's slot. The list briefly reads thirty, twenty, thirty. Then we update the dictionary so thirty's position is zero. This line is the one people forget, and it is what the next step depends on.

@26-29
We pop the tail, which is the old copy of thirty, and delete ten from the dictionary. The list is thirty, twenty, and the dictionary says twenty is at one and thirty is at zero. Every entry is correct, and nothing was shifted.

@30-31
Remove thirty, the value that just moved. The dictionary says position zero, which is right only because we updated it a moment ago. Without that update it would still say two, a slot that no longer exists.

@32-35
The last value is twenty. Copy it into slot zero, and set twenty's position to zero.

@36-38
Pop the tail and delete thirty from the dictionary. The list holds just twenty, at position zero, and the dictionary agrees.

Every operation is a few dictionary and list-end operations, so all of them are constant time on average, and get random is a random index into the list. One subtle point about the order of the lines: when the value you remove is itself the last one, the copy and the index update are harmless no-ops, and the delete comes after them, so no stale key is left behind. The classic bugs are removing with a linear list remove, and forgetting to update the moved element's index.
