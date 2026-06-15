// remark-math (v6) only renders math as a centered .katex-display block when the
// `$$` fence sits on its own lines. But agents emit display math three other ways:
// single-line `$$…$$`, and LaTeX `\[…\]`; inline math as `\(…\)`. Rewrite all of
// them to the forms remark-math understands so every formula renders, and display
// math actually displays. Code stays verbatim — fenced/inline code is split out
// first so a backslash-paren inside a snippet (e.g. a regex) is never touched.

// Capture fenced (``` / ~~~) and inline (`…`) code so split() keeps them as
// odd-indexed segments, leaving prose on the even indices.
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g

// Display math → a standalone `$$` fence (blank lines isolate it as its own block).
const fence = (m: string): string => `\n\n$$\n${m.trim()}\n$$\n\n`

const rewrite = (s: string): string =>
  s
    // \[…\] is display math.
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => fence(m))
    // Single-line $$…$$ means display too, but renders inline unless fenced.
    .replace(/\$\$([^\n]+?)\$\$/g, (_, m) => fence(m))
    // \(…\) is inline math.
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`)

export const normalizeMath = (text: string): string =>
  text
    .split(CODE)
    .map((seg, i) => (i % 2 === 0 ? rewrite(seg) : seg))
    .join('')
