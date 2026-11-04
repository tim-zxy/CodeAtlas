from fastapi import FastAPI, Depends

app = FastAPI()
Depends = object()


def provider():
    return 1


@app.get("/shadow")
def handler(value=Depends(provider)):
    return value
