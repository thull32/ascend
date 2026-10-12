---
problem: group-anagrams
args: [["eat", "tea", "tan"]]
frames: 39
source: 2ce9027035a87b94
---
@0
Three words: eat, tea and tan. Two of them are anagrams, and the trick is that we never compare one word with another. Instead, every word gets a canonical form, a key that two words share exactly when they are anagrams. Then grouping is one pass with a hash map from key to list. The key here is a count of each letter: twenty six slots, one per letter of the alphabet.

@1-3
The map of groups starts empty. The first word is eat, and its counts start as twenty six zeros.

@4-9
For each letter, we bump the slot for its position in the alphabet. E is position four, so slot four becomes one. A is position zero. T is position nineteen. After three letters, the counts have a one at zero, at four and at nineteen, and zeros everywhere else.

@10-12
The list becomes a tuple, because a Python list cannot be a dictionary key and a tuple can. That tuple is the key for eat. It is not in the map yet, so setdefault creates an empty group for it and appends eat. The map now has one group, holding eat.

@13-20
Second word: tea. The counts reset to zeros, and the letters arrive in a different order: t, then e, then a. But counting does not care about order. After three letters, the slots are a one at zero, at four and at nineteen, exactly what eat produced.

@21-23
So the key is the same tuple. Watch the key on screen: it does not change, because tea's key is identical to eat's. setdefault finds the existing group and appends tea to it. That group now holds eat and tea. No word was ever compared with another word; they just landed in the same bucket.

@24-31
Third word: tan. T bumps slot nineteen, a bumps slot zero, and n bumps slot thirteen. No e this time, so slot four stays zero.

@32-34
The key has ones at zero, thirteen and nineteen. That is a new key, so tan starts a group of its own.

@35-38
The loop is done. We return the groups, each one sorted: eat and tea in one group, tan alone.

Building each key costs one step per letter plus the twenty six slots, so the whole thing is linear in the total length of the input, against quadratic for comparing every word with every group. Sorting each word into a key, so tea becomes a, e, t, works too and reads more simply; it costs a log factor per word. The common mistake is using the counts list itself as the key, which Python refuses, because lists are not hashable. Turn it into a tuple first.
