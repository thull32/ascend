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
// Web APIs the browser gives graded code and QuickJS lacks, so a solution
// that passes in the browser passes here too.
if (typeof TextEncoder === "undefined") {
  globalThis.TextEncoder = class TextEncoder {
    get encoding() {
      return "utf-8";
    }
    encode(input = "") {
      const out = [];
      for (const ch of String(input)) {
        let c = ch.codePointAt(0);
        if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd; // lone surrogate, as browsers do
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      return new Uint8Array(out);
    }
  };
}
if (typeof TextDecoder === "undefined") {
  globalThis.TextDecoder = class TextDecoder {
    get encoding() {
      return "utf-8";
    }
    decode(input = new Uint8Array()) {
      const b = input instanceof Uint8Array ? input : new Uint8Array(input.buffer ?? input);
      let out = "";
      for (let i = 0; i < b.length; ) {
        const x = b[i];
        const need = x < 0x80 ? 0 : x >= 0xf0 && x < 0xf8 ? 3 : x >= 0xe0 ? 2 : x >= 0xc2 && x < 0xe0 ? 1 : -1;
        let c = need === 0 ? x : need === 1 ? x & 31 : need === 2 ? x & 15 : x & 7;
        let ok = need >= 0 && i + need < b.length + (need === 0 ? 1 : 0);
        for (let k = 1; ok && k <= need; k++) {
          if ((b[i + k] & 0xc0) !== 0x80) ok = false;
          else c = (c << 6) | (b[i + k] & 63);
        }
        if (!ok || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) {
          out += "\ufffd";
          i += 1;
        } else {
          out += String.fromCodePoint(c);
          i += need + 1;
        }
      }
      return out;
    }
  };
}
if (typeof structuredClone === "undefined") {
  globalThis.structuredClone = function structuredClone(value) {
    const seen = new Map();
    const clone = (v) => {
      if (v === null || typeof v !== "object") return v;
      if (seen.has(v)) return seen.get(v);
      let out;
      if (Array.isArray(v)) {
        out = [];
        seen.set(v, out);
        v.forEach((x, i) => (out[i] = clone(x)));
      } else if (v instanceof Map) {
        out = new Map();
        seen.set(v, out);
        v.forEach((x, k) => out.set(clone(k), clone(x)));
      } else if (v instanceof Set) {
        out = new Set();
        seen.set(v, out);
        v.forEach((x) => out.add(clone(x)));
      } else if (v instanceof Date) {
        out = new Date(v.getTime());
      } else if (ArrayBuffer.isView(v)) {
        out = v.slice();
      } else {
        out = {};
        seen.set(v, out);
        for (const k of Object.keys(v)) out[k] = clone(v[k]);
      }
      return out;
    };
    return clone(value);
  };
}

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
