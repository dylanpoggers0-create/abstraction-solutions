"""Site checks that run on every push (GitHub Actions: .github/workflows/site-checks.yml). Run locally: python3 tools/check_site.py
Checks: every page has a Content-Security-Policy, admin/order pages forbid inline scripts, every JavaScript file and
inline script parses, every JSON file and JSON-LD block parses, and every local link/src points at a file that exists.
Prints one line per problem (file:line: problem) so failures are easy to find and fix."""
import json, os, re, subprocess, sys, tempfile
from html.parser import HTMLParser
from urllib.parse import urlparse, unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", "node_modules", "hydro-cart", "chat-index"}
problems = []

def rel(p): return os.path.relpath(p, ROOT)
def js_error(stderr):
    lines = [l for l in stderr.strip().splitlines() if l.strip()]
    hit = [l for l in lines if "Error" in l and not l.startswith("Node.js")]
    where = [l for l in lines if re.search(r":\d+$", l)]
    return ((where[0].rsplit(":", 1)[-1] + ": ") if where else "") + (hit[0] if hit else (lines[-1] if lines else "?"))
def bad(path, line, msg): problems.append(f"{rel(path)}:{line}: {msg}")

def node_check(code, where, line):
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f: f.write(code); tmp = f.name
    r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True); os.unlink(tmp)
    if r.returncode: bad(where, line, "inline script, line " + js_error(r.stderr))

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True); self.path = path; self.csp = None; self.links = []; self.scripts = []; self._in = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs); line = self.getpos()[0]
        if tag == "meta" and (a.get("http-equiv") or "").lower() == "content-security-policy": self.csp = a.get("content", "")
        for k in ("href", "src", "poster", "data-poster"):
            if a.get(k): self.links.append((a[k], line))
        if tag == "script" and not a.get("src"): self._in = [a.get("type") or "", line, ""]
    def handle_data(self, d):
        if self._in is not None: self._in[2] += d
    def handle_endtag(self, tag):
        if tag == "script" and self._in is not None: self.scripts.append(tuple(self._in)); self._in = None

for dirpath, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for name in files:
        path = os.path.join(dirpath, name)
        if name.endswith(".js"):
            r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
            if r.returncode: bad(path, 1, "JavaScript, line " + js_error(r.stderr))
        elif name.endswith(".json"):
            try: json.load(open(path, encoding="utf-8"))
            except Exception as e: bad(path, 1, f"invalid JSON: {e}")
        elif name.endswith(".html"):
            page = Page(path); page.feed(open(path, encoding="utf-8").read())
            if rel(path).count(os.sep) == 0 or not rel(path).startswith(("videos", "tools")):
                if page.csp is None: bad(path, 1, "no Content-Security-Policy meta tag")
            ss = (page.csp or "").split("script-src")[1].split(";")[0] if page.csp and "script-src" in page.csp else ""
            if page.csp is not None and "'unsafe-inline'" in ss:
                bad(path, 1, "script-src allows 'unsafe-inline' (run: python3 tools/strict_csp.py)")
            for typ, line, code in page.scripts:
                if typ == "application/ld+json":
                    try: json.loads(code)
                    except Exception as e: bad(path, line, f"invalid JSON-LD: {e}")
                elif typ in ("", "text/javascript", "module"):
                    if code.strip() != 'if (window.top !== window.self) document.documentElement.style.visibility = "hidden";':
                        bad(path, line, "inline <script> will be blocked by the security policy (run: python3 tools/strict_csp.py)")
                    node_check(code, path, line)
            for url, line in page.links:
                u = urlparse(url)
                if u.scheme or url.startswith(("#", "//", "mailto:", "tel:", "data:", "javascript:")) or "{" in url: continue
                target = unquote(u.path)
                if not target: continue
                full = os.path.join(ROOT, target.lstrip("/")) if target.startswith("/") else os.path.normpath(os.path.join(dirpath, target))
                if os.path.isdir(full): full = os.path.join(full, "index.html")
                if not os.path.exists(full): bad(path, line, f"broken link: {url}")

summary = os.environ.get("GITHUB_STEP_SUMMARY")
if problems:
    print("\n".join(problems)); print(f"\n{len(problems)} problem(s) found.")
    if summary: open(summary, "a").write("## Site checks failed\n\n" + "\n".join(f"- `{p}`" for p in problems) + "\n")
    sys.exit(1)
print("All site checks passed.")
if summary: open(summary, "a").write("## Site checks passed ✅\n")
