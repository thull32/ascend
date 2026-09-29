---
slug: profiling-and-measurement
title: "Profiling and measurement: flame graphs, p99 thinking and Amdahl's law"
description: Why the mean lies, how tail latency compounds under fan-out, how histograms bucket and merge percentiles, on-CPU versus off-CPU time, sampling versus instrumenting profilers with measured overhead, a real py-spy session read as a flame graph, and how Amdahl's law bounds what an optimisation can buy.
minutes: 50
difficulty: medium
tags: [performance, profiling, flame-graphs, latency, percentiles, amdahl, perf]
---
After a deploy, your checkout service's p99 latency goes from 120 ms to 310 ms. The average moves from 38 ms to 41 ms and CPU usage is flat. Someone captures a CPU profile, sees JSON serialisation at the top (as it always has been) and proposes a faster JSON library. It would not help. The slow requests lost their time *waiting*, for a database connection that the new code holds a little longer, and a CPU profiler cannot see waiting.

Two mistakes stack up in that story: looking at the wrong statistic (the mean, which barely moved) and the wrong kind of profile (on-CPU, when the time was off-CPU). Performance work goes wrong at measurement far more often than at optimisation. This lesson measures a real program end to end: latency as a distribution and how histograms store it, where wall-clock time goes, how profilers collect stacks and how much they cost, how to read a flame graph built from an actual run, and how to bound the payoff of a change before you write it. Every profile below was recorded on a Ryzen 9 9950X3D under WSL2 with CPython 3.14 and py-spy 0.4.2.

## Latency is a distribution, not a number

Take 1,000 requests from one minute of a service: 900 took 12 ms, 89 took 40 ms, 10 took 250 ms (a cache miss path) and one took 2,000 ms (a retry after a timeout). The **nearest-rank** percentile sorts the $n$ samples and takes the one at rank $\lceil p \cdot n / 100 \rceil$:

| Statistic | Rank | Value |
|---|---|---|
| Mean | – | 18.86 ms |
| p50 | 500 | 12 ms |
| p90 | 900 | 12 ms |
| p95 | 950 | 40 ms |
| p99 | 990 | 250 ms |
| p99.9 | 999 | 250 ms |
| Max | 1,000 | 2,000 ms |

The mean, 18.86 ms, is a latency that no request experienced. The p50 says most users are fine; the p99 says one request in a hundred takes twenty times longer; the maximum is the one you hear about. None of the summary numbers is "the latency". Keep the distribution and choose the percentile that matches the promise you made.

The tail matters more than its size suggests, for two reasons.

**Fan-out amplifies it.** A page that calls 100 backends in parallel is as slow as the slowest call. If each backend exceeds its p99 on 1% of calls, the chance that at least one of the 100 does is $1 - 0.99^{100} \approx 63\%$. The backends' p99 has become the page's median. Dean and Barroso's "The Tail at Scale" (2013) is the standard reference, and it is why services that sit behind fan-out set SLOs on p99 or p99.9.

**Users repeat.** A user who loads 50 pages will see a p99 event at least once with probability $1 - 0.99^{50} \approx 40\%$. The [probability lesson](/learn/foundations/math-for-engineers/probability-for-engineers) has the general form.

The mean still has one honest job: capacity. Throughput times mean service time is the average number of busy workers (Little's law, worked in [I/O-bound versus CPU-bound](/learn/systems/performance-engineering/io-bound-vs-cpu-bound)). Use means to size, percentiles to judge.

## Percentiles from histograms: bucketing and merging

A service handling 20,000 requests a second cannot keep every sample, so it records a histogram and computes percentiles from bucket counts. Two rules follow.

**You cannot average percentiles.** Host A serves every request in 10 ms, so its p99 is 10 ms. Host B serves 90% in 10 ms and 10% in 800 ms, so its p99 is 800 ms. The mean of the two p99s is 405 ms, a number that describes nothing. Merge the samples (equal traffic) and 5% of all requests took 800 ms, so the fleet p99 is 800 ms. Percentiles are order statistics, not sums; aggregate the **histograms** (add bucket counts) and compute the percentile from the merged counts.

**Bucket boundaries set your resolution.** Prometheus's `histogram_quantile` finds the bucket holding the target rank and interpolates linearly inside it. Record the table above in buckets with upper bounds 0.1, 0.25, 0.5 and 1 second. The 12 ms and 40 ms requests all fall at or below 0.1 s and the 250 ms ones at or below 0.25 s, so the cumulative counts are `le=0.1: 989`, `le=0.25: 999`, `le=0.5: 999`, `le=1: 999`, and the 2 s request appears only in `+Inf: 1000`. It reports:

1. p50: rank 500 lies in (0, 0.1], which holds ranks 1–989, so $0.1 \times 500/989 = 0.051$ s. True value: 12 ms.
2. p95: rank 950 lies in the same bucket, so $0.1 \times 950/989 = 0.096$ s. True value: 40 ms.
3. p99: rank 990 is the first of the ten ranks in (0.1, 0.25], so $0.1 + 0.15 \times 1/10 = 0.115$ s. True value: 250 ms.

Every reported number is off by a factor of two to four, and not in one direction: the p50 and p95 are overstated and the p99 is understated by more than half, because the buckets were not placed around the values that matter. If more than 1% of requests land in the `+Inf` bucket, `histogram_quantile` returns the largest finite boundary: a p99 flat at exactly 1.0 s for a week means "over 1% of requests exceed 1 s", and the true p99 could be 30 s.

**HdrHistogram** fixes resolution with log-linear buckets: every power-of-two range is split into the same number of linear sub-buckets, so relative error is bounded everywhere. With 2 significant digits there are 256 sub-buckets; values under 256 µs are exact, 12,345 µs is recorded to within 64 µs (0.52%), and covering 1 µs to one hour needs 3,328 counters, about 26 KB. With 3 digits the error drops below 0.1% and the array grows to 23,552 counters, about 188 KB. Merging two HdrHistograms adds their count arrays, exactly. DDSketch (Datadog) and Prometheus's native histograms use exponential buckets for the same reason; t-digest keeps adaptive clusters and is most accurate at the extremes.

```exercise
id: nearest-rank-percentile
title: Nearest-rank percentile
prompt: |
  Return the `p`-th percentile of `samples` using the nearest-rank method:
  sort ascending and return the element at 1-based rank ceil(p * n / 100).
  `p` is an integer from 1 to 100. Return `None`/`null` for an empty list.

  Use integer arithmetic for the rank if you can: floating-point `p / 100 * n`
  can land a hair above an integer and push the rank up by one.
languages: [python, javascript]
entry: percentile
starter:
  python: |
    def percentile(samples, p):
        # your code here
        return None
  javascript: |
    function percentile(samples, p) {
      // your code here
      return null;
    }
tests:
  - args: [[5, 1, 3, 2, 4], 50]
    expected: 3
  - args: [[5, 1, 3, 2, 4], 100]
    expected: 5
    label: p100 is the maximum
  - args: [[12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 900], 95]
    expected: 12
    label: one slow request in 20 is invisible at p95
  - args: [[12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 900], 99]
    expected: 900
    label: and dominates p99
  - args: [[], 99]
    expected: null
    label: empty input
  - args: [[3, 1, 2], 1]
    expected: 1
    hidden: true
  - args: [[7, 7, 7, 1], 26]
    expected: 7
    hidden: true
hints:
  - "Sort a copy of the samples. In JavaScript, pass a numeric comparator: sort((a, b) => a - b)."
  - "rank = ceil(p * n / 100); in Python, -(-p * n // 100) does it with integers."
  - "Return sorted[rank - 1]."
```

## Where the time goes: on-CPU and off-CPU

Every millisecond a thread spends is either **on-CPU** (executing instructions, including the kernel's on its behalf) or **off-CPU**: blocked on I/O, waiting for a lock or a pool slot, sleeping, or runnable but queued for a core. A CPU profiler samples only the first kind.

The profiling target for the rest of this lesson is a toy order service in Python. Each request loads a customer (a 1 ms `time.sleep` standing in for a database round trip), validates the order ID against a regular expression built from the customer's prefix, sums 150 order lines and renders the order as indented JSON. The shell's `time` splits wall-clock from CPU:

```text
$ time python3 orders.py 3000 1        # 3,000 requests, 1 ms simulated DB wait
real    0m3.602s
user    0m0.381s
sys     0m0.016s
```

The process was on-CPU for 0.397 s of 3.602 s, 11%. No CPU optimisation can save more than that 0.4 s. Two py-spy recordings of the same program show both sides:

| Recording | Samples | `load_customer` (the wait) | JSON rendering | Regex compile |
|---|---|---|---|---|
| Default (active threads only) | 582 | 30.8% | 26.1% | 25.4% |
| `--idle` (wall-clock, idle included) | 3,769 | 87.7% | 4.9% | 3.6% |

The wall-clock view says the wait is the latency; the CPU view says JSON and regex compiling are the cost. Both are true, and they answer different questions: latency per request, or cores per request. One detail is a warning about tools: py-spy classifies a sample as idle from the thread's OS state, and all 179 of the default recording's `load_customer` samples sit on the `time.sleep` line: waiting that was counted as active. Treat the active/idle split as approximate.

Real off-CPU profilers are more precise. BCC's `offcputime` and `perf sched` hook the kernel's context-switch path, record the stack when a thread is switched out and the duration until it runs again, and sum durations per stack, so width in the resulting flame graph is time blocked. Go's block and mutex profiles, async-profiler's wall-clock mode and distributed-tracing spans answer the same question at other granularities.

## A real profiling session with py-spy

For the CPU view, set the simulated wait to zero and run 40,000 requests (about 3 s). py-spy launches the program as a child and writes folded stacks:

```bash
python3 -m venv venv && ./venv/bin/pip install py-spy
./venv/bin/py-spy record --rate 1000 --format raw -o cpu.folded \
    -- ./venv/bin/python orders.py 40000 0
# py-spy> Wrote raw flamegraph data to 'cpu.folded'. Samples: 3503 Errors: 0
```

The **folded** format is one line per distinct stack, root first, frames separated by semicolons, then a sample count. The heaviest lines from this run, truncated to seven frames and with file names dropped:

```text
main;serve;handle_order;render_json;dumps;encode;iterencode 1550
main;serve;handle_order;validate;compile;_compile;compile 893
main;serve;handle_order 557
main;serve;handle_order;compute_totals 142
main;serve 112
main;serve;handle_order;validate;compile;_compile 90
```

Summing every line in which a function appears gives its **total** (inclusive) share; counting only lines where it is the last frame gives its **self** share:

| Function | Total | Self | What it is |
|---|---|---|---|
| `handle_order` | 96.7% | 15.9% | Self time: building 150 line dicts per request |
| `render_json` → `json.dumps` | 45.9% | 0.3% | Almost all inside `iterencode` |
| `iterencode` | 44.2% | 44.2% | The C encoder; py-spy shows the Python frame that called it |
| `validate` | 30.5% | 0.8% | Almost all inside `re.compile` |
| `re.compile` and its parser | 29.4% | spread | Parsing and compiling a pattern on every request |
| `compute_totals` | 4.1% | 4.1% | The arithmetic loop |

`go tool pprof -top` calls these columns `flat` (self) and `cum` (total); perf calls them `Self` and `Children`.

## Reading the flame graph

A flame graph draws each folded line as a column of boxes. Each sample is one snapshot of a stack like this one:

```viz
{"type": "memory", "algorithm": "call-stack", "n": 4,
 "title": "Each sample is one snapshot of this stack",
 "caption": "A sampling profiler freezes the thread and records the frames from main() to the innermost call. A flame graph stacks thousands of these snapshots, merging identical prefixes."}
```

Render the folded file (`flamegraph.pl cpu.folded > cpu.svg`, or `py-spy record -o cpu.svg` directly) and read it with four rules:

- **Width is share of samples.** `handle_order` spans 96.7% of the width; above it sit `render_json` (45.9%), `validate` (30.5%) and `compute_totals` (4.1%).
- **The x-axis is not time.** Frames are sorted alphabetically so identical prefixes merge; left-to-right order means nothing.
- **Self time is the exposed top edge.** `handle_order`'s 15.9% is the part of its box with nothing above it: the list comprehension building dicts.
- **Look for wide plateaus, not tall towers.** The regex tower under `validate` is deep (parser, code generator, charset optimiser) but its total width, 29.4%, is what matters.

Now the diagnosis. `validate` builds a pattern string from the customer's prefix and calls `re.compile` on it. The `re` module caches compiled patterns, but in CPython 3.14 the cache holds 512 entries (`re._MAXCACHE`), and this service has 5,000 customers, so every request misses and re-parses. The flame graph shows a cache that works in tests with 20 customers and thrashes in production. The fix is one pattern compiled at import time, `^(C\d{5})-\d{6}-[A-Z]{2}$`, plus a comparison of the captured prefix.

`render_json` at 45.9% is a different kind of plateau: the work is inside C, and it scales with payload size. The levers are smaller payloads, caching the rendered bytes for orders that do not change, or a faster serialiser. **Differential flame graphs** colour frames red or blue by growth since a baseline profile, which is the fastest way to review a regression. **Allocation flame graphs** (width is bytes allocated) often explain a garbage-collection problem faster than a GC log.

## Sampling versus instrumentation, measured

A **sampling** profiler interrupts at a fixed rate and records the stack. An **instrumenting** profiler hooks every call and return. Same program, CPU-only, 40,000 requests, three runs each, median:

| Mode | Time per request | Overhead | `validate` share | `render_json` share |
|---|---|---|---|---|
| No profiler | 72.8 µs | – | – | – |
| py-spy at 100 Hz | 73.5 µs | about 1% | – | – |
| py-spy at 1,000 Hz | 87.2 µs | about 20% | 30.5% | 45.9% |
| cProfile | 125.7 µs | 73% | 54.2% | 29.4% |

Sampling overhead scales with the *rate*: each sample pauses the process and reads its memory, so ten times the rate cost twenty times the overhead. Instrumentation overhead scales with the *number of calls*. cProfile recorded 13.2 million calls, about 330 per request, almost all inside the regex parser. Each call pays a fixed probe cost, so call-heavy Python code is inflated and the single call into the C JSON encoder is not. cProfile ranks `validate` first at 54%; the sampler ranks `render_json` first at 46%. This is the **probe effect**, and here it reorders the priorities.

Sampling's error is statistical and small. A share $p$ estimated from $n$ samples has standard error $\sqrt{p(1-p)/n}$; for `validate`, $\sqrt{0.294 \times 0.706 / 3503} \approx 0.77$ percentage points. Anything worth optimising is measured precisely. Profiling guides use odd rates such as `perf record -F 99` so samples do not fall into lockstep with 10 ms timers; perf's own default is 4,000 Hz and py-spy's is 100 Hz.

Instrumentation is still the right tool for questions sampling cannot answer: exact call counts (cProfile showed `re._compiler._compile` running 120,000 times, three per request), and at coarse grain, tracing spans per RPC, where overhead is a few microseconds per span.

## Under the hood: how a profiler gets a stack

**Linux `perf`** opens a counter with `perf_event_open`. For hardware events the counter overflows after a set number of cycles and raises a non-maskable interrupt; `-F 99` makes perf adjust that period to land about 99 samples a second. The handler records the instruction pointer and walks the user stack along saved frame pointers (`rbp`), which is cheap. Without frame pointers, `--call-graph dwarf` copies 8 KiB of stack per sample for unwinding afterwards: bigger files, more overhead. Code built with `-fomit-frame-pointer` yields truncated stacks, which is why Fedora 38 and Ubuntu 24.04 re-enabled frame pointers distribution-wide.

**py-spy** runs in a separate process. It reads the target's memory with `process_vm_readv`, finds the interpreter's runtime state, and walks each thread's frame chain, decoding code objects into function names and line numbers. The target runs no profiler code at all, which is why you can attach it to production with `py-spy record --pid`. By default it pauses the target during each read; `--nonblocking` skips the pause, and in this run it logged 196 failed samples against 233 good ones.

**cProfile** is a C extension registered through `sys.monitoring` in CPython 3.12 and later (on 3.14, `sys.monitoring.get_tool(2)` returns `"cProfile"` while it runs). The interpreter calls it on every call and return, which is where the 73% comes from.

**Go** delivers `SIGPROF` at 100 Hz using per-thread timers (since Go 1.18) and walks goroutine stacks in the signal handler. **JVM** profilers that sample only at safepoints miss hot loops without them and blame the time on the next safepoint (**safepoint bias**); async-profiler avoids it by combining perf events with an internal stack-walking API. **JIT code** has no symbols on disk: Node needs `--perf-basic-prof`, CPython 3.12+ has `-X perf`, and Netflix's "Java in Flames" work led to `-XX:+PreserveFramePointer` in JDK 8u60 so perf could see Java frames.

`perf stat` adds a first split before any profile: **IPC**, instructions retired per cycle. A modern core can retire four or more; well-tuned compute loops reach 2–4, and below about 1 with a high cache-miss count the core is mostly waiting on memory ([CPU caches and memory layout](/learn/systems/performance-engineering/cpu-caches-and-memory-layout)).

## Amdahl's law: what an optimisation can buy

If a fraction $p$ of the time is sped up by a factor $s$ and the rest is untouched, the overall speed-up is

$$ S = \frac{1}{(1 - p) + p / s} $$

and with several parts $f_i$ each sped up by $s_i$, $S = 1 / \sum_i (f_i / s_i)$, counting untouched parts with $s_i = 1$.

Apply it to the measured profile before writing the fix. Removing the per-request compile deletes $p = 0.294$ of CPU, so $S = 1/0.706 = 1.42\times$. After the change, the same 40,000-request benchmark measured 53.8 µs per request (median of three runs) against 72.8–76.0 µs for the original in two sets of runs: $1.35$–$1.41\times$. The shortfall against $1.42\times$ is the regex match that still runs. Had you trusted cProfile's 54% share, you would have predicted $2.18\times$ and been embarrassed.

Now apply it to latency. With the 1 ms database wait, CPU is 11% of wall-clock, so the compile is $0.294 \times 0.11 \approx 3.2\%$ of each request's latency. The same fix that saves over a quarter of the CPU makes requests 3% faster. Both statements are true, and a senior engineer says which one the change is for: cores per request (cost, throughput) or latency.

The law also bounds parallelism. With serial fraction $\sigma$ on $N$ cores, $S = 1 / (\sigma + (1 - \sigma)/N)$. With $\sigma = 0.05$:

| Cores | Amdahl (fixed problem) | Gustafson (problem grows with cores) | USL, $\alpha = 0.05$, $\beta = 0.001$ |
|---|---|---|---|
| 8 | 5.93× | 7.65× | 5.69× |
| 32 | 12.55× | 30.45× | 9.03× |
| 64 | 15.42× | 60.85× | 7.82× |

**Gustafson's law**, $S = N - \sigma(N-1)$, is the optimistic view: bigger machines run bigger problems, so the serial part shrinks relative to the parallel part. The **Universal Scalability Law**, $X(N) = N / (1 + \alpha(N-1) + \beta N(N-1))$, keeps a contention term $\alpha$ (Amdahl's serial fraction) and adds a coherence cost $\beta N(N-1)$ for cores that must agree with each other (locks, shared cache lines); throughput peaks near $N = \sqrt{(1-\alpha)/\beta} \approx 31$ and then *falls*. Measured scaling curves that bend downwards fit the USL, not Amdahl.

```exercise
id: amdahl-speedup
title: Amdahl's law for several components
prompt: |
  `parts` lists the components you plan to speed up as `[fraction, speedup]`
  pairs: `fraction` is that component's share of the original run time and
  `speedup` is the factor by which it gets faster. Fractions sum to at most 1;
  the remaining time is unchanged.

  Return the overall speed-up rounded to 2 decimal places.
languages: [python, javascript]
entry: amdahl
starter:
  python: |
    def amdahl(parts):
        # your code here
        return 1.0
  javascript: |
    function amdahl(parts) {
      // your code here
      return 1.0;
    }
tests:
  - args: [[[0.6, 3]]]
    expected: 1.67
  - args: [[[0.05, 1000000]]]
    expected: 1.05
    label: a 5% component made essentially free
  - args: [[[0.5, 2], [0.3, 3]]]
    expected: 1.82
  - args: [[]]
    expected: 1.0
    label: nothing changed
  - args: [[[0.95, 64]]]
    expected: 15.42
    label: 64 cores with 5% serial work
  - args: [[[0.2, 1.5], [0.7, 10]]]
    expected: 3.3
    hidden: true
  - args: [[[1.0, 4]]]
    expected: 4.0
    hidden: true
hints:
  - "New time = (1 - sum of fractions) + sum of fraction / speedup, taking the original time as 1."
  - "Speed-up = 1 / new time. Round with round(x, 2) in Python or Math.round(x * 100) / 100 in JavaScript."
```

## USE and RED: where to look first

Before a profiler, find the saturated resource. Brendan Gregg's **USE method** checks every resource for **U**tilisation, **S**aturation (work queued) and **E**rrors; Tom Wilkie's **RED method** checks every service for **R**ate, **E**rrors and **D**uration (as a distribution).

| Resource | Utilisation | Saturation | Errors |
|---|---|---|---|
| CPU | `mpstat -P ALL 1` per-core busy % | Run queue above core count (`vmstat` `r`); `/proc/pressure/cpu` | Throttling in `cpu.stat` (`nr_throttled`) |
| Memory | Used versus limit | Swapping, `/proc/pressure/memory`, reclaim | OOM kills in `dmesg` |
| Disk | `iostat -x` `%util` | `aqu-sz` (queue depth), `await` | Device errors in `dmesg` |
| Network | Throughput versus line rate | Socket backlog, TCP retransmits | Drops (`ip -s link`) |
| Connection pool | In use ÷ max | Pending waiters, acquisition time | Acquisition timeouts |

`/proc/pressure/*` (Linux 4.20+) prints lines like `some avg10=0.02 avg60=0.10`: the percentage of time over the last 10 and 60 seconds that at least one task was stalled waiting for that resource. It is saturation measured directly. USE on the resources and RED on the services turn "it is slow" into a short list, and often find the answer before a profiler starts. The [observability lesson](/learn/system-design/building-blocks/observability) covers how these metrics are collected at fleet scale.

## Failure modes in production

| Symptom | Diagnosis | Fix |
|---|---|---|
| p99 doubles after a deploy; mean and CPU flat | Time moved off-CPU: pool acquisition, lock waits, a slower dependency. Compare `real` with `user + sys`, pool wait metrics, trace spans, an off-CPU or `--idle` profile | Shorten the hold time or the dependency; do not optimise the CPU flame graph's top frame |
| Flame graph shows `[unknown]` frames or stacks two frames deep | Missing frame pointers, or JIT code with no symbol map | Build with frame pointers, `--call-graph dwarf`, `--perf-basic-prof`, `-X perf`, `-XX:+PreserveFramePointer` |
| Latency rises the moment profiling starts | Instrumenting profiler in production (cProfile cost 73% here), or sampling at 1 kHz (20%) | Sample at about 100 Hz; profile one canary host |
| Fleet dashboard p99 looks fine while one region complains | Per-host p99s averaged together | Merge histograms, then compute the percentile |
| p99 pinned at exactly a bucket boundary | The rank fell in the `+Inf` bucket, or buckets are far from the SLO | Add buckets around the SLO, or use native or HDR histograms |
| CPU per request climbs 40% as customers grow past a few hundred | A cache sized for tests (`re._MAXCACHE` is 512) thrashes in production; the flame graph shows `re._compiler` under `validate` | Compile once at import; size caches from production cardinality |

## Trade-offs: how to store latency

| Approach | Memory | Error | Mergeable across hosts | Typical home |
|---|---|---|---|---|
| Raw samples | Grows with request count | None | Yes (concatenate) | Short load tests |
| Fixed buckets (Prometheus classic) | One counter per bucket, 10–20 typical | Up to a whole bucket width | Yes, if boundaries match | Prometheus, OpenMetrics |
| HdrHistogram | About 26 KB for 1 µs–1 h at 2 digits | Relative, ≤1% at 2 digits | Yes, exactly | wrk2, JVM services |
| t-digest | A few hundred centroids | Smallest at extreme quantiles | Approximately | Elasticsearch percentiles |
| DDSketch | Grows with log of the range | Relative, guaranteed | Yes, exactly | Datadog |
| Mean and max only | Two numbers | Total loss of shape | Mean yes, shape no | Nowhere you debug latency |

## A workflow that works

1. **Name the metric and the target.** "p99 of checkout under 200 ms at 2,000 requests per second", not "make it faster".
2. **Measure a baseline under realistic load** and keep the histogram, not a summary.
3. **Find the saturated resource** with USE and RED, and decide whether the time is on-CPU or off-CPU (`time`, pressure stall information, traces).
4. **Profile the right way.** A sampling CPU profile for on-CPU time; an off-CPU or wall-clock profile, block profile or trace for waiting.
5. **Estimate the payoff with Amdahl** against the metric you named, and pick the change with the best payoff per unit of effort and risk.
6. **Change one thing and re-measure identically.** Keep the before and after profiles; a differential flame graph is the best evidence in a pull request. [Benchmarking pitfalls](/learn/systems/performance-engineering/benchmarking-pitfalls) covers how to make the comparison trustworthy.

## Interviewer follow-ups

**"p99 doubled after a deploy, but CPU and the mean are flat. Walk me through it."** Model answer: compare latency histograms before and after, split by endpoint and host, to see whether the whole tail moved or one host did; check on-CPU against wall-clock (`time`, CPU per request); look at pool acquisition time and trace spans for a dependency that got slower; take an off-CPU or wall-clock profile; and diff flame graphs across the deploy. Common wrong answer: "profile the CPU and speed up the hottest function", which cannot touch time spent waiting.

**"Why can't you average p99s, and what do you store instead?"** Model answer: percentiles are order statistics, so a host with 10 ms and a host with 800 ms average to 405 ms while the merged p99 is 800 ms. Store mergeable histograms (HdrHistogram, DDSketch, Prometheus buckets with identical boundaries), add the counts, then compute. Common wrong answer: "weight each host's p99 by its request count", which is still an average of order statistics.

**"How does a sampling profiler work, and how accurate is it?"** Model answer: a timer or hardware counter interrupts the thread at a fixed rate, the handler (or an external reader such as py-spy) records the stack, and counts per stack become the flame graph. The error on a share $p$ from $n$ samples is $\sqrt{p(1-p)/n}$, under a percentage point for 3,500 samples. Its real errors are biases: safepoint bias, missing frame pointers, and idle-state classification. Common wrong answer: "it records every call exactly", which describes an instrumenting profiler and its overhead.

**"The job scales 10× on 64 cores. What does that tell you?"** Model answer: solving $1/(\sigma + (1-\sigma)/64) = 10$ gives $\sigma \approx 8.6\%$ effective serial work; measure throughput at 1, 2, 4 … 64 cores, and if it peaks and falls, fit the USL, because a coherence cost (a lock, a shared counter) is growing with $N$. Then profile for the serial part. Common wrong answer: "buy more cores", which Amdahl caps at under 12× here.

## What mid-level engineers get wrong

- **Reporting the mean.** Consequence: an SLO dashboard that stays green while one request in a hundred takes seconds.
- **Averaging percentiles across hosts or minutes.** Consequence: one bad host disappears into a number that describes no request.
- **Leaving histogram buckets at library defaults.** Consequence: a p99 that reads as a bucket boundary and cannot show a regression inside it.
- **Profiling CPU for a latency problem that is waiting.** Consequence: a week spent speeding up code that was 11% of the wall-clock time.
- **Trusting an instrumenting profiler's percentages.** Consequence: optimising the call-heavy function the probe effect inflated (54% in cProfile, 30% in reality) while the real top frame is untouched.
- **Promising the CPU speed-up as a latency speed-up.** Consequence: "1.4× faster" ships as 3% faster requests.

## Senior signals

- You report latency as percentiles from merged histograms, never as a mean or an average of per-host percentiles, and you place bucket boundaries around the SLO.
- You can compute how fan-out turns backend p99 into user-facing median, and you know HdrHistogram's relative-error bucketing and what it costs in memory.
- You check `real` against `user + sys` before profiling, and you know a CPU profiler cannot see waiting; you reach for off-CPU, wall-clock or block profiles when it is waiting.
- You choose sampling at about 100 Hz for production, know its statistical resolution, and recognise the probe effect, safepoint bias and missing frame pointers as the ways profiles lie.
- You read a flame graph by width and self time, not position or height, and you name the widest frame you own and why it is there.
- You bound every proposed optimisation with Amdahl's law against the metric you named (latency or cost), and you know when the USL, not Amdahl, explains a scaling curve.

## Check yourself

```quiz
- q: >-
    A page fans out to 50 backend calls in parallel and waits for all of them. Each backend exceeds 200 ms on 1% of calls, independently. Roughly how often does the page wait more than 200 ms?
  options: ["About 5% of the time", "About 1% of the time", "About 99% of the time", "About 40% of the time"]
  answer: 3
  explanation: >-
    The page is slow if any call is slow: 1 - 0.99^50 is about 0.39. Tail latency compounds under fan-out, which is why backends that serve fan-out traffic need tight p99 or p99.9 targets, not good averages. 1% would be right only for a single call.
- q: >-
    cProfile says validate() is 54% of a request's time; py-spy at 1,000 Hz says 30%. validate makes about 330 Python calls per request, while the other hot path makes one call into a C extension. Which figure should drive your priorities?
  options: ["cProfile's, since sampling misses functions shorter than a tick", "cProfile's, since it records every call instead of a sample", "Neither, since both profilers distort the shares equally", "py-spy's, since per-call probe cost inflates call-heavy code"]
  answer: 3
  explanation: >-
    An instrumenting profiler adds a fixed cost to every call and return, so code that makes hundreds of small calls looks far more expensive than it is, while one call into C looks cheap. Sampling overhead depends on the rate, not the call count, so shares stay proportional. Short functions are not missed by sampling in aggregate; they appear in proportion to the time they take.
- q: >-
    Host A serves all requests in 10 ms. Host B serves 90% in 10 ms and 10% in 800 ms. Traffic is split evenly. What is the fleet's p99?
  options: ["About 10 ms, since most requests are fast", "About 90 ms, the traffic-weighted mean latency", "About 800 ms, from the merged distribution", "About 405 ms, the mean of the two hosts' p99s"]
  answer: 2
  explanation: >-
    Merged, 5% of all requests take 800 ms, so the 99th percentile is 800 ms. Averaging the per-host p99s (10 and 800) gives 405 ms, a latency no request had. Percentiles must be computed from merged histograms, not averaged.
- q: >-
    A Prometheus p99 panel has read exactly 1.0 s for days. The histogram's finite buckets are 0.1, 0.25, 0.5 and 1 second. What does that most likely mean?
  options: ["Interpolation rounds the p99 to the nearest bucket", "The p99 is stable, so the service is behaving well", "A 1 s client timeout is cutting the slow requests off", "Over 1% of requests exceed the 1 s top bucket"]
  answer: 3
  explanation: >-
    When the target rank falls in the +Inf bucket, histogram_quantile returns the largest finite boundary, so a flat 1.0 s means more than 1% of requests are slower than 1 s and the true p99 is unknown. Inside a finite bucket the function interpolates linearly rather than rounding. Add buckets above the SLO or use exponential histograms.
- q: >-
    A service spends 11% of each request on-CPU and the rest waiting on a database. A function taking 30% of CPU samples is deleted entirely. Roughly how much faster do requests get?
  options: ["About 11% faster", "About 30% faster", "About 3% faster", "About 43% faster"]
  answer: 2
  explanation: >-
    The function is 30% of the 11% on-CPU slice, about 3.3% of wall-clock time, so latency improves by about 3%. 43% (1 / 0.7) is the CPU-time speed-up, which is real for cost and throughput per core but not for latency. Apply Amdahl's law to the metric you care about.
- q: >-
    In a flame graph, function A is drawn wide at the bottom with a tall narrow tower above it, and function B is a wide flat box at the top of a short stack. Where is the CPU actually spending time?
  options: ["Leftmost first, because the x-axis shows time", "In B, because its wide flat top is self time", "In A, because it is the widest box in the graph", "In the tower, because it is the tallest stack"]
  answer: 1
  explanation: >-
    Width includes callees, so A is wide because of what it calls. Self time is the exposed top edge, and B's wide flat top is where the CPU was sampled. Height is only stack depth, and the x-axis is sorted alphabetically, not by time.
```
