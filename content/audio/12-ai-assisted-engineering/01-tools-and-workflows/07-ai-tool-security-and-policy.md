---
lesson: ai-tool-security-and-policy
source: b57ba527cfd7e2b6
fit: great
desk:
  - "The five-reads-by-five-controls table for one secret file"
  - "The deny-rules-plus-sandbox settings block and the gitleaks pre-commit hook"
  - "The hidden-character finder and its output on a poisoned rules file"
  - "The one-page team policy"
  - "Exercise: redact secrets before they leave your machine"
---
## Introduction

A developer debugging a failed deploy pastes the error into a chat assistant. The error includes the connection string, password and all. Elsewhere, an agent asked to figure out why the service will not start locally prints the environment file to understand the configuration, and forty production credentials are now in a transcript. On the vendor's side of the API. In a session log in the developer's home directory. And in the screenshot they post to the team channel asking why the agent is being weird.

Nobody did anything malicious. The leak is a side effect of an agent's normal behaviour: it reads files and runs commands to build context, and secrets are files and command output like any other. Security for AI tools is mostly about arranging things so that normal behaviour cannot leak what matters, and having a policy that tells people what to do before and after it does.

Four parts. Where your data goes. Which control actually stops which kind of read. Injection through the repository, including text you cannot see. And a team policy you can adopt.

## Where your data goes

Every path from your editor is a place code and prompts can persist: the vendor's API, its retention and abuse monitoring, possibly training depending on the terms, the MCP servers and their backends, and your own disk. For each tool, you need answers from the contract and the vendor's data-usage documentation, not from a blog post. Are prompts retained, and for how long? Are they used for training? Which region processes them? Can admins exclude paths? Is there an audit log?

And one question people forget: where are the local transcripts? Claude Code writes every session as a transcript file in your home directory. Codex keeps a history file and session transcripts too, unless you turn persistence off. Both are ordinary files, readable by anything that runs as you, and included in any laptop backup. So a secret that entered a prompt is on disk as well as at the vendor, and "the vendor retains it for thirty days" says nothing about the copy in your home directory.

Consumer and business terms also often differ. A developer using a personal account on company code may be under entirely different retention and training terms from the ones your security team approved.

Secrets get into context four ways. The agent reads them, the environment file or the cloud credentials, while exploring. Command output echoes them: printing the environment, inspecting a container, a debug log that prints headers, a stack trace with a connection string. You paste them. Or the agent writes them: you paste a key "to test the integration", and it hardcodes the key into a fixture that gets committed.

Notice what is missing from the defences: the gitignore file. It tells git not to track a file. It does nothing to stop a process from reading it.

## Which layer stops which read

Take one secret, the environment file in the repository root, and several ways an agent can read it. Then five controls people believe protect it: a deny rule on the file-reading tool; a deny rule on the shell command that prints it; a hook that inspects commands; a sandbox rule denying the read; and the secret simply not being on disk.

The file tool asking to read it: the file-tool rule stops it, and so does an empty disk. The sandbox does not, because file tools are not sandboxed; only permission rules govern them. The shell printing it with cat: almost everything stops that, because it is the obvious shape. Now a Python one-liner that opens the file and prints it. The file-tool rule? No effect: no command the parser recognises names the file. The cat rule? No effect: cat does not appear. The hook? Only if it guessed this shape, and the next shape differs. What stops it?

[pause]

The sandbox, because the process itself cannot open the file. And an empty disk, because there is nothing to read. Same answer for a recursive grep for the word "password" across the repository, which never names the file at all. And for an MCP server's own file access, only the sandbox, if the server runs inside it, or the empty disk, stops it.

Read the columns left to right and the pattern is unmistakable. Rules and hooks stop the shapes of command they were written for, and nothing else. The operating-system sandbox stops every shell shape, because it acts where the read happens. The file-tool rules still matter, because they are the only layer that governs the file tool. And the empty disk stops everything. One detail: in Claude Code, when the sandbox is on, file-read deny rules are also merged into the sandbox's configuration, so one line covers both. Without the sandbox, it covers only its own shapes.

Codex makes the same point from the other side. Its read-only and workspace-write modes govern writes and network, and both allow reading anything your user can read. Its cloud environment shows the last option well: secrets go to the setup script and are removed before the agent phase starts, so the agent that reads untrusted code never holds them. Rules are convenience. Sandboxes and the absence of secrets are safety.

## Defence in depth, and the leak replayed

The layers, in order. Do not keep long-lived secrets on disk: use a secret manager and short-lived credentials, so a leaked value expires, and commit only an example file with placeholders. Deny reads in the harness at every layer you have: the file tool, the obvious shell shapes, the sandbox, and an egress allowlist, because a secret that is read but cannot leave the machine is a much smaller incident. Run autonomous agents in a container without production credentials; what is not there cannot leak. Scan for secrets before commit and in CI, with push protection on your code host. Agents commit too, and the hook runs on their commits exactly as on yours. Redact before you paste.

And assume leaked, then rotate. If a secret enters a prompt, treat it as compromised and rotate it the same day. Deleting the conversation does not un-send the request, does not touch the transcript on your disk, and retention policies are promises about the future, not about what already happened.

Replay the opening as a chain. Production credentials lived on the laptop. The agent read them while exploring. It ran with the developer's full environment. The contents went to the vendor. The session log kept a copy. A screenshot went to the channel. And nobody rotated, because "retention is short". Two things stand out. The earliest links are the cheapest to break: a secret that is not on disk cannot be read, sent, logged or screenshotted. And once the request has gone to the vendor, no control can undo the exposure. Later controls only limit how many more copies exist, and only rotation makes the secret worthless. That is why the policy has to say so explicitly, rather than leave it to judgement at 6 in the evening on a Friday.

What never to paste, into any tool: credentials, customer personal data, production data, unpatched vulnerability details, and confidential business information. Company code goes only into approved tools under business terms.

## Injection through the repository

Anything the agent reads can instruct it: a README, a code comment, a dependency's documentation, a test fixture, an issue. Text that enters the prompt is supposed to be data, and the model cannot reliably keep it that way.

The variant that defeats human review is text you cannot see. Unicode has code points that render as nothing: zero-width spaces and joiners, and a block of tag characters that mirrors printable text. Editors and diff viewers draw them as nothing, but the tokenizer turns them into tokens the model reads like any others. In March 2025, researchers at Pillar Security showed that instructions hidden this way in agent rules files pass review and are followed. In the lesson's example, a rules file that looks identical to a clean one contains 26 hidden code points. The tag characters spell a command to print the private SSH key, appended to a line that reads "run tests before reporting done."

Six lines of Python find them. Put the check in CI for memory files, rules files and prompts, and reject the commit on any hit. And telling the model to ignore instructions in files does not work; it asks the target of the attack to defend itself.

The mitigations, in order of how much they enforce. Evaluate untrusted repositories, like an open-source project you are assessing or a candidate's take-home, in a sandbox with no credentials and restricted network. Do not auto-approve shell commands in sessions that read untrusted content. Review memory and rules files like code, with the hidden-character check. And break the combination of private data, untrusted content and outbound communication.

## Licensing and policy

Models can reproduce fragments of their training data, most often well-known code. If a verbatim copy of copyleft-licensed code lands in a proprietary product, you may inherit obligations you did not intend. Some tools offer a filter that blocks suggestions matching public code. GitHub's compares a suggestion with about 150 characters of surrounding code, which catches verbatim reproduction, not paraphrase. Indemnity terms move between documents; GitHub's Copilot-specific terms were replaced in March 2026 for new subscriptions and renewals. The durable advice: read the current terms, not a summary of last year's. And if a suggestion has distinctive comments or anything like a licence header, search for its origin, then comply or rewrite.

The copyright status of AI output is unsettled and a question for your legal team. The engineering practice that holds either way: a human remains the accountable author, and meaningful AI involvement is recorded, with a co-author trailer or a pull request label, so provenance can be audited.

A good policy fits on one page. It lists approved tools, on company accounts. It defines data classes. It sets secrets rules, including same-day rotation. And it carries two design choices. Autonomy tiers, by reversibility and blast radius rather than by tool, so the policy survives the next product launch. Tier zero, no approval: read, search, run tests locally. Tier one, approval per action: edit files, add dependencies, commit. Tier two, humans only: push to protected branches, deploy, touch production data, change CI or permissions. And blameless reporting, because the cost of a leaked key grows by the hour, and a policy that punishes reporting guarantees late reports.

## In the interview

A follow-up the lesson expects: a key was pasted into a chat, and the developer deleted the conversation. Are we done?

[pause]

No. Deleting cannot un-send a request already made, the local transcript on disk is untouched, and retention terms describe the future. Rotate today, then fix why the key was on disk. The common wrong answer is "the vendor's retention is short, so the risk expires".

And a classic: what does the gitignore file protect against, with respect to AI tools? Nothing. It tells git not to track a file, and does not affect what a process running as you can read. Deny rules, sandboxes and short-lived secrets are the controls.

## Recap

Four things to remember. Know where prompts go for every tool, including the transcripts on your own disk, and get the answers from contracts. For any way an agent can read a secret, know which layer stops it: rules and hooks for the shapes they name, the sandbox for every shell shape, and an empty disk for everything; gitignore for nothing. Any secret that enters a prompt is rotated the same day. And treat everything an agent reads as potential instructions, scanning rules files for invisible characters and sandboxing untrusted repositories, under a policy written in autonomy tiers with blameless reporting.

At your desk: the reads-by-controls table, the settings block and the pre-commit hook, the hidden-character finder, the one-page policy, and the redaction exercise.
