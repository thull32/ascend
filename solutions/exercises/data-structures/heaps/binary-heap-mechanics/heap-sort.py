# In-place heap sort: bottom-up heapify to a max-heap (O(n)), then
# repeated root-to-end swap plus sift-down to extract in ascending order.


def heap_sort(values):
    a = list(values)
    n = len(a)

    def sift_down(i, end):
        while True:
            left, right = 2 * i + 1, 2 * i + 2
            largest = i
            if left < end and a[left] > a[largest]:
                largest = left
            if right < end and a[right] > a[largest]:
                largest = right
            if largest == i:
                break
            a[i], a[largest] = a[largest], a[i]
            i = largest

    for i in range(n // 2 - 1, -1, -1):
        sift_down(i, n)

    for end in range(n - 1, 0, -1):
        a[0], a[end] = a[end], a[0]
        sift_down(0, end)

    return a
