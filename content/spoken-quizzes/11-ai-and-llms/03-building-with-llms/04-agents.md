---
lesson: agents
source: 4583ca46dab7054a
---
## 1

An agent task takes 15 steps, and each step is correct 97 percent of the time, independently. Roughly how often does the whole task succeed?

A, about 85 percent. B, about 45 percent. C, about 63 percent. D, about 97 percent.

[think]

The answer is C: about 63 percent.

0.97 to the power 15 is about 0.63. Per-step reliability that looks excellent in isolation compounds into a task that fails more than a third of the time, which is why long runs need checkpoints, such as tests or validators.

## 2

A check catches 80 percent of wrong steps, and a caught step is redone with the same 95 percent success. What happens to a 20-step task's success rate?

A, it rises to about 45 percent, since only a single retry is allowed for each step. B, it rises to about 78 percent, since each step now succeeds 98.8 percent of the time. C, it rises to 100 percent, since every wrong step is eventually caught and corrected. D, it stays near 36 percent, since a check cannot change the per-step success rate.

[think]

The answer is B: about 78 percent, since each step now succeeds 98.8 percent of the time.

Per-step success becomes 0.95, plus 0.05 times 0.8 times 0.95, about 0.988, and 0.988 to the power 20 is about 0.785, against 0.358 without the check. Checkpoints change the base of the exponent, which is why tests and validators matter more than a slightly better model. The 20 percent of errors the check misses keep it below 100.

## 3

Why does an agent's input-token cost grow roughly quadratically with the number of steps?

A, providers charge a higher rate per token for later calls in a long conversation. B, each call resends the whole transcript, which itself grows with every step. C, attention cost is quadratic in length, and providers bill for that compute. D, the system prompt and tool list are duplicated again on every step.

[think]

The answer is B: each call resends the whole transcript, which itself grows with every step.

Each call sends everything from the calls before it, so the total input is the sum of a growing series. Billing is per token at a flat rate; the quadratic comes from resending, not from attention compute. Caching lowers the price of the repeated prefix, but the tokens are still processed on every call.

## 4

In a traced six-call agent run, one tool returns 2,400 tokens of raw JSON on call 3. What does trimming it to 400 tokens save?

A, about 6,000 input tokens, since the result is resent on the three later calls. B, nothing, because prompt caching makes all previously seen tokens free to resend. C, 2,000 input tokens once, because the result is sent to the model only a single time. D, about 12,000 input tokens, because both the call and its result are resent twice.

[think]

The answer is A: about 6,000 input tokens, since the result is resent on the three later calls.

The result joins the transcript and is resent on calls 4, 5 and 6, so each of those sends 2,000 fewer tokens: 6,000 in total, 13 percent of the run's input. Caching bills those resent tokens at about a tenth, which is cheaper but not free, and they still occupy the context the model attends over.

## 5

An agent retried a payment tool call after a timeout, and the customer was credited twice. Which guardrail addresses the root cause?

A, a step cap, so the agent cannot keep calling the payment tool in a loop. B, a lower temperature, so the model is less likely to repeat the same tool call. C, an idempotency key tied to the operation being paid, not to the attempt. D, a longer tool timeout, so slow payment calls are not mistaken for failed ones.

[think]

The answer is C: an idempotency key tied to the operation being paid, not to the attempt.

Retries are unavoidable in distributed systems, so side effects must be safe to repeat. An idempotency key tied to the operation, the dispute being credited, makes the second call a no-op, whether the harness retried it or the model issued it again. A step cap limits loops but does not stop one duplicated call, and a longer timeout only makes the retry rarer.

## 6

The model ends its turn saying the dispute is resolved. What should the harness do before reporting success?

A, report success, since an end-turn stop means the model finished the task. B, check the outcome itself first, such as the ledger showing one credit. C, run a second model on the transcript to judge whether it looks resolved. D, ask the model to confirm it is sure, then report its second answer.

[think]

The answer is B: check the outcome itself first, such as the ledger showing one credit.

Ending the turn is only the model's claim that it is done. Where the task has a checkable outcome, the harness verifies it, one credit issued and the balance reconciled, and feeds a failed check back into the loop within the step cap. Asking the same model again, or a judge reading the transcript, checks the story rather than the state of the world.
