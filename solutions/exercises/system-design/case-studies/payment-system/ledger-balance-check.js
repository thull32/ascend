function check_ledger(entries) {
  const balances = {};
  const rejected = [];
  const acceptedIds = new Set();

  for (const [entryId, postings] of entries) {
    if (acceptedIds.has(entryId)) {
      rejected.push([entryId, "duplicate"]);
      continue;
    }
    if (postings.length < 2) {
      rejected.push([entryId, "too_few_postings"]);
      continue;
    }
    if (postings.some(([, amount]) => amount === 0)) {
      rejected.push([entryId, "zero_posting"]);
      continue;
    }

    const sums = {};
    for (const [, amount, currency] of postings) {
      sums[currency] = (sums[currency] || 0) + amount;
    }
    if (Object.values(sums).some(s => s !== 0)) {
      rejected.push([entryId, "unbalanced"]);
      continue;
    }

    acceptedIds.add(entryId);
    for (const [account, amount, currency] of postings) {
      if (!balances[account]) balances[account] = {};
      balances[account][currency] = (balances[account][currency] || 0) + amount;
    }
  }

  return { balances, rejected };
}
