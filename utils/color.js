(function () {
  "use strict";

  function hexToRgb(hex) {
    const normalized = String(hex).replace("#", "").trim();
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    };
  }

  function rgbToLab(r, g, b) {
    const xyz = rgbToXyz(r, g, b);
    return xyzToLab(xyz.x, xyz.y, xyz.z);
  }

  function rgbToXyz(r, g, b) {
    let nr = r / 255;
    let ng = g / 255;
    let nb = b / 255;
    nr = nr > 0.04045 ? Math.pow((nr + 0.055) / 1.055, 2.4) : nr / 12.92;
    ng = ng > 0.04045 ? Math.pow((ng + 0.055) / 1.055, 2.4) : ng / 12.92;
    nb = nb > 0.04045 ? Math.pow((nb + 0.055) / 1.055, 2.4) : nb / 12.92;

    return {
      x: (nr * 0.4124 + ng * 0.3576 + nb * 0.1805) * 100,
      y: (nr * 0.2126 + ng * 0.7152 + nb * 0.0722) * 100,
      z: (nr * 0.0193 + ng * 0.1192 + nb * 0.9505) * 100,
    };
  }

  function xyzToLab(x, y, z) {
    const refX = 95.047;
    const refY = 100.0;
    const refZ = 108.883;
    let nx = x / refX;
    let ny = y / refY;
    let nz = z / refZ;
    nx = nx > 0.008856 ? Math.cbrt(nx) : 7.787 * nx + 16 / 116;
    ny = ny > 0.008856 ? Math.cbrt(ny) : 7.787 * ny + 16 / 116;
    nz = nz > 0.008856 ? Math.cbrt(nz) : 7.787 * nz + 16 / 116;

    return {
      l: 116 * ny - 16,
      a: 500 * (nx - ny),
      b: 200 * (ny - nz),
    };
  }

  function labDistance(a, b) {
    const dl = a.l - b.l;
    const da = a.a - b.a;
    const db = a.b - b.b;
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  function colorDistance(a, b) {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    const da = (a.a || 255) - (b.a || 255);
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da * 0.25);
  }

  function nearestColor(rgb, candidates) {
    const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
    let best = candidates[0];
    let bestDistance = Infinity;
    candidates.forEach((candidate) => {
      const distance = labDistance(lab, candidate.lab);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    });
    return best;
  }

  window.PindouColor = {
    colorDistance,
    hexToRgb,
    labDistance,
    nearestColor,
    rgbToLab,
    rgbToXyz,
    xyzToLab,
  };
})();
