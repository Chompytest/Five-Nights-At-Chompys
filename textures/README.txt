TEXTURES — drop image files here. The game runs fine while this folder is
empty (procedurally generated canvas textures are used, one console warning
per missing file).

Expected files (declared in js/config.js ASSETS.textures):

  wall.jpg       interior walls          1024x1024  JPG  sRGB
  floor.jpg      wood plank flooring     1024x1024  JPG  sRGB
  carpet.jpg     den carpet              1024x1024  JPG  sRGB
  ceiling.jpg    ceilings                 512x512   JPG  sRGB
  curtain.jpg    den curtain fabric       512x512   JPG  sRGB
  grass.jpg      backyard ground         1024x1024  JPG  sRGB
  concrete.jpg   garage floor             512x512   JPG  sRGB

Rules:
  * power-of-two dimensions (256/512/1024/2048)
  * they tile: repeat wrapping is applied, so use seamless textures
  * keep them dark-friendly — the game is lit at night; very bright albedo
    will look radioactive under the moonlight
