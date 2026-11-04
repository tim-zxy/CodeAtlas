from fastapi import Depends, FastAPI
app = FastAPI()
def provider():
    return 1
@app.get('/x')
def handler(x: Depends(provider)):
    return x
