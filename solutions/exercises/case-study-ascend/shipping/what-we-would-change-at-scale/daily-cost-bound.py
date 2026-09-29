def daily_cost_bound_cents(
    users,
    daily_requests,
    daily_input_tokens,
    daily_output_tokens,
    max_input_tokens,
    max_tokens,
    input_cents,
    output_cents,
):
    if users == 0 or daily_requests == 0 or daily_input_tokens == 0 or daily_output_tokens == 0:
        return 0

    worst_output = min(daily_requests * max_tokens, daily_output_tokens - 1 + max_tokens)
    worst_input = min(
        daily_requests * max_input_tokens, daily_input_tokens - 1 + max_input_tokens
    )

    total_input = worst_input * users
    total_output = worst_output * users

    numerator = total_input * input_cents + total_output * output_cents
    return (numerator + 999999) // 1000000
