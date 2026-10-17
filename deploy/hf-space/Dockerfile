# Drop2List API on a Hugging Face Docker Space (free CPU tier).
FROM python:3.12-slim

# ffmpeg for audio/frames; Deno is yt-dlp's JavaScript runtime for YouTube's challenges.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=denoland/deno:bin-2.4.5 /deno /usr/local/bin/deno

# Spaces run as uid 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface \
    PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Bake the transcription model into the image so the first visitor doesn't wait for it.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small.en', device='cpu', compute_type='int8')"

COPY --chown=user . .

# Space storage is ephemeral; examples re-seed from ./seed on every start.
ENV DATA_DIR=/tmp/drop2list \
    EVALS_DIR=/home/user/app/evals \
    TRANSCRIBE_BACKEND=whisper \
    WHISPER_MODEL=small.en \
    DEMO_DROPS_PER_IP=5
EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
