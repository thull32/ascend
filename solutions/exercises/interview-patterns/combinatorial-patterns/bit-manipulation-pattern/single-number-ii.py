def single_number_ii(nums):
    result = 0
    for b in range(32):
        count = sum((x >> b) & 1 for x in nums)
        if count % 3 == 1:
            result |= 1 << b
    if result >= 1 << 31:
        result -= 1 << 32
    return result
