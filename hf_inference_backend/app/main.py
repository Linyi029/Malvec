import io
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from app.inference import InferenceService
from app.utils import parse_embedding_csv

app = FastAPI(title="Malvec Family Inference API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

svc = InferenceService()

@app.get("/health")
async def health():
    return {"status": "ok", "labels": svc.family_labels, "input_dim": svc.in_dim}

@app.post("/predict/csv")
async def predict_csv(file: UploadFile = File(...)):
    try:
        content = await file.read()
        df, X, ids = parse_embedding_csv(content)
        result = svc.predict(X)
        out = []
        for i, sid in enumerate(ids):
            out.append({
                "id": sid,
                "pred": result["pred_labels"][i],
                "probs": {l: float(result["probs"][i][j]) for j, l in enumerate(result["labels"])},
            })
        return {"results": out, "labels": result["labels"]}
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

@app.post("/plot/umap")
async def plot_umap(file: UploadFile = File(...)):
    import matplotlib.pyplot as plt
    from umap import UMAP
    content = await file.read()
    df, X, ids = parse_embedding_csv(content)
    result = svc.predict(X)
    preds = result["pred_labels"]

    reducer = UMAP(n_neighbors=15, min_dist=0.1, metric="cosine", random_state=42)
    X2d = reducer.fit_transform(X)

    plt.figure(figsize=(6, 5))
    uniq = list(set(preds))
    cmap = {u: i for i, u in enumerate(uniq)}
    plt.scatter(X2d[:, 0], X2d[:, 1], c=[cmap[p] for p in preds], s=10)
    plt.title("Malware Family UMAP")
    plt.legend(uniq, fontsize=8)

    buf = io.BytesIO()
    plt.tight_layout()
    plt.savefig(buf, format="png", dpi=150)
    plt.close()
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")
