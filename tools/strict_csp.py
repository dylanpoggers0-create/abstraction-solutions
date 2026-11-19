"""Keeps every page free of inline JavaScript so the Content-Security-Policy can block injected scripts.
Run after editing pages:  python3 tools/strict_csp.py
 - moves any inline <script> on a page into its own file next to the page (page.page.js, page.page-2.js, ...)
 - sets script-src on every page to allow only our files, the listed outside services, and two exact inline
   snippets by hash: the anti-framing line on admin/order and ux.js's prerendering rules."""
import base64, hashlib, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAME_BUSTER = 'if (window.top !== window.self) document.documentElement.style.visibility = "hidden";'


def sha(text): return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode()).digest()).decode() + "'"


def speculation_rules_text():
    """The exact JSON ux.js puts in its speculationrules script (evaluated with node, so it always matches)."""
    src = open(os.path.join(ROOT, "ux.js"), encoding="utf-8").read()
    body = src[src.index("s.textContent = JSON.stringify(") + len("s.textContent = JSON.stringify("):]
    depth, end = 0, 0
    for i, ch in enumerate(body):
        if ch in "({[": depth += 1
        elif ch in ")}]":
            if depth == 0: end = i; break
            depth -= 1
    obj = body[:end]
    return subprocess.run(["node", "-e", f"process.stdout.write(JSON.stringify({obj}))"], capture_output=True, text=True, check=True).stdout


SPEC = sha(speculation_rules_text())
INLINE = re.compile(r'<script(\s+type="module")?>(.*?)</script>', re.S)
changed = []
pages = subprocess.run(["git", "ls-files", "*.html"], cwd=ROOT, capture_output=True, text=True).stdout.split()
for page in pages:
    if page.startswith(("hydro-cart/",)): continue
    path = os.path.join(ROOT, page); html = open(path, encoding="utf-8").read(); orig = html
    stem = os.path.splitext(os.path.basename(page))[0]; folder = os.path.dirname(path); n = [0]

    def move(m):
        code = m.group(2)
        if code.strip() == FRAME_BUSTER: return m.group(0)               # tiny anti-framing line stays (allowed by hash)
        n[0] += 1
        name = f"{stem}.page.js" if n[0] == 1 else f"{stem}.page-{n[0]}.js"
        open(os.path.join(folder, name), "w", encoding="utf-8").write(
            f"/* Moved out of {os.path.basename(page)} by tools/strict_csp.py so the page can forbid inline scripts. */\n"
            + code.strip("\n") + "\n")
        return f'<script{m.group(1) or ""} src="{name}"></script>'
    html = INLINE.sub(move, html)

    def fix(m):
        parts = [p for p in m.group(1).split() if p != "'unsafe-inline'" and not p.startswith("'sha256-")]
        extra = [SPEC] + ([sha(FRAME_BUSTER)] if FRAME_BUSTER in html else [])
        return "script-src " + " ".join(parts[:1] + extra + parts[1:])
    html = re.sub(r"script-src ([^;\"]+)", fix, html, count=1)
    if html != orig:
        open(path, "w", encoding="utf-8").write(html); changed.append((page, n[0]))
for page, k in changed: print(f"{page}: {k} inline script(s) moved" if k else f"{page}: policy updated")
print("speculation rules hash:", SPEC)
