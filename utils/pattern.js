(function () {
  "use strict";

  const colorTools = window.PindouColor || {};
  const paletteData = (window.PindouPalettes && window.PindouPalettes.mardPaletteData) || [];
  const { hexToRgb, labDistance, nearestColor, rgbToLab } = colorTools;

  const bayer4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  function createPalette() {
    return paletteData.map((item) => {
      const rgb = hexToRgb(item[2]);
      return {
        id: "mard_" + item[0].toLowerCase(),
        brand: "Mard",
        code: item[0],
        name: item[1],
        hex: item[2],
        rgb,
        lab: rgbToLab(rgb.r, rgb.g, rgb.b),
      };
    });
  }

  const palette = createPalette();
  const paletteById = palette.reduce((result, color) => {
    result[color.id] = color;
    return result;
  }, {});

  function generatePattern(input) {
    const started = Date.now();
    const source = input && input.imageData;
    const beadWidth = clampInt(input && input.beadWidth, 8, 300, 48);
    const beadHeight = clampInt(input && input.beadHeight, 8, 300, 48);
    const maxColors = clampInt(input && input.maxColors, 2, 64, 24);
    const samplingMode = ["shape", "balanced", "smooth"].includes(input && input.samplingMode)
      ? input.samplingMode
      : "balanced";
    const dither = input && input.dither === "ordered" ? "ordered" : "none";
    const alphaThreshold = clampInt(input && input.alphaThreshold, 0, 255, 20);
    const contrast = clampInt(input && input.contrast, -50, 100, 0);
    const saturation = clampInt(input && input.saturation, -50, 100, 0);
    const coverageThreshold = clampInt(input && input.coverageThreshold, 1, 70, 12);
    const edgeBoost = clampInt(input && input.edgeBoost, 0, 100, 0);
    const border = normalizeBorderConfig(input && input.border, paletteById);
    const disabledIds = normalizeColorIdSet(input && input.disabledColorIds, paletteById);
    const replacementMap = normalizeReplacementMap(input && input.replacements, paletteById, disabledIds);
    const mappingPalette = palette.filter((color) => !disabledIds.has(color.id));
    const availablePalette = mappingPalette.length ? mappingPalette : palette;

    if (!source || !source.data || !source.width || !source.height) {
      return emptyResult(beadWidth, beadHeight);
    }

    const samples = samplePixels({
      imageData: source,
      beadWidth,
      beadHeight,
      samplingMode,
      dither,
      contrast,
      saturation,
      edgeBoost,
      alphaThreshold,
      coverageThreshold,
    });
    const firstPass = samples.map((sample) => (sample ? nearestColor(sample, availablePalette).id : null));
    const selectedIds = chooseTopColors(firstPass, Math.min(maxColors, palette.length));
    let candidates = availablePalette.filter((color) => selectedIds.has(color.id));
    if (candidates.length === 0) {
      candidates = availablePalette;
    }

    const rawCells = samples.map((sample) => (sample ? nearestColor(sample, candidates).id : null));
    const baseCells = applyReplacements(rawCells, replacementMap);
    const cells = applyBorderCells(baseCells, beadWidth, beadHeight, border, paletteById);
    const stats = computeStats(cells, paletteById);

    return {
      beadWidth,
      beadHeight,
      baseCells,
      cells,
      rawCells,
      stats,
      elapsedMs: Date.now() - started,
      totalBeads: cells.filter(Boolean).length,
      colorCount: stats.length,
    };
  }

  function emptyResult(beadWidth, beadHeight) {
    return {
      beadWidth,
      beadHeight,
      baseCells: [],
      cells: [],
      rawCells: [],
      stats: [],
      elapsedMs: 0,
      totalBeads: 0,
      colorCount: 0,
    };
  }

  function samplePixels(options) {
    const output = [];
    const source = options.imageData;
    const cellWidth = source.width / options.beadWidth;
    const cellHeight = source.height / options.beadHeight;

    for (let y = 0; y < options.beadHeight; y += 1) {
      for (let x = 0; x < options.beadWidth; x += 1) {
        const x0 = x * cellWidth;
        const y0 = y * cellHeight;
        const x1 = (x + 1) * cellWidth;
        const y1 = (y + 1) * cellHeight;
        const sample = sampleRegion(source, x0, y0, x1, y1, options);
        output.push(sample && options.dither === "ordered" ? applyOrderedDither(sample, x, y) : sample);
      }
    }
    return output;
  }

  function sampleRegion(source, x0, y0, x1, y1, options) {
    const data = source.data;
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    const samplesX =
      options.samplingMode === "smooth" ? clampInt(Math.ceil(width), 1, 8) : clampInt(Math.ceil(width * 1.35), 3, 12);
    const samplesY =
      options.samplingMode === "smooth" ? clampInt(Math.ceil(height), 1, 8) : clampInt(Math.ceil(height * 1.35), 3, 12);
    const buckets = {};
    const contrastFactorValue = contrastFactor(options.contrast);
    const saturationFactorValue = saturationFactor(options.saturation);
    let weightedR = 0;
    let weightedG = 0;
    let weightedB = 0;
    let weightedAlpha = 0;
    let foreground = 0;
    let total = 0;

    for (let sy = 0; sy < samplesY; sy += 1) {
      const py = clampInt(Math.floor(y0 + ((sy + 0.5) / samplesY) * height), 0, source.height - 1);
      for (let sx = 0; sx < samplesX; sx += 1) {
        const px = clampInt(Math.floor(x0 + ((sx + 0.5) / samplesX) * width), 0, source.width - 1);
        const i = (py * source.width + px) * 4;
        const a = data[i + 3];
        total += 1;
        if (a > options.alphaThreshold) {
          foreground += 1;
          const edgeWeight =
            1 +
            localEdgeStrength(data, source.width, source.height, px, py, options.alphaThreshold, contrastFactorValue, saturationFactorValue) *
              (options.edgeBoost / 100);
          const weight = (a / 255) * edgeWeight;
          const adjusted = adjustRgb(data[i], data[i + 1], data[i + 2], contrastFactorValue, saturationFactorValue);
          const r = adjusted.r;
          const g = adjusted.g;
          const b = adjusted.b;
          weightedR += r * weight;
          weightedG += g * weight;
          weightedB += b * weight;
          weightedAlpha += weight;

          const key = colorBucketKey(r, g, b, options.samplingMode);
          const bucket = buckets[key] || { r: 0, g: 0, b: 0, weight: 0, count: 0 };
          bucket.r += r * weight;
          bucket.g += g * weight;
          bucket.b += b * weight;
          bucket.weight += weight;
          bucket.count += 1;
          buckets[key] = bucket;
        }
      }
    }

    if (total === 0 || foreground / total < options.coverageThreshold / 100) {
      return null;
    }

    const bucketValues = Object.keys(buckets).map((key) => buckets[key]);
    if (options.samplingMode === "shape" && bucketValues.length > 0) {
      const dominant = bucketValues.sort((a, b) => b.weight - a.weight)[0];
      const weight = Math.max(1, dominant.weight);
      return {
        r: clampInt(Math.round(dominant.r / weight), 0, 255),
        g: clampInt(Math.round(dominant.g / weight), 0, 255),
        b: clampInt(Math.round(dominant.b / weight), 0, 255),
      };
    }

    if (options.samplingMode === "balanced" && bucketValues.length > 1) {
      const dominant = bucketValues.sort((a, b) => b.weight - a.weight)[0];
      const mixedWeight = Math.max(1, weightedAlpha + dominant.weight);
      return {
        r: clampInt(Math.round((weightedR + dominant.r) / mixedWeight), 0, 255),
        g: clampInt(Math.round((weightedG + dominant.g) / mixedWeight), 0, 255),
        b: clampInt(Math.round((weightedB + dominant.b) / mixedWeight), 0, 255),
      };
    }

    const weight = Math.max(1, weightedAlpha);
    return {
      r: clampInt(Math.round(weightedR / weight), 0, 255),
      g: clampInt(Math.round(weightedG / weight), 0, 255),
      b: clampInt(Math.round(weightedB / weight), 0, 255),
    };
  }

  function colorBucketKey(r, g, b, samplingMode) {
    const step = samplingMode === "shape" ? 28 : 36;
    return [Math.round(r / step), Math.round(g / step), Math.round(b / step)].join(":");
  }

  function localEdgeStrength(data, width, height, x, y, alphaThreshold, contrastFactorValue, saturationFactorValue) {
    const left = pixelBrightness(data, width, height, Math.max(0, x - 1), y, alphaThreshold, contrastFactorValue, saturationFactorValue);
    const right = pixelBrightness(data, width, height, Math.min(width - 1, x + 1), y, alphaThreshold, contrastFactorValue, saturationFactorValue);
    const top = pixelBrightness(data, width, height, x, Math.max(0, y - 1), alphaThreshold, contrastFactorValue, saturationFactorValue);
    const bottom = pixelBrightness(data, width, height, x, Math.min(height - 1, y + 1), alphaThreshold, contrastFactorValue, saturationFactorValue);
    return clampNumber((Math.abs(left - right) + Math.abs(top - bottom)) / 255, 0, 1);
  }

  function pixelBrightness(data, width, height, x, y, alphaThreshold, contrastFactorValue, saturationFactorValue) {
    const i = (y * width + x) * 4;
    if ((data[i + 3] || 0) <= alphaThreshold) {
      return 0;
    }
    const adjusted = adjustRgb(data[i], data[i + 1], data[i + 2], contrastFactorValue, saturationFactorValue);
    return 0.299 * adjusted.r + 0.587 * adjusted.g + 0.114 * adjusted.b;
  }

  function contrastFactor(contrast) {
    const value = clampInt(contrast, -50, 100, 0);
    if (value === 0) {
      return 1;
    }
    return (259 * (value + 255)) / (255 * (259 - value));
  }

  function applyContrastChannel(value, factor) {
    if (factor === 1) {
      return value;
    }
    return clampInt(Math.round(factor * (value - 128) + 128), 0, 255);
  }

  function saturationFactor(saturation) {
    return 1 + clampInt(saturation, -50, 100, 0) / 100;
  }

  function adjustRgb(r, g, b, contrastFactorValue, saturationFactorValue) {
    const next = {
      r: applyContrastChannel(r, contrastFactorValue),
      g: applyContrastChannel(g, contrastFactorValue),
      b: applyContrastChannel(b, contrastFactorValue),
    };
    if (saturationFactorValue === 1) {
      return next;
    }
    const gray = 0.299 * next.r + 0.587 * next.g + 0.114 * next.b;
    return {
      r: clampInt(Math.round(gray + (next.r - gray) * saturationFactorValue), 0, 255),
      g: clampInt(Math.round(gray + (next.g - gray) * saturationFactorValue), 0, 255),
      b: clampInt(Math.round(gray + (next.b - gray) * saturationFactorValue), 0, 255),
    };
  }

  function applyOrderedDither(sample, x, y) {
    const threshold = (bayer4[y % 4][x % 4] / 15 - 0.5) * 38;
    return {
      r: clampInt(Math.round(sample.r + threshold), 0, 255),
      g: clampInt(Math.round(sample.g + threshold), 0, 255),
      b: clampInt(Math.round(sample.b + threshold), 0, 255),
    };
  }

  function chooseTopColors(cells, limit) {
    const counts = {};
    cells.forEach((id) => {
      if (id) {
        counts[id] = (counts[id] || 0) + 1;
      }
    });
    return new Set(
      Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .slice(0, limit),
    );
  }

  function computeStats(cells, paletteMap) {
    const counts = {};
    cells.forEach((id) => {
      if (id) {
        counts[id] = (counts[id] || 0) + 1;
      }
    });
    return Object.keys(counts)
      .map((id) => ({
        color: getColor(paletteMap || paletteById, id),
        count: counts[id],
      }))
      .filter((item) => item.color)
      .sort((a, b) => b.count - a.count || a.color.code.localeCompare(b.color.code));
  }

  function defaultBorderConfig() {
    return {
      enabled: false,
      colorId: "mard_h7",
      thickness: 1,
      mode: "outside",
      unifySimilar: true,
      similarityThreshold: 10,
    };
  }

  function normalizeBorderConfig(input, paletteMap) {
    const defaults = defaultBorderConfig();
    const source = input && typeof input === "object" ? input : {};
    const next = {
      enabled: Boolean(source.enabled),
      colorId: typeof source.colorId === "string" ? source.colorId : defaults.colorId,
      thickness: clampInt(source.thickness, 1, 3, defaults.thickness),
      mode: ["outside", "inside", "both"].includes(source.mode) ? source.mode : defaults.mode,
      unifySimilar: source.unifySimilar === undefined ? defaults.unifySimilar : Boolean(source.unifySimilar),
      similarityThreshold: clampInt(source.similarityThreshold, 4, 30, defaults.similarityThreshold),
    };

    if (!getColor(paletteMap, next.colorId)) {
      next.colorId = getColor(paletteMap, defaults.colorId) ? defaults.colorId : firstPaletteId(paletteMap);
    }
    return next;
  }

  function applyBorderCells(cells, width, height, border, paletteMap, options) {
    const config = normalizeBorderConfig(border, paletteMap);
    if (!config.enabled || !config.colorId || !cells.length || width <= 0 || height <= 0) {
      return cells.slice();
    }

    const output = cells.slice();
    const sourceEdges = collectEdgeIndices(cells, width, height);
    const borderColor = getColor(paletteMap, config.colorId);
    const distance = (options && options.labDistance) || labDistance;

    if (config.mode === "outside" || config.mode === "both") {
      expandOutsideBorder(output, width, height, config.colorId, config.thickness);
    }

    if (config.unifySimilar && borderColor && typeof distance === "function") {
      sourceEdges.forEach((index) => {
        const id = output[index];
        const color = getColor(paletteMap, id);
        if (color && distance(color.lab, borderColor.lab) <= config.similarityThreshold) {
          output[index] = config.colorId;
        }
      });
    }

    if (config.mode === "inside" || config.mode === "both") {
      sourceEdges.forEach((index) => {
        output[index] = config.colorId;
      });
    }

    return output;
  }

  function applyReplacements(cells, replacementMap) {
    if (!replacementMap || (typeof replacementMap.size === "number" && replacementMap.size === 0)) {
      return cells.slice();
    }
    return cells.map((id) => {
      if (!id) {
        return null;
      }
      if (typeof replacementMap.get === "function") {
        return replacementMap.get(id) || id;
      }
      return replacementMap[id] || id;
    });
  }

  function normalizeColorIdSet(ids, paletteMap) {
    const output = new Set();
    const source = Array.isArray(ids) ? ids : ids && typeof ids.forEach === "function" ? Array.from(ids) : [];
    source.forEach((id) => {
      if (typeof id === "string" && getColor(paletteMap, id)) {
        output.add(id);
      }
    });
    return output;
  }

  function normalizeReplacementMap(input, paletteMap, disabledIds) {
    const output = {};
    const add = (sourceId, targetId) => {
      if (
        sourceId &&
        targetId &&
        sourceId !== targetId &&
        getColor(paletteMap, sourceId) &&
        getColor(paletteMap, targetId) &&
        !(disabledIds && (disabledIds.has(sourceId) || disabledIds.has(targetId)))
      ) {
        output[sourceId] = targetId;
      }
    };

    if (input && typeof input.forEach === "function" && typeof input.get === "function") {
      input.forEach((targetId, sourceId) => add(sourceId, targetId));
      return output;
    }

    if (Array.isArray(input)) {
      input.forEach((item) => {
        if (Array.isArray(item)) {
          add(item[0], item[1]);
          return;
        }
        if (item && typeof item === "object") {
          add(item.sourceId, item.targetId);
        }
      });
      return output;
    }

    if (input && typeof input === "object") {
      Object.keys(input).forEach((sourceId) => add(sourceId, input[sourceId]));
    }
    return output;
  }

  function pickDominantEdgeColor(cells, width, height, paletteMap) {
    const counts = {};
    collectEdgeIndices(cells, width, height).forEach((index) => {
      const id = cells[index];
      if (getColor(paletteMap || paletteById, id)) {
        counts[id] = (counts[id] || 0) + 1;
      }
    });
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))[0] || "";
  }

  function collectEdgeIndices(cells, width, height) {
    const edges = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (cells[index] && isEdgeCell(cells, width, height, x, y)) {
          edges.push(index);
        }
      }
    }
    return edges;
  }

  function isEdgeCell(cells, width, height, x, y) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          return true;
        }
        if (!cells[ny * width + nx]) {
          return true;
        }
      }
    }
    return false;
  }

  function expandOutsideBorder(cells, width, height, colorId, thickness) {
    for (let step = 0; step < thickness; step += 1) {
      const additions = {};
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          if (!cells[index]) {
            continue;
          }
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) {
                continue;
              }
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
                continue;
              }
              const nextIndex = ny * width + nx;
              if (!cells[nextIndex]) {
                additions[nextIndex] = true;
              }
            }
          }
        }
      }
      Object.keys(additions).forEach((index) => {
        cells[Number(index)] = colorId;
      });
    }
  }

  function getColor(paletteMap, id) {
    if (!id || !paletteMap) {
      return null;
    }
    return typeof paletteMap.get === "function" ? paletteMap.get(id) : paletteMap[id];
  }

  function firstPaletteId(paletteMap) {
    if (!paletteMap) {
      return "";
    }
    if (typeof paletteMap.keys === "function") {
      return paletteMap.keys().next().value || "";
    }
    return Object.keys(paletteMap)[0] || "";
  }

  function clampInt(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback === undefined ? min : fallback;
    }
    return Math.round(Math.min(max, Math.max(min, number)));
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback === undefined ? min : fallback;
    }
    return Math.min(max, Math.max(min, number));
  }

  window.PindouPattern = {
    applyBorderCells,
    applyReplacements,
    collectEdgeIndices,
    computeStats,
    defaultBorderConfig,
    generatePattern,
    normalizeBorderConfig,
    palette,
    paletteById,
    pickDominantEdgeColor,
  };
})();
