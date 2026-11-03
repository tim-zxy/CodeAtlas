from fastapi import APIRouter as Router, Depends
router = Router(prefix="/api")

def dependency():
    return 1

@router.get("/items", tags=["items"])
async def endpoint(value = Depends(dependency)):
    return []

@router.get("/" + dynamic_path)
def dynamic_endpoint():
    pass
