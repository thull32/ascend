---
slug: accounts-merge
title: Accounts Merge
difficulty: medium
patterns: [union-find]
lists: [ascend-150]
companies: [meta, google, amazon, linkedin, airbnb]
order: 2
lesson: interview-patterns/tree-and-graph-patterns/union-find-pattern
hints:
  - "Two accounts belong to the same person if they share an email, and this is transitive: A shares with B, B shares with C, so A and C are the same person even if they share nothing directly."
  - "Transitive grouping is connected components. Make each email a node and union every email in an account with that account's first email."
  - "After all unions, group emails by their root, sort each group, and attach the name of any account that contained that root. Names never decide merges; two different people can share a name."
signatures:
  python:
    name: accounts_merge
    starter: |
      def accounts_merge(accounts: list[list[str]]) -> list[list[str]]:
          pass
  javascript:
    name: accounts_merge
    starter: |
      function accounts_merge(accounts) {
      }
tests:
  - args: [[["Ana", "ana@x.io", "ana.w@x.io"], ["Ben", "ben@y.io"], ["Ana", "ana.w@x.io", "aw@z.io"], ["Ana", "ana2@q.io"]]]
    expected: [["Ana", "ana.w@x.io", "ana@x.io", "aw@z.io"], ["Ben", "ben@y.io"], ["Ana", "ana2@q.io"]]
    any_order: true
    label: two Anas merge, the third stays separate
  - args: [[["Kai", "k@a.com"]]]
    expected: [["Kai", "k@a.com"]]
    any_order: true
    label: single account
  - args: [[["Kai", "k@a.com", "k@a.com"]]]
    expected: [["Kai", "k@a.com"]]
    any_order: true
    label: duplicate email inside one account
  - args: [[["Lu", "a@m", "b@m"], ["Lu", "c@m", "d@m"], ["Lu", "b@m", "c@m"]]]
    expected: [["Lu", "a@m", "b@m", "c@m", "d@m"]]
    any_order: true
    label: a later account bridges two earlier ones
  - args: [[["Sam", "s1@p.com"], ["Sam", "s2@p.com"]]]
    expected: [["Sam", "s1@p.com"], ["Sam", "s2@p.com"]]
    any_order: true
    label: same name, different people
  - args: [[["Mo", "m@a.io"], ["Mo", "m@a.io", "mo@b.io"]]]
    expected: [["Mo", "m@a.io", "mo@b.io"]]
    any_order: true
  - args: [[["Ivy", "i1@v.net", "i2@v.net"], ["Jon", "j1@o.org"], ["Ivy", "i3@v.net"], ["Ivy", "i2@v.net", "i4@v.net"], ["Jon", "j2@o.org", "j1@o.org"], ["Ivy", "i4@v.net", "i3@v.net"]]]
    expected: [["Ivy", "i1@v.net", "i2@v.net", "i3@v.net", "i4@v.net"], ["Jon", "j1@o.org", "j2@o.org"]]
    any_order: true
    hidden: true
    label: chains of merges for two people
  - args: [[["Zed", "z@b.com", "a@b.com"], ["Amy", "amy@c.com"]]]
    expected: [["Zed", "a@b.com", "z@b.com"], ["Amy", "amy@c.com"]]
    any_order: true
    hidden: true
    label: emails are sorted even without a merge
time_limit_ms: 4000
---
You are given a list of `accounts`. Each account is a list whose first element is a person's name and whose remaining elements are email addresses registered to that account.

Two accounts belong to the same person if they have at least one email in common, and this relation is transitive: if account A shares an email with B, and B shares one with C, then A, B and C are all the same person. Different people may have the same name, so a shared name alone means nothing. All accounts of one person carry the same name.

Merge the accounts of each person. Return one entry per person: the name, followed by every email of that person **with duplicates removed and sorted** in ascending (ASCII) order. The people may be listed in any order.

### Examples

| Input | Output | Why |
|---|---|---|
| `[["Lu","a@m","b@m"],["Lu","c@m","d@m"],["Lu","b@m","c@m"]]` | `[["Lu","a@m","b@m","c@m","d@m"]]` | The third account shares `b@m` with the first and `c@m` with the second |
| `[["Sam","s1@p.com"],["Sam","s2@p.com"]]` | `[["Sam","s1@p.com"],["Sam","s2@p.com"]]` | No shared email, so two different people named Sam |
| `[["Zed","z@b.com","a@b.com"],["Amy","amy@c.com"]]` | `[["Zed","a@b.com","z@b.com"],["Amy","amy@c.com"]]` | No merges, but emails are still sorted |

### Constraints

- `1 ≤ len(accounts) ≤ 1000`
- `2 ≤ len(accounts[i]) ≤ 10`
- Emails and names are non-empty ASCII strings

### Follow-up

The interviewer asks: "This is the identity-resolution job for a company with 500 million user records spread across many machines. How would you run it?"

## Solution

### The naive approach

Repeatedly scan all pairs of accounts; whenever two share an email, merge them into one and start the scan again. Each scan is `O(A²·k)` for `A` accounts of up to `k` emails (using sets for the overlap test), and you may need up to `A` merges, so `O(A³·k)` in the worst case. It also makes the transitive case (the bridge account in the `Lu` example) easy to get wrong if you merge in a single pass.

### The insight

"Same person" is an equivalence relation built from direct evidence (shared emails) plus transitivity. Equivalence classes of a relation you learn pair by pair are **connected components**, and incremental connected components is the job of union-find.

Choose the nodes carefully. Emails are the natural nodes: an account says "all these emails belong together", which is a set of unions, and two accounts that share an email automatically end up in the same component through that email. You do not need edges between accounts at all. Within one account, union every email with the account's first email; that is `k - 1` unions instead of `k²` pairs.

Names are payload, not keys. Record for each email the name of an account that contained it, and read it off at the end.

### The optimal approach

1. For each account, for each email: register it (parent to itself if new) and remember its owner name. Union it with the account's first email.
2. Group every email by `find(email)`.
3. For each group, output `[name] + sorted(group)`.

Trace the `Lu` example. Account 1 unions `a@m` with `b@m`. Account 2 unions `c@m` with `d@m`. Two components so far. Account 3 unions `b@m` (first email) with `c@m`, and since `b@m` and `c@m` have different roots, the two components merge. Grouping by root gives one group of four emails.

```python
def accounts_merge(accounts: list[list[str]]) -> list[list[str]]:
    parent: dict[str, str] = {}
    owner: dict[str, str] = {}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]   # path halving
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for account in accounts:
        name, first = account[0], account[1]
        for email in account[1:]:
            parent.setdefault(email, email)
            owner[email] = name
            union(first, email)

    groups: dict[str, list[str]] = {}
    for email in parent:
        groups.setdefault(find(email), []).append(email)
    return [[owner[root]] + sorted(emails) for root, emails in groups.items()]
```

Time `O(E·α(E) + E log E)` for `E` total emails: near-linear unions plus the sort, which dominates. Space `O(E)`. The reference omits union by size for brevity; path halving alone keeps finds `O(log E)` amortised, and adding union by size brings it to `α(E)`.

A DFS works equally well: build an adjacency list linking each account's first email to its others, then find components by traversal. Union-find is the more natural fit because the input arrives as groups, not edges, and it is the version that scales to the follow-up.

### Common mistakes

- **Merging by name.** Two different people called Sam stay separate. Names are output decoration only.
- **Single-pass pairwise merging.** Comparing each account only with earlier ones misses the bridge case, where account 3 connects accounts 1 and 2 after both were processed.
- **Forgetting to deduplicate.** The same email can appear twice in one account or in several accounts; keying the parent map by email dedupes for free.
- **Sorting in the wrong place.** Sort each person's emails; the order of people does not matter here.

### How to discuss it

Say: "Shared email plus transitivity is an equivalence relation, so this is connected components. Emails are the nodes, each account is a set of unions, and names are just labels." That frames every later choice. Then point out the trap that two different people can have the same name; interviewers often plant exactly one test for it.

For the follow-up, 500 million records do not fit one machine's union-find. The production versions of this problem (identity resolution, entity resolution) run connected components as a distributed job: iterative label propagation where every node repeatedly takes the minimum label among its neighbours until nothing changes (the number of rounds grows with the component diameter, which is usually small in identity graphs), or algorithms that contract components so the number of rounds grows only logarithmically. Mention the operational reality too: one shared support address like `help@company.com` glued to thousands of accounts can merge unrelated people into a giant component, so real pipelines cap component size or down-weight high-degree identifiers before merging.
