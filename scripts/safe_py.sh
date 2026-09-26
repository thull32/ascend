#!/usr/bin/env bash
# Run a Python script with hard resource limits (2 GiB address space, 60 s).
# Use this for ANY ad-hoc Python during content authoring so a runaway
# solution cannot exhaust the machine.
ulimit -v 2097152
exec timeout 60 python3 "$@"
