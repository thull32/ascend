def ring_sums(matrix):
    if not matrix or not matrix[0]:
        return []
    top, bottom = 0, len(matrix) - 1
    left, right = 0, len(matrix[0]) - 1
    result = []
    while top <= bottom and left <= right:
        total = 0
        for c in range(left, right + 1):
            total += matrix[top][c]
        if top < bottom:
            for r in range(top + 1, bottom + 1):
                total += matrix[r][right]
        if top < bottom and left < right:
            for c in range(right - 1, left - 1, -1):
                total += matrix[bottom][c]
        if left < right and top + 1 < bottom:
            for r in range(bottom - 1, top, -1):
                total += matrix[r][left]
        result.append(total)
        top += 1
        bottom -= 1
        left += 1
        right -= 1
    return result
