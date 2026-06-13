// State variables
// Each entry: { raw, prettified, result, error }
let leftFormulaLines = [];

// Initialize application on load
document.addEventListener("DOMContentLoaded", () => {
  buildGrid();
  loadState();
  
  // Listen for grid inputs to compute sums in real time
  document.getElementById("grid-body").addEventListener("input", (e) => {
    if (e.target.classList.contains("grid-cell-input")) {
      calculateGrid();
    }
  });

  // Listen for grid keyboard navigation (Enter, Tab, Arrows)
  document.getElementById("grid-body").addEventListener("keydown", (e) => {
    if (!e.target.classList.contains("grid-cell-input")) return;
    
    const input = e.target;
    const r = parseInt(input.getAttribute("data-row"));
    const c = parseInt(input.getAttribute("data-col"));
    
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        focusCell(r + 1, c);
        break;
      case "Tab":
        e.preventDefault();
        if (e.shiftKey) {
          if (c > 0) {
            focusCell(r, c - 1);
          } else {
            focusCell(r - 1, 2);
          }
        } else {
          if (c < 2) {
            focusCell(r, c + 1);
          } else {
            focusCell(r + 1, 0);
          }
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        focusCell(r - 1, c);
        break;
      case "ArrowDown":
        e.preventDefault();
        focusCell(r + 1, c);
        break;
      case "ArrowLeft":
        if (input.selectionStart === 0 && input.selectionEnd === 0) {
          e.preventDefault();
          focusCell(r, c - 1);
        }
        break;
      case "ArrowRight":
        const len = input.value.length;
        if (input.selectionStart === len && input.selectionEnd === len) {
          e.preventDefault();
          focusCell(r, c + 1);
        }
        break;
    }
  });

  // Listen for formula changes to save draft
  document.getElementById("formula-input").addEventListener("input", () => {
    localStorage.setItem("omnicalc_formula", document.getElementById("formula-input").value);
  });

  // Setup mobile swipe detection
  initSwipeGestures();
});

// Helper to focus and select specific grid cell
function focusCell(r, c) {
  if (r >= 0 && r < 100 && c >= 0 && c < 3) {
    const nextCell = document.getElementById(`cell-${r}-${c}`);
    if (nextCell) {
      nextCell.focus();
      // Select text for easier rewriting, like a real spreadsheet
      setTimeout(() => {
        nextCell.select();
      }, 0);
    }
  }
}

// Demo Formula loader
function loadDemoFormula() {
  const demo = "average(10 pl 2, var.s(3, 5, 7) mu 4) mi sin(30?? pl log(10, 100) upper 3";
  document.getElementById("formula-input").value = demo;
  localStorage.setItem("omnicalc_formula", demo);
  showToast("?덉젣 ?섏떇??濡쒕뱶?섏뿀?듬땲??");
}

// ----------------------------------------------------
// 1. Math Parser & Engine (Left Section)
// ----------------------------------------------------

// Advanced factorial helper
function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

// Custom function bindings
function __log(base, value) {
  if (value === undefined) {
    return Math.log10(base); // Default base 10 if single argument
  }
  return Math.log(value) / Math.log(base);
}

function __sum(...args) {
  const nums = args.flat().filter(x => typeof x === "number" && !isNaN(x));
  return nums.reduce((a, b) => a + b, 0);
}

function __average(...args) {
  const nums = args.flat().filter(x => typeof x === "number" && !isNaN(x));
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function __stdev_s(...args) {
  const nums = args.flat().filter(x => typeof x === "number" && !isNaN(x));
  if (nums.length <= 1) return 0;
  const avg = __average(nums);
  const sqDiffSum = nums.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0);
  return Math.sqrt(sqDiffSum / (nums.length - 1));
}

function __stdev_p(...args) {
  const nums = args.flat().filter(x => typeof x === "number" && !isNaN(x));
  if (nums.length === 0) return 0;
  const avg = __average(nums);
  const sqDiffSum = nums.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0);
  return Math.sqrt(sqDiffSum / nums.length);
}

function __var_s(...args) {
  const nums = args.flat().filter(x => typeof x === "number" && !isNaN(x));
  if (nums.length <= 1) return 0;
  const avg = __average(nums);
  const sqDiffSum = nums.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0);
  return sqDiffSum / (nums.length - 1);
}

function __var_p(...args) {
  const nums = args.flat().filter(x => typeof x === "number" && !isNaN(x));
  if (nums.length === 0) return 0;
  const avg = __average(nums);
  const sqDiffSum = nums.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0);
  return sqDiffSum / nums.length;
}

function __permut(n, r) {
  if (r === undefined) {
    return factorial(n); // n! is permut(n)
  }
  if (n < 0 || r < 0 || n < r || !Number.isInteger(n) || !Number.isInteger(r)) return NaN;
  return factorial(n) / factorial(n - r);
}

function __combin(n, r) {
  if (n < 0 || r < 0 || n < r || !Number.isInteger(n) || !Number.isInteger(r)) return NaN;
  return factorial(n) / (factorial(r) * factorial(n - r));
}

// Function to preprocess formula to javascript executable code
function parseFormula(rawExpr) {
  let expr = rawExpr.toLowerCase();

  // Escape special math functions using placeholders to avoid parameter damage
  const escapeMap = [
    { key: "stdev.s", placeholder: "##STDEV_S##" },
    { key: "stdev.p", placeholder: "##STDEV_P##" },
    { key: "var.s", placeholder: "##VAR_S##" },
    { key: "var.p", placeholder: "##VAR_P##" },
    { key: "average", placeholder: "##AVERAGE##" },
    { key: "sum", placeholder: "##SUM##" },
    { key: "permut", placeholder: "##PERMUT##" },
    { key: "combin", placeholder: "##COMBIN##" },
    { key: "asin", placeholder: "##ASIN##" },
    { key: "acos", placeholder: "##ACOS##" },
    { key: "atan", placeholder: "##ATAN##" },
    { key: "sin", placeholder: "##SIN##" },
    { key: "cos", placeholder: "##COS##" },
    { key: "tan", placeholder: "##TAN##" },
    { key: "log", placeholder: "##LOG##" },
    { key: "pi", placeholder: "##PI##" }
  ];

  // Apply placeholders
  escapeMap.forEach(item => {
    const regex = new RegExp("\\b" + item.key.replace(".", "\\.") + "\\b", "g");
    expr = expr.replace(regex, item.placeholder);
  });

  // Parse Degree symbol "??
  // Example: 30??-> ((30) * Math.PI / 180)
  expr = expr.replace(/(\d+(?:\.\d+)?)\s*??g, "(($1) * Math.PI / 180)");

  // Translate custom operators
  expr = expr.replace(/pl/g, "+");
  expr = expr.replace(/mi/g, "-");
  expr = expr.replace(/mu/g, "*");
  expr = expr.replace(/di/g, "/");
  expr = expr.replace(/upper/g, "**");

  // Restore placeholders with JS math bindings
  const restoreMap = {
    "##STDEV_S##": "__stdev_s",
    "##STDEV_P##": "__stdev_p",
    "##VAR_S##": "__var_s",
    "##VAR_P##": "__var_p",
    "##AVERAGE##": "__average",
    "##SUM##": "__sum",
    "##PERMUT##": "__permut",
    "##COMBIN##": "__combin",
    "##ASIN##": "Math.asin",
    "##ACOS##": "Math.acos",
    "##ATAN##": "Math.atan",
    "##SIN##": "Math.sin",
    "##COS##": "Math.cos",
    "##TAN##": "Math.tan",
    "##LOG##": "__log",
    "##PI##": "Math.PI"
  };

  Object.entries(restoreMap).forEach(([placeholder, jsBinding]) => {
    expr = expr.replaceAll(placeholder, jsBinding);
  });

  return expr;
}

// Helper: prettify operator symbols for display/copy
function prettifyFormula(raw) {
  let p = raw;
  p = p.replace(/stdev\.s/gi, "##STDEV_S##");
  p = p.replace(/stdev\.p/gi, "##STDEV_P##");
  p = p.replace(/var\.s/gi, "##VAR_S##");
  p = p.replace(/var\.p/gi, "##VAR_P##");
  p = p.replace(/permut/gi, "##PERMUT##");
  p = p.replace(/combin/gi, "##COMBIN##");
  p = p.replace(/\bpl\b/gi, "+");
  p = p.replace(/\bmi\b/gi, "-");
  p = p.replace(/\bmu\b/gi, "횞");
  p = p.replace(/\bdi\b/gi, "첨");
  p = p.replace(/\bupper\b/gi, "^");
  p = p.replace(/##STDEV_S##/g, "stdev.s");
  p = p.replace(/##STDEV_P##/g, "stdev.p");
  p = p.replace(/##VAR_S##/g, "var.s");
  p = p.replace(/##VAR_P##/g, "var.p");
  p = p.replace(/##PERMUT##/g, "permut");
  p = p.replace(/##COMBIN##/g, "combin");
  return p;
}

// Helper: evaluate a single raw formula line
function evaluateLine(rawLine) {
  const parsedExpr = parseFormula(rawLine);
  const evaluator = new Function(
    "__log", "__average", "__sum", "__stdev_s", "__stdev_p", "__var_s", "__var_p", "__permut", "__combin", "factorial",
    `return (${parsedExpr});`
  );
  const res = evaluator(
    __log, __average, __sum, __stdev_s, __stdev_p, __var_s, __var_p, __permut, __combin, factorial
  );
  if (res === null || res === undefined || isNaN(res)) {
    throw new Error("寃곌낵媛믪씠 ?щ컮瑜댁? ?딆뒿?덈떎 (NaN).");
  }
  return Number.isInteger(res) ? res.toString() : parseFloat(res.toFixed(10)).toString();
}

// Evaluate & Display (multi-line support)
function calculateFormula() {
  const inputEl = document.getElementById("formula-input");
  const resultEl = document.getElementById("formula-result");
  const parsedEl = document.getElementById("formula-parsed");

  const rawInput = inputEl.value;
  const lines = rawInput.split("\n");
  const nonEmptyLines = lines.filter(l => l.trim() !== "");

  if (nonEmptyLines.length === 0) {
    resultEl.innerHTML = "<span class='result-placeholder'>?섏떇???낅젰?섏꽭??</span>";
    parsedEl.textContent = "";
    leftFormulaLines = [];
    return;
  }

  leftFormulaLines = [];
  const resultItems = [];

  nonEmptyLines.forEach((line, idx) => {
    const raw = line.trim();
    try {
      const result = evaluateLine(raw);
      const pretty = prettifyFormula(raw);
      leftFormulaLines.push({ raw, pretty, result, error: null });
      resultItems.push(
        `<div class="result-line">`
        + `<span class="result-line-num">${idx + 1}</span>`
        + `<span class="result-line-expr">${escapeHtml(pretty)}</span>`
        + `<span class="result-line-eq">=</span>`
        + `<span class="result-line-val">${escapeHtml(result)}</span>`
        + `</div>`
      );
    } catch (err) {
      leftFormulaLines.push({ raw, pretty: prettifyFormula(raw), result: null, error: err.message });
      resultItems.push(
        `<div class="result-line result-line--error">`
        + `<span class="result-line-num">${idx + 1}</span>`
        + `<span class="result-line-expr">${escapeHtml(raw)}</span>`
        + `<span class="result-line-eq">??/span>`
        + `<span class="result-line-val error-msg">?ㅻ쪟</span>`
        + `</div>`
      );
    }
  });

  resultEl.innerHTML = resultItems.join("");
  parsedEl.textContent = "";

  // Save state
  localStorage.setItem("omnicalc_formula_result", JSON.stringify(leftFormulaLines));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Clear Left Section
function clearFormula() {
  document.getElementById("formula-input").value = "";
  document.getElementById("formula-result").innerHTML = "<span class='result-placeholder'>?湲?以?..</span>";
  document.getElementById("formula-parsed").textContent = "";
  leftFormulaLines = [];
  localStorage.removeItem("omnicalc_formula");
  localStorage.removeItem("omnicalc_formula_result");
  showToast("?섏떇??珥덇린?붾릺?덉뒿?덈떎.");
}

// Copy Formula (a) -> Each line: prettified expression = result
function copyFormulaA() {
  if (!leftFormulaLines || leftFormulaLines.length === 0) {
    showToast("怨꾩궛??癒쇱? ?꾨즺??二쇱꽭??", true);
    return;
  }
  const successLines = leftFormulaLines.filter(l => l.result !== null);
  if (successLines.length === 0) {
    showToast("?뺤긽?곸쑝濡?怨꾩궛???섏떇???놁뒿?덈떎.", true);
    return;
  }
  const text = successLines.map(l => `${l.pretty} = ${l.result}`).join("\n");
  copyToClipboard(text);
}

// Copy Formula (b) -> All results only (one per line)
function copyFormulaB() {
  if (!leftFormulaLines || leftFormulaLines.length === 0) {
    showToast("怨꾩궛??癒쇱? ?꾨즺??二쇱꽭??", true);
    return;
  }
  const successLines = leftFormulaLines.filter(l => l.result !== null);
  if (successLines.length === 0) {
    showToast("?뺤긽?곸쑝濡?怨꾩궛???섏떇???놁뒿?덈떎.", true);
    return;
  }
  const text = successLines.map(l => l.result).join("\n");
  copyToClipboard(text);
}

// Export formula results as txt file (all lines)
function exportFormulaTxt() {
  if (!leftFormulaLines || leftFormulaLines.length === 0) {
    showToast("?섏떇???낅젰?섍퀬 怨꾩궛??癒쇱? ?ㅽ뻾??二쇱꽭??", true);
    return;
  }
  const lines = leftFormulaLines.map((l, i) => {
    if (l.error) return `[${i + 1}] ${l.raw}  ???ㅻ쪟: ${l.error}`;
    return `[${i + 1}] ${l.pretty} = ${l.result}`;
  });
  const content = `[OmniCalc Multi-Line Formula Results]\nExport Time: ${new Date().toLocaleString()}\n\n` + lines.join("\n");
  downloadFile(content, "omnicalc_result.txt", "text/plain");
}

// ----------------------------------------------------
// 2. Grid Management (Right Section)
// ----------------------------------------------------

// Dynamically generate the 3x10 grid cells
function buildGrid() {
  const tbody = document.getElementById("grid-body");
  tbody.innerHTML = "";
  
  for (let r = 0; r < 100; r++) {
    const tr = document.createElement("tr");
    
    // Row number cell
    const rowNumTd = document.createElement("td");
    rowNumTd.className = "row-num-cell";
    rowNumTd.textContent = r + 1;
    tr.appendChild(rowNumTd);

    for (let c = 0; c < 3; c++) {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "grid-cell-input";
      input.setAttribute("data-row", r);
      input.setAttribute("data-col", c);
      input.id = `cell-${r}-${c}`;
      td.appendChild(input);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

// Live compute sums and update grand totals
function calculateGrid() {
  let colSums = [0, 0, 0];
  let allNumbers = [];
  
  for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let r = 0; r < 100; r++) {
      const input = document.getElementById(`cell-${r}-${c}`);
      if (input) {
        const val = input.value.trim();
        if (val !== "") {
          const num = Number(val);
          if (!isNaN(num)) {
            sum += num;
            allNumbers.push(num);
            input.classList.add("has-number");
          } else {
            input.classList.remove("has-number");
          }
        } else {
          input.classList.remove("has-number");
        }
      }
    }
    colSums[c] = sum;
    document.getElementById(`col-sum-${c}`).textContent = formatNumber(sum);
  }
  
  const grandTotal = colSums.reduce((a, b) => a + b, 0);
  document.getElementById("grand-total").textContent = formatNumber(grandTotal);
  
  saveGridState();
}

function formatNumber(num) {
  return Number.isInteger(num) ? num.toString() : parseFloat(num.toFixed(6)).toString();
}

// Reset Grid Content
function clearGrid() {
  for (let r = 0; r < 100; r++) {
    for (let c = 0; c < 3; c++) {
      const input = document.getElementById(`cell-${r}-${c}`);
      if (input) {
        input.value = "";
        input.classList.remove("has-number");
      }
    }
  }
  calculateGrid();
  showToast("洹몃━?쒓? 珥덇린?붾릺?덉뒿?덈떎.");
}

// Copy Grid (a) -> List of all numbers in parentheses e.g. "(1,2,3)"
function copyGridA() {
  const numbers = getGridNumbers();
  if (numbers.length === 0) {
    showToast("?낅젰???レ옄媛 ?놁뒿?덈떎.", true);
    return;
  }
  const result = `(${numbers.join(",")})`;
  copyToClipboard(result);
}

// Copy Grid (b) -> Grand Total Answer only
function copyGridB() {
  const gtValue = document.getElementById("grand-total").textContent;
  copyToClipboard(gtValue);
}

// Export entered numbers into CSV file format
function exportGridCsv() {
  const numbers = getGridNumbers();
  if (numbers.length === 0) {
    showToast("?대낫???レ옄媛 ?놁뒿?덈떎.", true);
    return;
  }
  
  // Method 1: Export only the list of numbers in a single column
  // Method 2: Export the entire 3x10 grid with empty slots.
  // Preserving grid layout is extremely convenient for spreadsheets.
  let csvContent = "";
  for (let r = 0; r < 100; r++) {
    let rowCells = [];
    for (let c = 0; c < 3; c++) {
      const input = document.getElementById(`cell-${r}-${c}`);
      rowCells.push(input ? input.value : "");
    }
    csvContent += rowCells.join(",") + "\r\n";
  }
  
  downloadFile(csvContent, "omnicalc_grid.csv", "text/csv;charset=utf-8;");
}

// Scans grid in row-major order and pulls valid numbers
function getGridNumbers() {
  let numbers = [];
  for (let r = 0; r < 100; r++) {
    for (let c = 0; c < 3; c++) {
      const input = document.getElementById(`cell-${r}-${c}`);
      if (input) {
        const val = input.value.trim();
        if (val !== "") {
          const num = Number(val);
          if (!isNaN(num)) {
            numbers.push(num);
          }
        }
      }
    }
  }
  return numbers;
}

// ----------------------------------------------------
// 3. State Management (LocalStorage)
// ----------------------------------------------------

function saveGridState() {
  let gridState = [];
  for (let r = 0; r < 100; r++) {
    let row = [];
    for (let c = 0; c < 3; c++) {
      const input = document.getElementById(`cell-${r}-${c}`);
      row.push(input ? input.value : "");
    }
    gridState.push(row);
  }
  localStorage.setItem("omnicalc_grid", JSON.stringify(gridState));
}

function loadState() {
  // Restore left section
  const savedFormula = localStorage.getItem("omnicalc_formula");
  if (savedFormula) {
    document.getElementById("formula-input").value = savedFormula;
  }
  const savedResult = localStorage.getItem("omnicalc_formula_result");
  if (savedResult) {
    document.getElementById("formula-result").textContent = savedResult;
    leftFormulaResult = savedResult;
  }

  // Restore right section
  const savedGrid = localStorage.getItem("omnicalc_grid");
  if (savedGrid) {
    try {
      const gridState = JSON.parse(savedGrid);
      for (let r = 0; r < 100; r++) {
        for (let c = 0; c < 3; c++) {
          const input = document.getElementById(`cell-${r}-${c}`);
          if (input && gridState[r] && gridState[r][c] !== undefined) {
            input.value = gridState[r][c];
          }
        }
      }
    } catch (e) {
      console.error("Failed to restore grid state", e);
    }
  }
  calculateGrid(); // Trigger recalculation to display totals
}

// ----------------------------------------------------
// 4. Mobile Layout Sliding Gestures
// ----------------------------------------------------

let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

function slideSection(direction) {
  const track = document.getElementById("workspace-track");
  const tabLeft = document.getElementById("tab-left");
  const tabRight = document.getElementById("tab-right");
  const indicator = document.querySelector(".tab-indicator");

  if (direction === "left") {
    track.style.transform = "translateX(0%)";
    tabLeft.classList.add("active");
    tabRight.classList.remove("active");
    indicator.style.transform = "translateX(0%)";
  } else {
    track.style.transform = "translateX(-50%)";
    tabLeft.classList.remove("active");
    tabRight.classList.add("active");
    indicator.style.transform = "translateX(100%)";
  }
}

function initSwipeGestures() {
  const slider = document.querySelector(".workspace-slider");
  
  slider.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  slider.addEventListener("touchend", (e) => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
  }, { passive: true });
}

function handleSwipe() {
  if (window.innerWidth > 768) return; // Only process on mobile layouts

  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;

  // Ensure swipe is mostly horizontal, not vertical
  if (Math.abs(diffX) > Math.abs(diffY)) {
    if (diffX > 60) {
      // Swiped right -> Switch to left section
      slideSection("left");
    } else if (diffX < -60) {
      // Swiped left -> Switch to right section
      slideSection("right");
    }
  }
}

// ----------------------------------------------------
// 5. Utility Helper Functions
// ----------------------------------------------------

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast("?대┰蹂대뱶??蹂듭궗?섏뿀?듬땲??");
  }).catch(err => {
    console.error("Copy failed", err);
    showToast("蹂듭궗 ?ㅽ뙣. 釉뚮씪?곗? 沅뚰븳???뺤씤??二쇱꽭??", true);
  });
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  if (isError) {
    toast.style.borderColor = "var(--text-danger)";
    toast.style.color = "var(--text-danger)";
  } else {
    toast.style.borderColor = "rgba(255, 255, 255, 0.1)";
    toast.style.color = "#FFF";
  }
  toast.classList.add("show");
  
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function downloadFile(content, fileName, contentType) {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}
