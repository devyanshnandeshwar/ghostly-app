from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from ..services.detection import detector

router = APIRouter()

@router.post("/verify-gender")
async def verify_gender(image: UploadFile = File(...)):
    contents = await image.read()
    
    result = detector.predict(contents)
    
    status = result.pop("status", 200)
    
    if status != 200:
        if status == 422:
             return JSONResponse(status_code=422, content=result)
        raise HTTPException(status_code=status, detail=result.get("error", "Unknown error"))
        
    return result
