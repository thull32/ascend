// Union-find on emails: union every email in an account with the account's
// first email, then group by root and attach an owner name.
function accounts_merge(accounts) {
  const parent = new Map();
  const owner = new Map();

  function find(x) {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  }

  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  for (const account of accounts) {
    const name = account[0], first = account[1];
    for (let i = 1; i < account.length; i++) {
      const email = account[i];
      if (!parent.has(email)) parent.set(email, email);
      owner.set(email, name);
      union(first, email);
    }
  }

  const groups = new Map();
  for (const email of parent.keys()) {
    const root = find(email);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(email);
  }
  const result = [];
  for (const [root, emails] of groups) {
    emails.sort();
    result.push([owner.get(root), ...emails]);
  }
  return result;
}
