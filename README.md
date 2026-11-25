# abstraction-solutions.com

## Adding an AI Education video

Every new video needs all of these, or coins and certification picks won't work for it:

1. The video file in `videos/shorts/` (or `videos/`), and its card on `services/education.html` with a `data-video-id`.
2. **In the quote-engine repo, `education_videos.json`:** an entry under that same id with
   - `title`: as shown on the card
   - `seconds`: the real length (coins are worked out from it)
   - `fields`: the certification fields it builds toward, main one first
     (`ai`, `genai`, `data`, `cloud`, `business`, `governance`, `pm`); these steer each viewer's certification picks
   - `technical`: `true` for the maths-heavy ones
3. Run the quote-engine tests (`python tools/run_tests.py`): `test_progress` fails if a video is missing any of these.
4. Push quote-engine first, then the site.
