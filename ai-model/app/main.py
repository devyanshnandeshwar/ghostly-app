from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import verify
from app.core.config import settings

app = FastAPI(title=settings.PROJECT_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def limit_upload_size(request, call_next):
    max_size = 5 * 1024 * 1024 # 5MB
    content_length = request.headers.get("content-length")
    
    if content_length and int(content_length) > max_size:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=413, content={"error": "Payload too large"})
        
    response = await call_next(request)
    return response

app.include_router(verify.router, prefix=settings.API_V1_STR)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": settings.PROJECT_NAME}

@app.get("/")
def root():
    return {"message": "Ghosty AI Service is Running"}
