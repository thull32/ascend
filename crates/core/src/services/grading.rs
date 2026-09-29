//! Where submissions are graded: in this process, or in the separate grading
//! service (`ascend-api --serve-grader`, reached over the private network).
//!
//! The service exists for two reasons. Isolation: the service holds the
//! WebAssembly runtimes and nothing else (no database URL, no API keys), so
//! even a sandbox escape would land somewhere with nothing to take. And
//! scale: grading is CPU-bound and bursty, so it gets its own replicas and
//! can grow without growing the API (or its database connections).
use std::time::Duration;

use ascend_grader::{GradeError, Grader, Job, Outcome};
use secrecy::{ExposeSecret, SecretString};

#[derive(Clone)]
pub enum GradingBackend {
    Local(Grader),
    Remote(RemoteGrader),
}

impl GradingBackend {
    pub async fn run(&self, job: Job) -> Result<Outcome, GradeError> {
        match self {
            GradingBackend::Local(g) => g.run(job).await,
            GradingBackend::Remote(r) => r.run(job).await,
        }
    }

    /// The in-process grader, if grading happens here.
    pub fn local(&self) -> Option<&Grader> {
        match self {
            GradingBackend::Local(g) => Some(g),
            GradingBackend::Remote(_) => None,
        }
    }
}

#[derive(Clone)]
pub struct RemoteGrader {
    client: reqwest::Client,
    url: String,
    token: SecretString,
}

impl RemoteGrader {
    pub fn new(url: &str, token: SecretString) -> anyhow::Result<Self> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(3))
            // A new connection per request: the service's internal DNS name
            // resolves to its replicas, so each request (and each retry) can
            // land on a different one instead of pinning to a pooled socket.
            .pool_max_idle_per_host(0)
            .user_agent(concat!("ascend/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { client, url: format!("{}/grade", url.trim_end_matches('/')), token })
    }

    /// Sends the job; on a busy or unreachable replica, tries once more.
    pub async fn run(&self, job: Job) -> Result<Outcome, GradeError> {
        let cases = u32::try_from(job.cases.len().max(1)).unwrap_or(u32::MAX);
        // The service's own budget plus room for its queue and the network.
        let timeout = job.time_limit.saturating_mul(cases) + Duration::from_secs(60);
        let mut last = GradeError::Busy;
        for attempt in 0..2 {
            let sent = self
                .client
                .post(&self.url)
                .bearer_auth(self.token.expose_secret())
                .timeout(timeout)
                .json(&job)
                .send()
                .await;
            match sent {
                Ok(r) if r.status().is_success() => {
                    return r.json::<Outcome>().await.map_err(|e| GradeError::Internal(format!("grading reply: {e}")));
                }
                Ok(r) if r.status() == reqwest::StatusCode::SERVICE_UNAVAILABLE => last = GradeError::Busy,
                Ok(r) => return Err(GradeError::Internal(format!("grading service returned {}", r.status()))),
                Err(e) if e.is_connect() => last = GradeError::Internal(format!("grading service unreachable: {e}")),
                Err(e) => return Err(GradeError::Internal(format!("grading service: {e}"))),
            }
            if attempt == 0 {
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
        Err(last)
    }
}
