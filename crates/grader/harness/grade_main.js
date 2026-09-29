// Server side: the grader prepends runner.js (exports stripped) and runs this
// in QuickJS inside the sandbox. It reports what the learner's code
// returned; it never sees expected values.
//
// Input (stdin): {"code": str, "entry": str, "cases": [[arg, ...], ...]}
// Output (stdout): one line per event, each prefixed with RS (\x1e):
//   {"compile_error": str} | {"case": i, "actual": v, "error": str|null, "ms": f} | {"done": true}
const job = JSON.parse(std.in.readAsString());
const out = std.out;
const emit = (event) => {
  out.puts("\x1e" + JSON.stringify(event) + "\n");
  out.flush();
};
// Learner code gets no host modules (there is nothing behind them in the
// sandbox anyway) and no way to print except the captured console.
for (const name of ["std", "os", "bjson", "print"]) {
  try {
    delete globalThis[name];
  } catch {
    globalThis[name] = undefined;
  }
}
const noop = () => {};
const quiet = { log: noop, error: noop, warn: noop, info: noop, debug: noop };
globalThis.console = quiet;

const loaded = load(job.code, job.entry, quiet);
if ("error" in loaded) {
  emit({ compile_error: loaded.error });
} else {
  job.cases.forEach((args, i) => {
    const start = performance.now();
    const { actual, error } = runCase(loaded, args);
    const ms = performance.now() - start;
    try {
      emit({ case: i, actual, error, ms });
    } catch (e) {
      emit({ case: i, actual: null, error: `the result could not be serialised: ${errorText(e)}`, ms });
    }
  });
  emit({ done: true });
}
