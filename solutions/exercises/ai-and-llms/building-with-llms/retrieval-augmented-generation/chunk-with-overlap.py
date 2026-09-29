def chunk_text(text, size, overlap):
    words = text.split()
    chunks = []
    if not words:
        return chunks

    stride = size - overlap
    start = 0
    n = len(words)
    while True:
        end = min(start + size, n)
        chunks.append(" ".join(words[start:end]))
        if end >= n:
            break
        start += stride
    return chunks
