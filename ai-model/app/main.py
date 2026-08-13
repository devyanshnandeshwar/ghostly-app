from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api import verify
from app.core.config import settings

app = FastAPI(title=settings.PROJECT_NAME)

# This service is called server-to-server inside the Docker network and is not
# published to the host, so no browser origin needs access by default.
# Set ALLOWED_ORIGINS only if that ever changes.
if settings.ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["POST"],
        allow_headers=["*"],
    )

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5MB


@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    content_length = request.headers.get("content-length")

    if content_length is not None:
        try:
            declared = int(content_length)
        except ValueError:
            return JSONResponse(status_code=400, content={"error": "Invalid Content-Length"})

        if declared > MAX_UPLOAD_SIZE:
            return JSONResponse(status_code=413, content={"error": "Payload too large"})

        return await call_next(request)

    # No Content-Length (chunked transfer): enforce the cap while streaming so
    # the body can't grow unbounded, then replay what we buffered downstream.
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_UPLOAD_SIZE:
            return JSONResponse(status_code=413, content={"error": "Payload too large"})

    buffered = bytes(body)

    async def receive():
        return {"type": "http.request", "body": buffered, "more_body": False}

    request._receive = receive

    return await call_next(request)


app.include_router(verify.router, prefix=settings.API_V1_STR)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": settings.PROJECT_NAME}

@app.get("/")
def root():
    return {"message": "Ghosty AI Service is Running"}
