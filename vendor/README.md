# Vendored libraries (served from this site, no CDN)

KaTeX and math.js are used only by the AI Education Playground (`services/education/playground.html`).
three.js is used only by the 3D models on the Order page (`projects3d.js`).

| Folder | Library | Version | License |
|---|---|---|---|
| `katex/` | [KaTeX](https://katex.org) (typesets the equations) | 0.16.11 | MIT (`katex/LICENSE.txt`) |
| `three/` | [three.js](https://threejs.org) (the Order page 3D models), plus its `RoundedBoxGeometry` and `RoomEnvironment` add-ons | 0.170.0 | MIT (`three/LICENSE`) |
| `mathjs/` | [math.js](https://mathjs.org) (parses equations and takes derivatives) | 13.2.0 | Apache-2.0 (`mathjs/LICENSE.txt`) |

Only KaTeX's `.woff2` fonts are kept; `katex.min.css` was edited to list just those.
To update: `npm pack katex@<version> mathjs@<version>`, copy `dist/katex.min.{js,css}` + `dist/fonts/*.woff2`
and `lib/browser/math.js` (saved here as `math.min.js`), then trim the CSS font list the same way.

three.js: copy `build/three.module.min.js`, `examples/jsm/geometries/RoundedBoxGeometry.js` and `examples/jsm/environments/RoomEnvironment.js`,
then change the add-ons' `from 'three'` to `from './three.module.min.js'` (the site has no import map: inline scripts are blocked).
