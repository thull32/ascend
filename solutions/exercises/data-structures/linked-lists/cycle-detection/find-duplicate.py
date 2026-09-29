def find_duplicate(nums):
    slow = fast = 0
    while True:
        slow = nums[slow]
        fast = nums[nums[fast]]
        if slow == fast:
            break
    p = 0
    while p != slow:
        p = nums[p]
        slow = nums[slow]
    return p
