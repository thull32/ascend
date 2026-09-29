function fold_stream(events) {
  const state = {
    text: "",
    input_tokens: 0,
    output_tokens: 0,
    stop_reason: null,
    error: null,
    ignored: 0,
  };
  let finished = false;
  for (const e of events) {
    if (finished) {
      state.ignored += 1;
      continue;
    }
    switch (e.kind) {
      case "delta":
        state.text += e.text;
        break;
      case "done":
        state.input_tokens = e.input_tokens;
        state.output_tokens = e.output_tokens;
        state.stop_reason = e.stop_reason;
        finished = true;
        break;
      case "error":
        state.error = e.message;
        finished = true;
        break;
      default:
        state.ignored += 1;
    }
  }
  return state;
}
