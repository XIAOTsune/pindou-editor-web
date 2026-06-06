(function () {
  "use strict";

  const maxWorkingSide = 1400;
  const beadLimit = 300;
  const draftDbName = "pindou-editor-web";
  const draftStoreName = "drafts";
  const draftKey = "autosave";
  const bayer4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  const colorTools = window.PindouColor;
  const patternTools = window.PindouPattern;
  const paletteData = window.PindouPalettes || {};

  if (!colorTools || !patternTools || !paletteData.mardPaletteData) {
    throw new Error("Pindou modules are not loaded in the expected order.");
  }

  const { colorDistance, hexToRgb, labDistance, nearestColor, rgbToLab } = colorTools;
  const {
    applyBorderCells,
    applyReplacements,
    computeStats: computePaletteStats,
    defaultBorderConfig,
    normalizeBorderConfig,
    pickDominantEdgeColor,
  } = patternTools;
  const mardPaletteData = paletteData.mardPaletteData;
  const palette = mardPaletteData.map((item) => {
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

  const paletteById = new Map(palette.map((color) => [color.id, color]));

  const state = {
    activeTab: "image",
    activeTool: "view",
    sourceCanvas: null,
    sourceImageData: null,
    mask: null,
    maskHistory: [],
    maskVersion: 0,
    maskedCanvas: null,
    maskedVersion: -1,
    imageName: "",
    crop: {
      left: 0,
      right: 1,
      top: 0,
      bottom: 1,
    },
    beadWidth: 64,
    beadHeight: 64,
    lockAspect: true,
    beadMm: 5,
    boardWidth: 29,
    boardHeight: 29,
    alphaThreshold: 20,
    contrast: 0,
    saturation: 0,
    tolerance: 42,
    brushSize: 24,
    samplingMode: "shape",
    cropAspect: "free",
    coverageThreshold: 18,
    edgeBoost: 35,
    maxColors: 32,
    dither: "none",
    widthDraft: "64",
    heightDraft: "64",
    disabledColors: new Set(),
    replacementMap: new Map(),
    replaceExpanded: new Set(),
    replaceShowAll: new Set(),
    border: defaultBorderConfig(),
    pixelSamples: [],
    rawCells: [],
    borderedCells: [],
    finalCells: [],
    stats: [],
    transform: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    },
    interaction: null,
    activePointers: new Map(),
    contentRect: null,
    recomputeTimer: null,
    draftTimer: null,
    isRestoringDraft: false,
    lastExportUrl: "",
    showGrid: true,
    showBoard: true,
    showCodes: true,
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindElements();
    bindEvents();
    registerServiceWorker();
    renderPaletteGrid();
    renderAll();
    observeCanvas();
    updateDraftButtonState();
  }

  function bindElements() {
    const ids = [
      "projectSubtitle",
      "restoreDraftButton",
      "loadProjectButton",
      "saveProjectButton",
      "exportPdfButtonTop",
      "previewModeLabel",
      "previewSizeLabel",
      "gridToggle",
      "boardToggle",
      "codeToggle",
      "canvasWrap",
      "previewCanvas",
      "emptyImport",
      "statusLine",
      "pwaStatus",
      "imageInput",
      "imageInputSecondary",
      "toleranceInput",
      "toleranceValue",
      "brushInput",
      "brushValue",
      "alphaInput",
      "alphaValue",
      "contrastInput",
      "contrastValue",
      "saturationInput",
      "saturationValue",
      "autoCutoutButton",
      "undoMaskButton",
      "applyAlphaButton",
      "resetMaskButton",
      "resetCropButton",
      "cropAspectSelect",
      "beadWidthInput",
      "beadHeightInput",
      "aspectToggle",
      "beadMmInput",
      "boardWidthInput",
      "boardHeightInput",
      "sizeMetrics",
      "samplingModeSelect",
      "coverageInput",
      "coverageValue",
      "edgeInput",
      "edgeValue",
      "maxColorsInput",
      "ditherSelect",
      "borderEnabledInput",
      "borderControls",
      "borderColorCurrent",
      "borderColorLabel",
      "borderPickEdgeButton",
      "borderPaletteGrid",
      "borderThicknessInput",
      "borderThicknessValue",
      "borderModeSelect",
      "borderUnifyInput",
      "borderThresholdInput",
      "borderThresholdValue",
      "paletteGrid",
      "clearReplaceButton",
      "replaceList",
      "summaryMetrics",
      "exportPngButton",
      "openPngButton",
      "copyStatsButton",
      "exportCsvButton",
      "exportPdfButton",
      "statsBody",
      "printRoot",
    ];

    ids.forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.querySelectorAll(".step-tab").forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.tab));
    });

    document.querySelectorAll(".segment").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeTool = button.dataset.tool;
        document.querySelectorAll(".segment").forEach((node) => {
          node.classList.toggle("active", node === button);
        });
        els.previewCanvas.style.cursor = "";
        setStatus(toolStatusText());
      });
    });

    els.imageInput.addEventListener("change", handleImageInput);
    els.imageInputSecondary.addEventListener("change", handleImageInput);
    els.restoreDraftButton.addEventListener("click", restoreDraftFromStorage);
    els.loadProjectButton.addEventListener("click", loadProjectFromDisk);
    els.saveProjectButton.addEventListener("click", saveProjectToDisk);

    bindRange(els.toleranceInput, els.toleranceValue, (value) => {
      state.tolerance = value;
      scheduleDraftSave();
    });
    bindRange(els.brushInput, els.brushValue, (value) => {
      state.brushSize = value;
      scheduleDraftSave();
    });
    bindRange(els.alphaInput, els.alphaValue, (value) => {
      state.alphaThreshold = value;
      scheduleRecompute();
    });
    bindRange(els.contrastInput, els.contrastValue, (value) => {
      state.contrast = value;
      scheduleRecompute();
    });
    bindRange(els.saturationInput, els.saturationValue, (value) => {
      state.saturation = value;
      scheduleRecompute();
    });

    els.applyAlphaButton.addEventListener("click", applyAlphaThresholdToMask);
    els.autoCutoutButton.addEventListener("click", autoCutoutBackground);
    els.undoMaskButton.addEventListener("click", undoMaskEdit);
    els.resetMaskButton.addEventListener("click", resetMask);
    els.resetCropButton.addEventListener("click", resetCrop);
    els.cropAspectSelect.addEventListener("change", () => {
      state.cropAspect = els.cropAspectSelect.value;
      applyCropAspect();
    });

    bindBeadDimensionInput("width", els.beadWidthInput);
    bindBeadDimensionInput("height", els.beadHeightInput);
    els.aspectToggle.addEventListener("change", () => {
      state.lockAspect = els.aspectToggle.checked;
      if (state.lockAspect) {
        applyBeadSize("width", state.beadWidth, true);
      }
      scheduleDraftSave();
    });
    bindCommittedNumberInput(els.beadMmInput, {
      min: 2,
      max: 10,
      integer: false,
      get: () => state.beadMm,
      set: (value) => {
        state.beadMm = value;
      },
      onChange: () => {
        renderMetrics();
        scheduleDraftSave();
      },
    });
    bindCommittedNumberInput(els.boardWidthInput, {
      min: 8,
      max: 80,
      integer: true,
      get: () => state.boardWidth,
      set: (value) => {
        state.boardWidth = value;
      },
      onChange: scheduleRecompute,
    });
    bindCommittedNumberInput(els.boardHeightInput, {
      min: 8,
      max: 80,
      integer: true,
      get: () => state.boardHeight,
      set: (value) => {
        state.boardHeight = value;
      },
      onChange: scheduleRecompute,
    });

    bindCommittedNumberInput(els.maxColorsInput, {
      min: 2,
      max: palette.length,
      integer: true,
      get: () => state.maxColors,
      set: (value) => {
        state.maxColors = value;
      },
      onChange: scheduleRecompute,
    });
    els.samplingModeSelect.addEventListener("change", () => {
      state.samplingMode = els.samplingModeSelect.value;
      scheduleRecompute();
    });
    bindPercentRange(els.coverageInput, els.coverageValue, (value) => {
      state.coverageThreshold = value;
      scheduleRecompute();
    });
    bindRange(els.edgeInput, els.edgeValue, (value) => {
      state.edgeBoost = value;
      scheduleRecompute();
    });
    els.ditherSelect.addEventListener("change", () => {
      state.dither = els.ditherSelect.value;
      scheduleRecompute();
    });
    els.borderEnabledInput.addEventListener("change", () => {
      state.border.enabled = els.borderEnabledInput.checked;
      scheduleRecompute();
      renderBorderControls();
    });
    bindRange(els.borderThicknessInput, els.borderThicknessValue, (value) => {
      state.border.thickness = clampInt(value, 1, 3);
      scheduleRecompute();
    });
    els.borderModeSelect.addEventListener("change", () => {
      state.border.mode = validOption(els.borderModeSelect.value, ["outside", "inside", "both"], "outside");
      scheduleRecompute();
    });
    els.borderUnifyInput.addEventListener("change", () => {
      state.border.unifySimilar = els.borderUnifyInput.checked;
      scheduleRecompute();
    });
    bindRange(els.borderThresholdInput, els.borderThresholdValue, (value) => {
      state.border.similarityThreshold = clampInt(value, 4, 30);
      scheduleRecompute();
    });
    els.borderPickEdgeButton.addEventListener("click", pickBorderColorFromEdge);

    els.gridToggle.addEventListener("change", () => {
      state.showGrid = els.gridToggle.checked;
      drawPreview();
      scheduleDraftSave();
    });
    els.boardToggle.addEventListener("change", () => {
      state.showBoard = els.boardToggle.checked;
      drawPreview();
      scheduleDraftSave();
    });
    els.codeToggle.addEventListener("change", () => {
      state.showCodes = els.codeToggle.checked;
      drawPreview();
      scheduleDraftSave();
    });

    els.clearReplaceButton.addEventListener("click", () => {
      state.replacementMap.clear();
      state.replaceExpanded.clear();
      state.replaceShowAll.clear();
      recomputePattern();
      renderAll();
      scheduleDraftSave();
      setStatus("已清空所有颜色替换规则");
    });

    els.exportPngButton.addEventListener("click", exportPng);
    els.openPngButton.addEventListener("click", openPngPreview);
    els.copyStatsButton.addEventListener("click", copyStatsText);
    els.exportCsvButton.addEventListener("click", exportCsv);
    els.exportPdfButton.addEventListener("click", printPattern);
    els.exportPdfButtonTop.addEventListener("click", printPattern);

    const canvas = els.previewCanvas;
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
  }

  function bindRange(input, output, onChange) {
    const update = () => {
      const value = Number(input.value);
      output.value = String(value);
      onChange(value);
    };
    input.addEventListener("input", update);
    update();
  }

  function bindPercentRange(input, output, onChange) {
    const update = () => {
      const value = Number(input.value);
      output.value = value + "%";
      onChange(value);
    };
    input.addEventListener("input", update);
    update();
  }

  function bindBeadDimensionInput(axis, input) {
    const source = axis === "width" ? "width" : "height";
    input.addEventListener("input", () => {
      const value = input.value.trim();
      if (axis === "width") {
        state.widthDraft = value;
      } else {
        state.heightDraft = value;
      }

      const parsed = parseDraftInteger(value);
      if (parsed === null) {
        return;
      }
      applyBeadSize(source, parsed, false);
    });

    input.addEventListener("blur", () => {
      commitBeadSize(source);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitBeadSize(source);
        input.blur();
      }
    });
  }

  function bindCommittedNumberInput(input, options) {
    const parse = () => parseCommittedNumber(input.value, options.integer);
    input.addEventListener("input", () => {
      if (input.value.trim() === "") {
        return;
      }
      const parsed = parse();
      if (parsed === null || parsed < options.min || parsed > options.max) {
        return;
      }
      options.set(options.integer ? Math.round(parsed) : parsed);
      options.onChange();
    });

    input.addEventListener("blur", () => {
      const parsed = parse();
      const value = parsed === null ? options.get() : clamp(parsed, options.min, options.max);
      options.set(options.integer ? Math.round(value) : value);
      input.value = String(options.get());
      options.onChange();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  }

  function parseCommittedNumber(value, integer) {
    const text = String(value).trim();
    if (text === "") {
      return null;
    }
    if (integer && !/^\d+$/.test(text)) {
      return null;
    }
    const number = Number(text);
    if (!Number.isFinite(number)) {
      return null;
    }
    return integer ? Math.round(number) : number;
  }

  function observeCanvas() {
    const observer = new ResizeObserver(() => {
      drawPreview();
    });
    observer.observe(els.canvasWrap);
  }

  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll(".step-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });
    document.querySelectorAll(".tool-section").forEach((section) => {
      section.classList.toggle("active", section.id === "tab-" + tab);
    });
    state.transform.offsetX = 0;
    state.transform.offsetY = 0;
    state.transform.scale = 1;
    els.previewCanvas.style.cursor = "";
    setStatus(tabStatusText(tab));
    drawPreview();
  }

  function handleImageInput(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    loadImageFile(file);
  }

  function loadImageFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        setupSourceFromImage(image, file.name || "未命名图片");
      };
      image.onerror = () => {
        setStatus("图片读取失败，请换一张图片");
      };
      image.src = reader.result;
    };
    reader.onerror = () => {
      setStatus("无法读取图片文件");
    };
    reader.readAsDataURL(file);
  }

  function setupSourceFromImage(image, name) {
    const scale = Math.min(1, maxWorkingSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, width, height);

    state.sourceCanvas = canvas;
    state.sourceImageData = ctx.getImageData(0, 0, width, height);
    state.imageName = name;
    state.mask = new Uint8ClampedArray(width * height);
    initializeMaskFromAlpha();
    state.maskHistory = [];
    state.maskVersion += 1;
    state.maskedCanvas = null;
    state.crop = { left: 0, right: 1, top: 0, bottom: 1 };
    state.replacementMap.clear();
    state.replaceExpanded.clear();
    state.replaceShowAll.clear();
    state.disabledColors.clear();
    state.transform = { scale: 1, offsetX: 0, offsetY: 0 };

    if (state.cropAspect !== "free") {
      applyCropAspect(false);
    }
    if (state.lockAspect) {
      const aspect = cropPixelHeight() / cropPixelWidth();
      state.beadHeight = clampInt(Math.round(state.beadWidth * aspect), 8, beadLimit);
    }
    syncBeadSizeInputs(true);

    syncCropControls();
    recomputePattern();
    renderAll();
    setStatus("已导入 " + name + "，工作副本为 " + width + " x " + height);
  }

  function initializeMaskFromAlpha() {
    if (!state.sourceImageData || !state.mask) {
      return;
    }
    const data = state.sourceImageData.data;
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      state.mask[p] = data[i + 3] <= state.alphaThreshold ? 0 : 255;
    }
  }

  function applyAlphaThresholdToMask() {
    if (!state.sourceImageData) {
      setStatus("请先导入图片");
      return;
    }
    pushMaskHistory();
    initializeMaskFromAlpha();
    state.maskVersion += 1;
    recomputePattern();
    renderAll();
    setStatus("已按当前透明阈值更新蒙版");
  }

  function autoCutoutBackground() {
    if (!state.sourceImageData || !state.mask) {
      setStatus("请先导入图片");
      return;
    }

    pushMaskHistory();
    const width = state.sourceImageData.width;
    const height = state.sourceImageData.height;
    const inset = Math.max(0, Math.floor(Math.min(width, height) * 0.025));
    const seeds = uniqueSeeds([
      [inset, inset],
      [width - 1 - inset, inset],
      [inset, height - 1 - inset],
      [width - 1 - inset, height - 1 - inset],
      [Math.floor(width / 2), inset],
      [Math.floor(width / 2), height - 1 - inset],
      [inset, Math.floor(height / 2)],
      [width - 1 - inset, Math.floor(height / 2)],
    ], width, height);

    const tolerance = Math.max(state.tolerance, 54);
    let changed = 0;
    seeds.forEach((seed) => {
      changed += floodRemoveFromSeed(seed.x, seed.y, tolerance);
    });

    state.maskVersion += 1;
    recomputePattern();
    renderAll();
    setStatus("一键去背景删除了 " + formatNumber(changed) + " 个像素");
  }

  function undoMaskEdit() {
    if (!state.maskHistory.length) {
      setStatus("没有可撤销的扣图操作");
      return;
    }
    state.mask = state.maskHistory.pop();
    state.maskVersion += 1;
    recomputePattern();
    renderAll();
    setStatus("已撤销上一步扣图");
  }

  function resetMask() {
    if (!state.sourceImageData) {
      setStatus("请先导入图片");
      return;
    }
    pushMaskHistory();
    state.mask.fill(255);
    state.maskVersion += 1;
    recomputePattern();
    renderAll();
    setStatus("已重置扣图蒙版");
  }

  function resetCrop() {
    state.crop = { left: 0, right: 1, top: 0, bottom: 1 };
    applyCropAspect();
    setStatus("裁剪范围已重置");
  }

  function pushMaskHistory() {
    if (!state.mask) {
      return;
    }
    state.maskHistory.push(state.mask.slice());
    if (state.maskHistory.length > 16) {
      state.maskHistory.shift();
    }
  }

  function applyBeadSize(source, rawValue, commit) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return false;
    }

    const value = commit ? clampInt(parsed, 8, beadLimit) : Math.round(parsed);
    if (!commit && (value < 8 || value > beadLimit)) {
      return false;
    }

    let width = state.beadWidth;
    let height = state.beadHeight;
    if (source === "width") {
      width = value;
      if (state.lockAspect && state.sourceCanvas) {
        const aspect = cropPixelHeight() / cropPixelWidth();
        height = clampInt(Math.round(width * aspect), 8, beadLimit);
      }
    } else {
      height = value;
      if (state.lockAspect && state.sourceCanvas) {
        const aspect = cropPixelHeight() / cropPixelWidth();
        width = clampInt(Math.round(height / aspect), 8, beadLimit);
      }
    }

    state.beadWidth = clampInt(width, 8, beadLimit);
    state.beadHeight = clampInt(height, 8, beadLimit);
    syncBeadSizeInputs(Boolean(commit) || state.lockAspect);
    scheduleRecompute();
    return true;
  }

  function commitBeadSize(source) {
    const input = source === "width" ? els.beadWidthInput : els.beadHeightInput;
    const draft = source === "width" ? state.widthDraft : state.heightDraft;
    const parsed = parseDraftInteger(draft);
    applyBeadSize(source, parsed === null ? (source === "width" ? state.beadWidth : state.beadHeight) : parsed, true);
    input.value = source === "width" ? String(state.beadWidth) : String(state.beadHeight);
  }

  function syncBeadSizeInputs(updateBoth) {
    state.widthDraft = String(state.beadWidth);
    state.heightDraft = String(state.beadHeight);
    if (updateBoth || document.activeElement !== els.beadWidthInput) {
      els.beadWidthInput.value = state.widthDraft;
    }
    if (updateBoth || document.activeElement !== els.beadHeightInput) {
      els.beadHeightInput.value = state.heightDraft;
    }
  }

  function parseDraftInteger(value) {
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) {
      return null;
    }
    const number = Number(text);
    return Number.isFinite(number) ? Math.round(number) : null;
  }

  function syncCropControls() {
    els.cropAspectSelect.value = state.cropAspect;
  }

  function applyCropAspect(recompute) {
    if (!state.sourceCanvas) {
      syncCropControls();
      return;
    }

    const aspect = cropAspectRatio();
    if (aspect) {
      const rect = cropBounds();
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      let width = rect.width;
      let height = rect.height;
      if (width / height > aspect) {
        width = height * aspect;
      } else {
        height = width / aspect;
      }
      setCropFromPixelRect(fitCropRect(centerX, centerY, width, height, aspect));
    } else {
      state.crop = normalizeCrop(state.crop);
    }

    syncCropControls();
    handleCropChanged(recompute !== false);
  }

  function cropAspectRatio() {
    if (state.cropAspect === "free") {
      return null;
    }
    if (state.cropAspect === "original") {
      return state.sourceCanvas ? state.sourceCanvas.width / state.sourceCanvas.height : null;
    }
    const parts = state.cropAspect.split(":").map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      return parts[0] / parts[1];
    }
    return null;
  }

  function fitCropRect(centerX, centerY, width, height, aspect) {
    const source = state.sourceCanvas;
    const minSize = cropMinSize();
    let nextWidth = Math.max(minSize, width);
    let nextHeight = Math.max(minSize, height);

    if (aspect) {
      if (nextWidth / nextHeight > aspect) {
        nextHeight = nextWidth / aspect;
      } else {
        nextWidth = nextHeight * aspect;
      }
    }

    if (nextWidth > source.width) {
      nextWidth = source.width;
      nextHeight = aspect ? nextWidth / aspect : nextHeight;
    }
    if (nextHeight > source.height) {
      nextHeight = source.height;
      nextWidth = aspect ? nextHeight * aspect : nextWidth;
    }

    nextWidth = clamp(nextWidth, minSize, source.width);
    nextHeight = clamp(nextHeight, minSize, source.height);

    return {
      x: clamp(centerX - nextWidth / 2, 0, source.width - nextWidth),
      y: clamp(centerY - nextHeight / 2, 0, source.height - nextHeight),
      width: nextWidth,
      height: nextHeight,
    };
  }

  function cropMinSize() {
    if (!state.sourceCanvas) {
      return 1;
    }
    return Math.max(8, Math.min(state.sourceCanvas.width, state.sourceCanvas.height) * 0.05);
  }

  function setCropFromPixelRect(rect) {
    const source = state.sourceCanvas;
    if (!source) {
      return;
    }
    const minSize = cropMinSize();
    const width = clamp(rect.width, minSize, source.width);
    const height = clamp(rect.height, minSize, source.height);
    const x = clamp(rect.x, 0, source.width - width);
    const y = clamp(rect.y, 0, source.height - height);
    state.crop = normalizeCrop({
      left: x / source.width,
      right: (x + width) / source.width,
      top: y / source.height,
      bottom: (y + height) / source.height,
    });
  }

  function handleCropChanged(recompute) {
    if (state.lockAspect && state.sourceCanvas) {
      const aspect = cropPixelHeight() / cropPixelWidth();
      state.beadHeight = clampInt(Math.round(state.beadWidth * aspect), 8, beadLimit);
      syncBeadSizeInputs(true);
    }

    if (recompute) {
      scheduleRecompute();
    }
    drawPreview();
  }

  function resizeCropFromPointer(interaction, point) {
    const aspect = cropAspectRatio();
    const handle = interaction.handle;
    if (handle === "move") {
      const dx = point.x - interaction.startPoint.x;
      const dy = point.y - interaction.startPoint.y;
      const rect = interaction.startRect;
      setCropFromPixelRect({
        x: rect.x + dx,
        y: rect.y + dy,
        width: rect.width,
        height: rect.height,
      });
      return;
    }

    if (aspect) {
      setCropFromPixelRect(resizeFixedCrop(interaction.startRect, handle, point, aspect));
    } else {
      setCropFromPixelRect(resizeFreeCrop(interaction.startRect, handle, point));
    }
  }

  function resizeFreeCrop(rect, handle, point) {
    const source = state.sourceCanvas;
    const minSize = cropMinSize();
    let left = rect.x;
    let top = rect.y;
    let right = rect.x + rect.width;
    let bottom = rect.y + rect.height;

    if (handle.includes("w")) {
      left = clamp(point.x, 0, right - minSize);
    }
    if (handle.includes("e")) {
      right = clamp(point.x, left + minSize, source.width);
    }
    if (handle.includes("n")) {
      top = clamp(point.y, 0, bottom - minSize);
    }
    if (handle.includes("s")) {
      bottom = clamp(point.y, top + minSize, source.height);
    }

    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  function resizeFixedCrop(rect, handle, point, aspect) {
    if (handle.length === 2) {
      return resizeFixedCorner(rect, handle, point, aspect);
    }
    return resizeFixedEdge(rect, handle, point, aspect);
  }

  function resizeFixedCorner(rect, handle, point, aspect) {
    const source = state.sourceCanvas;
    const minSize = cropMinSize();
    const sx = handle.includes("e") ? 1 : -1;
    const sy = handle.includes("s") ? 1 : -1;
    const anchorX = sx > 0 ? rect.x : rect.x + rect.width;
    const anchorY = sy > 0 ? rect.y : rect.y + rect.height;
    const maxWidth = sx > 0 ? source.width - anchorX : anchorX;
    const maxHeight = sy > 0 ? source.height - anchorY : anchorY;
    let width = Math.max(minSize, Math.abs(point.x - anchorX));
    let height = Math.max(minSize, Math.abs(point.y - anchorY));

    if (width / height > aspect) {
      width = height * aspect;
    } else {
      height = width / aspect;
    }
    if (width > maxWidth) {
      width = maxWidth;
      height = width / aspect;
    }
    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspect;
    }

    width = clamp(width, Math.min(minSize, maxWidth), maxWidth);
    height = clamp(height, Math.min(minSize, maxHeight), maxHeight);

    return {
      x: sx > 0 ? anchorX : anchorX - width,
      y: sy > 0 ? anchorY : anchorY - height,
      width,
      height,
    };
  }

  function resizeFixedEdge(rect, handle, point, aspect) {
    const source = state.sourceCanvas;
    const minSize = cropMinSize();
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;

    if (handle === "e" || handle === "w") {
      const fixedX = handle === "e" ? rect.x : rect.x + rect.width;
      const maxWidth = handle === "e" ? source.width - fixedX : fixedX;
      let width = Math.max(minSize, Math.abs(point.x - fixedX));
      let height = width / aspect;
      if (height > source.height) {
        height = source.height;
        width = height * aspect;
      }
      width = clamp(width, Math.min(minSize, maxWidth), maxWidth);
      height = width / aspect;
      return {
        x: handle === "e" ? fixedX : fixedX - width,
        y: clamp(centerY - height / 2, 0, source.height - height),
        width,
        height,
      };
    }

    const fixedY = handle === "s" ? rect.y : rect.y + rect.height;
    const maxHeight = handle === "s" ? source.height - fixedY : fixedY;
    let height = Math.max(minSize, Math.abs(point.y - fixedY));
    let width = height * aspect;
    if (width > source.width) {
      width = source.width;
      height = width / aspect;
    }
    height = clamp(height, Math.min(minSize, maxHeight), maxHeight);
    width = height * aspect;
    return {
      x: clamp(centerX - width / 2, 0, source.width - width),
      y: handle === "s" ? fixedY : fixedY - height,
      width,
      height,
    };
  }

  function scheduleRecompute() {
    window.clearTimeout(state.recomputeTimer);
    state.recomputeTimer = window.setTimeout(() => {
      recomputePattern();
      renderAll();
      scheduleDraftSave();
    }, 120);
  }

  function recomputePattern() {
    if (!state.sourceCanvas || !state.sourceImageData) {
      state.pixelSamples = [];
      state.rawCells = [];
      state.borderedCells = [];
      state.finalCells = [];
      state.stats = [];
      renderMetrics();
      return;
    }

    const started = performance.now();
    const samples = samplePixels();
    state.pixelSamples = samples;
    const enabled = palette.filter((color) => !state.disabledColors.has(color.id));

    if (enabled.length === 0) {
      state.rawCells = samples.map(() => null);
      state.borderedCells = state.rawCells.slice();
      state.finalCells = state.borderedCells.slice();
      state.stats = [];
      setStatus("当前没有可用颜色，请至少启用一种色表颜色");
      scheduleDraftSave();
      return;
    }

    const firstPass = samples.map((sample) => {
      if (!sample) {
        return null;
      }
      return nearestColor(sample, enabled).id;
    });

    const limit = clampInt(state.maxColors, 2, enabled.length);
    const selectedIds = chooseTopColors(firstPass, limit);
    let candidates = enabled.filter((color) => selectedIds.has(color.id));
    if (candidates.length === 0) {
      candidates = enabled;
    }

    state.rawCells = samples.map((sample) => {
      if (!sample) {
        return null;
      }
      return nearestColor(sample, candidates).id;
    });

    state.borderedCells = applyBorderCells(state.rawCells, state.beadWidth, state.beadHeight, state.border, paletteById, {
      labDistance,
    });
    state.finalCells = applyReplacements(state.borderedCells, state.replacementMap);

    state.stats = computeStats(state.finalCells);
    setStatus("已生成图纸，用时 " + Math.round(performance.now() - started) + "ms");
    scheduleDraftSave();
  }

  function samplePixels() {
    const output = [];
    const source = state.sourceImageData;
    const data = source.data;
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    const rect = cropBounds();
    const cellWidth = rect.width / state.beadWidth;
    const cellHeight = rect.height / state.beadHeight;

    for (let y = 0; y < state.beadHeight; y += 1) {
      for (let x = 0; x < state.beadWidth; x += 1) {
        const x0 = rect.x + x * cellWidth;
        const y0 = rect.y + y * cellHeight;
        const x1 = rect.x + (x + 1) * cellWidth;
        const y1 = rect.y + (y + 1) * cellHeight;
        const sample = sampleRegion(data, sourceWidth, sourceHeight, x0, y0, x1, y1);
        if (!sample) {
          output.push(null);
          continue;
        }
        if (state.dither === "ordered") {
          output.push(applyOrderedDither(sample, x, y));
        } else {
          output.push(sample);
        }
      }
    }
    return output;
  }

  function sampleRegion(data, sourceWidth, sourceHeight, x0, y0, x1, y1) {
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    const samplesX = state.samplingMode === "smooth" ? clampInt(Math.ceil(width), 1, 8) : clampInt(Math.ceil(width * 1.4), 3, 12);
    const samplesY = state.samplingMode === "smooth" ? clampInt(Math.ceil(height), 1, 8) : clampInt(Math.ceil(height * 1.4), 3, 12);
    const contrastFactorValue = contrastFactor(state.contrast);
    const saturationFactorValue = saturationFactor(state.saturation);
    const buckets = new Map();
    let weightedR = 0;
    let weightedG = 0;
    let weightedB = 0;
    let weightedAlpha = 0;
    let foreground = 0;
    let total = 0;

    for (let sy = 0; sy < samplesY; sy += 1) {
      const py = clampInt(Math.floor(y0 + ((sy + 0.5) / samplesY) * height), 0, sourceHeight - 1);
      for (let sx = 0; sx < samplesX; sx += 1) {
        const px = clampInt(Math.floor(x0 + ((sx + 0.5) / samplesX) * width), 0, sourceWidth - 1);
        const p = py * sourceWidth + px;
        const i = p * 4;
        const maskAlpha = state.mask[p] || 0;
        const a = (data[i + 3] * maskAlpha) / 255;
        total += 1;
        if (a > state.alphaThreshold) {
          foreground += 1;
          const edgeWeight =
            1 +
            localEdgeStrength(data, state.mask, sourceWidth, sourceHeight, px, py, contrastFactorValue, saturationFactorValue) *
              (state.edgeBoost / 100);
          const alphaWeight = a / 255;
          const weight = alphaWeight * edgeWeight;
          const adjusted = adjustRgb(data[i], data[i + 1], data[i + 2], contrastFactorValue, saturationFactorValue);
          const r = adjusted.r;
          const g = adjusted.g;
          const b = adjusted.b;
          weightedR += r * weight;
          weightedG += g * weight;
          weightedB += b * weight;
          weightedAlpha += weight;

          const bucketKey = colorBucketKey(r, g, b);
          const bucket = buckets.get(bucketKey) || {
            r: 0,
            g: 0,
            b: 0,
            weight: 0,
            count: 0,
          };
          bucket.r += r * weight;
          bucket.g += g * weight;
          bucket.b += b * weight;
          bucket.weight += weight;
          bucket.count += 1;
          buckets.set(bucketKey, bucket);
        }
      }
    }

    if (total === 0) {
      return null;
    }

    const coverage = foreground / total;
    if (coverage < state.coverageThreshold / 100) {
      return null;
    }

    if (state.samplingMode === "shape" && buckets.size > 0) {
      let bestBucket = null;
      buckets.forEach((bucket) => {
        if (!bestBucket || bucket.weight > bestBucket.weight) {
          bestBucket = bucket;
        }
      });
      const weight = Math.max(1, bestBucket.weight);
      return {
        r: clampInt(Math.round(bestBucket.r / weight), 0, 255),
        g: clampInt(Math.round(bestBucket.g / weight), 0, 255),
        b: clampInt(Math.round(bestBucket.b / weight), 0, 255),
      };
    }

    if (state.samplingMode === "balanced" && buckets.size > 1) {
      const dominant = Array.from(buckets.values()).sort((a, b) => b.weight - a.weight)[0];
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

  function localEdgeStrength(data, mask, width, height, x, y, contrastFactorValue, saturationFactorValue) {
    const left = pixelBrightness(data, mask, width, height, Math.max(0, x - 1), y, contrastFactorValue, saturationFactorValue);
    const right = pixelBrightness(data, mask, width, height, Math.min(width - 1, x + 1), y, contrastFactorValue, saturationFactorValue);
    const top = pixelBrightness(data, mask, width, height, x, Math.max(0, y - 1), contrastFactorValue, saturationFactorValue);
    const bottom = pixelBrightness(data, mask, width, height, x, Math.min(height - 1, y + 1), contrastFactorValue, saturationFactorValue);
    return clamp((Math.abs(left - right) + Math.abs(top - bottom)) / 255, 0, 1);
  }

  function pixelBrightness(data, mask, width, height, x, y, contrastFactorValue, saturationFactorValue) {
    const p = y * width + x;
    const i = p * 4;
    const alpha = ((data[i + 3] || 0) * (mask[p] || 0)) / 255;
    if (alpha <= state.alphaThreshold) {
      return 0;
    }
    const adjusted = adjustRgb(data[i], data[i + 1], data[i + 2], contrastFactorValue, saturationFactorValue);
    return 0.299 * adjusted.r + 0.587 * adjusted.g + 0.114 * adjusted.b;
  }

  function contrastFactor(contrast) {
    const value = clampInt(contrast, -50, 100);
    if (value === 0) {
      return 1;
    }
    return (259 * (value + 255)) / (255 * (259 - value));
  }

  function saturationFactor(saturation) {
    return 1 + clampInt(saturation, -50, 100) / 100;
  }

  function adjustRgb(r, g, b, contrastFactorValue, saturationFactorValue) {
    const cr = applyContrastChannel(r, contrastFactorValue);
    const cg = applyContrastChannel(g, contrastFactorValue);
    const cb = applyContrastChannel(b, contrastFactorValue);
    if (saturationFactorValue === 1) {
      return { r: cr, g: cg, b: cb };
    }
    const gray = 0.299 * cr + 0.587 * cg + 0.114 * cb;
    return {
      r: clampInt(Math.round(gray + (cr - gray) * saturationFactorValue), 0, 255),
      g: clampInt(Math.round(gray + (cg - gray) * saturationFactorValue), 0, 255),
      b: clampInt(Math.round(gray + (cb - gray) * saturationFactorValue), 0, 255),
    };
  }

  function applyContrastChannel(value, factor) {
    if (factor === 1) {
      return value;
    }
    return clampInt(Math.round(factor * (value - 128) + 128), 0, 255);
  }

  function colorBucketKey(r, g, b) {
    const step = state.samplingMode === "shape" ? 28 : 36;
    return [Math.round(r / step), Math.round(g / step), Math.round(b / step)].join(":");
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
    const counts = new Map();
    cells.forEach((id) => {
      if (!id) {
        return;
      }
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    return new Set(
      Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map((entry) => entry[0]),
    );
  }

  function computeStats(cells) {
    return computePaletteStats(cells, paletteById);
  }

  function renderAll() {
    els.emptyImport.classList.toggle("hidden", Boolean(state.sourceCanvas));
    renderMetrics();
    renderPaletteGrid();
    renderBorderControls();
    renderReplaceList();
    renderStatsTable();
    drawPreview();
  }

  function renderMetrics() {
    const totalCells = state.beadWidth * state.beadHeight;
    const totalBeads = state.stats.reduce((sum, item) => sum + item.count, 0);
    const emptyCells = totalCells - totalBeads;
    const boardCountX = Math.ceil(state.beadWidth / state.boardWidth);
    const boardCountY = Math.ceil(state.beadHeight / state.boardHeight);
    const widthCm = ((state.beadWidth * state.beadMm) / 10).toFixed(1);
    const heightCm = ((state.beadHeight * state.beadMm) / 10).toFixed(1);

    els.projectSubtitle.textContent = state.sourceCanvas
      ? state.imageName + " · " + state.beadWidth + " x " + state.beadHeight
      : "导入图片后开始生成拼豆图纸";
    els.previewSizeLabel.textContent = state.sourceCanvas
      ? state.beadWidth + " x " + state.beadHeight + " · " + totalBeads + " 颗"
      : "未导入";
    els.previewModeLabel.textContent = state.activeTab === "image" ? "图片预览" : "图纸预览";

    renderMetricCards(els.sizeMetrics, [
      ["总格数", formatNumber(totalCells)],
      ["实际拼豆", formatNumber(totalBeads)],
      ["空格", formatNumber(emptyCells)],
      ["成品尺寸", widthCm + " x " + heightCm + " cm"],
      ["预计板数", boardCountX + " x " + boardCountY],
      ["颜色数量", String(state.stats.length)],
    ]);

    renderMetricCards(els.summaryMetrics, [
      ["图纸尺寸", state.beadWidth + " x " + state.beadHeight],
      ["总颗数", formatNumber(totalBeads)],
      ["颜色数量", String(state.stats.length)],
      ["预计板数", boardCountX * boardCountY + " 块"],
    ]);
  }

  function renderMetricCards(container, items) {
    container.innerHTML = items
      .map(
        ([label, value]) =>
          '<div class="metric-card"><span>' +
          escapeHtml(label) +
          "</span><strong>" +
          escapeHtml(value) +
          "</strong></div>",
      )
      .join("");
  }

  function renderPaletteGrid() {
    els.paletteGrid.innerHTML = palette
      .map((color) => {
        const disabled = state.disabledColors.has(color.id);
        return (
          '<button class="palette-chip ' +
          (disabled ? "disabled" : "") +
          '" type="button" data-color-id="' +
          color.id +
          '" title="' +
          escapeHtml(color.name) +
          '">' +
          '<span class="swatch" style="background:' +
          color.hex +
          '"></span>' +
          '<span class="chip-text"><strong>' +
          color.code +
          "</strong><span>" +
          escapeHtml(disabled ? "已禁用" : color.name) +
          "</span></span></button>"
        );
      })
      .join("");

    els.paletteGrid.querySelectorAll(".palette-chip").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.colorId;
        if (state.disabledColors.has(id)) {
          state.disabledColors.delete(id);
        } else {
          state.disabledColors.add(id);
          state.replacementMap.forEach((target, source) => {
            if (target === id || source === id) {
              state.replacementMap.delete(source);
            }
          });
        }
        recomputePattern();
        renderAll();
      });
    });
  }

  function renderBorderControls() {
    if (!els.borderControls) {
      return;
    }
    state.border = normalizeBorderConfig(state.border, paletteById);
    const color = paletteById.get(state.border.colorId) || palette[0];
    els.borderEnabledInput.checked = state.border.enabled;
    els.borderControls.classList.toggle("disabled", !state.border.enabled);
    els.borderColorCurrent.style.background = color ? color.hex : "#000000";
    els.borderColorLabel.innerHTML = color
      ? "<strong>" + color.code + " " + escapeHtml(color.name) + "</strong><span>当前锁边颜色</span>"
      : "<strong>未选择</strong><span>请先选择颜色</span>";
    els.borderThicknessInput.value = String(state.border.thickness);
    els.borderThicknessValue.value = String(state.border.thickness);
    els.borderModeSelect.value = state.border.mode;
    els.borderUnifyInput.checked = state.border.unifySimilar;
    els.borderThresholdInput.value = String(state.border.similarityThreshold);
    els.borderThresholdValue.value = String(state.border.similarityThreshold);

    els.borderPaletteGrid.innerHTML = palette
      .map((item) => {
        const selected = item.id === state.border.colorId;
        const disabled = state.disabledColors.has(item.id);
        return (
          '<button class="border-color-chip ' +
          (selected ? "selected " : "") +
          (disabled ? "disabled" : "") +
          '" type="button" data-border-color="' +
          item.id +
          '" title="' +
          escapeHtml(item.code + " " + item.name) +
          '">' +
          '<span class="swatch" style="background:' +
          item.hex +
          '"></span><span>' +
          item.code +
          "</span></button>"
        );
      })
      .join("");

    els.borderPaletteGrid.querySelectorAll("button[data-border-color]").forEach((button) => {
      button.addEventListener("click", () => {
        state.border.colorId = button.dataset.borderColor;
        state.border = normalizeBorderConfig(state.border, paletteById);
        scheduleRecompute();
        renderBorderControls();
        scheduleDraftSave();
      });
    });
  }

  function pickBorderColorFromEdge() {
    if (!state.rawCells.length) {
      setStatus("请先生成图纸，再从边缘主色取色");
      return;
    }
    const colorId = pickDominantEdgeColor(state.rawCells, state.beadWidth, state.beadHeight, paletteById);
    const color = paletteById.get(colorId);
    if (!color) {
      setStatus("当前图纸没有可识别的主体边缘颜色");
      return;
    }
    state.border.colorId = color.id;
    scheduleRecompute();
    renderBorderControls();
    setStatus("已将锁边颜色设为边缘主色 " + color.code + " " + color.name);
  }

  function renderReplaceList() {
    const items = computeStats(state.borderedCells);
    if (!items.length) {
      els.replaceList.innerHTML = '<div class="helper-note">生成图纸后，这里会显示可替换的颜色。</div>';
      return;
    }

    els.replaceList.innerHTML = items
      .map((item) => {
        const color = item.color;
        const originalId = color.id;
        const replacementId = state.replacementMap.get(originalId) || "";
        const replacement = replacementId ? paletteById.get(replacementId) : null;
        const expanded = state.replaceExpanded.has(originalId);
        const showAll = state.replaceShowAll.has(originalId);
        const options = replacementOptions(originalId);
        const visibleOptions = showAll ? options : options.slice(0, 16);
        const optionButtons = visibleOptions.map((candidate, index) => replacementOptionButton(originalId, candidate, replacementId, index)).join("");
        const moreButton =
          expanded && options.length > 16
            ? '<button class="replace-more-button" type="button" data-replace-more="' +
              originalId +
              '">' +
              (showAll ? "收起相近色" : "显示更多相近色") +
              "</button>"
            : "";
        const replaced = Boolean(replacement);
        const statusText = replacement
          ? "已替换为 " + replacement.code + " " + replacement.name
          : "不替换";
        const controls = expanded
          ? '<div class="replace-controls"><div class="replacement-grid">' +
            '<button class="replacement-option no-replace ' +
            (replacement ? "" : "selected") +
            '" type="button" data-replace-source="' +
            originalId +
            '" data-replace-target="">' +
            '<span class="replacement-meta"><strong>不替换</strong><span>保留原颜色 ' +
            color.code +
            "</span></span>" +
            '<span class="distance-badge">原色</span></button>' +
            optionButtons +
            "</div>" +
            moreButton +
            "</div>"
          : "";

        return (
          '<div class="replace-item ' +
          (expanded ? "open" : "") +
          '">' +
          '<button class="replace-main" type="button" data-replace-toggle="' +
          originalId +
          '" aria-expanded="' +
          String(expanded) +
          '">' +
          '<span class="swatch" style="background:' +
          color.hex +
          '"></span>' +
          '<span class="list-text"><strong>' +
          color.code +
          " " +
          escapeHtml(color.name) +
          "</strong><span>" +
          formatNumber(item.count) +
          " 颗" +
          " · " +
          escapeHtml(statusText) +
          "</span></span>" +
          (replaced ? '<span class="missing-badge">已替换</span>' : '<span class="missing-badge neutral">原色</span>') +
          '<span class="replace-chevron" aria-hidden="true">' +
          (expanded ? "收起" : "展开") +
          "</span></button>" +
          controls +
          "</div>"
        );
      })
      .join("");

    els.replaceList.querySelectorAll("button[data-replace-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const source = button.dataset.replaceToggle;
        if (state.replaceExpanded.has(source)) {
          state.replaceExpanded.delete(source);
          state.replaceShowAll.delete(source);
        } else {
          state.replaceExpanded.clear();
          state.replaceShowAll.clear();
          state.replaceExpanded.add(source);
        }
        renderReplaceList();
      });
    });

    els.replaceList.querySelectorAll("button[data-replace-source]").forEach((button) => {
      button.addEventListener("click", () => {
        const source = button.dataset.replaceSource;
        const target = button.dataset.replaceTarget;
        if (!target) {
          state.replacementMap.delete(source);
        } else {
          state.replacementMap.set(source, target);
        }
        state.replaceExpanded.delete(source);
        state.replaceShowAll.delete(source);
        recomputePattern();
        renderAll();
      });
    });

    els.replaceList.querySelectorAll("button[data-replace-more]").forEach((button) => {
      button.addEventListener("click", () => {
        const source = button.dataset.replaceMore;
        if (state.replaceShowAll.has(source)) {
          state.replaceShowAll.delete(source);
        } else {
          state.replaceShowAll.add(source);
        }
        renderReplaceList();
      });
    });
  }

  function replacementOptionButton(sourceId, candidate, selectedId, index) {
    return (
      '<button class="replacement-option ' +
      (selectedId === candidate.id ? "selected" : "") +
      '" type="button" data-replace-source="' +
      sourceId +
      '" data-replace-target="' +
      candidate.id +
      '">' +
      '<span class="swatch" style="background:' +
      candidate.hex +
      '"></span>' +
      '<span class="replacement-meta"><strong>' +
      candidate.code +
      " " +
      escapeHtml(candidate.name) +
      "</strong><span>Delta E " +
      candidate.distance.toFixed(1) +
      "</span></span>" +
      '<span class="distance-badge">' +
      distanceLabel(candidate.distance, index) +
      "</span></button>"
    );
  }

  function distanceLabel(distance, index) {
    if (index === 0) {
      return "最接近";
    }
    if (distance < 8) {
      return "较接近";
    }
    if (distance < 16) {
      return "可尝试";
    }
    return "差异较大";
  }

  function replacementOptions(sourceId) {
    const source = paletteById.get(sourceId);
    if (!source) {
      return [];
    }
    return palette
      .filter((color) => color.id !== sourceId && !state.disabledColors.has(color.id))
      .map((color) => ({
        ...color,
        distance: labDistance(source.lab, color.lab),
      }))
      .sort((a, b) => a.distance - b.distance);
  }

  function renderStatsTable() {
    if (!state.stats.length) {
      els.statsBody.innerHTML =
        '<tr><td colspan="3">生成图纸后显示每种拼豆颜色的数量。</td></tr>';
      return;
    }

    els.statsBody.innerHTML = state.stats
      .map((item) => {
        const color = item.color;
        return (
          "<tr><td>" +
          '<span class="color-cell"><span class="swatch" style="background:' +
          color.hex +
          '"></span>' +
          escapeHtml(color.name) +
          "</span></td><td>" +
          color.code +
          "</td><td>" +
          formatNumber(item.count) +
          "</td></tr>"
        );
      })
      .join("");
  }

  function statsText() {
    const totalBeads = state.stats.reduce((sum, item) => sum + item.count, 0);
    const boardX = Math.ceil(state.beadWidth / state.boardWidth);
    const boardY = Math.ceil(state.beadHeight / state.boardHeight);
    const lines = [
      "小T拼豆图纸统计",
      "尺寸：" + state.beadWidth + " x " + state.beadHeight,
      "总颗数：" + totalBeads,
      "颜色：" + state.stats.length,
      "预计板数：" + boardX + " x " + boardY,
      "",
      "编号\t名称\t数量\t色值",
    ];
    state.stats.forEach((item) => {
      lines.push(item.color.code + "\t" + item.color.name + "\t" + item.count + "\t" + item.color.hex);
    });
    return lines.join("\n");
  }

  async function copyStatsText() {
    if (!state.stats.length) {
      setStatus("请先生成统计");
      return;
    }
    const text = statsText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopyText(text);
      }
      setStatus("已复制统计文本");
    } catch (error) {
      fallbackCopyText(text);
      setStatus("已复制统计文本");
    }
  }

  function fallbackCopyText(text) {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  function drawPreview() {
    const canvas = els.previewCanvas;
    const wrap = els.canvasWrap;
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);

    if (!state.sourceCanvas) {
      return;
    }

    if (state.activeTab === "image") {
      drawImagePreview(ctx, width, height);
    } else {
      drawPatternPreview(ctx, width, height);
    }
  }

  function drawImagePreview(ctx, width, height) {
    const source = state.sourceCanvas;
    const transform = contentTransform(width, height, source.width, source.height);
    state.contentRect = {
      x: transform.offsetX,
      y: transform.offsetY,
      width: source.width * transform.scale,
      height: source.height * transform.scale,
      scale: transform.scale,
      contentWidth: source.width,
      contentHeight: source.height,
    };

    const masked = getMaskedCanvas();
    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);
    ctx.drawImage(masked, 0, 0);

    const crop = cropBounds();
    ctx.save();
    ctx.fillStyle = "rgba(17, 24, 39, 0.36)";
    ctx.beginPath();
    ctx.rect(0, 0, source.width, source.height);
    ctx.rect(crop.x, crop.y, crop.width, crop.height);
    ctx.fill("evenodd");
    ctx.restore();

    const lineWidth = Math.max(1 / transform.scale, 1);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = "#df6b3b";
    ctx.setLineDash([8 / transform.scale, 5 / transform.scale]);
    ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);
    ctx.setLineDash([]);
    drawCropHandles(ctx, crop, transform.scale, lineWidth);
    ctx.restore();
  }

  function drawCropHandles(ctx, crop, scale, lineWidth) {
    const size = Math.max(10 / scale, 6);
    const half = size / 2;
    const points = [
      [crop.x, crop.y],
      [crop.x + crop.width / 2, crop.y],
      [crop.x + crop.width, crop.y],
      [crop.x, crop.y + crop.height / 2],
      [crop.x + crop.width, crop.y + crop.height / 2],
      [crop.x, crop.y + crop.height],
      [crop.x + crop.width / 2, crop.y + crop.height],
      [crop.x + crop.width, crop.y + crop.height],
    ];

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#df6b3b";
    ctx.lineWidth = lineWidth;
    points.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.rect(x - half, y - half, size, size);
      ctx.fill();
      ctx.stroke();
    });
  }

  function drawPatternPreview(ctx, width, height) {
    const contentWidth = state.beadWidth;
    const contentHeight = state.beadHeight;
    const transform = contentTransform(width, height, contentWidth, contentHeight);
    state.contentRect = {
      x: transform.offsetX,
      y: transform.offsetY,
      width: contentWidth * transform.scale,
      height: contentHeight * transform.scale,
      scale: transform.scale,
      contentWidth,
      contentHeight,
    };

    ctx.save();
    ctx.translate(transform.offsetX, transform.offsetY);
    ctx.scale(transform.scale, transform.scale);
    drawPatternCells(ctx, {
      cellSize: 1,
      showGrid: state.showGrid,
      showBoard: state.showBoard,
      showCodes: state.showCodes,
      displayCellSize: transform.scale,
      lineWidth: Math.max(1 / transform.scale, 0.025),
      exportMode: false,
      visibleRect: {
        left: (0 - transform.offsetX) / transform.scale,
        top: (0 - transform.offsetY) / transform.scale,
        right: (width - transform.offsetX) / transform.scale,
        bottom: (height - transform.offsetY) / transform.scale,
      },
    });
    ctx.restore();
  }

  function drawPatternCells(ctx, options) {
    const width = state.beadWidth;
    const height = state.beadHeight;
    const visible = visibleCellRange(width, height, options.visibleRect);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    for (let y = visible.y0; y < visible.y1; y += 1) {
      for (let x = visible.x0; x < visible.x1; x += 1) {
        const id = state.finalCells[y * width + x];
        if (!id) {
          continue;
        }
        const color = paletteById.get(id);
        if (!color) {
          continue;
        }
        ctx.fillStyle = color.hex;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    if (options.showGrid) {
      ctx.strokeStyle = "rgba(23, 32, 42, 0.22)";
      ctx.lineWidth = options.lineWidth;
      ctx.beginPath();
      for (let x = visible.x0; x <= visible.x1; x += 1) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = visible.y0; y <= visible.y1; y += 1) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }

    if (options.showCodes) {
      drawCellCodes(ctx, options);
    }

    if (options.showBoard) {
      ctx.strokeStyle = "#df6b3b";
      ctx.lineWidth = options.lineWidth * 2.2;
      ctx.beginPath();
      for (let x = 0; x <= width; x += state.boardWidth) {
        if (x >= visible.x0 && x <= visible.x1) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
      }
      for (let y = 0; y <= height; y += state.boardHeight) {
        if (y >= visible.y0 && y <= visible.y1) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
      }
      ctx.stroke();
    }

  }

  function visibleCellRange(width, height, rect) {
    if (!rect) {
      return { x0: 0, y0: 0, x1: width, y1: height };
    }
    return {
      x0: clampInt(Math.floor(rect.left) - 1, 0, width),
      y0: clampInt(Math.floor(rect.top) - 1, 0, height),
      x1: clampInt(Math.ceil(rect.right) + 1, 0, width),
      y1: clampInt(Math.ceil(rect.bottom) + 1, 0, height),
    };
  }

  function drawCellCodes(ctx, options) {
    const displayCellSize = Number(options.displayCellSize || options.cellSize || 1);
    if (displayCellSize < 10) {
      return;
    }

    const width = state.beadWidth;
    const height = state.beadHeight;
    const visible = visibleCellRange(width, height, options.visibleRect);
    const fontPx = clamp(displayCellSize * 0.34, 4.5, 10);
    const fontSize = fontPx / displayCellSize;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font =
      "700 " +
      fontSize.toFixed(3) +
      'px Inter, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif';
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.035, fontSize * 0.14);

    for (let y = visible.y0; y < visible.y1; y += 1) {
      for (let x = visible.x0; x < visible.x1; x += 1) {
        const id = state.finalCells[y * width + x];
        if (!id) {
          continue;
        }
        const color = paletteById.get(id);
        if (!color) {
          continue;
        }
        const darkText = colorBrightness(color.rgb) > 150;
        ctx.fillStyle = darkText ? "rgba(17, 24, 39, 0.9)" : "rgba(255, 255, 255, 0.94)";
        ctx.strokeStyle = darkText ? "rgba(255, 255, 255, 0.68)" : "rgba(17, 24, 39, 0.62)";
        ctx.strokeText(color.code, x + 0.5, y + 0.52);
        ctx.fillText(color.code, x + 0.5, y + 0.52);
      }
    }
    ctx.restore();
  }

  function colorBrightness(rgb) {
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  }

  function contentTransform(viewWidth, viewHeight, contentWidth, contentHeight) {
    const padding = 28;
    const fitScale = Math.min(
      (viewWidth - padding * 2) / contentWidth,
      (viewHeight - padding * 2) / contentHeight,
    );
    const scale = Math.max(0.01, fitScale * state.transform.scale);
    return {
      scale,
      offsetX: (viewWidth - contentWidth * scale) / 2 + state.transform.offsetX,
      offsetY: (viewHeight - contentHeight * scale) / 2 + state.transform.offsetY,
    };
  }

  function getMaskedCanvas() {
    if (state.maskedCanvas && state.maskedVersion === state.maskVersion) {
      return state.maskedCanvas;
    }

    const source = state.sourceImageData;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    const copy = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    for (let p = 0; p < state.mask.length; p += 1) {
      copy.data[p * 4 + 3] = Math.round((copy.data[p * 4 + 3] * state.mask[p]) / 255);
    }
    ctx.putImageData(copy, 0, 0);
    state.maskedCanvas = canvas;
    state.maskedVersion = state.maskVersion;
    return canvas;
  }

  function handlePointerDown(event) {
    if (!state.sourceCanvas) {
      return;
    }

    state.activePointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
    if (state.activePointers.size >= 2) {
      event.preventDefault();
      state.interaction = createPinchInteraction();
      try {
        els.previewCanvas.setPointerCapture(event.pointerId);
      } catch (error) {
        // Some mobile browsers may reject capture for already-ended pointers.
      }
      return;
    }

    const point = pointerToContent(event);
    if (state.activeTab === "image" && point) {
      if (state.activeTool === "view") {
        const cropHandle = cropHitTest(point);
        if (cropHandle) {
          event.preventDefault();
          state.interaction = {
            type: "crop",
            handle: cropHandle,
            startPoint: point,
            startRect: cropBounds(),
          };
          els.previewCanvas.setPointerCapture(event.pointerId);
          setStatus(cropHandle === "move" ? "拖动裁剪框调整位置" : "拖动裁剪框边缘调整范围");
          return;
        }
      }
      if (state.activeTool === "magic") {
        pushMaskHistory();
        magicWand(Math.round(point.x), Math.round(point.y));
        recomputePattern();
        renderAll();
        return;
      }
      if (state.activeTool === "erase" || state.activeTool === "restore") {
        pushMaskHistory();
        state.interaction = {
          type: "brush",
          mode: state.activeTool,
        };
        els.previewCanvas.setPointerCapture(event.pointerId);
        applyBrush(point.x, point.y, state.activeTool === "restore");
        drawPreview();
        return;
      }
    }

    state.interaction = {
      type: "pan",
      lastX: event.clientX,
      lastY: event.clientY,
    };
    els.previewCanvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (state.activePointers.has(event.pointerId)) {
      state.activePointers.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    }

    if (!state.interaction && state.activeTab === "image" && state.activeTool === "view") {
      updateCropCursor(pointerToContent(event));
      return;
    }

    if (!state.interaction) {
      return;
    }

    if (state.interaction.type === "pinch") {
      updatePinchInteraction();
      return;
    }

    if (state.interaction.type === "crop") {
      const point = pointerToContentClamped(event);
      if (point) {
        resizeCropFromPointer(state.interaction, point);
        handleCropChanged(false);
      }
      return;
    }

    if (state.interaction.type === "brush") {
      const point = pointerToContent(event);
      if (point) {
        applyBrush(point.x, point.y, state.interaction.mode === "restore");
        drawPreview();
      }
      return;
    }

    if (state.interaction.type === "pan") {
      state.transform.offsetX += event.clientX - state.interaction.lastX;
      state.transform.offsetY += event.clientY - state.interaction.lastY;
      state.interaction.lastX = event.clientX;
      state.interaction.lastY = event.clientY;
      drawPreview();
    }
  }

  function handlePointerUp(event) {
    state.activePointers.delete(event.pointerId);
    if (!state.interaction) {
      return;
    }
    const wasPinch = state.interaction.type === "pinch";
    const wasBrush = state.interaction.type === "brush";
    const wasCrop = state.interaction.type === "crop";
    state.interaction = null;
    try {
      els.previewCanvas.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture may already be released by the browser.
    }
    if (wasBrush) {
      recomputePattern();
      renderAll();
    }
    if (wasCrop) {
      scheduleRecompute();
      setStatus("裁剪范围已更新");
    }
    if (wasPinch) {
      setStatus("预览缩放已更新");
    }
  }

  function createPinchInteraction() {
    const pinch = currentPinch();
    return {
      type: "pinch",
      startDistance: pinch.distance,
      startCenter: pinch.center,
      startScale: state.transform.scale,
      startOffsetX: state.transform.offsetX,
      startOffsetY: state.transform.offsetY,
    };
  }

  function updatePinchInteraction() {
    if (!state.interaction || state.interaction.type !== "pinch" || state.activePointers.size < 2) {
      return;
    }
    const pinch = currentPinch();
    const distanceRatio = pinch.distance / Math.max(1, state.interaction.startDistance);
    state.transform.scale = clamp(state.interaction.startScale * distanceRatio, 0.35, 18);
    state.transform.offsetX =
      state.interaction.startOffsetX + pinch.center.clientX - state.interaction.startCenter.clientX;
    state.transform.offsetY =
      state.interaction.startOffsetY + pinch.center.clientY - state.interaction.startCenter.clientY;
    drawPreview();
  }

  function currentPinch() {
    const points = Array.from(state.activePointers.values()).slice(0, 2);
    const dx = points[1].clientX - points[0].clientX;
    const dy = points[1].clientY - points[0].clientY;
    return {
      distance: Math.sqrt(dx * dx + dy * dy),
      center: {
        clientX: (points[0].clientX + points[1].clientX) / 2,
        clientY: (points[0].clientY + points[1].clientY) / 2,
      },
    };
  }

  function handleWheel(event) {
    if (!state.sourceCanvas) {
      return;
    }
    event.preventDefault();
    const rect = els.previewCanvas.getBoundingClientRect();
    const before = pointerToContent(event);
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    state.transform.scale = clamp(state.transform.scale * factor, 0.35, 18);
    drawPreview();

    if (before && state.contentRect) {
      const afterScreenX = state.contentRect.x + before.x * state.contentRect.scale;
      const afterScreenY = state.contentRect.y + before.y * state.contentRect.scale;
      state.transform.offsetX += event.clientX - rect.left - afterScreenX;
      state.transform.offsetY += event.clientY - rect.top - afterScreenY;
      drawPreview();
    }
  }

  function pointerToContent(event) {
    if (!state.contentRect) {
      return null;
    }
    const rect = els.previewCanvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - state.contentRect.x) / state.contentRect.scale;
    const y = (event.clientY - rect.top - state.contentRect.y) / state.contentRect.scale;
    if (x < 0 || y < 0 || x >= state.contentRect.contentWidth || y >= state.contentRect.contentHeight) {
      return null;
    }
    return { x, y };
  }

  function pointerToContentClamped(event) {
    if (!state.contentRect) {
      return null;
    }
    const rect = els.previewCanvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - state.contentRect.x) / state.contentRect.scale;
    const y = (event.clientY - rect.top - state.contentRect.y) / state.contentRect.scale;
    return {
      x: clamp(x, 0, state.contentRect.contentWidth),
      y: clamp(y, 0, state.contentRect.contentHeight),
    };
  }

  function cropHitTest(point) {
    if (!state.contentRect || state.activeTab !== "image") {
      return null;
    }
    const crop = cropBounds();
    const tolerance = Math.max(9 / state.contentRect.scale, 2);
    const centerX = crop.x + crop.width / 2;
    const centerY = crop.y + crop.height / 2;
    const handles = [
      ["nw", crop.x, crop.y],
      ["n", centerX, crop.y],
      ["ne", crop.x + crop.width, crop.y],
      ["w", crop.x, centerY],
      ["e", crop.x + crop.width, centerY],
      ["sw", crop.x, crop.y + crop.height],
      ["s", centerX, crop.y + crop.height],
      ["se", crop.x + crop.width, crop.y + crop.height],
    ];

    for (const [handle, x, y] of handles) {
      if (Math.abs(point.x - x) <= tolerance && Math.abs(point.y - y) <= tolerance) {
        return handle;
      }
    }
    if (point.x >= crop.x - tolerance && point.x <= crop.x + crop.width + tolerance) {
      if (Math.abs(point.y - crop.y) <= tolerance) {
        return "n";
      }
      if (Math.abs(point.y - (crop.y + crop.height)) <= tolerance) {
        return "s";
      }
    }
    if (point.y >= crop.y - tolerance && point.y <= crop.y + crop.height + tolerance) {
      if (Math.abs(point.x - crop.x) <= tolerance) {
        return "w";
      }
      if (Math.abs(point.x - (crop.x + crop.width)) <= tolerance) {
        return "e";
      }
    }
    if (point.x >= crop.x && point.x <= crop.x + crop.width && point.y >= crop.y && point.y <= crop.y + crop.height) {
      return "move";
    }
    return null;
  }

  function updateCropCursor(point) {
    const handle = point ? cropHitTest(point) : null;
    const cursors = {
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
      ne: "nesw-resize",
      sw: "nesw-resize",
      nw: "nwse-resize",
      se: "nwse-resize",
      move: "move",
    };
    els.previewCanvas.style.cursor = cursors[handle] || "";
  }

  function applyBrush(x, y, restore) {
    if (!state.mask || !state.sourceCanvas) {
      return;
    }
    const width = state.sourceCanvas.width;
    const height = state.sourceCanvas.height;
    const radius = state.brushSize;
    const minX = clampInt(Math.floor(x - radius), 0, width - 1);
    const maxX = clampInt(Math.ceil(x + radius), 0, width - 1);
    const minY = clampInt(Math.floor(y - radius), 0, height - 1);
    const maxY = clampInt(Math.ceil(y + radius), 0, height - 1);
    const radiusSq = radius * radius;
    const value = restore ? 255 : 0;

    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const dx = px - x;
        const dy = py - y;
        if (dx * dx + dy * dy <= radiusSq) {
          state.mask[py * width + px] = value;
        }
      }
    }
    state.maskVersion += 1;
  }

  function magicWand(x, y) {
    if (!state.sourceImageData || !state.mask) {
      return;
    }
    const width = state.sourceImageData.width;
    const height = state.sourceImageData.height;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }

    const changed = floodRemoveFromSeed(x, y, state.tolerance);
    state.maskVersion += 1;
    setStatus("魔棒删除了 " + formatNumber(changed) + " 个像素");
  }

  function floodRemoveFromSeed(x, y, tolerance) {
    if (!state.sourceImageData || !state.mask) {
      return 0;
    }
    const width = state.sourceImageData.width;
    const height = state.sourceImageData.height;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return 0;
    }

    const data = state.sourceImageData.data;
    const start = y * width + x;
    if (state.mask[start] === 0) {
      return 0;
    }
    const seedIndex = start * 4;
    const seed = {
      r: data[seedIndex],
      g: data[seedIndex + 1],
      b: data[seedIndex + 2],
      a: data[seedIndex + 3],
    };

    const visited = new Uint8Array(width * height);
    const queue = [start];
    visited[start] = 1;
    let head = 0;
    let changed = 0;

    while (head < queue.length) {
      const point = queue[head];
      head += 1;
      if (state.mask[point] === 0) {
        continue;
      }

      const i = point * 4;
      const distance = colorDistance(seed, {
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
        a: data[i + 3],
      });
      if (distance > tolerance) {
        continue;
      }

      state.mask[point] = 0;
      changed += 1;
      const px = point % width;
      const py = Math.floor(point / width);
      enqueueMagicNeighbor(queue, visited, point - 1, px > 0);
      enqueueMagicNeighbor(queue, visited, point + 1, px < width - 1);
      enqueueMagicNeighbor(queue, visited, point - width, py > 0);
      enqueueMagicNeighbor(queue, visited, point + width, py < height - 1);
    }

    return changed;
  }

  function enqueueMagicNeighbor(queue, visited, index, shouldAdd) {
    if (!shouldAdd || visited[index]) {
      return;
    }
    visited[index] = 1;
    queue.push(index);
  }

  function uniqueSeeds(points, width, height) {
    const seen = new Set();
    const seeds = [];
    points.forEach(([x, y]) => {
      const seed = {
        x: clampInt(x, 0, width - 1),
        y: clampInt(y, 0, height - 1),
      };
      const key = seed.x + "," + seed.y;
      if (!seen.has(key)) {
        seen.add(key);
        seeds.push(seed);
      }
    });
    return seeds;
  }

  function exportPng() {
    if (!state.finalCells.length) {
      setStatus("请先生成图纸");
      return;
    }
    const canvas = createPatternExportCanvas();
    canvas.toBlob((blob) => {
      if (!blob) {
        downloadUrl(canvas.toDataURL("image/png"), safeName(state.imageName || "pattern") + ".png");
        return;
      }
      const url = URL.createObjectURL(blob);
      downloadUrl(url, safeName(state.imageName || "pattern") + ".png");
    }, "image/png");
    setStatus("已导出 PNG 图纸，底部已包含颜色统计清单");
  }

  function openPngPreview() {
    if (!state.finalCells.length) {
      setStatus("请先生成图纸");
      return;
    }
    const previewWindow = window.open("", "_blank");
    const canvas = createPatternExportCanvas();
    canvas.toBlob((blob) => {
      if (!blob) {
        const dataUrl = canvas.toDataURL("image/png");
        if (previewWindow) {
          previewWindow.location.href = dataUrl;
        } else {
          window.location.href = dataUrl;
        }
        return;
      }
      if (state.lastExportUrl) {
        URL.revokeObjectURL(state.lastExportUrl);
      }
      state.lastExportUrl = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.href = state.lastExportUrl;
      } else {
        downloadUrl(state.lastExportUrl, safeName(state.imageName || "pattern") + ".png");
      }
      setStatus("已打开图片预览；iPhone 可长按图片保存或分享");
    }, "image/png");
  }

  function exportCsv() {
    if (!state.stats.length) {
      setStatus("请先生成统计");
      return;
    }
    const rows = [["code", "name", "count", "hex"]];
    state.stats.forEach((item) => {
      rows.push([item.color.code, item.color.name, item.count, item.color.hex]);
    });
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    downloadUrl(URL.createObjectURL(blob), safeName(state.imageName || "beads") + "-统计.csv");
    setStatus("已导出 CSV 材料清单");
  }

  function printPattern() {
    if (!state.finalCells.length) {
      setStatus("请先生成图纸");
      return;
    }
    const canvas = createPatternExportCanvas();
    const totalBeads = state.stats.reduce((sum, item) => sum + item.count, 0);
    const boardX = Math.ceil(state.beadWidth / state.boardWidth);
    const boardY = Math.ceil(state.beadHeight / state.boardHeight);
    const tableRows = state.stats
      .map(
        (item) =>
          "<tr><td>" +
          item.color.code +
          "</td><td>" +
          escapeHtml(item.color.name) +
          "</td><td>" +
          formatNumber(item.count) +
          "</td></tr>",
      )
      .join("");

    els.printRoot.innerHTML =
      '<section class="print-page">' +
      "<h1>拼豆图纸</h1>" +
      "<p>尺寸：" +
      state.beadWidth +
      " x " +
      state.beadHeight +
      "，总颗数：" +
      formatNumber(totalBeads) +
      "，颜色：" +
      state.stats.length +
      "，预计板数：" +
      boardX +
      " x " +
      boardY +
      "</p>" +
      '<img class="print-pattern" alt="拼豆图纸" src="' +
      canvas.toDataURL("image/png") +
      '">' +
      "</section>" +
      '<section class="print-page">' +
      "<h2>材料清单</h2>" +
      '<table class="print-table"><thead><tr><th>编号</th><th>名称</th><th>数量</th></tr></thead><tbody>' +
      tableRows +
      "</tbody></table></section>";

    window.print();
    setStatus("已打开系统打印，可选择另存为 PDF");
  }

  function createPatternExportCanvas() {
    const maxDim = Math.max(state.beadWidth, state.beadHeight);
    const cellSize = maxDim <= 120 ? 24 : maxDim <= 220 ? 18 : 12;
    const patternWidth = state.beadWidth * cellSize;
    const patternHeight = state.beadHeight * cellSize;
    const columns = patternWidth >= 1300 ? 3 : patternWidth >= 760 ? 2 : 1;
    const rowHeight = 28;
    const statsRows = Math.max(1, Math.ceil(state.stats.length / columns));
    const statsHeight = 94 + statsRows * rowHeight;
    const canvas = document.createElement("canvas");
    canvas.width = patternWidth;
    canvas.height = patternHeight + statsHeight;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(cellSize, cellSize);
    drawPatternCells(ctx, {
      showGrid: true,
      showBoard: true,
      showCodes: true,
      displayCellSize: cellSize,
      lineWidth: 1 / cellSize,
      exportMode: true,
    });
    ctx.restore();
    drawExportStats(ctx, patternHeight, patternWidth, statsHeight, columns, rowHeight);
    return canvas;
  }

  function drawExportStats(ctx, top, width, height, columns, rowHeight) {
    const totalBeads = state.stats.reduce((sum, item) => sum + item.count, 0);
    const boardX = Math.ceil(state.beadWidth / state.boardWidth);
    const boardY = Math.ceil(state.beadHeight / state.boardHeight);
    const padding = 22;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, top, width, height);
    ctx.strokeStyle = "#17202a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, top + 1);
    ctx.lineTo(width, top + 1);
    ctx.stroke();

    ctx.fillStyle = "#17202a";
    ctx.font = '700 22px Inter, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText("颜色统计清单", padding, top + 34);
    ctx.font = '14px Inter, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillStyle = "#5d6b7a";
    ctx.fillText(
      "尺寸 " +
        state.beadWidth +
        " x " +
        state.beadHeight +
        " · 总颗数 " +
        formatNumber(totalBeads) +
        " · 颜色 " +
        state.stats.length +
        " · 预计板数 " +
        boardX +
        " x " +
        boardY,
      padding,
      top + 58,
    );

    const columnWidth = Math.max(1, (width - padding * 2) / columns);
    state.stats.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + column * columnWidth;
      const y = top + 86 + row * rowHeight;
      ctx.fillStyle = item.color.hex;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
      ctx.lineWidth = 1;
      ctx.fillRect(x, y - 15, 16, 16);
      ctx.strokeRect(x, y - 15, 16, 16);
      ctx.fillStyle = "#17202a";
      ctx.font = '700 13px Inter, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText(item.color.code, x + 24, y - 2);
      ctx.font = '13px Inter, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif';
      const name = item.color.name.length > 18 ? item.color.name.slice(0, 18) + "..." : item.color.name;
      ctx.fillText(name + " · " + formatNumber(item.count) + " 颗", x + 68, y - 2);
    });
    ctx.restore();
  }

  function saveProjectToDisk() {
    if (!state.sourceCanvas) {
      setStatus("请先导入图片");
      return;
    }

    const payload = createProjectPayload();
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json;charset=utf-8" });
    downloadUrl(URL.createObjectURL(blob), safeName(state.imageName || "project") + ".pindou.json");
    setStatus("项目文件已保存");
  }

  function createProjectPayload() {
    if (!state.sourceCanvas) {
      return null;
    }
    return {
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      imageName: state.imageName,
      imageDataUrl: state.sourceCanvas.toDataURL("image/png"),
      maskDataUrl: createMaskDataUrl(),
      crop: state.crop,
      cropAspect: state.cropAspect,
      beadWidth: state.beadWidth,
      beadHeight: state.beadHeight,
      lockAspect: state.lockAspect,
      beadMm: state.beadMm,
      boardWidth: state.boardWidth,
      boardHeight: state.boardHeight,
      alphaThreshold: state.alphaThreshold,
      contrast: state.contrast,
      saturation: state.saturation,
      tolerance: state.tolerance,
      brushSize: state.brushSize,
      samplingMode: state.samplingMode,
      coverageThreshold: state.coverageThreshold,
      edgeBoost: state.edgeBoost,
      maxColors: state.maxColors,
      dither: state.dither,
      border: state.border,
      disabledColors: Array.from(state.disabledColors),
      replacementMap: Array.from(state.replacementMap.entries()),
      showGrid: state.showGrid,
      showBoard: state.showBoard,
      showCodes: state.showCodes,
    };
  }

  function createMaskDataUrl() {
    if (!state.sourceCanvas || !state.mask) {
      return "";
    }
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = state.sourceCanvas.width;
    maskCanvas.height = state.sourceCanvas.height;
    const maskCtx = maskCanvas.getContext("2d");
    const maskImage = maskCtx.createImageData(maskCanvas.width, maskCanvas.height);
    for (let p = 0; p < state.mask.length; p += 1) {
      const i = p * 4;
      maskImage.data[i] = 255;
      maskImage.data[i + 1] = 255;
      maskImage.data[i + 2] = 255;
      maskImage.data[i + 3] = state.mask[p];
    }
    maskCtx.putImageData(maskImage, 0, 0);
    return maskCanvas.toDataURL("image/png");
  }

  function loadProjectFromDisk() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.pindou.json,application/json";
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(String(reader.result));
          restoreProject(payload);
        } catch (error) {
          setStatus("项目文件读取失败");
        }
      };
      reader.readAsText(file, "utf-8");
    });
    input.click();
  }

  function restoreProject(payload) {
    if (!payload || !payload.imageDataUrl) {
      setStatus("项目文件缺少图片数据");
      return;
    }
    state.isRestoringDraft = true;
    const image = new Image();
    image.onload = () => {
      setupSourceFromImage(image, payload.imageName || "已载入项目");
      state.crop = normalizeCrop(payload.crop || state.crop);
      state.beadWidth = clampInt(payload.beadWidth || 64, 8, beadLimit);
      state.beadHeight = clampInt(payload.beadHeight || 64, 8, beadLimit);
      state.lockAspect = Boolean(payload.lockAspect);
      state.beadMm = numberOrDefault(payload.beadMm, 5, 2, 10);
      state.boardWidth = clampInt(payload.boardWidth || 29, 8, 80);
      state.boardHeight = clampInt(payload.boardHeight || 29, 8, 80);
      state.alphaThreshold = clampInt(payload.alphaThreshold || 20, 0, 255);
      state.contrast = clampInt(payload.contrast || 0, -50, 100);
      state.saturation = clampInt(payload.saturation || 0, -50, 100);
      state.tolerance = clampInt(payload.tolerance || 42, 0, 160);
      state.brushSize = clampInt(payload.brushSize || 24, 4, 80);
      state.samplingMode = validOption(payload.samplingMode, ["shape", "balanced", "smooth"], "shape");
      state.cropAspect = validOption(payload.cropAspect, ["free", "original", "1:1", "4:3", "3:4", "16:9", "9:16"], "free");
      state.coverageThreshold = clampInt(payload.coverageThreshold || 18, 5, 70);
      state.edgeBoost = clampInt(payload.edgeBoost || 35, 0, 100);
      state.maxColors = clampInt(payload.maxColors || 32, 2, palette.length);
      state.dither = payload.dither || "none";
      state.disabledColors = sanitizeDisabledColors(payload.disabledColors || []);
      state.replacementMap = sanitizeReplacementMap(payload.replacementMap || []);
      state.border = normalizeBorderConfig(payload.border || defaultBorderConfig(), paletteById);
      state.showGrid = payload.showGrid === undefined ? true : Boolean(payload.showGrid);
      state.showBoard = payload.showBoard === undefined ? true : Boolean(payload.showBoard);
      state.showCodes = payload.showCodes === undefined ? true : Boolean(payload.showCodes);
      state.replaceExpanded.clear();
      state.replaceShowAll.clear();
      syncFormFromState();

      if (payload.maskDataUrl) {
        loadMaskDataUrl(payload.maskDataUrl, () => {
          recomputePattern();
          renderAll();
          state.isRestoringDraft = false;
          scheduleDraftSave();
          setStatus("项目已载入");
        });
      } else {
        recomputePattern();
        renderAll();
        state.isRestoringDraft = false;
        scheduleDraftSave();
        setStatus("项目已载入");
      }
    };
    image.onerror = () => {
      state.isRestoringDraft = false;
      setStatus("项目中的图片无法读取");
    };
    image.src = payload.imageDataUrl;
  }

  function loadMaskDataUrl(dataUrl, done) {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = state.sourceCanvas.width;
      canvas.height = state.sourceCanvas.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      state.mask = new Uint8ClampedArray(canvas.width * canvas.height);
      for (let p = 0; p < state.mask.length; p += 1) {
        state.mask[p] = data[p * 4 + 3];
      }
      state.maskVersion += 1;
      done();
    };
    image.onerror = done;
    image.src = dataUrl;
  }

  function syncFormFromState() {
    syncBeadSizeInputs(true);
    els.aspectToggle.checked = state.lockAspect;
    els.beadMmInput.value = String(state.beadMm);
    els.boardWidthInput.value = String(state.boardWidth);
    els.boardHeightInput.value = String(state.boardHeight);
    els.alphaInput.value = String(state.alphaThreshold);
    els.alphaValue.value = String(state.alphaThreshold);
    els.contrastInput.value = String(state.contrast);
    els.contrastValue.value = String(state.contrast);
    els.saturationInput.value = String(state.saturation);
    els.saturationValue.value = String(state.saturation);
    els.toleranceInput.value = String(state.tolerance);
    els.toleranceValue.value = String(state.tolerance);
    els.brushInput.value = String(state.brushSize);
    els.brushValue.value = String(state.brushSize);
    els.samplingModeSelect.value = state.samplingMode;
    els.coverageInput.value = String(state.coverageThreshold);
    els.coverageValue.value = state.coverageThreshold + "%";
    els.edgeInput.value = String(state.edgeBoost);
    els.edgeValue.value = String(state.edgeBoost);
    els.maxColorsInput.value = String(state.maxColors);
    els.ditherSelect.value = state.dither;
    state.border = normalizeBorderConfig(state.border, paletteById);
    els.borderEnabledInput.checked = state.border.enabled;
    els.borderThicknessInput.value = String(state.border.thickness);
    els.borderThicknessValue.value = String(state.border.thickness);
    els.borderModeSelect.value = state.border.mode;
    els.borderUnifyInput.checked = state.border.unifySimilar;
    els.borderThresholdInput.value = String(state.border.similarityThreshold);
    els.borderThresholdValue.value = String(state.border.similarityThreshold);
    els.gridToggle.checked = state.showGrid;
    els.boardToggle.checked = state.showBoard;
    els.codeToggle.checked = state.showCodes;
    renderBorderControls();
    syncCropControls();
  }

  function scheduleDraftSave() {
    if (state.isRestoringDraft || !state.sourceCanvas) {
      return;
    }
    window.clearTimeout(state.draftTimer);
    state.draftTimer = window.setTimeout(() => {
      const payload = createProjectPayload();
      if (!payload) {
        return;
      }
      saveDraftPayload(payload)
        .then(updateDraftButtonState)
        .catch(() => {
          setStatus("草稿自动保存失败，可手动保存项目文件");
        });
    }, 900);
  }

  async function restoreDraftFromStorage() {
    let payload = null;
    try {
      payload = await readDraftPayload();
      if (!payload) {
        setStatus("暂无可恢复草稿");
        return;
      }
    } catch (error) {
      setStatus("当前浏览器无法读取草稿，可载入项目文件");
      return;
    }
    restoreProject(payload);
    setStatus("正在恢复本机草稿");
  }

  async function updateDraftButtonState() {
    if (!els.restoreDraftButton) {
      return;
    }
    try {
      const payload = await readDraftPayload();
      els.restoreDraftButton.disabled = !payload;
      els.restoreDraftButton.title = payload && payload.savedAt ? "上次草稿：" + payload.savedAt : "暂无本机草稿";
    } catch (error) {
      els.restoreDraftButton.disabled = true;
      els.restoreDraftButton.title = "当前浏览器无法读取草稿";
    }
  }

  function openDraftDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const request = indexedDB.open(draftDbName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(draftStoreName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  async function saveDraftPayload(payload) {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(draftStoreName, "readwrite");
      tx.objectStore(draftStoreName).put(payload, draftKey);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("IndexedDB write failed"));
      };
    });
  }

  async function readDraftPayload() {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(draftStoreName, "readonly");
      const request = tx.objectStore(draftStoreName).get(draftKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("IndexedDB transaction failed"));
      };
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      setPwaStatus("当前浏览器不支持离线安装，仍可在线使用。");
      return;
    }
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => {
        setPwaStatus("首次打开需要联网，加载完成后可离线使用。");
        if (registration.active) {
          setPwaStatus("离线资源已准备好。");
        }
        if (registration.installing) {
          registration.installing.addEventListener("statechange", () => {
            if (registration.installing && registration.installing.state === "activated") {
              setPwaStatus("离线资源已准备好。");
            }
          });
        }
      })
      .catch(() => {
        setPwaStatus("离线缓存注册失败，当前仍可在线使用。");
      });

    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "PINDOU_CACHE_READY") {
        setPwaStatus("离线资源已准备好。");
      }
    });
  }

  function setPwaStatus(text) {
    if (els.pwaStatus) {
      els.pwaStatus.textContent = text;
    }
  }

  function cropBounds() {
    const width = state.sourceCanvas ? state.sourceCanvas.width : 1;
    const height = state.sourceCanvas ? state.sourceCanvas.height : 1;
    const left = clamp(state.crop.left, 0, 0.95);
    const right = clamp(state.crop.right, left + 0.05, 1);
    const top = clamp(state.crop.top, 0, 0.95);
    const bottom = clamp(state.crop.bottom, top + 0.05, 1);
    const x = Math.round(left * width);
    const y = Math.round(top * height);
    const x2 = Math.round(right * width);
    const y2 = Math.round(bottom * height);
    return {
      x,
      y,
      width: Math.max(1, x2 - x),
      height: Math.max(1, y2 - y),
    };
  }

  function cropPixelWidth() {
    return cropBounds().width;
  }

  function cropPixelHeight() {
    return cropBounds().height;
  }

  function normalizeCrop(crop) {
    return {
      left: clamp(Number(crop.left) || 0, 0, 0.95),
      right: clamp(Number(crop.right) || 1, 0.05, 1),
      top: clamp(Number(crop.top) || 0, 0, 0.95),
      bottom: clamp(Number(crop.bottom) || 1, 0.05, 1),
    };
  }

  function sanitizeDisabledColors(ids) {
    const output = new Set();
    ids.forEach((id) => {
      if (paletteById.has(id)) {
        output.add(id);
      }
    });
    return output;
  }

  function sanitizeReplacementMap(entries) {
    const output = new Map();
    entries.forEach((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) {
        return;
      }
      const source = entry[0];
      const target = entry[1];
      if (
        source !== target &&
        paletteById.has(source) &&
        paletteById.has(target) &&
        !state.disabledColors.has(source) &&
        !state.disabledColors.has(target)
      ) {
        output.set(source, target);
      }
    });
    return output;
  }

  function tabStatusText(tab) {
    const map = {
      image: "图片工具：魔棒点击背景，橡皮/恢复可拖动修正",
      size: "尺寸工具：调整横向和纵向颗数来控制图纸大小",
      palette: "色表工具：点击色块可禁用或启用颜色",
      replace: "替换工具：为缺失颜色选择相近替代色",
      stats: "统计工具：查看数量并导出图纸或材料清单",
    };
    return map[tab] || "准备就绪";
  }

  function toolStatusText() {
    const map = {
      view: "查看模式：拖动裁剪框，空白处拖动画布，滚轮缩放",
      magic: "魔棒模式：点击背景区域删除连通相近颜色",
      erase: "橡皮模式：拖动删除区域",
      restore: "恢复模式：拖动找回区域",
    };
    return map[state.activeTool] || "准备就绪";
  }

  function setStatus(text) {
    els.statusLine.textContent = text;
  }

  function downloadUrl(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (url.startsWith("blob:")) {
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  }

  function csvEscape(value) {
    const text = String(value);
    if (/[",\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function safeName(name) {
    return String(name)
      .replace(/\.[^.]+$/, "")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .trim()
      .slice(0, 64) || "pindou";
  }

  function numberOrDefault(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return clamp(number, min, max);
  }

  function validOption(value, options, fallback) {
    return options.includes(value) ? value : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clampInt(value, min, max) {
    return Math.round(clamp(value, min, max));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(value);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();

