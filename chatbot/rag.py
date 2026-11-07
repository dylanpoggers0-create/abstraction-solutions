"""
Retrieval for the Abstraction Solutions site assistant (Dylan's design: chunk 500 / overlap 50, all-MiniLM-L6-v2, top 3).

  ingest_knowledge_base(site_dir)  reads the website's pages, splits them into chunks, embeds them, saves the index
  retrieve_context(query, k=3)     finds the chunks that best match a question (an empty list = "I don't know")

The website's chat bubble (nav.js) does the same search in the visitor's browser using the files this writes to
chatbot/index/: chunks.json (always) and vectors.json (the MiniLM embeddings, built by the GitHub Action).
No server, so it's always on and answers instantly.
"""
import json
import re
from pathlib import Path

import numpy as np
from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
INDEX_DIR = HERE / "index"
MODEL_DIR = HERE / ".model"       # downloaded during the Render build, so it ships with the app
SITE_URL = "https://abstraction-solutions.com/"
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
MIN_RELEVANCE = 0.35            # cosine similarity below this = the chunk isn't really about the question
SKIP = {"admin.html",            # private pages never go in the knowledge base
        "memphis.html", "clubs-nonprofits.html"}   # moved to services/workflows.html (these just forward there)
SKIP_DIRS = {"hydro-cart", "chatbot", "videos", ".git"}

_model = None


def embedder():
    """loads the embedding model once (it's the slow, memory-heavy part)"""
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding(model_name=MODEL_NAME, cache_dir=str(MODEL_DIR))
    return _model


def embed(texts):
    vecs = np.array(list(embedder().embed(list(texts))), dtype=np.float32)
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-12       # unit length: dot product = cosine
    return vecs


# ---------------------------------------------------------------- reading the site
def page_url(rel):
    rel = rel.replace("\\", "/")
    if rel == "index.html":
        return SITE_URL
    if rel.endswith("/index.html"):
        return SITE_URL + rel[: -len("index.html")]
    return SITE_URL + rel


HEADINGS = ["h1", "h2", "h3", "h4"]
BLOCKS = ["p", "li", "dt", "dd", "td", "th", "blockquote", "figcaption", "summary", "label", "div", "section", "main"]


def page_sections(html):
    """splits a page by its headings: [(heading, text), ...], so each chunk is about one thing"""
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    title = title.split("|")[0].strip() or title
    for tag in soup(["script", "style", "noscript", "svg", "footer", "head", "form", "template", "button"]):
        tag.decompose()
    for tag in soup.select(".badge"):            # status labels ("Live") aren't part of the heading
        tag.decompose()
    body = soup.body or soup
    sections, heading, heading_el, lines, last_block = [], "", None, [], None
    for s in body.strings:
        text = re.sub(r"\s+", " ", s).strip()
        if not text:
            continue
        h = s.find_parent(HEADINGS)
        if h is not None:
            if h is not heading_el:              # a new heading starts a new section
                sections.append((heading, "\n".join(lines)))
                heading, heading_el, lines, last_block = h.get_text(" ", strip=True), h, [], None
            continue
        block = s.find_parent(BLOCKS)
        if lines and block is last_block:
            lines[-1] += " " + text              # same paragraph: keep it on one line
        else:
            lines.append(text)
        last_block = block
    sections.append((heading, "\n".join(lines)))
    merged, carry, parent = [], "", ""          # fold tiny sections (like a lone label) into the next one
    for head, text in sections:
        text = (carry + "\n" + text).strip() if carry else text
        if len(text) < 60 and not head:
            carry = text
            continue
        carry = ""
        if head and not text:                    # a heading with nothing under it (e.g. a project name): keep it
            parent = head                        # as context for the sections below it
            continue
        if parent and head:
            head = f"{parent} › {head}"
        elif parent and not head:
            head = parent
        if len(text) >= 40:                      # skip button rows like "Get a free quote Start a project"
            merged.append((head, text))
        if head and parent and not head.startswith(parent):
            parent = ""
    return title, merged


def page_text(html):
    title, sections = page_sections(html)
    return title, "\n".join(f"{h}\n{t}" if h else t for h, t in sections)


def load_pages(site_dir):
    site_dir = Path(site_dir)
    pages = []
    for path in sorted(site_dir.rglob("*.html")):
        rel = path.relative_to(site_dir).as_posix()
        if rel in SKIP or any(part in SKIP_DIRS for part in path.relative_to(site_dir).parts):
            continue
        title, sections = page_sections(path.read_text(encoding="utf-8", errors="replace"))
        if sections:
            pages.append({"url": page_url(rel), "title": title, "sections": sections})
    log = site_dir / "changelog.json"            # the changelog page is filled in by JavaScript, so read its data
    if log.exists():
        entries = json.loads(log.read_text(encoding="utf-8"))
        text = "\n".join(f"{e['date']}: {e['title']}. " + " ".join(e.get("items", [])) for e in entries)
        pages.append({"url": SITE_URL + "changelog.html", "title": "Changelog", "sections": [("What's new", text)]})
    return pages


# ---------------------------------------------------------------- splitting (like LangChain's RecursiveCharacterTextSplitter)
def split_text(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP, seps=("\n\n", "\n", ". ", " ")):
    if len(text) <= size:
        return [text]
    for sep in seps:
        if sep in text:
            parts = [p + (sep if i < len(text.split(sep)) - 1 else "") for i, p in enumerate(text.split(sep))]
            break
    else:
        parts = [text[i:i + size] for i in range(0, len(text), size)]
    chunks, cur = [], ""
    for p in parts:
        if len(p) > size:                      # a single piece that's still too long: split it further
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.extend(split_text(p, size, overlap, seps[1:] if len(seps) > 1 else seps))
            continue
        if len(cur) + len(p) > size and cur:
            chunks.append(cur)
            cur = cur[-overlap:] if overlap else ""     # carry a little context into the next chunk
        cur += p
    if cur.strip():
        chunks.append(cur)
    return [c.strip() for c in chunks if c.strip()]


# ---------------------------------------------------------------- Dylan's two functions
def ingest_knowledge_base(site_dir, with_vectors=True):
    chunks = []
    for page in load_pages(site_dir):
        for heading, text in page["sections"]:
            body = text if len(text) >= 20 else f"{heading}. {text}".strip(". ")
            for piece in split_text(body, CHUNK_SIZE - len(heading)):
                chunks.append({"url": page["url"], "title": page["title"], "heading": heading, "text": piece})
    INDEX_DIR.mkdir(exist_ok=True)
    (INDEX_DIR / "chunks.json").write_text(json.dumps(chunks, ensure_ascii=False, indent=0), encoding="utf-8")
    msg = f"Ingested {len(chunks)} chunks from {len({c['url'] for c in chunks})} pages"
    if not with_vectors:
        return msg + " (keyword search only, no vectors)."
    vectors = embed(f"{c['title']}. {c['heading']}: {c['text']}" for c in chunks)
    np.save(INDEX_DIR / "vectors.npy", vectors)
    # for the browser: 4 decimals is plenty for cosine similarity and keeps the file small
    (INDEX_DIR / "vectors.json").write_text(json.dumps(
        {"model": MODEL_NAME, "dim": int(vectors.shape[1]),
         "vectors": [[round(float(x), 4) for x in row] for row in vectors]},
        separators=(",", ":")), encoding="utf-8")
    return msg + f" with {vectors.shape[1]}-number MiniLM vectors."


_index = None


def load_index():
    global _index
    if _index is None:
        _index = (np.load(INDEX_DIR / "vectors.npy"),
                  json.loads((INDEX_DIR / "chunks.json").read_text(encoding="utf-8")))
    return _index


def retrieve_context(query, k=3):
    """Top k chunks that actually match the query, best first: [{url, title, text, score}]. Empty = don't know."""
    vectors, chunks = load_index()
    scores = vectors @ embed([query])[0]
    best = np.argsort(-scores)[:k]
    return [dict(chunks[i], score=round(float(scores[i]), 3)) for i in best if scores[i] >= MIN_RELEVANCE]
