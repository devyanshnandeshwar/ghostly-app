from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "Ghosty AI Service"
    API_V1_STR: str = "/api"
    # Browser origins allowed to call this service. Empty disables CORS entirely,
    # which is correct for internal server-to-server use.
    ALLOWED_ORIGINS: List[str] = []
    MODEL_PATH_PROTO: str = "deploy.prototxt"
    MODEL_PATH_WEIGHTS: str = "res10_300x300_ssd_iter_140000.caffemodel"
    GENDER_MODEL_PROTO: str = "gender_deploy.prototxt"
    GENDER_MODEL_WEIGHTS: str = "gender_net.caffemodel"
    
    class Config:
        case_sensitive = True

settings = Settings()
