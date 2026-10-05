//! The WebAssembly sandbox: compiled runtimes, per-run stores and limits.
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::Semaphore;
use wasmtime::{Config, Engine, InstancePre, Linker, Module, Store, StoreLimits, StoreLimitsBuilder, Trap};
use wasmtime_wasi::p1::{self, WasiP1Ctx};
use wasmtime_wasi::p2::pipe::{MemoryInputPipe, MemoryOutputPipe};
use wasmtime_wasi::{FsPerms, I32Exit, WasiCtxBuilder};

use crate::{CaseRun, GradeError, Job, Language, Options, Outcome, Stop};

/// The programs the sandbox runs, assembled from the harness files the
/// browser shares. JavaScript `export`s are stripped because QuickJS runs
/// them as one script (`-e`); the shared files keep every export a plain
/// `export function` / `export const` so that is a textual change.
static HARNESS_PY: LazyLock<String> = LazyLock::new(|| {
    format!("{}\n{}", include_str!("../harness/harness.py"), include_str!("../harness/grade_main.py"))
});
static HARNESS_JS: LazyLock<String> = LazyLock::new(|| {
    format!("{}\n{}", strip_exports(include_str!("../harness/runner.js")), include_str!("../harness/grade_main.js"))
});
static COMPARE_JS: LazyLock<String> = LazyLock::new(|| {
    format!("{}\n{}", strip_exports(include_str!("../harness/compare.js")), include_str!("../harness/compare_main.js"))
});

fn strip_exports(module: &str) -> String {
    module.replace("export function ", "function ").replace("export const ", "const ")
}

/// Epoch ticks are how the engine interrupts a run that is out of time.
const TICK: Duration = Duration::from_millis(10);
/// Interpreter start-up on top of the per-case budget. CPython imports its
/// standard library (about 0.1 s with precompiled bytecode); QuickJS starts
/// in a few milliseconds.
const PYTHON_STARTUP: Duration = Duration::from_secs(3);
const JS_STARTUP: Duration = Duration::from_secs(1);
/// Harness output is one line per case; results are capped well below this.
const STDOUT_CAP: usize = 8 << 20;
const STDERR_CAP: usize = 64 << 10;
/// Comparing is trusted, linear work on data the run already produced.
const COMPARE_BUDGET: Duration = Duration::from_secs(5);
/// Record separator that marks harness lines in stdout.
const RS: char = '\u{1e}';

struct Host {
    wasi: WasiP1Ctx,
    limits: StoreLimits,
}

struct Inner {
    engine: Engine,
    python: InstancePre<Host>,
    javascript: InstancePre<Host>,
    python_lib: PathBuf,
    slots: Semaphore,
    options: Options,
    ticking: Arc<AtomicBool>,
}

impl Drop for Inner {
    fn drop(&mut self) {
        self.ticking.store(false, Ordering::Relaxed);
    }
}

/// Grades code. Cheap to clone; clones share the compiled runtimes.
#[derive(Clone)]
pub struct Grader {
    inner: Arc<Inner>,
}

fn engine() -> Result<Engine, GradeError> {
    let mut config = Config::new();
    config.epoch_interruption(true);
    // Room for recursive solutions: CPython and QuickJS recurse in C for
    // each call in the learner's code.
    config.max_wasm_stack(8 << 20);
    // WASI support builds the engine with async enabled, which requires the
    // (unused) async stack to be at least as large.
    config.async_stack_size(9 << 20);
    Engine::new(&config).map_err(internal)
}

fn internal(e: impl std::fmt::Display) -> GradeError {
    GradeError::Internal(e.to_string())
}

fn stdlib_dir(dir: &Path) -> PathBuf {
    dir.join("lib")
}

impl Grader {
    /// Loads and compiles the runtimes in `dir`. Compiling takes a second or
    /// two of CPU, so call it from a blocking context.
    pub fn load(dir: &Path, options: Options) -> Result<Self, GradeError> {
        let (python_wasm, js_wasm, lib) = (dir.join("python.wasm"), dir.join("qjs.wasm"), stdlib_dir(dir));
        if !python_wasm.is_file() || !js_wasm.is_file() || !lib.is_dir() {
            return Err(GradeError::Missing(dir.to_path_buf()));
        }
        let engine = engine()?;
        let mut linker: Linker<Host> = Linker::new(&engine);
        p1::add_to_linker_sync(&mut linker, |h: &mut Host| &mut h.wasi).map_err(internal)?;
        let compile = |path: &Path| -> Result<InstancePre<Host>, GradeError> {
            let module = match load_precompiled(&engine, path) {
                Some(module) => module,
                None => Module::from_file(&engine, path).map_err(internal)?,
            };
            linker.instantiate_pre(&module).map_err(internal)
        };
        let python = compile(&python_wasm)?;
        let javascript = compile(&js_wasm)?;

        // One thread advances the epoch for every store; a store whose
        // deadline has passed traps at its next check.
        let ticking = Arc::new(AtomicBool::new(true));
        {
            let (engine, ticking) = (engine.weak(), ticking.clone());
            std::thread::Builder::new()
                .name("grader-epoch".into())
                .spawn(move || {
                    while ticking.load(Ordering::Relaxed) {
                        std::thread::sleep(TICK);
                        match engine.upgrade() {
                            Some(e) => e.increment_epoch(),
                            None => break,
                        }
                    }
                })
                .map_err(internal)?;
        }
        let slots = Semaphore::new(options.slots.max(1));
        Ok(Self { inner: Arc::new(Inner { engine, python, javascript, python_lib: lib, slots, options, ticking }) })
    }

    /// Runs a job once a slot is free. Refuses with [`GradeError::Busy`] if
    /// none frees up within the queue timeout.
    pub async fn run(&self, job: Job) -> Result<Outcome, GradeError> {
        let permit = tokio::time::timeout(self.inner.options.queue_timeout, self.inner.slots.acquire())
            .await
            .map_err(|_| GradeError::Busy)?
            .map_err(internal)?;
        let inner = self.inner.clone();
        let outcome = on_own_thread(move || run_blocking(&inner, &job)).await;
        drop(permit);
        outcome
    }
}

impl Grader {
    /// (slots in use, total slots) on this instance.
    pub fn slots(&self) -> (usize, usize) {
        let total = self.inner.options.slots.max(1);
        (total.saturating_sub(self.inner.slots.available_permits()), total)
    }

    /// Compares `(expected, actual, any_order)` triples with the shared rule
    /// (compare.js in QuickJS), as grading does. For tests and tools.
    pub async fn compare(&self, items: Vec<(Value, Value, bool)>) -> Result<Vec<bool>, GradeError> {
        let inner = self.inner.clone();
        on_own_thread(move || compare_blocking(&inner, items)).await
    }
}

/// Guest code runs on the calling thread's native stack, so a thread must
/// have room for the whole wasm stack plus the host's frames. Tokio's
/// threads have 2 MiB; a deep recursion would overflow them and abort the
/// process. Each run gets its own thread instead (cheap next to a run).
const THREAD_STACK: usize = 16 << 20;

async fn on_own_thread<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, GradeError> + Send + 'static,
) -> Result<T, GradeError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    std::thread::Builder::new()
        .name("grader-run".into())
        .stack_size(THREAD_STACK)
        .spawn(move || {
            let _ = tx.send(f());
        })
        .map_err(internal)?;
    rx.await.map_err(|_| GradeError::Internal("grading thread panicked".into()))?
}

fn run_blocking(inner: &Inner, job: &Job) -> Result<Outcome, GradeError> {
    let input = serde_json::to_vec(&serde_json::json!({"code": job.code, "entry": job.entry, "cases": job.cases}))
        .map_err(internal)?;
    let stdout = MemoryOutputPipe::new(STDOUT_CAP);
    let stderr = MemoryOutputPipe::new(STDERR_CAP);
    let mut wasi = WasiCtxBuilder::new();
    wasi.stdin(MemoryInputPipe::new(input)).stdout(stdout.clone()).stderr(stderr.clone());
    let (pre, startup) = match job.language {
        Language::Python => {
            // -I: ignore the environment and user site; -S: no site module;
            // -B: never write bytecode (the library is read-only anyway).
            wasi.args(&["python", "-I", "-S", "-B", "-c", HARNESS_PY.as_str()]);
            wasi.preopened_dir(&inner.python_lib, "/lib", FsPerms::ReadOnly).map_err(internal)?;
            (&inner.python, PYTHON_STARTUP)
        }
        Language::JavaScript => {
            wasi.args(&["qjs", "--std", "-e", HARNESS_JS.as_str()]);
            (&inner.javascript, JS_STARTUP)
        }
    };
    let limits = StoreLimitsBuilder::new().memory_size(inner.options.memory_limit).instances(1).build();
    let mut store = Store::new(&inner.engine, Host { wasi: wasi.build_p1(), limits });
    store.limiter(|h| &mut h.limits);
    let cases = u32::try_from(job.cases.len().max(1)).unwrap_or(u32::MAX);
    let budget = job.time_limit.saturating_mul(cases) + startup;
    store.set_epoch_deadline((budget.as_millis() / TICK.as_millis()).max(1) as u64);
    store.epoch_deadline_trap();

    let started = Instant::now();
    let instance = pre.instantiate(&mut store).map_err(internal)?;
    let main = instance.get_typed_func::<(), ()>(&mut store, "_start").map_err(internal)?;
    let result = main.call(&mut store, ());
    let elapsed = started.elapsed();

    let stopped = match &result {
        Ok(()) => None,
        Err(e) if e.downcast_ref::<I32Exit>().is_some_and(|x| x.0 == 0) => None,
        Err(e) => Some(match e.downcast_ref::<Trap>() {
            Some(Trap::Interrupt) => Stop::TimeLimit,
            Some(Trap::StackOverflow) => Stop::StackOverflow,
            _ => Stop::Crashed(tail(&stderr.contents())),
        }),
    };
    let mut outcome = parse(&stdout.contents(), job.cases.len());
    // A clean exit without the harness's final line means the learner's code
    // exited the process (sys.exit, std.exit) or the harness itself failed.
    if stopped.is_none() && !outcome.done && outcome.compile_error.is_none() {
        outcome.stopped = Some(Stop::Crashed(tail(&stderr.contents())));
    } else {
        outcome.stopped = stopped.filter(|_| !outcome.done);
    }
    // Compare on the host side, in a fresh instance that runs only trusted
    // code (compare.js) on data: the expected values and what the learner's
    // code returned. The learner's instance never saw the expected values.
    let items: Vec<(usize, Value, Value, bool)> = outcome
        .cases
        .iter()
        .enumerate()
        .filter_map(|(i, c)| {
            let c = c.as_ref().filter(|c| c.error.is_none())?;
            let e = job.expected.get(i)?;
            Some((i, e.value.clone(), c.actual.clone(), e.any_order))
        })
        .collect();
    let mut passed = vec![false; job.cases.len()];
    if !items.is_empty() {
        let verdicts = compare_blocking(inner, items.iter().map(|(_, e, a, o)| (e.clone(), a.clone(), *o)).collect())?;
        for ((i, ..), ok) in items.iter().zip(verdicts) {
            passed[*i] = ok;
        }
    }
    Ok(Outcome {
        compile_error: outcome.compile_error,
        cases: outcome.cases,
        passed,
        stopped: outcome.stopped,
        budget,
        elapsed,
    })
}

/// Runs compare.js over `(expected, actual, any_order)` triples.
fn compare_blocking(inner: &Inner, items: Vec<(Value, Value, bool)>) -> Result<Vec<bool>, GradeError> {
    let n = items.len();
    let input = serde_json::to_vec(&serde_json::json!({ "items": items
        .into_iter()
        .map(|(e, a, o)| serde_json::json!([e, a, o]))
        .collect::<Vec<_>>() }))
    .map_err(internal)?;
    let stdout = MemoryOutputPipe::new(1 << 20);
    let stderr = MemoryOutputPipe::new(STDERR_CAP);
    let mut wasi = WasiCtxBuilder::new();
    wasi.stdin(MemoryInputPipe::new(input)).stdout(stdout.clone()).stderr(stderr.clone());
    wasi.args(&["qjs", "--std", "-e", COMPARE_JS.as_str()]);
    let limits = StoreLimitsBuilder::new().memory_size(inner.options.memory_limit).instances(1).build();
    let mut store = Store::new(&inner.engine, Host { wasi: wasi.build_p1(), limits });
    store.limiter(|h| &mut h.limits);
    store.set_epoch_deadline(COMPARE_BUDGET.as_millis() as u64 / TICK.as_millis() as u64);
    store.epoch_deadline_trap();
    let instance = inner.javascript.instantiate(&mut store).map_err(internal)?;
    let main = instance.get_typed_func::<(), ()>(&mut store, "_start").map_err(internal)?;
    match main.call(&mut store, ()) {
        Ok(()) => {}
        Err(e) if e.downcast_ref::<I32Exit>().is_some_and(|x| x.0 == 0) => {}
        Err(e) => return Err(GradeError::Internal(format!("compare failed: {e}; {}", tail(&stderr.contents())))),
    }
    let verdicts: Vec<bool> = serde_json::from_slice(&stdout.contents())
        .map_err(|e| GradeError::Internal(format!("compare output: {e}; {}", tail(&stderr.contents()))))?;
    if verdicts.len() != n {
        return Err(GradeError::Internal(format!("compare returned {} verdicts for {n} items", verdicts.len())));
    }
    Ok(verdicts)
}

struct Parsed {
    compile_error: Option<String>,
    cases: Vec<Option<CaseRun>>,
    stopped: Option<Stop>,
    done: bool,
}

/// Reads the harness's lines. The last report for a case wins; lines without
/// the marker (and malformed ones) are ignored.
fn parse(stdout: &[u8], n: usize) -> Parsed {
    let mut parsed = Parsed { compile_error: None, cases: vec![None; n], stopped: None, done: false };
    for line in String::from_utf8_lossy(stdout).lines() {
        let Some(body) = line.strip_prefix(RS) else { continue };
        let Ok(Value::Object(event)) = serde_json::from_str::<Value>(body) else { continue };
        if let Some(Value::String(e)) = event.get("compile_error") {
            parsed.compile_error = Some(e.clone());
        } else if let Some(i) = event.get("case").and_then(Value::as_u64) {
            let slot = usize::try_from(i).ok().and_then(|i| parsed.cases.get_mut(i));
            if let Some(slot) = slot {
                *slot = Some(CaseRun {
                    actual: event.get("actual").cloned().unwrap_or(Value::Null),
                    error: event.get("error").and_then(Value::as_str).map(str::to_owned),
                    ms: event.get("ms").and_then(Value::as_f64).unwrap_or(0.0),
                });
            }
        } else if event.get("done") == Some(&Value::Bool(true)) {
            parsed.done = true;
        }
    }
    parsed
}

/// The last few lines of the interpreter's own error output.
fn tail(stderr: &[u8]) -> String {
    let text = String::from_utf8_lossy(stderr);
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(4)..].join("\n").chars().take(1000).collect()
}

/// The module compiled ahead of time next to `wasm` (`python.cwasm` for
/// `python.wasm`), if there is one this engine can use.
///
/// Compiling at boot puts the machine code (a few hundred MB for CPython) in
/// anonymous memory that a host bills for as long as the process lives. A
/// precompiled file is mapped instead: its pages are file-backed, loaded on
/// first use and reclaimable, and boot skips the compile. Wasmtime refuses a
/// file built by another Wasmtime version, engine configuration or CPU
/// feature set; then this returns `None` and the caller compiles as before.
fn load_precompiled(engine: &Engine, wasm: &Path) -> Option<Module> {
    let cwasm = wasm.with_extension("cwasm");
    if !cwasm.is_file() {
        return None;
    }
    // SAFETY: deserialising trusts the file to be Wasmtime's own output.
    // These are written by `precompile_modules` at image build time, from
    // the same binary, into the read-only runtime directory.
    match unsafe { Module::deserialize_file(engine, &cwasm) } {
        Ok(module) => Some(module),
        Err(e) => {
            tracing::warn!(file = %cwasm.display(), error = %e, "precompiled module unusable; compiling instead");
            None
        }
    }
}

/// Compiles `python.wasm` and `qjs.wasm` in `dir` ahead of time to
/// `python.cwasm` and `qjs.cwasm` (see [`load_precompiled`]).
fn precompile_modules(engine: &Engine, dir: &Path) -> Result<(), GradeError> {
    for name in ["python", "qjs"] {
        let wasm = dir.join(format!("{name}.wasm"));
        let bytes = std::fs::read(&wasm).map_err(internal)?;
        let compiled = engine.precompile_module(&bytes).map_err(internal)?;
        std::fs::write(wasm.with_extension("cwasm"), compiled).map_err(internal)?;
    }
    Ok(())
}

/// Compiles the Python standard library in `dir` to bytecode, with the same
/// interpreter that will import it, so each run skips parsing the modules it
/// imports (about 0.2 s saved per run), and compiles both runtimes ahead of
/// time ([`precompile_modules`]). Needs write access to `dir`; used
/// once when preparing the runtimes (the Docker build, `make grader`).
pub fn precompile_stdlib(dir: &Path) -> Result<(), GradeError> {
    let dir = dir.to_path_buf();
    std::thread::Builder::new()
        .name("grader-precompile".into())
        .stack_size(THREAD_STACK)
        .spawn(move || precompile_on_this_thread(&dir))
        .map_err(internal)?
        .join()
        .map_err(|_| GradeError::Internal("precompile thread panicked".into()))?
}

fn precompile_on_this_thread(dir: &Path) -> Result<(), GradeError> {
    let lib = stdlib_dir(dir);
    if !dir.join("python.wasm").is_file() || !lib.is_dir() {
        return Err(GradeError::Missing(dir.to_path_buf()));
    }
    let engine = engine()?;
    precompile_modules(&engine, dir)?;
    let mut linker: Linker<WasiP1Ctx> = Linker::new(&engine);
    p1::add_to_linker_sync(&mut linker, |c| c).map_err(internal)?;
    let module = Module::from_file(&engine, dir.join("python.wasm")).map_err(internal)?;
    // Unchecked hashes: the bytecode is used whatever the source files'
    // timestamps become when the image is assembled.
    let script = "import compileall, os, py_compile, sys\n\
        ok = compileall.compile_dir(os.path.dirname(os.__file__), quiet=1, workers=1,\n\
            invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH)\n\
        sys.exit(0 if ok else 1)\n";
    let stderr = MemoryOutputPipe::new(STDERR_CAP);
    let mut wasi = WasiCtxBuilder::new();
    wasi.args(&["python", "-I", "-S", "-c", script]).stderr(stderr.clone());
    wasi.preopened_dir(&lib, "/lib", FsPerms::ReadWrite).map_err(internal)?;
    let mut store = Store::new(&engine, wasi.build_p1());
    store.set_epoch_deadline(u64::MAX);
    let instance = linker.instantiate(&mut store, &module).map_err(internal)?;
    let main = instance.get_typed_func::<(), ()>(&mut store, "_start").map_err(internal)?;
    match main.call(&mut store, ()) {
        Ok(()) => Ok(()),
        Err(e) if e.downcast_ref::<I32Exit>().is_some_and(|x| x.0 == 0) => Ok(()),
        Err(e) => Err(GradeError::Internal(format!("compileall failed: {e}; {}", tail(&stderr.contents())))),
    }
}
