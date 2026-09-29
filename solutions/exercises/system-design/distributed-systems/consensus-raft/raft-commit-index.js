function raft_commit_index(log_terms, current_term, match_index, commit_index) {
  const totalServers = match_index.length + 1;
  for (let n = log_terms.length; n > commit_index; n--) {
    let count = 1;
    for (const m of match_index) if (m >= n) count += 1;
    if (count * 2 > totalServers && log_terms[n - 1] === current_term) {
      return n;
    }
  }
  return commit_index;
}
