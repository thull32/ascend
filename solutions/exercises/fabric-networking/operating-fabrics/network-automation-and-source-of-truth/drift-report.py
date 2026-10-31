# Diff intended against running configuration as flat {path: value} trees: set what differs,
# delete what the device has beyond the intent, but only inside the sections this tool owns.


def drift_report(intended, running, managed):
    def owned(path):
        # a managed prefix owns itself and everything below it, on "/" boundaries only
        return any(path == m or path.startswith(m + "/") for m in managed)

    deletes = [["delete", p, running[p]] for p in sorted(running)
               if p not in intended and owned(p)]
    sets = [["set", p, intended[p]] for p in sorted(intended)
            if p not in running or running[p] != intended[p]]
    return deletes + sets
