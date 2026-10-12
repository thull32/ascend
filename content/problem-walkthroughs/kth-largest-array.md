---
problem: kth-largest-array
args: [[3, 2, 1, 5, 6, 4], 2]
frames: 26
source: 5de6712e36287e05
---
@0-1
Six numbers: three, two, one, five, six, four. We want the second largest. Sorting everything works, but it orders numbers we will never look at. The insight: keep only the k largest seen so far, in a min heap. The smallest of those k sits at the root, and that smallest is exactly the k-th largest. Every new number only has to beat the root to get in. The heap starts empty.

@2-6
Three goes in. Then two goes in, and because this is a min heap, two rises to the root. Two numbers, which is k, so nothing is removed.

@7-11
One goes in and becomes the root. Now the heap holds three numbers, one too many, so we pop the root, the smallest. One is gone. It could never be among the two largest, because two and three are both bigger. The heap is two and three.

@12-15
Five goes in, and the heap is two, three, five. Too many again. Pop the smallest: two leaves. The heap holds three and five, the two largest so far.

@16-19
Six goes in, then the smallest, three, is popped. The heap is five and six.

@20-23
Four goes in. It sits at the root for a moment, because it is the smallest of four, five and six. Then it is popped straight back out. Four was never going to be in the top two.

@24-25
The root is five, and five is the second largest. We return five.

The heap never holds more than k plus one numbers, so each push and pop costs log k, and the whole pass is n log k time with k space. It works on a stream too, because it never needs the whole array. Quickselect is the other answer: partition around a pivot and recurse into the one side that holds the target, for linear time on average but quadratic in the worst case. The common mistakes are an off by one, since the k-th largest is index n minus k in ascending order, and using a max heap of all n numbers, popping k times, which spends linear space for no reason.
