// Pre-processing applied to lesson Markdown before remark parses it.
//
// remark-math treats any two `$` in a paragraph as an inline formula, so prose
// such as "$0.02 per GB ... $400k per month" renders as garbled maths. Authors
// should not have to remember to escape currency, so we escape dollar signs
// that look like money: `$` followed by a number that is not followed by more
// maths syntax. `$O(n)$`, `$10^9$` and `$2$` are left alone.
const CURRENCY = /(?<!\\)\$(?=\d[\d,.]*(?:[kKMBT]|bn)?(?![\d^_{}\\$]))/g;

export function escapeCurrency(source: string): string {
  // Leave fenced code blocks and inline code untouched.
  return source
    .split(/(^```[\s\S]*?^```)/m)
    .map((chunk, i) => (i % 2 === 1 ? chunk : chunk.split(/(`[^`\n]*`)/).map((part, j) => (j % 2 === 1 ? part : part.replace(CURRENCY, "\\$"))).join("")))
    .join("");
}
