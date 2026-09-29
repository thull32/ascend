function daily_cost_bound_cents(
  users,
  daily_requests,
  daily_input_tokens,
  daily_output_tokens,
  max_input_tokens,
  max_tokens,
  input_cents,
  output_cents
) {
  if (
    users === 0 ||
    daily_requests === 0 ||
    daily_input_tokens === 0 ||
    daily_output_tokens === 0
  ) {
    return 0;
  }

  const worstOutput = Math.min(
    daily_requests * max_tokens,
    daily_output_tokens - 1 + max_tokens
  );
  const worstInput = Math.min(
    daily_requests * max_input_tokens,
    daily_input_tokens - 1 + max_input_tokens
  );

  const totalInput = worstInput * users;
  const totalOutput = worstOutput * users;

  const numerator = totalInput * input_cents + totalOutput * output_cents;
  return Math.floor((numerator + 999999) / 1000000);
}
