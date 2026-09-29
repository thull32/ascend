import math


def dpo_loss(policy_chosen, policy_rejected, ref_chosen, ref_rejected, beta):
    margin = beta * ((policy_chosen - ref_chosen) - (policy_rejected - ref_rejected))
    if margin >= 0:
        loss = math.log(1 + math.exp(-margin))
    else:
        loss = -margin + math.log(1 + math.exp(margin))
    return [margin, loss]
