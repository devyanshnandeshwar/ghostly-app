from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Ghosty AI Service"
    API_V1_STR: str = "/api"
    MODEL_PATH_PROTO: str = "deploy.prototxt"
    MODEL_PATH_WEIGHTS: str = "res10_300x300_ssd_iter_140000.caffemodel"
    GENDER_MODEL_PROTO: str = "gender_deploy.prototxt"
    GENDER_MODEL_WEIGHTS: str = "gender_net.caffemodel"
    
    class Config:
        case_sensitive = True

settings = Settings()
