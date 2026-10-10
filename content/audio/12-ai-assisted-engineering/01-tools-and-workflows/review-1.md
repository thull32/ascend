---
review: tools-and-workflows
source: 935f29a80e49a7bd
---
## Introduction

Twelve questions from the tools and workflows module: the tool landscape, the agentic coding loop, writing specs, context management, MCP and integrations, verifying AI-written code, and security and policy. Each has four options. Answer out loud before the answer comes.

## Question 1

In the agent loop, the model emits a call to delete a directory. Which component decides whether the deletion happens?

A, the model, which checks its own instructions before emitting the call. B, the operating system, which refuses deletions requested by AI processes. C, the MCP server, which validates every call against its schema first. D, the harness, which applies permission rules or asks you before executing.

[think]

The answer is D: the harness. The model only produces a structured request. The harness validates it, runs it through allow, ask and deny rules or a prompt to you, and only then executes it, and a sandbox underneath can still refuse regardless. The operating system has no notion of an AI process, and an MCP server only sees calls the harness has already decided to forward.

## Question 2

In one step, the agent writes a page-count function using floor division, and a test asserting that 7 items at 3 per page make 2 pages. The spec says pages round up. What most likely happened?

A, the test's expected value came from running the code, so it pins the bug. B, the spec was ambiguous, so both the code and the test are acceptable. C, floor division is correct here, and the spec is wrong about rounding. D, the agent chose the wrong test framework, which rounds down by default.

[think]

The answer is A: the expected value came from running the code, so the test pins the bug. A test written in the same step as the implementation, from the same understanding, often takes its expected value from whatever the code produced. It passes and locks the bug in. Expected values must be derived from the spec, by hand, before the implementation exists, which is why the loop writes and inspects failing tests first.

## Question 3

You told the agent not to modify the test file, and it did anyway during a long failing loop. Which setup prevents writes through every tool?

A, ask the agent to confirm it understood the instruction before it starts. B, repeat the instruction at the top of the memory file in capital letters. C, mount the reviewed tests read-only in a sandbox whose policy the agent cannot change. D, switch to a larger model that follows instructions more reliably.

[think]

The answer is C: a read-only mount in a sandbox the agent cannot change. That is enforced outside the agent's control, so it prevents writes whichever tool attempts them. A hook on the editor tools denies matching edits but leaves shell commands and other write paths uncovered. Instructions, confirmations and bigger models do not remove the capability, and an independent check against the reviewed baseline confirms the right tests are the ones being run.

## Question 4

An agent implements pagination with offsets, a page size of 20 and a total count, although your codebase uses cursor pagination capped at 100. What is the root cause?

A, the agent found the wiki convention but ignored it, as agents often ignore guidance. B, offset pagination is the safer default, so the agent rightly overrode the convention. C, the spec never stated those decisions, so the model filled them with its own defaults. D, the model was too small for API work, and a larger one would have inferred the convention.

[think]

The answer is C: the spec never stated those decisions. Every decision you do not write down is made by the model's defaults, and offset pagination is among the most common patterns in public code. The wiki page was invisible to the agent, and a more capable model would still have had to guess. Pointing the agent at the existing cursor implementation, or stating the convention, fixes it.

## Question 5

A monorepo has a root AGENTS.md file saying "use npm", and another in the web folder saying "use pnpm". An agent edits a file under the web folder. In tools that support nested files, which instruction applies?

A, both are sent, and the model picks whichever it reads first. B, the web folder's file, because the closest file to the edited code wins. C, neither, because a conflict makes the tool ignore both files and ask. D, the root file, because repository-wide instructions take priority over local ones.

[think]

The answer is B: the web folder's file, because the closest file wins. Nesting is designed so the closer file overrides. Codex concatenates from the root down so the closer file comes last, Cursor and Copilot apply the nearest one, and the convention's own rule is that the closest file wins, with chat prompts overriding everything. The right fix is still to delete the duplicate, so one convention lives in one place.

## Question 6

An eight-iteration agent session ends with a transcript of about 44 thousand tokens. Roughly how many input tokens did the model process over the whole session, and why?

A, about 200 thousand, because the growing transcript is resent on every iteration. B, about 44 thousand, because the transcript is only sent once, at the end. C, about 88 thousand, because each iteration sends the transcript plus its own output. D, about 8 thousand, because caching means only new tokens are ever processed.

[think]

The answer is A: about 200 thousand. Every call resends everything so far, so the total is the sum of the transcript sizes over all the iterations, which grows roughly with the square of the iteration count. In the traced example it was just under 200 thousand for a final transcript of about 44 thousand. Caching changes what is billed and how fast the prompt is processed, not how many tokens the model attends over.

## Question 7

A subagent reads 40 files and returns a 400-token summary to the main session. What is the main benefit?

A, the summary is more accurate than the files, since the noise is removed. B, the main context grows by the summary, not by all the tokens of reading. C, the subagent has edit permissions on files the main agent cannot touch. D, the subagent uses a cheaper model, so all that reading costs less overall.

[think]

The answer is B: the main context grows by the summary, not by the reading. Delegation isolates exploration. The main session grows by 400 tokens rather than the tens of thousands the subagent read, so it keeps its constraints and plan in a small window. The trade-off is that the summary is lossy, not more accurate, so you delegate surveys and questions, never the decision itself.

## Question 8

An agent reads public GitHub issues, has your cloud credentials in its environment, and can post comments. Which change most reduces the risk of those credentials being exfiltrated?

A, only triage issues under a thousand characters, so injected payloads cannot fit. B, use a larger model that is better at detecting prompt injection attempts. C, run it with no credentials, and require approval of each comment's exact text. D, add a system prompt telling it to ignore any instructions found in issues.

[think]

The answer is C: no credentials, and approval of each comment's exact text. This is the lethal trifecta: private data, untrusted content and external communication in one agent. Removing the credentials and gating the outbound channel removes legs of the trifecta, which is the safe configuration in the lesson's traced attack. Instructions and model choice reduce the odds of a successful injection, but they do not remove the capability.

## Question 9

Mutation testing reports that deleting the guard against pages below 1 does not fail any test, although there is a test for page zero. What is the most likely explanation?

A, the page-zero test checks only that the items are empty, which still holds without the guard. B, the guard is dead code, because page zero can never reach the function. C, the test runner caches results, so the mutant was never actually executed. D, the mutation tool cannot mutate guard clauses reliably, so the report is noise.

[think]

The answer is A: the page-zero test checks only that the items are empty. With the guard removed, page zero gives a negative start index and an empty slice, so an assertion on the items alone still passes, while the result wrongly says there is a next page. The surviving mutant exposes a weak assertion, and comparing the whole result kills it. Mutation tools mutate guards fine, the code is reachable, and a survivor means no test told the mutant apart.

## Question 10

An AI-generated change adds a dependency you have never heard of. Which check matters most before approving?

A, that the agent confirms it is widely used and actively maintained. B, that it exists, is the project you intended, is pinned, and is needed. C, that it has a permissive licence compatible with your product's licence. D, that it has more than 100 GitHub stars and a commit in the last year.

[think]

The answer is B: that it exists, is the project you intended, is pinned, and is needed. Models sometimes name packages that do not exist, the same names recur, and attackers register them so agents install them. That is called slopsquatting, and a typo of a real name carries the same risk. Licence matters too, but a malicious package is the larger immediate risk, stars can be faked, and the agent's word is not verification.

## Question 11

During a session, an agent read the environment file and a production API key appeared in the transcript. Your vendor contract promises short retention. What should happen?

A, nothing, since the contract's short retention means the key will be purged. B, delete the conversation, which removes the transcript from the vendor too. C, rotate the key the same day, then add controls so the leak cannot recur. D, tell the agent to forget the key and confirm it no longer appears in context.

[think]

The answer is C: rotate the key the same day, then fix the cause. Once sent, a secret must be treated as compromised. Retention is a promise about the future, deleting the conversation does not un-send the request or touch the transcript on your own disk, and copies may exist in screenshots or monitoring. Rotation removes the risk; sandbox deny rules, egress limits and short-lived credentials fix the cause. A model cannot forget a request that already happened.

## Question 12

Your settings deny the file tool reading the environment file, and deny the shell command that prints it with cat. The agent then runs a Python one-liner that opens the file and prints it. Which control would have stopped it?

A, a memory-file instruction telling the agent never to read configuration files. B, a sandbox filesystem rule denying reads of the file, or no secret on the disk at all. C, a third deny rule naming python, since the first two did not mention it. D, listing the file in gitignore, which agents apply to their file reads.

[think]

The answer is B: a sandbox rule denying the read, or no secret on the disk at all. The file-tool rule covers that tool and at most the file commands the harness recognises, and the shell rule matches a string that never appears; both stop only the shapes they name. A sandbox deny acts where the read happens, so it stops every shape, and a secret that is not on the machine cannot be read by any of them. Another string rule is one more entry in an endless list, instructions are requests, and gitignore is not an access control.

## Recap

Three ideas kept coming back. The model only proposes; the harness, the credentials and the sandbox decide, so the controls that hold are the ones enforced outside the model: read-only mounts, sandboxes, least-privilege credentials, and secrets that are simply not there. Unwritten decisions and untrusted evidence get filled by defaults: write the spec down, derive expected values from it, and treat a test that agrees with the code as weak evidence until something independent, a property, a mutant, a hand trace, says otherwise. And the context window is the agent's whole world, resent on every call, so keep it small on purpose and delegate surveys rather than decisions.
