"use strict";

/* ============================================================
   KenKen generator
   - Generates a random Latin square (the solution)
   - Partitions the grid into cages
   - Assigns operators/targets from the known solution
   - Verifies uniqueness with a backtracking solver
   ============================================================ */

/* ---------- utilities ---------- */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- latin square (random solution) ---------- */
function generateLatinSquare(n) {
  let sq = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) row.push(((i + j) % n) + 1);
    sq.push(row);
  }
  shuffle(sq);
  const cols = shuffle([...Array(n).keys()]);
  sq = sq.map(r => cols.map(c => r[c]));
  const perm = shuffle([...Array(n).keys()].map(x => x + 1));
  return sq.map(r => r.map(v => perm[v - 1]));
}

/* ---------- cage generation ---------- */
// Weighted distributions for cage sizes (indices 0..4 → sizes 1..5)
const SIZE_DIST = {
  easy:   [25, 55, 20,  0,  0],
  medium: [10, 35, 40, 15,  0],
  hard:   [ 5, 20, 40, 25, 10],
  expert: [ 0, 10, 35, 35, 20],
};

function pickCageSize(difficulty, maxCap) {
  const dist = SIZE_DIST[difficulty];
  const r = Math.random() * 100;
  let acc = 0;
  for (let i = 0; i < 5; i++) {
    acc += dist[i];
    if (r < acc) return Math.min(i + 1, maxCap);
  }
  return Math.min(1, maxCap);
}

function generateCages(n, difficulty) {
  const cellCage = Array.from({ length: n }, () => Array(n).fill(-1));
  const cages = [];
  const maxCap = n <= 4 ? 4 : 5;  // 3,4 → 4-cell cages max; 5,6 → 5-cell max

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (cellCage[i][j] !== -1) continue;
      const want = pickCageSize(difficulty, maxCap);
      const id = cages.length;
      const cells = [[i, j]];
      cellCage[i][j] = id;

      while (cells.length < want) {
        const cands = [];
        for (const [ci, cj] of cells) {
          for (const [di, dj] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const ni = ci + di, nj = cj + dj;
            if (ni >= 0 && ni < n && nj >= 0 && nj < n && cellCage[ni][nj] === -1) {
              cands.push([ni, nj]);
            }
          }
        }
        if (!cands.length) break;
        const [ni, nj] = cands[Math.floor(Math.random() * cands.length)];
        cells.push([ni, nj]);
        cellCage[ni][nj] = id;
      }
      cages.push({ id, cells });
    }
  }
  return { cages, cellCage };
}

/* ---------- operator assignment (uses solution values) ---------- */
function assignOperators(cages, solution, ops) {
  for (const cage of cages) {
    const vals = cage.cells.map(([i, j]) => solution[i][j]);

    if (vals.length === 1) {
      cage.op = "";
      cage.target = vals[0];
      continue;
    }

    const options = [];
    if (ops.has("+")) options.push({ op: "+", target: vals.reduce((a,b)=>a+b, 0) });
    if (ops.has("*")) options.push({ op: "×", target: vals.reduce((a,b)=>a*b, 1) });

    if (vals.length === 2) {
      const [a, b] = vals;
      if (ops.has("-")) options.push({ op: "−", target: Math.abs(a - b) });
      if (ops.has("/")) {
        const big = Math.max(a, b), small = Math.min(a, b);
        if (big % small === 0) options.push({ op: "÷", target: big / small });
      }
    }

    if (!options.length) return false;
    const pick = options[Math.floor(Math.random() * options.length)];
    cage.op = pick.op;
    cage.target = pick.target;
  }
  return true;
}

/* ---------- solver: counts solutions up to `limit` ---------- */
function countSolutions(n, cages, cellCage, limit) {
  const grid = Array.from({ length: n }, () => Array(n).fill(0));
  const rowU = Array.from({ length: n }, () => new Array(n + 1).fill(false));
  const colU = Array.from({ length: n }, () => new Array(n + 1).fill(false));
  let count = 0;

  function cageCheck(cage) {
    const vals = cage.cells.map(([i, j]) => grid[i][j]);
    const emptyN = vals.reduce((k, v) => k + (v === 0 ? 1 : 0), 0);

    if (emptyN === 0) {
      if (cage.op === "")  return vals[0] === cage.target;
      if (cage.op === "+") return vals.reduce((a,b)=>a+b, 0) === cage.target;
      if (cage.op === "×") return vals.reduce((a,b)=>a*b, 1) === cage.target;
      if (cage.op === "−") return Math.abs(vals[0] - vals[1]) === cage.target;
      if (cage.op === "÷") {
        const big = Math.max(...vals), small = Math.min(...vals);
        return small > 0 && big % small === 0 && big / small === cage.target;
      }
      return false;
    }

    // Partial pruning — conservative bounds
    if (cage.op === "+") {
      const sum = vals.reduce((a,b)=>a+b, 0);
      return sum + emptyN * 1 <= cage.target && sum + emptyN * n >= cage.target;
    }
    if (cage.op === "×") {
      const prod = vals.filter(v => v > 0).reduce((a,b)=>a*b, 1);
      if (cage.target % prod !== 0) return false;
      return prod * Math.pow(n, emptyN) >= cage.target;
    }
    return true;
  }

  function solve(idx) {
    if (count >= limit) return;
    if (idx === n * n) { count++; return; }
    const i = Math.floor(idx / n), j = idx % n;
    for (let v = 1; v <= n; v++) {
      if (rowU[i][v] || colU[j][v]) continue;
      grid[i][j] = v;
      rowU[i][v] = true;
      colU[j][v] = true;
      const cage = cages[cellCage[i][j]];
      if (cageCheck(cage)) solve(idx + 1);
      grid[i][j] = 0;
      rowU[i][v] = false;
      colU[j][v] = false;
      if (count >= limit) return;
    }
  }

  solve(0);
  return count;
}

/* ---------- main puzzle pipeline ---------- */
function generatePuzzle(n, difficulty, ops) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const solution = generateLatinSquare(n);
    const { cages, cellCage } = generateCages(n, difficulty);
    if (!assignOperators(cages, solution, ops)) continue;
    if (countSolutions(n, cages, cellCage, 2) === 1) {
      return { n, solution, cages, cellCage };
    }
  }
  return null;
}

/* ---------- rendering ---------- */
function renderPuzzle(puz, showValues) {
  const { n, solution, cages, cellCage } = puz;

  // Pick label anchor per cage (topmost, leftmost cell)
  const labelCell = {};
  for (const cage of cages) {
    const sorted = [...cage.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    labelCell[cage.id] = sorted[0];
  }

  const grid = document.createElement("div");
  grid.className = `kk-grid n-${n}`;
  grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  grid.style.gridTemplateRows    = `repeat(${n}, 1fr)`;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cid = cellCage[i][j];
      const cage = cages[cid];
      const cell = document.createElement("div");
      cell.className = "kk-cell";
      if (i === 0       || cellCage[i - 1][j] !== cid) cell.classList.add("tt");
      if (i === n - 1   || cellCage[i + 1][j] !== cid) cell.classList.add("bt");
      if (j === 0       || cellCage[i][j - 1] !== cid) cell.classList.add("lt");
      if (j === n - 1   || cellCage[i][j + 1] !== cid) cell.classList.add("rt");

      const [li, lj] = labelCell[cid];
      if (i === li && j === lj) {
        const label = document.createElement("span");
        label.className = "kk-label";
        label.textContent = cage.target + cage.op;
        cell.appendChild(label);
      }
      if (showValues) {
        const val = document.createElement("span");
        val.className = "kk-value";
        val.textContent = solution[i][j];
        cell.appendChild(val);
      }
      grid.appendChild(cell);
    }
  }
  return grid;
}

function renderLayout(puzzles, perPage, showValues) {
  const layout = document.createElement("div");
  layout.className = `puzzles-layout pp-${perPage}`;
  puzzles.forEach((puz, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "puzzle-wrap";

    const title = document.createElement("div");
    title.className = "puzzle-title";
    title.textContent = showValues
      ? `Solution ${idx + 1}`
      : `Puzzle ${idx + 1}`;
    wrap.appendChild(title);

    const holder = document.createElement("div");
    holder.className = "grid-holder";
    holder.appendChild(renderPuzzle(puz, showValues));
    wrap.appendChild(holder);

    layout.appendChild(wrap);
  });
  return layout;
}

/* ---------- UI wiring ---------- */
let latestState = null;  // { puzzles, perPage, difficulty, showSol }

function renderAll() {
  const perPage    = parseInt(document.getElementById("perPage").value, 10);
  const difficulty = document.getElementById("difficulty").value;
  const n          = parseInt(document.getElementById("size").value, 10);
  const ops        = new Set([...document.querySelectorAll(".op:checked")].map(c => c.value));
  const showSol    = document.getElementById("showSol").checked;
  const output     = document.getElementById("output");
  const status     = document.getElementById("status");

  output.innerHTML = "";
  latestState = null;
  status.textContent = "Generating…";

  if (!ops.size) {
    status.textContent = "⚠ Select at least one operator.";
    return;
  }
  if (!ops.has("+") && !ops.has("*")) {
    status.textContent = "⚠ Enable + or × — subtraction/division alone only work on 2-cell cages.";
    return;
  }

  setTimeout(() => {
    const t0 = performance.now();
    const puzzles = [];
    for (let k = 0; k < perPage; k++) {
      const puz = generatePuzzle(n, difficulty, ops);
      if (!puz) {
        status.textContent = "⚠ Could not build a uniquely-solvable puzzle with those settings. Try more operators or a different difficulty.";
        return;
      }
      puzzles.push(puz);
    }

    // Puzzles page
    const puzzlesPage = document.createElement("div");
    puzzlesPage.className = "page";
    puzzlesPage.appendChild(renderLayout(puzzles, perPage, false));
    output.appendChild(puzzlesPage);

    // Solutions page (own printed page)
    if (showSol) {
      const solPage = document.createElement("div");
      solPage.className = "page solutions";
      const h = document.createElement("h2");
      h.textContent = "Solutions";
      solPage.appendChild(h);
      solPage.appendChild(renderLayout(puzzles, perPage, true));
      output.appendChild(solPage);
    }

    latestState = { puzzles, perPage, difficulty, showSol };
    const ms = Math.round(performance.now() - t0);
    status.textContent = `✓ Generated ${perPage} puzzle${perPage>1?"s":""} in ${ms} ms — each verified to have exactly one solution.`;
  }, 10);
}

function openPdf() {
  const status = document.getElementById("status");
  if (!latestState) {
    status.textContent = "⚠ Generate puzzles first.";
    return;
  }
  if (typeof window.buildPdf !== "function" || !window.jspdf) {
    status.textContent = "⚠ PDF library failed to load. Check your internet connection and reload.";
    return;
  }
  const { puzzles, perPage, difficulty, showSol } = latestState;
  const doc = window.buildPdf(puzzles, perPage, difficulty, showSol);
  // Open in a new tab so the user can print from their PDF viewer (perfect 1:1 print)
  const url = doc.output("bloburl");
  window.open(url, "_blank");
}

document.getElementById("gen").addEventListener("click", renderAll);
document.getElementById("print").addEventListener("click", openPdf);
renderAll();
