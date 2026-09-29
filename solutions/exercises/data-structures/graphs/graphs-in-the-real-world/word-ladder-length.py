from collections import deque
from string import ascii_lowercase


def ladder_length(begin, end, words):
    word_set = set(words)
    if end not in word_set:
        return 0
    word_set.discard(begin)

    queue = deque([(begin, 1)])
    while queue:
        word, steps = queue.popleft()
        if word == end:
            return steps
        for i in range(len(word)):
            for c in ascii_lowercase:
                if c == word[i]:
                    continue
                candidate = word[:i] + c + word[i + 1:]
                if candidate in word_set:
                    word_set.remove(candidate)
                    queue.append((candidate, steps + 1))
    return 0
