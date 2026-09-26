//! Helpers for streaming model output to the browser as Server-Sent Events.
//!
//! Pattern: the model stream runs in a spawned task that owns persistence, so
//! a client disconnect never loses the assistant's reply. The HTTP response is
//! just a consumer of an mpsc channel.
use std::convert::Infallible;

use ascend_core::ai::StreamEvent;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use futures::Stream;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;


pub fn channel() -> (mpsc::Sender<StreamEvent>, mpsc::Receiver<StreamEvent>) {
    mpsc::channel(64)
}

pub fn respond(rx: mpsc::Receiver<StreamEvent>) -> impl IntoResponse {
    let stream = ReceiverStream::new(rx).map(|ev| {
        let event = match ev {
            StreamEvent::Delta(text) => Event::default().event("delta").data(text),
            StreamEvent::Done { usage, stop_reason } => Event::default().event("done").data(
                serde_json::json!({
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "stop_reason": stop_reason,
                })
                .to_string(),
            ),
            StreamEvent::Error(msg) => Event::default().event("error").data(msg),
        };
        Ok::<_, Infallible>(event)
    });
    Sse::new(stream)
        .keep_alive(KeepAlive::new().interval(std::time::Duration::from_secs(15)).text("ping"))
}

/// Drives an upstream model stream: forwards deltas to `tx`, accumulates the
/// full reply, and returns it with usage when the stream ends.
pub async fn pump<S>(mut upstream: S, tx: &mpsc::Sender<StreamEvent>) -> (String, i64, i64, Option<String>)
where
    S: Stream<Item = StreamEvent> + Unpin,
{
    let mut full = String::new();
    let mut input = 0;
    let mut output = 0;
    let mut error = None;
    while let Some(ev) = upstream.next().await {
        match &ev {
            StreamEvent::Delta(t) => full.push_str(t),
            StreamEvent::Done { usage, .. } => {
                input = usage.input_tokens;
                output = usage.output_tokens;
            }
            StreamEvent::Error(e) => error = Some(e.clone()),
        }
        // A closed receiver just means the browser went away; keep consuming
        // so the reply is still persisted.
        let _ = tx.send(ev).await;
    }
    (full, input, output, error)
}
