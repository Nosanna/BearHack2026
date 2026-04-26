## YOLO part-detector service (dev)

This is a tiny FastAPI service that loads `appliance-detector.pt` and returns
dryer-part detections (front/drum/lint_filter/knob) for a given image URL.

### Run

```bash
cd apps/yolo
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8008
```

### API

- `POST /infer` body: `{ "imageUrl": "https://..." }`
- response: `{ "detections": [{ "label": "lint_filter", "confidence": 0.92, "bbox": { "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.1 } }] }`

### Configure API to use it

Set `YOLO_SERVICE_URL=http://localhost:8008` in `apps/api/.env`.

