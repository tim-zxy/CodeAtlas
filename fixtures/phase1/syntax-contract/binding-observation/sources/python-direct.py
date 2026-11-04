from fastapi import FastAPI, APIRouter
app = FastAPI()
router = APIRouter(prefix="/api")
@router.get("/items")
def endpoint():
    return []
