---
title: Drop2List API
emoji: 🎬
colorFrom: purple
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
---

API for [Drop2List](https://github.com/), a demo that turns a short tutor or coach video into a bookable listing. The web app runs on Vercel and calls this Space.

Secrets and variables (Space → Settings):

| Name | Kind | Value |
|---|---|---|
| `GEMINI_API_KEY` | secret | a free Google AI Studio key |
| `LLM_MODELS` | variable | comma-separated Gemini models, best first |
| `CORS_ORIGINS` | variable | the Vercel URL, e.g. `https://drop2list.vercel.app` |
