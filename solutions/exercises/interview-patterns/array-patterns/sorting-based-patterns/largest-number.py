from functools import cmp_to_key


def largest_number(nums):
    strs = [str(n) for n in nums]

    def compare(a, b):
        if a + b > b + a:
            return -1
        if a + b < b + a:
            return 1
        return 0

    strs.sort(key=cmp_to_key(compare))
    if strs[0] == "0":
        return "0"
    return "".join(strs)
