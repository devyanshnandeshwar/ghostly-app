# Ghostly AI Model Service

This directory contains the AI/ML service for the Ghostly application, primarily responsible for face and gender detection features. It exposes a FastAPI server that processes images.

## tech Stack

- **Python 3.x**
- **FastAPI**: High-performance web framework for building APIs.
- **Uvicorn**: ASGI web server implementation.
- **OpenCV**: Computer vision library for image processing.
- **NumPy**: Fundamental package for scientific computing.
- **Pydantic**: Data validation and settings management.

## Setup & Installation

1.  Navigate to the `ai-model` directory:

    ```bash
    cd ai-model
    ```

2.  Create a virtual environment (optional but recommended):

    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

## Running the Service

To start the development server with hot reload:

```bash
python main.py
```

Or directly via Uvicorn:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The service will be available at `http://localhost:8000`.

## Features

- **Face Detection**: Uses Caffe model (`opencv_face_detector.pbtxt`, `opencv_face_detector_uint8.pb`) to detect faces in images.
- **Gender Detection**: Uses Caffe model (`gender_deploy.prototxt`, `gender_net.caffemodel`) to classify gender.
