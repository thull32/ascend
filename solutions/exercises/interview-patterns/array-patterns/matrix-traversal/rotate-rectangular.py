def rotate_clockwise(matrix):
    if not matrix or not matrix[0]:
        return []
    m = len(matrix)
    n = len(matrix[0])
    result = [[0] * m for _ in range(n)]
    for i in range(m):
        for j in range(n):
            result[j][m - 1 - i] = matrix[i][j]
    return result
