---
title: Drop2List API
emoji: 🎬
colorFrom: purple
colorTo: pink
sdk: gradio
sdk_version: 5.20.0
python_version: 3.11
app_file: app.py
pinned: false
---

# Drop2List API Backend

API for [Drop2List](https://github.com/rudrakshSoni-dev/drop-to-listing-agent-xumanai), a system that turns short video clips into bookable service listings.

### Environment Secrets & Variables (Space → Settings → Variables and Secrets):
- **Secret**: `GEMINI_API_KEY` (your Google AI Studio key)
- **Variable**: `CORS_ORIGINS` (`*` or your Vercel URL)
- **Variable**: `EVALS_DIR` (`evals`)
- **Variable**: `DATA_DIR` (`/tmp/drop2list`)
