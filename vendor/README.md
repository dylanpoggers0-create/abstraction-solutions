# Vendored libraries (served from this site, no CDN)

Used only by the AI Education Playground (`services/education/playground.html`).

| Folder | Library | Version | License |
|---|---|---|---|
| `katex/` | [KaTeX](https://katex.org) (typesets the equations) | 0.16.11 | MIT (`katex/LICENSE.txt`) |
| `mathjs/` | [math.js](https://mathjs.org) (parses equations and takes derivatives) | 13.2.0 | Apache-2.0 (`mathjs/LICENSE.txt`) |

Only KaTeX's `.woff2` fonts are kept; `katex.min.css` was edited to list just those.
To update: `npm pack katex@<version> mathjs@<version>`, copy `dist/katex.min.{js,css}` + `dist/fonts/*.woff2`
and `lib/browser/math.js` (saved here as `math.min.js`), then trim the CSS font list the same way.
