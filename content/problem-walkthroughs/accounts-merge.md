---
problem: accounts-merge
args: [[["Lu", "a@m", "b@m"], ["Lu", "c@m", "d@m"], ["Lu", "b@m", "c@m"]]]
frames: 138
source: 04304c03ff1ce419
---
@0-4
Three accounts, all named Lu. The first holds emails a and b, the second c and d, and the third b and c. The name proves nothing, because two different people can share it. What proves two accounts are one person is a shared email, and that evidence chains: if the first account meets the third, and the third meets the second, all three are one person. That is connected components, and the tool for components you learn piece by piece is union-find. The nodes are the emails, not the accounts. We set up two maps: parent, which points each email towards the root of its group, and owner, which remembers a name for each email. Then two helpers: find walks up to a root, and union joins two roots.

@5-9
The first account. Its name is Lu and its first email is a. Every email in an account gets joined to that first email, which is one union per email instead of one per pair. Email a is new, so it becomes its own parent, its owner is Lu, and we union it with itself.

@10-18
Both finds return a, the roots are equal, and union does nothing. Harmless.

@19-33
Now email b. It starts as its own parent. Union of a and b finds two different roots, a and b, so b's parent becomes a. Look at the parent map: b now points to a. One group of two.

@34-63
The second account does the same with its own emails. Its first email is c. Union of c with itself does nothing; union of c and d makes d point to c. Now there are two groups: a with b, and c with d. Nothing links them yet.

@64-69
The third account is the bridge. Its first email is b. Both b and c are already registered, so setdefault leaves their parents alone; it only fills in emails it has never seen. That is also how duplicate emails are removed for free.

@70-84
Union of b with itself. Find starts at b, whose parent is a, so it climbs once and returns a. The line inside the loop is path halving: it points each node at its grandparent as it climbs, which keeps the trees shallow. Here b already points straight at the root, so nothing changes.

@85-101
Now the union that matters: b and c. Find of b returns a. Find of c returns c, because c is still the root of its own group. The roots differ, so c's parent becomes a. At this moment the two groups are one. Notice that d still points to c, not to a; it does not need to know yet.

@102-117
All accounts are done. To read off the groups, we walk every email and group it by its root. Email a's root is a. Email b climbs to a.

@118-125
Email c climbs to a as well.

@126-133
Email d is the interesting one. Its parent is c, and c's parent is a. Path halving sets d's parent to its grandparent, a, and the next check finds a is a root. So d joins the same group, and the tree got flatter on the way.

@134-137
One group, rooted at a, holding all four emails. We output the owner's name, Lu, followed by the emails sorted: a, b, c, d. The cost is nearly linear for the unions, plus the sort of each person's emails, which dominates.

The traps this problem sets are merging by name, which wrongly merges two different people called Sam, and merging accounts in a single pass against earlier ones only, which misses exactly this bridge: the third account connecting two groups that were both finished before it arrived.
