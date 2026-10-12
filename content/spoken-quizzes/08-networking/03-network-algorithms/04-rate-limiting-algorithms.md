---
lesson: rate-limiting-algorithms
source: fe104f7dac3c2a57
---
## 1

A fixed window limiter allows 100 requests per minute per client. What is the most a client can get through in any two-second interval?

A, 200. B, about 3. C, unlimited. D, 100.

[think]

The answer is A: 200.

Send 100 in the last second of one window and 100 in the first second of the next. Both windows are within their limit, and 200 requests land within two seconds. Sliding windows, token buckets and GCRA do not have this boundary effect.

## 2

A sliding window counter has a limit of 60 per minute. The previous minute had 40 requests, and you are 30 seconds into the current minute, which has had 35. Is the next request admitted?

A, yes, because the estimate is half of 40, plus 35, which is 55, below 60. B, no, because the previous window alone used two thirds of the limit. C, yes, because the current window's 35 is below 60. D, no, because 40 plus 35 is 75, more than the limit of 60.

[think]

The answer is A: yes, because the estimate is half of 40, plus 35, which is 55, below 60.

The previous window is weighted by the fraction of it still inside the sliding minute, here a half, giving 20 plus 35, which is 55. Adding the raw counts ignores that half the previous window has slid out, and ignoring the previous window entirely would allow the boundary burst.

## 3

A GCRA limiter has an emission interval of 2 seconds and a burst of 3, so its tolerance is 4 seconds. The theoretical arrival time is 10 when a request arrives at time 5. What happens?

A, admitted, and the theoretical arrival time becomes 12. B, admitted, and the theoretical arrival time is reset to 5 plus the interval. C, rejected, and it may retry after 1 second, at time 6. D, rejected, and it must wait 5 seconds, until the theoretical arrival time.

[think]

The answer is C: rejected, and it may retry after 1 second, at time 6.

The theoretical arrival time is 5 seconds ahead of now, which exceeds the tolerance of 4, so the request is rejected and nothing changes. It would be admitted once the gap is at most 4, at time 6. In token-bucket terms, the bucket holds half a token and needs another half, one second of refill. Waiting until time 10 would refill the whole burst, which is more than needed.

## 4

You put a leaky bucket queue that holds 50 requests and drains at 10 requests a second in front of a fragile service. What is the main new risk?

A, the service now receives bursts of up to 50 requests at once. B, memory grows without bound because the queue never fully drains. C, queued requests are processed out of order when the queue fills. D, queued requests can wait about 5 seconds, past many clients' timeouts.

[think]

The answer is D: queued requests can wait about 5 seconds, past many clients' timeouts.

A shaping queue converts bursts into delay: the last of 50 queued requests waits about 50 divided by 10, or 5 seconds, holding its connection the whole time. If the client's timeout is shorter, the work is wasted, and probably retried. The service sees a steady 10 a second, never the burst, and the queue is bounded at 50. Size the queue by the delay you can accept.

## 5

A daily quota is enforced by reading the user's usage, and then incrementing it in a separate statement. A user at 119 of 120 sends two requests at the same instant. What can happen, and how does Ascend's budget code avoid it?

A, both can read 119 and end at 121, and Ascend reads the row with select for update. B, both are rejected as conflicts, and Ascend retries the loser after a backoff. C, the second one deadlocks, and Ascend avoids it by reading without any lock. D, nothing, because Postgres serialises the two statements, so no care is needed.

[think]

The answer is A: both can read 119 and end at 121, and Ascend reads the row with select for update.

Check-then-act across two statements is a race under the default read committed isolation: both reads can see 119 before either write lands. Ascend creates the day's row if it is missing, then reads it with select for update inside a transaction, so the second request waits for the first to commit, finds 120, and is refused. Two requests contending for one row lock cannot deadlock.

## 6

Forty gateway instances share a Redis token bucket per API key, and each instance passes its own clock reading into the Lua script. One host's clock drifts by 100 milliseconds. When does this matter most?

A, only while the Redis primary is failing over to a replica. B, at 1,200 per minute, where 100 milliseconds is the spacing of two requests. C, never, because the Lua script makes the update atomic. D, at 10 per minute, where the 6-second interval magnifies the skew.

[think]

The answer is B: at 1,200 per minute, where 100 milliseconds is the spacing of two requests.

Clock skew misstates how far ahead of schedule a client is by the skew divided by the emission interval, so it matters when the interval is small: 50 milliseconds at 1,200 per minute, making 100 milliseconds worth two requests, against 6 seconds at 10 per minute, where it is negligible. Atomicity prevents interleaving, not wrong inputs. Reading the Redis server's own clock inside the script gives every decision one clock.
