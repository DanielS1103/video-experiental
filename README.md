# Instalación interactiva: video en bucle + glitch por movimiento

```
instalacion_kinect/
├── backend/   Python: webcam -> MediaPipe (manos) + movimiento -> WebSocket (:8765)
└── frontend/  WebGL2: video en bucle como textura + shader de glitch
```

## 1. Backend (en Windows, no en WSL: WSL no ve la webcam)

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python tracker_server.py --preview
```

Opciones: `--camera 1`, `--fps 30`, `--hands 2`, `--port 8765`, `--no-mirror`.

## 2. Frontend

```powershell
cd frontend
python -m http.server 5500
```

Abre http://localhost:5500 . Pon tu video en `frontend/assets/experimental.mp4`,
arrástralo a la ventana o pulsa **O**. Sin backend, el ratón hace de mano.

## Teclas
F pantalla completa · O cargar video · Espacio pausa · H ocultar panel · M forzar ratón ·
X invertir eje X · S scratch del tiempo · +/- intensidad · [ ] radio

## Cuando llegue el Kinect
Crea una `KinectSource` en `tracker_server.py` con un método `read()` que devuelva un frame
(o reemplaza la lógica de `step()` para usar el mapa de profundidad). El protocolo JSON y
todo el frontend quedan intactos.
