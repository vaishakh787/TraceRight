import os
import json
import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL_PATH = os.path.join(BASE_DIR, "models", "iforest-v1.joblib")
METRICS_PATH = os.path.join(BASE_DIR, "reports", "metrics.json")

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"Model file not found at: {MODEL_PATH}")

if not os.path.exists(METRICS_PATH):
    raise FileNotFoundError(f"Metrics metadata file not found at: {METRICS_PATH}")

model = joblib.load(MODEL_PATH)
with open(METRICS_PATH, "r") as f:
    meta = json.load(f)

class PredictRequest(BaseModel):
    featureSchemaVersion: int
    features: dict

@app.post("/predict")
def predict(req: PredictRequest):
    if req.featureSchemaVersion != 1:
        raise HTTPException(status_code=400, detail="Unsupported feature schema version")

    try:
        ordered = [float(req.features.get(col, 0.0)) for col in meta["feature_order"]]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing input features: {str(e)}")

    raw_df = model.decision_function([ordered])[0]

    min_df = meta["min_df"]
    max_df = meta["max_df"]
    
    normalized = 100.0 * (1.0 - (raw_df - min_df) / (max_df - min_df + 1e-9))
    ml_score = float(np.clip(normalized, 0.0, 100.0))

    return {
        "mlScore": ml_score,
        "mlModelVersion": meta.get("model_version", "iforest-v1"),
        "raw": {
            "decisionFunction": float(raw_df)
        }
    }