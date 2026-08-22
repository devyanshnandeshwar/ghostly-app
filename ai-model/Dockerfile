# ---------- builder ----------
# uv installs into a throwaway stage, so neither uv nor pip ends up in the
# runtime image. Everything in requirements.txt is already pinned, so uv's
# gain here is parallel download and extract rather than resolution.
FROM python:3.12-slim AS builder

# Pinned: an unpinned installer is a moving part in an otherwise pinned build.
COPY --from=ghcr.io/astral-sh/uv:0.8.15 /uv /usr/local/bin/uv

WORKDIR /app
COPY ai-model/requirements.txt .

RUN uv venv /opt/venv \
    && uv pip install --python /opt/venv/bin/python --no-cache -r requirements.txt

# ---------- runtime ----------
FROM python:3.12-slim

WORKDIR /app

# OpenCV needs these at runtime, not just to build. libxcb1 in particular:
# without it cv2 fails to import and the container crash-loops.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libxcb1 \
    libxext6 \
    libsm6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    VIRTUAL_ENV=/opt/venv

# Copy app source and model files
COPY ai-model/app/ ./app/
COPY ai-model/*.pb ai-model/*.pbtxt ai-model/*.caffemodel ai-model/*.prototxt ./

# Drop root: run as a dedicated unprivileged user.
RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
