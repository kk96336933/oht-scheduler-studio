// Global State
let jobs = [];
let ocrStagingJobs = [];
let manualStagingJobs = [];
let globalResults = [];
let globalMachineCount = 2;

// DOM Elements
const jobsTbody = document.getElementById('jobs-tbody');
const machineCountInput = document.getElementById('machine-count');
const btnRun = document.getElementById('btn-run');
const btnClear = document.getElementById('btn-clear');
const btnExport = document.getElementById('btn-export');
const kpiPanel = document.getElementById('kpi-panel');
const resultsPanel = document.getElementById('results-panel');
const consoleLogs = document.getElementById('console-logs');
const ganttSvg = document.getElementById('gantt-svg');
const ganttTooltip = document.getElementById('gantt-tooltip');

// Dropzone elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const ocrLoading = document.getElementById('ocr-loading');
const ocrProgress = document.getElementById('ocr-progress');
const ocrStatusText = document.getElementById('ocr-status-text');

// Modal elements
const modalOcrVerify = document.getElementById('modal-ocr-verify');
const ocrVerifyTbody = document.getElementById('ocr-verify-tbody');
const manualInputTbody = document.getElementById('manual-input-tbody');

// Standard Presets
const presets = {
  1: {
    machines: 2,
    jobs: [
      { id: 'L2', release: 0, duration: 7, due: 9 },
      { id: 'L1', release: 0, duration: 8, due: 10 },
      { id: 'L3', release: 1, duration: 6, due: 8 },
      { id: 'L4', release: 2, duration: 5, due: 10 },
      { id: 'L6', release: 4, duration: 4, due: 12 },
      { id: 'L5', release: 3, duration: 9, due: 13 }
    ]
  },
  2: {
    machines: 3,
    jobs: [
      { id: 'L1', release: 0, duration: 8, due: 14 },
      { id: 'L2', release: 0, duration: 6, due: 12 },
      { id: 'L3', release: 1, duration: 5, due: 10 },
      { id: 'L4', release: 2, duration: 7, due: 15 },
      { id: 'L5', release: 3, duration: 4, due: 13 },
      { id: 'L6', release: 4, duration: 9, due: 20 },
      { id: 'L7', release: 5, duration: 3, due: 11 },
      { id: 'L8', release: 6, duration: 6, due: 18 },
      { id: 'L9', release: 7, duration: 5, due: 17 },
      { id: 'L10', release: 8, duration: 4, due: 16 }
    ]
  },
  3: {
    machines: 2,
    jobs: [
      { id: 'L1', release: 0, duration: 8, due: 10 },
      { id: 'L2', release: 0, duration: 7, due: 9 },
      { id: 'L3', release: 1, duration: 6, due: 8 },
      { id: 'L4', release: 1, duration: 5, due: 10 },
      { id: 'L5', release: 3, duration: 9, due: 13 },
      { id: 'L6', release: 4, duration: 4, due: 12 }
    ]
  }
};

// Initialize app with Preset 1
window.addEventListener('DOMContentLoaded', () => {
  loadPreset(1);
  setupDragAndDrop();
  initManualStaging();
  
  // Connect primary action/input triggers
  btnRun.addEventListener('click', () => runScheduling(true));
  btnClear.addEventListener('click', clearAllData);
  btnExport.addEventListener('click', exportToExcel);
  
  // Instruction 1: Instantly reschedule when OHT machine count is changed!
  machineCountInput.addEventListener('change', () => runScheduling(false));
  machineCountInput.addEventListener('input', () => runScheduling(false));
});

// Debounce helper to optimize performance during rapid window resizing
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Instruction 3 Extension: Dynamically resize Gantt Chart on window resizing (with 150ms debounce!)
window.addEventListener('resize', debounce(() => {
  const ganttTab = document.getElementById('tab-gantt');
  if (ganttTab && ganttTab.classList.contains('active') && globalResults.length > 0) {
    renderGanttChart(globalResults, globalMachineCount);
  }
}, 150));

// Load preset data
function loadPreset(presetNum) {
  const data = presets[presetNum];
  if (!data) return;
  
  machineCountInput.value = data.machines;
  jobs = data.jobs.map(j => ({ ...j }));
  renderJobsTable();
  
  // Instantly run the scheduler for the preset so the page looks stunning on load
  runScheduling();
}

// Render the main table editor
function renderJobsTable() {
  jobsTbody.innerHTML = '';
  const fragment = document.createDocumentFragment();
  
  jobs.forEach((job, index) => {
    const slack = job.due - job.release - job.duration;
    let urgencyClass = 'row-urgency-low';
    if (slack <= 2) {
      urgencyClass = 'row-urgency-high';
    } else if (slack <= 6) {
      urgencyClass = 'row-urgency-medium';
    }

    const tr = document.createElement('tr');
    tr.className = urgencyClass;
    tr.innerHTML = `
      <td><input type="text" class="table-input" value="${job.id}" style="font-weight:600; color:var(--accent-cyan);" onchange="updateJobField(${index}, 'id', this.value)"></td>
      <td><input type="number" class="table-input" value="${job.release}" min="0" onchange="updateJobField(${index}, 'release', parseInt(this.value) || 0)"></td>
      <td><input type="number" class="table-input" value="${job.duration}" min="1" onchange="updateJobField(${index}, 'duration', parseInt(this.value) || 1)"></td>
      <td><input type="number" class="table-input" value="${job.due}" min="0" onchange="updateJobField(${index}, 'due', parseInt(this.value) || 0)"></td>
      <td style="text-align: center;">
        <button class="btn btn-danger btn-icon-only" onclick="deleteJobRow(${index})" title="刪除此批次">×</button>
      </td>
    `;
    fragment.appendChild(tr);
  });
  
  jobsTbody.appendChild(fragment);
}

function updateJobField(index, field, value) {
  if (index >= 0 && index < jobs.length) {
    jobs[index][field] = value;
    updateRowUrgencyStyle(index);
    runScheduling(false);
  }
}

function updateRowUrgencyStyle(index) {
  const rows = jobsTbody.querySelectorAll('tr');
  if (rows[index]) {
    const job = jobs[index];
    const slack = job.due - job.release - job.duration;
    rows[index].classList.remove('row-urgency-high', 'row-urgency-medium', 'row-urgency-low');
    if (slack <= 2) {
      rows[index].classList.add('row-urgency-high');
    } else if (slack <= 6) {
      rows[index].classList.add('row-urgency-medium');
    } else {
      rows[index].classList.add('row-urgency-low');
    }
  }
}

function deleteJobRow(index) {
  jobs.splice(index, 1);
  renderJobsTable();
  runScheduling(false);
}

function addJobRow() {
  let newNum = 1;
  while (jobs.some(j => j.id === `L${newNum}`)) {
    newNum++;
  }
  jobs.push({
    id: `L${newNum}`,
    release: 0,
    duration: 5,
    due: 10
  });
  renderJobsTable();
  runScheduling(false);
}

function clearAllData() {
  jobs = [];
  renderJobsTable();
  
  // Hide result panels
  kpiPanel.style.display = 'none';
  resultsPanel.style.display = 'none';
}

// Switch between input tabs
function switchInputTab(tabId) {
  // Toggle tab buttons (select only inside the input zone)
  document.querySelectorAll('.dropzone-container .tab-btn').forEach(btn => {
    const clickAttr = btn.getAttribute('onclick') || '';
    if (clickAttr.includes(tabId)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Toggle contents (select only inside the input zone)
  document.querySelectorAll('.dropzone-container .tab-content').forEach(content => {
    if (content.id === tabId) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

// Manual Staging Input Management
function initManualStaging() {
  manualStagingJobs = [
    { id: 'L1', release: 0, duration: 5, due: 10 },
    { id: 'L2', release: 0, duration: 5, due: 10 },
    { id: 'L3', release: 0, duration: 5, due: 10 }
  ];
  renderManualStagingTable();
}

function renderManualStagingTable() {
  manualInputTbody.innerHTML = '';
  const fragment = document.createDocumentFragment();
  
  manualStagingJobs.forEach((job, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span style="font-weight:600; color:var(--accent-cyan);">${job.id}</span></td>
      <td><input type="number" class="table-input" value="${job.release}" min="0" onchange="updateManualStagingField(${index}, 'release', parseInt(this.value) || 0)"></td>
      <td><input type="number" class="table-input" value="${job.duration}" min="1" onchange="updateManualStagingField(${index}, 'duration', parseInt(this.value) || 1)"></td>
      <td><input type="number" class="table-input" value="${job.due}" min="0" onchange="updateManualStagingField(${index}, 'due', parseInt(this.value) || 0)"></td>
      <td style="text-align: center;">
        <button class="btn btn-danger btn-icon-only" onclick="deleteManualStagingRow(${index})" title="刪除" style="width:22px; height:22px; font-size:11px;">×</button>
      </td>
    `;
    fragment.appendChild(tr);
  });
  
  manualInputTbody.appendChild(fragment);
}

function updateManualStagingField(index, field, value) {
  if (index >= 0 && index < manualStagingJobs.length) {
    manualStagingJobs[index][field] = value;
  }
}

function addManualStagingRow() {
  let newNum = 1;
  while (manualStagingJobs.some(j => j.id === `L${newNum}`)) {
    newNum++;
  }
  manualStagingJobs.push({
    id: `L${newNum}`,
    release: 0,
    duration: 5,
    due: 10
  });
  renderManualStagingTable();
}

function deleteManualStagingRow(index) {
  manualStagingJobs.splice(index, 1);
  renderManualStagingTable();
}

function clearManualStaging() {
  manualStagingJobs = [];
  renderManualStagingTable();
}

function confirmManualImport() {
  if (manualStagingJobs.length === 0) {
    alert('暫存列表為空，請先新增 Lot 批次！');
    return;
  }
  
  // Deep copy to main jobs array
  jobs = manualStagingJobs.map(j => ({
    id: j.id,
    release: j.release,
    duration: j.duration,
    due: j.due
  }));
  
  renderJobsTable();
  runScheduling();
}

// Export Scheduler Report to Excel-compatible CSV
function exportToExcel() {
  if (globalResults.length === 0) {
    alert('目前沒有可導出的排程數據！請先執行天車調度計算。');
    return;
  }
  
  // Sort results by actual start time to get the correct dispatch order (same as UI schedule table)
  const sorted = [...globalResults].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.machine - b.machine;
  });
  
  // Create CSV header content
  let csvContent = "順序,Lot ID,指派天車 (OHT),開始時間 (起),結束時間 (訖),需求交期 (Due),延遲時間 (Tardiness),狀態\n";
  
  // Populate Rows
  sorted.forEach((res, index) => {
    let statusText = "";
    if (res.tardiness > 2) {
      statusText = `嚴重延遲 ${res.tardiness}`;
    } else if (res.tardiness > 0) {
      statusText = `輕微延遲 ${res.tardiness}`;
    } else {
      statusText = "準時";
    }
    
    const row = [
      index + 1,
      res.id,
      `OHT ${res.machine}`,
      res.start,
      res.end,
      res.due,
      res.tardiness,
      statusText
    ].map(val => `"${val}"`).join(",");
    
    csvContent += row + "\n";
  });
  
  // Add UTF-8 BOM so Excel opens Chinese characters perfectly without garbled text
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Create dynamic download link and trigger click
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `OHT_SPT_Scheduler_Report_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Setup drag and drop for image upload
function setupDragAndDrop() {
  dropZone.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      processOcrImage(e.target.files[0]);
    }
  });
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      processOcrImage(e.dataTransfer.files[0]);
    }
  });
}

// Parse copy-pasted spreadsheet cells
function parsePastedData() {
  const pasteText = document.getElementById('paste-input').value.trim();
  if (!pasteText) {
    alert('請先貼上資料！');
    return;
  }
  
  const parsedJobs = [];
  const lines = pasteText.split('\n');
  
  lines.forEach(line => {
    const cleanedLine = line.trim();
    if (!cleanedLine) return;
    
    // Ignore header lines
    if (/(?:任務|Lot|可開始|搬運|需求|Release|Duration|Due|Time|起點|終點|Header)/i.test(cleanedLine)) {
      return;
    }
    
    // Split by comma, tab, or consecutive spaces
    let columns = cleanedLine.split(/[\t,]+/);
    if (columns.length <= 1) {
      columns = cleanedLine.split(/\s+/);
    }
    
    // 1. Identify Lot ID
    let lotId = '';
    // Search for a column matching L1, L2, etc.
    for (let col of columns) {
      let colClean = col.trim();
      let match = colClean.match(/^[Ll]\d+$/);
      if (match) {
        lotId = colClean.toUpperCase();
        break;
      }
    }
    
    // If not found, look for any column containing 'L' or 'l' followed by a number
    if (!lotId) {
      for (let col of columns) {
        let colClean = col.trim();
        let match = colClean.match(/[Ll]\d+/);
        if (match) {
          lotId = match[0].toUpperCase();
          break;
        }
      }
    }
    
    // Fallback: look for Task ID (T1, T2...)
    if (!lotId) {
      for (let col of columns) {
        let colClean = col.trim();
        let match = colClean.match(/[Tt]\d+/);
        if (match) {
          lotId = match[0].toUpperCase();
          break;
        }
      }
    }
    
    // 2. Extract all valid integers from columns
    let integers = [];
    columns.forEach(col => {
      let colClean = col.trim();
      // Check if the column is a pure number
      if (/^\d+$/.test(colClean)) {
        integers.push(parseInt(colClean));
      }
    });
    
    // If we have at least 3 integers, the last three represent Release, Duration, Due
    if (integers.length >= 3) {
      const len = integers.length;
      let release = integers[len - 3];
      let duration = integers[len - 2];
      let due = integers[len - 1];
      
      if (!lotId) {
        lotId = `L${parsedJobs.length + 1}`;
      }
      
      parsedJobs.push({
        id: lotId,
        release: Math.max(0, release),
        duration: Math.max(1, duration),
        due: Math.max(0, due)
      });
    }
  });
  
  if (parsedJobs.length > 0) {
    jobs = parsedJobs;
    renderJobsTable();
    switchInputTab('tab-ocr'); // switch back
    document.getElementById('paste-input').value = '';
    runScheduling();
  } else {
    alert('無法解析輸入的數據！請確保資料行包含 Lot 名稱（如 L1）以及三個關鍵數值（可開始時間、搬運時間、需求時間），並以空格、逗號或 Tab 分隔。');
  }
}

// OCR Processing with Tesseract.js
function processOcrImage(file) {
  if (!file) return;
  
  dropZone.style.display = 'none';
  ocrLoading.style.display = 'flex';
  ocrProgress.style.width = '0%';
  ocrStatusText.innerText = '正在初始化 OCR 引擎...';
  
  // Initialize Tesseract worker
  Tesseract.recognize(
    file,
    'chi_tra+eng', // traditional chinese + english
    {
      logger: m => {
        if (m.status === 'recognizing text') {
          const progress = Math.round(m.progress * 100);
          ocrProgress.style.width = `${progress}%`;
          ocrStatusText.innerText = `正在讀取文字內容: ${progress}%`;
        } else {
          ocrStatusText.innerText = m.status;
        }
      }
    }
  ).then(({ data: { text } }) => {
    console.log("OCR Recognized Text:\n", text);
    ocrLoading.style.display = 'none';
    dropZone.style.display = 'flex';
    
    parseOcrText(text);
  }).catch(err => {
    console.error("OCR Error:", err);
    alert("圖片文字辨識失敗：" + err.message);
    ocrLoading.style.display = 'none';
    dropZone.style.display = 'flex';
  });
}

// Extract table rows from raw OCR text
function parseOcrText(text) {
  ocrStagingJobs = [];
  const lines = text.split('\n');
  
  lines.forEach(line => {
    const cleanedLine = line.trim();
    if (!cleanedLine) return;
    
    // Find sequence of numbers in the line
    const numbers = cleanedLine.match(/\d+/g);
    if (!numbers) return;
    
    // Look for Lot indicators like "L1", "L-2", "Lot 2", etc. (Prioritize L/Lot over T/Task)
    let lotMatch = cleanedLine.match(/(?:[lL][oO][tT]\s*|[lL])\s*(\d+)/);
    if (!lotMatch) {
      lotMatch = cleanedLine.match(/(?:[tT][aA][sS][kK]\s*|[tT])\s*(\d+)/);
    }
    if (!lotMatch) {
      lotMatch = cleanedLine.match(/([a-zA-Z]+\d+)/);
    }
    
    let lotName = '';
    if (lotMatch) {
      lotName = lotMatch[0].replace(/\s+/g, '').toUpperCase();
    }
    
    // If we have at least 3 numbers on the line, the last three represent Release, Duration, Due
    if (numbers.length >= 3) {
      const len = numbers.length;
      const release = parseInt(numbers[len-3]);
      const duration = parseInt(numbers[len-2]);
      const due = parseInt(numbers[len-1]);
      
      if (!lotName) {
        lotName = `L${ocrStagingJobs.length + 1}`;
      }
      
      // Clean and validate
      if (!isNaN(release) && !isNaN(duration) && !isNaN(due)) {
        ocrStagingJobs.push({
          id: lotName,
          release: Math.max(0, release),
          duration: Math.max(1, duration),
          due: Math.max(0, due),
          keep: true
        });
      }
    }
  });
  
  if (ocrStagingJobs.length > 0) {
    showOcrModal();
  } else {
    alert("未能從圖片中辨識出合法的排程表格。請確認圖片解析度是否清晰，或直接使用「複製貼上數據」！");
  }
}

// Modal actions
function showOcrModal() {
  renderOcrStagingTable();
  modalOcrVerify.classList.add('active');
}

function renderOcrStagingTable() {
  ocrVerifyTbody.innerHTML = '';
  const fragment = document.createDocumentFragment();
  
  ocrStagingJobs.forEach((job, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="table-input" value="${job.id}" style="font-weight:600; color:var(--accent-cyan);" onchange="updateOcrStagingField(${index}, 'id', this.value)"></td>
      <td><input type="number" class="table-input" value="${job.release}" min="0" onchange="updateOcrStagingField(${index}, 'release', parseInt(this.value) || 0)"></td>
      <td><input type="number" class="table-input" value="${job.duration}" min="1" onchange="updateOcrStagingField(${index}, 'duration', parseInt(this.value) || 1)"></td>
      <td><input type="number" class="table-input" value="${job.due}" min="0" onchange="updateOcrStagingField(${index}, 'due', parseInt(this.value) || 0)"></td>
      <td style="text-align: center;">
        <input type="checkbox" ${job.keep ? 'checked' : ''} onchange="updateOcrStagingField(${index}, 'keep', this.checked)">
      </td>
    `;
    fragment.appendChild(tr);
  });
  ocrVerifyTbody.appendChild(fragment);
}

function addOcrStagingRow() {
  let newNum = 1;
  while (ocrStagingJobs.some(j => j.id === `L${newNum}`)) {
    newNum++;
  }
  ocrStagingJobs.push({
    id: `L${newNum}`,
    release: 0,
    duration: 5,
    due: 10,
    keep: true
  });
  renderOcrStagingTable();
}

function updateOcrStagingField(index, field, value) {
  if (index >= 0 && index < ocrStagingJobs.length) {
    ocrStagingJobs[index][field] = value;
  }
}

function closeOcrModal() {
  modalOcrVerify.classList.remove('active');
}

function confirmOcrImport() {
  jobs = ocrStagingJobs.filter(j => j.keep).map(j => ({
    id: j.id,
    release: j.release,
    duration: j.duration,
    due: j.due
  }));
  
  renderJobsTable();
  closeOcrModal();
  runScheduling();
}

// SPT Scheduling calculation engine
function runScheduling(isManual = false) {
  if (jobs.length === 0) {
    if (isManual) {
      alert('任務列表為空！請先載入預設題目、貼上數據或手動新增 Lot 批次。');
    }
    kpiPanel.style.display = 'none';
    resultsPanel.style.display = 'none';
    return;
  }
  
  const machineCount = parseInt(machineCountInput.value) || 2;
  
  // Deep copy jobs to work on
  let pendingJobs = jobs.map(j => ({ ...j, scheduled: false }));
  let machineFreeTime = Array(machineCount).fill(0);
  let results = [];
  let traceLogs = [];
  
  let currentTime = 0;
  
  traceLogs.push({
    time: 0,
    type: 'init',
    message: `🔧 系統初始化：天車數量 = ${machineCount}台，任務總數 = ${pendingJobs.length}個`
  });
  
  while (pendingJobs.some(j => !j.scheduled)) {
    // 1. Get lists of available (released) and unreleased jobs
    let unreleasedJobs = pendingJobs.filter(j => !j.scheduled && j.release > currentTime);
    let availableJobs = pendingJobs.filter(j => !j.scheduled && j.release <= currentTime);
    
    // 2. If no jobs are currently available, advance time to the earliest release time of unreleased jobs
    if (availableJobs.length === 0 && unreleasedJobs.length > 0) {
      let nextReleaseTime = Math.min(...unreleasedJobs.map(j => j.release));
      traceLogs.push({
        time: currentTime,
        type: 'wait',
        message: `⏳ 目前無可用任務，時間快轉至下一個任務到達時間: <span class="console-time">t=${nextReleaseTime}</span>`
      });
      currentTime = nextReleaseTime;
      continue;
    }
    
    // 3. Find machines that are free at or before currentTime
    let availableMachines = [];
    for (let i = 0; i < machineCount; i++) {
      if (machineFreeTime[i] <= currentTime) {
        availableMachines.push(i);
      }
    }
    
    // 4. If no machines are free, advance time to the earliest machine free time
    if (availableMachines.length === 0) {
      let nextFreeTime = Math.min(...machineFreeTime);
      traceLogs.push({
        time: currentTime,
        type: 'wait',
        message: `⏳ 目前所有天車皆處於搬運狀態，時間快轉至最快空閒天車時間: <span class="console-time">t=${nextFreeTime}</span>`
      });
      currentTime = nextFreeTime;
      continue;
    }
    
    // Sort available machines by their free time to prioritize the earliest free (or natural sequential order for ties)
    availableMachines.sort((a, b) => {
      if (machineFreeTime[a] !== machineFreeTime[b]) {
        return machineFreeTime[a] - machineFreeTime[b];
      }
      return a - b;
    });
    
    // Sort available jobs by SPT (Shortest Processing Time / Duration)
    // Tie breaker: alphabetical Lot ID (ascending, numerical aware) to guarantee deterministic sorting on ties
    availableJobs.sort((a, b) => {
      if (a.duration !== b.duration) return a.duration - b.duration;
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    traceLogs.push({
      time: currentTime,
      type: 'decision',
      message: `<span class="console-decision">🔍 時間點 t=${currentTime} 決策點：</span>`,
      sublogs: [
        `• 可用天車：${availableMachines.map(m => `OHT${m+1}`).join(', ')}`,
        `• 待排程隊伍 (已到達)：${availableJobs.map(j => `${j.id}(搬運:${j.duration})`).join(' → ')}`,
        `• 排程規則：SPT 最短處理時間優先`
      ]
    });
    
    // 5. Dispatch jobs to available machines
    for (let mIdx of availableMachines) {
      if (availableJobs.length === 0) break;
      
      let job = availableJobs.shift();
      let start = Math.max(machineFreeTime[mIdx], job.release);
      let end = start + job.duration;
      let tardiness = Math.max(0, end - job.due);
      
      // Update state directly by reference to prevent duplicate ID infinite loop
      job.scheduled = true;
      machineFreeTime[mIdx] = end;
      
      results.push({
        id: job.id,
        machine: mIdx + 1,
        start: start,
        end: end,
        duration: job.duration,
        due: job.due,
        tardiness: tardiness
      });
      
      traceLogs.push({
        time: currentTime,
        type: 'dispatch',
        message: `<span class="console-dispatch">🚚 派工：指派 ${job.id} 至 OHT${mIdx+1}</span>`,
        sublogs: [
          `• 運行時間：${start} → ${end} (搬運歷時: ${job.duration})`,
          `• 需求交期：${job.due}`,
          `• 延遲狀況：${tardiness > 0 ? `⚠️ 延遲 ${tardiness} 單元` : '✅ 準時送達'}`
        ]
      });
    }
  }
  
  traceLogs.push({
    time: Math.max(...machineFreeTime),
    type: 'done',
    message: `🏁 排程計算完畢！所有任務已成功排程。`
  });
  
  // Save results globally for redraws (e.g., when tabs switch)
  globalResults = results;
  globalMachineCount = machineCount;

  // Show parent result panel
  resultsPanel.style.display = 'block';

  // Calculate and display metrics
  displayKPIs(results, machineCount);
  renderTraceLogs(traceLogs);
  renderResultsAndFlow(results);
  
  // Instruction 3: Wait a tiny bit (50ms) for the browser to lay out the resultsPanel (display: block)
  // so that the Gantt SVG parent element has a valid, non-zero clientWidth!
  setTimeout(() => {
    renderGanttChart(results, machineCount);
  }, 50);
}

// Display KPI metric cards
function displayKPIs(results, machineCount) {
  const makespan = Math.max(...results.map(r => r.end));
  const totalTardiness = results.reduce((sum, r) => sum + r.tardiness, 0);
  const avgTardiness = (totalTardiness / results.length).toFixed(2);
  const maxTardiness = Math.max(...results.map(r => r.tardiness));
  
  // Calculate utilization: active time divided by total capacity (makespan * machineCount)
  const totalActiveTime = results.reduce((sum, r) => sum + r.duration, 0);
  const utilization = ((totalActiveTime / (makespan * machineCount)) * 100).toFixed(1);
  
  const onTimeCount = results.filter(r => r.tardiness === 0).length;
  const otdRate = ((onTimeCount / results.length) * 100).toFixed(1);
  
  document.getElementById('kpi-makespan').innerText = `${makespan}`;
  document.getElementById('kpi-avg-tardiness').innerText = `${avgTardiness}`;
  document.getElementById('kpi-max-tardiness').innerText = `${maxTardiness}`;
  document.getElementById('kpi-utilization').innerText = `${utilization}%`;
  document.getElementById('kpi-otd').innerText = `${otdRate}%`;
  
  kpiPanel.style.display = 'grid';
}

// Render dynamic SVG Gantt Chart
function renderGanttChart(results, machineCount) {
  ganttSvg.innerHTML = '';
  
  const makespan = Math.max(...results.map(r => r.end));
  
  // Calculate containerWidth with robust fallbacks in case parent is hidden or layout hasn't painted yet!
  let containerWidth = 0;
  if (ganttSvg && ganttSvg.parentElement) {
    containerWidth = ganttSvg.parentElement.clientWidth - 32;
  }
  if (containerWidth <= 100) {
    const mainPanel = document.querySelector('main');
    containerWidth = (mainPanel ? mainPanel.clientWidth : 800) - 32;
  }
  if (containerWidth <= 100) {
    containerWidth = 700; // Final safe hard-coded fallback to guarantee valid positive dimensions
  }
  
  // Sort results by actual start time to get the correct dispatch order!
  const sortedResults = [...results].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.machine - b.machine;
  });
  
  // Chart dimensions
  const margin = { top: 30, right: 40, bottom: 30, left: 70 };
  const rowHeight = 45;
  const chartHeight = machineCount * rowHeight;
  
  // Anti-crush logic: guarantee at least 25px per time unit, minimum 800px width.
  // When makespan is large, the SVG expands horizontally, triggering the container's scrollbar.
  const svgWidth = Math.max(containerWidth, makespan * 25, 800);
  const chartWidth = svgWidth - margin.left - margin.right;
  
  ganttSvg.setAttribute('width', svgWidth);
  ganttSvg.setAttribute('height', chartHeight + margin.top + margin.bottom);
  
  // Time unit scale factor
  const timeScale = chartWidth / Math.max(1, makespan);
  
  // Create Main SVG Group
  const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  mainGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
  ganttSvg.appendChild(mainGroup);
  
  // Draw Background Grid (Timeline Scale)
  const step = Math.ceil(makespan / 15) || 1;
  for (let t = 0; t <= makespan; t += step) {
    const x = t * timeScale;
    
    // Vertical grid line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', 0);
    line.setAttribute('x2', x);
    line.setAttribute('y2', chartHeight);
    line.setAttribute('stroke', 'rgba(255, 255, 255, 0.08)');
    line.setAttribute('stroke-dasharray', '4,4');
    mainGroup.appendChild(line);
    
    // Scale label text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', -8);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', 'var(--text-muted)');
    text.setAttribute('font-size', '11px');
    text.setAttribute('font-weight', '500');
    text.textContent = t;
    mainGroup.appendChild(text);
    
    const textBottom = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textBottom.setAttribute('x', x);
    textBottom.setAttribute('y', chartHeight + 15);
    textBottom.setAttribute('text-anchor', 'middle');
    textBottom.setAttribute('fill', 'var(--text-muted)');
    textBottom.setAttribute('font-size', '11px');
    textBottom.setAttribute('font-weight', '500');
    textBottom.textContent = t;
    mainGroup.appendChild(textBottom);
  }
  
  // Draw Machine horizontal lanes
  for (let m = 0; m < machineCount; m++) {
    const y = m * rowHeight;
    
    // Shaded OHT background lanes for extra depth
    const laneBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    laneBg.setAttribute('x', -margin.left);
    laneBg.setAttribute('y', y);
    laneBg.setAttribute('width', margin.left);
    laneBg.setAttribute('height', rowHeight);
    laneBg.setAttribute('fill', 'rgba(10, 15, 30, 0.7)');
    mainGroup.appendChild(laneBg);

    // Row separator line
    if (m > 0) {
      const rowLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      rowLine.setAttribute('x1', -margin.left);
      rowLine.setAttribute('y1', y);
      rowLine.setAttribute('x2', chartWidth);
      rowLine.setAttribute('y2', y);
      rowLine.setAttribute('stroke', 'rgba(255, 255, 255, 0.05)');
      mainGroup.appendChild(rowLine);
    }
    
    // Machine label text on the left margin
    const mLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    mLabel.setAttribute('x', -15);
    mLabel.setAttribute('y', y + rowHeight / 2 + 4);
    mLabel.setAttribute('text-anchor', 'end');
    mLabel.setAttribute('fill', 'var(--accent-emerald)'); // Emphasize SPT theme color!
    mLabel.setAttribute('font-size', '13px');
    mLabel.setAttribute('font-weight', '600');
    mLabel.textContent = `OHT ${m + 1}`;
    mainGroup.appendChild(mLabel);
  }

  // Draw vertical axis line dividing OHT column and timeline
  const yAxisLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  yAxisLine.setAttribute('x1', 0);
  yAxisLine.setAttribute('y1', 0);
  yAxisLine.setAttribute('x2', 0);
  yAxisLine.setAttribute('y2', chartHeight);
  yAxisLine.setAttribute('stroke', 'rgba(255, 255, 255, 0.15)');
  yAxisLine.setAttribute('stroke-width', '1.5');
  mainGroup.appendChild(yAxisLine);
  
  // Draw Job blocks
  results.forEach(res => {
    const x = res.start * timeScale;
    const y = (res.machine - 1) * rowHeight + 6;
    const width = res.duration * timeScale;
    const height = rowHeight - 12;
    
    const blockGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    // Rect item
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'gantt-bar');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    
    // Style and Color gradients based on semantic tiers
    let shadowColor;
    if (res.tardiness > 2) {
      shadowColor = '#f43f5e';
      rect.setAttribute('fill', 'url(#grad-critical)');
    } else if (res.tardiness > 0) {
      shadowColor = '#f59e0b';
      rect.setAttribute('fill', 'url(#grad-warning)');
    } else {
      shadowColor = '#10b981'; // Cool sleek emerald theme for SPT on-time!
      rect.setAttribute('fill', 'url(#grad-ontime)');
    }
    
    rect.style.setProperty('--bar-shadow', shadowColor);
    
    // Text label inside the block
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', x + width / 2);
    txt.setAttribute('y', y + height / 2 + 4);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('fill', '#fff');
    txt.setAttribute('font-size', '12px');
    txt.setAttribute('font-weight', '600');
    txt.textContent = res.id;
    
    // Fallback if width is too small for text
    if (width < 30) {
      txt.setAttribute('display', 'none');
    }
    
    blockGroup.appendChild(rect);
    blockGroup.appendChild(txt);
    mainGroup.appendChild(blockGroup);
    
    // Add Tooltip handlers
    blockGroup.addEventListener('mouseenter', (e) => {
      showTooltip(e, res);
    });
    
    blockGroup.addEventListener('mousemove', (e) => {
      moveTooltip(e);
    });
    
    blockGroup.addEventListener('mouseleave', () => {
      hideTooltip();
    });
  });
  
  // Inject Gradients definitions to SVG
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  
  // On time Gradient (Emerald-Cyan)
  const gradOnTime = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  gradOnTime.setAttribute('id', 'grad-ontime');
  gradOnTime.setAttribute('x1', '0%');
  gradOnTime.setAttribute('y1', '0%');
  gradOnTime.setAttribute('x2', '100%');
  gradOnTime.setAttribute('y2', '100%');
  
  const stopO1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stopO1.setAttribute('offset', '0%');
  stopO1.setAttribute('stop-color', '#10b981');
  
  const stopO2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stopO2.setAttribute('offset', '100%');
  stopO2.setAttribute('stop-color', '#059669');
  
  gradOnTime.appendChild(stopO1);
  gradOnTime.appendChild(stopO2);
  defs.appendChild(gradOnTime);
  
  // Warning Gradient (Amber)
  const gradWarning = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  gradWarning.setAttribute('id', 'grad-warning');
  gradWarning.setAttribute('x1', '0%');
  gradWarning.setAttribute('y1', '0%');
  gradWarning.setAttribute('x2', '100%');
  gradWarning.setAttribute('y2', '100%');
  
  const stopW1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stopW1.setAttribute('offset', '0%');
  stopW1.setAttribute('stop-color', '#f59e0b');
  
  const stopW2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stopW2.setAttribute('offset', '100%');
  stopW2.setAttribute('stop-color', '#d97706');
  
  gradWarning.appendChild(stopW1);
  gradWarning.appendChild(stopW2);
  defs.appendChild(gradWarning);
  
  // Critical Gradient (Rose)
  const gradCritical = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  gradCritical.setAttribute('id', 'grad-critical');
  gradCritical.setAttribute('x1', '0%');
  gradCritical.setAttribute('y1', '0%');
  gradCritical.setAttribute('x2', '100%');
  gradCritical.setAttribute('y2', '100%');
  
  const stopC1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stopC1.setAttribute('offset', '0%');
  stopC1.setAttribute('stop-color', '#f43f5e');
  
  const stopC2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stopC2.setAttribute('offset', '100%');
  stopC2.setAttribute('stop-color', '#be123c');
  
  gradCritical.appendChild(stopC1);
  gradCritical.appendChild(stopC2);
  defs.appendChild(gradCritical);
  
  ganttSvg.appendChild(defs);
}

// Interactive Tooltip Methods
function showTooltip(event, res) {
  ganttTooltip.style.display = 'block';
  
  let tardinessMsg = '';
  if (res.tardiness > 2) {
    tardinessMsg = `<span style="color:#f43f5e; font-weight:bold;">🚨 嚴重延遲 ${res.tardiness} 分鐘</span>`;
  } else if (res.tardiness > 0) {
    tardinessMsg = `<span style="color:#f59e0b; font-weight:bold;">⚠️ 輕微延遲 ${res.tardiness} 分鐘</span>`;
  } else {
    tardinessMsg = `<span style="color:#10b981; font-weight:bold;">✅ 準時運抵</span>`;
  }

  ganttTooltip.innerHTML = `
    <div class="gantt-tooltip-header">🚀 任務批次批註: ${res.id}</div>
    <strong>指派天車:</strong> OHT ${res.machine}<br>
    <strong>運行時間:</strong> ${res.start} → ${res.end} (歷時 ${res.duration} 分鐘)<br>
    <strong>需求到達:</strong> ${res.due} 點<br>
    <strong>延遲狀況:</strong> ${tardinessMsg}
  `;
  moveTooltip(event);
}

function moveTooltip(event) {
  const x = event.clientX + 15;
  const y = event.clientY + 15;
  ganttTooltip.style.left = `${x}px`;
  ganttTooltip.style.top = `${y}px`;
}

function hideTooltip() {
  ganttTooltip.style.display = 'none';
}

// Render educational decision logs
function renderTraceLogs(logs) {
  consoleLogs.innerHTML = '';
  const fragment = document.createDocumentFragment();
  
  logs.forEach(log => {
    const div = document.createElement('div');
    div.className = 'console-line';
    
    // Header
    const timeLabel = `<span class="console-time">[t=${log.time}]</span>`;
    const msg = `<span class="console-event">${colorizeLogText(log.message)}</span>`;
    div.innerHTML = timeLabel + msg;
    
    // Sublogs list if present
    if (log.sublogs && log.sublogs.length > 0) {
      const sublogDiv = document.createElement('div');
      sublogDiv.className = 'console-sublog';
      
      log.sublogs.forEach(sub => {
        const p = document.createElement('span');
        p.innerHTML = colorizeLogText(sub);
        sublogDiv.appendChild(p);
      });
      div.appendChild(sublogDiv);
    }
    
    fragment.appendChild(div);
  });
  
  consoleLogs.appendChild(fragment);
}

// Render Scheduled Results Table and horizontal timeline flow
function renderResultsAndFlow(results) {
  // Sort results by actual start time to get the correct dispatch order!
  // Tie-breaker: machine index
  const sortedResults = [...results].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.machine - b.machine;
  });
  
  // 1. Render Horizontal Sequence Chain
  const flowContainer = document.getElementById('sequence-flow-container');
  flowContainer.innerHTML = '';
  
  sortedResults.forEach((res, index) => {
    // Add arrow if not first
    if (index > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'seq-arrow';
      arrow.innerHTML = '→';
      flowContainer.appendChild(arrow);
    }
    
    const card = document.createElement('div');
    card.className = 'seq-card';
    
    // Check delay for color styling
    let numBg = 'var(--accent-cyan)';
    if (res.tardiness > 2) {
      numBg = 'var(--accent-rose)';
    } else if (res.tardiness > 0) {
      numBg = 'var(--accent-amber)';
    } else {
      numBg = 'var(--accent-emerald)';
    }
    
    card.innerHTML = `
      <span class="seq-num" style="background:${numBg};">${index + 1}</span>
      <span class="seq-lot">${res.id}</span>
      <span class="seq-oht">OHT${res.machine}</span>
    `;
    flowContainer.appendChild(card);
  });
  
  // 2. Render Scheduled Results Table
  const resultsTbody = document.getElementById('results-tbody');
  resultsTbody.innerHTML = '';
  
  sortedResults.forEach((res, index) => {
    const tr = document.createElement('tr');
    
    // Delay status badge & row styling based on actual tardiness
    let statusBadge = '';
    let rowStatusClass = '';
    let tardinessColor = 'var(--text-muted)';
    if (res.tardiness > 2) {
      statusBadge = `<span class="badge badge-critical">🚨 嚴重延遲 ${res.tardiness}</span>`;
      rowStatusClass = 'row-status-critical';
      tardinessColor = 'var(--accent-rose)';
    } else if (res.tardiness > 0) {
      statusBadge = `<span class="badge badge-warning">⚠️ 輕微延遲 ${res.tardiness}</span>`;
      rowStatusClass = 'row-status-warning';
      tardinessColor = 'var(--accent-amber)';
    } else {
      statusBadge = `<span class="badge badge-ontime">✅ 準時</span>`;
      rowStatusClass = 'row-status-ontime';
    }
    
    tr.className = rowStatusClass;
    tr.innerHTML = `
      <td style="text-align: center; font-weight: 700; color: var(--accent-cyan);">${index + 1}</td>
      <td style="font-weight: 600; color: #fff;">${res.id}</td>
      <td style="color: var(--text-muted);">OHT ${res.machine}</td>
      <td>${res.start}</td>
      <td>${res.end}</td>
      <td>${res.due}</td>
      <td style="font-weight: 600; color: ${tardinessColor}">${res.tardiness}</td>
      <td>${statusBadge}</td>
    `;
    resultsTbody.appendChild(tr);
  });
}

// Switch between results tabs
function switchResultTab(tabId) {
  // 1. Deactivate all result tab buttons
  document.querySelectorAll('#results-panel .tab-btn').forEach(btn => {
    if (btn.id === `btn-tab-${tabId.replace('tab-', '')}`) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // 2. Hide all result tab panes
  document.querySelectorAll('#results-panel .tab-content').forEach(pane => {
    if (pane.id === tabId) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });
  
  // 3. Special handling for Gantt: redraw to fit the exact current clientWidth!
  if (tabId === 'tab-gantt' && globalResults.length > 0) {
    setTimeout(() => {
      renderGanttChart(globalResults, globalMachineCount);
    }, 50);
  }
}

// Colorize console terminal logs
function colorizeLogText(text) {
  if (!text) return text;
  let html = text;
  
  // 1. Highlight t=XX or [t=XX]
  html = html.replace(/(?:t=)(\d+)/g, '<span style="color:var(--accent-purple); font-weight:700;">t=$1</span>');
  
  // 2. Highlight Lot IDs (L1, L2, L3, ... L10)
  html = html.replace(/\b(L\d+)\b/g, '<span style="color:var(--accent-amber); font-weight:600; background:rgba(245,158,11,0.08); padding:1px 5px; border-radius:4px; border:1px solid rgba(245,158,11,0.2);">$1</span>');
  
  // 3. Highlight OHT machines (OHT1, OHT2, OHT3)
  html = html.replace(/\b(OHT\d+)\b/g, '<span style="color:var(--accent-cyan); font-weight:600; background:rgba(6,182,212,0.08); padding:1px 5px; border-radius:4px; border:1px solid rgba(6,182,212,0.2);">$1</span>');
  
  // 4. Highlight "延遲" keyword
  html = html.replace(/延遲/g, '<span style="color:var(--accent-rose); font-weight:700;">延遲</span>');
  
  // 5. Highlight "準時" keyword
  html = html.replace(/準時/g, '<span style="color:var(--accent-emerald); font-weight:700;">準時</span>');
  
  // 6. Highlight status and keywords
  html = html.replace(/(?:運送完畢|完成|成功)/g, '<span style="color:var(--accent-emerald); font-weight:500;">$&</span>');
  html = html.replace(/(?:空閒|待排程|決策點)/g, '<span style="color:var(--accent-cyan); font-weight:500;">$&</span>');
  html = html.replace(/(?:延遲 \d+ 單元|延遲 \d+ 分鐘|延遲狀況)/g, '<span style="color:var(--accent-rose); font-weight:500;">$&</span>');

  return html;
}
