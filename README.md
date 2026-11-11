# Instalación interactiva: video en bucle con dos modos
```
instalacion_kinect/
├── backend/   Python: webcam -> MediaPipe (manos) + movimiento -> WebSocket (:8765)
└── frontend/  WebGL2: video en bucle + shaders + audio generativo
    ├── js/app.js, js/audio.js
    └── shaders/  glitch.frag (los dos modos), trail.frag (huella), echo.frag (fantasmas)
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
Abre http://localhost:5500 . Pon tu video en `frontend/assets/experimental.mp4`, arrástralo
a la ventana o pulsa **O**. Sin backend, el ratón hace de mano. Pulsa cualquier tecla una vez
para activar el audio (política de autoplay del navegador).

## Modos (TAB o N para alternar, 1 = nostalgia, 2 = ansiedad)

**NOSTALGIA** — quieto: imagen cálida, suave y en cámara lenta, con cajita de música.
Moverse: la cinta VHS se inestabiliza y el video rebobina a saltos. Tocar con la mano: el
recuerdo se borra (lavado crema, desenfoque, grano) y deja fantasmas de frames pasados que
tardan unos 4 s en desaparecer; el audio se "ahoga" como bajo el agua.

**ANSIEDAD** — la tensión sube rápido con la agitación, baja despacio y además crece sola con
el tiempo. Con ella: latido (audio y visual) que se acelera, cuadro que se cierra con viñeta,
color frío y desaturado, microbucles intrusivos del video, glitches espontáneos, zumbido agudo
y drone disonante. Con dos manos a la vez el video se duplica y se superpone.

## Teclas
TAB/N cambiar modo · 1/2 modo directo · F pantalla completa · O cargar video · Espacio pausa ·
A audio on/off · S efectos de tiempo (rebobinar / microbucles) · H ocultar panel ·
M forzar ratón · X invertir eje X · +/- intensidad · [ ] radio

## Cuando llegue el Kinect
Crea una `KinectSource` en `tracker_server.py` con un método `read()` que devuelva un frame
(o reemplaza la lógica de `step()` para usar el mapa de profundidad). El protocolo JSON y
todo el frontend quedan intactos.
