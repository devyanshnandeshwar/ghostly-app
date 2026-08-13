from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api import verify
from app.core.config import settings

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5MB


class BodySizeLimitMiddleware:
    """
    Caps request body size.

    Written as pure ASGI rather than @app.middleware("http") on purpose:
    BaseHTTPMiddleware's call_next reads from its own wrapped receive, so a
    buffer-and-replay approach there silently delivers an empty body to the
    handler. Wrapping receive directly enforces the cap without touching the
    body that reaches the route.
    """

    def __init__(self, app, max_size: int):
        self.app = app
        self.max_size = max_size

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Fast path: reject on the declared length before reading any body.
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    declared = int(value)
                except ValueError:
                    await self._reject(scope, receive, send, 400, "Invalid Content-Length")
                    return

                if declared > self.max_size:
                    await self._reject(scope, receive, send, 413, "Payload too large")
                    return

                await self.app(scope, receive, send)
                return

        # No Content-Length (chunked): buffer up to the cap, then replay.
        # Raising out of receive() is not an option -- the multipart parser
        # swallows it and hands the route a silently truncated body.
        body = bytearray()

        while True:
            message = await receive()

            if message["type"] == "http.disconnect":
                return

            body.extend(message.get("body", b""))

            if len(body) > self.max_size:
                await self._reject(scope, receive, send, 413, "Payload too large")
                return

            if not message.get("more_body", False):
                break

        buffered = bytes(body)
        replayed = False

        async def replay_receive():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": buffered, "more_body": False}
            return await receive()

        await self.app(scope, replay_receive, send)

    async def _reject(self, scope, receive, send, status: int, message: str):
        await JSONResponse(status_code=status, content={"error": message})(scope, receive, send)


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

app.add_middleware(BodySizeLimitMiddleware, max_size=MAX_UPLOAD_SIZE)

app.include_router(verify.router, prefix=settings.API_V1_STR)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": settings.PROJECT_NAME}

@app.get("/")
def root():
    return {"message": "Ghosty AI Service is Running"}
