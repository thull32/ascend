// Scenario pack for the `fabric` family: operations and automation (module 08).
// Each scenario is a script over the `Fab` DSL in fabric-core.tsx (read its
// authoring guide first; fabric-scenarios-core.tsx has three reference
// scenarios). Export every generator in `scenarios` and a short gallery label
// in `labels`; fabric.test.ts picks them up automatically.
//
// Scenarios this pack must implement (from the track brief: name, what it
// shows, owner lesson). Run on the Meridian fabric; the default run (input {})
// is what the owning lesson uses. Document any optional input in the
// scenario's doc comment.
//
//   | `intent-drift` | source of truth, rendered config, running config; a
//     diff; a merge-mode push leaving a deleted line behind; replace removing it
//     | 08-01 |
//   | `netconf-commit` | lock, edit candidate, validate, commit confirmed with
//     a timer, the session lost, automatic rollback | 08-02 |
//   | `telemetry-blind` | streaming telemetry stops from a device; out-of-band
//     heartbeat and neighbour state tell "dead" from "congested" | 08-03 |
//   | `probe-localisation` | probes between two leaves with many 5-tuples
//     hashing over every spine; the degraded ones share one spine | 08-04 (also
//     08-05) |
//   | `spine-drain` | pre-check headroom, cost out a spine, traffic moving off,
//     verify, work, restore, verify | 08-06 |
//
// Addresses this pack adds to the Meridian plan (consistent across its
// scenarios): the automation server is 172.16.0.20 on the out-of-band
// management network; monitoring hosts live in 10.250.0.0/16 on the data
// network (the telemetry collector 10.250.1.10 behind leaf4.ams, a probe agent
// 10.250.<10+n>.10 behind leafN.ams); leaf uplinks are ports swp51.. (swp5N
// faces spineN) and a spine's port swpN faces leafN.
import { Fab, fnv32, loopback, p2p, pick, type Cell, type FabGen, type HeaderSpec } from "./fabric-core";

const num = (n: number): string => n.toLocaleString("en-US");
const short = (id: string): string => id.split(".")[0]!;
const AUTOMATION_IP = "172.16.0.20";
/** Out-of-band management address of a Meridian device: 172.16.<site>.<n>, same <n> as its loopback. */
const mgmt = (device: string): string => loopback(device).replace(/^10\.255\./, "172.16.");

// ---------- intent-drift ----------

type Line = [string, string];
const rendered = (staging: boolean): Line[] => [
  ["hostname", "leaf1.ams"],
  ["lo", "10.255.1.11/32"],
  ["swp51 (spine1)", "mtu 9216, isis metric 10"],
  ["swp52 (spine2)", "mtu 9216, isis metric 10"],
  ["vlan 100", "vni 10100 (Acme)"],
  ["swp1 (acme-web1)", "access vlan 100"],
  ...(staging ? ([["vlan 300", "vni 10102 (Acme staging)"], ["swp5", "access vlan 300"]] as Line[]) : []),
];

/**
 * `intent-drift` (lesson 08-01). The intent loop for one switch, leaf1.ams
 * (small example, its two uplinks to spine1.ams and spine2.ams shown): the
 * source of truth holds data (role, loopback, fabric links, tenant segments),
 * a template renders it into eight lines of vendor-neutral configuration, and
 * the automation (172.16.0.20) diffs that against the running configuration it
 * reads over the out-of-band network. Two differences appear: drift (an
 * engineer's manual IS-IS metric 1000 on swp52, approved for revert) and a
 * deletion (Acme retires its staging segment, VLAN 300 / L2VNI 10102 on port
 * swp5, so the render loses two lines). A merge-mode push fixes the metric but
 * leaves the two deleted lines on the device (leaf1 keeps advertising an EVPN
 * type-3 route for VNI 10102, RT 65000:10102); a replace-mode push makes the
 * device delete them; a rerun finds an empty diff and pushes nothing
 * (idempotency).
 *
 * Inputs: none. 13 frames.
 */
export const intentDrift: FabGen = () => {
  const L1 = "leaf1.ams";
  const fab = new Fab(
    [
      { id: "sot", label: "source of truth", kind: "controller", x: 12, y: 0 },
      { id: "automation", label: "automation", kind: "controller", x: 12, y: 50, state: AUTOMATION_IP },
      { id: "spine1.ams", kind: "spine", x: 50, y: 0 },
      { id: "spine2.ams", kind: "spine", x: 86, y: 0 },
      { id: L1, kind: "leaf", x: 68, y: 50 },
      { id: "acme-web1", kind: "host", x: 68, y: 100 },
    ],
    [
      ["sot", "automation", { dashed: true }],
      ["automation", L1, { dashed: true, label: `OOB ${mgmt(L1)}` }],
      [L1, "spine1.ams", { label: "swp51", labelAt: 0.3 }],
      [L1, "spine2.ams", { label: "swp52", labelAt: 0.3 }],
      [L1, "acme-web1", { label: "swp1" }],
    ],
  );
  const cfgTable = (title: string, lines: Line[]) => ({ title, head: ["section", "setting"], rows: lines as Cell[][] });
  const running: Line[] = rendered(true);
  const diffTable = (rows: Cell[][]) => ({ title: "diff: running → intended", head: ["", "section", "change"], rows, tones: rows.map((r) => (r[0] === "−" ? ("danger" as const) : ("compare" as const))) });

  fab.set({ loop: "source of truth → render → diff → apply → verify" });
  fab.note(
    `Meridian's intent loop for one switch, leaf1.ams (small example, two of its uplinks shown). The source of truth holds what the network should be; the automation server at ${AUTOMATION_IP} renders that into configuration and compares it with what leaf1 is really running, which it reads over the out-of-band management network at ${mgmt(L1)}.`,
    "topology",
  );

  fab.tone("sot", "active");
  fab.table(0, {
    title: "source of truth: leaf1.ams",
    head: ["object", "data"],
    rows: [
      ["device", "leaf1.ams, role leaf, site ams"],
      ["loopback", "10.255.1.11/32 (also its VTEP)"],
      ["fabric links", "swp51 → spine1.ams, swp52 → spine2.ams, MTU 9216, IS-IS metric 10"],
      ["segment Acme", "VLAN 100 = L2VNI 10100 on swp1"],
      ["segment Acme staging", "VLAN 300 = L2VNI 10102 on swp5"],
    ],
  });
  fab.note(
    `The source of truth stores data, not configuration text: leaf1.ams is a leaf in ams with loopback 10.255.1.11, two fabric links at MTU 9216, and two Acme segments, VLAN 100 as VNI 10100 on port swp1 and a staging segment, VLAN 300 as VNI 10102 on port swp5.`,
    "intent",
  );

  fab.tone("sot", undefined);
  fab.tone("automation", "active");
  fab.table(1, cfgTable("rendered from the source of truth", rendered(true)));
  fab.note(
    `A template turns that data into eight lines of configuration, shown here in a vendor-neutral form. Rendering is a pure function, so the same data always produces the same text: it can be unit-tested, and rerun at any time without touching a device.`,
    "render",
  );

  fab.table(0, cfgTable("rendered (intended)", rendered(true)));
  fab.table(1, cfgTable("running on leaf1.ams", running));
  fab.set({ "diff lines": 0 });
  fab.state(L1, "in sync", "done");
  fab.send(
    L1,
    "automation",
    "running config, 8 lines",
    `On an ordinary night the automation reads leaf1.ams's running configuration through its API and compares it with the render, line by line. They match, so the diff is empty: the device runs exactly what the source of truth says.`,
  );

  running[3] = ["swp52 (spine2)", "mtu 9216, isis metric 1000"];
  fab.table(1, cfgTable("running on leaf1.ams", running));
  fab.rowTone(1, 3, "compare");
  fab.linkSet(L1, "spine2.ams", { label: "metric 1000", tone: "compare" });
  fab.state(L1, "drift: 1 line", "compare");
  fab.set({ "diff lines": 1 });
  fab.note(
    `During an incident yesterday, an engineer fighting errors on swp52's optic raised its IS-IS metric to 1000 by hand, so that leaf1.ams would stop sending traffic over that link. Tonight's diff finds a value on the device that differs from what the source of truth renders: that is drift.`,
    "drift",
  );

  fab.set({ "drift decision": "revert: optic replaced this morning" });
  fab.note(
    `Drift has two possible fixes: put the device back to the intent, or change the intent to match the device, and a person decides which. The optic on swp52 was replaced this morning, so the override is stale and its owner approves reverting it.`,
    "triage",
  );

  fab.tone("sot", "active");
  fab.table(0, cfgTable("rendered (intended)", rendered(false)));
  fab.rowTone(1, (r) => r[0] === "vlan 300" || r[0] === "swp5", "danger");
  fab.set({ "source of truth change": "delete segment Acme staging (VLAN 300, VNI 10102)" });
  fab.note(
    `Acme retires its staging segment, so the VLAN 300 record is deleted from the source of truth and the template now renders six lines instead of eight. The two staging lines are simply absent, because a template can only describe what exists, never what used to.`,
    "intent",
  );

  fab.tone("sot", undefined);
  fab.table(0, diffTable([["~", "swp52 (spine2)", "isis metric 1000 → 10"], ["−", "vlan 300", "remove vni 10102"], ["−", "swp5", "remove access vlan 300"]]));
  fab.state(L1, "diff: 3 lines", "compare");
  fab.set({ "diff lines": 3 });
  fab.note(
    `The diff from running to intended has three entries: change swp52's metric from 1000 back to 10, and remove the vlan 300 and swp5 lines. Two of the three are deletions, and deletions are exactly what the rendered text cannot express.`,
    "diff",
  );

  fab.send(
    "automation",
    L1,
    "merge: 6 rendered lines",
    `The automation pushes the six rendered lines in merge mode (NETCONF's default edit operation, a gNMI update, an NVUE patch): the device adds or overwrites every setting the payload names and leaves everything else alone.`,
    { tag: "merge" },
  );

  running[3] = ["swp52 (spine2)", "mtu 9216, isis metric 10"];
  fab.table(1, cfgTable("running on leaf1.ams", running));
  fab.rowTone(1, (r) => r[0] === "vlan 300" || r[0] === "swp5", "danger");
  fab.rowTone(1, 3, "done");
  fab.table(0, diffTable([["−", "vlan 300", "remove vni 10102"], ["−", "swp5", "remove access vlan 300"]]));
  fab.linkSet(L1, "spine2.ams", { label: "swp52", tone: undefined });
  fab.state(L1, "diff: 2 lines", "danger");
  fab.set({ "push result": "OK (merge)", "diff lines": 2 });
  fab.unset("drift decision");
  fab.note(
    `The push reports success and swp52's metric is back to 10, but vlan 300 and swp5 are still configured, because nothing in the payload mentioned them. leaf1.ams keeps advertising an EVPN type-3 route for VNI 10102 with route target 65000:10102, and if that VNI is ever reused for another tenant, port swp5 joins that tenant's segment.`,
    "merged",
  );

  fab.send(
    "automation",
    L1,
    "replace: full config, 6 lines",
    `There are two ways out: send each deletion explicitly (a NETCONF delete operation, a gNMI delete path, an NVUE unset), or push in replace mode (a NETCONF replace operation, a gNMI replace, an NVUE config replace), where the payload is the complete configuration and the device deletes anything it does not contain. The automation sends the same six lines as a replace.`,
    { tag: "replace" },
  );

  running.splice(6, 2);
  fab.table(0, cfgTable("rendered (intended)", rendered(false)));
  fab.table(1, cfgTable("running on leaf1.ams", running));
  fab.state(L1, "in sync", "done");
  fab.set({ "push result": "OK (replace)", "diff lines": 0 });
  fab.unset("source of truth change");
  fab.note(
    `leaf1.ams computed the two deletions itself: vlan 300 and swp5 are gone, its type-3 route for VNI 10102 is withdrawn, and the diff is empty. Replace is only safe on the parts of the configuration the source of truth fully models, so tools scope it to those sections and merge where another team owns the rest.`,
    "replaced",
  );

  fab.tone("automation", "done");
  fab.unset("push result");
  fab.set({ "changes pushed": 0 });
  fab.send(
    L1,
    "automation",
    "running config, 6 lines",
    `An hour later the loop runs again: same data, same render, an empty diff, so nothing is pushed. That is idempotency, and it is what lets the loop run continuously: a non-empty diff is always drift or a pending change, never noise.`,
    { tag: "idempotent" },
  );
  return fab.f.done();
};

// ---------- netconf-commit ----------

/**
 * `netconf-commit` (lesson 08-02). The automation server (172.16.0.20) changes
 * leaf1.ams's management access list MGMT-IN over NETCONF (SSH, TCP 830) on
 * the out-of-band network: hello and capabilities (session-id 42), lock the
 * candidate, edit-config into the candidate, validate, then commit with
 * `confirmed`, confirm-timeout 120 s and a persist token. The header stack
 * shows TCP, SSH and the NETCONF RPC of each step.
 *
 * Default run: the edit has a typo (172.16.0.2/32 instead of 172.16.0.20/32),
 * validation passes because the value is well formed, the commit locks the
 * automation out, its session is lost and a reconnect is refused; at 120 s the
 * device rolls back to revision r41 by itself; a new session confirms the
 * rollback, and the frame after shows the pre-commit check that would have
 * caught it.
 *
 * Inputs: `variant: "confirm"` runs the happy path instead: the edit is
 * correct, the verification get succeeds, a confirming commit (persist-id)
 * makes r42 permanent, then unlock and close-session. 12 frames by default, 10
 * with the variant.
 */
export const netconfCommit: FabGen = (input) => {
  const ok = pick(input.variant, ["rollback", "confirm"] as const, "rollback") === "confirm";
  const L1 = "leaf1.ams";
  const fab = new Fab(
    [
      { id: "automation", label: "automation", kind: "controller", x: 10, y: 50, state: AUTOMATION_IP },
      { id: "mgmt-sw", label: "mgmt switch", kind: "switch", x: 50, y: 50, state: "OOB" },
      { id: L1, kind: "leaf", x: 90, y: 50, state: "running r41" },
    ],
    [
      ["automation", "mgmt-sw", { dashed: true }],
      ["mgmt-sw", L1, { dashed: true, label: `eth0 ${mgmt(L1)}` }],
    ],
    { height: 170 },
  );
  const OLD = "172.16.0.0/24, 172.16.10.0/24";
  const NEW = ok ? "172.16.0.20/32, 172.16.10.0/24" : "172.16.0.2/32, 172.16.10.0/24";
  const stores = (running: string, runRev: string, candidate: string, lock: string) => ({
    title: "leaf1.ams datastores",
    head: ["datastore", "MGMT-IN permits", "state"],
    rows: [
      ["running", running, runRev],
      ["candidate", candidate, lock],
    ],
  });
  const rpc = (id: number | string, op: string, detail: string): HeaderSpec => ({ name: "NETCONF", size: "XML", reader: "leaf1.ams NETCONF server", fields: { "message-id": id, operation: op, detail } });
  /** TCP and SSH under each RPC; `reply` flips the direction (leaf1.ams → automation). */
  const transport = (sport: number, reply = false): HeaderSpec[] => [
    { name: "TCP", size: 20, reader: "both ends", fields: reply ? { src: `${mgmt(L1)}:830`, dst: `${AUTOMATION_IP}:${sport}` } : { src: `${AUTOMATION_IP}:${sport}`, dst: `${mgmt(L1)}:830` } },
    { name: "SSH", reader: "both ends (encrypted)", fields: { channel: "subsystem netconf" } },
  ];
  // Both packet legs (automation → mgmt switch → leaf1) in one frame.
  const toLeaf = (label: string, note: string, opts: { lost?: boolean; tag?: string } = {}) =>
    fab.packets(
      [
        { from: "automation", to: "mgmt-sw", label, progress: 0.6 },
        { from: "mgmt-sw", to: L1, label, progress: opts.lost ? 0.85 : 0.6, lost: opts.lost },
      ],
      note,
      opts.tag ?? "rpc",
    );
  const fromLeaf = (label: string, note: string, tag = "reply") =>
    fab.packets(
      [
        { from: L1, to: "mgmt-sw", label, progress: 0.6, tone: "done" },
        { from: "mgmt-sw", to: "automation", label, progress: 0.6, tone: "done" },
      ],
      note,
      tag,
    );

  fab.table(0, stores(OLD, "r41", OLD, "unlocked"));
  fab.set({ change: `MGMT-IN: allow only ${AUTOMATION_IP}/32 and the jump hosts` });
  fab.note(
    `The automation server (${AUTOMATION_IP}) will tighten leaf1.ams's management access list, MGMT-IN, over the out-of-band network using NETCONF. leaf1's running configuration is revision r41, whose MGMT-IN admits 172.16.0.0/24, the automation subnet, and 172.16.10.0/24, the engineers' jump hosts.`,
    "topology",
  );

  fab.headers([...transport(53120, true), { name: "NETCONF", size: "XML", reader: "both ends", fields: { "message-id": "none", operation: "hello", detail: "session-id 42" } }], "server hello");
  fab.table(1, {
    title: "capabilities in leaf1.ams's hello",
    head: ["capability", "means"],
    rows: [
      [":base:1.1", "NETCONF 1.1 framing"],
      [":candidate", "a scratch datastore to edit"],
      [":validate:1.1", "check before commit"],
      [":confirmed-commit:1.1", "commit with a rollback timer"],
    ],
  });
  fromLeaf(
    "hello, session-id 42",
    `The automation opens SSH to TCP port 830 and asks for the netconf subsystem; both sides send a hello listing their capabilities, and leaf1.ams assigns session-id 42. The ones this change relies on are :candidate, :validate and :confirmed-commit.`,
    "hello",
  );

  fab.table(1, undefined);
  fab.table(0, stores(OLD, "r41", OLD, "locked by session 42"));
  fab.headers([...transport(53120), rpc(101, "lock", "target candidate")], "RPC 101");
  toLeaf(
    "rpc 101 lock",
    `RPC 101 locks the candidate datastore, so no other session, neither another automation job nor an engineer at the CLI, can edit it until session 42 unlocks it or ends. leaf1.ams replies ok.`,
  );

  fab.table(0, stores(OLD, "r41", NEW, "locked by session 42"));
  fab.rowTone(0, 1, "compare");
  fab.headers([...transport(53120), rpc(102, "edit-config", "target candidate, replace MGMT-IN")], "RPC 102");
  toLeaf(
    "rpc 102 edit-config",
    ok
      ? `RPC 102, edit-config, replaces MGMT-IN's entries in the candidate with 172.16.0.20/32 and 172.16.10.0/24. Running is untouched, so nothing on the device behaves differently yet.`
      : `RPC 102, edit-config, replaces MGMT-IN's entries in the candidate only. The intended entry was 172.16.0.20/32, but the input had a typo, 172.16.0.2/32; running is untouched, so nothing on the device behaves differently yet.`,
  );

  fab.headers([...transport(53120), rpc(103, "validate", "source candidate")], "RPC 103");
  toLeaf(
    "rpc 103 validate",
    ok
      ? `RPC 103 asks leaf1.ams to validate the candidate: every value matches its YANG type, every reference resolves and no mandatory leaf is missing, so the answer is ok. Validation proves the configuration is well formed, not that it does what was meant.`
      : `RPC 103 asks leaf1.ams to validate the candidate: every value matches its YANG type, every reference resolves and no mandatory leaf is missing, so the answer is ok. Validation proves the configuration is well formed, not that it is safe: 172.16.0.2/32 is a perfectly valid prefix.`,
  );

  fab.table(0, { ...stores(NEW, "r42 (unconfirmed)", NEW, "locked by session 42"), tones: ["compare", undefined] });
  fab.state(L1, "r42, 120 s", "compare");
  fab.set({ "confirm timer": "120 s", "rollback point": "r41" });
  fab.headers([...transport(53120), rpc(104, "commit", "confirmed, confirm-timeout 120, persist chg-4711")], "RPC 104");
  toLeaf(
    "rpc 104 commit confirmed",
    `RPC 104 commits with confirmed, a confirm-timeout of 120 seconds and the persist token chg-4711: the candidate becomes running revision r42, and leaf1.ams keeps r41 as a rollback point. Unless a confirming commit arrives within 120 seconds, the device will put r41 back by itself.`,
    { tag: "commit" },
  );

  if (ok) {
    fab.state(L1, "r42, 117 s", "compare");
    fab.set({ "confirm timer": "117 s" });
    fab.headers([...transport(53120, true), rpc(105, "rpc-reply", "MGMT-IN entries and hit counters")], "reply to RPC 105");
    fromLeaf(
      "rpc-reply 105",
      `r42 is in force and MGMT-IN still admits 172.16.0.20, so the automation's verification works: RPC 105, a get, returns the new list, whose first entry, 172.16.0.20/32, is counting hits from this very session. The automation also checks from the jump host subnet that engineers can still log in.`,
      "verify",
    );

    fab.table(0, stores(NEW, "r42", NEW, "locked by session 42"));
    fab.state(L1, "running r42", "done");
    fab.set({ "confirm timer": "cancelled at 109 s" });
    fab.unset("rollback point");
    fab.headers([...transport(53120), rpc(106, "commit", "persist-id chg-4711 (confirming)")], "RPC 106");
    toLeaf(
      "rpc 106 commit",
      `With 109 seconds left, RPC 106 is a plain commit carrying persist-id chg-4711: the confirming commit. leaf1.ams cancels the rollback timer and r42 becomes permanent.`,
      { tag: "confirm" },
    );

    fab.table(0, stores(NEW, "r42", NEW, "unlocked"));
    fab.headers([...transport(53120), rpc(107, "unlock, close-session", "target candidate")], "RPC 107 and 108");
    toLeaf(
      "unlock, close-session",
      `RPCs 107 and 108 unlock the candidate and close session 42 cleanly. The change took two commits on purpose: the first was a trial with a deadline, the second the decision to keep it, made only after the device proved it was still reachable.`,
      { tag: "done" },
    );

    fab.headers(undefined);
    fab.unset("confirm timer");
    fab.set({ result: "r42 committed and confirmed" });
    fab.note(
      `Had the verification failed, the automation would simply not send the confirming commit and leaf1.ams would return to r41 after 120 seconds. That is why automation uses confirmed commit for every change that could cut off its own access: the safe outcome needs no action at all.`,
      "done",
    );
    return fab.f.done();
  }

  fab.state(L1, "r42, 117 s", "danger");
  fab.state("automation", "no reply", "danger");
  fab.set({ "confirm timer": "117 s" });
  fab.headers([...transport(53120), rpc(105, "get", "MGMT-IN state and counters")], "RPC 105");
  toLeaf(
    "rpc 105 get",
    `r42 is now in force, and MGMT-IN no longer admits 172.16.0.20. The automation's next RPC, a get to verify the change, is dropped by leaf1.ams's own management access list, and so is every TCP acknowledgement on session 42.`,
    { lost: true, tag: "lockout" },
  );

  fab.table(0, stores(NEW, "r42 (unconfirmed)", NEW, "released"));
  fab.rowTone(0, 0, "danger");
  fab.state(L1, "r42, 87 s", "danger");
  fab.state("automation", "session lost", "danger");
  fab.set({ "confirm timer": "87 s", session: "42 lost" });
  fab.headers(undefined);
  fab.note(
    `After 30 seconds without a reply the automation declares session 42 lost; leaf1.ams times the session out too, which releases its candidate lock. Without persist, RFC 6241 would roll back the moment the session ended; with it the timer keeps running, so a new session presenting chg-4711 could still confirm.`,
    "lost",
  );

  fab.state(L1, "r42, 60 s", "danger");
  fab.set({ "confirm timer": "60 s" });
  fab.headers([{ name: "TCP", size: 20, reader: "leaf1.ams MGMT-IN", fields: { src: `${AUTOMATION_IP}:53188`, dst: `${mgmt(L1)}:830`, flags: "SYN" } }], "reconnect attempt");
  toLeaf(
    "TCP SYN to 830",
    `The automation tries to open a new session to send the confirming commit, but its SYN to port 830 is dropped by the same access list. The tool that holds the persist token can no longer reach the device, which is exactly the situation confirmed commit was designed for.`,
    { lost: true, tag: "lockout" },
  );

  fab.headers(undefined);
  fab.table(0, { ...stores(OLD, "r41 (rolled back)", OLD, "unlocked"), tones: ["done", undefined] });
  fab.state(L1, "rolled back r41", "done");
  fab.set({ "confirm timer": "expired", session: "none" });
  fab.unset("rollback point");
  fab.log("leaf1.ams: confirmed commit timed out, configuration rolled back to r41");
  fab.note(
    `At 120 seconds with no confirming commit, leaf1.ams restores revision r41 on its own and logs that the confirmed commit timed out. MGMT-IN admits 172.16.0.0/24 again, two minutes after the mistake, with nobody at the console.`,
    "rollback",
  );

  fab.state("automation", "change failed", "compare");
  fab.set({ session: "43", result: "change failed, rolled back to r41" });
  fab.unset("confirm timer");
  fab.headers([...transport(53204, true), rpc(201, "rpc-reply", "running = r41")], "session 43, reply to get-config");
  fromLeaf(
    "rpc-reply: running r41",
    `The automation's next attempt connects as session 43, reads running, finds r41 instead of r42 and marks the change failed and rolled back, with the diff attached for a person. Without confirmed commit, r42 would have stayed, with every automation job failing against leaf1.ams, until an engineer noticed and fixed it by hand from a jump host; had the change cut off the jump hosts as well, only the serial console would have been left, which at a remote site can take hours.`,
    "recovered",
  );

  fab.headers(undefined);
  fab.state("automation", AUTOMATION_IP, undefined);
  fab.table(1, {
    title: "pre-commit checks the tool should run",
    head: ["check", "result"],
    rows: [
      ["candidate MGMT-IN admits 172.16.0.20 (this tool)", "FAIL: only 172.16.0.2/32"],
      ["candidate MGMT-IN admits 172.16.10.0/24 (jump hosts)", "pass"],
    ],
    tones: ["danger", "done"],
  });
  fab.note(
    `A cheap check would have caught this before any commit: does the candidate MGMT-IN still admit the tool's own address, 172.16.0.20? Checks catch the mistakes someone thought of; confirmed commit is the safety net for the rest.`,
    "done",
  );
  return fab.f.done();
};

// ---------- telemetry-blind ----------

/**
 * `telemetry-blind` (lesson 08-03; also 08-05's "telemetry gone quiet"). The
 * collector 10.250.1.10 behind leaf4.ams holds a gNMI dial-in subscription to
 * every device (TCP 9339, STREAM mode, interface counters SAMPLEd every 10 s,
 * oper-status ON_CHANGE); the telemetry rides the data network, while an OOB
 * monitor reaches each device's management port through a separate management
 * switch. Small example: two spines, leaves leaf2.ams and leaf4.ams.
 *
 * Default run ("congested"): at 10:00:05 a Globex batch job saturates
 * leaf2.ams's uplinks; its telemetry (DSCP 0, best-effort queue) is tail-
 * dropped, the stream stalls, and after three missed samples the collector
 * raises an absence-of-data alert. The gNMI keepalive cannot discriminate (same
 * path); the OOB heartbeat answers in 0.6 ms (alive) and the spines, whose own
 * telemetry still flows, report the links up, IS-IS adjacencies up and 99.8%
 * receive utilisation from leaf2 (congested). Verdict "alive, telemetry blind";
 * when the job ends the stream resumes with a 4-minute gap in its timestamps;
 * the durable fix marks telemetry CS2 into a protected queue. The chart plots
 * leaf2's uplink utilisation as leaf2 reports it (a gap) and as spine1 reports
 * it (the saturation).
 *
 * Inputs: `variant: "dead"`: leaf2.ams loses power instead; the OOB ping times
 * out and the spines report loss of signal and IS-IS adjacencies down, so the
 * verdict is "dead". 9 frames by default, 8 with the variant.
 */
export const telemetryBlind: FabGen = (input) => {
  const dead = pick(input.variant, ["congested", "dead"] as const, "congested") === "dead";
  const L2 = "leaf2.ams";
  const L4 = "leaf4.ams";
  const S1 = "spine1.ams";
  const S2 = "spine2.ams";
  const fab = new Fab(
    [
      { id: S1, kind: "spine", x: 38, y: 0 },
      { id: S2, kind: "spine", x: 78, y: 0 },
      { id: "mgmt-sw", label: "mgmt switch", kind: "switch", x: 8, y: 50 },
      { id: L2, kind: "leaf", x: 38, y: 50, state: "streaming" },
      { id: L4, kind: "leaf", x: 78, y: 50 },
      { id: "oob-mon", label: "OOB monitor", kind: "collector", x: 8, y: 100 },
      { id: "globex", label: "Globex servers", kind: "server", x: 38, y: 100 },
      { id: "collector", label: "collector", kind: "collector", x: 78, y: 100, state: "10.250.1.10" },
    ],
    [
      [L2, S1],
      [L2, S2],
      [L4, S1],
      [L4, S2],
      [L2, "globex"],
      [L4, "collector"],
      ["mgmt-sw", L2, { dashed: true, label: mgmt(L2) }],
      ["mgmt-sw", "oob-mon", { dashed: true }],
    ],
    { height: 300 },
  );
  const path = [L2, S1, L4, "collector"];
  const devices = [L2, S1, S2, L4];
  const collectorView = (last: Record<string, string>, status: Record<string, string>) => ({
    title: "collector: gNMI subscriptions",
    head: ["device", "last sample", "status"],
    rows: devices.map((d) => [d, last[d] ?? "10:00:00", status[d] ?? "streaming"]),
  });
  const SIGNALS = ["gNMI keepalive (same path)", "OOB ping to 172.16.1.12", "spines: link and IS-IS adjacency", "spines: receive load from leaf2"];
  const evidence = (observed: string[]) => ({
    title: "dead or congested?",
    head: ["signal", "if dead", "if congested", "observed"],
    rows: SIGNALS.map((s, i) => [s, ["no answer", "no reply", "down", "0"][i]!, ["no answer", "replies", "up", "near 100%"][i]!, observed[i] ?? "?"]),
  });
  fab.chart({
    title: "leaf2.ams → spine1.ams link utilisation",
    unit: "%",
    yMax: 100,
    xLabel: "10 s samples",
    series: [
      { name: "reported by leaf2", tone: "active" },
      { name: "reported by spine1", tone: "compare" },
    ],
  });

  // 10:00:00, everything streaming.
  fab.point({ "reported by leaf2": 38, "reported by spine1": 38 });
  fab.table(0, collectorView({}, {}));
  fab.headers(
    [
      { name: "IPv4", size: 20, reader: "every router; DSCP picks the queue", fields: { src: loopback(L2), dst: "10.250.1.10", DSCP: "0 (best effort)" }, highlight: ["DSCP"] },
      { name: "TCP", size: 20, reader: "collector", fields: { "src port": 9339, "dst port": 51800 } },
      { name: "gRPC over HTTP/2 + TLS", reader: "collector", fields: { method: "gNMI Subscribe", mode: "STREAM" } },
      { name: "gNMI Notification", reader: "collector", fields: { timestamp: "10:00:00.000", path: "/interfaces/interface[name=swp51]/state/counters", "out-octets": "1904331822190" } },
    ],
    "leaf2.ams → collector",
  );
  fab.packets(
    path.slice(0, -1).map((from, i) => ({ from, to: path[i + 1]!, label: "counters 10:00:00", progress: 0.55 })),
    `Meridian's collector, 10.250.1.10 behind leaf4.ams, holds a gNMI subscription to every device (dial-in: the collector opened each session to the device's gNMI port, 9339): leaf2.ams streams its interface counters every 10 seconds over the data network, from its loopback 10.255.1.12 through spine1.ams. A separate OOB monitor reaches each device's management port, here 172.16.1.12, through the out-of-band management switch (small example: two spines, two leaves).`,
    "stream",
  );

  fab.headers(undefined);
  if (dead) {
    fab.state(L2, "no power", "danger");
    fab.down(L2, S1);
    fab.down(L2, S2);
    fab.down(L2, "globex");
    fab.down("mgmt-sw", L2);
    fab.point({ "reported by leaf2": null, "reported by spine1": 0 });
    fab.note(
      `At 10:00:05 leaf2.ams loses power. Its gNMI stream stops mid-sample, and so does everything else it was sending.`,
      "cause",
    );
  } else {
    fab.state(L2, "uplinks 100%", "danger");
    fab.state("globex", "batch job", "active");
    for (const s of [S1, S2]) fab.linkSet(L2, s, { width: 1, tone: "danger", label: "100%", labelAt: 0.35 });
    fab.point({ "reported by leaf2": null, "reported by spine1": 99.8 });
    fab.packets(
      [{ from: L2, to: S1, label: "counters 10:00:10", lost: true, progress: 0.4 }],
      `At 10:00:05 a Globex batch job starts offering about 1.1 Tb/s towards the spines, more than leaf2.ams's 800 Gb/s of uplink. The telemetry is marked DSCP 0, so it waits in the same best-effort queue as the job and is tail-dropped with it; TCP backs off after each loss and the stream stalls.`,
      "cause",
    );
  }

  fab.point({ "reported by leaf2": null, "reported by spine1": dead ? 0 : 99.8 });
  fab.point({ "reported by leaf2": null, "reported by spine1": dead ? 0 : 99.8 });
  fab.table(0, collectorView({ [S1]: "10:00:30", [S2]: "10:00:30", [L4]: "10:00:30" }, { [L2]: "NO DATA 30 s" }));
  fab.rowTone(0, 0, "danger");
  fab.tone("collector", "danger");
  fab.state("collector", "alert: no data");
  fab.note(
    `At 10:00:30 the collector has missed three samples in a row from leaf2.ams and raises an absence-of-data alert. Without it nothing would fire: there is no bad value to alert on, and the dashboard would keep showing leaf2's last values from 10:00:00 as if they were current.`,
    "absence",
  );

  fab.tone("collector", "active");
  fab.state("collector", "triage");
  fab.table(1, evidence(["no answer"]));
  fab.rowTone(1, 0, "muted");
  fab.note(
    `Is leaf2.ams dead, or alive but unable to get its data out? The gNMI session's own keepalive (an HTTP/2 ping) goes unanswered either way, because it travels the same path as the data, so it cannot tell the two apart.`,
    "question",
  );

  fab.table(1, evidence(["no answer", dead ? "no reply" : "replies, 0.6 ms"]));
  fab.rowTone(1, 0, "muted");
  fab.rowTone(1, 1, dead ? "danger" : "done");
  fab.packets(
    [
      { from: "oob-mon", to: "mgmt-sw", label: "ping 172.16.1.12", progress: 0.6, tone: dead ? "active" : "done" },
      { from: "mgmt-sw", to: L2, label: "ping 172.16.1.12", progress: 0.6, lost: dead, tone: dead ? "active" : "done" },
    ],
    dead
      ? `The OOB monitor pings leaf2.ams's management port, 172.16.1.12, over the separate management network, and three echoes in a row time out after a second each. Every other device on the same management switch answers, so the problem is leaf2.ams itself, not the management network.`
      : `The OOB monitor pings leaf2.ams's management port, 172.16.1.12, over the separate management network, which the batch job never touches: the reply comes back in 0.6 ms. The device is powered, its operating system is running and its CPU answers.`,
    "heartbeat",
  );

  fab.table(1, evidence(["no answer", dead ? "no reply" : "replies, 0.6 ms", dead ? "down since 10:00:05" : "up, adjacency Up", dead ? "0" : "399 of 400 Gb/s"]));
  fab.rowTone(1, 0, "muted");
  fab.rowTone(1, (_r, i) => i > 0, dead ? "danger" : "done");
  fab.tones([S1, S2], "compare");
  fab.state(S1, dead ? "swp2 down" : "rx 99.8%");
  fab.state(S2, dead ? "swp2 down" : "rx 99.8%");
  fab.note(
    dead
      ? `Its neighbours, whose own telemetry still flows, saw it go: spine1.ams and spine2.ams lost signal on their ports to leaf2 at 10:00:05, their IS-IS adjacencies to leaf2.ams are down, and LLDP no longer lists it.`
      : `Its neighbours, whose own telemetry still flows, see the rest: spine1.ams and spine2.ams report their links to leaf2.ams up, their IS-IS adjacencies to it Up, and 399 Gb/s arriving from it on each 400G port. IS-IS hellos still get through because switches send routing protocol packets in a network-control queue ahead of user traffic.`,
    "neighbours",
  );

  fab.tones([S1, S2], undefined);
  fab.tone("collector", undefined);
  fab.state("collector", "10.250.1.10");
  fab.table(0, collectorView({ [S1]: "10:00:35", [S2]: "10:00:35", [L4]: "10:00:35" }, { [L2]: dead ? "DEAD: page on-call" : "ALIVE, telemetry blind" }));
  fab.rowTone(0, 0, dead ? "danger" : "compare");
  if (dead) {
    fab.set({ verdict: "dead", action: "page on-call; servers behind leaf2 are cut off unless dual-homed" });
    fab.note(
      `Verdict at 10:00:35: dead, so the platform pages the on-call engineer and ties the alert to the servers behind leaf2.ams, which are cut off unless they are dual-homed to another leaf. The spines had already removed leaf2 from their routing within milliseconds of losing signal.`,
      "verdict",
    );
    fab.note(
      `The two signals together cover the harder cases too: a management port that answers while the neighbours see the adjacency down means the device is up but cut off from the fabric, the gray state in between. A platform that reports streaming, blind but alive, and dead as three states is the one an on-call engineer can trust.`,
      "done",
    );
    return fab.f.done();
  }
  fab.set({ verdict: "alive, uplinks saturated", action: "congestion alert on leaf2.ams uplinks (from spine counters)" });
  fab.note(
    `Verdict at 10:00:35: alive and congested, not dead. The platform shows leaf2.ams as "telemetry blind" rather than down or green, and raises the real problem, saturated uplinks, from the spines' counters, because the device's own telemetry stopped exactly when it had the most important thing to say.`,
    "verdict",
  );

  for (let k = 0; k < 21; k++) fab.point({ "reported by leaf2": null, "reported by spine1": 99.8 });
  fab.point({ "reported by leaf2": 40, "reported by spine1": 40 });
  fab.state("globex", undefined);
  fab.tone("globex", undefined);
  fab.state(L2, "streaming", "done");
  for (const s of [S1, S2]) fab.linkSet(L2, s, { width: 0.4, tone: undefined, label: undefined });
  fab.state(S1, undefined);
  fab.state(S2, undefined);
  fab.table(1, undefined);
  fab.table(0, collectorView({ [L2]: "10:04:10", [S1]: "10:04:10", [S2]: "10:04:10", [L4]: "10:04:10" }, { [L2]: "streaming, missed 10:00:10–10:04:00" }));
  fab.rowTone(0, 0, "compare");
  fab.packets(
    path.slice(0, -1).map((from, i) => ({ from, to: path[i + 1]!, label: "counters 10:04:10", progress: 0.55, tone: "done" as const })),
    `At 10:04:05 the job finishes. The old session did not survive four minutes of unanswered keepalives, so the collector closed it and kept re-dialling; now a new subscription comes up and leaf2.ams's samples flow again. The collector records the samples it never received, 10:00:10 to 10:04:00, as a gap from a device known to be alive, never as zeros, so no graph shows a fake dip to idle in the middle of the busiest four minutes.`,
    "resume",
  );

  fab.headers(
    [
      { name: "IPv4", size: 20, reader: "every router; DSCP picks the queue", fields: { src: loopback(L2), dst: "10.250.1.10", DSCP: "16 (CS2, OAM)" }, highlight: ["DSCP"] },
      { name: "TCP", size: 20, reader: "collector", fields: { "src port": 9339, "dst port": 51864 } },
    ],
    "after the follow-up change (new session)",
  );
  fab.set({ "follow-up": "telemetry marked CS2 into a protected queue" });
  fab.note(
    `The follow-up change marks telemetry DSCP 16 (CS2, the class set aside for operations and management traffic) and gives that class its own queue with a guaranteed share, so the next saturation cannot silence it. The design rule behind the whole scenario: the bulk of the telemetry rides the data network, but heartbeats and the alert path ride out of band, so the platform can always say "I am blind here".`,
    "done",
  );
  return fab.f.done();
};

// ---------- probe-localisation ----------

const PROBE_PORTS = Array.from({ length: 16 }, (_, i) => 50001 + i);
const TWAMP_PORT = 862;
const proberIp = (leaf: string): string => `10.250.${10 + Number(/^leaf(\d+)/.exec(leaf)![1])}.10`;
const probeHash = (src: string, dst: string, sport: number): number => fnv32(`${src}|${dst}|17|${sport}|${TWAMP_PORT}`);
/** Forward loss per degraded stream, in packets of 3,000 (five minutes at 10 packets a second). */
const BAD_LOSS = [117, 123, 114, 119, 121];
const pctOf = (lost: number, sent: number): string => `${(Math.round((lost / sent) * 10000) / 100).toFixed(2)}%`;

/**
 * `probe-localisation` (lessons 08-04 and 08-05). Acme reports that some
 * requests from leaf1.ams's racks to leaf3.ams's are slow. Meridian's
 * Amsterdam fabric with all four spines; probe agents 10.250.11.10 (behind
 * leaf1.ams), 10.250.12.10 (leaf2.ams) and 10.250.13.10 (leaf3.ams). The fault:
 * one receive lane of leaf3.ams's optic on the spine3.ams link (leaf3 swp53,
 * spine3 swp3) has degraded, so about 3.9% of frames arriving on it fail the
 * frame check while the link stays up.
 *
 * Story: ping (one 5-tuple, one path, through spine1) says 0% loss; 16
 * TWAMP-light streams to UDP 862 differing only in source port (50001-50016)
 * hash over the four spines (FNV-1a stands in for the ASIC hash) and are mapped
 * to their spine with same-5-tuple TTL-2 probes; after five minutes the three
 * streams through spine3 lose about 4% (forward direction) and the rest
 * nothing; grouping by spine names spine3, a second leaf pair triangulates the
 * spine3 → leaf3 link, its counters (FCS errors, one weak optic lane) confirm,
 * and costing the link out rehashes the streams over three spines with zero
 * loss.
 *
 * Inputs: none. 10 frames.
 */
export const probeLocalisation: FabGen = () => {
  const spines = [1, 2, 3, 4].map((n) => `spine${n}.ams`);
  const L1 = "leaf1.ams";
  const L2 = "leaf2.ams";
  const L3 = "leaf3.ams";
  const BAD = "spine3.ams";
  const leaves = [L1, L2, L3];
  const prober = (leaf: string) => `probe-${short(leaf)}`;
  const fab = new Fab(
    [
      ...spines.map((id, i) => ({ id, kind: "spine" as const, x: 12.5 + 25 * i, y: 0 })),
      ...leaves.map((id, i) => ({ id, kind: "leaf" as const, x: 12.5 + 37.5 * i, y: 50, tone: id === L2 ? ("muted" as const) : undefined })),
      ...leaves.map((l, i) => ({ id: prober(l), label: "prober", kind: "server" as const, x: 12.5 + 37.5 * i, y: 100, state: proberIp(l), tone: l === L2 ? ("muted" as const) : undefined })),
    ],
    [...leaves.flatMap((l) => spines.map((s) => [l, s, l === L2 ? { tone: "muted" as const } : {}] as [string, string, { tone?: "muted" }])), ...leaves.map((l) => [prober(l), l] as [string, string])],
    { height: 300 },
  );
  const src = proberIp(L1);
  const dst = proberIp(L3);
  const spineOf = (from: string, to: string, sport: number, alive = spines) => alive[probeHash(proberIp(from), proberIp(to), sport) % alive.length]!;
  const streams = PROBE_PORTS.map((p, i) => ({ n: i + 1, sport: p, spine: spineOf(L1, L3, p) }));
  // Loss in the leaf1 → leaf3 direction: the spine3 streams lose ~4%; one other stream lost a single packet (noise).
  let bad = 0;
  const loss = streams.map((s) => (s.spine === BAD ? BAD_LOSS[bad++ % BAD_LOSS.length]! : s.n === 2 ? 1 : 0));
  const badCount = streams.filter((s) => s.spine === BAD).length;
  const perSpine = spines.map((sp) => streams.filter((s) => s.spine === sp).length);
  const probeTable = (cols: "unknown" | "mapped" | "results") => ({
    title: `TWAMP-light streams ${src} → ${dst}, UDP ${TWAMP_PORT}`,
    head: ["#", "src port", "spine", "fwd loss", "p99 RTT"],
    rows: streams.map((s, i) => [s.n, s.sport, cols === "unknown" ? "?" : short(s.spine), cols === "results" ? pctOf(loss[i]!, 3000) : "…", cols === "results" ? "61 µs" : "…"]),
    tones: cols === "results" ? streams.map((s) => (s.spine === BAD ? ("danger" as const) : undefined)) : undefined,
  });

  fab.tones([L1, L3], "active");
  fab.note(
    `Acme reports that some requests from its web servers behind leaf1.ams to its databases behind leaf3.ams are slow, intermittently, while others are fine. Meridian's Amsterdam fabric, here with all four spines, has a probe agent behind each leaf: ${src} behind leaf1.ams and ${dst} behind leaf3.ams.`,
    "topology",
  );

  const pingSpine = spines[fnv32(`${src}|${dst}|1`) % spines.length]!;
  fab.path([prober(L1), L1, pingSpine, L3, prober(L3)]);
  fab.table(0, { title: `ping ${dst} from ${src}`, head: ["sent", "received", "loss", "RTT avg"], rows: [[100, 100, "0%", "0.052 ms"]], tones: ["done"] });
  fab.packets(
    [
      { from: L1, to: pingSpine, label: "ICMP echo", progress: 0.5 },
      { from: pingSpine, to: L3, label: "ICMP echo", progress: 0.5 },
    ],
    `A ping between the two agents says 100 of 100 replies, 0% loss. But ICMP has no ports, so to the hash every echo between these two addresses looks the same: leaf1.ams sends all of them through one spine, here ${pingSpine}, and ping tested one path out of four.`,
    "ping",
  );

  fab.clearPath();
  fab.table(0, probeTable("unknown"));
  fab.packets(
    spines.map((sp) => ({ from: L1, to: sp, label: `UDP ${TWAMP_PORT}`, progress: 0.45 })),
    `So the agent runs TWAMP Light, the test half of RFC 5357: 16 UDP streams to port ${TWAMP_PORT}, 10 packets a second each, identical except for the source port, ${PROBE_PORTS[0]} to ${PROBE_PORTS[PROBE_PORTS.length - 1]}; the reflector behind leaf3.ams timestamps each packet and returns it with its own sequence number, so loss can be split by direction. A different source port is a different 5-tuple, so leaf1.ams's ECMP hash spreads the streams across the spines.`,
    "probes",
  );

  fab.table(0, probeTable("mapped"));
  fab.set({ "streams per spine": spines.map((sp, i) => `${short(sp)} ${perSpine[i]}`).join(" · ") });
  fab.packets(
    [{ from: BAD, to: L1, label: `Time Exceeded from ${p2p(L1, BAD).spine}`, progress: 0.5, tone: "compare" }],
    `To learn each stream's spine, the agent sends one packet with the stream's exact 5-tuple but TTL 2, which expires at the spine; the ICMP Time Exceeded comes from that spine's address on the link, ${p2p(L1, BAD).spine} for spine3.ams. The hash ignores the TTL, so this packet takes exactly the stream's path: ${perSpine.slice(0, -1).join(", ")} and ${perSpine[perSpine.length - 1]} streams land on spine1 to spine4.`,
    "map",
  );

  const avg = loss.reduce((a, b) => a + b, 0) / (3000 * streams.length);
  fab.table(0, probeTable("results"));
  fab.set({ "streams degraded": `${badCount} of ${streams.length}`, "loss averaged over all streams": `${(Math.round(avg * 1000) / 10).toFixed(1)}%` });
  fab.note(
    `After five minutes, 3,000 packets per stream: ${badCount} streams lost about 4% from leaf1 to leaf3 while their 99th-percentile round-trip time stayed at 61 µs like everyone else's, and the rest lost nothing apart from one packet of noise. Averaged over all 16 streams the loss is ${(Math.round(avg * 1000) / 10).toFixed(1)}%, which is why a single fabric-wide number hides a path that is badly broken.`,
    "results",
  );

  const bySpine = spines.map((sp) => {
    const idx = streams.map((s, i) => (s.spine === sp ? i : -1)).filter((i) => i >= 0);
    const lost = idx.reduce((a, i) => a + loss[i]!, 0);
    return [short(sp), idx.length, pctOf(lost, 3000 * idx.length)];
  });
  fab.table(1, { title: "grouped by spine", head: ["spine", "streams", "fwd loss"], rows: bySpine, tones: spines.map((sp) => (sp === BAD ? ("danger" as const) : undefined)) });
  fab.tone(BAD, "danger");
  fab.path([L1, BAD, L3], "danger");
  fab.note(
    `Grouped by spine, every degraded stream crosses spine3.ams and no stream through another spine is degraded. Acme's own connections hash the same way, so about a quarter of them cross spine3 and suffer retransmissions, which is why the complaint is "sometimes slow" rather than "down".`,
    "group",
  );

  fab.tones([L2, prober(L2)], undefined);
  for (const sp of spines) fab.linkSet(L2, sp, { tone: undefined });
  const viaBad = (from: string, to: string) => PROBE_PORTS.filter((p) => spineOf(from, to, p) === BAD).length;
  const n23 = viaBad(L2, L3);
  const n12 = viaBad(L1, L2);
  const lostVia = (n: number) => Array.from({ length: n }, (_, i) => BAD_LOSS[i % BAD_LOSS.length]!).reduce((a, b) => a + b, 0);
  fab.table(1, {
    title: "streams through spine3.ams, by leaf pair",
    head: ["pair", "links crossed", "streams", "fwd loss"],
    rows: [
      ["leaf1 → leaf3", "leaf1–spine3, spine3–leaf3", badCount, pctOf(lostVia(badCount), 3000 * badCount)],
      ["leaf2 → leaf3", "leaf2–spine3, spine3–leaf3", n23, pctOf(lostVia(n23), 3000 * n23)],
      ["leaf1 → leaf2", "leaf1–spine3, spine3–leaf2", n12, "0.00%"],
    ],
    tones: ["danger", "danger", "done"],
  });
  fab.clearPath();
  fab.tone(BAD, undefined);
  fab.path([BAD, L3], "danger");
  fab.note(
    `Is it spine3.ams itself, or one of its links? Adding the agent behind leaf2.ams gives two more pairs: its ${n23} streams through spine3 to leaf3 also lose about 4%, while ${n12} streams from leaf1 to leaf2 through spine3 lose nothing. The only element every bad path shares and the good path lacks is the link from spine3.ams down to leaf3.ams.`,
    "triangulate",
  );

  fab.table(1, {
    title: "the suspect link, both ends, last 5 minutes",
    head: ["where", "counter", "value"],
    rows: [
      ["spine3.ams swp3 (out)", "frames sent", "3.000 billion"],
      ["leaf3.ams swp53 (in)", "frames received intact", "2.883 billion"],
      ["leaf3.ams swp53 (in)", "FCS errors", "117 million (3.9%)"],
      ["leaf3.ams swp53 (in)", "FEC uncorrectable codewords", "rising"],
      ["leaf3.ams swp53 optic", "receive power, lanes 1-4", "−1.9 / −2.1 / −8.6 / −2.0 dBm"],
      ["both ends", "oper-status", "up"],
    ],
    tones: [undefined, undefined, "danger", "danger", "danger", "compare"],
  });
  fab.state(L3, "FCS errors", "danger");
  fab.note(
    `The counters at the two ends agree: spine3.ams sent 3.000 billion frames on that link in five minutes, and leaf3.ams received 2.883 billion intact and discarded 117 million (3.9%) that failed the frame check. One receive lane of leaf3's optic reads −8.6 dBm against about −2 dBm on the others, too weak for forward error correction to repair every error, yet the link stays up, so ECMP keeps sending it a quarter of the traffic bound for leaf3.`,
    "counters",
  );

  const alive = spines.filter((s) => s !== BAD);
  const after = PROBE_PORTS.map((p) => spineOf(L1, L3, p, alive));
  fab.linkSet(BAD, L3, { tone: "compare", dashed: true, label: "costed out" });
  fab.state(L3, "link costed out", "compare");
  fab.table(0, {
    title: `same streams after the cost-out (hash mod ${alive.length})`,
    head: ["#", "src port", "spine", "fwd loss"],
    rows: streams.map((s, i) => [s.n, s.sport, short(after[i]!), "0.00%"]),
    tones: streams.map(() => "done" as const),
  });
  fab.table(1, { title: `${L1} next hops for leaf3's prefixes`, head: ["next hop", "spine"], rows: alive.map((s) => [p2p(L1, s).spine, short(s)]) });
  fab.set({ "streams degraded": `0 of ${streams.length}` });
  fab.unset("loss averaged over all streams", "streams per spine");
  fab.note(
    `Meridian costs out that one link, raising its IS-IS metric at both ends so no shortest path uses it (a metric only governs traffic leaving its own end, and the damaged direction is spine3 to leaf3; the drain of lesson 08-06), and leaf1.ams's next hops for leaf3's prefixes drop to three spines. The same 16 streams rehash over spine1, spine2 and spine4 and lose nothing, which confirms the diagnosis while the optic replacement is scheduled.`,
    "fix",
  );

  const miss = (3 / 4) ** streams.length;
  fab.set({ "chance a spine gets no stream (16 random ports)": `${(Math.round(miss * 1000) / 10).toFixed(1)}% each` });
  fab.note(
    `Two things made this work: enough distinct 5-tuples to cover every path, and grouping results by the path each probe took. With 16 random source ports and 4 spines a given spine still has a ${(Math.round(miss * 1000) / 10).toFixed(1)}% chance of getting no stream at all, so real probing systems map their paths and fill the gaps deliberately; ping, with its single 5-tuple, would have kept saying 0% loss.`,
    "done",
  );
  return fab.f.done();
};

// ---------- spine-drain ----------

const LINK_GBPS = 400;
const CIRCUIT_GBPS = 100;
const LIMIT = 0.8;
const MAX_USABLE_METRIC = 16_777_214; // 2^24 − 2: the largest wide metric still used by SPF (2^24 − 1 removes the link).

/**
 * `spine-drain` (lesson 08-06). Upgrading spine2.ams's operating system
 * without dropping a packet, on Meridian's Amsterdam fabric (small example: 4
 * spines, 4 leaves, 400G links; spine1.ams and spine2.ams also carry the two
 * 100G long-haul circuits to spine1.sin and spine2.sin, the "square").
 *
 * Pre-check: with one of four spines drained each remaining uplink carries 4/3
 * of its load, and all Amsterdam–Singapore traffic lands on one circuit; at
 * 14:00 leaf3.ams (270 → 360 Gb/s, 90%) and the circuit (2 × 45 → 90 Gb/s,
 * 90%) exceed the 80% limit, so the tool blocks; at 02:00 everything passes
 * (leaf3 165 → 220 Gb/s, circuit 70 Gb/s) along with the state checks. Drain:
 * spine2.ams raises the IS-IS metric on its five links (10 on the leaf links,
 * 52,500 on the circuit) to 16,777,214, leaves drop it from their ECMP groups,
 * traffic moves off hitlessly (chart of leaf3's per-uplink load). Verify empty,
 * reboot (links dark, no impact), verify while still costed out, restore the
 * normal metrics, verify against the
 * pre-check snapshot. (With an eBGP underlay, lesson 03-03, the same drain is
 * done with the GRACEFUL_SHUTDOWN community or AS-path prepending; the IS-IS
 * overload bit is the other common IS-IS way.)
 *
 * Inputs: none. 10 frames.
 */
export const spineDrain: FabGen = () => {
  const spines = [1, 2, 3, 4].map((n) => `spine${n}.ams`);
  const leaves = [1, 2, 3, 4].map((n) => `leaf${n}.ams`);
  const S2 = "spine2.ams";
  const L3 = "leaf3.ams";
  const remote = ["spine1.sin", "spine2.sin"];
  const fab = new Fab(
    [
      ...remote.map((id, i) => ({ id, kind: "spine" as const, x: 12.5 + 25 * i, y: 0 })),
      ...spines.map((id, i) => ({ id, kind: "spine" as const, x: 12.5 + 25 * i, y: 42, state: "metric 10" })),
      ...leaves.map((id, i) => ({ id, kind: "leaf" as const, x: 12.5 + 25 * i, y: 100 })),
    ],
    [
      ["spine1.ams", "spine1.sin", { label: "100G circuit" }],
      [S2, "spine2.sin", { label: "100G circuit" }],
      ...leaves.flatMap((l) => spines.map((s) => [l, s] as [string, string])),
    ],
    { height: 320 },
  );
  const at14 = { leaf: [225, 150, 270, 195], circuit: 45 };
  const at02 = { leaf: [120, 90, 165, 105], circuit: 35 };
  const lim = LINK_GBPS * LIMIT;
  const headroom = (t: typeof at14) => {
    const rows: Cell[][] = leaves.map((l, i) => {
      const now = t.leaf[i]!;
      const after = Math.round((now * 4) / 3);
      return [l, `${now} Gb/s`, `${after} Gb/s (${Math.round((after / LINK_GBPS) * 100)}%)`, after <= lim ? "pass" : "BLOCK"];
    });
    const both = 2 * t.circuit;
    rows.push(["ams–sin circuits", `2 × ${t.circuit} Gb/s`, `${both} Gb/s on one (${Math.round((both / CIRCUIT_GBPS) * 100)}%)`, both <= CIRCUIT_GBPS * LIMIT ? "pass" : "BLOCK"]);
    return { title: "pre-check: load per uplink if spine2 is drained", head: ["where", "now", "after drain", "≤ 80%"], rows, tones: rows.map((r) => (r[3] === "BLOCK" ? ("danger" as const) : ("done" as const))) };
  };
  const setLoad = (perUplink: number[], drained: boolean, circuit: number) => {
    leaves.forEach((l, i) => {
      for (const s of spines) {
        const v = drained ? (s === S2 ? 0 : Math.round((perUplink[i]! * 4) / 3)) : perUplink[i]!;
        fab.linkSet(l, s, { width: v / LINK_GBPS, tone: drained && s === S2 ? "compare" : undefined });
      }
    });
    fab.linkSet("spine1.ams", "spine1.sin", { width: (drained ? 2 * circuit : circuit) / CIRCUIT_GBPS, label: `${drained ? 2 * circuit : circuit} of 100G` });
    fab.linkSet(S2, "spine2.sin", { width: drained ? 0 : circuit / CIRCUIT_GBPS, label: `${drained ? 0 : circuit} of 100G`, tone: drained ? "compare" : undefined });
  };
  const chartPoint = (drained: boolean) => {
    const v = at02.leaf[2]!;
    const d = Math.round((v * 4) / 3);
    fab.point(Object.fromEntries(spines.map((s) => [short(s), drained ? (s === S2 ? 0 : d) : v])));
  };

  fab.set({ procedure: "pre-check → drain → verify → work → restore → verify" });
  fab.note(
    `Meridian's Amsterdam fabric, small example with 4 spines and 4 leaves on 400G links; spine1.ams and spine2.ams also carry the two 100G circuits to Singapore. Tonight's change upgrades spine2.ams's operating system, which means a reboot, and the goal is to do it without dropping a single packet.`,
    "topology",
  );

  setLoad(at14.leaf, false, at14.circuit);
  fab.table(0, headroom(at14));
  fab.set({ "pre-check at 14:00": "BLOCKED" });
  fab.note(
    `The pre-check does the arithmetic first: with one of four spines drained, each leaf's traffic spreads over three uplinks, so each one carries 4/3 of its load. At 14:00 leaf3.ams's 270 Gb/s per uplink would become 360 Gb/s (90% of 400G) and all 90 Gb/s to Singapore would land on spine1's 100G circuit, both above Meridian's 80% limit, so the tool refuses to start.`,
    "precheck",
  );

  setLoad(at02.leaf, false, at02.circuit);
  fab.table(0, headroom(at02));
  fab.table(1, {
    title: "pre-check: state",
    head: ["check", "result"],
    rows: [
      ["spines in service", "4 of 4"],
      ["IS-IS adjacencies", "18 of 18 up"],
      ["leaves with 4 equal-cost paths", "4 of 4"],
      ["open alarms on the fabric", "none"],
      ["probes across every spine", "clean"],
    ],
    tones: ["done", "done", "done", "done", "done"],
  });
  fab.unset("pre-check at 14:00");
  fab.set({ "pre-check at 02:00": "pass" });
  fab.chart({ title: "leaf3.ams load per uplink", unit: "Gb/s", yMax: LINK_GBPS, xLabel: "change window", series: spines.map((s) => ({ name: short(s) })), marks: [{ y: lim, label: "80% limit", tone: "danger" }] });
  chartPoint(false);
  fab.note(
    `In the 02:00 window the same check passes: leaf3.ams goes from 165 to 220 Gb/s per uplink (55%), and the circuits from 2 × 35 to 70 Gb/s on one (70%). The state checks pass too: all four spines are in service (draining one while another is already out would halve the fabric), 18 IS-IS adjacencies are up and every leaf has four equal-cost paths.`,
    "precheck",
  );

  fab.table(1, undefined);
  fab.state(S2, `metric ${num(MAX_USABLE_METRIC)}`, "compare");
  fab.table(0, {
    title: `${L3} next hops for leaf1's loopback ${loopback("leaf1.ams")}/32`,
    head: ["next hop", "spine", "path cost", "in ECMP group"],
    rows: spines.map((s) => [p2p(L3, s).spine, short(s), s === S2 ? num(10 + MAX_USABLE_METRIC) : "20", s === S2 ? "no" : "yes"]),
    tones: spines.map((s) => (s === S2 ? ("compare" as const) : undefined)),
  });
  fab.set({ "spine2.ams link metric": `10 (circuit 52,500) → ${num(MAX_USABLE_METRIC)}` });
  fab.note(
    `The drain: spine2.ams raises the IS-IS metric on all five of its links (10 on the four leaf links, 52,500 on the Singapore circuit) to 16,777,214, the largest value that still leaves a link usable as a last resort, and floods a new link-state packet saying so. Every leaf reruns its shortest-path calculation: through spine2 the path now costs 16,777,224 against 20 through any other spine, so spine2 leaves every ECMP group. (Setting the IS-IS overload bit on spine2 is the other common way, with one difference: overload forbids transit through spine2 even when it is the only path left, while a maximum metric keeps it as a last resort.)`,
    "drain",
  );

  setLoad(at02.leaf, true, at02.circuit);
  chartPoint(true);
  fab.note(
    `Traffic moves off spine2.ams as each leaf updates its forwarding table: leaf3.ams's uplinks go from 4 × 165 to 3 × 220 Gb/s, and Singapore traffic shifts onto spine1's circuit, 70 of 100G. No packet needs to be lost, because spine2 keeps forwarding whatever still reaches it until every leaf has moved; flows that change spine may see a few packets reordered, once.`,
    "move",
  );

  fab.table(0, {
    title: "spine2.ams ports after the drain",
    head: ["port", "in", "out"],
    rows: [...leaves.map((l, i) => [`swp${i + 1} (${short(l)})`, "0.02 Mb/s", "0.02 Mb/s"]), ["to spine2.sin", "0.01 Mb/s", "0.01 Mb/s"]],
  });
  fab.table(1, {
    title: "verify: drained",
    head: ["check", "result"],
    rows: [
      ["busiest remaining uplink", "220 Gb/s (55%)"],
      ["discards on any fabric port", "0"],
      ["probes via spine1, 3, 4", "clean"],
    ],
    tones: ["done", "done", "done"],
  });
  fab.note(
    `Before touching spine2.ams, verify it is empty: its five ports carry 10 to 20 kb/s each, just the IS-IS hellos, BFD and LLDP that keep its adjacencies up. No fabric uplink is above 55%, the Singapore circuit runs at the predicted 70% and there are no discards, so the drain did what the pre-check said it would.`,
    "verify",
  );

  fab.state(S2, "rebooting", "danger");
  for (const l of leaves) fab.down(l, S2);
  fab.down(S2, "spine2.sin");
  fab.table(1, undefined);
  fab.table(0, { title: "impact during the reboot", head: ["measure", "value"], rows: [["packets lost", "0"], ["probes failed", "0"], ["equal-cost paths per leaf", "3 (unchanged since the drain)"]], tones: ["done", "done", undefined] });
  chartPoint(true);
  fab.note(
    `Now the work: spine2.ams reboots into the new release. Its links go dark for several minutes and the leaves see five adjacencies drop, which the change-aware monitoring expects for this change and so does not page anyone, but no traffic notices, because none was using them. It is an ordinary spine failure, with the traffic moved out of the way first.`,
    "work",
  );

  for (const l of leaves) fab.up(l, S2);
  fab.up(S2, "spine2.sin");
  setLoad(at02.leaf, true, at02.circuit);
  fab.state(S2, `metric ${num(MAX_USABLE_METRIC)}`, "compare");
  fab.table(0, {
    title: "verify spine2.ams before restoring",
    head: ["check", "result"],
    rows: [
      ["software release", "new version"],
      ["IS-IS adjacencies", "5 of 5 up"],
      ["routes", "52 (spine1.ams: 52)"],
      ["optics receive power", "all lanes in range"],
      ["interface errors", "0"],
    ],
    tones: ["done", "done", "done", "done", "done"],
  });
  fab.note(
    `spine2.ams comes back on the new release, and because the high metric is part of its saved configuration it returns still costed out: adjacencies form but it attracts no traffic. That is when it gets checked: five adjacencies up, the same 52 routes as spine1.ams, every optic lane in range and zero errors.`,
    "verify",
  );

  fab.state(S2, "metric 10");
  fab.tone(S2, undefined);
  setLoad(at02.leaf, false, at02.circuit);
  chartPoint(false);
  fab.unset("spine2.ams link metric");
  fab.table(0, {
    title: `${L3} next hops for leaf1's loopback ${loopback("leaf1.ams")}/32`,
    head: ["next hop", "spine", "path cost", "in ECMP group"],
    rows: spines.map((s) => [p2p(L3, s).spine, short(s), "20", "yes"]),
  });
  fab.note(
    `Restore: spine2.ams sets its metrics back to normal (10 on the leaf links, 52,500 on the circuit) and floods a new link-state packet, and every leaf puts it back into its ECMP groups. leaf3.ams's uplinks return to 4 × 165 Gb/s and the two Singapore circuits to 35 Gb/s each.`,
    "restore",
  );

  for (const s of spines) fab.state(s, "metric 10", "done");
  chartPoint(false);
  fab.table(0, {
    title: "post-check against the pre-check snapshot",
    head: ["check", "before", "after"],
    rows: [
      ["leaf3.ams per uplink", "4 × 165 Gb/s", "4 × 165 Gb/s"],
      ["IS-IS adjacencies", "18", "18"],
      ["discards on any fabric port", "0", "0"],
      ["probes across every spine", "clean", "clean"],
      ["packets lost during the change", "–", "0"],
    ],
    tones: ["done", "done", "done", "done", "done"],
  });
  fab.set({ change: "closed, hitless" });
  fab.note(
    `The final check compares against the pre-check snapshot: four spines carrying equal shares again, 18 adjacencies, zero discards and clean probes across every spine. The tool attaches both snapshots and every step's timestamp to the change record, so the audit trail shows the change was hitless and the next engineer can repeat it.`,
    "done",
  );
  return fab.f.done();
};

export const scenarios: Record<string, FabGen> = {
  "intent-drift": intentDrift,
  "netconf-commit": netconfCommit,
  "telemetry-blind": telemetryBlind,
  "probe-localisation": probeLocalisation,
  "spine-drain": spineDrain,
};

export const labels: Record<string, string> = {
  "intent-drift": "Intent, drift, and merge vs replace",
  "netconf-commit": "NETCONF confirmed commit and automatic rollback",
  "telemetry-blind": "Telemetry gone quiet: dead or congested?",
  "probe-localisation": "Hash-spread probes localise a bad link",
  "spine-drain": "Draining a spine for maintenance",
};
