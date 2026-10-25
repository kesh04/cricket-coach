"""
Step 1 of the evaluation: run the SAME pose model the app uses (MediaPipe PoseLandmarker, lite)
over every video in a folder, and save the landmarks of every frame as JSON next to the video.

    pip install mediapipe opencv-python
    python tools/extract_landmarks.py path/to/videos

The model file is downloaded once (pose_landmarker_lite.task) into the current folder.
Output: <video name>.json  = { "fps": 30, "aspect": 0.56, "frames": [ { "t": ms, "lm": [132 numbers], "world": [99 numbers] } ] }
Frames where no person is found are skipped (the evaluator treats a gap as "no body").
"""
import json
import os
import sys
import urllib.request

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
MODEL_FILE = "pose_landmarker_lite.task"
EXTENSIONS = (".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm")


def make_landmarker():
    if not os.path.exists(MODEL_FILE):
        print("Downloading the pose model...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_FILE)
    options = vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=MODEL_FILE),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
    )
    return vision.PoseLandmarker.create_from_options(options)


def extract(path):
    landmarker = make_landmarker()  # fresh tracker for every video
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames, n, aspect = [], 0, None
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        h, w = bgr.shape[:2]
        aspect = w / h
        t = int(n * 1000 / fps)
        n += 1
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        result = landmarker.detect_for_video(image, t)
        if not result.pose_landmarks:
            continue
        lm, world = [], []
        for p in result.pose_landmarks[0]:
            lm += [p.x, p.y, p.z, p.visibility]
        for p in result.pose_world_landmarks[0]:
            world += [p.x, p.y, p.z]
        frames.append({"t": t, "lm": lm, "world": world})
    cap.release()
    landmarker.close()
    return {"fps": fps, "aspect": aspect, "frames": frames}


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python tools/extract_landmarks.py <folder with videos>")
    folder = sys.argv[1]
    for name in sorted(os.listdir(folder)):
        if not name.lower().endswith(EXTENSIONS):
            continue
        out = os.path.join(folder, os.path.splitext(name)[0] + ".json")
        if os.path.exists(out):
            print("skip (already done):", name)
            continue
        print("extracting:", name)
        with open(out, "w") as f:
            json.dump(extract(os.path.join(folder, name)), f)
    print("Done. Now write labels.csv and run: npx tsx scripts/evaluate.ts <folder> <labels.csv>")


if __name__ == "__main__":
    main()
