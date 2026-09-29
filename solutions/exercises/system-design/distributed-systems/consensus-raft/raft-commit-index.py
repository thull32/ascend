def raft_commit_index(log_terms, current_term, match_index, commit_index):
    total_servers = len(match_index) + 1
    for n in range(len(log_terms), commit_index, -1):
        count = 1 + sum(1 for m in match_index if m >= n)
        if count * 2 > total_servers and log_terms[n - 1] == current_term:
            return n
    return commit_index
