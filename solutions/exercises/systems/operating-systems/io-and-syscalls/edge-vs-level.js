function epoll_reads(arrivals, chunk, mode) {
  const reads = [];
  let buffered = 0;
  for (const a of arrivals) {
    buffered += a;
    const reported = (mode === "level" && buffered > 0) || (mode === "edge" && a > 0);
    if (reported) {
      const take = Math.min(chunk, buffered);
      reads.push(take);
      buffered -= take;
    }
  }
  return { reads, unread: buffered };
}
