//! Deciding whether a returned value matches the expected one.
//!
//! This is a port of `web/src/runner/harness.ts`, which the browser uses for
//! the same decision, so a learner never sees their local run pass and the
//! server's check fail over comparison rules:
//!
//! * floats compare to 6 decimal places, rounded as JavaScript's
//!   `Math.round(v * 1e6) / 1e6` rounds them (halves towards positive
//!   infinity, on the scaled binary value), and a float with no fractional
//!   part equals the integer. Every copy of this rule (the browser's two
//!   harnesses, the problem validator and this file) must agree bit for bit;
//!   `conformance.json` pins the cases where rounding rules differ;
//! * object keys compare in any order;
//! * an empty tagged structure (`{"$list": []}`, `$tree`, `$graph`) equals
//!   `null`, because an empty linked list, tree or graph is `None`;
//! * with `any_order`, two arrays match when they hold the same elements
//!   with the same multiplicities.
use serde_json::{Map, Number, Value};

const TAGS: [&str; 3] = ["$list", "$tree", "$graph"];

/// Whether `actual` matches `expected` under the rules above.
pub fn matches(expected: &Value, actual: &Value, any_order: bool) -> bool {
    if any_order && let (Value::Array(e), Value::Array(a)) = (expected, actual) {
        let mut e: Vec<String> = e.iter().map(canon).collect();
        let mut a: Vec<String> = a.iter().map(canon).collect();
        e.sort_unstable();
        a.sort_unstable();
        return e == a;
    }
    canon(expected) == canon(actual)
}

/// The canonical text of a value: equal values have equal text.
pub fn canon(v: &Value) -> String {
    normalise(v).to_string()
}

fn normalise(v: &Value) -> Value {
    match v {
        Value::Object(o) => {
            if TAGS.iter().any(|t| matches!(o.get(*t), Some(Value::Array(a)) if a.is_empty())) {
                return Value::Null;
            }
            let mut keys: Vec<&String> = o.keys().collect();
            keys.sort_unstable();
            Value::Object(keys.into_iter().map(|k| (k.clone(), normalise(&o[k]))).collect::<Map<_, _>>())
        }
        Value::Array(a) => Value::Array(a.iter().map(normalise).collect()),
        Value::Number(n) => normalise_number(n),
        other => other.clone(),
    }
}

/// JavaScript's `Math.round`: the nearest integer, halves towards +infinity.
/// `floor(x + 0.5)` is not quite it (0.49999999999999994 + 0.5 rounds up to
/// 1.0 in floating point); `x - floor(x)` is exact, so comparing it with 0.5
/// is. The same form is used in the Python copies of this rule.
fn js_round(x: f64) -> f64 {
    let f = x.floor();
    if x - f >= 0.5 { f + 1.0 } else { f }
}

fn normalise_number(n: &Number) -> Value {
    if n.is_i64() || n.is_u64() {
        return Value::Number(n.clone());
    }
    let Some(f) = n.as_f64() else { return Value::Number(n.clone()) };
    let rounded = if f.fract() == 0.0 { f } else { js_round(f * 1e6) / 1e6 };
    // Integral values become integers so 2.0 == 2, as in JavaScript. Beyond
    // 2^63 an integer cannot hold them; they stay floats on both sides.
    if rounded.fract() == 0.0 && rounded.abs() < 9.2e18 {
        return Value::from(rounded as i64);
    }
    Number::from_f64(rounded).map_or(Value::Null, Value::Number)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    /// The shared corpus every implementation of the rule is tested against
    /// (also `web/src/runner/harness.test.ts` and `scripts/check_conformance.py`).
    #[test]
    fn the_conformance_corpus_holds() {
        let corpus: Value = serde_json::from_str(include_str!("../conformance.json")).unwrap();
        let cases = corpus["cases"].as_array().unwrap();
        assert!(cases.len() >= 20);
        for (i, c) in cases.iter().enumerate() {
            let any_order = c["any_order"].as_bool().unwrap_or(false);
            let want = c["match"].as_bool().unwrap();
            assert_eq!(matches(&c["expected"], &c["actual"], any_order), want, "case {i}: {c}");
        }
    }

    #[test]
    fn rounding_matches_math_round_at_the_edges() {
        assert_eq!(js_round(0.49999999999999994), 0.0);
        assert_eq!(js_round(0.5), 1.0);
        assert_eq!(js_round(-0.5), 0.0);
        assert_eq!(js_round(-0.5000000000000001), -1.0);
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
    }

    #[test]
    fn numbers_compare_as_the_browser_compares_them() {
        assert!(matches(&json!(2), &json!(2.0), false));
        assert!(matches(&json!(0.333333), &json!(1.0 / 3.0), false));
        assert!(matches(&json!(1), &json!(0.9999999999999998), false));
        assert!(!matches(&json!(0.3333), &json!(1.0 / 3.0), false));
        assert_eq!(canon(&json!(-1.0000004)), "-1");
        assert_eq!(canon(&json!(-1.0000006)), "-1.000001");
        assert!(!matches(&json!(1), &json!(true), false));
        assert!(!matches(&json!("1"), &json!(1), false));
    }

    #[test]
    fn structure_rules() {
        assert!(matches(&json!({"b": 1, "a": [1, 2]}), &json!({"a": [1, 2], "b": 1}), false));
        assert!(matches(&json!(null), &json!({"$list": []}), false));
        assert!(matches(&json!({"$tree": []}), &json!(null), false));
        assert!(!matches(&json!({"$list": [1]}), &json!(null), false));
        assert!(!matches(&json!([1, 2]), &json!([2, 1]), false));
    }

    #[test]
    fn any_order_is_a_multiset_comparison() {
        assert!(matches(&json!([[1, 2], [3]]), &json!([[3], [1, 2]]), true));
        assert!(!matches(&json!([[1, 2], [3]]), &json!([[3], [2, 1]]), true));
        assert!(!matches(&json!([1, 1, 2]), &json!([1, 2, 2]), true));
        assert!(!matches(&json!([1, 2]), &json!([1, 2, 2]), true));
        // Not arrays: falls back to plain comparison.
        assert!(matches(&json!(3), &json!(3), true));
    }
}
