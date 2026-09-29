# Server side: the grader prepends harness.py and runs this with CPython for
# WASI inside the sandbox. It reports what the learner's code returned; it
# never sees expected values.
#
# Input (stdin): {"code": str, "entry": str, "cases": [[arg, ...], ...]}
# Output (stdout): one line per event, each prefixed with RS (\x1e):
#   {"compile_error": str} | {"case": i, "actual": v, "error": str|null, "ms": f} | {"done": true}
import io, sys

_out = sys.stdout

def _emit(event):
    _out.write("\x1e" + json.dumps(event, allow_nan=False) + "\n")
    _out.flush()

def _main():
    job = json.loads(sys.stdin.read())
    # The learner's prints go nowhere: only the harness writes to stdout.
    sys.stdout = io.StringIO()
    target, err = load(job["code"], job["entry"])
    if err is not None:
        _emit({"compile_error": err})
        return
    for i, args in enumerate(job["cases"]):
        sys.stdout = io.StringIO()
        actual, error, ms = run_case(target, args)
        try:
            _emit({"case": i, "actual": actual, "error": error, "ms": ms})
        except (TypeError, ValueError) as e:
            _emit({"case": i, "actual": None, "error": f"the result could not be serialised: {e}", "ms": ms})
    _emit({"done": True})

_main()
