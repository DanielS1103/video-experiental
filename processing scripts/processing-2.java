
import processing.video.*;
import gab.opencv.*;
import java.awt.Rectangle;

Capture cam;
OpenCV opencv;

PImage video;
PImage memoria;
PImage resultado;

float intensidad = 0;
float objetivo = 0;

boolean primerFrame = false;

void setup() {
  size(640, 480);
  pixelDensity(1);
  noSmooth();

  cam = new Capture(this, "pipeline:autovideosrc");
  cam.start();

  video = createImage(640, 480, RGB);
  memoria = createImage(640, 480, RGB);
  resultado = createImage(640, 480, RGB);

  opencv = new OpenCV(this, 640, 480);
  opencv.loadCascade(OpenCV.CASCADE_FRONTALFACE);

  memoria.loadPixels();

  for (int i = 0; i < memoria.pixels.length; i++) {
    memoria.pixels[i] = color(0);
  }

  memoria.updatePixels();
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

  // PROFUNDIDAD APARENTE

  if (rostros.length > 0) {

    float distancia = map(
      rostros[0].width,
      250, 60,
      0, 40
    );

    if (distancia <= 15) {
      objetivo = 1.0;
    }
    else if (distancia <= 30) {
      objetivo = 0.5;
    }
    else {
      objetivo = 0;
    }

  } else {
    objetivo = 0;
  }

  intensidad = lerp(intensidad, objetivo, 0.1);

  video.loadPixels();
  memoria.loadPixels();
  resultado.loadPixels();

  // SIN EFECTO
  if (intensidad < 0.01) {

    arrayCopy(video.pixels, resultado.pixels);
    resultado.updatePixels();

    image(resultado, 0, 0);

    arrayCopy(video.pixels, memoria.pixels);
    memoria.updatePixels();

    return;
  }

  int bloque = 12;

  float arrastre = 0.85 * intensidad;

  // DATAMOSHING POR BLOQUES

  for (int y = 0; y < height; y += bloque) {

    for (int x = 0; x < width; x += bloque) {

      int desplazamientoX = int(
        random(-180, 180) * intensidad
      );

      int desplazamientoY = int(
        random(-50, 50) * intensidad
      );

      int sx = constrain(
        x + desplazamientoX,
        0, width - 1
      );

      int sy = constrain(
        y + desplazamientoY,
        0, height - 1
      );

      int ancho = min(bloque, width - x);
      int alto = min(bloque, height - y);

      for (int by = 0; by < alto; by++) {

        for (int bx = 0; bx < ancho; bx++) {

          int px = x + bx;
          int py = y + by;

          int fuenteX = min(sx + bx, width - 1);
          int fuenteY = min(sy + by, height - 1);

          int pos = px + py * width;
          int fuente = fuenteX + fuenteY * width;

          color actual = video.pixels[fuente];
          color anterior = memoria.pixels[pos];

          resultado.pixels[pos] = lerpColor(
            actual,
            anterior,
            arrastre
          );
        }
      }
    }
  }

  resultado.updatePixels();

  // MOSTRAR RESULTADO
  image(resultado, 0, 0);

  // MEMORIA TEMPORAL
  arrayCopy(resultado.pixels, memoria.pixels);

  memoria.updatePixels();
}
