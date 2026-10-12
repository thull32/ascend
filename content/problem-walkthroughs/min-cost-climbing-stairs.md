---
problem: min-cost-climbing-stairs
args: [[3, 8, 1, 1, 9, 2]]
frames: 14
source: bb249a1df2401a14
---
@0
The step fees are 3, 8, 1, 1, 9 and 2, and the top is one past the last step, position 6. You may start on step 0 or step 1 for free, and each time you leave a step you pay its fee and climb one or two. The idea: the cheapest way onward from a position does not depend on how you got there. So define the cost to stand on position i, and it is the cheaper of two arrivals: from one below, paying that step's fee, or from two below, paying that one's.

@1
Each answer only reads the two before it, so instead of a whole table we keep two numbers: two back and one back. Both start at zero, because standing on step 0 or step 1 is free.

@2-3
Position 2. Arriving from step 1 costs zero plus its fee of 8. Arriving from step 0 costs zero plus 3. The cheaper is 3. The pair shifts along: two back becomes the old one back, zero, and one back becomes 3.

@4-5
Position 3. From step 2: 3 plus a fee of 1, which is 4. From step 1: zero plus 8. So 4. The pair is now 3 and 4.

@6-7
Position 4. From step 3: 4 plus 1 is 5. From step 2: 3 plus 1 is 4. Two steps wins here: 4. The pair is 4 and 4.

@8-9
Position 5. From step 4: 4 plus its fee of 9 is 13. From step 3: 4 plus 1 is 5. The pair is 4 and 5. Notice that the expensive step 4 is simply jumped over.

@10-11
Position 6, the top. From step 5: 5 plus 2 is 7. From step 4: 4 plus 9 is 13. The answer is 7.

@12-13
We return one back, 7: start on step 0, pay 3, then 1, 1 and 2, never standing on the 8 or the 9. Linear time, constant space. The classic mistake is treating the last step as the top, which forces you to stand on it and pay its fee. The top has no fee, and is one past the end.
