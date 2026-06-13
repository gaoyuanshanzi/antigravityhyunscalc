// State variables
let leftFormulaResult = "";
let leftFormulaExprParsed = "";

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

  // Listen for formula changes to save draft
  document.getElementById("formula-input").addEventListener("input", () => {
    localStorage.setItem("omnicalc_formula", document.getElementById("formula-input").value);
  });

  // Setup mobile swipe detection
  initSwipeGestures();
});

// Demo Formula loader
function loadDemoFormula() {
  const demo = "average(10 pl 2, var.s(3, 5, 7) mu 4) mi sin(30도) pl log(10, 100) upper 3";
  document.getElementById("formula-input").value = demo;
  localStorage.setItem("omnicalc_formula", demo);
  showToast("예제 수식이 로드되었습니다.");
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

  // Parse Degree symbol "도"
  // Example: 30도 -> ((30) * Math.PI / 180)
  expr = expr.replace(/(\d+(?:\.\d+)?)\s*도/g, "(($1) * Math.PI / 180)");

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

// Evaluate & Display
function calculateFormula() {
  const inputEl = document.getElementById("formula-input");
  const resultEl = document.getElementById("formula-result");
  const parsedEl = document.getElementById("formula-parsed");
  
  const rawInput = inputEl.value.trim();
  if (!rawInput) {
    resultEl.textContent = "수식을 입력하세요.";
    resultEl.className = "result-value error";
    parsedEl.textContent = "";
    leftFormulaResult = "";
    return;
  }

  try {
    const parsedExpr = parseFormula(rawInput);
    
    // Evaluate in closed sandboxed scope
    const evaluator = new Function(
      "__log", "__average", "__stdev_s", "__stdev_p", "__var_s", "__var_p", "__permut", "__combin", "factorial",
      `return (${parsedExpr});`
    );
    
    const res = evaluator(
      __log, __average, __stdev_s, __stdev_p, __var_s, __var_p, __permut, __combin, factorial
    );

    if (res === null || res === undefined || isNaN(res)) {
      throw new Error("결과값이 올바르지 않습니다 (NaN).");
    }

    // Output formatting
    const formattedResult = Number.isInteger(res) ? res.toString() : parseFloat(res.toFixed(10)).toString();
    resultEl.textContent = formattedResult;
    resultEl.className = "result-value";
    
    // Display preview of parsed JS math
    parsedEl.textContent = `JS 변환식: ${parsedExpr}`;
    leftFormulaResult = formattedResult;

    // Save calculation history
    localStorage.setItem("omnicalc_formula_result", formattedResult);
  } catch (err) {
    resultEl.textContent = "계산 오류: 입력 공식을 확인하세요.";
    resultEl.className = "result-value error";
    parsedEl.textContent = `에러 상세: ${err.message}`;
    leftFormulaResult = "";
  }
}

// Clear Left Section
function clearFormula() {
  document.getElementById("formula-input").value = "";
  document.getElementById("formula-result").textContent = "대기 중...";
  document.getElementById("formula-result").className = "result-value";
  document.getElementById("formula-parsed").textContent = "";
  leftFormulaResult = "";
  localStorage.removeItem("omnicalc_formula");
  localStorage.removeItem("omnicalc_formula_result");
  showToast("수식이 초기화되었습니다.");
}

// Copy Formula (a) -> Custom Math Symbols + "= Result"
function copyFormulaA() {
  const rawInput = document.getElementById("formula-input").value.trim();
  if (!rawInput || !leftFormulaResult) {
    showToast("계산을 먼저 완료해 주세요.", true);
    return;
  }

  // Prettify math symbols for User Copy
  let prettified = rawInput;
  // Temporary escape functions to prevent mapping issues
  prettified = prettified.replace(/stdev\.s/gi, "##STDEV_S##");
  prettified = prettified.replace(/stdev\.p/gi, "##STDEV_P##");
  prettified = prettified.replace(/var\.s/gi, "##VAR_S##");
  prettified = prettified.replace(/var\.p/gi, "##VAR_P##");
  prettified = prettified.replace(/permut/gi, "##PERMUT##");
  prettified = prettified.replace(/combin/gi, "##COMBIN##");

  // Map to actual mathematical characters
  prettified = prettified.replace(/\bpl\b/gi, "+");
  prettified = prettified.replace(/\bmi\b/gi, "-");
  prettified = prettified.replace(/\bmu\b/gi, "×");
  prettified = prettified.replace(/\bdi\b/gi, "÷");
  prettified = prettified.replace(/\bupper\b/gi, "^");

  // Restore functions
  prettified = prettified.replace(/##STDEV_S##/g, "stdev.s");
  prettified = prettified.replace(/##STDEV_P##/g, "stdev.p");
  prettified = prettified.replace(/##VAR_S##/g, "var.s");
  prettified = prettified.replace(/##VAR_P##/g, "var.p");
  prettified = prettified.replace(/##PERMUT##/g, "permut");
  prettified = prettified.replace(/##COMBIN##/g, "combin");

  const fullText = `${prettified} = ${leftFormulaResult}`;
  copyToClipboard(fullText);
}

// Copy Formula (b) -> Final answer only
function copyFormulaB() {
  if (!leftFormulaResult) {
    showToast("계산을 먼저 완료해 주세요.", true);
    return;
  }
  copyToClipboard(leftFormulaResult);
}

// Export formula calculation details as txt file
function exportFormulaTxt() {
  const rawInput = document.getElementById("formula-input").value.trim();
  if (!rawInput || !leftFormulaResult) {
    showToast("수식을 입력하고 계산을 먼저 실행해 주세요.", true);
    return;
  }

  // Same pretty mapping as Copy A
  let prettified = rawInput
    .replace(/\bpl\b/gi, "+")
    .replace(/\bmi\b/gi, "-")
    .replace(/\bmu\b/gi, "×")
    .replace(/\bdi\b/gi, "÷")
    .replace(/\bupper\b/gi, "^");

  const content = `[OmniCalc Formula Result]\nOriginal Input: ${rawInput}\nMathematical Expression: ${prettified}\nResult: ${leftFormulaResult}\nExport Time: ${new Date().toLocaleString()}`;
  downloadFile(content, "omnicalc_result.txt", "text/plain");
}

// ----------------------------------------------------
// 2. Grid Management (Right Section)
// ----------------------------------------------------

// Dynamically generate the 3x10 grid cells
function buildGrid() {
  const tbody = document.getElementById("grid-body");
  tbody.innerHTML = "";
  
  for (let r = 0; r < 10; r++) {
    const tr = document.createElement("tr");
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
    for (let r = 0; r < 10; r++) {
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
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 3; c++) {
      const input = document.getElementById(`cell-${r}-${c}`);
      if (input) {
        input.value = "";
        input.classList.remove("has-number");
      }
    }
  }
  calculateGrid();
  showToast("그리드가 초기화되었습니다.");
}

// Copy Grid (a) -> List of all numbers in parentheses e.g. "(1,2,3)"
function copyGridA() {
  const numbers = getGridNumbers();
  if (numbers.length === 0) {
    showToast("입력된 숫자가 없습니다.", true);
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
    showToast("내보낼 숫자가 없습니다.", true);
    return;
  }
  
  // Method 1: Export only the list of numbers in a single column
  // Method 2: Export the entire 3x10 grid with empty slots.
  // Preserving grid layout is extremely convenient for spreadsheets.
  let csvContent = "";
  for (let r = 0; r < 10; r++) {
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
  for (let r = 0; r < 10; r++) {
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
  for (let r = 0; r < 10; r++) {
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
      for (let r = 0; r < 10; r++) {
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
    showToast("클립보드에 복사되었습니다!");
  }).catch(err => {
    console.error("Copy failed", err);
    showToast("복사 실패. 브라우저 권한을 확인해 주세요.", true);
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
