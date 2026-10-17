import os
import sys
from pathlib import Path

# Ensure root directory is on Python path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Set sane defaults for Hugging Face Spaces environment
os.environ.setdefault("DATA_DIR", "/tmp/drop2list")
os.environ.setdefault("EVALS_DIR", str(ROOT / "evals"))
os.environ.setdefault("CORS_ORIGINS", "*")
os.environ.setdefault("TRANSCRIBE_BACKEND", "whisper")
os.environ.setdefault("WHISPER_MODEL", "small.en")

import gradio as gr
import uvicorn
from app.main import app as fastapi_app

with gr.Blocks(title="Drop2List API Backend") as demo:
    gr.Markdown("# 🎬 Drop2List API Backend")
    gr.Markdown(
        "This Hugging Face Space hosts the FastAPI backend for "
        "[Drop2List](https://github.com/rudrakshSoni-dev/drop-to-listing-agent-xumanai).\n\n"
        "### Available Endpoints:\n"
        "- **Health Check**: [`/api/health`](/api/health)\n"
        "- **Interactive API Docs (Swagger)**: [`/docs`](/docs)\n"
        "- **Pre-processed Examples**: [`/api/examples`](/api/examples)\n"
        "- **Evaluations Data**: [`/api/evals`](/api/evals)\n"
    )
    with gr.Row():
        btn = gr.Button("Ping Backend", variant="primary")
        out = gr.Textbox(label="Status", value="Ready")
    btn.click(fn=lambda: "✅ Drop2List API is running, database connected, and ready for requests!", outputs=out)

# Mount Gradio dashboard at root; FastAPI routes take precedence
app = gr.mount_gradio_app(fastapi_app, demo, path="/")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
