def matrix_sensitivity(weights, scores):
    totals = [sum(w * s for w, s in zip(weights, opt)) for opt in scores]
    best = max(totals)
    winner = totals.index(best)

    flip_up = []
    flip_down = []

    for c in range(len(weights)):
        best_up = None
        best_down = None
        for j in range(len(scores)):
            if j == winner:
                continue
            gap = totals[winner] - totals[j]

            diff_up = scores[j][c] - scores[winner][c]
            if diff_up > 0:
                d = gap // diff_up + 1
                if best_up is None or d < best_up:
                    best_up = d

            diff_down = scores[winner][c] - scores[j][c]
            if diff_down > 0:
                d = gap // diff_down + 1
                if d <= weights[c] and (best_down is None or d < best_down):
                    best_down = d

        flip_up.append(best_up)
        flip_down.append(best_down)

    return {"totals": totals, "winner": winner, "flip_up": flip_up, "flip_down": flip_down}
