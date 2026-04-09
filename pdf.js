"use strict";

/* ============================================================
   Bulletproof KenKen PDF renderer
   --------------------------------------------------------------
   Builds a PDF with exact mm coordinates via jsPDF.
   Layouts (A4 portrait, 10mm margins, usable 190 × 277 mm):
     1  → 1×1   one big puzzle
     2  → 1×2   stacked top/bottom (full width)
     4  → 2×2   one in each corner
     8  → 2×4
     16 → 4×4
   Solutions go on a 2nd page (and so on) with the SAME layout
   so puzzle #N and solution #N share the same slot position.
   ============================================================ */

const A4 = { w: 210, h: 297 };
const MARGIN = 10;
const USABLE = { w: A4.w - 2 * MARGIN, h: A4.h - 2 * MARGIN };

const LAYOUTS = {
  1:  { cols: 1, rows: 1, gap: 6 },
  2:  { cols: 1, rows: 2, gap: 8 },
  4:  { cols: 2, rows: 2, gap: 8 },
  8:  { cols: 2, rows: 4, gap: 5 },
  16: { cols: 4, rows: 4, gap: 4 },
};

// Font sizes (pt) tuned per layout
const FONT = {
  1:  { title: 11, label: 11, value: 30 },
  2:  { title: 10, label:  9, value: 22 },
  4:  { title:  9, label:  7, value: 16 },
  8:  { title:  7, label:  6, value: 12 },
  16: { title:  6, label:  5, value:  9 },
};

// jsPDF helvetica uses WinAnsi which lacks U+2212 (−); substitute hyphen
function pdfOp(op) {
  return op === "−" ? "-" : op;
}

function buildPdf(puzzles, perPage, difficulty, includeSolutions) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const layout = LAYOUTS[perPage];
  const fonts  = FONT[perPage];

  const slotW = (USABLE.w - layout.gap * (layout.cols - 1)) / layout.cols;
  const slotH = (USABLE.h - layout.gap * (layout.rows - 1)) / layout.rows;

  // Reserve title strip at top of each slot
  const titleH  = fonts.title * 0.42 + 1.5;     // pt → mm rough conv
  const gridMaxW = slotW;
  const gridMaxH = slotH - titleH - 1;
  const gridSize = Math.min(gridMaxW, gridMaxH);

  function drawPuzzle(puz, slotX, slotY, label, showValues) {
    const { n, solution, cages, cellCage } = puz;

    // Center grid in slot (horizontally always; vertically below title)
    const gx = slotX + (slotW - gridSize) / 2;
    const gy = slotY + titleH + (gridMaxH - gridSize) / 2;
    const cell = gridSize / n;

    // ---- title ----
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fonts.title);
    doc.setTextColor(80);
    doc.text(label, slotX + slotW / 2, slotY + titleH - 1, {
      align: "center",
      baseline: "alphabetic",
    });

    // ---- thin internal grid (light gray) ----
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
          // bottom edge of (i,j)
          doc.line(
            gx + j * cell,       gy + (i + 1) * cell,
            gx + (j + 1) * cell, gy + (i + 1) * cell
          );
        }
        if (j < n - 1 && cellCage[i][j + 1] !== cid) {
          // right edge of (i,j)
          doc.line(
            gx + (j + 1) * cell, gy + i * cell,
            gx + (j + 1) * cell, gy + (i + 1) * cell
          );
        }
      }
    }

    // ---- cage labels (top-left of label cell) ----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fonts.label);
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

    // ---- solution values (centered in cell) ----
    if (showValues) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fonts.value);
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

  function drawSheet(showValues) {
    puzzles.forEach((puz, idx) => {
      const col = idx % layout.cols;
      const row = Math.floor(idx / layout.cols);
      const slotX = MARGIN + col * (slotW + layout.gap);
      const slotY = MARGIN + row * (slotH + layout.gap);
      const label = showValues ? `Solution ${idx + 1}` : `Puzzle ${idx + 1}`;
      drawPuzzle(puz, slotX, slotY, label, showValues);
    });
  }

  // Header note (small, on first page only)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    `KenKen — ${puzzles[0].n}×${puzzles[0].n} · ${difficulty}`,
    MARGIN,
    MARGIN - 3,
    { baseline: "alphabetic" }
  );

  drawSheet(false);

  if (includeSolutions) {
    doc.addPage();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text("KenKen — Solutions", MARGIN, MARGIN - 3, { baseline: "alphabetic" });
    drawSheet(true);
  }

  return doc;
}

window.buildPdf = buildPdf;
