FROM python:3.12-slim

WORKDIR /app

# Install OpenCV system dependencies
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY ai-model/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app source and model files
COPY ai-model/app/ ./app/
COPY ai-model/*.pb ai-model/*.pbtxt ai-model/*.caffemodel ai-model/*.prototxt ./

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
