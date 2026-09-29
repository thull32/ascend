function dpo_loss(policy_chosen, policy_rejected, ref_chosen, ref_rejected, beta) {
  const margin = beta * ((policy_chosen - ref_chosen) - (policy_rejected - ref_rejected));
  let loss;
  if (margin >= 0) {
    loss = Math.log(1 + Math.exp(-margin));
  } else {
    loss = -margin + Math.log(1 + Math.exp(margin));
  }
  return [margin, loss];
}
