from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
import requests
from ultralytics import YOLO
from PIL import Image
import numpy as np
import io


class InferRequest(BaseModel):
    imageUrl: HttpUrl


app = FastAPI()
model = YOLO("appliance-detector.pt")


@app.post("/infer")
def infer(req: InferRequest):
    try:
        r = requests.get(str(req.imageUrl), timeout=10)
        r.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch imageUrl: {e}")

    # Ultralytics does not accept arbitrary raw bytes as `source`.
    # Decode bytes → RGB array and pass that to YOLO.
    try:
        img = Image.open(io.BytesIO(r.content)).convert("RGB")
        arr = np.array(img)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unsupported/invalid image bytes: {e}")

    results = model.predict(source=arr, verbose=False)
    if not results:
        return {"detections": []}

    res = results[0]
    dets = []
    if res.boxes is None:
        return {"detections": []}

    names = res.names or {}
    for b in res.boxes:
        cls = int(b.cls[0].item()) if hasattr(b.cls[0], "item") else int(b.cls[0])
        conf = float(b.conf[0].item()) if hasattr(b.conf[0], "item") else float(b.conf[0])
        # xywhn gives normalized [x_center, y_center, w, h]
        xywhn = b.xywhn[0]
        x = float(xywhn[0].item())
        y = float(xywhn[1].item())
        w = float(xywhn[2].item())
        h = float(xywhn[3].item())
        label = str(names.get(cls, str(cls)))
        dets.append({"label": label, "confidence": conf, "bbox": {"x": x, "y": y, "w": w, "h": h}})

    return {"detections": dets}

