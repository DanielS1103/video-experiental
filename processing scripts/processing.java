
import processing.video.*;
import gab.opencv.*;
import java.awt.Rectangle;

Capture cam;
OpenCV opencv;

PImage video;

float intensidad = 0;
float objetivo = 0;
float tiempo = 0;

boolean primerFrame = false;

void setup() {
  size(640, 480);
  pixelDensity(1);

  cam = new Capture(this, "pipeline:autovideosrc");
  cam.start();

  video = createImage(640, 480, RGB);

  opencv = new OpenCV(this, 640, 480);
  opencv.loadCascade(OpenCV.CASCADE_FRONTALFACE);
}

void draw() {

  if (cam.available()) {
    cam.read();
    primerFrame = true;
  }

  if (!primerFrame) {
    background(0);
    return;
  }

  video.copy(cam, 0, 0, cam.width, cam.height,
             0, 0, width, height);

  opencv.loadImage(video);
  Rectangle[] rostros = opencv.detect();

  // DISTANCIA APARENTE
  if (rostros.length > 0) {

    float distancia = map(
      rostros[0].width,
      250, 60,
      0, 40
    );

    // TRES NIVELES DE EFECTO

    if (distancia <= 15) {
      objetivo = 8;  // EXTREMO
    }
    else if (distancia <= 30) {
      objetivo = 4;  // MEDIO
    }
    else {
      objetivo = 0;  // SIN EFECTO
    }

  } else {
    objetivo = 0;
  }

  // Transición suave
  intensidad = lerp(intensidad, objetivo, 0.08);

  video.loadPixels();
  loadPixels();

  tiempo += 0.035;

  for (int y = 0; y < height; y++) {

    for (int x = 0; x < width; x++) {

      float ondaX =
        sin(y * 0.035 + tiempo * 2)
        * 65 * intensidad;

      float ondaY =
        cos(x * 0.025 + tiempo * 1.5)
        * 55 * intensidad;

      float remolino =
        sin((x + y) * 0.018 + tiempo)
        * 45 * intensidad;

      float sx = constrain(
        x + ondaX + remolino,
        0, width - 1
      );

      float sy = constrain(
        y + ondaY + remolino,
        0, height - 1
      );

      int pos = int(sx) + int(sy) * width;

      pixels[x + y * width] =
        video.pixels[pos];
    }
  }

  updatePixels();
}
