"""
ProvenHire AI Proctoring Service
Vision-based monitoring: face detection, phone detection, person count, eye/gaze estimation.
"""
from contextlib import asynccontextmanager
import base64
import io
import os
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Optional YOLO - load lazily
_yolo_model = None


def load_yolo():
    global _yolo_model
    if _yolo_model is None:
        try:
            from ultralytics import YOLO
            # Use YOLOv8n (nano) - fast and lightweight
            _yolo_model = YOLO("yolov8n.pt")
        except Exception as e:
            print(f"YOLO load warning: {e}. Phone detection will use heuristics.")
    return _yolo_model


def get_cascade_path():
    """OpenCV Haar cascade for face detection."""
    path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    if not os.path.exists(path):
        path = cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml"
    return path


FACE_CASCADE = None


def get_face_cascade():
    global FACE_CASCADE
    if FACE_CASCADE is None:
        FACE_CASCADE = cv2.CascadeClassifier(get_cascade_path())
    return FACE_CASCADE


def base64_to_cv2(b64: str) -> np.ndarray:
    """Decode base64 image to OpenCV BGR."""
    raw = base64.b64decode(b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image data")
    return img


def detect_faces(img: np.ndarray) -> tuple[list, int]:
    """Detect faces using Haar cascade. Returns (rects, count)."""
    cascade = get_face_cascade()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    rects = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
    return list(rects), len(rects)


def detect_phone_yolo(img: np.ndarray) -> tuple[bool, float]:
    """Use YOLO to detect cell phone (COCO class 67)."""
    model = load_yolo()
    if model is None:
        return False, 0.0
    try:
        results = model(img, verbose=False)[0]
        # COCO class 67 = cell phone
        for box in results.boxes:
            if int(box.cls[0]) == 67:
                conf = float(box.conf[0])
                if conf >= 0.4:
                    return True, conf
        return False, 0.0
    except Exception:
        return False, 0.0


def estimate_gaze_from_face_region(img: np.ndarray, x: int, y: int, w: int, h: int) -> str:
    """
    Simple heuristic: use face region and eyes region to guess looking direction.
    CENTER = looking at screen, LEFT/RIGHT/UP/AWAY = looking away.
    """
    h_img, w_img = img.shape[:2]
    cx = x + w // 2
    cy = y + h // 2

    # Face in center third = likely at screen
    center_band = w_img // 3
    if center_band <= cx <= 2 * center_band:
        # Check vertical - if face too high/low, might be looking up/down
        if cy < h_img * 0.35:
            return "UP"
        if cy > h_img * 0.75:
            return "UP"  # chin up
        return "CENTER"

    if cx < center_band:
        return "LEFT"
    return "RIGHT"


def detect_mouth_open(img: np.ndarray, face_rect) -> bool:
    """
    Simple heuristic: use lower half of face region for mouth.
    In production, use dlib/MediaPipe for accurate mouth openness.
    """
    x, y, w, h = face_rect
    # Mouth is roughly in bottom 40% of face
    my = int(y + h * 0.6)
    mh = int(h * 0.4)
    mx = int(x + w * 0.2)
    mw = int(w * 0.6)
    roi = img[my : my + mh, mx : mx + mw]
    if roi.size == 0:
        return False
    # Simple intensity variance - talking often increases movement/variance
    # This is a placeholder - real impl would use landmark-based mouth aspect ratio
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    _, std = cv2.meanStdDev(gray)
    return float(std) > 35  # Empirical threshold


def simple_spoof_check(img: np.ndarray, face_rect) -> bool:
    """
    Basic anti-spoof: check for unnatural flatness (photo) or screen reflection.
    Returns True if spoof suspected.
    """
    x, y, w, h = face_rect
    roi = img[y : y + h, x : x + w]
    if roi.size == 0:
        return False
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    var = laplacian.var()
    # Printed photos/screens tend to have lower variance (flatter)
    if var < 100:
        return True
    return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload models on startup
    get_face_cascade()
    load_yolo()
    yield


app = FastAPI(title="ProvenHire AI Proctor", lifespan=lifespan)


class FrameRequest(BaseModel):
    frame: str  # base64 image


class VisionResponse(BaseModel):
    face_detected: bool
    person_count: int
    phone_detected: bool
    looking_direction: str  # CENTER, LEFT, RIGHT, UP, AWAY
    mouth_open: bool
    spoof_detected: bool
    confidence: float


@app.post("/vision/analyze", response_model=VisionResponse)
async def analyze_frame(req: FrameRequest):
    try:
        img = base64_to_cv2(req.frame)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid frame: {e}")

    # Resize for faster processing if large
    h, w = img.shape[:2]
    if max(h, w) > 640:
        scale = 640 / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    # 1. Face detection
    face_rects, face_count = detect_faces(img)
    face_detected = face_count > 0

    # 2. Person count: use face count as proxy (1 face = 1 person typically)
    # For multiple people in frame, we'd use YOLO person detector
    person_count = face_count
    if person_count == 0:
        # Maybe person turned away - run YOLO person
        model = load_yolo()
        if model:
            try:
                results = model(img, verbose=False)[0]
                person_count = sum(1 for box in results.boxes if int(box.cls[0]) == 0)
            except Exception:
                pass

    # 3. Phone detection (every 3rd frame can be skipped by caller for perf)
    phone_detected, phone_conf = detect_phone_yolo(img)

    # 4. Looking direction
    if face_detected and face_rects:
        rect = face_rects[0]
        x, y, w, h = rect
        looking_direction = estimate_gaze_from_face_region(img, x, y, w, h)
    else:
        looking_direction = "AWAY"

    # 5. Mouth open (only if face present)
    mouth_open = False
    if face_detected and face_rects:
        mouth_open = detect_mouth_open(img, face_rects[0])

    # 6. Spoof detection
    spoof_detected = False
    if face_detected and face_rects:
        spoof_detected = simple_spoof_check(img, face_rects[0])

    # Overall confidence
    confidence = 0.85 if face_detected else 0.7
    if phone_detected:
        confidence = max(confidence, phone_conf)

    return VisionResponse(
        face_detected=face_detected,
        person_count=person_count,
        phone_detected=phone_detected,
        looking_direction=looking_direction,
        mouth_open=mouth_open,
        spoof_detected=spoof_detected,
        confidence=round(confidence, 2),
    )


@app.get("/health")
def health():
    return {"ok": True, "service": "ai-proctor"}
