---
lesson: ai-tool-security-and-policy
source: 2dd8d39b6989bd14
---
## 1

During a session, an agent read the environment file, and a production API key appeared in the transcript. Your vendor contract promises short retention. What should happen?

A, nothing, since the contract's short retention means the key will be purged. B, delete the conversation, which removes the transcript from the vendor too. C, rotate the key the same day, then add controls so the leak cannot recur. D, tell the agent to forget the key, and confirm it no longer appears in context.

[think]

The answer is C: rotate the key the same day, then add controls so the leak cannot recur.

Once sent, a secret must be treated as compromised. Retention is a promise about the future, deleting the conversation does not un-send the request or touch the transcript on your disk, and copies may exist in screenshots or monitoring. Rotation removes the risk; sandbox deny rules, egress limits and short-lived credentials fix the cause. A model cannot forget a request that already happened.

## 2

Your settings deny the file tool reading the environment file, and deny the shell command that prints it with cat. The agent then runs a Python one-liner that opens the file and prints it. Which control would have stopped it?

A, a memory-file instruction telling the agent never to read configuration files. B, a sandbox filesystem rule denying reads of the file, or no secret on the disk at all. C, a third deny rule naming python, since the first two did not mention it. D, listing the file in gitignore, which agents apply to their file reads.

[think]

The answer is B: a sandbox filesystem rule denying reads of the file, or no secret on the disk at all.

The file-tool rule covers the read tool, and at most the file commands a harness recognises, and the shell rule matches a string that does not appear; both stop only the shapes they name. A sandbox deny acts where the read happens and stops every shape, and a secret that is not on the machine cannot be read by any of them. Another string rule is one more entry in an unbounded list, instructions are requests, and gitignore is not an access control.

## 3

Why can an instruction hidden in a rules file pass code review, and still be followed by an agent?

A, reviewers only read the first hundred lines of any Markdown file. B, zero-width and tag characters render as nothing, but tokenize into text the model reads. C, agents load rules files without showing them in the diff, so review never sees them. D, rules files are exempt from review, because they contain no executable code.

[think]

The answer is B: zero-width and tag characters render as nothing, but tokenize into text the model reads.

Zero-width spaces, and the characters of the Unicode tag block, draw as nothing in editors and diff views, while the tokenizer turns them into ordinary tokens. A human sees a harmless line; the model sees the line plus the hidden instruction. A scanner in CI for those characters, and a sandbox so that a missed instruction finds nothing to steal, are the controls.

## 4

You want an agent to evaluate an unfamiliar open-source repository. What setup best limits the risk of instructions hidden in that repository?

A, a sandbox with no credentials, restricted network, and no auto-approved shell. B, only let it read Markdown and source files, never scripts or configuration. C, tell the agent to ignore any instructions it finds inside the repository. D, use the most capable model available, since it is best at spotting injection.

[think]

The answer is A: a sandbox with no credentials, restricted network, and no auto-approved shell.

The model cannot reliably filter out hidden instructions, and they can sit in any file, Markdown included. A sandbox without credentials, and with restricted network access, means a successful injection finds nothing to steal and no way to send it, and not auto-approving shell commands keeps you in the loop. Instructions and model choice lower the odds; they do not bound the damage.

## 5

An AI suggestion contains a 60-line function with distinctive comments, and something resembling a licence header. What is the right response?

A, delete the comments and the licence header, then keep the code as your own. B, search for its origin, then comply with the licence or write your own version. C, ask the model whether it copied the code, and accept it if it says no. D, accept it, since AI output cannot be copyrighted, and so carries no obligations.

[think]

The answer is B: search for its origin, then comply with the licence or write your own version.

Treat it as a possible verbatim copy. Reproducing licensed code can carry obligations however it arrived, and the copyright status of AI output does not change that. Stripping comments hides the provenance without changing it, and the model cannot reliably tell you where its output came from. A public-code filter compares only a short window of context, so it reduces the risk without removing the need to look.

## 6

Under a typical policy, which of these may be pasted into an approved enterprise AI tool?

A, the source of an internal utility module that contains no secrets. B, details of an unpatched vulnerability in your login flow, into any tool. C, a stack trace that includes the production database connection string. D, a sample of real customer emails, to test a new parser against.

[think]

The answer is A: the source of an internal utility module that contains no secrets.

Internal code without secrets is the use case approved tools exist for. Connection strings are credentials, customer emails are personal data, and unpatched vulnerability details follow the security team's process, rather than general-purpose tools.
