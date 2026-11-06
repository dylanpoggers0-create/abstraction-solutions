"""
RAG for the Abstraction Solutions demo assistant (Dylan's design: chunk 500 / overlap 50, all-MiniLM-L6-v2, top 3).

  ingest_knowledge_base(site_dir)  reads the website's pages, splits them into chunks, embeds them, saves the index
  retrieve_context(query, k=3)     finds the chunks that best match a question (an empty list = "I don't know")

Runs on Render's free plan: embeddings come from fastembed (the same MiniLM model, run with ONNX instead of
PyTorch, so it fits in a few hundred MB), and the vectors are a plain numpy array instead of a Chroma database.
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
SKIP = {"admin.html"}           # private pages never go in the knowledge base
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


def page_text(html):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    title = title.split("|")[0].strip() or title
    for tag in soup(["script", "style", "noscript", "svg", "footer", "head", "form", "template"]):
        tag.decompose()
    text = soup.get_text("\n")
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines()]
    return title, "\n".join(ln for ln in lines if ln)


def load_pages(site_dir):
    site_dir = Path(site_dir)
    pages = []
    for path in sorted(site_dir.rglob("*.html")):
        rel = path.relative_to(site_dir).as_posix()
        if rel in SKIP or any(part in SKIP_DIRS for part in path.relative_to(site_dir).parts):
            continue
        title, text = page_text(path.read_text(encoding="utf-8", errors="replace"))
        if text:
            pages.append({"url": page_url(rel), "title": title, "text": text})
    log = site_dir / "changelog.json"            # the changelog page is filled in by JavaScript, so read its data
    if log.exists():
        entries = json.loads(log.read_text(encoding="utf-8"))
        text = "\n".join(f"{e['date']}: {e['title']}. " + " ".join(e.get("items", [])) for e in entries)
        pages.append({"url": SITE_URL + "changelog.html", "title": "Changelog", "text": text})
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
def ingest_knowledge_base(site_dir):
    chunks = []
    for page in load_pages(site_dir):
        for piece in split_text(page["text"]):
            chunks.append({"url": page["url"], "title": page["title"], "text": piece})
    vectors = embed(f"{c['title']}: {c['text']}" for c in chunks)
    INDEX_DIR.mkdir(exist_ok=True)
    np.save(INDEX_DIR / "vectors.npy", vectors)
    (INDEX_DIR / "chunks.json").write_text(json.dumps(chunks, ensure_ascii=False), encoding="utf-8")
    return f"Ingested {len(chunks)} chunks from {len({c['url'] for c in chunks})} pages into the index."


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
