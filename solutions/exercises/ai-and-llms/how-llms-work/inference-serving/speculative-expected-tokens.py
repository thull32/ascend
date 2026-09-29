def expected_tokens_per_pass(alpha, k):
    if alpha == 1:
        return k + 1
    return (1 - alpha ** (k + 1)) / (1 - alpha)
