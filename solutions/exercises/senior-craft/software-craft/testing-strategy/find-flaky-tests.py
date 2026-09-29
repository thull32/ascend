def find_flaky(runs):
    outcomes = {}
    for name, commit, passed in runs:
        outcomes.setdefault((name, commit), set()).add(passed)
    flaky = {name for (name, _commit), outs in outcomes.items() if len(outs) > 1}
    return sorted(flaky)
