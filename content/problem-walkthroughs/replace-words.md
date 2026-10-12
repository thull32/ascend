---
problem: replace-words
args: [["cat", "ca"], "cattle dog"]
frames: 49
source: 9eaab5cc74510bf2
---
@0
The roots are cat and ca, and the sentence is cattle dog. Every word should shrink to its shortest root, so cattle should become ca, not cat. The insight: "the shortest root that starts this word" is one walk down a trie of the roots. Walk the word one letter at a time, and the first node marked as the end of a root is the answer. You can stop right there.

@1-10
First we build the trie, a dictionary of dictionaries, one level per letter. Inserting cat creates a child for c, under it a child for a, under that a child for t. At the t node we set an end marker, which says a root finishes here.

@11-18
Now ca. setdefault reuses the nodes that already exist, so the walk follows c, then a, without creating anything. At the a node we set the end marker. That node now carries two things: a child t, on the way to cat, and the marker for ca.

@19-22
With the trie built, we define the helper that shortens one word, split the sentence on spaces, and shorten each word in turn.

@23-28
The first word is cattle. We start at the root of the trie. Position zero, letter c. The order inside the loop matters: first we ask whether the current node ends a root. The root of the trie does not, so we step down to the c child, which exists.

@29-32
Position one, letter a. The c node does not end a root either, so we step down to the a node.

@33-35
Position two, letter t. Now the check fires: the node we are standing on ends a root. We return the first two letters of the word, ca, without ever looking at the t. Because the check runs before we consume the next letter, the shorter root ca wins over cat, even though cat is also a prefix of cattle.

@36-37
The first word comes back as ca, and the generator moves on to dog.

@38-44
Position zero, letter d. The root does not end a root, and it has no child for d, so the lookup gives nothing. The walk has fallen off the trie, which means no root starts this word, and we return dog unchanged.

@45-48
The words are joined with single spaces: ca dog.

Building the trie costs one step per root letter, and each sentence letter is examined at most once, so the whole thing is linear in the input. Better still, a word costs no more than its shortest matching root. The mistake this problem is known for is checking the end marker after stepping to the child: that either misses a root that ends one letter earlier, or returns the longer of two nested roots, here cat instead of ca.
