---
lesson: video-streaming-netflix
source: 1ec3bb63982caa29
fit: great
desk:
  - "The estimates and machine-count tables"
  - "The per-title ladder steps and the placement hit-ratio table"
  - "The cold-start trace to the first frame"
  - "The segment-by-segment ABR trace and the buffer-based selection code"
  - "Exercise: simulate a buffer-based ABR session"
---
## Introduction

At 9 in the evening in São Paulo, someone presses play on a television. Within a second, video starts at the best quality the connection can sustain, and it plays for two hours without stalling while the household's other devices fight for the same Wi-Fi. Tens of millions of people are doing the same thing at that moment. "Design Netflix" tests whether you know where the difficulty in that experience lives.

It is not in storing video or in the web application. It is in three places, and they are the three deep dives. Encoding: each title becomes many renditions, and choosing them per title removes a share of every byte ever sent. Delivery: at hundreds of terabits a second the bytes cannot come from a cloud region, so Netflix built Open Connect, servers inside internet providers' networks, filled overnight with what members will watch tomorrow. And the client: the player picks a bitrate every few seconds from its buffer and throughput, because only it can see the last mile.

One discipline before anything else. Netflix publishes much of this on its technology blog, in its Open Connect documentation and in research papers. Say "publicly described" for claims from that record, and label everything else as your own assumption. Claiming inside knowledge you do not have is the fastest way to lose a Netflix interviewer.

## Requirements and the numbers

The requirements. Play any title on thousands of device types, each with its own codecs, copy protection and maximum resolution. Start fast, adapt continuously, seek, and resume across devices. Ingest a studio master into every rendition before a fixed launch time. Measure every session's quality of experience, and use viewing predictions to place content and prefetch likely plays.

The targets, which are this design's and not Netflix's figures. Press to first frame in a second at the median and three at the 95th percentile. Rebuffering under 0.1 percent of viewing time, because a stall is the worst event in a session. Playing streams survive the loss of a control-plane region. And cost per hour streamed is itself a requirement, because egress dominates.

The assumptions: 40 million concurrent streams at the global peak, at an average of 5 megabits a second. That is 200 terabits a second at peak. An hour of viewing is 2.25 gigabytes, and a day of viewing is about 560 petabytes. Bought from a CDN at high-volume contract prices, that is half a million to 3 million dollars a day.

Now compare that with the catalogue. Every title in every format, four codecs plus audio tracks, is about 1.5 petabytes. Here is the sentence that matters. The whole catalogue is under a third of a percent of one day's egress, so delivery is a placement problem at the edge. The control plane, about 85 playback nodes, is ordinary cloud engineering by comparison. At an assumed 100 gigabits a second per edge appliance and 50 percent utilisation, the edge is about 4 thousand appliances.

The architecture, in words. Two planes that scale on different axes. The control plane runs in the cloud across three regions: browsing, sign-in, and the playback service, which returns a manifest computed per session, listing only the streams this device can decode and a ranked list of specific edge servers. A license service handles copy protection. Telemetry flows through Kafka into stream processing. The data plane is Open Connect: appliances at internet exchange points, and appliances embedded inside internet providers, which serve the actual video. The design depends on the two planes failing independently.

## Deep dive one: the encoding ladder

A ladder is the set of renditions the player switches between. Netflix's 2015 per-title encoding post published the fixed ladder it had used, from 235 kilobits a second up to 5,800 at 1080p, and explained why one ladder is wrong in both directions. Simple content, like flat animation, reaches the top rung's quality at a fraction of its bitrate. Grainy, high-motion film shows artefacts even at 5.8 megabits.

Per-title encoding measures instead of assuming. Encode the title at many pairs of resolution and quality setting. Score each with a perceptual metric; Netflix's open-source one, VMAF, is fitted to human ratings. Plot quality against bitrate for each resolution, take the efficient frontier across them, and place rungs along it. In the lesson's illustration, flat animation at 1080p needs about 2 megabits instead of 5.8, 65 percent fewer bits at the same quality, while a grainy action film gets about 7.5, restoring quality where it was missing.

Per-shot encoding goes further. Publicly described as Netflix's dynamic optimizer, it splits a title at shot boundaries and picks settings per shot, so bits flow from a static dialogue scene to rain and explosions. Shot boundaries are also where chunks split, so a two-hour film becomes about 1,400 independent encode tasks, and the finish time is the slowest chunk, not the film's length.

Is the search worth it? It costs roughly six times the compute of a fixed ladder, and newer codecs cost several times more again. But that compute is spent once per title. A 20 percent saving on a title watched 10 million hours is 4.5 petabytes never sent. A title watched a thousand hours delivers 2.25 terabytes in total, so no search saves it much.

## Deep dive two: Open Connect and placement

Two deployment models are publicly described. Embedded appliances sit inside an internet provider's network, provided free to qualifying providers, which supply space, power and connectivity and stop carrying Netflix traffic across their interconnects. Appliances at internet exchange points serve providers without embedded ones, and act as the upstream tier.

A classic CDN pulls a file on its first miss. Open Connect is described as proactive: each day the system predicts what each site's members will watch, computes what each site should hold, and appliances download the changes in an off-peak fill window agreed with the provider. Before I list them: what properties of Netflix's workload make that possible, when it would not work for, say, a news site?

[pause]

Four. The catalogue is finite, and releases are scheduled weeks ahead. Popularity is predictable from viewing history. The catalogue, 1.5 petabytes, is small next to daily demand, 560. And off-peak bandwidth is idle: replacing 10 terabytes a night in a six-hour window is under 4 gigabits a second, moved out of the peak. A 9 in the evening miss would cross the internet at the worst moment, so proactive fill makes it rare by design. For user video, news or live events, the first two properties fail.

How much does a site serve locally? Take an embedded site with 200 terabytes, 13 percent of the catalogue, with Zipf-distributed popularity and perfect prediction. With moderate skew, it serves 82 percent of viewing locally. With a flatter skew, 63 percent. The lever you control is storing only the codecs and resolutions that site's devices actually play, about a third of the bytes. That triples effective capacity and lifts the moderate case to 92 percent. Within a site, files are spread across appliances by consistent hashing, also publicly described, and popular files get several copies so no single machine takes a hit title's traffic.

Steering lives in the manifest, not in DNS. The playback service ranks appliances for the client's address, using which appliances hold the files, their health and load, and past performance for that address range. The manifest carries signed URLs, embedded appliances first and an exchange-point appliance last, so the client can switch without asking the cloud. DNS steering sees the resolver's address, not the client's, and reacts at TTL speed.

A cold start, traced, with 80 milliseconds to the cloud region and 15 to an appliance inside the provider. The manifest takes about 120 milliseconds. The license request and the connection to the appliance then run in parallel. The first 4-second segment has fully arrived at about half a second, limited mostly by the home link, and the first frame renders at about 0.6 seconds. Prefetching the manifest and license for the title under focus removes the first 120 milliseconds. One edge case sits right in the tail: if the first appliance refuses the connection, the client's connect timeout before trying the second one lands directly in 95th percentile play delay, so keep it at hundreds of milliseconds, not the operating system's seconds.

## Deep dive three: adaptive bitrate

The player downloads 4-second segments into a buffer and picks a rung before each one. Two rules compete. Throughput-based: estimate bandwidth from the last three segments, take 80 percent of it, pick the highest rung below that. Buffer-based, from a 2014 paper evaluated in Netflix's production service: below a 10 second reservoir of buffer, fetch the lowest rung; above the reservoir plus a 40 second cushion, fetch the highest; in between, map the buffer linearly onto the ladder.

The lesson simulated both through a bandwidth drop. The link runs at 8 megabits, drops to 1.2 when another device starts a download, and recovers to 6 later. The throughput rule had climbed to the top rung on a thin buffer, about 13 seconds. When the link dropped, one segment took over 15 seconds to arrive. It stalled for 2.7 seconds, re-estimated, picked a rung still too high, and stalled again. Two stalls, 4.5 seconds in total.

The buffer rule had built about 50 seconds of buffer before it reached the top rung. When the link dropped, one slow download drained 19 seconds of buffer, and it never stalled. Its average bitrate was a little lower, about 2,550 kilobits a second against 2,900. Its cost shows at startup: 24 seconds of video at the bottom rungs on a perfectly good 8 megabit link.

So the buffer, not the throughput estimate, is the stall predictor. The paper reported fewer rebuffers at a similar average rate, and handled startup with a capacity estimate while the buffer is empty. Production players blend both signals, switch down fast and up slowly, because viewers notice oscillation, and move to the next manifest URL when an appliance fails or crawls.

## When it breaks

An appliance dies mid-stream. The client fails over to its second URL inside its buffer: a throughput dip, no stall. A site runs hot at 9 in the evening: steering sends new sessions to the next site while existing sessions adapt.

A worldwide launch at a fixed hour. Starts jump three to ten times, and the herd lands on the control plane, not the edge, which was filled nights before. Pre-scale, prefetch manifests before launch, and jitter client retries.

The health signal for all of this is stream starts per second, which Netflix has described as its primary health metric. Viewing follows strong daily cycles, so actual starts per region, device and provider are compared with the expected value for that minute. A dip means members press play and get nothing, whatever the cause. Slice it finely: an adaptive bitrate regression that raises rebuffers 0.2 percent on one TV model is invisible globally.

At ten times the catalogue, the 200 terabyte site's local share falls from 92 to 77 percent, so upstream traffic nearly triples, from 8 percent to 23. That breaks first. At a hundred times, proactive fill of everything is impossible: the head stays proactive and the tail becomes pull-through.

## In the interview

A follow-up the lesson expects. The control plane loses a region at peak. What do members notice?

[pause]

Members already watching notice nothing, because their bytes come from appliances, with URLs valid for hours. New starts in that region fail until traffic is evacuated, and stream starts per second dips and recovers. Then audit the hidden couplings: a license renewal, a heartbeat acknowledgement, or a bookmark write that the player treats as fatal turns a control-plane outage into a playback outage. The wrong answer is "active-active fails over instantly, so nothing".

And the classic: why build a CDN instead of buying one? The arithmetic. 560 petabytes a day is half a million to 3 million dollars a day at contract prices. Appliances inside providers take traffic off their interconnects, which is why providers accept them, and a server 15 milliseconds away sustains higher throughput, so members get higher rungs. The costs are hardware, a supply chain, and thousands of provider relationships. At a tenth of the traffic, buy. The wrong answer is "for latency", with no egress arithmetic.

## Recap

Five things to remember. The catalogue is a third of a percent of a day's egress, so delivery is a placement problem, and a control plane in requests per second is separate from a data plane in bits per second. Per-title and per-shot encoding pays because compute is spent once and savings are paid on every hour watched. Proactive fill rests on four workload properties; say when they do not hold. Store only the encodes a site's devices use, to triple its capacity. And the buffer predicts stalls: the throughput rule had the higher bitrate and stalled twice.

At your desk: the estimate tables, the ladder and placement tables, the cold-start trace, the ABR trace and its code, and the buffer-based ABR exercise.
