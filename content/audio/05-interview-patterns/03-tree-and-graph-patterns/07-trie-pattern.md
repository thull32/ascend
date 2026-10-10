---
lesson: trie-pattern
source: 6e4abdaed87d8769
fit: partial
desk:
  - "The trie node and trie class in Python and JavaScript"
  - "The Implement Trie, wildcard search, Word Search Two and Replace Words traces, node by node"
  - "The Word Search Two code with dead-leaf deletion, and the binary-trie XOR trace"
  - "The structure comparison table, the node-cost tables and the near-misses table"
  - "The trie insert and autocomplete visualisations"
  - "Exercises: trie with prefix counting, and word dictionary with wildcard search"
---
## Introduction

You have a dictionary of words, and the questions are about their beginnings. Does any word start with these letters? Which words share this prefix? What is the shortest root of this word? Can this pattern, with wildcards, match anything? A hash set answers "is this exact word present" and nothing else; "does any word start with p, r, e" becomes a scan of the whole set. Sorting and binary search handles plain prefixes, but not wildcards, and it cannot walk a board and a dictionary together.

A trie is a tree whose edges are letters and whose root-to-node paths are prefixes. Every word is a path from the root, and every prefix shared between words is a shared path. A prefix query walks one path, however many words are stored. A wildcard branches into the children at that node and nowhere else. And a grid search can ask "does any word continue with this letter?" at every step, and abandon the branch the moment the answer is no.

Coming up: when to reach for it and when a set is honestly better, the invariant, the traps in wildcard search and Word Search Two, and what a node really costs.

## The signal

Listen for "starts with", "prefix", "autocomplete", "words beginning with". For a pattern that can branch, where a dot matches any letter. For many words matched against one board or one text, like Word Search Two or "replace each word with its shortest root", where one trie pointer advances through all the words at once. For "count words with this prefix" or "longest common prefix". And, in disguise, "maximum XOR of two numbers", which is a trie over bits.

What rules it out. Exact membership only: a hash set is about 5 times faster per lookup, with a fraction of the memory. Substring search, where the pattern can occur anywhere: tries index prefixes, so that is a job for Knuth-Morris-Pratt, a rolling hash, or a suffix structure. Group anagrams: the order of letters is irrelevant, so key a hash map by sorted letters. And finding one word on a board: with one word, the trie has nothing to share, so plain backtracking.

Be honest about the comparison. The lesson measured the 19,162 distinct lowercase words in CPython's standard library. A set of every prefix took 3.7 megabytes; a trie with dictionary children took about 10. For "starts with" alone, the prefix set is smaller and faster. The trie wins on what the set cannot do: wildcards, carrying state through a board walk, and finding the shortest stored prefix of a word without one lookup per length.

## The invariant

A node holds a map from character to child, and a flag that marks the end of a word. Insert walks the word, creating missing children, and sets the flag on the last node. Search walks and checks the flag. Starts-with walks and checks only that the node exists.

The invariant: there is a node for a string if and only if that string is a prefix of some inserted word, and its end flag is set if and only if the string itself was inserted. So starts-with means "the node exists", and search means "the node exists and the flag is set".

Picture the tiny version. Insert "app" and then "ape". The trie has five nodes. The root, then a, then p. That p has two children: a second p, and an e. Both of those last two carry the end flag. Now: search for "ap". What does it return?

[pause]

False. The node for "ap" exists, because it is a prefix of both words, but its flag is not set. Starts-with "ap" returns true. That difference is the most common trie bug. A search that only checks the node exists reports every proper prefix of a stored word as a word. After inserting only "apple", it says "app" is there. The test that catches it is always a stored word's proper prefix.

Each operation does one lookup per character, so the cost is the length of the string, independent of how many words are stored. Say that independence out loud; it is the property a hash set cannot give prefixes.

Space is one node per distinct prefix. On the standard-library word list, 135 thousand characters produced about 54 thousand nodes, 0.4 nodes per character, because words share beginnings.

## Wildcards

Design Add and Search Words: a dot matches any single letter. At a literal letter, the walk continues down one child. At a dot, it must try every child, so the walk becomes a depth-first search over a node and a position in the pattern.

The trap lives in the base case. When the pattern is exhausted, return the node's end flag, not true. Add the words bad, dad and mad, and search for dot a. The wildcard branches to b, d and m, and each has an a child. But the pattern ends there, on the nodes for "ba", "da" and "ma", and none of them is a word end. The answer is false. Return true at the end of the pattern and you match dot a against bad.

The cost: linear without dots. With dots, it branches at each one, bounded by the number of stored prefixes that match the literal letters. A pattern of all dots visits every node at that depth.

## Word Search Two

A letter grid and a word list: return every word you can trace through adjacent cells without reusing a cell. Running single-word search once per word repeats the same board walks for every word. Instead, build one trie, and run a depth-first search from every cell, carrying a trie node with you. A letter that is not among the current node's children ends the branch for every word at once.

Three refinements. Store each word at its end node, so you do not rebuild strings. When you find a word, clear it, so a word reachable from two start cells is reported once. And on the way back out of the recursion, delete any trie node that has no children and no unreported word. No remaining word passes through it, so later walks stop a letter sooner.

Which of the three actually changes the running time? The deletion. The lesson measured an 8 by 8 board of all a's with the words a, a a, and so on up to ten a's. Without deletion, the search makes about 1.2 million calls. With it, 83, because once every word is found, the trie empties and each start cell dies at the root. Clearing the word alone changes nothing measurable.

Two more bugs. Mark the board cell only after the trie check, and restore it before returning; otherwise later start cells see a marked cell and miss words, and that only shows when two words share cells. And never rebuild the trie per start cell, which brings back the factor the trie exists to remove.

Replace Words is the cleanest use of the flag. Walk each word and stop at the first node with the end flag set. That is the shortest root, because a shorter root would have set an earlier flag. With roots cat, bat and rat, "the cattle was rattled by the battery" becomes "the cat was rat by the bat".

## What a node costs

This is where candidates over-claim. In CPython, measured on that 54 thousand node trie: a class with slots and dictionary children costs about 202 bytes per node. A plain dictionary of dictionaries, 187. Children as a 26-slot list, 312, because most slots are empty. Flat integer arrays, 111.

Why so much for a dictionary? An empty CPython dictionary is 64 bytes, but the first insert allocates a table and it jumps to 184. A trie node pays that step for its first child, and most nodes have exactly one child. So most of a trie's memory is the table overhead of one-child nodes. In Node, Map children came to about 230 bytes per node and a plain object about 111. The fixed 26-slot array is the most expensive choice in both, despite looking simpler.

The 26-slot array has a correctness trap too. Index by the letter's code minus the code for lowercase a, and an uppercase T gives minus 13. Python's negative indexing silently reads slot 13, the child for n. So after inserting "nea", a search for "Tea" walks n, e, a and returns true. Ask about the alphabet first.

Raw lookup speed is not the trie's advantage either: about 173 nanoseconds per word against 31 for a set. And real systems use compressed forms: the Linux kernel's routing table is a level- and path-compressed trie doing longest-prefix match on address bits, and Redis uses a radix tree for stream entries.

## In the interview

The interviewer says: memory is too high. What would you change?

[pause]

Measure first. Then compress single-child chains into string-labelled edges, a radix trie. Or move to flat integer arrays. Or, if you only need prefix ranges, drop the trie for a sorted list with binary search. For a static dictionary, a structure that also shares suffixes shrinks it further. The wrong answer is "use a 26-slot array, it is simpler", which was the largest representation measured.

Two more. Top three completions per prefix as the user types: store at each node the top three words of its subtree by frequency, updated along the insert path, so a keystroke moves one node and reads a list. Searching the whole subtree on every keystroke is the entire dictionary for a one-letter prefix. And matching the dictionary against a long text stream: restarting a trie walk at every position costs text length times word length. Aho-Corasick adds failure links so the walk never restarts. Name it; implement it only if asked.

## Recap

Four things to remember. Reach for a trie when the question is about beginnings, wildcards, or many words against one board; for membership alone, or even plain prefixes, a set is smaller and faster, and saying so is part of a senior answer. Reachable is not stored: search and the wildcard base case must check the end flag. In Word Search Two, carry a trie node through the search, clear words when found, and delete dead leaves, which is what turns over a million calls into 83. And know the cost: about 200 bytes a node with CPython dictionaries, and the 26-slot array is the largest, and aliases uppercase letters.

At your desk: the trie class in both languages, the four problem traces, the Word Search code and the XOR trace, the cost tables, the visualisations, and the two exercises.
