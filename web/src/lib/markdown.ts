// Pre-processing applied to lesson Markdown before remark parses it.
//
// remark-math treats any two `$` in a paragraph as an inline formula, so prose
// such as "$0.02 per GB ... $400k per month" renders as garbled maths. Authors
// should not have to remember to escape currency, so we scan each paragraph's
// `$...$` pairs and escape the opening `$` when the enclosed text reads like
// prose about money rather than maths:
//
//   * it starts with a digit (currency amounts do; `$x$`, `$O(n)$` do not),
//   * it contains whitespace (`$2$` and `$10$` are maths),
//   * it contains no maths syntax: \ ^ _ { } = +  (`$4 \times 10^7$` is maths).
//
// Fenced code blocks and inline code are never touched.
const MATHY = /[\\^_{}=+]/;

function escapeParagraph(text: string): string {
  const dollars: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "$") continue;
    if (text[i - 1] === "\\") continue; // already escaped
    if (text[i + 1] === "$" || text[i - 1] === "$") continue; // $$ display maths
    dollars.push(i);
  }
  const escapeAt: number[] = [];
  let k = 0;
  while (k < dollars.length) {
    const open = dollars[k]!;
    const close = dollars[k + 1];
    if (close === undefined) break; // an unpaired $ is literal anyway
    const span = text.slice(open + 1, close);
    const currency = /^\d/.test(span) && /\s/.test(span) && !MATHY.test(span);
    if (currency) {
      escapeAt.push(open);
      k += 1; // the closing $ may itself open the next amount
    } else {
      k += 2; // a real formula: skip both delimiters
    }
  }
  let out = text;
  for (const i of escapeAt.reverse()) out = `${out.slice(0, i)}\\${out.slice(i)}`;
  return out;
}

export function escapeCurrency(source: string): string {
  return source
    .split(/(^```[\s\S]*?^```)/m)
    .map((chunk, i) => {
      if (i % 2 === 1) return chunk; // fenced code
      return chunk
        .split(/(\n\s*\n)/)
        .map((para) => {
          // Protect inline code spans while scanning the paragraph.
          const codes: string[] = [];
          const masked = para.replace(/`[^`\n]*`/g, (m) => {
            codes.push(m);
            return `\u0000${codes.length - 1}\u0000`;
          });
          return escapeParagraph(masked).replace(/\u0000(\d+)\u0000/g, (_, n) => codes[Number(n)]!);
        })
        .join("");
    })
    .join("");
}
