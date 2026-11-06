"""Run during the Render build: reads the website (the folder above this one) and builds the search index."""
import sys
from pathlib import Path

import rag

site = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
print(rag.ingest_knowledge_base(site))
