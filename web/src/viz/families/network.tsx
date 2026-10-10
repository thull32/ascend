// Network scenarios: packets moving between hosts on a timeline. Every
// scenario is a short script over a tiny DSL (`send`, `note`, `set`) so the
// renderer is shared and new scenarios are a few lines each.
import { Box, Legend, Vars, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";

export interface NetworkInput {
  loss?: number;
  packets?: number;
  reuse?: boolean;
  [k: string]: unknown;
}

interface Packet {
  from: number;
  to: number;
  label: string;
  tone: Tone;
  progress: number; // 0..1
  lost?: boolean;
}

export interface NetworkState {
  hosts: { name: string; sub?: string; tone?: Tone }[];
  packets: Packet[];
  log: string[];
  vars: Record<string, unknown>;
  /** Optional bar series (e.g. cwnd over RTTs). */
  chart?: { label: string; values: number[]; unit?: string };
  /** Optional stacked layers (encapsulation). */
  layers?: { name: string; tone: Tone; header: string }[];
}

class Net {
  s: NetworkState;
  f: Frames<NetworkState>;
  constructor(hosts: (string | { name: string; sub?: string })[]) {
    this.s = { hosts: hosts.map((h) => (typeof h === "string" ? { name: h } : h)), packets: [], log: [], vars: {} };
    this.f = new Frames<NetworkState>(() => ({ ...this.s, hosts: this.s.hosts.map((h) => ({ ...h })), packets: this.s.packets.map((p) => ({ ...p })), log: [...this.s.log], vars: { ...this.s.vars }, chart: this.s.chart ? { ...this.s.chart, values: [...this.s.chart.values] } : undefined, layers: this.s.layers?.map((l) => ({ ...l })) }));
  }
  host(name: string): number {
    return this.s.hosts.findIndex((h) => h.name === name);
  }
  /** Send a packet: one frame in flight, one on arrival. Lost packets never arrive. */
  send(from: string, to: string, label: string, note: string, opts: { tone?: Tone; lost?: boolean; tag?: string; arriveNote?: string; keep?: boolean } = {}) {
    const p: Packet = { from: this.host(from), to: this.host(to), label, tone: opts.tone ?? "active", progress: 0.5, lost: opts.lost };
    this.s.packets = opts.keep ? [...this.s.packets, p] : [p];
    this.s.log = [...this.s.log.slice(-5), `${from} → ${to}: ${label}${opts.lost ? " ✗" : ""}`];
    this.f.push(note, opts.tag ?? "send");
    if (opts.lost) {
      this.s.packets = this.s.packets.map((q) => (q === p ? { ...q, progress: 0.75, tone: "danger", lost: true } : q));
      this.f.push(`${label} is lost in transit (never arrives).`, "loss");
      this.s.packets = this.s.packets.filter((q) => q !== p);
      return;
    }
    this.s.packets = this.s.packets.map((q) => (q === p ? { ...q, progress: 1 } : q));
    if (opts.arriveNote) this.f.push(opts.arriveNote, "arrive");
    if (!opts.keep) this.s.packets = [];
  }
  /** Several packets in flight at once (pipelining, multiplexing). */
  burst(from: string, to: string, labels: string[], note: string, tone: Tone = "active", lostIdx: number[] = []) {
    this.s.packets = labels.map((label, i) => ({ from: this.host(from), to: this.host(to), label, tone: lostIdx.includes(i) ? "danger" : tone, progress: 0.2 + (0.6 * i) / Math.max(1, labels.length - 1), lost: lostIdx.includes(i) }));
    this.s.log = [...this.s.log.slice(-5), `${from} → ${to}: ${labels.join(", ")}`];
    this.f.push(note, "burst");
    this.s.packets = [];
  }
  note(text: string, tag = "note") {
    this.f.push(text, tag);
  }
  set(vars: Record<string, unknown>) {
    this.s.vars = { ...this.s.vars, ...vars };
  }
  tone(host: string, tone?: Tone, sub?: string) {
    const i = this.host(host);
    if (i >= 0) this.s.hosts[i] = { ...this.s.hosts[i]!, tone, sub: sub ?? this.s.hosts[i]!.sub };
  }
}

type G = (input: NetworkInput) => ReturnType<Frames<NetworkState>["done"]>;

const tcpHandshake: G = () => {
  const n = new Net([{ name: "Client", sub: "CLOSED" }, { name: "Server", sub: "LISTEN" }]);
  n.note(`TCP three-way handshake: both sides agree on initial sequence numbers before any data flows.`);
  n.tone("Client", "active", "SYN_SENT");
  n.send("Client", "Server", "SYN seq=100", `Client sends SYN with a random initial sequence number (ISN=100) and enters SYN_SENT.`, { tone: "active" });
  n.tone("Server", "frontier", "SYN_RCVD");
  n.send("Server", "Client", "SYN-ACK seq=300 ack=101", `Server acknowledges 100 (ack=101 = next byte it expects) and sends its own ISN=300. State SYN_RCVD; the half-open connection sits in the SYN backlog.`, { tone: "compare" });
  n.tone("Client", "done", "ESTABLISHED");
  n.send("Client", "Server", "ACK ack=301", `Client acknowledges the server's ISN. Client is ESTABLISHED; this ACK can already carry data.`, { tone: "done" });
  n.tone("Server", "done", "ESTABLISHED");
  n.set({ "RTTs before data": 1, "why random ISNs": "prevents old duplicates and blind spoofing" });
  n.note(`Both ESTABLISHED after 1.5 round trips. TLS adds another RTT on top (TLS 1.3), which is why connection reuse and 0-RTT matter.`, "done");
  return n.f.done();
};

const tcpDataTransfer: G = ({ packets = 4 }) => {
  const n = new Net(["Sender", "Receiver"]);
  const mss = 1000;
  n.set({ MSS: mss, rwnd: 4000 });
  n.note(`Data transfer: bytes are numbered; ACKs are cumulative ("I have everything before N"). The receiver's window (rwnd) caps in-flight bytes.`);
  let seq = 1;
  const count = Math.min(6, Math.max(1, packets));
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    labels.push(`seq=${seq}`);
    seq += mss;
  }
  n.burst("Sender", "Receiver", labels, `Sender pipelines ${count} segments without waiting: ${labels.join(", ")}, ${count * mss} bytes in flight (≤ rwnd).`, "active");
  n.send("Receiver", "Sender", `ACK ${seq}`, `Receiver sends one cumulative ACK ${seq}: every byte below ${seq} arrived in order. Delayed ACKs coalesce several segments into one ACK.`, { tone: "done" });
  n.set({ "bytes acked": seq - 1, "throughput bound": "min(cwnd, rwnd) / RTT" });
  n.note(`Throughput ≈ window / RTT. With a 64 KB window and 100 ms RTT you get at most 640 KB/s regardless of link speed; that is why window scaling exists.`, "done");
  return n.f.done();
};

const tcpRetransmit: G = () => {
  const n = new Net(["Sender", "Receiver"]);
  n.note(`Loss recovery: the receiver keeps ACKing the last in-order byte; three duplicate ACKs trigger fast retransmit without waiting for the RTO timer.`);
  n.burst("Sender", "Receiver", ["seq=1", "seq=1001", "seq=2001", "seq=3001"], `Four segments sent; seq=1001 is lost on the way.`, "active", [1]);
  n.send("Receiver", "Sender", "ACK 1001", `seq=1 arrived: ACK 1001.`, { tone: "done" });
  n.send("Receiver", "Sender", "ACK 1001 (dup 1)", `seq=2001 arrived out of order; receiver buffers it but still ACKs 1001 (cumulative). Duplicate ACK #1.`, { tone: "compare" });
  n.send("Receiver", "Sender", "ACK 1001 (dup 2)", `seq=3001 arrived: duplicate ACK #2. (SACK blocks would also say "I have 2001–4000".)`, { tone: "compare" });
  n.send("Receiver", "Sender", "ACK 1001 (dup 3)", `Duplicate ACK #3: the sender infers a single loss, not congestion collapse.`, { tone: "danger" });
  n.set({ cwnd: "halved (fast recovery)", RTO: "not expired" });
  n.send("Sender", "Receiver", "seq=1001 (retransmit)", `Fast retransmit of seq=1001 immediately; cwnd is halved rather than reset to 1 MSS (that only happens on an RTO timeout).`, { tone: "path" });
  n.send("Receiver", "Sender", "ACK 4001", `The hole is filled: cumulative ACK jumps to 4001, acknowledging the buffered segments too.`, { tone: "done" });
  n.note(`Timeouts are expensive (RTO ≥ 200 ms and cwnd resets); fast retransmit and SACK keep the pipe full after isolated losses.`, "done");
  return n.f.done();
};

const tcpTeardown: G = () => {
  const n = new Net([{ name: "Client", sub: "ESTABLISHED" }, { name: "Server", sub: "ESTABLISHED" }]);
  n.note(`Four-way close: each direction is shut independently (half-close).`);
  n.tone("Client", "active", "FIN_WAIT_1");
  n.send("Client", "Server", "FIN", `Client has no more data: sends FIN, enters FIN_WAIT_1.`);
  n.tone("Server", "frontier", "CLOSE_WAIT");
  n.send("Server", "Client", "ACK", `Server ACKs the FIN and enters CLOSE_WAIT. It may still send data.`, { tone: "compare" });
  n.tone("Client", "frontier", "FIN_WAIT_2");
  n.tone("Server", "active", "LAST_ACK");
  n.send("Server", "Client", "FIN", `Server finishes and sends its own FIN (LAST_ACK).`);
  n.tone("Client", "danger", "TIME_WAIT");
  n.send("Client", "Server", "ACK", `Client ACKs and enters TIME_WAIT for 2×MSL (a fixed 60 s on Linux) so a lost final ACK can be re-sent and old segments die.`, { tone: "done" });
  n.tone("Server", "muted", "CLOSED");
  n.set({ "TIME_WAIT": "2×MSL, 60 s on Linux", "who pays": "the side that closes first" });
  n.note(`TIME_WAIT lands on whichever side closes first, and each one holds a port for 60 s. A client or proxy that opens and closes many connections to one destination runs out of ports; reuse connections, let the server close first where the protocol allows, and on Linux consider tcp_tw_reuse for outgoing connections.`, "done");
  return n.f.done();
};

const udpSend: G = ({ loss = 1 }) => {
  const n = new Net(["Sender", "Receiver"]);
  n.note(`UDP: no handshake, no ACKs, no ordering. Each datagram is independent.`);
  n.burst("Sender", "Receiver", ["dgram 1", "dgram 2", "dgram 3", "dgram 4"], `Four datagrams sent back-to-back with zero setup cost.`, "active", loss > 0 ? [2] : []);
  n.set({ delivered: loss > 0 ? "1, 2, 4" : "1, 2, 3, 4", "order guaranteed": false });
  n.note(loss > 0 ? `Datagram 3 was lost and nobody will resend it. The application decides whether that matters (voice: no; file transfer: yes).` : `All delivered this time, but reordering and loss are always possible.`, "done");
  return n.f.done();
};

const dnsResolution: G = () => {
  const n = new Net(["Browser", "Stub/OS", "Recursive", "Root", "TLD .com", "Auth ns"]);
  n.note(`Resolving example.com: each cache miss walks one level down the delegation hierarchy.`);
  n.send("Browser", "Stub/OS", "A example.com?", `Browser asks the OS stub resolver. Browser and OS caches miss.`);
  n.send("Stub/OS", "Recursive", "A example.com?", `Stub forwards to the configured recursive resolver (ISP, 1.1.1.1, 8.8.8.8). Its cache also misses.`);
  n.send("Recursive", "Root", "A example.com?", `Recursive asks a root server (13 anycast addresses).`);
  n.send("Root", "Recursive", "referral: .com NS", `Root does not know the answer; it refers to the .com TLD servers.`, { tone: "compare" });
  n.send("Recursive", "TLD .com", "A example.com?", `Ask the .com TLD server.`);
  n.send("TLD .com", "Recursive", "referral: example.com NS", `Referral to example.com's authoritative name servers (with glue A records).`, { tone: "compare" });
  n.send("Recursive", "Auth ns", "A example.com?", `Ask the authoritative server.`);
  n.send("Auth ns", "Recursive", "A 104.20.23.154 TTL=300", `Authoritative answer with a TTL of 300 s.`, { tone: "done" });
  n.send("Recursive", "Stub/OS", "A 104.20.23.154", `Recursive caches the record for 300 s and replies.`, { tone: "done" });
  n.send("Stub/OS", "Browser", "A 104.20.23.154", `Browser connects. Every later lookup within 300 s is one cache hit instead of four round trips.`, { tone: "done" });
  n.set({ "round trips (cold)": 4, "TTL": "300 s", "warm lookup": "1 cache hit" });
  n.note(`Low TTLs enable fast failover but raise resolver load and cold-path latency; CDNs typically use 20–300 s.`, "done");
  return n.f.done();
};

const httpRequest: G = () => {
  const n = new Net(["Browser", "Server"]);
  n.note(`One HTTP/1.1 request over an existing TCP connection (keep-alive).`);
  n.send("Browser", "Server", "GET /api/lessons HTTP/1.1", `Request line + headers. Host is mandatory; Accept, Cookie, If-None-Match ride along.`, { tone: "active" });
  n.set({ "request headers": "Host, Accept, Cookie, If-None-Match" });
  n.send("Server", "Browser", "200 OK · ETag · Cache-Control", `Status line, headers (Content-Type, Content-Length or chunked, ETag, Cache-Control), then the body.`, { tone: "done" });
  n.send("Browser", "Server", "GET /api/lessons · If-None-Match: \"abc\"", `Later revalidation: the browser sends the ETag it has.`, { tone: "compare" });
  n.send("Server", "Browser", "304 Not Modified", `304 with no body: the cached copy is still valid. Cheap for both sides.`, { tone: "done" });
  n.set({ "HTTP/1.1 limitation": "one response at a time per connection (head-of-line blocking)" });
  n.note(`Browsers open ~6 connections per origin to work around HTTP/1.1's serial responses; HTTP/2 multiplexes instead.`, "done");
  return n.f.done();
};

/** A fresh HTTPS connection (TCP + TLS 1.3 + request) against a reused one (request only). */
const freshVersusReused = () => {
  const n = new Net([{ name: "Client", sub: "no connection" }, { name: "Server", sub: "LISTEN" }]);
  let rtts = 0;
  n.set({ "round trips before the first response byte": 0 });
  n.note(`The first request to a server over HTTPS needs a connection: a TCP handshake, then a TLS 1.3 handshake, then the request itself. Count the round trips before the first response byte.`);
  n.tone("Client", "active", "SYN_SENT");
  n.send("Client", "Server", "SYN", `TCP: the client sends SYN.`, { tone: "active" });
  n.tone("Server", "frontier", "SYN_RCVD");
  rtts++;
  n.set({ "round trips before the first response byte": rtts });
  n.send("Server", "Client", "SYN-ACK", `The server answers SYN-ACK: round trip 1. The client's ACK can travel with its next message.`, { tone: "compare" });
  n.tone("Client", "active", "ESTABLISHED");
  n.send("Client", "Server", "ACK + ClientHello + key_share", `TLS 1.3: the client sends ClientHello with its key share, riding along with the TCP ACK.`, { tone: "active" });
  n.tone("Server", "active", "ESTABLISHED");
  rtts++;
  n.set({ "round trips before the first response byte": rtts });
  n.send("Server", "Client", "ServerHello · {Certificate, Finished}", `The server replies with its key share, certificate and Finished: round trip 2. Both sides now hold the session keys.`, { tone: "compare" });
  n.tone("Client", "done", "TLS open");
  n.tone("Server", "done", "TLS open");
  n.send("Client", "Server", "{Finished} + GET /", `The client sends Finished and the encrypted request together.`, { tone: "active" });
  rtts++;
  n.set({ "round trips before the first response byte": rtts });
  n.send("Server", "Client", "{200 OK}", `The response's first byte arrives after round trip 3.`, { tone: "done" });
  n.set({ "fresh connection": "3 round trips", "round trips before the first response byte": 1 });
  n.send("Client", "Server", "{GET /next}", `The next request reuses the open connection (keep-alive): no SYN, no ClientHello, just the request.`, { tone: "active" });
  n.send("Server", "Client", "{200 OK}", `First byte after 1 round trip.`, { tone: "done" });
  n.set({ "reused connection": "1 round trip" });
  n.note(`A reused connection skips 2 of the 3 round trips: the TCP and TLS handshakes are paid once per connection instead of once per request. On a 100 ms path that is 300 ms against 100 ms.`, "done");
  return n.f.done();
};

const tlsHandshake: G = ({ reuse }) => {
  if (reuse === true) return freshVersusReused();
  const n = new Net(["Client", "Server"]);
  n.note(`TLS 1.3 handshake: one round trip, then encrypted application data. (TLS 1.2 needed two.)`);
  n.send("Client", "Server", "ClientHello + key_share + SNI", `ClientHello lists supported cipher suites, includes the client's (EC)DHE key share and the server name (SNI) so the right certificate is chosen.`, { tone: "active" });
  n.send("Server", "Client", "ServerHello + key_share · {Certificate, CertVerify, Finished}", `ServerHello picks the suite and returns its key share. Everything after it is already encrypted with the derived handshake secret: certificate chain, a signature proving possession of the private key, and Finished.`, { tone: "compare" });
  n.set({ "key exchange": "ECDHE (forward secrecy)", "auth": "certificate signature", "cert check": "chain to trusted root + name + validity" });
  n.send("Client", "Server", "{Finished} + application data", `Client verifies the chain (root CA → intermediate → leaf), checks the name and validity, sends Finished and can immediately send its HTTP request.`, { tone: "done" });
  n.send("Server", "Client", "{application data}", `Encrypted response. Total cost: 1 RTT before data (0-RTT possible on resumption, with replay caveats).`, { tone: "done" });
  n.note(`On a fresh connection the first response byte arrives after 3 round trips: TCP's handshake, this TLS 1.3 handshake, then the request itself. A reused connection pays only the last one; QUIC folds the transport and TLS handshakes into one.`, "done");
  return n.f.done();
};

const http2Multiplexing: G = () => {
  const n = new Net(["Browser", "Server"]);
  n.note(`HTTP/2: many streams share one TCP connection; frames from different streams interleave.`);
  n.burst("Browser", "Server", ["HEADERS s1 GET /", "HEADERS s3 GET /app.js", "HEADERS s5 GET /logo.png"], `Three requests sent at once as HEADERS frames on streams 1, 3, 5 (client streams are odd). HPACK compresses repeated headers.`, "active");
  n.burst("Server", "Browser", ["DATA s3", "DATA s1", "DATA s5", "DATA s3"], `Responses interleave: a slow HTML render no longer blocks the JS bytes. Frames carry stream IDs so the browser reassembles them.`, "done");
  n.set({ connections: 1, "head-of-line blocking": "gone at HTTP layer, still present at TCP layer (one lost packet stalls all streams)" });
  n.note(`HTTP/3 (QUIC) fixes TCP-level head-of-line blocking by giving each stream independent loss recovery.`, "done");
  return n.f.done();
};

const websocketUpgrade: G = () => {
  const n = new Net(["Client", "Server"]);
  n.note(`WebSocket starts as HTTP, then upgrades to a persistent full-duplex framing protocol on the same TCP connection.`);
  n.send("Client", "Server", "GET /ws · Upgrade: websocket · Sec-WebSocket-Key", `An ordinary HTTP GET carrying Upgrade and Connection: Upgrade headers plus a random key.`, { tone: "active" });
  n.send("Server", "Client", "101 Switching Protocols · Sec-WebSocket-Accept", `Server proves it understood the upgrade by hashing the key. After this, HTTP is over on this connection.`, { tone: "compare" });
  n.send("Client", "Server", "frame: {\"subscribe\":\"chat\"}", `Frames flow in both directions independently. Client frames are masked (XOR) to defeat proxy cache poisoning.`, { tone: "done" });
  n.send("Server", "Client", "frame: {\"msg\":\"hello\"}", `Server pushes whenever it likes: no request needed. Ping/pong frames keep NATs and load balancers from dropping the idle connection.`, { tone: "done" });
  n.set({ "vs SSE": "SSE is one-way server→client over plain HTTP; simpler, auto-reconnects, works through more proxies" });
  n.note(`Use WebSockets for bidirectional low-latency traffic (games, collaborative editing); SSE for one-way server push, such as streamed model output or notifications.`, "done");
  return n.f.done();
};

const packetRouting: G = () => {
  const n = new Net(["Host A 10.0.0.5", "Router R1", "Router R2", "Router R3", "Host B 203.0.113.9"]);
  n.note(`Routing: each router looks up the destination IP in its forwarding table (longest prefix match) and forwards to the next hop. Nobody knows the whole path.`);
  n.set({ TTL: 64 });
  n.send("Host A 10.0.0.5", "Router R1", "IP dst=203.0.113.9 TTL=64", `A's route table says 203.0.113.0/24 is not local → send to default gateway R1. The frame's MAC is R1's; the IP header is untouched.`);
  n.set({ TTL: 63 });
  n.send("Router R1", "Router R2", "IP dst=203.0.113.9 TTL=63", `R1 matches 203.0.113.0/24 via R2 (longest prefix wins over 203.0.0.0/16), decrements TTL, rewrites the link-layer frame.`);
  n.set({ TTL: 62 });
  n.send("Router R2", "Router R3", "IP dst=203.0.113.9 TTL=62", `R2 forwards to R3. Each hop is an independent decision; a routing change mid-flow simply re-routes later packets.`);
  n.set({ TTL: 61 });
  n.send("Router R3", "Host B 203.0.113.9", "IP dst=203.0.113.9 TTL=61", `R3 has a directly connected route: ARP for B's MAC and deliver.`, { tone: "done" });
  n.note(`TTL prevents loops from circulating packets forever; traceroute abuses it to discover the path.`, "done");
  return n.f.done();
};

const nat: G = () => {
  const L = "Laptop 192.168.1.11";
  const R = "NAT router 203.0.113.5";
  const W = "Web server 104.20.23.154";
  const n = new Net([L, R, W]);
  n.set({ "NAT table": "192.168.1.10:51000 ↔ 203.0.113.5:51000 (another laptop, already open)" });
  n.note(`NAT (PAT): many private addresses share one public IP by rewriting source address and port and remembering the mapping. One mapping already exists: another laptop, 192.168.1.10, kept its port 51000.`);
  n.send(L, R, "src 192.168.1.11:51000 → dst 104.20.23.154:443", `This laptop also picks source port 51000. Its address is a private RFC 1918 one that is not routable on the internet.`);
  n.set({ "NAT table": "192.168.1.10:51000 ↔ 203.0.113.5:51000; 192.168.1.11:51000 ↔ 203.0.113.5:51001" });
  n.send(R, W, "src 203.0.113.5:51001 → dst 104.20.23.154:443", `Router rewrites the source to its public IP. Public port 51000 is taken by the other laptop's mapping, so it allocates 51001, records the mapping, and recomputes checksums.`, { tone: "compare" });
  n.send(W, R, "src :443 → dst 203.0.113.5:51001", `Server replies to the public address/port.`, { tone: "done" });
  n.send(R, L, "src :443 → dst 192.168.1.11:51000", `Router looks up port 51001 in its table and rewrites the destination back to this laptop.`, { tone: "done" });
  n.note(`Consequences: inbound connections need port forwarding or hole punching (WebRTC/STUN), idle mappings expire (keep-alives), and IPv6 removes the need entirely.`, "done");
  return n.f.done();
};

const lbRoundRobin: G = () => {
  const n = new Net(["Clients", "Load balancer", "Server 1", "Server 2", "Server 3"]);
  n.note(`Round-robin load balancing: requests rotate across healthy backends regardless of their load.`);
  const order = [1, 2, 3, 1, 2];
  for (let i = 0; i < order.length; i++) {
    n.send("Clients", "Load balancer", `req ${i + 1}`, `Request ${i + 1} arrives at the balancer.`);
    n.tone(`Server ${order[i]}`, "active");
    n.send("Load balancer", `Server ${order[i]}`, `req ${i + 1}`, `Forward to Server ${order[i]} (next in rotation).`, { tone: "done" });
    n.tone(`Server ${order[i]}`, undefined);
  }
  n.set({ "health checks": "remove failed backends from rotation", "weights": "weighted RR for uneven capacity" });
  n.note(`Simple and stateless, but a slow request on one server still gets its share of new traffic; least-connections fixes that.`, "done");
  return n.f.done();
};

/** Least connections with one replica `factor` times slower: requests arrive every 50 ms, fast replicas take 100 ms. */
const leastConnSlow = (slowIdx: number, factor: number) => {
  const names = ["Server 1", "Server 2", "Server 3"];
  const service = names.map((_, i) => (i === slowIdx ? 100 * factor : 100));
  const n = new Net([{ name: "Clients" }, { name: "Load balancer" }, ...names.map((nm, i) => ({ name: nm, sub: i === slowIdx ? `slow · conns: 0` : "conns: 0" }))]);
  const inflight: { id: number; end: number }[][] = names.map(() => []);
  const lastPick = names.map(() => -1);
  const served = names.map(() => 0);
  const sub = (i: number) => `${i === slowIdx ? "slow · " : ""}conns: ${inflight[i]!.length}`;
  n.set({ "service time": names.map((nm, i) => `${nm} ${service[i]} ms`).join(", "), arrivals: "one every 50 ms" });
  n.note(`Least connections with an unhealthy mix: ${names[slowIdx]} has become ${factor} times slower (${service[slowIdx]} ms per request against 100 ms). Requests arrive every 50 ms, and each goes to the backend with the fewest in flight; ties go to whichever was picked longest ago.`);
  const N = 8;
  const andList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  for (let r = 0; r < N; r++) {
    const t = r * 50;
    const finished: string[] = [];
    names.forEach((nm, i) => {
      const left = inflight[i]!.filter((q) => q.end > t);
      for (const q of inflight[i]!) if (q.end <= t) finished.push(`${nm} finished request ${q.id}`);
      inflight[i] = left;
      n.tone(nm, undefined, sub(i));
    });
    const counts = inflight.map((q) => q.length);
    const min = Math.min(...counts);
    const ties = counts.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
    const pick = ties.reduce((a, b) => (lastPick[b]! < lastPick[a]! ? b : a));
    const why = ties.every((i) => lastPick[i] === -1) ? "comes first" : lastPick[pick] === -1 ? "has not had a request yet" : "was picked longest ago";
    inflight[pick]!.push({ id: r + 1, end: t + service[pick]! });
    lastPick[pick] = r;
    served[pick]!++;
    n.tone(names[pick]!, "active", sub(pick));
    n.set({ "in flight": counts.join(" / ") + ` → ${names[pick]}`, served: served.join(" / ") });
    n.send("Load balancer", names[pick]!, `req ${r + 1}`, `t = ${t} ms. ${finished.length ? `${finished.join("; ")}. ` : ""}Request ${r + 1} arrives with ${counts.map((c, i) => `${names[i]} ${c}`).join(", ")} in flight: ${ties.length > 1 ? `${andList(ties.map((i) => names[i]!))} tie at ${min}, and ${names[pick]} ${why}` : `${names[pick]} has the fewest (${min})`}, so it goes there.`, { tone: "done" });
    n.tone(names[pick]!, undefined, sub(pick));
  }
  const rr = names.map((_, i) => Math.floor((N - 1 - i) / 3) + 1);
  n.set({ served: served.join(" / "), "round robin would send": rr.join(" / ") });
  n.note(`Over these ${N} requests ${names[slowIdx]} took ${served[slowIdx]}: its long-running request kept its count up, so new work flowed to the fast replicas without anyone measuring latency. Round robin would have sent it ${rr[slowIdx]} of the ${N}, and those would queue behind its ${service[slowIdx]} ms requests while the fast replicas sat partly idle.`, "done");
  return n.f.done();
};

const lbLeastConn: G = (input) => {
  const slow = Math.round(Number(input.slow));
  if (Number.isFinite(slow) && slow >= 1 && slow <= 3) return leastConnSlow(slow - 1, Math.max(2, Math.min(5, Math.round(Number(input.factor ?? 3)) || 3)));
  const n = new Net([{ name: "Clients" }, { name: "Load balancer" }, { name: "Server 1", sub: "conns: 0" }, { name: "Server 2", sub: "conns: 0" }, { name: "Server 3", sub: "conns: 0" }]);
  const conns = [0, 0, 0];
  n.note(`Least-connections: each new request goes to the backend with the fewest in-flight requests.`);
  const events: (["req"] | ["done", number])[] = [["req"], ["req"], ["req"], ["req"], ["done", 1], ["req"], ["req"]];
  let r = 0;
  for (const ev of events) {
    if (ev[0] === "done") {
      conns[ev[1]]!--;
      n.tone(`Server ${ev[1] + 1}`, undefined, `conns: ${conns[ev[1]]}`);
      n.note(`Server ${ev[1] + 1} finishes a request (conns ${conns[ev[1]]}).`, "complete");
      continue;
    }
    r++;
    const min = Math.min(...conns);
    const idx = conns.indexOf(min);
    n.send("Clients", "Load balancer", `req ${r}`, `Request ${r} arrives. Connection counts: ${conns.join(", ")}.`);
    conns[idx]!++;
    n.tone(`Server ${idx + 1}`, "active", `conns: ${conns[idx]}`);
    n.send("Load balancer", `Server ${idx + 1}`, `req ${r}`, `Server ${idx + 1} has the fewest connections (${min}) → send there.`, { tone: "done" });
    n.tone(`Server ${idx + 1}`, undefined);
  }
  n.note(`Adapts to slow requests and uneven backends. Needs per-backend state on the balancer (fine for L7 proxies like Envoy/HAProxy).`, "done");
  return n.f.done();
};

const str = (v: unknown, dflt: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : dflt);
const posNum = (v: unknown, dflt: number) => (Number.isFinite(Number(v)) && Number(v) > 0 && v !== null && v !== "" ? Number(v) : dflt);
const ttlWords = (s: number) => (s === 86400 ? "a day" : s === 31536000 ? "a year" : s % 86400 === 0 ? `${s / 86400} days` : s % 3600 === 0 ? `${s / 3600} hour${s === 3600 ? "" : "s"}` : `${s} s`);

/** Pull-through CDN caching. Defaults are a video segment in Tokyo; lessons pass their own asset, places, TTL and closing. */
const cdnCache: G = (input) => {
  const user = str(input.user, "User (Tokyo)");
  const edge = str(input.edge, "Edge PoP (Tokyo)");
  const origin = str(input.origin, "Origin (Virginia)");
  const path = str(input.path, "/video/seg42.m4s");
  const asset = str(input.asset, "a video segment");
  const same = str(input.same, "segment");
  const nearby = str(input.nearby, "in Tokyo");
  const maxAge = Math.round(posNum(input.maxAge, 86400));
  const missMs = Math.round(posNum(input.missMs, 160));
  const hitMs = Math.round(posNum(input.hitMs, 5));
  const n = new Net([user, edge, origin]);
  n.note(`CDN caching: the first request for an object is served from origin and cached at the edge; later users nearby get it in a few ms.`);
  n.send(user, edge, `GET ${path}`, `User A requests ${asset}. DNS/anycast sent them to the nearest PoP.`);
  n.tone(edge, "danger", "MISS");
  n.send(edge, origin, `GET ${path}`, str(input.missNote, `Cache miss: fetch from origin across the Pacific (~150 ms RTT).`), { tone: "compare" });
  n.send(origin, edge, `200 · Cache-Control: max-age=${maxAge}`, `Origin responds; Cache-Control tells the edge it may cache for ${ttlWords(maxAge)}.`, { tone: "compare" });
  n.tone(edge, "done", "cached");
  n.send(edge, user, "200 (X-Cache: MISS)", `User A gets the bytes: ~${missMs} ms.`, { tone: "done" });
  n.send(user, edge, `GET ${path}`, `User B ${nearby} requests the same ${same}.`);
  n.tone(edge, "done", "HIT");
  n.send(edge, user, "200 (X-Cache: HIT)", `Served from the edge: ~${hitMs} ms, and the origin never sees it.`, { tone: "done" });
  const extra = input.stats && typeof input.stats === "object" ? Object.fromEntries(Object.entries(input.stats as Record<string, unknown>).map(([k, v]) => [k, String(v)])) : {};
  n.set({ "hit ratio": "what you optimise", "cache key": "URL + selected headers (Vary)", "invalidation": "purge or versioned URLs", ...extra });
  n.note(str(input.closing, `Netflix's Open Connect goes further: appliances inside ISPs pre-positioned with the catalogue during off-peak hours.`), "done");
  return n.f.done();
};

const slowStart: G = ({ loss = 1 }) => {
  const n = new Net(["Sender", "Receiver"]);
  n.s.chart = { label: "cwnd (segments) per RTT", values: [], unit: "seg" };
  let cwnd = 1;
  let ssthresh = 16;
  n.note(`Congestion control: cwnd starts at 1 (10 in modern stacks), doubles every RTT in slow start until ssthresh, then grows by 1 per RTT (congestion avoidance).`);
  for (let rtt = 1; rtt <= 8; rtt++) {
    n.s.chart.values.push(cwnd);
    n.set({ RTT: rtt, cwnd, ssthresh, phase: cwnd < ssthresh ? "slow start" : "congestion avoidance" });
    const lossNow = loss > 0 && rtt === 5;
    n.burst("Sender", "Receiver", Array.from({ length: Math.min(cwnd, 8) }, (_, i) => `seg ${i + 1}`), `RTT ${rtt}: send cwnd = ${cwnd} segments${cwnd > 8 ? " (showing 8)" : ""}.`, "active", lossNow ? [2] : []);
    if (lossNow) {
      ssthresh = Math.max(2, Math.floor(cwnd / 2));
      cwnd = ssthresh;
      n.set({ RTT: rtt, cwnd, ssthresh, phase: "fast recovery" });
      n.note(`Loss detected by duplicate ACKs: ssthresh = cwnd/2 = ${ssthresh}, cwnd = ${cwnd} (multiplicative decrease). A timeout would reset cwnd to 1.`, "loss");
      continue;
    }
    const next = cwnd < ssthresh ? cwnd * 2 : cwnd + 1;
    n.set({ RTT: rtt, cwnd: next, ssthresh, phase: next < ssthresh ? "slow start" : "congestion avoidance" });
    n.send("Receiver", "Sender", "ACKs", `All ACKed. ${cwnd < ssthresh ? `Slow start: cwnd doubles to ${next}.` : `Congestion avoidance: cwnd += 1 → ${next}.`}`, { tone: "done" });
    cwnd = next;
  }
  n.s.chart.values.push(cwnd);
  n.note(loss > 0 ? `Additive increase, multiplicative decrease: every loss halves cwnd and every loss-free RTT adds one segment, so a long flow's window traces a sawtooth. Cubic grows faster on long fat pipes; BBR models bandwidth and RTT instead of reacting to loss.` : `With no loss, cwnd only grows: doubling every RTT up to ssthresh (${ssthresh}), then one segment per RTT. The first loss would halve it. Cubic grows faster on long fat pipes; BBR models bandwidth and RTT instead of reacting to loss.`, "done");
  return n.f.done();
};

const slidingWindowProtocol: G = ({ loss = 1 }) => {
  if (loss <= 0) return windowLimited();
  const n = new Net(["Sender", "Receiver"]);
  n.set({ window: 3 });
  n.note(`Sliding window (Go-Back-N with window 3): up to 3 unacknowledged frames in flight; a loss forces resend from the lost frame.`);
  n.burst("Sender", "Receiver", ["f0", "f1", "f2"], `Send f0, f1, f2 (window full).`, "active", [1]);
  n.send("Receiver", "Sender", "ACK 0", `f0 in order: ACK 0. f1 lost; f2 arrives out of order and is discarded (Go-Back-N keeps no buffer).`, { tone: "compare" });
  n.set({ window: 3, base: 1 });
  n.send("Sender", "Receiver", "f3", `Window slides: send f3. Still waiting for ACK 1.`, { tone: "active" });
  n.send("Receiver", "Sender", "ACK 0 (dup)", `Receiver still expects f1: repeats ACK 0.`, { tone: "compare" });
  n.note(`Timer for f1 expires: go back to f1 and resend everything from there.`, "timeout");
  n.burst("Sender", "Receiver", ["f1", "f2", "f3"], `Resend f1, f2, f3. Selective Repeat would resend only f1 and keep the buffered f2/f3.`, "path");
  n.send("Receiver", "Sender", "ACK 3", `Cumulative ACK 3: all delivered.`, { tone: "done" });
  n.note(`Window size bounds throughput: bandwidth × delay must fit in the window or the link idles.`, "done");
  return n.f.done();
};

/** No loss: the window, not the link, caps throughput (window / RTT). */
const windowLimited = () => {
  const W = 3;
  const BDP = 8;
  const n = new Net(["Sender", "Receiver"]);
  n.set({ window: `${W} frames`, "link holds per RTT (bandwidth × RTT)": `${BDP} frames`, "in flight": 0 });
  n.note(`A sliding window with no loss. The window is ${W} frames: at most ${W} may be unacknowledged. The link could carry ${BDP} frames in one round trip (its bandwidth-delay product).`);
  n.set({ "in flight": W });
  n.burst("Sender", "Receiver", ["f0", "f1", "f2"], `Send f0, f1 and f2 back to back. The window is now full after ${W} of the ${BDP} frames the link could carry this round trip.`, "active");
  n.note(`Nothing more may be sent until an ACK comes back, so the sender idles for the rest of the round trip and the link sits ${BDP - W}/${BDP} empty. A faster link would only make the idle gap longer.`, "idle");
  n.set({ "in flight": 0, base: W });
  n.send("Receiver", "Sender", "ACK 2", `One RTT after f0 left, the cumulative ACK for f0 to f2 arrives and the window slides forward by ${W}.`, { tone: "done" });
  n.set({ "in flight": W });
  n.burst("Sender", "Receiver", ["f3", "f4", "f5"], `Send the next window, f3 to f5, and idle again.`, "active");
  n.set({ "in flight": 0, base: 2 * W });
  n.send("Receiver", "Sender", "ACK 5", `ACK 5 arrives a round trip later: ${W} frames per RTT, every RTT.`, { tone: "done" });
  n.set({ throughput: `${W} frames per RTT = window / RTT`, "link used": `${Math.round((W / BDP) * 1000) / 10}%` });
  n.note(`Throughput = window / RTT = ${W} frames per round trip, ${Math.round((W / BDP) * 1000) / 10}% of what the link could carry, whatever its speed. To fill the pipe the window must reach the bandwidth-delay product, ${BDP} frames here.`, "done");
  return n.f.done();
};

const distanceVector: G = () => {
  const n = new Net([{ name: "A", sub: "B:1 C:4" }, { name: "B", sub: "A:1 C:2" }, { name: "C", sub: "A:4 B:2" }]);
  n.note(`Distance-vector (RIP/Bellman-Ford): each router periodically tells neighbours its distance to every destination; neighbours relax.`);
  n.send("B", "A", "vector {A:1, B:0, C:2}", `B advertises its table to A.`);
  n.tone("A", "done", "B:1 C:3 (via B)");
  n.note(`A learns C is reachable via B at cost 1 + 2 = 3, better than its direct link (4). Table updated.`, "relax");
  n.send("B", "C", "vector {A:1, B:0, C:2}", `B advertises to C.`);
  n.tone("C", "done", "A:3 (via B) B:2");
  n.note(`C learns A via B at cost 3.`, "relax");
  n.set({ convergence: "after O(diameter) rounds", "failure mode": "count-to-infinity when a link dies; split horizon and poison reverse stop two-router loops, not loops of three or more" });
  n.note(`Simple and low-CPU, but slow to converge and prone to loops during failures; that is why OSPF (link-state) won inside big networks.`, "done");
  return n.f.done();
};

const linkState: G = () => {
  const n = new Net(["A", "B", "C", "D"]);
  n.note(`Link-state (OSPF/IS-IS): every router floods its own link costs to all; each then runs Dijkstra on the identical full map.`);
  n.burst("A", "B", ["LSA(A): B=1, C=4"], `A floods a link-state advertisement describing its links.`, "active");
  n.burst("B", "C", ["LSA(A)", "LSA(B): A=1, C=2, D=5"], `B re-floods A's LSA and adds its own. Sequence numbers prevent loops and stale data.`, "active");
  n.burst("C", "D", ["LSA(A)", "LSA(B)", "LSA(C): B=2, D=1"], `Flooding continues until every router holds every LSA: an identical link-state database.`, "active");
  n.set({ database: "identical on all routers", "per router": "Dijkstra → shortest-path tree → forwarding table" });
  n.note(`Each router computes A→D = A→B→C→D = 1+2+1 = 4 independently. Fast convergence, loop-free, but more CPU and memory than distance-vector.`, "done");
  return n.f.done();
};

const bgpPath: G = () => {
  const n = new Net(["AS 2906 (Netflix)", "AS 3356 (transit)", "AS 7018 (ISP)", "AS 64496 (your ISP)"]);
  n.note(`BGP is path-vector: an AS advertises a prefix with the list of ASes the route passes through; policy, not distance, picks the best.`);
  n.send("AS 2906 (Netflix)", "AS 3356 (transit)", "UPDATE 198.51.100.0/24 AS_PATH [2906]", `Origin AS announces its prefix.`);
  n.send("AS 3356 (transit)", "AS 7018 (ISP)", "UPDATE 198.51.100.0/24 AS_PATH [3356 2906]", `Transit prepends itself and re-advertises to customers/peers according to policy (valley-free routing).`, { tone: "compare" });
  n.send("AS 7018 (ISP)", "AS 64496 (your ISP)", "UPDATE 198.51.100.0/24 AS_PATH [7018 3356 2906]", `Your ISP receives a route with a 3-AS path. If it also had a direct peering with 2906 it would prefer the shorter path (or the one with better local preference).`, { tone: "done" });
  n.set({ "loop detection": "reject if own AS appears in AS_PATH", "decision order": "local pref → AS path length → origin → MED → …", "risk": "route leaks and hijacks (RPKI mitigates)" });
  n.note(`Netflix and other big content networks peer directly with ISPs so the AS_PATH is one hop: cheaper and lower latency.`, "done");
  return n.f.done();
};

const arp: G = () => {
  const n = new Net(["Host A 10.0.0.5", "Switch (broadcast)", "Host B 10.0.0.9", "Host C 10.0.0.7"]);
  n.note(`ARP maps an IP on the local link to a MAC address. It is needed before the first IP packet to any local host.`);
  n.send("Host A 10.0.0.5", "Switch (broadcast)", "ARP who-has 10.0.0.9? tell 10.0.0.5", `A broadcasts (MAC ff:ff:ff:ff:ff:ff) asking for 10.0.0.9's MAC.`);
  n.burst("Switch (broadcast)", "Host C 10.0.0.7", ["ARP who-has 10.0.0.9?"], `Every host on the segment receives the broadcast. C ignores it.`, "muted");
  n.send("Switch (broadcast)", "Host B 10.0.0.9", "ARP who-has 10.0.0.9?", `B recognises its own IP.`, { tone: "compare" });
  n.send("Host B 10.0.0.9", "Host A 10.0.0.5", "ARP reply 10.0.0.9 is-at 02:42:ac:11:00:09", `B replies unicast with its MAC. A caches the entry (reachable for tens of seconds, then revalidated) and sends the IP packet.`, { tone: "done" });
  n.set({ "cache": "arp -a", "attack": "ARP spoofing (no authentication)", "IPv6": "NDP replaces ARP" });
  n.note(`Gratuitous ARP announces address changes (VRRP failover); ARP spoofing is why untrusted LANs need encryption above.`, "done");
  return n.f.done();
};

const traceroute: G = () => {
  const n = new Net(["You", "Hop 1", "Hop 2", "Hop 3", "Target"]);
  n.note(`traceroute sends probes with increasing TTL; each router that decrements TTL to 0 replies with ICMP Time Exceeded, revealing itself.`);
  n.send("You", "Hop 1", "probe TTL=1", `TTL=1 probe.`);
  n.send("Hop 1", "You", "ICMP Time Exceeded", `Hop 1 decrements TTL to 0, drops the packet, and reports back. RTT measured: ~1 ms.`, { tone: "compare" });
  n.send("You", "Hop 2", "probe TTL=2", `TTL=2 probe passes Hop 1.`);
  n.send("Hop 2", "You", "ICMP Time Exceeded", `Hop 2 reveals itself: ~8 ms.`, { tone: "compare" });
  n.send("You", "Hop 3", "probe TTL=3", `TTL=3.`);
  n.note(`No reply within the timeout: Hop 3 rate-limits or filters ICMP. traceroute prints * * *; the path still works.`, "timeout");
  n.send("You", "Target", "probe TTL=4", `TTL=4 reaches the target.`);
  n.send("Target", "You", "ICMP Port Unreachable (or echo reply)", `The destination answers differently (port unreachable for UDP probes, echo reply for ICMP probes), which is how traceroute knows it is done.`, { tone: "done" });
  n.set({ "reads": "latency jumps = long links or congested hops", "caveat": "return path may differ; MPLS hides hops" });
  n.note(`Use mtr for continuous per-hop loss and latency; a spike at one hop that does not persist downstream is just ICMP deprioritisation, not a problem.`, "done");
  return n.f.done();
};

const grpcStream: G = () => {
  const n = new Net(["Client", "Server"]);
  n.note(`gRPC over HTTP/2: a unary call is one stream; server-streaming keeps the stream open and sends many messages.`);
  n.send("Client", "Server", "HEADERS :path=/lessons.Search/Watch · content-type: application/grpc", `Call metadata as HTTP/2 headers, including deadline (grpc-timeout) and auth.`, { tone: "active" });
  n.send("Client", "Server", "DATA (protobuf request, 42 bytes)", `The request message: length-prefixed protobuf, far smaller than JSON.`, { tone: "active" });
  n.burst("Server", "Client", ["DATA msg 1", "DATA msg 2", "DATA msg 3"], `Server streams messages as they are produced; flow control per stream applies backpressure.`, "done");
  n.send("Server", "Client", "HEADERS (trailers) grpc-status: 0", `Trailers end the call with the status code; non-zero statuses carry details.`, { tone: "done" });
  n.set({ "deadlines": "propagate through call chains", "codegen": "typed stubs from .proto", "browser": "needs grpc-web or a gateway" });
  n.note(`Use gRPC service-to-service (typed, fast, streaming); use REST/JSON at the edge where browsers, caches and humans live.`, "done");
  return n.f.done();
};

const longPollingVsSse: G = () => {
  const n = new Net(["Browser", "Server"]);
  n.note(`Long polling: the browser asks and the server holds the request until there is news. SSE: one long-lived response that keeps sending events.`);
  n.send("Browser", "Server", "GET /updates (long poll)", `Long poll request 1: the server parks it.`);
  n.note(`…server waits up to 25 s for an event…`, "wait");
  n.send("Server", "Browser", "200 {event 1}", `An event arrives: respond, connection closes.`, { tone: "compare" });
  n.send("Browser", "Server", "GET /updates (long poll)", `Browser immediately re-polls. Each event costs a full request/response and headers.`);
  n.note(`Now SSE for the same traffic:`, "sse");
  n.send("Browser", "Server", "GET /events · Accept: text/event-stream", `One request.`);
  n.burst("Server", "Browser", ["event: delta", "event: delta", "event: done"], `The response never ends: events are newline-delimited text chunks. The browser's EventSource (or a fetch reader, as this app does for POST bodies) parses them and auto-reconnects with Last-Event-ID.`, "done");
  n.set({ "long polling": "works everywhere, high overhead", "SSE": "simple, one-way, HTTP-native, used for this app's AI streaming", "WebSocket": "two-way, custom framing" });
  n.note(`Pick the simplest transport that fits the direction of data.`, "done");
  return n.f.done();
};

const osiEncapsulation: G = () => {
  const n = new Net(["Application", "Transport", "Network", "Link"]);
  n.s.layers = [];
  n.note(`Encapsulation: each layer wraps the payload from above with its own header. Going down the stack adds headers; going up strips them.`);
  const layers: { name: string; tone: Tone; header: string; note: string }[] = [
    { name: "Application (HTTP)", tone: "done", header: "GET /index.html", note: `The application produces bytes: an HTTP request.` },
    { name: "Transport (TCP)", tone: "path", header: "src port 51000 · dst port 443 · seq · ack · flags", note: `TCP adds ports (which process), sequence numbers (ordering, reliability) and flags. Unit: segment.` },
    { name: "Network (IP)", tone: "compare", header: "src 10.0.0.5 · dst 104.20.23.154 · TTL · protocol=TCP", note: `IP adds addresses that routers use across networks and a TTL. Unit: packet.` },
    { name: "Link (Ethernet)", tone: "frontier", header: "dst MAC (gateway) · src MAC · type=IPv4 · FCS", note: `Ethernet adds MAC addresses for the next hop only, and a checksum. Unit: frame. MTU 1500 bytes bounds the whole thing.` },
  ];
  for (const l of layers) {
    n.s.layers = [...n.s.layers, { name: l.name, tone: l.tone, header: l.header }];
    n.set({ "headers so far": n.s.layers.length, "on the wire": n.s.layers.length === 4 ? "bits over copper/fibre/radio" : "not yet" });
    n.note(l.note, "wrap");
  }
  const unwrap: { note: string }[] = [
    { note: `On the receiving host the frame goes up the stack. Link checks the FCS and that the destination MAC is its own, then strips the Ethernet header.` },
    { note: `Network checks the destination IP is one of its addresses and that the protocol field says TCP, then strips the IP header.` },
    { note: `Transport uses the destination port (443) to find the socket, puts the segment in sequence order and strips the TCP header.` },
  ];
  for (const u of unwrap) {
    n.s.layers = n.s.layers.slice(0, -1);
    n.set({ "headers so far": n.s.layers.length, "on the wire": "received" });
    n.note(u.note, "unwrap");
  }
  n.note(`What reaches the application is exactly the bytes it was sent: GET /index.html. Routers along the way work at Network (they rewrite the Link header every hop and leave IP mostly alone); switches at Link; load balancers at Transport (L4) or Application (L7).`, "done");
  return n.f.done();
};

function Renderer({ frame }: RendererProps<NetworkInput, NetworkState>) {
  const { state } = frame;
  const H = 130;
  const n = state.hosts.length;
  const W = Math.max(360, n * 120);
  const gap = W / n;
  const cx = (i: number) => gap * i + gap / 2;
  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W * 1.3, minWidth: Math.min(W, 640) }} role="img" aria-label="Network hosts and packets">
        {state.hosts.map((h, i) => (
          <Box key={h.name} x={cx(i) - 52} y={12} w={104} h={40} label={h.name.length > 16 ? h.name.slice(0, 15) + "…" : h.name} sub={h.sub} tone={h.tone ?? "default"} />
        ))}
        {state.hosts.map((_, i) => (
          <line key={i} x1={cx(i)} y1={52} x2={cx(i)} y2={H - 6} stroke="var(--border)" strokeDasharray="3 3" />
        ))}
        {state.packets.map((p, i) => {
          const x1 = cx(p.from);
          const x2 = cx(p.to);
          const y = 70 + (i % 4) * 14;
          const x = x1 + (x2 - x1) * p.progress;
          const dir = x2 >= x1 ? 1 : -1;
          return (
            <g key={i}>
              <line x1={x1} y1={y} x2={x2} y2={y} stroke="var(--border)" strokeWidth={1} opacity={0.5} />
              <g transform={`translate(${x}, ${y})`}>
                <path d={`M ${-8 * dir} -6 L ${6 * dir} -6 L ${10 * dir} 0 L ${6 * dir} 6 L ${-8 * dir} 6 Z`} fill={p.lost ? "var(--danger)" : `var(--pk-${p.tone})`} stroke={p.lost ? "var(--danger)" : "var(--accent)"} strokeWidth={1} />
                {p.lost && (
                  <text x={0} y={4} fontSize="9" textAnchor="middle" fill="white" fontWeight={700}>
                    ✕
                  </text>
                )}
              </g>
              <text x={(x1 + x2) / 2} y={y - 8} fontSize="9" textAnchor="middle" fill="var(--fg)" style={{ paintOrder: "stroke", stroke: "var(--bg-elev)", strokeWidth: 3 }}>
                {p.label.length > 44 ? p.label.slice(0, 43) + "…" : p.label}
              </text>
            </g>
          );
        })}
        <style>{`:root { --pk-active: var(--accent); --pk-compare: var(--warn); --pk-done: var(--success); --pk-danger: var(--danger); --pk-path: var(--accent); --pk-muted: var(--border); --pk-default: var(--bg-elev-2); --pk-visited: var(--success); --pk-frontier: var(--warn); }`}</style>
      </svg>
      {state.layers && state.layers.length > 0 && (
        <div className="flex flex-col gap-1">
          {[...state.layers].reverse().map((l, i) => (
            <div key={l.name} className="rounded-md border px-3 py-1.5 text-xs" style={{ marginLeft: i * 12, borderColor: `var(--stroke-${l.tone})`, background: `color-mix(in srgb, var(--stroke-${l.tone}) 15%, var(--bg-elev-2))` }}>
              <span className="font-semibold">{l.name}</span> <span className="font-mono text-muted">[{l.header}]</span>
            </div>
          ))}
          <style>{`:root { --stroke-done: var(--success); --stroke-path: var(--accent); --stroke-compare: var(--warn); --stroke-frontier: var(--warn); }`}</style>
        </div>
      )}
      {state.chart && (
        <div>
          <div className="mb-1 text-[11px] text-muted">{state.chart.label}</div>
          <div className="flex h-24 items-end gap-1">
            {state.chart.values.map((v, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <div className="w-6 rounded-t bg-accent/60" style={{ height: `${Math.max(3, (v / Math.max(...state.chart!.values, 1)) * 80)}px` }} />
                <span className="font-mono text-[9px] text-muted">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {state.log.length > 0 && (
        <div className="rounded-md bg-code px-3 py-2 font-mono text-[11px] text-muted">
          {state.log.map((l, i) => (
            <div key={i} className={i === state.log.length - 1 ? "text-fg" : ""}>
              {l}
            </div>
          ))}
        </div>
      )}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "request / data" }, { tone: "compare", label: "response / control" }, { tone: "done", label: "success" }, { tone: "danger", label: "loss" }]} />
    </div>
  );
}

const scenarios: Record<string, G> = {
  "osi-encapsulation": osiEncapsulation,
  "tcp-handshake": tcpHandshake,
  "tcp-data-transfer": tcpDataTransfer,
  "tcp-retransmit": tcpRetransmit,
  "tcp-teardown": tcpTeardown,
  "udp-send": udpSend,
  "dns-resolution": dnsResolution,
  "http-request": httpRequest,
  "https-tls-handshake": tlsHandshake,
  "http2-multiplexing": http2Multiplexing,
  "websocket-upgrade": websocketUpgrade,
  "packet-routing": packetRouting,
  nat,
  "load-balancer-round-robin": lbRoundRobin,
  "load-balancer-least-conn": lbLeastConn,
  "cdn-cache": cdnCache,
  "congestion-slow-start": slowStart,
  "sliding-window-protocol": slidingWindowProtocol,
  "distance-vector": distanceVector,
  "link-state": linkState,
  "bgp-path": bgpPath,
  arp,
  traceroute,
  "grpc-stream": grpcStream,
  "long-polling-vs-sse": longPollingVsSse,
};

export const networkFamily: Family<NetworkInput, NetworkState> = {
  name: "Network",
  description: "Packets, handshakes, routing and delivery between hosts.",
  Renderer,
  algorithms: scenarios,
  labels: {
    "osi-encapsulation": "Encapsulation down the stack",
    "tcp-handshake": "TCP three-way handshake",
    "tcp-data-transfer": "TCP data transfer & ACKs",
    "tcp-retransmit": "TCP loss & fast retransmit",
    "tcp-teardown": "TCP connection teardown",
    "udp-send": "UDP datagrams",
    "dns-resolution": "DNS resolution",
    "http-request": "HTTP/1.1 request & caching",
    "https-tls-handshake": "TLS 1.3 handshake",
    "http2-multiplexing": "HTTP/2 multiplexing",
    "websocket-upgrade": "WebSocket upgrade",
    "packet-routing": "IP routing hop by hop",
    nat: "NAT translation",
    "load-balancer-round-robin": "Load balancer: round robin",
    "load-balancer-least-conn": "Load balancer: least connections",
    "cdn-cache": "CDN edge caching",
    "congestion-slow-start": "Congestion control: slow start & AIMD",
    "sliding-window-protocol": "Sliding window (Go-Back-N)",
    "distance-vector": "Distance-vector routing",
    "link-state": "Link-state routing",
    "bgp-path": "BGP path vector",
    arp: "ARP resolution",
    traceroute: "traceroute",
    "grpc-stream": "gRPC streaming",
    "long-polling-vs-sse": "Long polling vs SSE",
  },
  examples: Object.fromEntries(Object.keys(scenarios).map((k) => [k, {}])),
  normalise: (raw) => ({ ...raw, loss: raw.loss === undefined ? undefined : Number(raw.loss), packets: raw.packets === undefined ? undefined : Number(raw.packets) }),
};
