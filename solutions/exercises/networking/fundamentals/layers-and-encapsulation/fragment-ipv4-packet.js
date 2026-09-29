function fragment_ipv4(total_length, header_len, mtu, df) {
  if (total_length <= mtu) {
    return [[0, total_length, false]];
  }

  if (df) {
    return `ICMP frag-needed mtu=${mtu}`;
  }

  const payload = total_length - header_len;
  const perFragPayload = Math.floor((mtu - header_len) / 8) * 8;

  const fragments = [];
  let sent = 0;
  while (sent < payload) {
    const remaining = payload - sent;
    let chunk, more;
    if (remaining > perFragPayload) {
      chunk = perFragPayload;
      more = true;
    } else {
      chunk = remaining;
      more = false;
    }
    const offset = sent / 8;
    fragments.push([offset, header_len + chunk, more]);
    sent += chunk;
  }

  return fragments;
}
