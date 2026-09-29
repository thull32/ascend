def is_palindrome_alnum(s):
    filtered = [ch.lower() for ch in s if ch.isascii() and ch.isalnum()]
    return filtered == filtered[::-1]
