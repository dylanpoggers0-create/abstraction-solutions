# Site assistant (the chat bubble)

Answers visitors' questions from the website's own pages and shows the passage and page it came from.
It runs entirely in the visitor's browser, so there's no server to sleep or pay for, answers are instant,
and questions never leave the visitor's device.

## How it works
1. `rag.py` (Dylan's retrieval design) reads every public page, splits each one by its headings into chunks of
   up to 500 characters, and embeds them with **all-MiniLM-L6-v2**.
2. It writes `index/chunks.json` (the text) and `index/vectors.json` (the MiniLM vectors).
3. The chat bubble in `nav.js` loads those files when someone opens it:
   - **Keyword search (BM25)** works instantly.
   - When `vectors.json` is there, the browser also loads MiniLM (via transformers.js) and switches to
     meaning-based search: the same model and the same 0.35 "I don't know" cutoff as `rag.py`.
4. It shows the best passage, the page it came from and related pages. Questions about prices point to the
   instant quote, and questions about calls point to email.

## Keeping it up to date
The GitHub Action `.github/workflows/chat-index.yml` rebuilds the index automatically whenever a page changes.
To build it yourself: `pip install -r requirements.txt` then `python build_index.py`
(or `python build_index.py --no-vectors` for keyword search only, no model download).

## Turning it off
Set `CHAT_ON = false` in `nav.js`.
