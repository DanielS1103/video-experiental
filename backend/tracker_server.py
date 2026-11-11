"""
Backend de la instalacion: lee la webcam (o el Kinect mas adelante), extrae
posicion de manos + cantidad de movimiento y lo emite por WebSocket.

Mensaje JSON (en coordenadas normalizadas 0..1, origen arriba-izquierda):
  {"hands": [{"x": 0.51, "y": 0.40}, ...], "motion": 0.23, "source": "hands"|"motion"|"none", "t": 123.4}

Uso:
  python tracker_server.py --preview
  python tracker_server.py --camera 1 --fps 30 --port 8765
"""
import argparse
import asyncio
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
from websockets.asyncio.server import broadcast, serve

try:
    import mediapipe as mp
except ImportError:  # el sistema sigue funcionando solo con movimiento
    mp = None
    print("[aviso] mediapipe no esta instalado: solo se usara deteccion de movimiento.")


# --------------------------------------------------------------------------
# Fuentes de imagen. Cuando llegue el Kinect, crea aqui una clase KinectSource
# con el mismo metodo read() (devolviendo un frame BGR) y usala en main().
# --------------------------------------------------------------------------
class WebcamSource:
    def __init__(self, index: int, width: int, height: int):
        backend = cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY
        self.cap = cv2.VideoCapture(index, backend)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        if not self.cap.isOpened():
            raise RuntimeError(
                f"No se pudo abrir la camara {index}. Prueba --camera 1 "
                "(y recuerda: en WSL la webcam no se ve; ejecuta esto en Windows)."
            )

    def read(self):
        ok, frame = self.cap.read()
        return frame if ok else None

    def release(self):
        self.cap.release()


# --------------------------------------------------------------------------
class Tracker:
    PALM_IDS = (0, 5, 9, 13, 17)  # muneca + base de los dedos = centro de la palma

    def __init__(self, source, max_hands: int, preview: bool, mirror: bool):
        self.source = source
        self.max_hands = max_hands
        self.preview = preview
        self.mirror = mirror
        self.prev_gray = None
        self.motion_smooth = 0.0
        self.stop = False
        self.hands = None
        if mp is not None:
            self.hands = mp.solutions.hands.Hands(
                max_num_hands=max_hands,
                model_complexity=0,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            self.drawer = mp.solutions.drawing_utils

    def step(self):
        frame = self.source.read()
        if frame is None:
            return None
        if self.mirror:
            frame = cv2.flip(frame, 1)

        small = cv2.resize(frame, (320, 240))

        # ---- movimiento (aproximacion barata de optical flow) ----
        gray = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (9, 9), 0)
        motion, mcx, mcy = 0.0, None, None
        if self.prev_gray is not None:
            diff = cv2.absdiff(gray, self.prev_gray)
            _, mask = cv2.threshold(diff, 22, 255, cv2.THRESH_BINARY)
            motion = float(np.clip(mask.mean() / 255.0 * 8.0, 0.0, 1.0))
            m = cv2.moments(mask, binaryImage=True)
            if m["m00"] > 120:
                mcx, mcy = m["m10"] / m["m00"] / 320.0, m["m01"] / m["m00"] / 240.0
        self.prev_gray = gray
        self.motion_smooth += (motion - self.motion_smooth) * 0.35

        # ---- manos con MediaPipe ----
        hands, source = [], "none"
        res = None
        if self.hands is not None:
            res = self.hands.process(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
            if res.multi_hand_landmarks:
                for lm in res.multi_hand_landmarks[: self.max_hands]:
                    xs = [lm.landmark[i].x for i in self.PALM_IDS]
                    ys = [lm.landmark[i].y for i in self.PALM_IDS]
                    hands.append({"x": round(float(np.mean(xs)), 4), "y": round(float(np.mean(ys)), 4)})
                source = "hands"

        # sin manos: usa el centroide del movimiento como "mano" virtual
        if not hands and mcx is not None and self.motion_smooth > 0.03:
            hands.append({"x": round(mcx, 4), "y": round(mcy, 4)})
            source = "motion"

        if self.preview:
            view = small.copy()
            if res is not None and res.multi_hand_landmarks:
                for lm in res.multi_hand_landmarks:
                    self.drawer.draw_landmarks(view, lm, mp.solutions.hands.HAND_CONNECTIONS)
            for h in hands:
                cv2.circle(view, (int(h["x"] * 320), int(h["y"] * 240)), 10, (0, 255, 0), 2)
            cv2.putText(view, f"{source} motion={self.motion_smooth:.2f}", (6, 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            cv2.imshow("tracker (q para salir)", view)
            if cv2.waitKey(1) & 0xFF in (27, ord("q")):
                self.stop = True

        return {
            "hands": hands,
            "motion": round(self.motion_smooth, 4),
            "source": source,
            "t": round(time.time(), 3),
        }


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--hands", type=int, default=2)
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--height", type=int, default=480)
    ap.add_argument("--no-mirror", action="store_true", help="no voltear la imagen horizontalmente")
    ap.add_argument("--preview", action="store_true", help="ventana de depuracion con el tracking")
    args = ap.parse_args()

    source = WebcamSource(args.camera, args.width, args.height)
    tracker = Tracker(source, args.hands, args.preview, mirror=not args.no_mirror)
    clients = set()

    async def handler(ws):
        clients.add(ws)
        print(f"[ws] cliente conectado ({len(clients)})")
        try:
            await ws.wait_closed()
        finally:
            clients.discard(ws)
            print(f"[ws] cliente desconectado ({len(clients)})")

    # un unico hilo: OpenCV/HighGUI exige que imshow y waitKey vivan en el mismo hilo
    executor = ThreadPoolExecutor(max_workers=1)
    loop = asyncio.get_running_loop()
    interval = 1.0 / args.fps

    async with serve(handler, args.host, args.port):
        print(f"[ok] WebSocket en ws://localhost:{args.port}  (Ctrl+C para salir)")
        try:
            while not tracker.stop:
                t0 = time.perf_counter()
                data = await loop.run_in_executor(executor, tracker.step)
                if data is not None and clients:
                    broadcast(clients, json.dumps(data))
                await asyncio.sleep(max(0.0, interval - (time.perf_counter() - t0)))
        finally:
            source.release()
            cv2.destroyAllWindows()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
