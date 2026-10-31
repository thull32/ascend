use std::sync::Arc;

use chrono::Utc;
use sea_orm::sea_query::Expr;
use sea_orm::*;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::content::Curriculum;
use crate::entities::interviews;
use crate::entities::prelude::*;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterviewKind {
    Coding,
    SystemDesign,
    Behavioral,
    Networking,
}

impl InterviewKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Coding => "coding",
            Self::SystemDesign => "system_design",
            Self::Behavioral => "behavioral",
            Self::Networking => "networking",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "coding" => Some(Self::Coding),
            "system_design" => Some(Self::SystemDesign),
            "behavioral" => Some(Self::Behavioral),
            "networking" => Some(Self::Networking),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssistantMode {
    /// Classic interview: no AI help. The coach is locked out.
    Solo,
    /// "AI-native" interview: the candidate may use an AI pair-programmer and
    /// is judged on direction, verification and judgement, not typing.
    Assisted,
}

impl AssistantMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Solo => "solo",
            Self::Assisted => "assisted",
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct StartInterview {
    pub kind: InterviewKind,
    pub assistant_mode: AssistantMode,
    /// For coding interviews: pick a specific problem, or let the service choose.
    pub problem_slug: Option<String>,
    pub difficulty: Option<String>,
    pub duration_minutes: Option<i16>,
    pub language: Option<String>,
}

/// One entry in the interview transcript.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptEntry {
    pub role: String, // "interviewer" | "candidate" | "candidate_to_assistant" | "assistant" | "system"
    pub content: String,
    pub at: chrono::DateTime<Utc>,
}

const MAX_TRANSCRIPT_ENTRIES: usize = 400;

#[derive(Clone)]
pub struct InterviewService {
    db: DatabaseConnection,
    curriculum: Arc<Curriculum>,
}

/// System-design prompts. Kept in code (not content) because they are short
/// and the interviewer prompt references them directly.
pub const SYSTEM_DESIGN_PROMPTS: &[(&str, &str)] = &[
    (
        "video-streaming",
        "Design the playback path for a Netflix-scale video streaming service: catalogue browse → play → adaptive bitrate delivery, for 200M subscribers across the globe.",
    ),
    (
        "url-shortener",
        "Design a URL shortener handling 100M new links/month and 10B redirects/month with sub-50ms p99 redirect latency.",
    ),
    (
        "news-feed",
        "Design a social news feed (fan-out, ranking, and pagination) for 500M users where the median user follows 300 accounts.",
    ),
    (
        "chat",
        "Design a real-time messaging system supporting 1:1 and group chat, delivery receipts, and offline users, at WhatsApp scale.",
    ),
    (
        "rate-limiter",
        "Design a distributed rate limiter used by an API gateway across 50 regions, supporting per-user and per-endpoint limits.",
    ),
    (
        "metrics",
        "Design a metrics ingestion and query system (like Datadog) that ingests 10M data points/second and serves dashboards with 1s resolution.",
    ),
    (
        "search-autocomplete",
        "Design typeahead search suggestions for a product with 1B queries/day and a p99 latency budget of 100ms.",
    ),
    (
        "ride-matching",
        "Design the driver–rider matching and location tracking system for a ride-hailing app in a city with 100k concurrent drivers.",
    ),
    (
        "payments",
        "Design a payment processing system with exactly-once charge semantics, idempotent retries, and reconciliation with external providers.",
    ),
    (
        "notifications",
        "Design a notification platform delivering push, email, and SMS with per-user preferences, rate limits, and at-least-once delivery.",
    ),
];

pub const BEHAVIORAL_PROMPTS: &[&str] = &[
    "Tell me about a time you disagreed with a technical decision made by someone more senior. What did you do, and what happened?",
    "Describe the most complex system you have owned end to end. What would you change if you rebuilt it today?",
    "Tell me about a production incident you were responsible for. Walk me through detection, mitigation, and what changed afterwards.",
    "Describe a time you had to deliver hard feedback to a peer. How did you approach it?",
    "Tell me about a project where the requirements kept changing. How did you keep the team effective?",
    "Describe a situation where you chose the boring technology over the exciting one, or vice versa, and why.",
    "Tell me about a time you had to influence a decision without having authority over the people involved.",
    "What is a technical bet you made that turned out wrong? What did you learn?",
];

/// Networking-panel prompts: the opening questions a principal network
/// engineer asks a software engineer interviewing for a network or
/// AI-infrastructure organisation. Each is set on a generic fabric and is
/// only the start: the interviewer goes one level deeper on every answer.
pub const NETWORKING_PROMPTS: &[(&str, &str)] = &[
    (
        "laptop-joins-wifi",
        "A brand-new laptop joins an office Wi-Fi network, and the user types https://www.example.com into the browser. Walk me through everything that happens, from the radio association to the rendered page. Name the layer at each step, and tell me where each step can break.",
    ),
    (
        "packet-across-the-fabric",
        "Two servers sit in different racks of a data-center fabric. Each rack has a top-of-rack (leaf) switch, every leaf connects to four spine switches, and tenant traffic is carried in a VXLAN overlay. Server A opens a TCP connection to server B. Follow one packet from A's NIC to B's NIC: what each device looks at, what it rewrites, and what the header stack looks like on each link.",
    ),
    (
        "bgp-session-stuck",
        "A new eBGP session between your border router and an upstream provider will not come up. Your side shows the neighbour cycling between Connect and Active; the provider says theirs is Idle. Walk me through the BGP state machine, what each of those states means is happening on the wire, and how you would find the cause.",
    ),
    (
        "bgp-best-path",
        "Your border router learns the same prefix, 203.0.113.0/24, from three neighbours: two different transit providers over eBGP and an internal router over iBGP. With no multipath configured, exactly one path ends up in the forwarding table. Walk me through how BGP picks it: which attributes it compares, in what order, and which of them you control versus your neighbours.",
    ),
    (
        "route-reflectors",
        "Your network runs iBGP across 200 routers inside one autonomous system. Explain why iBGP needs a full mesh in the first place, how route reflectors remove that requirement, and what changes when you introduce them (path visibility, loop prevention, failure behaviour). Then both route reflectors serving a site fail at the same moment: what happens to traffic, and what would you alarm on?",
    ),
    (
        "bgp-black-hole",
        "After maintenance, a core router in your backbone is reloaded. The core forwards plain IP hop by hop (no MPLS). Its IS-IS adjacencies come back within seconds and transit traffic shifts back onto it, but its BGP sessions take several minutes to relearn the full internet table. During those minutes, traffic to some external prefixes is dropped, even though every other router has a valid BGP route for them. Explain the black hole: which packets are dropped and where, why the IGP and BGP converge at such different speeds, and what mechanism or order of operations avoids it.",
    ),
    (
        "two-isp-traffic-engineering",
        "Your company's data center has one public /24 and two internet providers, ISP1 and ISP2. The business wants traffic to use ISP1 in both directions and to fail over to ISP2 only when ISP1 is down. How do you make that happen for outbound traffic, and how do you influence inbound traffic, given you do not control how the rest of the internet routes to you? Cover each knob and its limits.",
    ),
    (
        "leaf-spine-design",
        "You are building a new data-center fabric for about 6,000 servers, each with two 100G uplinks, carrying heavy east-west traffic between services. Design the physical topology: why leaf-spine rather than the classic core/aggregation/access tree, how many spines, what oversubscription ratio, how traffic spreads across the spines, and what happens to capacity when one spine or one link fails.",
    ),
    (
        "underlay-isis-vs-ebgp",
        "For the routing underlay of a large fabric, one camp wants IS-IS, a link-state IGP, on every link; the other wants eBGP everywhere with a private ASN per switch. Explain how each one learns the topology and converges after a link failure, and when you would pick one over the other, including for a backbone that connects many metro sites rather than a single data center.",
    ),
    (
        "vxlan-evpn-overlay",
        "Tenants on your fabric need their own layer-2 segments and their own IP space stretched across many racks, while the fabric itself is routed at layer 3. Explain how VXLAN encapsulation and an EVPN control plane solve this together: what a VTEP and a VNI are, how a leaf learns where a remote MAC address lives, what happens to broadcast and ARP traffic, and how this compares with MPLS for the same job.",
    ),
    (
        "server-cannot-ping-gateway",
        "A freshly racked server cannot ping its default gateway, which lives on the leaf switch it is cabled to. Every other server in the rack works. Walk me through how you would find the cause, from the server outward, and name the layer you are testing at each step.",
    ),
    (
        "isis-adjacency-down",
        "An alert fires: the IS-IS adjacency between a leaf and a spine went down and stayed down, yet the link itself shows as up. What do you check, and in what order? What are the classic causes, and how does your thinking change if every adjacency on that switch dropped at once rather than just this one?",
    ),
    (
        "fabric-latency-regression",
        "A customer reports that latency between two of their sites, connected across your overlay fabric, went from about 10 ms to 50 ms. The fabric has tens of thousands of links and nothing is alarming. What data do you collect, and how do you narrow the problem to one device or link without inspecting every one?",
    ),
    (
        "telemetry-dead-or-congested",
        "Streaming telemetry from one switch stopped reaching your collectors five minutes ago. Is the switch dead, is the path between it and the collectors congested, or did the telemetry pipeline itself break? Design how your monitoring system tells these apart, quickly and automatically, and where each piece of it should run.",
    ),
    (
        "silent-packet-drops",
        "Applications behind one part of the fabric see occasional TCP retransmits and slow requests, but no link is down and no alarm has fired. You suspect a device is silently dropping packets. What signals would show it, how do you find which device it is, and what would you build so this is caught automatically next time?",
    ),
    (
        "roce-congestion-control",
        "You run the network for a GPU cluster whose training jobs use RDMA over Converged Ethernet (RoCEv2). Training throughput drops whenever several jobs run their all-reduce phase at the same time. Explain why RoCE wants a lossless fabric, how PFC, ECN and DCQCN work together, how each of them can fail, and what you would monitor.",
    ),
];

impl InterviewService {
    pub fn new(db: DatabaseConnection, curriculum: Arc<Curriculum>) -> Self {
        Self { db, curriculum }
    }

    pub async fn start(&self, user_id: Uuid, input: StartInterview) -> AppResult<interviews::Model> {
        // Validate and resolve everything first: a bad request must not
        // abandon the interview the learner already has in progress.
        let duration = input.duration_minutes.unwrap_or(match input.kind {
            InterviewKind::Coding => 45,
            InterviewKind::SystemDesign => 45,
            InterviewKind::Behavioral => 30,
            InterviewKind::Networking => 45,
        });
        if !(10..=90).contains(&duration) {
            return Err(AppError::validation("duration must be 10–90 minutes"));
        }

        let (problem_slug, prompt) = match input.kind {
            InterviewKind::Coding => {
                let problem = match &input.problem_slug {
                    Some(slug) => self.curriculum.problem(slug).ok_or(AppError::NotFound("problem"))?,
                    None => self.pick_problem(input.difficulty.as_deref(), user_id).await?,
                };
                (Some(problem.slug.clone()), problem.statement.clone())
            }
            InterviewKind::SystemDesign => {
                let idx = pseudo_random(SYSTEM_DESIGN_PROMPTS.len());
                (Some(SYSTEM_DESIGN_PROMPTS[idx].0.to_string()), SYSTEM_DESIGN_PROMPTS[idx].1.to_string())
            }
            InterviewKind::Behavioral => {
                (None, BEHAVIORAL_PROMPTS[pseudo_random(BEHAVIORAL_PROMPTS.len())].to_string())
            }
            InterviewKind::Networking => {
                let idx = pseudo_random(NETWORKING_PROMPTS.len());
                (Some(NETWORKING_PROMPTS[idx].0.to_string()), NETWORKING_PROMPTS[idx].1.to_string())
            }
        };

        let now = Utc::now();
        let model = interviews::ActiveModel {
            id: Set(Uuid::now_v7()),
            user_id: Set(user_id),
            kind: Set(input.kind.as_str().into()),
            assistant_mode: Set(input.assistant_mode.as_str().into()),
            problem_slug: Set(problem_slug),
            prompt: Set(prompt),
            duration_minutes: Set(duration),
            status: Set("active".into()),
            transcript: Set(serde_json::json!([])),
            final_code: Set(None),
            language: Set(input.language),
            evaluation: Set(None),
            score: Set(None),
            started_at: Set(now),
            ended_at: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        };
        // One active interview per user: abandon the old one and insert the new
        // one atomically. The partial unique index (m0007) turns a concurrent
        // double-start into a clean conflict instead of two active rows.
        let txn = self.db.begin().await?;
        Interviews::update_many()
            .col_expr(interviews::Column::Status, Expr::value("abandoned"))
            .col_expr(interviews::Column::EndedAt, Expr::value(Utc::now()))
            .filter(interviews::Column::UserId.eq(user_id))
            .filter(interviews::Column::Status.eq("active"))
            .exec(&txn)
            .await?;
        let created = model.insert(&txn).await.map_err(|e| match e.sql_err() {
            Some(SqlErr::UniqueConstraintViolation(_)) => {
                AppError::Conflict("another interview was started at the same moment; try again".into())
            }
            _ => AppError::Database(e),
        })?;
        txn.commit().await?;
        Ok(created)
    }

    async fn pick_problem(&self, difficulty: Option<&str>, user_id: Uuid) -> AppResult<Arc<crate::content::Problem>> {
        use crate::content::Difficulty;
        let want = match difficulty {
            Some("easy") => Some(Difficulty::Easy),
            Some("hard") => Some(Difficulty::Hard),
            Some("medium") => Some(Difficulty::Medium),
            _ => None,
        };
        // Prefer problems this user has never been interviewed on.
        let seen: Vec<String> = Interviews::find()
            .select_only()
            .column(interviews::Column::ProblemSlug)
            .filter(interviews::Column::UserId.eq(user_id))
            .filter(interviews::Column::ProblemSlug.is_not_null())
            .into_tuple::<Option<String>>()
            .all(&self.db)
            .await?
            .into_iter()
            .flatten()
            .collect();
        let candidates: Vec<&Arc<crate::content::Problem>> = self
            .curriculum
            .problems
            .iter()
            .filter(|p| want.as_ref().is_none_or(|d| &p.difficulty == d))
            .filter(|p| !seen.contains(&p.slug))
            .collect();
        let pool: Vec<&Arc<crate::content::Problem>> = if candidates.is_empty() {
            self.curriculum.problems.iter().filter(|p| want.as_ref().is_none_or(|d| &p.difficulty == d)).collect()
        } else {
            candidates
        };
        pool.get(pseudo_random(pool.len().max(1))).map(|p| (*p).clone()).ok_or(AppError::NotFound("problem"))
    }

    pub async fn get(&self, user_id: Uuid, id: Uuid) -> AppResult<interviews::Model> {
        let i = Interviews::find_by_id(id).one(&self.db).await?.ok_or(AppError::NotFound("interview"))?;
        if i.user_id != user_id {
            return Err(AppError::NotFound("interview"));
        }
        Ok(i)
    }

    pub async fn list(&self, user_id: Uuid) -> AppResult<Vec<interviews::Model>> {
        Ok(Interviews::find()
            .filter(interviews::Column::UserId.eq(user_id))
            .order_by_desc(interviews::Column::StartedAt)
            .limit(50)
            .all(&self.db)
            .await?)
    }

    pub fn transcript(model: &interviews::Model) -> Vec<TranscriptEntry> {
        serde_json::from_value(model.transcript.clone()).unwrap_or_default()
    }

    /// Appends entries (and optionally the latest code) in one statement.
    ///
    /// The interviewer reply and an assistant reply can be persisted by two
    /// background tasks at the same moment. A read-modify-write of the JSON
    /// array would let one overwrite the other; `transcript || $2` appends
    /// server-side, and the length cap is enforced in the same statement.
    pub async fn append_transcript(
        &self,
        model: interviews::Model,
        entries: Vec<TranscriptEntry>,
        code: Option<String>,
    ) -> AppResult<interviews::Model> {
        if code.as_ref().is_some_and(|c| c.len() > 64 * 1024) {
            return Err(AppError::validation("code exceeds 64 KiB"));
        }
        let new_entries = serde_json::to_value(&entries).map_err(AppError::internal)?;
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE interviews
               SET transcript = transcript || $2::jsonb,
                   final_code = COALESCE($3, final_code),
                   updated_at = now()
             WHERE id = $1
               AND status = 'active'
               AND jsonb_array_length(transcript) + jsonb_array_length($2::jsonb) <= $4
            RETURNING *
            "#,
            [model.id.into(), new_entries.into(), code.into(), (MAX_TRANSCRIPT_ENTRIES as i32).into()],
        );
        if let Some(updated) = Interviews::find().from_raw_sql(stmt).one(&self.db).await? {
            return Ok(updated);
        }
        // Nothing matched: say which guard refused. The transcript freezes
        // when grading begins (`begin_grading`), so a reply still streaming
        // when the learner clicks "finish" is refused here rather than landing
        // after the grader has read the transcript.
        let current = Interviews::find_by_id(model.id).one(&self.db).await?.ok_or(AppError::NotFound("interview"))?;
        if current.status == "grading" {
            return Err(AppError::Conflict("the interview is being graded".into()));
        }
        if current.status != "active" {
            return Err(AppError::Conflict("the interview has already ended".into()));
        }
        Err(AppError::validation("interview transcript is too long"))
    }

    /// True while the user has a solo interview in progress (within its time
    /// box plus a grace period, so an abandoned tab cannot lock the coach
    /// forever). Used to enforce "no AI help" on the server, not just the UI.
    pub async fn has_active_solo(&self, user_id: Uuid) -> AppResult<bool> {
        let active = Interviews::find()
            .filter(interviews::Column::UserId.eq(user_id))
            .filter(interviews::Column::Status.is_in(["active", "grading"]))
            .filter(interviews::Column::AssistantMode.eq("solo"))
            .all(&self.db)
            .await?;
        let now = Utc::now();
        Ok(active.iter().any(|i| now < i.started_at + chrono::Duration::minutes(i.duration_minutes as i64 + 15)))
    }

    /// Freezes the interview for grading and returns it exactly as the grader
    /// will see it. The status moves from `active` to `grading` in the same
    /// statement that stores the final code, so from this moment
    /// `append_transcript` refuses writes: a reply still streaming when the
    /// learner clicks "finish" can no longer land between the grader reading
    /// the transcript and the grade being stored.
    ///
    /// A `grading` row older than five minutes belongs to a request that
    /// died (a deploy, a crash) and may be graded again.
    pub async fn begin_grading(&self, model: interviews::Model, code: Option<String>) -> AppResult<interviews::Model> {
        if code.as_ref().is_some_and(|c| c.len() > 64 * 1024) {
            return Err(AppError::validation("code exceeds 64 KiB"));
        }
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"
            UPDATE interviews
               SET status = 'grading',
                   final_code = COALESCE($2, final_code),
                   updated_at = now()
             WHERE id = $1
               AND (status = 'active'
                    OR (status = 'grading' AND updated_at < now() - interval '5 minutes'))
            RETURNING *
            "#,
            [model.id.into(), code.into()],
        );
        match Interviews::find().from_raw_sql(stmt).one(&self.db).await? {
            Some(frozen) => Ok(frozen),
            None if model.status == "grading" => {
                Err(AppError::Conflict("the interview is already being graded".into()))
            }
            None => Err(AppError::Conflict("the interview has already ended".into())),
        }
    }

    /// Grading failed (the model was unavailable, the budget ran out): reopen
    /// the interview so the learner can try "finish" again.
    pub async fn resume_after_failed_grading(&self, id: Uuid) -> AppResult<()> {
        Interviews::update_many()
            .col_expr(interviews::Column::Status, Expr::value("active"))
            .col_expr(interviews::Column::UpdatedAt, Expr::value(Utc::now()))
            .filter(interviews::Column::Id.eq(id))
            .filter(interviews::Column::Status.eq("grading"))
            .exec(&self.db)
            .await?;
        Ok(())
    }

    pub async fn finish(
        &self,
        model: interviews::Model,
        evaluation: serde_json::Value,
        score: i16,
        status: &str,
    ) -> AppResult<interviews::Model> {
        // Conditional on not having ended yet, so two racing "finish" requests
        // cannot both write an evaluation: exactly one wins.
        let now = Utc::now();
        Interviews::update_many()
            .col_expr(interviews::Column::Evaluation, Expr::value(evaluation))
            .col_expr(interviews::Column::Score, Expr::value(score))
            .col_expr(interviews::Column::Status, Expr::value(status))
            .col_expr(interviews::Column::EndedAt, Expr::value(now))
            .col_expr(interviews::Column::UpdatedAt, Expr::value(now))
            .filter(interviews::Column::Id.eq(model.id))
            .filter(interviews::Column::Status.is_in(["active", "grading"]))
            .exec_with_returning(&self.db)
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| AppError::Conflict("the interview has already ended".into()))
    }
}

fn pseudo_random(n: usize) -> usize {
    use rand::RngExt;
    if n == 0 { 0 } else { rand::rng().random_range(0..n) }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: [InterviewKind; 4] =
        [InterviewKind::Coding, InterviewKind::SystemDesign, InterviewKind::Behavioral, InterviewKind::Networking];

    #[test]
    fn every_kind_round_trips_through_its_wire_name() {
        for kind in ALL {
            assert_eq!(InterviewKind::parse(kind.as_str()), Some(kind));
            let json = serde_json::to_string(&kind).unwrap();
            assert_eq!(json, format!("\"{}\"", kind.as_str()), "serde and as_str agree");
            assert_eq!(serde_json::from_str::<InterviewKind>(&json).unwrap(), kind);
        }
        assert_eq!(InterviewKind::parse("networking"), Some(InterviewKind::Networking));
        assert_eq!(InterviewKind::parse("network"), None);
        // The column is varchar(24) (m0005).
        assert!(ALL.iter().all(|k| k.as_str().len() <= 24));
    }

    #[test]
    fn the_networking_bank_is_large_unique_and_generic() {
        let n = NETWORKING_PROMPTS.len();
        assert!((12..=16).contains(&n), "{n} prompts");
        let ids: std::collections::HashSet<_> = NETWORKING_PROMPTS.iter().map(|(id, _)| *id).collect();
        assert_eq!(ids.len(), n, "prompt ids are unique");
        for (id, text) in NETWORKING_PROMPTS {
            assert!(!id.is_empty() && id.chars().all(|c| c.is_ascii_lowercase() || c == '-'), "{id}");
            assert!(text.len() > 150, "{id}: an opening question needs its setup");
        }
        let all = NETWORKING_PROMPTS.iter().map(|(_, t)| t.to_lowercase()).collect::<Vec<_>>().join(" ");
        for topic in [
            "bgp",
            "route reflector",
            "is-is",
            "vxlan",
            "evpn",
            "leaf",
            "rdma",
            "pfc",
            "ecn",
            "telemetry",
            "two internet providers",
        ] {
            assert!(all.contains(topic), "the bank covers {topic}");
        }
    }
}
