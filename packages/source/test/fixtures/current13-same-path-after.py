from fastapi import FastAPI, APIRouter, Depends

app = FastAPI()
router = APIRouter(prefix="/v1")

def provider():
    return 1

@router.post("/items")
def handler(dependency=Depends(provider)):
    return dependency

app.include_router(router, prefix="/api")
