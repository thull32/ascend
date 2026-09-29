// Server side: compare expected with actual values using compare.js (which
// the grader prepends to this file). Runs in its own QuickJS instance on
// trusted input only: the expected values and the JSON the learner's run
// produced. Input (stdin): {"items": [[expected, actual, any_order], ...]}.
// Output (stdout): a JSON array of booleans.
const input = JSON.parse(std.in.readAsString());
std.out.puts(JSON.stringify(input.items.map(([expected, actual, anyOrder]) => matches(expected, actual, !!anyOrder))));
std.out.flush();
