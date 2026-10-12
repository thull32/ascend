---
lesson: mcp-and-integrations
source: bd1466c723bd8d73
---
## 1

An agent can call a database MCP server. Which control most reliably prevents it from modifying production data?

A, an instruction in the memory file saying never to write to production. B, a tool annotation on the server marking the query tool as read-only. C, the server connects as a database user with only select privileges. D, an approval prompt before each query, so a human sees every statement.

[think]

The answer is C: the server connects as a database user with only select privileges.

The database enforces the credential's privileges, regardless of what the model asks or what a tired human approves. Instructions can be ignored, prompts suffer from approval fatigue, and annotations are hints from the server's author that the specification itself says to treat as untrusted.

## 2

Your settings deny shell commands starting with curl. Does this prevent an injected instruction from sending data to an external server?

A, no, because deny rules are only enforced for MCP tools, not for shell commands. B, yes, provided wget is denied as well, since those are the two HTTP clients. C, no: python, node, wget or git can still reach the network, so restrict egress. D, yes, because curl is the only way to make HTTP requests from a shell.

[think]

The answer is C: no. Python, node, wget or git can still reach the network, so restrict egress.

Command-pattern rules match strings, and there are endless ways to reach the network: python, node, wget, git and more. Denying one more command name only narrows the list. A hook can catch more of the honest cases, but only blocking egress at the sandbox or network layer closes the path.

## 3

An agent reads public GitHub issues, has your cloud credentials in its environment, and can post comments. Which change most reduces the exfiltration risk?

A, only triage issues under 1,000 characters, so injected payloads cannot fit. B, use a larger model that is better at detecting prompt injection attempts. C, run it with no credentials, and require approval of each comment's exact text. D, add a system prompt telling it to ignore any instructions found in issues.

[think]

The answer is C: run it with no credentials, and require approval of each comment's exact text.

This is the lethal trifecta: private data, untrusted content, and external communication. Removing the credentials and gating the outbound channel removes legs of the trifecta. Instructions and model choice reduce the odds of a successful injection, but do not remove the capability.

## 4

A teammate's pull request adds a third-party MCP server to the project's checked-in config, launched with npx and no version pin. What is the main review concern?

A, it runs unvetted, unpinned code on every teammate's machine, with their permissions. B, npx is slow to start, so every session will pause while the package installs. C, project-level MCP config is not supported, so the server will only work for its author. D, its tool results will use too many tokens, and crowd out the rest of the context.

[think]

The answer is A: it runs unvetted, unpinned code on every teammate's machine, with their permissions.

A local server entry is a command that runs as each developer who accepts it. Unpinned, it can change under you, and its tool descriptions enter every session's context at discovery, so a malicious description is itself an injection vector. Treat it like adding a dependency: vet it, pin it, and review it, descriptions included.

## 5

In the current MCP specification revision, there is no initialize handshake. How does a server learn which protocol version a client speaks?

A, from the tools list request, which is always the first message in a session. B, from a session id header that the server assigned on the first request. C, it does not need to; the current revision has only one protocol version. D, from a meta field on every request, carrying the version and the client's capabilities.

[think]

The answer is D: from a meta field on every request, carrying the version and the client's capabilities.

The July 2026 revision made the protocol stateless. There is no handshake and no session id, so each request describes itself, carrying the protocol version and the client's capabilities in its meta field. That is what lets any server instance answer any request. Older servers still use the legacy initialize handshake, and clients support both.

## 6

Why must an MCP client include a resource parameter naming the MCP server when it requests an OAuth token?

A, so the authorisation server can rate-limit each MCP server separately. B, so the token is bound to that server, and is rejected if presented to another one. C, so the server can forward the token to the APIs behind it without re-authenticating. D, so the client does not need to implement PKCE for that server.

[think]

The answer is B: so the token is bound to that server, and is rejected if presented to another one.

The resource parameter fixes the token's audience. A token minted for the issues server is refused by the deploys server, so a compromised or malicious server cannot replay it elsewhere. Servers are separately forbidden from passing the client's token through to upstream APIs, and PKCE remains mandatory regardless.
