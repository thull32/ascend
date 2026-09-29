//! Sending email: password-reset and verification links.
//!
//! Production sends through Resend's HTTP API (Railway blocks outbound SMTP
//! on most plans, and an HTTP API needs no connection pool or TLS dance).
//! Development without a key logs each message, link included, so the flows
//! can be followed locally. Tests capture messages in memory.
use std::sync::{Arc, Mutex};
use std::time::Duration;

use secrecy::{ExposeSecret, SecretString};
use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Email {
    pub to: String,
    pub subject: String,
    pub text: String,
    pub html: String,
}

#[derive(Clone)]
pub enum Mailer {
    Resend {
        client: reqwest::Client,
        api_key: SecretString,
        from: String,
        base_url: String,
    },
    /// Development: write the message to the log.
    Log,
    /// Tests: keep every message.
    Memory(Arc<Mutex<Vec<Email>>>),
    /// Production without a key: account-recovery email is unavailable.
    Disabled,
}

#[derive(Serialize)]
struct ResendBody<'a> {
    from: &'a str,
    to: [&'a str; 1],
    subject: &'a str,
    text: &'a str,
    html: &'a str,
}

impl Mailer {
    pub fn resend(api_key: SecretString, from: String, base_url: Option<String>) -> anyhow::Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent(concat!("ascend/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self::Resend {
            client,
            api_key,
            from,
            base_url: base_url.unwrap_or_else(|| "https://api.resend.com".into()),
        })
    }

    pub fn enabled(&self) -> bool {
        !matches!(self, Mailer::Disabled)
    }

    pub async fn send(&self, email: &Email) -> AppResult<()> {
        match self {
            Mailer::Resend { client, api_key, from, base_url } => {
                let body =
                    ResendBody { from, to: [&email.to], subject: &email.subject, text: &email.text, html: &email.html };
                let response = client
                    .post(format!("{}/emails", base_url.trim_end_matches('/')))
                    .bearer_auth(api_key.expose_secret())
                    .json(&body)
                    .send()
                    .await
                    .map_err(AppError::internal)?;
                if !response.status().is_success() {
                    let status = response.status();
                    let detail = response.text().await.unwrap_or_default();
                    return Err(AppError::Internal(format!(
                        "email provider returned {status}: {}",
                        detail.chars().take(300).collect::<String>()
                    )));
                }
                Ok(())
            }
            Mailer::Log => {
                tracing::info!(to = %email.to, subject = %email.subject, body = %email.text, "email (not sent: no provider configured)");
                Ok(())
            }
            Mailer::Memory(sent) => {
                sent.lock().expect("mailer lock").push(email.clone());
                Ok(())
            }
            Mailer::Disabled => Err(AppError::Unavailable {
                message: "email is not set up on this server".into(),
                retry_after_secs: None,
            }),
        }
    }
}

/// Escapes text for the HTML part.
fn escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn layout(greeting: &str, paragraphs: &[&str], link: &str, button: &str, footer: &str) -> (String, String) {
    let text = format!("{greeting}\n\n{}\n\n{link}\n\n{footer}\n", paragraphs.join("\n\n"));
    let html = format!(
        "<div style=\"font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;line-height:1.5;color:#111\">\
         <p>{}</p>{}<p><a href=\"{}\" style=\"display:inline-block;background:#4f46e5;color:#fff;padding:10px 16px;\
         border-radius:8px;text-decoration:none\">{}</a></p><p style=\"font-size:13px;color:#555\">Or paste this link \
         into your browser:<br>{}</p><p style=\"font-size:13px;color:#555\">{}</p></div>",
        escape(greeting),
        paragraphs.iter().map(|p| format!("<p>{}</p>", escape(p))).collect::<String>(),
        escape(link),
        escape(button),
        escape(link),
        escape(footer)
    );
    (text, html)
}

pub fn password_reset(to: &str, name: &str, link: &str) -> Email {
    let (text, html) = layout(
        &format!("Hi {name},"),
        &[
            "Someone (hopefully you) asked to reset the password for your Ascend account. The link below lets you choose a new one. It works once and expires in one hour.",
        ],
        link,
        "Choose a new password",
        "If you did not ask for this, ignore this email: your password has not changed.",
    );
    Email { to: to.into(), subject: "Reset your Ascend password".into(), text, html }
}

pub fn verify_address(to: &str, name: &str, link: &str) -> Email {
    let (text, html) = layout(
        &format!("Hi {name},"),
        &[
            "Please confirm this is your email address, so you can recover your Ascend account if you ever lose your password. The link expires in seven days.",
        ],
        link,
        "Confirm my email address",
        "If you did not create an Ascend account, ignore this email.",
    );
    Email { to: to.into(), subject: "Confirm your email for Ascend".into(), text, html }
}
