---
lesson: observability-in-code
source: 324309aa73c96ace
fit: great
desk:
  - "The real Ascend JSON log line, taken apart field by field"
  - "The filter-directive table, before and after the prefix fix"
  - "The percentile-from-buckets worked table, and the two-instance merge"
  - "The cardinality table and the metrics middleware code"
  - "The traceparent field table and the three-hop propagation table"
  - "Exercises: find failed requests in JSON logs, and continue or restart a trace"
---
## Introduction

A learner writes in: "the coach stopped halfway through an answer, around 14:05." The logs for 14:00 to 14:10 hold 40 thousand lines of free text from every request on the box, and one of them says "stream error". Whose stream, which conversation, related or not, you cannot tell. An hour later you reply "we could not reproduce it".

Now the other version. The failed response carries a request ID header. Filtering the logs by it returns eleven lines: the request, the conversation ID, the AI provider's upstream error, and how long each step took. Five minutes, root cause found. The difference is not tooling. It is decisions made in the code, months earlier, about what to record.

Three signals, and what the code owes each. Logs answer "what happened to this request?", and need structured events with a correlation ID. Metrics answer "how is the system behaving overall?", and need counters and histograms with bounded labels. Traces answer "where did the time go across hops?", and need spans with context carried between processes.

## Structured logs, and the filter that hides them

A structured log line is an event with named fields, not a sentence with values pasted in. The message is constant, "coach stream error", and the error and conversation ID are separate typed fields. A constant message can be counted and grouped. Fields can be filtered. Interpolate the values into the sentence instead, and every query becomes a regular expression over prose, which breaks the day someone rewords it.

Levels should mean something you act on. Error: someone should look. Warn: degraded but handled. Info: lifecycle and business events, like booting, migrations applied, coach turn complete. Debug: detail for development, off in production.

Now a trap from Ascend's own filter. The filter sets a level per module, and it matches modules by plain string prefix. The production filter said the database library, sea orm, logs only warnings. But the migration library's name, sea orm migration, starts with the same prefix. So in production, a slow migration at boot looked like silence. The fix was a longer, more specific directive putting the migrator back at info, since the longest matching directive wins.

The sharper trap is spans. The span that carries the request ID is created at info level. Turn the whole service down to warn to save money, and that span is never created. Every remaining warning and error line loses its request ID, with no error anywhere. Quieten noisy events; keep the request span at info.

Reading the source behind the log lines found three more traps. A streaming response logs its latency when the headers go out, before the first token, so the coach's logged latency is the time to open the stream, not the stream's length. One server error produces two error lines, the app's own and the HTTP library's, so count failures from the status on the finished line, not by counting error lines. And a field named "message" collided with the constant message, so the provider's text replaced it. Nothing in Rust flags that. Reading the emitted output is the test.

## What a log line costs

Measured in Python, writing one line through a JSON formatter costs about 5.6 microseconds. Here is the arithmetic that matters. A Python service at a thousand requests a second, writing ten lines each, spends 56 milliseconds of CPU every second: about 6 percent of a core.

A disabled debug call is nearly free, unless its argument is built eagerly. An f-string argument costs seven times the lazy form, because it is formatted before the level check. Rust's tracing macros check the level first.

The larger cost is downstream. Ascend's request lines are under 300 bytes, about 0.3 gigabytes per million requests before indexing, and log platforms typically bill by volume ingested and retained. Decide volume per module, not per process.

## Request IDs, everywhere

A request ID is useful only if it is on every line of the request, and visible to the person reporting the problem. Ascend wires it in four layers. First, a client-supplied ID is thrown away unless it parses as a UUID. Second, an ID is set on every request, generated fresh when none survived. Third, it is copied onto the response, where a browser, a support ticket or a failing test can quote it. Fourth, the request span carries it, so every event inside inherits it.

Why distrust the client's ID? The first version accepted anything: a 10 kilobyte string, a duplicate of someone else's ID, characters that confuse log tooling. Send a script tag as your request ID today, and you get a fresh UUID back.

Then the gap that bites in incidents. The coach streams its reply from a spawned task, so the reply is saved even if the browser disconnects. But a spawned task does not run inside the span that was current when it was spawned. So in the first version, "coach stream error" and "failed to persist coach reply", the two lines an incident needs most, carried no request ID. The fix is one call: instrument the spawned future with the current span. Any work that outlives its request, spawned tasks, queued jobs, retries, must be handed its context explicitly. Across a queue, that means putting the ID in the message.

## Histograms, percentiles and cardinality

Latency must be a distribution, never an average: an average of 80 milliseconds can hide a 99th percentile of 4 seconds. A histogram exports one cumulative counter per bucket boundary.

Take 1,000 requests. 985 took half a second or less, 994 took a second or less. Where is the 99th percentile? The 990th request falls in the bucket from half a second to one second, which holds 9 requests, and you need 5 of them. Interpolating, the answer is about 0.78 seconds. But that is an assumption; the truth is only known to lie between half a second and a second. So put a bucket boundary exactly at any threshold your SLO names. And the largest finite bucket caps what the histogram can report: here 2.5 seconds, whether the slowest request took 3 seconds or 3 minutes.

Now a dashboard question. Two instances report their own 99th percentiles. Can you average them into a fleet number?

[pause]

No. In the lesson's example the true fleet value is 0.78 seconds. The plain mean of the two instances' numbers says 1.51. The mean weighted by request count says 0.58. Both wrong. A percentile depends on the ranks around it, which per-instance numbers throw away. The fix is to sum the buckets across instances first, then compute the percentile once.

Summaries are worse: they export ready-made quantiles from each process, and no arithmetic recovers a fleet value. Two fleets with identical summaries can have a merged 99th percentile of 900 milliseconds in one and 200 in the other. For anything served by more than one process, use histograms.

Then cardinality. Every unique combination of label values is a separate series, and a histogram multiplies it: Ascend's latency histogram stores 17 series for every label set. Label by route template, method and status class, and it is about 3 thousand series. Label by the raw path instead, and every coach conversation mints a new set: a thousand conversations add 17 thousand series, without bound. Add a user ID for 200 thousand users, and you reach 653 million. So the label is the matched route template, IDs stay in logs and traces, and you count series in review before adding a label. Otherwise monitoring becomes the outage.

Pick metrics with two checklists. RED for anything that serves requests: rate, errors, duration. USE for anything with capacity: utilisation, saturation, errors, such as a database connection pool or grading slots.

## Traces and sampling

A trace is a tree of spans, each with a start, a duration and a parent. Across processes, the context travels in a header called traceparent, with four fields: a version, a 16-byte trace ID shared by every span in the trace, an 8-byte parent ID naming the caller's span, and flags, where the lowest bit says the caller sampled this trace.

Three rules. The trace ID never changes. The parent ID on the wire is the span that made the call. And a header that fails validation, say an all-zero trace ID, is not an error to return: the receiver starts a new trace and carries on. Tracing is best-effort context; it never fails a request. A hop that drops the header does not fail either. It silently starts a second trace, and the tree splits.

Now sampling, with arithmetic. A million requests a day, and an incident that fails 5 of them. With head sampling at 1 percent, decided at the root before anyone knows the outcome, what is the chance at least one of those five was traced?

[pause]

About 5 percent: one minus 0.99 to the fifth power. Head sampling at 10 percent gets you to 41 percent, for ten times the storage. Ascend samples 20 percent, which gives 67 percent. Tail sampling decides after the trace finishes: keep every error, every trace over 2 seconds, and 1 percent of the rest. That keeps all 3 thousand error traces, about 18 thousand traces a day in total, and is certain to catch the incident. The price is a collector that buffers every span until the decision, and the buffer is rate times wait: about 350 traces in flight at Ascend's traffic with a 30-second wait, and gigabytes at 10 thousand requests a second.

## What never to log

Logs are copied further, kept longer and read by more people than your database. Never log credentials: passwords, session tokens, cookies, API keys, authorization headers. Dependencies can still echo a secret. Ascend's database library quoted an unparseable connection string whole, password included, and the server printed it at boot. The fix redacts the password where the error is created, which covers every place the message goes; a filter in one log pipeline covers one.

Bound what you copy from outside: the AI client logs at most 500 characters of an upstream error body. Log an error once, where it is handled. And personal data needs a reason and a retention period: an email address in a log line survives an account deletion that cascaded through every table.

## In the interview

"The logging bill doubled after a deploy. What do you check?"

[pause]

Lines per request, by module, then the filter. Debug turned on for the HTTP library adds two lines to every request, and a new per-token event multiplies by the length of every stream. Fix the filter per module and move counting into metrics. The common wrong answer is to shorten retention, which cuts the stored bytes but not the ingestion you are billed for.

And "a user says the coach stopped mid-answer". Take the request ID from the failed response, filter on it, and read the finished line, the stream error from the instrumented task, and the provider's error event, which says whether the provider was overloaded or the transport broke. Not a free-text search around the reported time.

## Recap

Four things to remember. Write logs as constant messages with typed fields, and read what the filter actually emits; turning the level down to warn silently strips the request ID. Put a request ID on every line, spawned tasks included, show it to users, and treat incoming IDs as untrusted. Measure latency with histograms, sum buckets before computing a percentile, put a boundary at every SLO threshold, and label by route template, never by path or ID. And choose sampling from arithmetic: 1 percent head sampling catches a five-request incident about one time in twenty.

At your desk: the real log line field by field, the filter table, the percentile and merge worked examples, the cardinality table, the traceparent and propagation tables, and the two exercises.
