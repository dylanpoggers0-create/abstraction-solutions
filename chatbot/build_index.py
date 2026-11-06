"""Builds the chat search index from the website (the folder above this one).
    python build_index.py              chunks + MiniLM vectors (what the GitHub Action runs)
    python build_index.py --no-vectors chunks only (keyword search), no model download needed
"""
import sys
from pathlib import Path

import rag

args = [a for a in sys.argv[1:] if not a.startswith("--")]
site = Path(args[0]) if args else Path(__file__).resolve().parent.parent
print(rag.ingest_knowledge_base(site, with_vectors="--no-vectors" not in sys.argv))
