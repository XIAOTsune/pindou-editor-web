(function () {
  "use strict";

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

  function normalizeBorderConfig(input, paletteById) {
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

    if (!getColor(paletteById, next.colorId)) {
      next.colorId = getColor(paletteById, defaults.colorId) ? defaults.colorId : firstPaletteId(paletteById);
    }
    return next;
  }

  function applyBorderCells(cells, width, height, border, paletteById, options) {
    const config = normalizeBorderConfig(border, paletteById);
    if (!config.enabled || !config.colorId || !cells.length || width <= 0 || height <= 0) {
      return cells.slice();
    }

    const output = cells.slice();
    const sourceEdges = collectEdgeIndices(cells, width, height);
    const borderColor = getColor(paletteById, config.colorId);
    const labDistance = options && options.labDistance;

    if (config.mode === "outside" || config.mode === "both") {
      expandOutsideBorder(output, width, height, config.colorId, config.thickness);
    }

    if (config.unifySimilar && borderColor && typeof labDistance === "function") {
      sourceEdges.forEach((index) => {
        const id = output[index];
        const color = getColor(paletteById, id);
        if (color && labDistance(color.lab, borderColor.lab) <= config.similarityThreshold) {
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
    return cells.map((id) => {
      if (!id) {
        return null;
      }
      return replacementMap.get(id) || id;
    });
  }

  function computeStats(cells, paletteById) {
    const counts = new Map();
    cells.forEach((id) => {
      if (!id) {
        return;
      }
      counts.set(id, (counts.get(id) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([id, count]) => ({
        color: getColor(paletteById, id),
        count,
      }))
      .filter((item) => item.color)
      .sort((a, b) => b.count - a.count || a.color.code.localeCompare(b.color.code));
  }

  function pickDominantEdgeColor(cells, width, height, paletteById) {
    const counts = new Map();
    collectEdgeIndices(cells, width, height).forEach((index) => {
      const id = cells[index];
      if (getColor(paletteById, id)) {
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
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
      const additions = new Set();
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
                additions.add(nextIndex);
              }
            }
          }
        }
      }
      additions.forEach((index) => {
        cells[index] = colorId;
      });
    }
  }

  function getColor(paletteById, id) {
    if (!id || !paletteById) {
      return null;
    }
    return typeof paletteById.get === "function" ? paletteById.get(id) : paletteById[id];
  }

  function firstPaletteId(paletteById) {
    if (!paletteById) {
      return "";
    }
    if (typeof paletteById.keys === "function") {
      return paletteById.keys().next().value || "";
    }
    return Object.keys(paletteById)[0] || "";
  }

  function clampInt(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.round(Math.min(max, Math.max(min, number)));
  }

  window.PindouPattern = {
    applyBorderCells,
    applyReplacements,
    collectEdgeIndices,
    computeStats,
    defaultBorderConfig,
    normalizeBorderConfig,
    pickDominantEdgeColor,
  };
})();
