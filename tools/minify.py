"""Builds the condensed copies of the site's shared files, so pages download less.
Run locally: python3 tools/minify.py   (needs Node; the tools are fetched with npx at fixed versions)
It also runs on GitHub after every push that changes one of these files (.github/workflows/minify.yml)
and commits the results, so you only ever edit the readable files:

    style.css  ->  style.min.css        nav.js    ->  nav.min.js
    ux.js      ->  ux.min.js            float.js  ->  float.min.js
    feel.js    ->  feel.min.js          gideon.js ->  gideon.min.js
    account.js ->  account.min.js

Pages load the .min files. The readable files stay in the repo (and admin.html and hydrocart.html still use them).
Each .min file starts with a line naming its source and a fingerprint of it; tools/check_site.py uses that
to warn when a .min file is older than the file it was built from."""
import hashlib, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TERSER = "terser@5.36.0"
CSSO = "csso-cli@4.0.2"
JS = ["nav.js", "ux.js", "float.js", "feel.js", "gideon.js", "account.js"]
CSS = ["style.css"]
# nav.js loads the other scripts by name; its condensed copy loads their condensed copies
LOADS = ["ux", "float", "feel", "gideon", "account"]


def fingerprint(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:12]


def header(src):
    return f"/* built from {src} by tools/minify.py: edit {src}, not this file. src:{fingerprint(os.path.join(ROOT, src))} */\n"


def run(cmd, data):
    r = subprocess.run(cmd, input=data, capture_output=True, text=True, cwd=ROOT, shell=(os.name == "nt"))
    if r.returncode:
        sys.exit(f"{' '.join(cmd)} failed:\n{r.stderr}")
    return r.stdout


def out_name(src):
    base, ext = os.path.splitext(src)
    return base + ".min" + ext


def main():
    for src in JS:
        code = open(os.path.join(ROOT, src), encoding="utf-8").read()
        mini = run(["npx", "--yes", TERSER, "--compress", "passes=2", "--mangle", "--ecma", "2020"], code)
        if src == "nav.js":
            for name in LOADS:
                pat = re.compile(r"([\"'`])" + name + r"\.js\1")
                if not pat.search(mini):
                    sys.exit(f"nav.js no longer loads {name}.js: update LOADS in tools/minify.py")
                mini = pat.sub(lambda m: m.group(1) + name + ".min.js" + m.group(1), mini)
        with open(os.path.join(ROOT, out_name(src)), "w", encoding="utf-8", newline="\n") as f:
            f.write(header(src) + mini.strip() + "\n")
    for src in CSS:
        css = open(os.path.join(ROOT, src), encoding="utf-8").read()
        mini = run(["npx", "--yes", CSSO, "--no-restructure"], css)   # no rule merging: keeps the cascade exactly as written
        with open(os.path.join(ROOT, out_name(src)), "w", encoding="utf-8", newline="\n") as f:
            f.write(header(src) + mini.strip() + "\n")
    for src in JS + CSS:
        a, b = os.path.getsize(os.path.join(ROOT, src)), os.path.getsize(os.path.join(ROOT, out_name(src)))
        print(f"{src:12} {a:7,} -> {out_name(src):16} {b:7,} bytes ({100 - b * 100 // a}% smaller)")


if __name__ == "__main__":
    main()
