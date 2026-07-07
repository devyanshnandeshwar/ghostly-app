FROM python:3.12-slim

WORKDIR /app

# Install required system libraries for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libxcb1 \
    libxext6 \
    libsm6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install dependencies cleanly
# Note: opencv-python-headless is used in requirements.txt, so heavy X11/OpenGL system packages are not needed
COPY ai-model/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy app source and model files
COPY ai-model/app/ ./app/
COPY ai-model/*.pb ai-model/*.pbtxt ai-model/*.caffemodel ai-model/*.prototxt ./

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
