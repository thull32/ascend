//! Minimal Anthropic Messages API client.
//!
//! Request shape follows the current API: adaptive thinking with an effort
//! level, `output_config.format` for JSON-schema constrained output, and
//! `cache_control` on the system prompt so repeated coach turns reuse the
//! cached prefix.
use std::time::Duration;

use futures::{Stream, StreamExt};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const API_VERSION: &str = "2023-06-01";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Effort {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone)]
pub struct Request {
    pub model: String,
    /// Stable instructions. Sent as the first system block with a cache
    /// breakpoint, so every request that shares it reuses the cached prefix.
    pub system: String,
    /// Per-request context (lesson text, editor contents, progress). Sent as
    /// a second, uncached system block *after* the breakpoint, so changing it
    /// never invalidates the stable prefix.
    pub context: Option<String>,
    /// Multi-turn chats: also cache the conversation history (top-level
    /// automatic breakpoint on the last message), so turn N+1 re-reads turns
    /// 1..N from cache instead of paying for them again.
    pub cache_conversation: bool,
    pub messages: Vec<ChatMessage>,
    pub max_tokens: u32,
    pub effort: Effort,
    /// JSON schema for `output_config.format`; when set the response text is
    /// guaranteed to be a JSON document matching it.
    pub json_schema: Option<serde_json::Value>,
}

#[derive(Debug, Default, Clone, Copy, Deserialize)]
pub struct Usage {
    #[serde(default)]
    pub input_tokens: i64,
    #[serde(default)]
    pub output_tokens: i64,
    #[serde(default)]
    pub cache_read_input_tokens: i64,
    #[serde(default)]
    pub cache_creation_input_tokens: i64,
}

#[derive(Debug)]
pub struct Completion {
    pub text: String,
    pub usage: Usage,
    pub stop_reason: Option<String>,
}

/// Events surfaced to callers while streaming.
#[derive(Debug, Clone)]
pub enum StreamEvent {
    Delta(String),
    Done { usage: Usage, stop_reason: Option<String> },
    Error(String),
}

#[derive(Clone)]
pub struct AnthropicClient {
    http: reqwest::Client,
    api_key: SecretString,
    base_url: String,
}

// ---- wire types ----

#[derive(Serialize)]
struct SystemBlock<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    text: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<CacheControl>,
}
#[derive(Serialize)]
struct CacheControl {
    #[serde(rename = "type")]
    kind: &'static str,
}
#[derive(Serialize)]
struct Thinking {
    #[serde(rename = "type")]
    kind: &'static str,
}
#[derive(Serialize)]
struct OutputConfig {
    effort: Effort,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<OutputFormat>,
}
#[derive(Serialize)]
struct OutputFormat {
    #[serde(rename = "type")]
    kind: &'static str,
    schema: serde_json::Value,
}
#[derive(Serialize)]
struct Body<'a> {
    model: &'a str,
    max_tokens: u32,
    system: Vec<SystemBlock<'a>>,
    messages: &'a [ChatMessage],
    thinking: Thinking,
    output_config: OutputConfig,
    /// Top-level automatic cache breakpoint (placed on the last cacheable block).
    #[serde(skip_serializing_if = "Option::is_none")]
    cache_control: Option<CacheControl>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    stream: bool,
}

#[derive(Deserialize)]
struct MessageResponse {
    content: Vec<ContentBlock>,
    #[serde(default)]
    usage: Usage,
    stop_reason: Option<String>,
}
#[derive(Deserialize)]
#[serde(tag = "type")]
enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum SseEvent {
    #[serde(rename = "message_start")]
    MessageStart { message: MessageStartInner },
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta { delta: Delta },
    #[serde(rename = "message_delta")]
    MessageDelta {
        delta: MessageDeltaInner,
        #[serde(default)]
        usage: Usage,
    },
    #[serde(rename = "error")]
    Error { error: ErrorInner },
    #[serde(other)]
    Other,
}
#[derive(Deserialize)]
struct MessageStartInner {
    #[serde(default)]
    usage: Usage,
}
#[derive(Deserialize)]
#[serde(tag = "type")]
enum Delta {
    #[serde(rename = "text_delta")]
    Text { text: String },
    #[serde(other)]
    Other,
}
#[derive(Deserialize)]
struct MessageDeltaInner {
    stop_reason: Option<String>,
}
#[derive(Deserialize)]
struct ErrorInner {
    message: String,
}

impl AnthropicClient {
    pub fn new(api_key: SecretString, base_url: String, timeout: Duration) -> AppResult<Self> {
        let http = reqwest::Client::builder()
            .timeout(timeout)
            .connect_timeout(Duration::from_secs(10))
            .user_agent("ascend/0.1 (+https://github.com/thull32/ascend)")
            .build()
            .map_err(AppError::internal)?;
        Ok(Self { http, api_key, base_url: base_url.trim_end_matches('/').to_string() })
    }

    fn builder(&self, req: &Request, stream: bool) -> AppResult<reqwest::RequestBuilder> {
        let body = Body {
            model: &req.model,
            max_tokens: req.max_tokens,
            system: std::iter::once(SystemBlock {
                kind: "text",
                text: &req.system,
                cache_control: Some(CacheControl { kind: "ephemeral" }),
            })
            .chain(req.context.as_deref().map(|text| SystemBlock { kind: "text", text, cache_control: None }))
            .collect(),
            messages: &req.messages,
            thinking: Thinking { kind: "adaptive" },
            output_config: OutputConfig {
                effort: req.effort,
                format: req.json_schema.clone().map(|schema| OutputFormat { kind: "json_schema", schema }),
            },
            cache_control: req.cache_conversation.then_some(CacheControl { kind: "ephemeral" }),
            stream,
        };
        let json = serde_json::to_vec(&body).map_err(AppError::internal)?;
        Ok(self
            .http
            .post(format!("{}/v1/messages", self.base_url))
            .header("content-type", "application/json")
            .header("x-api-key", self.api_key.expose_secret())
            .header("anthropic-version", API_VERSION)
            .body(json))
    }

    /// One-shot completion (used for JSON outputs and short titles).
    pub async fn complete(&self, req: &Request) -> AppResult<Completion> {
        let resp = self.builder(req, false)?.send().await.map_err(|e| AppError::AiUpstream(e.to_string()))?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            tracing::warn!(%status, body = %text.chars().take(500).collect::<String>(), "anthropic error");
            return Err(map_status(status, &text));
        }
        let parsed: MessageResponse = resp.json().await.map_err(|e| AppError::AiUpstream(e.to_string()))?;
        if parsed.stop_reason.as_deref() == Some("refusal") {
            return Err(AppError::AiUpstream("the model declined this request".into()));
        }
        let text = parsed
            .content
            .into_iter()
            .filter_map(|b| match b {
                ContentBlock::Text { text } => Some(text),
                ContentBlock::Other => None,
            })
            .collect::<Vec<_>>()
            .join("");
        Ok(Completion { text, usage: parsed.usage, stop_reason: parsed.stop_reason })
    }

    /// Streams text deltas. The returned stream always ends with exactly one
    /// `Done` or `Error` event.
    pub async fn stream(&self, req: &Request) -> AppResult<impl Stream<Item = StreamEvent> + Send + 'static> {
        let resp = self.builder(req, true)?.send().await.map_err(|e| AppError::AiUpstream(e.to_string()))?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            tracing::warn!(%status, body = %text.chars().take(500).collect::<String>(), "anthropic stream error");
            return Err(map_status(status, &text));
        }
        let bytes = resp.bytes_stream();
        let events = eventsource_stream::EventStream::new(bytes);
        Ok(async_stream::stream! {
            let mut usage = Usage::default();
            let mut finished = false;
            futures::pin_mut!(events);
            while let Some(item) = events.next().await {
                match item {
                    Ok(ev) => match serde_json::from_str::<SseEvent>(&ev.data) {
                        Ok(SseEvent::MessageStart { message }) => {
                            usage.input_tokens = message.usage.input_tokens;
                            usage.cache_read_input_tokens = message.usage.cache_read_input_tokens;
                            usage.cache_creation_input_tokens = message.usage.cache_creation_input_tokens;
                        }
                        Ok(SseEvent::ContentBlockDelta { delta: Delta::Text { text } }) => yield StreamEvent::Delta(text),
                        Ok(SseEvent::MessageDelta { delta, usage: u }) => {
                            usage.output_tokens = u.output_tokens;
                            finished = true;
                            yield StreamEvent::Done { usage, stop_reason: delta.stop_reason };
                            break;
                        }
                        Ok(SseEvent::Error { error }) => {
                            finished = true;
                            yield StreamEvent::Error(error.message);
                            break;
                        }
                        Ok(_) => {}
                        Err(e) => tracing::debug!(error = %e, "unparsed sse event"),
                    },
                    Err(e) => {
                        finished = true;
                        yield StreamEvent::Error(e.to_string());
                        break;
                    }
                }
            }
            if !finished {
                yield StreamEvent::Done { usage, stop_reason: None };
            }
        })
    }
}

fn map_status(status: reqwest::StatusCode, body: &str) -> AppError {
    match status.as_u16() {
        429 => AppError::RateLimited("the AI provider is rate limiting us; try again in a moment".into()),
        529 | 503 => AppError::AiUpstream("the AI provider is overloaded; try again shortly".into()),
        401 | 403 => AppError::AiUpstream("AI provider rejected our credentials".into()),
        400 => {
            AppError::AiUpstream(format!("bad request to AI provider: {}", body.chars().take(200).collect::<String>()))
        }
        _ => AppError::AiUpstream(format!("HTTP {status}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(context: Option<&str>, cache_conversation: bool) -> Request {
        Request {
            model: "m".into(),
            system: "stable".into(),
            context: context.map(Into::into),
            cache_conversation,
            messages: vec![ChatMessage { role: Role::User, content: "hi".into() }],
            max_tokens: 10,
            effort: Effort::Low,
            json_schema: None,
        }
    }

    fn body_json(r: &Request) -> serde_json::Value {
        let client = AnthropicClient::new(SecretString::from("k"), "http://x".into(), Duration::from_secs(1)).unwrap();
        let built = client.builder(r, false).unwrap().build().unwrap();
        serde_json::from_slice(built.body().unwrap().as_bytes().unwrap()).unwrap()
    }

    #[test]
    fn stable_prefix_is_cached_and_context_is_not() {
        let b = body_json(&req(Some("volatile"), true));
        let system = b["system"].as_array().unwrap();
        assert_eq!(system.len(), 2);
        assert_eq!(system[0]["text"], "stable");
        assert_eq!(system[0]["cache_control"]["type"], "ephemeral");
        assert_eq!(system[1]["text"], "volatile");
        assert!(system[1].get("cache_control").is_none(), "volatile context must sit after the breakpoint");
        assert_eq!(b["cache_control"]["type"], "ephemeral", "conversation caching enabled");
        assert_eq!(b["thinking"]["type"], "adaptive");
    }

    #[test]
    fn single_shot_requests_skip_conversation_caching() {
        let b = body_json(&req(None, false));
        assert_eq!(b["system"].as_array().unwrap().len(), 1);
        assert!(b.get("cache_control").is_none());
        assert!(b.get("stream").is_none());
    }
}
