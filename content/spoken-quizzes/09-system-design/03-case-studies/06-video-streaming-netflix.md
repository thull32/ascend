---
lesson: video-streaming-netflix
source: d039b0660c420ebf
---
## 1

Peak streaming is 40 million concurrent streams at an average of 5 megabits per second. What does the arithmetic imply about delivery?

A, about 200 gigabits per second, so a single cloud region's egress can serve it. B, about 2 terabits per second, comparable to a large API fleet's total outbound traffic. C, about 20 terabits per second, so a commercial CDN's per-gigabyte pricing is the cheapest. D, about 200 terabits per second, so the bytes must come from edge servers near viewers.

[think]

The answer is D: about 200 terabits per second, so the bytes must come from edge servers near viewers.

40 million streams times 5 megabits is 200 million megabits per second, which is 200 terabits per second at the peak. That is about four times the daily average of 52 terabits per second that 560 petabytes a day works out to. At that scale the cost per gigabyte and where the servers sit decide the architecture. Dropping a factor of a thousand by confusing gigabits with terabits is the classic unit error.

## 2

Why does per-title encoding beat a fixed bitrate ladder?

A, it moves every title to a newer codec with better compression. B, it lets the client choose each title's bitrate from its buffer. C, it encodes every title at a higher top resolution than before. D, it picks the rungs from each title's measured quality curves.

[think]

The answer is D: it picks the rungs from each title's measured quality curves.

A fixed ladder assumes every title needs the same bits for the same quality. Scoring encodes with a perceptual metric, and placing rungs on the best quality-for-bits curve, shows in the illustrative case that flat animation reaches top quality at about 2 megabits a second, while grainy film needs more than 5.8. Codec choice and client-side adaptation are separate levers.

## 3

Which property of the workload most directly makes proactive off-peak fill better than pull-through caching?

A, video files are large, so each cache miss costs a long origin fetch. B, the catalogue is finite and scheduled, so demand can be forecast. C, viewers tolerate a slow first start while the edge pulls the file. D, ISPs require content to be pre-positioned before they will peer.

[think]

The answer is B: the catalogue is finite and scheduled, so demand can be forecast.

Proactive placement needs to know what will be requested. A finite, scheduled catalogue with predictable popularity makes that possible, and idle off-peak bandwidth makes it cheap. Large files alone argue for caching, not for prediction: a news site with large files still cannot fill tomorrow's content tonight.

## 4

An embedded site's 200 terabytes hold 13 percent of a 1.5 petabyte catalogue, and serve 82 percent of its viewing locally. Which change raises the local share the most?

A, lengthen the nightly fill window, so files arrive earlier each day. B, keep only the encodes its members' devices play, fitting three times the titles. C, switch to pull-through caching, so misses fill the site on demand. D, double the site's network capacity, so each appliance serves more bytes.

[think]

The answer is B: keep only the encodes its members' devices play, fitting three times the titles.

The local share depends on how much of the popularity mass the site holds. Keeping only the codecs and resolutions its devices use lets the same disk hold about three times the content hours, which took the simulated share from 82 percent to 92. Network capacity and a longer window do not change what is held, and pull-through moves misses into the evening peak.

## 5

In the simulated bandwidth drop, the throughput-based player stalled twice, and the buffer-based player did not. Why?

A, it started at a lower rung, so its buffer never had time to build up. B, its harmonic-mean estimate overreacts, so it dropped rungs too far. C, it downloaded longer segments, so each request took more wall time. D, it spent its headroom on bitrate, so a 12.8-second buffer met the drop.

[think]

The answer is D: it spent its headroom on bitrate, so a 12.8-second buffer met the drop.

Picking 5,800 kilobits a second on an 8 megabit link grows the buffer only 1.1 seconds per segment, so when the link fell to 1.2 megabits, the 15.5-second download outlasted a 12.8-second buffer. The buffer-based rule had filled to over 50 seconds, and absorbed a 19.3-second download. Both started at the same rung with the same segment length, and the harmonic mean lagged, rather than overreacted.

## 6

A cloud region hosting part of the control plane fails at peak. In a well-separated design, what happens to members who are already watching?

A, they must restart playback, so a healthy region issues new URLs. B, they keep watching, because the bytes come from edge appliances. C, they drop to the lowest bitrate until steering can be reached. D, their streams stop, because manifests are served by that region.

[think]

The answer is B: they keep watching, because the bytes come from edge appliances.

The player already holds pre-signed appliance URLs, valid for hours, so the data plane does not need the control plane mid-session, and new starts move to healthy regions. The hidden risk is any in-session dependency, such as a license renewal, that the player treats as fatal.
