from fastapi import FastAPI
app = FastAPI()
@app.get("/fixture")
def endpoint_fixture():
    return None
