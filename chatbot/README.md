# Demo assistant (RAG chatbot)

Answers visitors' questions using only the pages of abstraction-solutions.com, and cites the page it used.

- `rag.py`: Dylan's RAG pipeline. Reads the site's pages, splits them into 500-character chunks (50 overlap), embeds
  them with all-MiniLM-L6-v2 and finds the top 3 matches for a question. Weak matches are dropped, which is how it
  knows to say "I don't know".
- `app.py`: the web API (`POST /chat`). Asks Gemini to answer only from those chunks, with the business rules built in
  (no prices, no calls, nothing that isn't live). Rate limited per visitor, with a daily cap.
- `build_index.py`: builds the index from the site. Runs on every deploy, so the bot always matches the live site.

## Render settings (New > Web Service > this repo)
| Setting | Value |
|---|---|
| Root Directory | `chatbot` |
| Runtime | Python |
| Build Command | `pip install -r requirements.txt && python build_index.py` |
| Start Command | `uvicorn app:app --host 0.0.0.0 --port $PORT` |
| Instance Type | Free |
| Environment | `GEMINI_API_KEY` = your Gemini key (never put it in the code) |

Optional environment: `GEMINI_MODEL` (default `gemini-2.5-flash-lite`), `DAILY_LIMIT` (default 500 questions a day).

## Try it locally
```
pip install -r requirements.txt
python build_index.py
set GEMINI_API_KEY=your-key        (Mac: export GEMINI_API_KEY=your-key)
uvicorn app:app --port 8000
```
