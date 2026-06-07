(function () {
  "use strict";

  const maxWorkingSide = 960;
  const beadLimit = 300;
  const previewPadding = 18;
  const minPreviewScale = 1;
  const maxPreviewScale = 60;
  const minPreviewButtonScale = 5;
  const previewCodeCellSize = 16;
  const maxPatternCachePixels = 9000000;
  const maxPatternCacheSide = 4096;
  const exportMaxPatternSide = 7200;
  const exportMinStatsWidth = 1080;
  const exportStatsPadding = 36;
  const exportStatsHeaderHeight = 78;
  const exportStatsRowHeight = 34;
  const exportStatsColumnMinWidth = 300;
  const cropHandleRadius = 28;
  const minCropSide = 8;
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

  const { colorDistance, hexToRgb, labDistance, rgbToLab } = colorTools;
  const {
    computeStats: computePaletteStats,
    defaultBorderConfig,
    generatePattern,
    normalizeBorderConfig,
    palette: enginePalette,
    pickDominantEdgeColor,
  } = patternTools;
  const mardPaletteData = paletteData.mardPaletteData;
  const palette =
    Array.isArray(enginePalette) && enginePalette.length
      ? enginePalette
      : mardPaletteData.map((item) => {
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
    originalCanvas: null,
    originalSourceImageData: null,
    sourceCanvas: null,
    sourceImageData: null,
    cutoutBaseImageData: null,
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
    cropDraft: null,
    cropApplied: false,
    appliedCropRect: null,
    cutoutApplied: false,
    isCropping: false,
    beadWidth: 48,
    beadHeight: 48,
    lockAspect: true,
    beadMm: 5,
    boardWidth: 29,
    boardHeight: 29,
    alphaThreshold: 20,
    contrast: 0,
    saturation: 0,
    tolerance: 54,
    brushSize: 24,
    samplingMode: "balanced",
    cropAspect: "free",
    coverageThreshold: 12,
    edgeBoost: 35,
    maxColors: 24,
    dither: "none",
    widthDraft: "48",
    heightDraft: "48",
    disabledColors: new Set(),
    replacementMap: new Map(),
    replaceExpanded: new Set(),
    replaceShowAll: new Set(),
    border: defaultBorderConfig(),
    pixelSamples: [],
    rawCells: [],
    borderedCells: [],
    finalCells: [],
    pattern: null,
    patternVersion: 0,
    patternCacheCanvas: null,
    patternCacheCtx: null,
    patternCacheDirty: true,
    patternCacheCellSize: 0,
    patternCacheSignature: "",
    stats: [],
    transform: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    },
    interaction: null,
    activePointers: new Map(),
    contentRect: null,
    isPreviewInteracting: false,
    recomputeTimer: null,
    draftTimer: null,
    isRestoringDraft: false,
    isProcessing: false,
    isExporting: false,
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
      "workflowTitle",
      "workflowMeta",
      "workflowNextButton",
      "previewModeLabel",
      "previewSizeLabel",
      "gridToggle",
      "boardToggle",
      "codeToggle",
      "canvasWrap",
      "previewCanvas",
      "previewControls",
      "zoomOutButton",
      "zoomResetButton",
      "zoomInButton",
      "emptyImport",
      "statusLine",
      "pwaStatus",
      "imageInput",
      "imageInputSecondary",
      "imageInputStart",
      "imageSectionNote",
      "imageNotice",
      "startActions",
      "imageTools",
      "loadProjectButtonStart",
      "restoreDraftButtonStart",
      "saveProjectButtonPanel",
      "loadProjectButtonPanel",
      "restoreDraftButtonPanel",
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
      "resetContrastButton",
      "resetSaturationButton",
      "autoCutoutButton",
      "undoMaskButton",
      "applyAlphaButton",
      "resetMaskButton",
      "resetCropButton",
      "cropFocusButton",
      "cropModeActions",
      "applyCropButton",
      "cancelCropButton",
      "resetCropDraftButton",
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
      "maxColorsValue",
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

    document.querySelectorAll(".segment[data-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeTool = button.dataset.tool;
        document.querySelectorAll(".segment[data-tool]").forEach((node) => {
          node.classList.toggle("active", node === button);
        });
        els.previewCanvas.style.cursor = "";
        setStatus(toolStatusText());
      });
    });

    document.querySelectorAll("[data-select-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const select = els[button.dataset.selectTarget];
        if (!select || select.disabled) {
          return;
        }
        select.value = button.dataset.selectValue || "";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncOptionSegments();
      });
    });

    document.querySelectorAll("[data-step-field]").forEach((button) => {
      button.addEventListener("click", () => {
        stepNumber(button.dataset.stepField, Number(button.dataset.stepDelta) || 0);
      });
    });

    els.imageInput.addEventListener("change", handleImageInput);
    els.imageInputSecondary.addEventListener("change", handleImageInput);
    els.imageInputStart.addEventListener("change", handleImageInput);
    els.restoreDraftButton.addEventListener("click", restoreDraftFromStorage);
    els.loadProjectButton.addEventListener("click", loadProjectFromDisk);
    els.saveProjectButton.addEventListener("click", saveProjectToDisk);
    els.workflowNextButton.addEventListener("click", handleWorkflowNext);
    els.loadProjectButtonStart.addEventListener("click", loadProjectFromDisk);
    els.restoreDraftButtonStart.addEventListener("click", restoreDraftFromStorage);
    els.saveProjectButtonPanel.addEventListener("click", saveProjectToDisk);
    els.loadProjectButtonPanel.addEventListener("click", loadProjectFromDisk);
    els.restoreDraftButtonPanel.addEventListener("click", restoreDraftFromStorage);

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

    els.resetContrastButton.addEventListener("click", () => resetAdjustment("contrast"));
    els.resetSaturationButton.addEventListener("click", () => resetAdjustment("saturation"));
    els.applyAlphaButton.addEventListener("click", applyAlphaThresholdToMask);
    els.autoCutoutButton.addEventListener("click", autoCutoutBackground);
    els.undoMaskButton.addEventListener("click", undoMaskEdit);
    els.resetMaskButton.addEventListener("click", resetMask);
    els.resetCropButton.addEventListener("click", resetCrop);
    els.cropFocusButton.addEventListener("click", focusCropTools);
    els.applyCropButton.addEventListener("click", applyCrop);
    els.cancelCropButton.addEventListener("click", cancelCrop);
    els.resetCropDraftButton.addEventListener("click", resetCropDraft);
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

    bindRange(els.maxColorsInput, els.maxColorsValue, (value) => {
      state.maxColors = clampInt(value, 2, Math.min(64, palette.length));
      scheduleRecompute();
    });
    els.samplingModeSelect.addEventListener("change", () => {
      state.samplingMode = els.samplingModeSelect.value;
      scheduleRecompute();
      syncOptionSegments();
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
      syncOptionSegments();
    });
    els.borderEnabledInput.addEventListener("change", () => {
      state.border.enabled = els.borderEnabledInput.checked;
      scheduleRecompute();
      renderBorderControls();
      syncTogglePills();
    });
    bindRange(els.borderThicknessInput, els.borderThicknessValue, (value) => {
      state.border.thickness = clampInt(value, 1, 3);
      scheduleRecompute();
    });
    els.borderModeSelect.addEventListener("change", () => {
      state.border.mode = validOption(els.borderModeSelect.value, ["outside", "inside", "both"], "outside");
      scheduleRecompute();
      syncOptionSegments();
    });
    els.borderUnifyInput.addEventListener("change", () => {
      state.border.unifySimilar = els.borderUnifyInput.checked;
      scheduleRecompute();
      syncTogglePills();
    });
    bindRange(els.borderThresholdInput, els.borderThresholdValue, (value) => {
      state.border.similarityThreshold = clampInt(value, 4, 30);
      scheduleRecompute();
    });
    els.borderPickEdgeButton.addEventListener("click", pickBorderColorFromEdge);

    els.gridToggle.addEventListener("change", () => {
      state.showGrid = els.gridToggle.checked;
      syncPreviewOptionChips();
      drawPreview();
      scheduleDraftSave();
    });
    els.boardToggle.addEventListener("change", () => {
      state.showBoard = els.boardToggle.checked;
      syncPreviewOptionChips();
      drawPreview();
      scheduleDraftSave();
    });
    els.codeToggle.addEventListener("change", () => {
      state.showCodes = els.codeToggle.checked;
      syncPreviewOptionChips();
      drawPreview();
      scheduleDraftSave();
    });

    els.zoomOutButton.addEventListener("click", () => zoomPreview(0.82));
    els.zoomInButton.addEventListener("click", () => zoomPreview(1.22));
    els.zoomResetButton.addEventListener("click", resetPreviewZoom);

    els.clearReplaceButton.addEventListener("click", () => {
      state.replacementMap.clear();
      state.disabledColors.clear();
      state.replaceExpanded.clear();
      state.replaceShowAll.clear();
      recomputePattern();
      renderAll();
      scheduleDraftSave();
      setStatus("已清空禁用和替换规则");
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
    if (state.isCropping && tab !== "image") {
      setStatus("请先应用或取消裁剪");
      updateUiState();
      return;
    }

    if (!state.sourceCanvas && tab !== "image") {
      state.activeTab = "image";
      document.querySelectorAll(".step-tab").forEach((button) => {
        button.classList.toggle("active", button.dataset.tab === "image");
      });
      document.querySelectorAll(".tool-section").forEach((section) => {
        section.classList.toggle("active", section.id === "tab-image");
      });
      setStatus("先导入图片，再调整图纸参数");
      updateUiState();
      return;
    }

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
    updateUiState();
    drawPreview();
  }

  function handleWorkflowNext() {
    if (!state.sourceCanvas) {
      els.imageInputStart.click();
      return;
    }

    if (state.isCropping) {
      applyCrop();
      return;
    }

    const nextTabByCurrent = {
      image: "size",
      size: "optimize",
      optimize: "palette",
      palette: "stats",
    };
    const nextTab = nextTabByCurrent[state.activeTab];
    if (nextTab) {
      switchTab(nextTab);
      return;
    }

    exportPng();
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

    const imageData = ctx.getImageData(0, 0, width, height);
    state.originalCanvas = canvas;
    state.originalSourceImageData = imageData;
    state.sourceCanvas = canvas;
    state.sourceImageData = imageData;
    state.imageName = name;
    state.mask = new Uint8ClampedArray(width * height);
    initializeMaskFromAlpha();
    state.maskHistory = [];
    state.maskVersion += 1;
    state.maskedCanvas = null;
    state.crop = { left: 0, right: 1, top: 0, bottom: 1 };
    state.cropDraft = null;
    state.cropApplied = false;
    state.appliedCropRect = createFullCropRect(width, height);
    state.cutoutApplied = false;
    state.cutoutBaseImageData = null;
    state.isCropping = false;
    state.replacementMap.clear();
    state.replaceExpanded.clear();
    state.replaceShowAll.clear();
    state.disabledColors.clear();
    state.transform = { scale: 1, offsetX: 0, offsetY: 0 };
    state.pattern = null;
    state.patternCacheDirty = true;
    state.patternCacheSignature = "";

    if (state.lockAspect) {
      const aspect = sourceAspect();
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
    if (!state.sourceImageData) {
      setStatus("请先导入图片");
      return;
    }

    const baseImageData = state.cutoutApplied ? currentCropImageData() : state.sourceImageData;
    const result = removeEdgeBackground(baseImageData, state.tolerance, state.alphaThreshold);
    if (!result || !result.changed) {
      setStatus("没有识别到背景");
      return;
    }

    state.cutoutBaseImageData = baseImageData;
    setCurrentImageData(result.imageData);
    state.cutoutApplied = true;
    recomputePattern();
    renderAll();
    setStatus("已去背景 " + formatNumber(result.changed) + " 像素");
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
    if (!state.sourceImageData || !state.originalSourceImageData) {
      setStatus("请先导入图片");
      return;
    }

    if (state.cutoutApplied) {
      const restored = currentCropImageData();
      if (!restored) {
        setStatus("无法重置背景");
        return;
      }
      setCurrentImageData(restored);
      state.cutoutApplied = false;
      state.cutoutBaseImageData = null;
    } else if (state.mask) {
      state.mask.fill(255);
      state.maskVersion += 1;
      state.maskedCanvas = null;
    }
    recomputePattern();
    renderAll();
    setStatus("已重置背景");
  }

  function resetCrop() {
    resetCropToFull();
  }

  function focusCropTools() {
    if (!state.originalSourceImageData) {
      setStatus("请先导入图片");
      return;
    }
    const full = createFullCropRect(state.originalSourceImageData.width, state.originalSourceImageData.height);
    state.cropDraft = normalizeCropRect(state.appliedCropRect || full, full.width, full.height);
    state.crop = cropToNormalized(state.cropDraft, full.width, full.height);
    state.isCropping = true;
    state.activeTab = "image";
    state.activeTool = "view";
    document.querySelectorAll(".step-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === "image");
    });
    document.querySelectorAll(".tool-section").forEach((section) => {
      section.classList.toggle("active", section.id === "tab-image");
    });
    document.querySelectorAll(".segment[data-tool]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === "view");
    });
    els.canvasWrap.scrollIntoView({ block: "nearest" });
    updateUiState();
    drawPreview();
    setStatus("拖动裁剪框，应用后重新生成图纸");
  }

  function cancelCrop() {
    state.isCropping = false;
    state.cropDraft = null;
    state.crop = { left: 0, right: 1, top: 0, bottom: 1 };
    state.interaction = null;
    updateUiState();
    drawPreview();
    setStatus(state.finalCells.length ? "已返回图纸预览" : "已取消裁剪");
  }

  function resetCropDraft() {
    if (!state.originalSourceImageData) {
      return;
    }
    const full = createFullCropRect(state.originalSourceImageData.width, state.originalSourceImageData.height);
    state.cropDraft = full;
    state.crop = cropToNormalized(full, full.width, full.height);
    drawPreview();
    setStatus("裁剪范围已重置");
  }

  function applyCrop() {
    if (!state.originalSourceImageData) {
      setStatus("请先导入图片");
      return;
    }
    const full = createFullCropRect(state.originalSourceImageData.width, state.originalSourceImageData.height);
    const rect = normalizeCropRect(state.cropDraft || cropBounds(), full.width, full.height);
    const cropped = cropImageData(state.originalSourceImageData, rect);
    if (!cropped || !cropped.data || !cropped.width || !cropped.height) {
      setStatus("裁剪区域太小");
      return;
    }

    state.appliedCropRect = rect;
    state.cropApplied = !isFullCropRect(rect, full.width, full.height);
    state.cropDraft = null;
    state.crop = { left: 0, right: 1, top: 0, bottom: 1 };
    state.isCropping = false;
    state.cutoutApplied = false;
    state.cutoutBaseImageData = null;
    state.transform = { scale: 1, offsetX: 0, offsetY: 0 };
    setCurrentImageData(cropped);
    if (state.lockAspect) {
      const aspect = sourceAspect();
      state.beadHeight = clampInt(Math.round(state.beadWidth * aspect), 8, beadLimit);
      syncBeadSizeInputs(true);
    }
    recomputePattern();
    renderAll();
    setStatus(state.cropApplied ? "已应用裁剪" : "已恢复整图");
  }

  function resetCropToFull() {
    if (!state.originalSourceImageData) {
      setStatus("请先导入图片");
      return;
    }
    const full = createFullCropRect(state.originalSourceImageData.width, state.originalSourceImageData.height);
    state.appliedCropRect = full;
    state.cropApplied = false;
    state.cropDraft = null;
    state.crop = { left: 0, right: 1, top: 0, bottom: 1 };
    state.isCropping = false;
    state.cutoutApplied = false;
    state.cutoutBaseImageData = null;
    state.transform = { scale: 1, offsetX: 0, offsetY: 0 };
    setCurrentImageData(state.originalSourceImageData);
    if (state.lockAspect) {
      const aspect = sourceAspect();
      state.beadHeight = clampInt(Math.round(state.beadWidth * aspect), 8, beadLimit);
      syncBeadSizeInputs(true);
    }
    recomputePattern();
    renderAll();
    setStatus("已恢复整图");
  }

  function resetAdjustment(field) {
    if (field === "contrast") {
      state.contrast = 0;
      els.contrastInput.value = "0";
      els.contrastValue.value = "0";
      scheduleRecompute();
      setStatus("已重置对比度");
      return;
    }
    if (field === "saturation") {
      state.saturation = 0;
      els.saturationInput.value = "0";
      els.saturationValue.value = "0";
      scheduleRecompute();
      setStatus("已重置饱和度");
    }
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

  function stepNumber(field, delta) {
    if (!delta) {
      return;
    }
    if (field === "beadWidth") {
      applyBeadSize("width", state.beadWidth + delta, true);
      setStatus("已调整横向颗数");
      return;
    }
    if (field === "beadHeight") {
      applyBeadSize("height", state.beadHeight + delta, true);
      setStatus("已调整纵向颗数");
      return;
    }
    if (field === "beadMm") {
      state.beadMm = clamp(Math.round((state.beadMm + delta) * 2) / 2, 2, 10);
      els.beadMmInput.value = String(state.beadMm);
      renderMetrics();
      scheduleDraftSave();
      setStatus("已调整单颗规格");
      return;
    }
    if (field === "boardWidth") {
      state.boardWidth = clampInt(state.boardWidth + delta, 8, 80);
      els.boardWidthInput.value = String(state.boardWidth);
      scheduleRecompute();
      setStatus("已调整板宽");
      return;
    }
    if (field === "boardHeight") {
      state.boardHeight = clampInt(state.boardHeight + delta, 8, 80);
      els.boardHeightInput.value = String(state.boardHeight);
      scheduleRecompute();
      setStatus("已调整板高");
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
    const size = cropCoordinateSize();
    if (!size.width || !size.height) {
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
      const size = cropCoordinateSize();
      return size.width && size.height ? size.width / size.height : null;
    }
    const parts = state.cropAspect.split(":").map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      return parts[0] / parts[1];
    }
    return null;
  }

  function fitCropRect(centerX, centerY, width, height, aspect) {
    const source = cropCoordinateSize();
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
    const source = cropCoordinateSize();
    if (!source.width || !source.height) {
      return 1;
    }
    return minCropSide;
  }

  function setCropFromPixelRect(rect) {
    const source = cropCoordinateSize();
    if (!source.width || !source.height) {
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
    if (state.isCropping) {
      state.cropDraft = { x, y, width, height };
    }
  }

  function handleCropChanged(recompute) {
    if (state.isCropping) {
      drawPreview();
      return;
    }

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
    const source = cropCoordinateSize();
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
    const source = cropCoordinateSize();
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
    const source = cropCoordinateSize();
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
      state.pattern = null;
      state.pixelSamples = [];
      state.rawCells = [];
      state.borderedCells = [];
      state.finalCells = [];
      state.stats = [];
      state.patternCacheDirty = true;
      renderMetrics();
      return;
    }

    const imageData = makePatternSourceImageData();
    if (!imageData) {
      state.pattern = null;
      state.pixelSamples = [];
      state.rawCells = [];
      state.borderedCells = [];
      state.finalCells = [];
      state.stats = [];
      state.patternCacheDirty = true;
      renderMetrics();
      setStatus("生成失败，请重新导入图片");
      return;
    }

    state.isProcessing = true;
    setStatus("正在生成图纸");
    const result = generatePattern({
      alphaThreshold: state.alphaThreshold,
      beadHeight: state.beadHeight,
      beadWidth: state.beadWidth,
      border: state.border,
      contrast: state.contrast,
      coverageThreshold: state.coverageThreshold,
      dither: state.dither,
      disabledColorIds: Array.from(state.disabledColors),
      edgeBoost: state.edgeBoost,
      imageData,
      maxColors: state.maxColors,
      replacements: state.replacementMap,
      saturation: state.saturation,
      samplingMode: state.samplingMode,
    });

    state.pattern = result;
    state.pixelSamples = [];
    state.rawCells = result.rawCells || [];
    state.borderedCells = result.baseCells || result.rawCells || [];
    state.finalCells = result.cells || [];
    state.stats = result.stats || [];
    state.patternVersion += 1;
    state.patternCacheDirty = true;
    state.patternCacheSignature = "";
    state.isProcessing = false;
    setStatus("已生成图纸，用时 " + Math.round(result.elapsedMs || 0) + "ms");
    scheduleDraftSave();
  }

  function makePatternSourceImageData() {
    if (!state.sourceImageData) {
      return null;
    }
    const cropped = cropImageData(state.sourceImageData, cropBounds());
    if (!cropped) {
      return null;
    }
    return applyMaskToCroppedImageData(cropped, cropBounds());
  }

  function applyMaskToCroppedImageData(imageData, crop) {
    if (!state.mask || !state.sourceImageData || state.mask.length !== state.sourceImageData.width * state.sourceImageData.height) {
      return imageData;
    }
    const data = new Uint8ClampedArray(imageData.data);
    for (let y = 0; y < imageData.height; y += 1) {
      for (let x = 0; x < imageData.width; x += 1) {
        const sourceX = crop.x + x;
        const sourceY = crop.y + y;
        const sourceIndex = sourceY * state.sourceImageData.width + sourceX;
        const targetAlphaIndex = (y * imageData.width + x) * 4 + 3;
        data[targetAlphaIndex] = Math.round((data[targetAlphaIndex] * (state.mask[sourceIndex] || 0)) / 255);
      }
    }
    return {
      data,
      width: imageData.width,
      height: imageData.height,
    };
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
    updateUiState();
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
    els.previewModeLabel.textContent = state.isCropping ? "裁剪预览" : state.finalCells.length ? "图纸预览" : "图片预览";

    renderMetricCards(els.sizeMetrics, [
      ["总格数", formatNumber(totalCells)],
      ["成品尺寸", widthCm + " x " + heightCm + "cm"],
      ["预计板数", boardCountX + " x " + boardCountY],
      ["单颗规格", state.beadMm + "mm"],
    ]);

    renderMetricCards(els.summaryMetrics, [
      ["图纸尺寸", state.beadWidth + " x " + state.beadHeight],
      ["总颗数", formatNumber(totalBeads)],
      ["颜色数量", String(state.stats.length)],
      ["预计板数", boardCountX * boardCountY + " 块"],
    ]);
  }

  function updateUiState() {
    const hasImage = Boolean(state.sourceCanvas);
    const hasPattern = state.finalCells.length > 0;
    const totalBeads = state.stats.reduce((sum, item) => sum + item.count, 0);
    const workflow = workflowSummary(hasImage, hasPattern, totalBeads);

    els.workflowTitle.textContent = workflow.title;
    els.workflowMeta.textContent = workflow.meta;
    els.workflowNextButton.textContent = workflow.nextLabel;
    els.workflowNextButton.disabled = state.isExporting;
    els.previewModeLabel.textContent = state.isCropping ? "裁剪预览" : hasPattern ? "图纸预览" : "图片预览";
    els.imageSectionNote.textContent = hasImage ? imageStatusText() : "相册或拍照导入，本地处理图片。";
    if (els.imageNotice) {
      els.imageNotice.textContent = imageStatusText();
    }
    els.startActions.classList.toggle("hidden", hasImage);
    els.imageTools.classList.toggle("hidden", !hasImage);
    document.body.classList.toggle("has-image", hasImage);
    document.body.classList.toggle("has-pattern", hasPattern);
    document.body.classList.toggle("is-exporting", state.isExporting);
    document.body.classList.toggle("is-image-tab", state.activeTab === "image");
    document.body.classList.toggle("is-cropping", state.isCropping);
    document.body.classList.toggle("can-zoom-preview", hasPattern && !state.isCropping);
    if (els.cropModeActions) {
      els.cropModeActions.classList.toggle("hidden", !state.isCropping);
    }
    syncPreviewOptionChips();
    syncTogglePills();
    syncOptionSegments();
    updateZoomControls();

    document.querySelectorAll(".step-tab").forEach((button) => {
      const disabled = (!hasImage && button.dataset.tab !== "image") || (state.isCropping && button.dataset.tab !== "image");
      button.classList.toggle("disabled", disabled);
      button.disabled = disabled;
    });

    const needsImageButtons = [
      els.saveProjectButton,
      els.saveProjectButtonPanel,
      els.autoCutoutButton,
      els.undoMaskButton,
      els.applyAlphaButton,
      els.resetMaskButton,
      els.resetCropButton,
      els.cropFocusButton,
    ];
    needsImageButtons.forEach((button) => {
      button.disabled = !hasImage || state.isExporting || state.isCropping;
    });
    els.cropFocusButton.disabled = !hasImage || state.isExporting || state.isCropping;
    els.resetMaskButton.disabled = !hasImage || state.isExporting || state.isCropping || !state.cutoutApplied;
    els.resetCropButton.disabled = !hasImage || state.isExporting || state.isCropping || !state.cropApplied;
    els.applyCropButton.disabled = !state.isCropping || state.isExporting;
    els.cancelCropButton.disabled = !state.isCropping || state.isExporting;
    els.resetCropDraftButton.disabled = !state.isCropping || state.isExporting;

    const exportButtons = [
      els.exportPngButton,
      els.openPngButton,
      els.copyStatsButton,
      els.exportCsvButton,
      els.exportPdfButton,
      els.exportPdfButtonTop,
    ];
    exportButtons.forEach((button) => {
      button.disabled = !hasPattern || state.isExporting;
    });
    els.exportPngButton.textContent = state.isExporting ? "正在导出" : "保存图纸PNG";
    els.openPngButton.textContent = state.isExporting ? "正在生成图片" : "打开图片";
    els.copyStatsButton.textContent = "复制统计清单";
    els.exportCsvButton.textContent = "复制CSV";
    els.exportPdfButton.textContent = "打印/PDF";
    els.resetContrastButton.disabled = state.isExporting || state.contrast === 0;
    els.resetSaturationButton.disabled = state.isExporting || state.saturation === 0;
    els.clearReplaceButton.disabled = state.isExporting || (!state.disabledColors.size && !state.replacementMap.size);

    if (!hasImage && state.activeTab !== "image") {
      switchTab("image");
    }
  }

  function syncPreviewOptionChips() {
    [
      [els.gridToggle, state.showGrid],
      [els.boardToggle, state.showBoard],
      [els.codeToggle, state.showCodes],
    ].forEach(([input, active]) => {
      if (!input) {
        return;
      }
      const label = input.closest(".option-chip");
      if (label) {
        label.classList.toggle("active", Boolean(active));
      }
    });
  }

  function syncTogglePills() {
    document.querySelectorAll(".switch-pill[data-switch-for]").forEach((pill) => {
      const input = els[pill.dataset.switchFor];
      const active = Boolean(input && input.checked);
      pill.classList.toggle("active", active);
      pill.textContent = active ? "开" : "关";
    });
  }

  function syncOptionSegments() {
    document.querySelectorAll("[data-select-target]").forEach((button) => {
      const select = els[button.dataset.selectTarget];
      button.classList.toggle("active", Boolean(select && select.value === button.dataset.selectValue));
    });
  }

  function updateZoomControls() {
    if (!els.zoomResetButton) {
      return;
    }
    const canZoom = Boolean(state.sourceCanvas && state.finalCells.length && !state.isCropping);
    els.previewControls.setAttribute("aria-hidden", canZoom ? "false" : "true");
    [els.zoomOutButton, els.zoomResetButton, els.zoomInButton].forEach((button) => {
      button.disabled = !canZoom;
    });
    els.zoomResetButton.textContent = previewScaleText();
  }

  function previewScaleText() {
    const scale = clamp(Number(state.transform.scale) || 1, minPreviewScale, maxPreviewScale);
    if (Math.abs(scale - 1) < 0.01) {
      return "1x";
    }
    return scale.toFixed(scale < 10 ? 1 : 0) + "x";
  }

  function workflowSummary(hasImage, hasPattern, totalBeads) {
    if (state.isCropping) {
      return {
        title: "裁剪图片",
        meta: "拖动裁剪框，应用后重新生成图纸。",
        nextLabel: "应用裁剪",
      };
    }
    if (state.isProcessing) {
      return {
        title: "正在生成",
        meta: "参数调整后会自动更新",
        nextLabel: "处理中",
      };
    }
    if (state.isExporting) {
      return {
        title: "正在导出",
        meta: "正在生成图纸图片，请稍候",
        nextLabel: "处理中",
      };
    }
    if (!hasImage) {
      return {
        title: "准备导入图片",
        meta: "先选择一张图片",
        nextLabel: "导入图片",
      };
    }
    if (!hasPattern) {
      return {
        title: "图片已导入",
        meta: imageStatusText(),
        nextLabel: "调尺寸",
      };
    }
    if (state.activeTab === "stats") {
      return {
        title: "图纸已生成",
        meta:
          state.beadWidth +
          " x " +
          state.beadHeight +
          " / " +
          formatNumber(totalBeads) +
          "颗 / " +
          state.stats.length +
          "色",
        nextLabel: "保存PNG",
      };
    }
    const nextLabels = {
      image: "调尺寸",
      size: "去优化",
      optimize: "调色表",
      palette: "看统计",
    };
    return {
      title: "图纸已生成",
      meta:
        state.beadWidth +
        " x " +
        state.beadHeight +
        " / " +
        formatNumber(totalBeads) +
        "颗 / " +
        state.stats.length +
        "色",
      nextLabel: nextLabels[state.activeTab] || "看统计",
    };
  }

  function imageStatusText() {
    if (!state.sourceCanvas) {
      return "先选择一张图片";
    }
    if (state.isCropping) {
      return "拖动裁剪框，应用后重新生成图纸。";
    }
    const cropText = !state.cropApplied
      ? "当前：整张图片 " + state.sourceCanvas.width + " x " + state.sourceCanvas.height
      : "当前：已裁剪 " + state.sourceCanvas.width + " x " + state.sourceCanvas.height;
    return state.cutoutApplied ? cropText + " / 已去背景" : cropText;
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
      els.replaceList.innerHTML = '<div class="panel-empty">生成后显示主要用色。</div>';
      return;
    }

    const actionItems = items.slice(0, 18);
    const rules = colorRuleRows();
    els.replaceList.innerHTML =
      '<div class="palette-strip">' +
      actionItems
        .map((item) => {
          const color = item.color;
          const disabled = state.disabledColors.has(color.id);
          const replacementId = state.replacementMap.get(color.id) || "";
          const replacement = replacementId ? paletteById.get(replacementId) : null;
          const status = disabled ? "已禁用" : replacement ? "换 " + replacement.code : formatNumber(item.count);
          return (
            '<button class="palette-chip tappable ' +
            (disabled || replacement ? "active " : "") +
            '" type="button" data-replace-toggle="' +
            color.id +
            '" title="' +
            escapeHtml(color.code + " " + color.name) +
            '">' +
            '<span class="swatch" style="background:' +
            color.hex +
            '"></span><span>' +
            color.code +
            "</span><small>" +
            escapeHtml(status) +
            "</small></button>"
          );
        })
        .join("") +
      "</div>" +
      renderExpandedColorAction() +
      (rules.length
        ? '<div class="rule-list">' +
          rules
            .map(
              (rule) =>
                '<div class="rule-item"><div class="rule-color"><span class="swatch" style="background:' +
                rule.source.hex +
                '"></span><span class="rule-copy"><strong>' +
                escapeHtml(rule.title) +
                "</strong><span>" +
                escapeHtml(rule.subtitle) +
                '</span></span></div><button class="inline-button small-inline" type="button" data-clear-rule="' +
                rule.source.id +
                '">撤销</button></div>',
            )
            .join("") +
          "</div>"
        : '<div class="rule-empty">暂无禁用或替换规则。</div>');

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
        if (target === "__disable") {
          state.disabledColors.add(source);
          state.replacementMap.delete(source);
        } else if (!target) {
          state.disabledColors.delete(source);
          state.replacementMap.delete(source);
        } else {
          state.disabledColors.delete(source);
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

    els.replaceList.querySelectorAll("button[data-clear-rule]").forEach((button) => {
      button.addEventListener("click", () => {
        const source = button.dataset.clearRule;
        state.disabledColors.delete(source);
        state.replacementMap.delete(source);
        recomputePattern();
        renderAll();
        setStatus("已撤销颜色规则");
      });
    });
  }

  function renderExpandedColorAction() {
    const sourceId = Array.from(state.replaceExpanded)[0];
    if (!sourceId) {
      return "";
    }
    const source = paletteById.get(sourceId);
    if (!source) {
      return "";
    }
    const replacementId = state.replacementMap.get(sourceId) || "";
    const disabled = state.disabledColors.has(sourceId);
    const showAll = state.replaceShowAll.has(sourceId);
    const options = replacementOptions(sourceId);
    const visibleOptions = showAll ? options : options.slice(0, 10);
    const optionButtons = visibleOptions.map((candidate, index) => replacementOptionButton(sourceId, candidate, replacementId, index)).join("");
    const moreButton =
      options.length > 10
        ? '<button class="replace-more-button" type="button" data-replace-more="' +
          sourceId +
          '">' +
          (showAll ? "收起相近色" : "显示更多相近色") +
          "</button>"
        : "";
    return (
      '<div class="replace-controls color-action-panel"><div class="color-action-title"><span class="swatch" style="background:' +
      source.hex +
      '"></span><strong>' +
      source.code +
      " " +
      escapeHtml(source.name) +
      "</strong></div><div class=\"replacement-grid\">" +
      '<button class="replacement-option no-replace ' +
      (!replacementId && !disabled ? "selected" : "") +
      '" type="button" data-replace-source="' +
      sourceId +
      '" data-replace-target=""><span class="replacement-meta"><strong>保留原色</strong><span>继续使用 ' +
      source.code +
      '</span></span><span class="distance-badge">原色</span></button>' +
      '<button class="replacement-option no-replace ' +
      (disabled ? "selected" : "") +
      '" type="button" data-replace-source="' +
      sourceId +
      '" data-replace-target="__disable"><span class="replacement-meta"><strong>禁用此色</strong><span>重新映射到可用色</span></span><span class="distance-badge">禁用</span></button>' +
      optionButtons +
      "</div>" +
      moreButton +
      "</div>"
    );
  }

  function colorRuleRows() {
    const rows = [];
    state.disabledColors.forEach((id) => {
      const source = paletteById.get(id);
      if (!source) {
        return;
      }
      rows.push({
        source,
        title: source.code + " 已禁用",
        subtitle: "生成时会避开这个颜色",
      });
    });
    state.replacementMap.forEach((targetId, sourceId) => {
      const source = paletteById.get(sourceId);
      const target = paletteById.get(targetId);
      if (!source || !target) {
        return;
      }
      rows.push({
        source,
        title: source.code + " -> " + target.code,
        subtitle: "已替换为 " + target.name,
      });
    });
    return rows;
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
      els.statsBody.innerHTML = '<div class="panel-empty">生成图纸后会显示颜色统计。</div>';
      return;
    }

    els.statsBody.innerHTML = state.stats
      .map((item) => {
        const color = item.color;
        return (
          '<div class="stats-item"><div class="stats-color"><span class="stats-swatch" style="background:' +
          color.hex +
          '"></span>' +
          '<span class="stats-copy"><strong class="stats-code">' +
          color.code +
          '</strong><span class="stats-name">' +
          escapeHtml(color.name) +
          "</span></span></div><strong class=\"stats-count\">" +
          formatNumber(item.count) +
          "</strong></div>"
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

  function zoomPreview(factor) {
    if (!canZoomPreview()) {
      setStatus("生成图纸后可缩放预览");
      return;
    }
    state.transform.scale = clamp(state.transform.scale * factor, minPreviewScale, previewMaxScale());
    constrainPreviewTransform();
    drawPreview();
    setStatus("预览缩放 " + previewScaleText());
  }

  function resetPreviewZoom() {
    state.transform = { scale: 1, offsetX: 0, offsetY: 0 };
    drawPreview();
    setStatus("已重置预览缩放");
  }

  function canZoomPreview() {
    return Boolean(state.sourceCanvas && state.finalCells.length && !state.isCropping);
  }

  function previewMaxScale() {
    return clamp(Math.max(minPreviewButtonScale, previewReadableScale()), minPreviewButtonScale, maxPreviewScale);
  }

  function previewReadableScale() {
    const pattern = state.pattern || {};
    const beadWidth = Math.max(1, pattern.beadWidth || state.beadWidth);
    const beadHeight = Math.max(1, pattern.beadHeight || state.beadHeight);
    const rect = els.canvasWrap ? els.canvasWrap.getBoundingClientRect() : { width: 0, height: 0 };
    const availableWidth = Math.max(1, (rect.width || 1) - previewPadding * 2);
    const availableHeight = Math.max(1, (rect.height || 1) - previewPadding * 2);
    const baseCellSize = Math.min(availableWidth / beadWidth, availableHeight / beadHeight);
    return Math.ceil((previewCodeCellSize / Math.max(0.1, baseCellSize)) * 10) / 10;
  }

  function constrainPreviewTransform(viewWidth, viewHeight) {
    if (!canZoomPreview()) {
      state.transform.scale = minPreviewScale;
      state.transform.offsetX = 0;
      state.transform.offsetY = 0;
      return state.transform;
    }

    const pattern = state.pattern || {};
    const beadWidth = Math.max(1, pattern.beadWidth || state.beadWidth);
    const beadHeight = Math.max(1, pattern.beadHeight || state.beadHeight);
    const rect = els.canvasWrap ? els.canvasWrap.getBoundingClientRect() : { width: viewWidth || 0, height: viewHeight || 0 };
    const width = Math.max(1, viewWidth || rect.width || 1);
    const height = Math.max(1, viewHeight || rect.height || 1);
    const scale = clamp(Number(state.transform.scale) || 1, minPreviewScale, previewMaxScale());

    if (scale <= minPreviewScale) {
      state.transform.scale = minPreviewScale;
      state.transform.offsetX = 0;
      state.transform.offsetY = 0;
      return state.transform;
    }

    const availableWidth = Math.max(1, width - previewPadding * 2);
    const availableHeight = Math.max(1, height - previewPadding * 2);
    const baseCellSize = Math.min(availableWidth / beadWidth, availableHeight / beadHeight);
    const patternWidth = beadWidth * baseCellSize * scale;
    const patternHeight = beadHeight * baseCellSize * scale;
    const maxOffsetX = Math.max(0, (patternWidth - availableWidth) / 2);
    const maxOffsetY = Math.max(0, (patternHeight - availableHeight) / 2);
    state.transform.scale = scale;
    state.transform.offsetX = clamp(Number(state.transform.offsetX) || 0, -maxOffsetX, maxOffsetX);
    state.transform.offsetY = clamp(Number(state.transform.offsetY) || 0, -maxOffsetY, maxOffsetY);
    return state.transform;
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
      state.contentRect = null;
      drawEmptyPreview(ctx, width, height);
      updateZoomControls();
      return;
    }

    if (state.isCropping) {
      drawCropPreview(ctx, width, height);
    } else if (state.finalCells.length) {
      drawPatternPreview(ctx, width, height);
    } else {
      drawImagePreview(ctx, width, height);
    }
    updateZoomControls();
  }

  function drawImagePreview(ctx, width, height) {
    const source = state.sourceCanvas;
    const transform = contentTransform(width, height, source.width, source.height, {
      interactive: false,
    });
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
    ctx.restore();
  }

  function drawCropPreview(ctx, width, height) {
    if (!state.originalCanvas || !state.originalSourceImageData) {
      drawEmptyPreview(ctx, width, height);
      return;
    }

    const sourceWidth = state.originalSourceImageData.width;
    const sourceHeight = state.originalSourceImageData.height;
    const layout = fitInside(sourceWidth, sourceHeight, width, height, previewPadding);
    state.contentRect = {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      scale: layout.scale,
      contentWidth: sourceWidth,
      contentHeight: sourceHeight,
    };

    if (!state.cropDraft) {
      state.cropDraft = createFullCropRect(sourceWidth, sourceHeight);
      state.crop = cropToNormalized(state.cropDraft, sourceWidth, sourceHeight);
    }

    ctx.save();
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, layout.x - 4, layout.y - 4, layout.width + 8, layout.height + 8, 8);
    ctx.fill();
    ctx.drawImage(state.originalCanvas, 0, 0, sourceWidth, sourceHeight, layout.x, layout.y, layout.width, layout.height);
    drawCropOverlay(ctx, layout, cropBounds());
    ctx.restore();
  }

  function drawPatternPreview(ctx, width, height) {
    const pattern = state.pattern || {};
    const beadWidth = pattern.beadWidth || state.beadWidth;
    const beadHeight = pattern.beadHeight || state.beadHeight;
    if (!state.finalCells.length || !beadWidth || !beadHeight) {
      drawEmptyPreview(ctx, width, height);
      return;
    }

    constrainPreviewTransform(width, height);
    const availableWidth = Math.max(1, width - previewPadding * 2);
    const availableHeight = Math.max(1, height - previewPadding * 2);
    const baseCellSize = Math.min(availableWidth / beadWidth, availableHeight / beadHeight);
    const cellSize = baseCellSize * state.transform.scale;
    const patternWidth = beadWidth * cellSize;
    const patternHeight = beadHeight * cellSize;
    const dpr = window.devicePixelRatio || 1;
    const originX = alignToDevicePixel((width - patternWidth) / 2 + state.transform.offsetX, dpr);
    const originY = alignToDevicePixel((height - patternHeight) / 2 + state.transform.offsetY, dpr);
    const visibleBounds = visibleCellBounds(originX, originY, beadWidth, beadHeight, cellSize, width, height);
    state.contentRect = {
      x: originX,
      y: originY,
      width: patternWidth,
      height: patternHeight,
      scale: cellSize,
      contentWidth: beadWidth,
      contentHeight: beadHeight,
    };

    ctx.save();
    setImageSmoothing(ctx, false);
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, originX - 4, originY - 4, patternWidth + 8, patternHeight + 8, 8);
    ctx.fill();

    if (state.isPreviewInteracting) {
      ensurePatternCache(cellSize, beadWidth, beadHeight);
    }
    if (state.isPreviewInteracting && state.patternCacheCanvas && !state.patternCacheDirty) {
      ctx.drawImage(state.patternCacheCanvas, originX, originY, patternWidth, patternHeight);
    } else {
      drawCells(ctx, state.finalCells, originX, originY, beadWidth, beadHeight, cellSize, visibleBounds);
    }

    if (state.showGrid && !state.isPreviewInteracting && cellSize >= 7) {
      drawGrid(ctx, originX, originY, beadWidth, beadHeight, cellSize, visibleBounds);
    }
    if (state.showBoard) {
      drawBoardLines(ctx, originX, originY, beadWidth, beadHeight, cellSize, state.boardWidth, state.boardHeight, visibleBounds);
    }
    if (state.showCodes && !state.isPreviewInteracting && cellSize >= previewCodeCellSize) {
      drawCodes(ctx, state.finalCells, originX, originY, beadWidth, beadHeight, cellSize, visibleBounds);
    }

    ctx.strokeStyle = "#17202a";
    ctx.lineWidth = 1;
    ctx.strokeRect(originX, originY, patternWidth, patternHeight);
    ctx.restore();
  }

  function ensurePatternCache(cellSize, beadWidth, beadHeight) {
    if (!state.finalCells.length) {
      return;
    }
    if (!state.patternCacheCanvas) {
      state.patternCacheCanvas = document.createElement("canvas");
      state.patternCacheCtx = state.patternCacheCanvas.getContext("2d");
    }
    const signature = String(state.patternVersion);
    const cacheCellSize = patternCacheCellSize(beadWidth, beadHeight, cellSize, window.devicePixelRatio || 1);
    if (
      !state.patternCacheDirty &&
      state.patternCacheSignature === signature &&
      state.patternCacheCellSize >= cacheCellSize
    ) {
      return;
    }

    const cacheWidth = beadWidth * cacheCellSize;
    const cacheHeight = beadHeight * cacheCellSize;
    state.patternCacheCanvas.width = cacheWidth;
    state.patternCacheCanvas.height = cacheHeight;
    const ctx = state.patternCacheCtx;
    setImageSmoothing(ctx, false);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cacheWidth, cacheHeight);
    drawCells(ctx, state.finalCells, 0, 0, beadWidth, beadHeight, cacheCellSize);
    state.patternCacheSignature = signature;
    state.patternCacheCellSize = cacheCellSize;
    state.patternCacheDirty = false;
  }

  function drawCells(ctx, cells, originX, originY, beadWidth, beadHeight, cellSize, bounds) {
    const range = normalizeCellBounds(bounds, beadWidth, beadHeight);
    for (let y = range.startY; y < range.endY; y += 1) {
      for (let x = range.startX; x < range.endX; x += 1) {
        const id = cells[y * beadWidth + x];
        const color = paletteById.get(id);
        if (!color) {
          continue;
        }
        ctx.fillStyle = color.hex;
        ctx.fillRect(originX + x * cellSize, originY + y * cellSize, Math.ceil(cellSize) + 0.2, Math.ceil(cellSize) + 0.2);
      }
    }
  }

  function drawGrid(ctx, originX, originY, beadWidth, beadHeight, cellSize, bounds) {
    const range = normalizeCellBounds(bounds, beadWidth, beadHeight);
    const y1 = originY + range.startY * cellSize;
    const y2 = originY + range.endY * cellSize;
    const x1 = originX + range.startX * cellSize;
    const x2 = originX + range.endX * cellSize;
    ctx.save();
    ctx.strokeStyle = "rgba(23, 32, 42, 0.18)";
    ctx.lineWidth = 0.5;
    for (let x = Math.max(1, range.startX); x <= Math.min(beadWidth - 1, range.endX); x += 1) {
      const px = originX + x * cellSize;
      ctx.beginPath();
      ctx.moveTo(px, y1);
      ctx.lineTo(px, y2);
      ctx.stroke();
    }
    for (let y = Math.max(1, range.startY); y <= Math.min(beadHeight - 1, range.endY); y += 1) {
      const py = originY + y * cellSize;
      ctx.beginPath();
      ctx.moveTo(x1, py);
      ctx.lineTo(x2, py);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoardLines(ctx, originX, originY, beadWidth, beadHeight, cellSize, boardWidth, boardHeight, bounds) {
    const stepX = clampInt(boardWidth, 8, 80);
    const stepY = clampInt(boardHeight, 8, 80);
    const range = normalizeCellBounds(bounds, beadWidth, beadHeight);
    const y1 = originY + range.startY * cellSize;
    const y2 = originY + range.endY * cellSize;
    const x1 = originX + range.startX * cellSize;
    const x2 = originX + range.endX * cellSize;
    const firstBoardX = Math.max(stepX, Math.ceil(range.startX / stepX) * stepX);
    const firstBoardY = Math.max(stepY, Math.ceil(range.startY / stepY) * stepY);
    ctx.save();
    ctx.strokeStyle = "rgba(31, 122, 140, 0.8)";
    ctx.lineWidth = Math.max(1, Math.min(3, cellSize * 0.11));
    for (let x = firstBoardX; x < beadWidth && x <= range.endX; x += stepX) {
      const px = originX + x * cellSize;
      ctx.beginPath();
      ctx.moveTo(px, y1);
      ctx.lineTo(px, y2);
      ctx.stroke();
    }
    for (let y = firstBoardY; y < beadHeight && y <= range.endY; y += stepY) {
      const py = originY + y * cellSize;
      ctx.beginPath();
      ctx.moveTo(x1, py);
      ctx.lineTo(x2, py);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCodes(ctx, cells, originX, originY, beadWidth, beadHeight, cellSize, bounds) {
    const range = normalizeCellBounds(bounds, beadWidth, beadHeight);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = Math.max(8, Math.floor(cellSize * 0.38)) + "px sans-serif";
    for (let y = range.startY; y < range.endY; y += 1) {
      for (let x = range.startX; x < range.endX; x += 1) {
        const id = cells[y * beadWidth + x];
        const color = paletteById.get(id);
        if (!color) {
          continue;
        }
        ctx.fillStyle = readableTextColor(color.rgb);
        ctx.fillText(color.code, originX + x * cellSize + cellSize / 2, originY + y * cellSize + cellSize / 2);
      }
    }
    ctx.restore();
  }

  function visibleCellBounds(originX, originY, beadWidth, beadHeight, cellSize, viewportWidth, viewportHeight) {
    const safeCellSize = Math.max(0.1, cellSize);
    const startX = Math.floor((0 - originX) / safeCellSize) - 1;
    const startY = Math.floor((0 - originY) / safeCellSize) - 1;
    const endX = Math.ceil((viewportWidth - originX) / safeCellSize) + 1;
    const endY = Math.ceil((viewportHeight - originY) / safeCellSize) + 1;
    return normalizeCellBounds({ startX, startY, endX, endY }, beadWidth, beadHeight);
  }

  function normalizeCellBounds(bounds, beadWidth, beadHeight) {
    if (!bounds) {
      return {
        startX: 0,
        startY: 0,
        endX: beadWidth,
        endY: beadHeight,
      };
    }
    const startX = clampInt(bounds.startX, 0, beadWidth);
    const startY = clampInt(bounds.startY, 0, beadHeight);
    const endX = clampInt(bounds.endX, startX, beadWidth);
    const endY = clampInt(bounds.endY, startY, beadHeight);
    return { startX, startY, endX, endY };
  }

  function contentTransform(viewWidth, viewHeight, contentWidth, contentHeight, options) {
    const padding = options && options.padding !== undefined ? options.padding : previewPadding;
    const fitScale = Math.min(
      (viewWidth - padding * 2) / contentWidth,
      (viewHeight - padding * 2) / contentHeight,
    );
    const scale = Math.max(0.01, fitScale * ((options && options.interactive) === false ? 1 : state.transform.scale));
    return {
      scale,
      offsetX: (viewWidth - contentWidth * scale) / 2 + ((options && options.interactive) === false ? 0 : state.transform.offsetX),
      offsetY: (viewHeight - contentHeight * scale) / 2 + ((options && options.interactive) === false ? 0 : state.transform.offsetY),
    };
  }

  function drawEmptyPreview(ctx, width, height) {
    const size = Math.min(width, height) * 0.26;
    const gap = size * 0.08;
    const bead = (size - gap) / 2;
    const x = (width - size) / 2;
    const y = (height - size) / 2 - 10;
    const colors = ["#1f7a8c", "#df6b3b", "#f2c14e", "#ffffff"];

    colors.forEach((color, index) => {
      const px = x + (index % 2) * (bead + gap);
      const py = y + Math.floor(index / 2) * (bead + gap);
      ctx.fillStyle = color;
      roundedRect(ctx, px, py, bead, bead, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(23, 32, 42, 0.14)";
      ctx.stroke();
    });
  }

  function drawCropOverlay(ctx, layout, cropRect) {
    const crop = sourceToCanvasRect(cropRect, layout);
    const cropRight = crop.x + crop.width;
    const cropBottom = crop.y + crop.height;
    const layoutRight = layout.x + layout.width;
    const layoutBottom = layout.y + layout.height;

    ctx.save();
    ctx.fillStyle = "rgba(23, 32, 42, 0.46)";
    ctx.fillRect(layout.x, layout.y, layout.width, Math.max(0, crop.y - layout.y));
    ctx.fillRect(layout.x, cropBottom, layout.width, Math.max(0, layoutBottom - cropBottom));
    ctx.fillRect(layout.x, crop.y, Math.max(0, crop.x - layout.x), crop.height);
    ctx.fillRect(cropRight, crop.y, Math.max(0, layoutRight - cropRight), crop.height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i += 1) {
      const x = crop.x + (crop.width * i) / 3;
      const y = crop.y + (crop.height * i) / 3;
      ctx.beginPath();
      ctx.moveTo(x, crop.y);
      ctx.lineTo(x, cropBottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(crop.x, y);
      ctx.lineTo(cropRight, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);
    ctx.strokeStyle = "#1f7a8c";
    ctx.lineWidth = 2;
    ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);
    drawCropHandles(ctx, crop);
    ctx.restore();
  }

  function drawCropHandles(ctx, crop) {
    [
      { x: crop.x, y: crop.y },
      { x: crop.x + crop.width, y: crop.y },
      { x: crop.x, y: crop.y + crop.height },
      { x: crop.x + crop.width, y: crop.y + crop.height },
    ].forEach((point) => {
      ctx.fillStyle = "#ffffff";
      roundedRect(ctx, point.x - 11, point.y - 11, 22, 22, 6);
      ctx.fill();
      ctx.strokeStyle = "#1f7a8c";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function fitInside(sourceWidth, sourceHeight, targetWidth, targetHeight, padding) {
    const availableWidth = Math.max(1, targetWidth - padding * 2);
    const availableHeight = Math.max(1, targetHeight - padding * 2);
    const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
      x: (targetWidth - width) / 2,
      y: (targetHeight - height) / 2,
      width,
      height,
      scale,
    };
  }

  function sourceToCanvasRect(rect, layout) {
    return {
      x: layout.x + rect.x * layout.scale,
      y: layout.y + rect.y * layout.scale,
      width: rect.width * layout.scale,
      height: rect.height * layout.scale,
    };
  }

  function setImageSmoothing(ctx, enabled) {
    if (!ctx) {
      return;
    }
    ctx.imageSmoothingEnabled = enabled;
    ctx.mozImageSmoothingEnabled = enabled;
    ctx.webkitImageSmoothingEnabled = enabled;
    ctx.msImageSmoothingEnabled = enabled;
  }

  function alignToDevicePixel(value, dpr) {
    const ratio = Math.max(1, dpr || 1);
    return Math.round(value * ratio) / ratio;
  }

  function patternCacheCellSize(beadWidth, beadHeight, cellSize, dpr) {
    const width = Math.max(1, beadWidth);
    const height = Math.max(1, beadHeight);
    const target = Math.max(1, Math.ceil(Math.max(1, cellSize) * Math.max(1, dpr || 1)));
    const sideLimit = Math.max(1, Math.floor(maxPatternCacheSide / Math.max(width, height)));
    const pixelLimit = Math.max(1, Math.floor(Math.sqrt(maxPatternCachePixels / (width * height))));
    return Math.max(1, Math.min(target, sideLimit, pixelLimit));
  }

  function readableTextColor(rgb) {
    const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
    return brightness > 145 ? "#17202a" : "#ffffff";
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

    const canZoom = canZoomPreview();
    state.activePointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
    if (state.activePointers.size >= 2 && canZoom) {
      event.preventDefault();
      state.isPreviewInteracting = true;
      state.interaction = createPinchInteraction();
      try {
        els.previewCanvas.setPointerCapture(event.pointerId);
      } catch (error) {
        // Some mobile browsers may reject capture for already-ended pointers.
      }
      return;
    }

    const point = pointerToContent(event);
    if (state.isCropping && point && state.activeTool === "view") {
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
      }
      return;
    }

    if (!state.isCropping && state.activeTab === "image" && point && !state.finalCells.length) {
      if (state.activeTool === "view") {
        return;
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

    if (!canZoom) {
      return;
    }

    state.isPreviewInteracting = true;
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

    if (!state.interaction && state.isCropping && state.activeTool === "view") {
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
      constrainPreviewTransform();
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
      drawPreview();
      setStatus("裁剪范围已更新");
    }
    if (wasPinch || state.isPreviewInteracting) {
      state.isPreviewInteracting = false;
      drawPreview();
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
    if (!canZoomPreview()) {
      return;
    }
    const pinch = currentPinch();
    const distanceRatio = pinch.distance / Math.max(1, state.interaction.startDistance);
    state.transform.scale = clamp(state.interaction.startScale * distanceRatio, minPreviewScale, previewMaxScale());
    state.transform.offsetX =
      state.interaction.startOffsetX + pinch.center.clientX - state.interaction.startCenter.clientX;
    state.transform.offsetY =
      state.interaction.startOffsetY + pinch.center.clientY - state.interaction.startCenter.clientY;
    constrainPreviewTransform();
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
    if (!canZoomPreview()) {
      return;
    }
    event.preventDefault();
    const rect = els.previewCanvas.getBoundingClientRect();
    const before = pointerToContent(event);
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    state.transform.scale = clamp(state.transform.scale * factor, minPreviewScale, previewMaxScale());
    constrainPreviewTransform();
    drawPreview();

    if (before && state.contentRect) {
      const afterScreenX = state.contentRect.x + before.x * state.contentRect.scale;
      const afterScreenY = state.contentRect.y + before.y * state.contentRect.scale;
      state.transform.offsetX += event.clientX - rect.left - afterScreenX;
      state.transform.offsetY += event.clientY - rect.top - afterScreenY;
      constrainPreviewTransform();
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
    if (!state.contentRect || !state.isCropping) {
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
    setExporting(true, "正在导出 PNG 图纸");
    const canvas = createPatternExportCanvas();
    canvas.toBlob((blob) => {
      if (!blob) {
        downloadUrl(canvas.toDataURL("image/png"), safeName(state.imageName || "pattern") + ".png");
        setExporting(false, "已导出 PNG 图纸，底部已包含颜色统计清单");
        return;
      }
      const url = URL.createObjectURL(blob);
      downloadUrl(url, safeName(state.imageName || "pattern") + ".png");
      setExporting(false, "已导出 PNG 图纸，底部已包含颜色统计清单");
    }, "image/png");
  }

  function openPngPreview() {
    if (!state.finalCells.length) {
      setStatus("请先生成图纸");
      return;
    }
    const previewWindow = window.open("", "_blank");
    setExporting(true, "正在生成可打开的图片");
    const canvas = createPatternExportCanvas();
    canvas.toBlob((blob) => {
      if (!blob) {
        const dataUrl = canvas.toDataURL("image/png");
        if (previewWindow) {
          previewWindow.location.href = dataUrl;
        } else {
          window.location.href = dataUrl;
        }
        setExporting(false, "已打开图片预览；iPhone 可长按图片保存或分享");
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
      setExporting(false, "已打开图片预览；iPhone 可长按图片保存或分享");
    }, "image/png");
  }

  async function exportCsv() {
    if (!state.stats.length) {
      setStatus("请先生成统计");
      return;
    }
    const rows = [["code", "name", "count", "hex"]];
    state.stats.forEach((item) => {
      rows.push([item.color.code, item.color.name, item.count, item.color.hex]);
    });
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(csv);
      } else {
        fallbackCopyText(csv);
      }
      setStatus("CSV已复制");
    } catch (error) {
      fallbackCopyText(csv);
      setStatus("CSV已复制");
    }
  }

  function printPattern() {
    if (!state.finalCells.length) {
      setStatus("请先生成图纸");
      return;
    }
    setExporting(true, "正在准备打印/PDF");
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
    setExporting(false, "已打开系统打印，可选择另存为 PDF");
  }

  function setExporting(value, statusText) {
    state.isExporting = Boolean(value);
    if (statusText) {
      setStatus(statusText);
    }
    updateUiState();
  }

  function createPatternExportCanvas() {
    const pattern = state.pattern || {};
    const beadWidth = pattern.beadWidth || state.beadWidth;
    const beadHeight = pattern.beadHeight || state.beadHeight;
    const cellSize = exportCellSize(beadWidth, beadHeight);
    const patternWidth = beadWidth * cellSize;
    const patternHeight = beadHeight * cellSize;
    const width = Math.max(patternWidth, exportMinStatsWidth);
    const statsLayout = exportStatsLayout(state.stats, width);
    const height = patternHeight + statsLayout.height;
    const patternX = Math.floor((width - patternWidth) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    setImageSmoothing(ctx, false);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    drawCells(ctx, state.finalCells, patternX, 0, beadWidth, beadHeight, cellSize);
    drawGrid(ctx, patternX, 0, beadWidth, beadHeight, cellSize);
    drawBoardLines(ctx, patternX, 0, beadWidth, beadHeight, cellSize, state.boardWidth, state.boardHeight);
    if (cellSize >= previewCodeCellSize) {
      drawCodes(ctx, state.finalCells, patternX, 0, beadWidth, beadHeight, cellSize);
    }
    ctx.strokeStyle = "#17202a";
    ctx.lineWidth = Math.max(1, cellSize * 0.06);
    ctx.strokeRect(patternX, 0, patternWidth, patternHeight);
    drawExportStats(ctx, patternHeight, width, statsLayout, beadWidth, beadHeight);
    return canvas;
  }

  function drawExportStats(ctx, top, width, layout, beadWidth, beadHeight) {
    const totalBeads = state.stats.reduce((sum, item) => sum + item.count, 0);
    if (!state.stats.length || layout.height <= 0) {
      return;
    }

    const padding = exportStatsPadding;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, top, width, layout.height);
    ctx.strokeStyle = "#d7dee8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, top + 22);
    ctx.lineTo(width - padding, top + 22);
    ctx.stroke();

    ctx.fillStyle = "#17202a";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = '700 30px Inter, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText("颜色统计清单", padding, top + 62);
    ctx.fillStyle = "#5d6b7a";
    ctx.font = '22px Inter, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif';
    ctx.fillText(
      "尺寸 " +
        beadWidth +
        " x " +
        beadHeight +
        " / 总颗数 " +
        formatNumber(totalBeads) +
        " / " +
        state.stats.length +
        " 色",
      padding + 210,
      top + 62,
    );

    ctx.font = '22px Inter, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif';
    state.stats.forEach((item, index) => {
      const column = Math.floor(index / layout.rows);
      const row = index % layout.rows;
      const x = padding + column * layout.columnWidth;
      const y = top + exportStatsHeaderHeight + row * exportStatsRowHeight;
      ctx.fillStyle = item.color.hex;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.22)";
      ctx.lineWidth = 1;
      ctx.fillRect(x, y + 7, 22, 22);
      ctx.strokeRect(x, y + 7, 22, 22);
      ctx.fillStyle = "#17202a";
      ctx.font = '700 22px Inter, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif';
      ctx.fillText(item.color.code, x + 34, y + 27);
      ctx.fillStyle = "#5d6b7a";
      ctx.font = '22px Inter, ui-sans-serif, system-ui, "Microsoft YaHei", sans-serif';
      const name = truncateText(ctx, item.color.name, Math.max(36, layout.columnWidth - 178));
      ctx.fillText(name, x + 92, y + 27);
      ctx.fillStyle = "#17202a";
      ctx.textAlign = "right";
      ctx.fillText(formatNumber(item.count), x + layout.columnWidth - 18, y + 27);
      ctx.textAlign = "left";
    });
    ctx.restore();
  }

  function exportCellSize(beadWidth, beadHeight) {
    const maxDim = Math.max(1, beadWidth, beadHeight);
    const preferred = maxDim <= 90 ? 36 : maxDim <= 140 ? 32 : maxDim <= 220 ? 28 : 24;
    const sideLimit = Math.max(16, Math.floor(exportMaxPatternSide / maxDim));
    return Math.max(16, Math.min(preferred, sideLimit));
  }

  function exportStatsLayout(stats, width) {
    const count = Array.isArray(stats) ? stats.length : 0;
    if (!count) {
      return {
        columnWidth: Math.max(1, width - exportStatsPadding * 2),
        columns: 1,
        height: 0,
        rows: 0,
      };
    }
    const availableWidth = Math.max(1, width - exportStatsPadding * 2);
    const columns = Math.max(1, Math.floor(availableWidth / exportStatsColumnMinWidth));
    const rows = Math.ceil(count / columns);
    return {
      columnWidth: availableWidth / columns,
      columns,
      height: exportStatsHeaderHeight + rows * exportStatsRowHeight + exportStatsPadding,
      rows,
    };
  }

  function truncateText(ctx, text, maxWidth) {
    if (!text || maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) {
      return text || "";
    }
    let result = String(text);
    while (result.length > 1 && ctx.measureText(result + "...").width > maxWidth) {
      result = result.slice(0, -1);
    }
    return result.length > 1 ? result + "..." : "";
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
      schemaVersion: 3,
      savedAt: new Date().toISOString(),
      imageName: state.imageName,
      imageDataUrl: (state.originalCanvas || state.sourceCanvas).toDataURL("image/png"),
      currentImageDataUrl: state.sourceCanvas.toDataURL("image/png"),
      maskDataUrl: createMaskDataUrl(),
      crop: state.crop,
      appliedCropRect: state.appliedCropRect,
      cropApplied: state.cropApplied,
      cutoutApplied: state.cutoutApplied,
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
      restoreProjectImageState(payload, () => finishRestoreProject(payload));
    };
    image.onerror = () => {
      state.isRestoringDraft = false;
      setStatus("项目中的图片无法读取");
    };
    image.src = payload.imageDataUrl;
  }

  function restoreProjectImageState(payload, done) {
    if (payload && payload.schemaVersion >= 3) {
      const original = state.originalSourceImageData;
      const full = original ? createFullCropRect(original.width, original.height) : null;
      const rect = full && payload.appliedCropRect ? normalizeCropRect(payload.appliedCropRect, full.width, full.height) : full;
      state.appliedCropRect = rect || state.appliedCropRect;
      state.cropApplied =
        payload.cropApplied === undefined && rect && full ? !isFullCropRect(rect, full.width, full.height) : Boolean(payload.cropApplied);
      state.cutoutApplied = Boolean(payload.cutoutApplied);
      state.cropDraft = null;
      state.crop = { left: 0, right: 1, top: 0, bottom: 1 };
      state.isCropping = false;

      if (payload.currentImageDataUrl) {
        loadImageDataUrl(payload.currentImageDataUrl, (imageData) => {
          if (imageData) {
            setCurrentImageData(imageData);
          } else if (rect && state.cropApplied) {
            setCurrentImageData(cropImageData(state.originalSourceImageData, rect));
          }
          done();
        });
        return;
      }

      if (rect && state.cropApplied) {
        setCurrentImageData(cropImageData(state.originalSourceImageData, rect));
      }
      done();
      return;
    }

    state.crop = normalizeCrop((payload && payload.crop) || state.crop);
    const bounds = cropBounds();
    state.cropApplied = Boolean(
      state.sourceImageData &&
        (bounds.x > 0 ||
          bounds.y > 0 ||
          bounds.width < state.sourceImageData.width ||
          bounds.height < state.sourceImageData.height),
    );
    done();
  }

  function finishRestoreProject(payload) {
    state.beadWidth = clampInt(payload.beadWidth || 48, 8, beadLimit);
    state.beadHeight = clampInt(payload.beadHeight || 48, 8, beadLimit);
    state.lockAspect = payload.lockAspect === undefined ? true : Boolean(payload.lockAspect);
    state.beadMm = numberOrDefault(payload.beadMm, 5, 2, 10);
    state.boardWidth = clampInt(payload.boardWidth || 29, 8, 80);
    state.boardHeight = clampInt(payload.boardHeight || 29, 8, 80);
    state.alphaThreshold = clampInt(payload.alphaThreshold || 20, 0, 255);
    state.contrast = clampInt(payload.contrast || 0, -50, 100);
    state.saturation = clampInt(payload.saturation || 0, -50, 100);
    state.tolerance = clampInt(payload.tolerance || 54, 0, 160);
    state.brushSize = clampInt(payload.brushSize || 24, 4, 80);
    state.samplingMode = validOption(payload.samplingMode, ["shape", "balanced", "smooth"], "balanced");
    state.cropAspect = validOption(payload.cropAspect, ["free", "original", "1:1", "4:3", "3:4", "16:9", "9:16"], "free");
    state.coverageThreshold = clampInt(payload.coverageThreshold || 12, 5, 70);
    state.edgeBoost = clampInt(payload.edgeBoost || 35, 0, 100);
    state.maxColors = clampInt(payload.maxColors || 24, 2, palette.length);
    state.dither = payload.dither || "none";
    state.disabledColors = sanitizeDisabledColors(payload.disabledColors || []);
    state.replacementMap = sanitizeReplacementMap(payload.replacementMap || []);
    state.border = normalizeBorderConfig(payload.border || defaultBorderConfig(), paletteById);
    state.showGrid = payload.showGrid === undefined ? true : Boolean(payload.showGrid);
    state.showBoard = payload.showBoard === undefined ? true : Boolean(payload.showBoard);
    state.showCodes = payload.showCodes === undefined ? true : Boolean(payload.showCodes);
    state.replaceExpanded.clear();
    state.replaceShowAll.clear();
    state.transform = { scale: 1, offsetX: 0, offsetY: 0 };
    syncFormFromState();

    const complete = () => {
      recomputePattern();
      renderAll();
      state.isRestoringDraft = false;
      scheduleDraftSave();
      setStatus("项目已载入");
    };

    if (payload.maskDataUrl) {
      loadMaskDataUrl(payload.maskDataUrl, complete);
    } else {
      complete();
    }
  }

  function loadImageDataUrl(dataUrl, done) {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, image.naturalWidth || image.width || 1);
      canvas.height = Math.max(1, image.naturalHeight || image.height || 1);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      done(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.onerror = () => done(null);
    image.src = dataUrl;
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
    els.maxColorsValue.value = String(state.maxColors);
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
    syncPreviewOptionChips();
    syncTogglePills();
    syncOptionSegments();
    updateZoomControls();
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
      setDraftButtonsState(Boolean(payload), payload && payload.savedAt ? "上次草稿：" + payload.savedAt : "暂无本机草稿");
    } catch (error) {
      setDraftButtonsState(false, "当前浏览器无法读取草稿");
    }
  }

  function setDraftButtonsState(hasDraft, title) {
    [els.restoreDraftButton, els.restoreDraftButtonStart, els.restoreDraftButtonPanel].forEach((button) => {
      if (!button) {
        return;
      }
      button.disabled = !hasDraft;
      button.title = title;
    });
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

  function setCurrentImageData(imageData) {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
      return;
    }
    state.sourceImageData = imageData;
    state.sourceCanvas = imageDataToCanvas(imageData);
    state.mask = new Uint8ClampedArray(imageData.width * imageData.height);
    initializeMaskFromAlpha();
    state.maskHistory = [];
    state.maskVersion += 1;
    state.maskedCanvas = null;
    state.maskedVersion = -1;
  }

  function imageDataToCanvas(imageData) {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.putImageData(new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height), 0, 0);
    return canvas;
  }

  function sourceAspect() {
    if (!state.sourceImageData || !state.sourceImageData.width || !state.sourceImageData.height) {
      return 1;
    }
    return state.sourceImageData.height / state.sourceImageData.width;
  }

  function cropCoordinateSize() {
    if (state.isCropping && state.originalSourceImageData) {
      return {
        width: state.originalSourceImageData.width,
        height: state.originalSourceImageData.height,
      };
    }
    if (state.sourceImageData) {
      return {
        width: state.sourceImageData.width,
        height: state.sourceImageData.height,
      };
    }
    return { width: 0, height: 0 };
  }

  function createFullCropRect(width, height) {
    return {
      x: 0,
      y: 0,
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }

  function cropToNormalized(rect, sourceWidth, sourceHeight) {
    const normalized = normalizeCropRect(rect, sourceWidth, sourceHeight);
    return {
      left: normalized.x / sourceWidth,
      right: (normalized.x + normalized.width) / sourceWidth,
      top: normalized.y / sourceHeight,
      bottom: (normalized.y + normalized.height) / sourceHeight,
    };
  }

  function normalizeCropRect(rect, sourceWidth, sourceHeight) {
    let x = Number(rect && rect.x) || 0;
    let y = Number(rect && rect.y) || 0;
    let width = Number(rect && rect.width) || sourceWidth;
    let height = Number(rect && rect.height) || sourceHeight;

    if (width < 0) {
      x += width;
      width = Math.abs(width);
    }
    if (height < 0) {
      y += height;
      height = Math.abs(height);
    }

    width = clamp(width, minCropSide, sourceWidth);
    height = clamp(height, minCropSide, sourceHeight);
    x = clamp(x, 0, Math.max(0, sourceWidth - width));
    y = clamp(y, 0, Math.max(0, sourceHeight - height));
    return { x, y, width, height };
  }

  function isFullCropRect(rect, width, height) {
    return rect.x <= 0.5 && rect.y <= 0.5 && Math.abs(rect.width - width) <= 1 && Math.abs(rect.height - height) <= 1;
  }

  function cropImageData(imageData, rect) {
    if (!imageData || !imageData.data) {
      return null;
    }
    const normalized = normalizeCropRect(rect || createFullCropRect(imageData.width, imageData.height), imageData.width, imageData.height);
    const left = clampInt(Math.floor(normalized.x), 0, imageData.width - 1);
    const top = clampInt(Math.floor(normalized.y), 0, imageData.height - 1);
    const right = clampInt(Math.ceil(normalized.x + normalized.width), left + 1, imageData.width);
    const bottom = clampInt(Math.ceil(normalized.y + normalized.height), top + 1, imageData.height);
    const width = right - left;
    const height = bottom - top;
    if (width < 1 || height < 1) {
      return null;
    }

    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const sourceStart = ((top + y) * imageData.width + left) * 4;
      const targetStart = y * width * 4;
      for (let i = 0; i < width * 4; i += 1) {
        data[targetStart + i] = imageData.data[sourceStart + i];
      }
    }
    return { data, width, height };
  }

  function currentCropImageData() {
    if (!state.originalSourceImageData) {
      return null;
    }
    const full = createFullCropRect(state.originalSourceImageData.width, state.originalSourceImageData.height);
    const rect = state.appliedCropRect ? normalizeCropRect(state.appliedCropRect, full.width, full.height) : full;
    return isFullCropRect(rect, full.width, full.height) ? state.originalSourceImageData : cropImageData(state.originalSourceImageData, rect);
  }

  function removeEdgeBackground(imageData, tolerance, alphaThreshold) {
    if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
      return null;
    }

    const width = imageData.width;
    const height = imageData.height;
    const source = imageData.data;
    const data = new Uint8ClampedArray(source);
    const alphaLimit = clampInt(alphaThreshold, 0, 255, 20);
    const colorTolerance = clampInt(tolerance, 0, 160, 54);
    const background = estimateEdgeBackground(source, width, height, alphaLimit);
    if (!background) {
      return {
        imageData: { data, width, height },
        changed: 0,
      };
    }

    const visited = new Uint8Array(width * height);
    const queue = [];
    const enqueue = (index) => {
      if (visited[index] || !edgeBackgroundMatch(data, index, background, colorTolerance, alphaLimit)) {
        return;
      }
      visited[index] = 1;
      queue.push(index);
    };

    for (let x = 0; x < width; x += 1) {
      enqueue(x);
      enqueue((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
      enqueue(y * width);
      enqueue(y * width + width - 1);
    }

    let changed = 0;
    while (queue.length) {
      const index = queue.pop();
      const i = index * 4;
      if (data[i + 3] !== 0) {
        data[i + 3] = 0;
        changed += 1;
      }

      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) {
        enqueue(index - 1);
      }
      if (x < width - 1) {
        enqueue(index + 1);
      }
      if (y > 0) {
        enqueue(index - width);
      }
      if (y < height - 1) {
        enqueue(index + width);
      }
    }

    return {
      imageData: { data, width, height },
      changed,
    };
  }

  function estimateEdgeBackground(data, width, height, alphaThreshold) {
    const buckets = {};
    const add = (x, y, weight) => {
      const i = (y * width + x) * 4;
      if ((data[i + 3] || 0) <= alphaThreshold) {
        return;
      }
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = [Math.round(r / 24), Math.round(g / 24), Math.round(b / 24)].join(":");
      const bucket = buckets[key] || { r: 0, g: 0, b: 0, weight: 0 };
      bucket.r += r * weight;
      bucket.g += g * weight;
      bucket.b += b * weight;
      bucket.weight += weight;
      buckets[key] = bucket;
    };

    for (let x = 0; x < width; x += 1) {
      add(x, 0, 1);
      add(x, height - 1, 1);
    }
    for (let y = 1; y < height - 1; y += 1) {
      add(0, y, 1);
      add(width - 1, y, 1);
    }

    add(0, 0, 8);
    add(width - 1, 0, 8);
    add(0, height - 1, 8);
    add(width - 1, height - 1, 8);

    const dominant = Object.keys(buckets)
      .map((key) => buckets[key])
      .sort((a, b) => b.weight - a.weight)[0];
    if (!dominant || !dominant.weight) {
      return null;
    }
    return {
      r: dominant.r / dominant.weight,
      g: dominant.g / dominant.weight,
      b: dominant.b / dominant.weight,
    };
  }

  function edgeBackgroundMatch(data, index, background, tolerance, alphaThreshold) {
    const i = index * 4;
    if ((data[i + 3] || 0) <= alphaThreshold) {
      return true;
    }
    const dr = data[i] - background.r;
    const dg = data[i + 1] - background.g;
    const db = data[i + 2] - background.b;
    return dr * dr + dg * dg + db * db <= tolerance * tolerance;
  }

  function cropBounds() {
    const size = cropCoordinateSize();
    const width = size.width || 1;
    const height = size.height || 1;
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
      optimize: "优化工具：调整对比度、像素策略、抖动和纯色锁边",
      palette: "色表工具：调整颜色数量、预览显示和缺色处理",
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

