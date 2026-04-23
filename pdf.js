"use strict";

/* ============================================================
   KenKen PDF renderer
   - Puzzles are grouped by grid size (ascending). Each group
     starts on a fresh page with a bold "N × N" heading.
   - Within a group, layout (cols × rows) is chosen to maximise
     slot area for A4 portrait. Groups with >16 puzzles paginate.
   - Fonts are computed from the actual cell size, so anything
     from a single 3×3 to sixteen 6×6 per page stays readable.
   ============================================================ */

const A4 = { w: 210, h: 297 };
const MARGIN = 10;
const USABLE = { w: A4.w - 2 * MARGIN, h: A4.h - 2 * MARGIN };

const MAX_PER_PAGE = 16;
const HEADING_H = 10;   // mm reserved for the "N × N" heading strip

// jsPDF helvetica uses WinAnsi which lacks U+2212 (−); substitute hyphen
function pdfOp(op) { return op === "−" ? "-" : op; }

/* Choose the (cols, rows) layout that gives the largest grid slot on A4 portrait. */
function chooseLayout(count, availH) {
  let best = null, bestSize = -1;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const gap = count > 9 ? 4 : (count > 4 ? 6 : 8);
    const sw = (USABLE.w - gap * (cols - 1)) / cols;
    const sh = (availH - gap * (rows - 1)) / rows;
    if (sw <= 0 || sh <= 0) continue;
    const size = Math.min(sw, sh);
    if (size > bestSize) { bestSize = size; best = { cols, rows, gap }; }
  }
  return best || { cols: 1, rows: count, gap: 6 };
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function drawPuzzle(doc, puz, slotX, slotY, slotW, slotH, label, showValues) {
  const { n, solution, cages, cellCage } = puz;

  // Reserve a small title strip above the grid (per-slot puzzle number)
  const titlePt = Math.max(6, Math.min(11, slotW * 0.075));
  const titleH  = titlePt * 0.42 + 1.5;     // pt → mm rough conv

  const gridMax = Math.min(slotW, slotH - titleH - 1);
  const gridSize = gridMax;
  const cell = gridSize / n;

  // Centre grid horizontally within slot, push below title
  const gx = slotX + (slotW - gridSize) / 2;
  const gy = slotY + titleH + (slotH - titleH - gridSize) / 2;

  // Font sizes computed from cell size (1mm ≈ 2.83pt)
  const valuePt = Math.max(5, cell * 1.45);   // ~50% of cell
  const labelPt = Math.max(4.5, cell * 0.65); // ~22% of cell

  // ---- title ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(titlePt);
  doc.setTextColor(80);
  doc.text(label, slotX + slotW / 2, slotY + titleH - 1, {
    align: "center", baseline: "alphabetic",
  });

  // ---- thin internal grid ----
  doc.setLineWidth(0.15);
  doc.setDrawColor(170);
  for (let k = 1; k < n; k++) {
    doc.line(gx, gy + k * cell, gx + gridSize, gy + k * cell);
    doc.line(gx + k * cell, gy, gx + k * cell, gy + gridSize);
  }

  // ---- thick cage borders + outer border ----
  doc.setLineWidth(0.7);
  doc.setDrawColor(0);
  doc.setLineCap("square");
  doc.setLineJoin("miter");
  doc.rect(gx, gy, gridSize, gridSize);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cid = cellCage[i][j];
      if (i < n - 1 && cellCage[i + 1][j] !== cid) {
        doc.line(gx + j * cell, gy + (i + 1) * cell,
                 gx + (j + 1) * cell, gy + (i + 1) * cell);
      }
      if (j < n - 1 && cellCage[i][j + 1] !== cid) {
        doc.line(gx + (j + 1) * cell, gy + i * cell,
                 gx + (j + 1) * cell, gy + (i + 1) * cell);
      }
    }
  }

  // ---- cage labels ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(labelPt);
  doc.setTextColor(0);
  const labelPad = Math.max(0.5, cell * 0.06);
  for (const cage of cages) {
    const sorted = [...cage.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const [li, lj] = sorted[0];
    doc.text(
      cage.target + pdfOp(cage.op),
      gx + lj * cell + labelPad,
      gy + li * cell + labelPad,
      { baseline: "top" }
    );
  }

  // ---- solution values ----
  if (showValues) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(valuePt);
    doc.setTextColor(40);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        doc.text(
          String(solution[i][j]),
          gx + j * cell + cell / 2,
          gy + i * cell + cell / 2,
          { align: "center", baseline: "middle" }
        );
      }
    }
  }
}

function drawPageHeader(doc, text) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(text, MARGIN, MARGIN - 3, { baseline: "alphabetic" });
}

function drawSizeHeading(doc, size, showValues, groupIndex, totalGroups) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15);
  doc.text(`${size} × ${size}`, MARGIN, MARGIN + 6, { baseline: "alphabetic" });
  if (showValues) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("Solutions", MARGIN + 30, MARGIN + 6, { baseline: "alphabetic" });
  }
}

/* Draw one group (same n) across as many pages as needed. */
function drawGroup(doc, groupPuzzles, startNumber, showValues, isFirstPage, headerText) {
  const pages = chunk(groupPuzzles, MAX_PER_PAGE);
  const n = groupPuzzles[0].n;
  const availH = USABLE.h - HEADING_H;

  pages.forEach((pagePuzzles, pageIdx) => {
    if (!isFirstPage || pageIdx > 0) doc.addPage();
    drawPageHeader(doc, headerText);
    drawSizeHeading(doc, n, showValues);

    const layout = chooseLayout(pagePuzzles.length, availH);
    const slotW = (USABLE.w - layout.gap * (layout.cols - 1)) / layout.cols;
    const slotH = (availH   - layout.gap * (layout.rows - 1)) / layout.rows;
    const baseY = MARGIN + HEADING_H;

    pagePuzzles.forEach((puz, i) => {
      const col = i % layout.cols;
      const row = Math.floor(i / layout.cols);
      const slotX = MARGIN + col * (slotW + layout.gap);
      const slotY = baseY  + row * (slotH + layout.gap);
      const number = startNumber + pageIdx * MAX_PER_PAGE + i;
      const label = showValues ? `Solution ${number}` : `Puzzle ${number}`;
      drawPuzzle(doc, puz, slotX, slotY, slotW, slotH, label, showValues);
    });
  });
}

function groupBySize(puzzles) {
  const sizes = [...new Set(puzzles.map(p => p.n))].sort((a, b) => a - b);
  return sizes.map(size => ({ size, puzzles: puzzles.filter(p => p.n === size) }));
}

function buildPdf(puzzles, includeSolutions) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const groups = groupBySize(puzzles);

  // Assign global puzzle numbers: 1..N, ordered by group (same order as headings)
  let runningNumber = 1;
  const groupStartNumbers = groups.map(g => {
    const start = runningNumber;
    runningNumber += g.puzzles.length;
    return start;
  });

  // ---- Puzzles pages ----
  groups.forEach((g, idx) => {
    drawGroup(
      doc,
      g.puzzles,
      groupStartNumbers[idx],
      false,
      idx === 0,
      `KenKen — ${g.size}×${g.size}`
    );
  });

  // ---- Solutions pages ----
  if (includeSolutions) {
    groups.forEach((g, idx) => {
      drawGroup(
        doc,
        g.puzzles,
        groupStartNumbers[idx],
        true,
        false, // always add a new page — puzzles come first
        `KenKen — ${g.size}×${g.size} — Solutions`
      );
    });
  }

  return doc;
}

window.buildPdf = buildPdf;
