from fastapi import FastAPI
app = FastAPI()
@app.get("/holdout")
def endpoint_holdout():
    return None
