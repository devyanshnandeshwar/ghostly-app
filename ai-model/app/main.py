from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import verify
from app.core.config import settings

app = FastAPI(title=settings.PROJECT_NAME)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
app.include_router(verify.router, prefix=settings.API_V1_STR)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": settings.PROJECT_NAME}

@app.get("/")
def root():
    return {"message": "Ghostly AI Service is Running"}
