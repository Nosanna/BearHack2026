from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
import requests
from ultralytics import YOLO


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

    results = model.predict(source=r.content, verbose=False)
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

