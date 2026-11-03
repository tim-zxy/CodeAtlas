from fastapi import APIRouter
router = APIRouter()
def outer(default=APIRouter()):
    router = custom()
    @router.get("/items")
    def inner():
        return router
class Local:
    value = APIRouter()
callback = lambda: APIRouter()
values = [APIRouter() for x in data]
