(function () {
  "use strict";

  const STORAGE_KEY = "mini-flask-sort-solver-input-v2";
  const DEFAULT_TUBE_COUNT = 6;
  const SLOT_COUNT = 4;

  const paletteColors = [];
  let sourceImage = null;
  let imageObjectUrl = "";

  const state = {
    selectedColor: "",
    tubes: Array.from({ length: DEFAULT_TUBE_COUNT }, () => ["", "", "", ""]),
    solution: null,
    stepIndex: 0,
    pickedColor: "",
    sampleMode: true,
    meshQuads: [],
    meshStageCounts: [6, 5],
  };
  const dragState = {
    active: false,
    moved: false,
    lastX: 0,
    lastY: 0,
    pointerX: 0,
    pointerY: 0,
    suppressClick: false,
    row: 0,
    mode: "move",
    corner: "",
  };

  const els = {
    board: document.getElementById("tubeBoard"),
    template: document.getElementById("tubeTemplate"),
    emptyTubeCount: document.getElementById("emptyTubeCount"),
    miniTubeLimit: document.getElementById("miniTubeLimit"),
    meshStageControls: document.getElementById("meshStageControls"),
    addMeshStageButton: document.getElementById("addMeshStageButton"),
    removeMeshStageButton: document.getElementById("removeMeshStageButton"),
    solveButton: document.getElementById("solveButton"),
    clearButton: document.getElementById("clearButton"),
    addTubeButton: document.getElementById("addTubeButton"),
    removeTubeButton: document.getElementById("removeTubeButton"),
    solverStatus: document.getElementById("solverStatus"),
    solutionSummary: document.getElementById("solutionSummary"),
    solutionSteps: document.getElementById("solutionSteps"),
    previewBoard: document.getElementById("previewBoard"),
    previewTapZone: document.getElementById("previewTapZone"),
    moveBanner: document.getElementById("moveBanner"),
    prevStepButton: document.getElementById("prevStepButton"),
    nextStepButton: document.getElementById("nextStepButton"),
    toggleStepsButton: document.getElementById("toggleStepsButton"),
    imageInput: document.getElementById("imageInput"),
    pasteImageButton: document.getElementById("pasteImageButton"),
    imageCanvas: document.getElementById("imageCanvas"),
    imageHint: document.getElementById("imageHint"),
    readMeshButton: document.getElementById("readMeshButton"),
    pickedColorChip: document.getElementById("pickedColorChip"),
    inputPickedColorChip: document.getElementById("inputPickedColorChip"),
  };

  const ctx = els.imageCanvas.getContext("2d", { willReadFrequently: true });

  function colorName(color) {
    return color ? color.toUpperCase() : "";
  }

  function normalizeColor(color) {
    return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "";
  }

  function addPaletteColor(color) {
    const normalized = normalizeColor(color);
    if (!normalized) {
      return "";
    }
    if (!paletteColors.includes(normalized)) {
      paletteColors.push(normalized);
    }
    if (!state.selectedColor) {
      state.selectedColor = normalized;
    }
    return normalized;
  }

  function rebuildPaletteFromTubes() {
    for (const tube of state.tubes) {
      for (const color of tube) {
        addPaletteColor(color);
      }
    }
    if (state.selectedColor) {
      addPaletteColor(state.selectedColor);
    }
  }

  function saveInputState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          tubes: state.tubes,
          selectedColor: state.selectedColor,
          emptyTubeCount: els.emptyTubeCount.value,
          miniTubeLimit: els.miniTubeLimit.value,
          meshStageCounts: state.meshStageCounts,
          meshQuads: state.meshQuads,
        })
      );
    } catch (error) {
      console.warn("Could not save input state.", error);
    }
  }

  function restoreInputState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("mini-flask-sort-solver-input-v1");
      if (!raw) {
        return;
      }
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.tubes)) {
        state.tubes = saved.tubes.map((tube) => {
          const next = Array.isArray(tube) ? tube.map(normalizeColor).slice(0, SLOT_COUNT) : [];
          while (next.length < SLOT_COUNT) {
            next.push("");
          }
          return next;
        });
      }
      state.selectedColor = normalizeColor(saved.selectedColor);
      rebuildPaletteFromTubes();
      if (state.selectedColor && !paletteColors.includes(state.selectedColor)) {
        state.selectedColor = paletteColors[0] || "";
      }
      if (saved.emptyTubeCount !== undefined) {
        els.emptyTubeCount.value = saved.emptyTubeCount;
      }
      if (saved.miniTubeLimit !== undefined) {
        els.miniTubeLimit.value = saved.miniTubeLimit;
      }
      if (Array.isArray(saved.meshStageCounts)) {
        state.meshStageCounts = saved.meshStageCounts
          .map((value) => Math.max(0, Math.min(6, Math.round(Number(value)))))
          .slice(0, 8);
      } else if (saved.meshGroupSizes !== undefined) {
        state.meshStageCounts = parseStageCounts(saved.meshGroupSizes);
      } else if (saved.meshColumns !== undefined && saved.meshRows !== undefined) {
        const count = Math.max(1, Math.min(12, Number(saved.meshColumns || 6)));
        const groups = Math.max(1, Math.min(8, Number(saved.meshRows || 1)));
        state.meshStageCounts = Array.from({ length: groups }, () => Math.min(6, count));
      }
      if (!state.meshStageCounts.length) {
        state.meshStageCounts = [6, 5];
      }
      if (Array.isArray(saved.meshQuads)) {
        state.meshQuads = saved.meshQuads.map(normalizeQuad).filter(Boolean);
      }
      if (state.selectedColor) {
        state.pickedColor = state.selectedColor;
      }
    } catch (error) {
      console.warn("Could not restore input state.", error);
    }
  }

  function clearSolution() {
    state.solution = null;
    state.stepIndex = 0;
    els.solutionSummary.textContent = "";
    setStatus("未実行", "");
  }

  function renderTubes(container, tubes, capacities, interactive, move) {
    container.innerHTML = "";
    const columnCount = 6;
    tubes.forEach((tube, tubeIndex) => {
      const card = els.template.content.firstElementChild.cloneNode(true);
      const rowStart = Math.floor(tubeIndex / columnCount) * columnCount;
      const rowItems = Math.min(columnCount, tubes.length - rowStart);
      const rowOffset = Math.floor((columnCount - rowItems) / 2);
      card.style.gridColumn = `${(tubeIndex % columnCount) + rowOffset + 1}`;
      card.style.gridRow = `${Math.floor(tubeIndex / columnCount) + 1}`;
      const capacity = capacities[tubeIndex];
      card.querySelector(".tube-name").textContent = `${tubeIndex + 1}`;
      if (move && move.from === tubeIndex) {
        card.classList.add("move-from");
        card.dataset.arrow = "OUT ↑";
      }
      if (move && move.to === tubeIndex) {
        card.classList.add("move-to");
        card.dataset.arrow = "IN ↓";
      }
      const tubeEl = card.querySelector(".tube");
      if (capacity === 1) {
        tubeEl.classList.add("mini");
      }
      tubeEl.style.gridTemplateRows = `repeat(${capacity}, ${interactive ? 28 : 22}px)`;
      for (let slotIndex = capacity - 1; slotIndex >= 0; slotIndex -= 1) {
        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = "slot";
        const color = tube[slotIndex] || "";
        if (color) {
          slot.classList.add("filled");
          slot.style.background = color;
          slot.title = colorName(color);
        }
        if (
          move &&
          tubeIndex === move.to &&
          slotIndex >= tube.length - move.amount &&
          slotIndex < tube.length
        ) {
          slot.classList.add("moved-slot");
        }
        if (interactive) {
          slot.addEventListener("click", () => {
            if (!state.selectedColor) {
              return;
            }
            if (state.tubes[tubeIndex][slotIndex] === state.selectedColor) {
              state.tubes[tubeIndex][slotIndex] = "";
            } else {
              state.tubes[tubeIndex][slotIndex] = state.selectedColor;
            }
            clearSolution();
            saveInputState();
            render();
          });
          slot.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            state.tubes[tubeIndex][slotIndex] = "";
            clearSolution();
            saveInputState();
            render();
          });
        } else {
          slot.disabled = true;
        }
        tubeEl.appendChild(slot);
      }
      container.appendChild(card);
    });
  }

  function compactInputTubes() {
    return state.tubes.map((tube) => tube.filter(Boolean));
  }

  function renderSolution() {
    els.solutionSteps.innerHTML = "";
    els.moveBanner.textContent = "";
    if (!state.solution || !state.solution.ok) {
      els.previewBoard.innerHTML = "";
      els.prevStepButton.disabled = true;
      els.nextStepButton.disabled = true;
      return;
    }

    const solution = state.solution;
    state.stepIndex = Math.max(0, Math.min(state.stepIndex, solution.states.length - 1));
    const currentMove = state.stepIndex > 0 ? solution.moves[state.stepIndex - 1] : null;
    renderTubes(els.previewBoard, solution.states[state.stepIndex], solution.capacities, false, currentMove);
    els.prevStepButton.disabled = state.stepIndex === 0;
    els.nextStepButton.disabled = state.stepIndex === solution.states.length - 1;
    if (currentMove) {
      els.moveBanner.textContent = `${state.stepIndex}手目: ${currentMove.from + 1} → ${currentMove.to + 1}`;
    }

    solution.moves.forEach((move, index) => {
      const item = document.createElement("li");
      item.textContent = `${move.from + 1} → ${move.to + 1} (${move.amount}マス)`;
      if (index + 1 === state.stepIndex) {
        item.classList.add("current");
      }
      els.solutionSteps.appendChild(item);
    });
  }

  function goPreviousStep() {
    if (!state.solution || !state.solution.ok || state.stepIndex <= 0) {
      return;
    }
    state.stepIndex -= 1;
    renderSolution();
  }

  function goNextStep() {
    if (!state.solution || !state.solution.ok || state.stepIndex >= state.solution.states.length - 1) {
      return;
    }
    state.stepIndex += 1;
    renderSolution();
  }

  function render() {
    renderTubes(els.board, state.tubes, Array.from({ length: state.tubes.length }, () => SLOT_COUNT), true, null);
    renderSolution();
  }

  function renderPickedColorChip() {
    const chips = [els.pickedColorChip, els.inputPickedColorChip];
    if (state.pickedColor) {
      for (const chip of chips) {
        chip.style.background = state.pickedColor;
        chip.title = colorName(state.pickedColor);
      }
    } else {
      for (const chip of chips) {
        chip.style.background = "";
        chip.title = "";
      }
    }
  }

  function setStatus(text, tone) {
    els.solverStatus.textContent = text;
    els.solverStatus.style.color = tone === "error" ? "#b23a48" : "";
  }

  function solve() {
    saveInputState();
    setStatus("探索中", "");
    els.solutionSummary.textContent = "";
    state.stepIndex = 0;

    setTimeout(() => {
      const result = window.WaterSortSolver.solveWaterSort(compactInputTubes(), {
        emptyTubeCount: Number(els.emptyTubeCount.value || 0),
        miniTubeLimit: Number(els.miniTubeLimit.value || 0),
        searchLimit: 200000,
      });
      state.solution = result;
      if (result.ok) {
        const miniText =
          result.miniCount === 0
            ? "追加小瓶なし"
            : `追加小瓶 ${result.miniCount} 本（各1マス）`;
        setStatus("解けました", "");
        els.solutionSummary.textContent = `${result.moves.length}手。${miniText}。探索 ${result.explored.toLocaleString()} 状態。`;
      } else {
        setStatus("未解決", "error");
        els.solutionSummary.textContent = result.error || "解が見つかりませんでした。";
      }
      render();
      els.previewTapZone.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 20);
  }

  function clearBoard() {
    state.tubes = Array.from({ length: DEFAULT_TUBE_COUNT }, () => ["", "", "", ""]);
    paletteColors.length = 0;
    state.selectedColor = "";
    state.pickedColor = "";
    renderPickedColorChip();
    clearSolution();
    saveInputState();
    render();
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function hexToRgb(color) {
    return {
      r: parseInt(color.slice(1, 3), 16),
      g: parseInt(color.slice(3, 5), 16),
      b: parseInt(color.slice(5, 7), 16),
    };
  }

  function rgbToHsl(r, g, b) {
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === nr) {
        h = (ng - nb) / d + (ng < nb ? 6 : 0);
      } else if (max === ng) {
        h = (nb - nr) / d + 2;
      } else {
        h = (nr - ng) / d + 4;
      }
      h *= 60;
    }
    return { h, s, l };
  }

  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    };
  }

  function hexToHsl(color) {
    const rgb = hexToRgb(color);
    return rgbToHsl(rgb.r, rgb.g, rgb.b);
  }

  function hueDistance(a, b) {
    const diff = Math.abs(a - b);
    return Math.min(diff, 360 - diff);
  }

  function colorDistance(a, b) {
    const ah = hexToHsl(a);
    const bh = hexToHsl(b);
    const hueWeight = Math.max(0.35, Math.min(1, (ah.s + bh.s) / 2));
    return (
      hueDistance(ah.h, bh.h) * hueWeight +
      Math.abs(ah.s - bh.s) * 62 +
      Math.abs(ah.l - bh.l) * 95
    );
  }

  function nearestPaletteColor(color) {
    let nearest = "";
    let nearestDistance = Infinity;
    for (const existing of paletteColors) {
      const distance = colorDistance(color, existing);
      if (distance < nearestDistance) {
        nearest = existing;
        nearestDistance = distance;
      }
    }
    return nearestDistance <= 7 ? nearest : addPaletteColor(color);
  }

  function drawSourceImageOnly() {
    ctx.clearRect(0, 0, els.imageCanvas.width, els.imageCanvas.height);
    if (sourceImage) {
      ctx.drawImage(sourceImage, 0, 0, els.imageCanvas.width, els.imageCanvas.height);
    }
  }

  function polishColor(color) {
    const rgb = hexToRgb(color);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    if (hsl.s < 0.18) {
      return color;
    }
    const targetMinLightness = hsl.l < 0.38 ? 0.28 : 0.42;
    const polished = hslToRgb(
      hsl.h,
      Math.min(0.9, Math.max(0.42, hsl.s * 1.08)),
      Math.min(0.66, Math.max(targetMinLightness, hsl.l))
    );
    return rgbToHex(polished.r, polished.g, polished.b);
  }

  function readAverageColor(x, y, size = 15) {
    const half = Math.floor(size / 2);
    const startX = Math.max(0, Math.min(els.imageCanvas.width - size, x - half));
    const startY = Math.max(0, Math.min(els.imageCanvas.height - size, y - half));
    const data = ctx.getImageData(startX, startY, size, size).data;
    const clusters = new Map();
    const fallback = [];
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const hsl = rgbToHsl(r, g, b);
      const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      if (hsl.l < 0.08 || (hsl.l > 0.92 && hsl.s < 0.32) || (hsl.s < 0.1 && chroma < 0.09)) {
        continue;
      }
      const sample = {
        r,
        g,
        b,
        h: hsl.h,
        s: hsl.s,
        l: hsl.l,
        chroma,
      };
      fallback.push(sample);
      const hueBin = Math.round(hsl.h / 12);
      const lightBin = Math.floor(hsl.l * 8);
      const satBin = Math.floor(hsl.s * 5);
      const key = `${hueBin}:${lightBin}:${satBin}`;
      const cluster =
        clusters.get(key) ||
        {
          count: 0,
          weight: 0,
          r: 0,
          g: 0,
          b: 0,
          h: 0,
          s: 0,
          l: 0,
        };
      const weight = 0.75 + hsl.s * 0.85 + chroma * 0.7;
      cluster.count += 1;
      cluster.weight += weight;
      cluster.r += r * weight;
      cluster.g += g * weight;
      cluster.b += b * weight;
      cluster.h += hsl.h * weight;
      cluster.s += hsl.s * weight;
      cluster.l += hsl.l * weight;
      clusters.set(key, cluster);
    }
    if (!fallback.length) {
      return rgbToHex(data[0], data[1], data[2]);
    }
    let best = null;
    let bestScore = -Infinity;
    for (const cluster of clusters.values()) {
      const avgS = cluster.s / cluster.weight;
      const avgL = cluster.l / cluster.weight;
      const score =
        cluster.count * 1.8 +
        cluster.weight * 0.9 +
        avgS * 8 -
        Math.max(0, avgL - 0.82) * 14;
      if (score > bestScore) {
        best = cluster;
        bestScore = score;
      }
    }
    if (!best) {
      const item = fallback[Math.floor(fallback.length / 2)];
      return polishColor(rgbToHex(item.r, item.g, item.b));
    }
    return polishColor(rgbToHex(
      Math.round(best.r / best.weight),
      Math.round(best.g / best.weight),
      Math.round(best.b / best.weight)
    ));
  }

  function findReadablePoint(x, y, radius = 5) {
    let best = { x, y, score: -Infinity };
    const minX = Math.max(0, x - radius);
    const maxX = Math.min(els.imageCanvas.width - 1, x + radius);
    const minY = Math.max(0, y - radius);
    const maxY = Math.min(els.imageCanvas.height - 1, y + radius);
    const data = ctx.getImageData(minX, minY, maxX - minX + 1, maxY - minY + 1).data;
    const width = maxX - minX + 1;
    for (let yy = minY; yy <= maxY; yy += 1) {
      for (let xx = minX; xx <= maxX; xx += 1) {
        const index = ((yy - minY) * width + (xx - minX)) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const hsl = rgbToHsl(r, g, b);
        const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        if (hsl.l < 0.08 || hsl.l > 0.92 || hsl.s < 0.12) {
          continue;
        }
        const centerPenalty = Math.hypot(xx - x, yy - y) * 0.035;
        const score = hsl.s * 1.6 + chroma * 1.4 - centerPenalty - Math.abs(hsl.l - 0.48) * 0.16;
        if (score > best.score) {
          best = { x: xx, y: yy, score };
        }
      }
    }
    return best;
  }

  function parseStageCounts(value) {
    const raw = String(value || "6,5")
      .split(/[,\s、]+/)
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
    const counts = raw.length ? raw : [6, 5];
    return counts.map((item) => Math.max(0, Math.min(6, Math.round(item)))).slice(0, 8);
  }

  function renderMeshStageControls() {
    els.meshStageControls.innerHTML = "";
    state.meshStageCounts.forEach((count, index) => {
      const label = document.createElement("label");
      label.className = "stage-count-control";
      label.textContent = `${index + 1}段目`;
      const select = document.createElement("select");
      for (let value = 0; value <= 6; value += 1) {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = `${value}個`;
        option.selected = value === count;
        select.appendChild(option);
      }
      select.addEventListener("change", () => {
        state.meshStageCounts[index] = Number(select.value);
        ensureMeshQuads();
        saveInputState();
        drawImageAndMesh();
      });
      label.appendChild(select);
      els.meshStageControls.appendChild(label);
    });
    els.removeMeshStageButton.disabled = state.meshStageCounts.length <= 1;
    els.addMeshStageButton.disabled = state.meshStageCounts.length >= 8;
  }

  function getMeshGroups() {
    const groups = state.meshStageCounts
      .map((value) => Math.max(0, Math.min(6, Math.round(Number(value)))))
      .slice(0, 8);
    return groups.length ? groups : [6, 5];
  }

  function normalizeQuad(quad) {
    if (!quad || typeof quad !== "object") {
      return null;
    }
    const next = {};
    for (const key of ["tl", "tr", "br", "bl"]) {
      const point = quad[key];
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return null;
      }
      next[key] = { x: point.x, y: point.y };
    }
    return next;
  }

  function createDefaultMeshQuad(row, rows) {
    const width = els.imageCanvas.width;
    const height = els.imageCanvas.height;
    const marginX = width * 0.09;
    const marginY = height * 0.12;
    const usableH = height - marginY * 2;
    const rowTop = marginY + (usableH / Math.max(1, rows)) * row;
    const rowBottom = marginY + (usableH / Math.max(1, rows)) * (row + 0.72);
    return {
      tl: { x: marginX, y: rowTop },
      tr: { x: width - marginX, y: rowTop },
      br: { x: width - marginX, y: rowBottom },
      bl: { x: marginX, y: rowBottom },
    };
  }

  function ensureMeshQuads() {
    const rows = getMeshGroups().length;
    while (state.meshQuads.length < rows) {
      state.meshQuads.push(createDefaultMeshQuad(state.meshQuads.length, rows));
    }
    if (state.meshQuads.length > rows) {
      state.meshQuads.length = rows;
    }
    state.meshQuads = state.meshQuads.map((quad, index) => normalizeQuad(quad) || createDefaultMeshQuad(index, rows));
    for (let row = 0; row < rows; row += 1) {
      clampMeshQuad(row);
    }
  }

  function interpolatePoint(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
  }

  function getPointInQuad(quad, u, v) {
    const top = interpolatePoint(quad.tl, quad.tr, u);
    const bottom = interpolatePoint(quad.bl, quad.br, u);
    return interpolatePoint(top, bottom, v);
  }

  function getMeshPoints() {
    const groups = getMeshGroups();
    ensureMeshQuads();
    const points = [];

    for (let row = 0; row < groups.length; row += 1) {
      const columns = groups[row];
      const quad = state.meshQuads[row];
      for (let col = 0; col < columns; col += 1) {
        const u = columns <= 1 ? 0.5 : col / (columns - 1);
        const tube = [];
        for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
          const v = SLOT_COUNT <= 1 ? 0.5 : (SLOT_COUNT - 1 - slot) / (SLOT_COUNT - 1);
          tube.push({ ...getPointInQuad(quad, u, v), row, col, slot });
        }
        points.push(tube);
      }
    }
    return points;
  }

  function getQuadPoints(row) {
    const quad = state.meshQuads[row];
    return quad ? [quad.tl, quad.tr, quad.br, quad.bl] : [];
  }

  function getQuadCenter(row) {
    const points = getQuadPoints(row);
    return {
      x: points.reduce((sum, item) => sum + item.x, 0) / points.length,
      y: points.reduce((sum, item) => sum + item.y, 0) / points.length,
    };
  }

  function isPointInsideQuad(point, row) {
    const points = getQuadPoints(row);
    if (points.length !== 4) {
      return false;
    }
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const pi = points[i];
      const pj = points[j];
      const intersects =
        pi.y > point.y !== pj.y > point.y &&
        point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y || 0.0001) + pi.x;
      if (intersects) {
        inside = !inside;
      }
    }
    return inside;
  }

  function getMeshDragTarget(point) {
    ensureMeshQuads();
    const corners = ["tl", "tr", "br", "bl"];
    let nearest = { row: 0, corner: "", distance: Infinity };
    for (let row = 0; row < state.meshQuads.length; row += 1) {
      for (const corner of corners) {
        const cornerPoint = state.meshQuads[row][corner];
        const distance = Math.hypot(point.x - cornerPoint.x, point.y - cornerPoint.y);
        if (distance < nearest.distance) {
          nearest = { row, corner, distance };
        }
      }
    }
    if (nearest.distance <= 26) {
      return { mode: "corner", row: nearest.row, corner: nearest.corner };
    }

    for (let row = 0; row < state.meshQuads.length; row += 1) {
      if (isPointInsideQuad(point, row)) {
        return { mode: "move", row, corner: "" };
      }
    }

    let nearestRow = 0;
    let nearestDistance = Infinity;
    for (let row = 0; row < state.meshQuads.length; row += 1) {
      const center = getQuadCenter(row);
      const distance = Math.hypot(point.x - center.x, point.y - center.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestRow = row;
      }
    }
    return { mode: "move", row: nearestRow, corner: "" };
  }

  function moveMeshQuad(row, dx, dy) {
    const quad = state.meshQuads[row];
    if (!quad) {
      return;
    }
    for (const key of ["tl", "tr", "br", "bl"]) {
      quad[key].x += dx;
      quad[key].y += dy;
    }
    clampMeshQuad(row);
  }

  function moveMeshCorner(row, corner, dx, dy) {
    const quad = state.meshQuads[row];
    if (!quad || !quad[corner]) {
      return;
    }
    quad[corner].x += dx;
    quad[corner].y += dy;
    clampPointToCanvas(quad[corner]);
  }

  function clampPointToCanvas(point) {
    const margin = 12;
    point.x = Math.max(margin, Math.min(els.imageCanvas.width - margin, point.x));
    point.y = Math.max(margin, Math.min(els.imageCanvas.height - margin, point.y));
  }

  function clampMeshQuad(row) {
    const quad = state.meshQuads[row];
    if (!quad) {
      return;
    }
    const margin = 12;
    const points = getQuadPoints(row);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const canvasWidth = els.imageCanvas.width;
    const canvasHeight = els.imageCanvas.height;
    let dx = 0;
    let dy = 0;

    if (minX < margin) {
      dx = margin - minX;
    } else if (maxX > canvasWidth - margin) {
      dx = canvasWidth - margin - maxX;
    }
    if (minY < margin) {
      dy = margin - minY;
    } else if (maxY > canvasHeight - margin) {
      dy = canvasHeight - margin - maxY;
    }
    if (dx || dy) {
      for (const point of points) {
        point.x += dx;
        point.y += dy;
      }
    }
  }

  function drawImageAndMesh() {
    ctx.clearRect(0, 0, els.imageCanvas.width, els.imageCanvas.height);
    if (sourceImage) {
      ctx.drawImage(sourceImage, 0, 0, els.imageCanvas.width, els.imageCanvas.height);
    }
    const points = getMeshPoints();
    ctx.save();
    const groups = getMeshGroups();
    for (let row = 0; row < groups.length; row += 1) {
      const rowTubes = points.filter((tube) => tube[0] && tube[0].row === row);
      if (!rowTubes.length) {
        continue;
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(0, 0, 0, 0.78)";
      ctx.shadowBlur = 5;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.lineWidth = 2.5;

      for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
        ctx.beginPath();
        rowTubes.forEach((tube, index) => {
          const point = tube[slot];
          if (index === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.stroke();
      }

      for (const tube of rowTubes) {
        ctx.beginPath();
        tube.forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      for (const tube of rowTubes) {
        for (const point of tube) {
          ctx.beginPath();
          ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
          ctx.arc(point.x, point.y, 6.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
          ctx.arc(point.x, point.y, 4.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const point of getQuadPoints(row)) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
        ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "#ffffff";
        ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    if (dragState.active) {
      drawMeshMagnifier({ x: dragState.pointerX, y: dragState.pointerY });
    }
  }

  function drawMeshMagnifier(point) {
    const radius = 56;
    const zoom = 2.35;
    let lensX = point.x + 66;
    let lensY = point.y - 72;
    if (lensX + radius > els.imageCanvas.width) {
      lensX = point.x - 66;
    }
    if (lensY - radius < 0) {
      lensY = point.y + 72;
    }
    lensX = Math.max(radius + 4, Math.min(els.imageCanvas.width - radius - 4, lensX));
    lensY = Math.max(radius + 4, Math.min(els.imageCanvas.height - radius - 4, lensY));

    ctx.save();
    ctx.beginPath();
    ctx.arc(lensX, lensY, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(lensX - radius, lensY - radius, radius * 2, radius * 2);
    ctx.translate(lensX - point.x * zoom, lensY - point.y * zoom);
    ctx.scale(zoom, zoom);
    if (sourceImage) {
      ctx.drawImage(sourceImage, 0, 0, els.imageCanvas.width, els.imageCanvas.height);
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(lensX, lensY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.48)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lensX - 12, lensY);
    ctx.lineTo(lensX + 12, lensY);
    ctx.moveTo(lensX, lensY - 12);
    ctx.lineTo(lensX, lensY + 12);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.58)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function getCanvasPoint(event) {
    const rect = els.imageCanvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * els.imageCanvas.width,
      y: ((event.clientY - rect.top) / rect.height) * els.imageCanvas.height,
    };
  }

  function readMesh() {
    if (!sourceImage) {
      return;
    }
    paletteColors.length = 0;
    drawSourceImageOnly();
    const tubes = [];
    for (const tubePoints of getMeshPoints()) {
      const tube = tubePoints.map((point) => {
        const readable = findReadablePoint(Math.round(point.x), Math.round(point.y));
        return nearestPaletteColor(readAverageColor(readable.x, readable.y, 15));
      });
      tubes.push(tube);
    }
    state.tubes = tubes;
    if (!state.selectedColor && paletteColors.length) {
      state.selectedColor = paletteColors[0];
    }
    clearSolution();
    saveInputState();
    render();
    drawImageAndMesh();
  }

  function loadImageBlob(blob) {
    if (imageObjectUrl) {
      URL.revokeObjectURL(imageObjectUrl);
    }
    const img = new Image();
    img.onload = () => {
      const maxWidth = 900;
      const scale = Math.min(1, maxWidth / img.width);
      els.imageCanvas.width = Math.round(img.width * scale);
      els.imageCanvas.height = Math.round(img.height * scale);
      sourceImage = img;
      els.imageHint.style.display = "none";
      drawImageAndMesh();
    };
    imageObjectUrl = URL.createObjectURL(blob);
    img.src = imageObjectUrl;
  }

  async function pasteImageFromClipboard() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        els.imageHint.textContent = "このブラウザでは画像ペーストに対応していません。";
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          loadImageBlob(await item.getType(imageType));
          return;
        }
      }
      els.imageHint.textContent = "クリップボードに画像が見つかりません。";
    } catch (error) {
      console.warn("Could not paste image.", error);
      els.imageHint.textContent = "画像ペーストを許可できませんでした。";
    }
  }

  function bindEvents() {
    els.solveButton.addEventListener("click", solve);
    els.clearButton.addEventListener("click", clearBoard);
    els.addTubeButton.addEventListener("click", () => {
      state.tubes.push(["", "", "", ""]);
      clearSolution();
      saveInputState();
      render();
    });
    els.removeTubeButton.addEventListener("click", () => {
      if (state.tubes.length > 1) {
        state.tubes.pop();
        clearSolution();
        saveInputState();
        render();
      }
    });
    for (const input of [els.emptyTubeCount, els.miniTubeLimit]) {
      input.addEventListener("change", () => {
        saveInputState();
        drawImageAndMesh();
      });
      input.addEventListener("input", () => {
        saveInputState();
        drawImageAndMesh();
      });
    }
    els.addMeshStageButton.addEventListener("click", () => {
      if (state.meshStageCounts.length >= 8) {
        return;
      }
      state.meshStageCounts.push(6);
      ensureMeshQuads();
      renderMeshStageControls();
      saveInputState();
      drawImageAndMesh();
    });
    els.removeMeshStageButton.addEventListener("click", () => {
      if (state.meshStageCounts.length <= 1) {
        return;
      }
      state.meshStageCounts.pop();
      ensureMeshQuads();
      renderMeshStageControls();
      saveInputState();
      drawImageAndMesh();
    });
    els.prevStepButton.addEventListener("click", () => {
      goPreviousStep();
    });
    els.nextStepButton.addEventListener("click", () => {
      goNextStep();
    });
    els.previewTapZone.addEventListener("click", (event) => {
      const rect = els.previewTapZone.getBoundingClientRect();
      if (event.clientX - rect.left < rect.width / 2) {
        goPreviousStep();
      } else {
        goNextStep();
      }
    });
    els.toggleStepsButton.addEventListener("click", () => {
      const isHidden = els.solutionSteps.hidden;
      els.solutionSteps.hidden = !isHidden;
      els.toggleStepsButton.textContent = isHidden ? "テキスト解答を隠す" : "テキスト解答を表示";
    });
    document.addEventListener("keydown", (event) => {
      const tagName = document.activeElement && document.activeElement.tagName;
      if (tagName === "INPUT" || tagName === "SELECT" || tagName === "TEXTAREA") {
        return;
      }
      if (!state.solution || !state.solution.ok) {
        return;
      }
      if (event.key === "ArrowLeft" && state.stepIndex > 0) {
        event.preventDefault();
        goPreviousStep();
      }
      if (event.key === "ArrowRight" && state.stepIndex < state.solution.states.length - 1) {
        event.preventDefault();
        goNextStep();
      }
    });
    els.imageInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      loadImageBlob(file);
    });
    els.pasteImageButton.addEventListener("click", pasteImageFromClipboard);
    els.imageCanvas.addEventListener("click", (event) => {
      if (dragState.suppressClick) {
        dragState.suppressClick = false;
        return;
      }
      if (!sourceImage) {
        return;
      }
        const point = getCanvasPoint(event);
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      drawSourceImageOnly();
      const readable = findReadablePoint(x, y);
      state.pickedColor = nearestPaletteColor(readAverageColor(readable.x, readable.y));
      state.selectedColor = state.pickedColor;
      renderPickedColorChip();
      saveInputState();
      drawImageAndMesh();
    });
    els.imageCanvas.addEventListener("pointerdown", (event) => {
      if (!sourceImage) {
        return;
      }
      event.preventDefault();
      const point = getCanvasPoint(event);
      dragState.active = true;
      dragState.moved = false;
      dragState.lastX = point.x;
      dragState.lastY = point.y;
      dragState.pointerX = point.x;
      dragState.pointerY = point.y;
      const target = getMeshDragTarget(point);
      dragState.mode = target.mode;
      dragState.row = target.row;
      dragState.corner = target.corner;
      els.imageCanvas.setPointerCapture(event.pointerId);
      drawImageAndMesh();
    });
    els.imageCanvas.addEventListener("pointermove", (event) => {
      if (!dragState.active) {
        return;
      }
      event.preventDefault();
      const point = getCanvasPoint(event);
      const dx = point.x - dragState.lastX;
      const dy = point.y - dragState.lastY;
      dragState.pointerX = point.x;
      dragState.pointerY = point.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) {
        dragState.moved = true;
        ensureMeshQuads();
        if (dragState.mode === "corner") {
          moveMeshCorner(dragState.row, dragState.corner, dx, dy);
        } else {
          moveMeshQuad(dragState.row, dx, dy);
        }
        dragState.lastX = point.x;
        dragState.lastY = point.y;
        drawImageAndMesh();
      } else {
        drawImageAndMesh();
      }
    });
    els.imageCanvas.addEventListener("pointerup", (event) => {
      if (!dragState.active) {
        return;
      }
      event.preventDefault();
      dragState.active = false;
      dragState.suppressClick = dragState.moved;
      if (dragState.moved) {
        clampMeshQuad(dragState.row);
        saveInputState();
      }
      if (els.imageCanvas.hasPointerCapture(event.pointerId)) {
        els.imageCanvas.releasePointerCapture(event.pointerId);
      }
      drawImageAndMesh();
    });
    els.imageCanvas.addEventListener("pointercancel", () => {
      dragState.active = false;
      drawImageAndMesh();
    });
    els.readMeshButton.addEventListener("click", readMesh);
  }

  restoreInputState();
  renderMeshStageControls();
  bindEvents();
  renderPickedColorChip();
  render();
  drawImageAndMesh();
})();
