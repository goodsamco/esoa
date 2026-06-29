import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. FIREBASE ARCHITECTURE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyDaeNQF4qmW0vvwxUPp_NztnT0hoLzm1BQ",
    authDomain: "svls-289ee.firebaseapp.com",
    databaseURL: "https://svls-289ee-default-rtdb.firebaseio.com",
    projectId: "svls-289ee",
    storageBucket: "svls-289ee.firebasestorage.app",
    messagingSenderId: "500705386198",
    appId: "1:500705386198:web:96f189662bc2aa99cf7377",
    measurementId: "G-5TNBMQ2HN5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Check if user is logged in
const userId = localStorage.getItem("userId");

if (!userId) {
    window.location.href = "login.html";
}

// Global State
let userProfile = {};
let salarySettings = { 
    dailyRate: 460, 
    timeIn: "08:00", 
    timeOut: "17:00", 
    position: "Staff", 
    department: "Operations", 
    hasLunchBreak: true 
};
let timelineBuffer = {}; 
let currentTargetDateString = ""; 
let activeDatesArray = [];
let previousArchiveViewingMode = false;

const CURRENT_YEAR = 2026;

// Helper to add comma separators for currencies
function formatCurrency(amount) {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Helper to convert time strings ("08:00") to total minutes
function timeStringToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hrs, mins] = timeStr.split(':').map(Number);
    return (hrs * 60) + mins;
}

// 3. CORE INITIALIZATION ENGINE
async function bootEngineCore() {
    try {
        const accountRef = doc(db, "accounts", userId);
        const accountSnap = await getDoc(accountRef);

        if (accountSnap.exists()) {
            const accountData = accountSnap.data();
            userProfile.name = accountData.username || localStorage.getItem("userName") || userProfile.name;
            
            if (accountData.customName) {
                userProfile.customName = accountData.customName.toUpperCase();
            }
            if (accountData.bgValue) {
                document.documentElement.style.setProperty('--bg', accountData.bgValue);
            }
            if (accountData.btnValue) {
                document.documentElement.style.setProperty('--primary', accountData.btnValue);
                const modalBox = document.getElementById('modalBoxContainer');
                if (modalBox) modalBox.style.border = `1px solid ${accountData.btnValue}`;
            }
        }

        const settingsRef = doc(db, "salary_settings", userId);
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
            salarySettings = settingsSnap.data();
            
            if (salarySettings.firstName && salarySettings.lastName) {
                const mi = salarySettings.middleInitial ? ` ${salarySettings.middleInitial}.` : "";
                userProfile.customName = `${salarySettings.firstName}${mi} ${salarySettings.lastName}`.toUpperCase();
            }
            if (salarySettings.emailAddress) {
                userProfile.email = salarySettings.emailAddress;
            }
        }

        updateUIProfileElements();
        buildDropdownTargetIntervals();
        
        await processPeriodEngineChange();

    } catch (err) {
        console.error("Setup initialization error: ", err);
    }
}

function updateUIProfileElements() {
    document.getElementById('profSettingsNameDisplay').innerText = userProfile.customName ? userProfile.customName.toUpperCase() : "-";
    document.getElementById('profNameDisplay').innerText = userProfile.name ? userProfile.name.toUpperCase() : "-";
    document.getElementById('profEmailDisplay').innerText = userProfile.email ? userProfile.email.toUpperCase() : "-";
    document.getElementById('profPosDisplay').innerText = (salarySettings.position || "Staff").toUpperCase();
    document.getElementById('profDeptDisplay').innerText = (salarySettings.department || "Operations").toUpperCase();
    
    let rateElement = document.getElementById('profDailyRateDisplay');
    const formattedRate = `₱${formatCurrency(parseFloat(salarySettings.dailyRate) || 460)}`;
    
    if (rateElement) {
        rateElement.innerText = formattedRate;
    } else {
        const badgeDeck = document.querySelector('.profile-badge-deck');
        if (badgeDeck) {
            const newMetaRow = document.createElement('div');
            newMetaRow.className = "profile-meta-row";
            newMetaRow.innerHTML = `
                <span class="lbl">DAILY RATE</span>
                <span class="val" id="profDailyRateDisplay">${formattedRate}</span>
            `;
            badgeDeck.appendChild(newMetaRow);
        }
    }
}

function buildDropdownTargetIntervals() {
    const selector = document.getElementById('periodSelector');
    const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    
    selector.innerHTML = "";
    months.forEach((m, idx) => {
        let opt15 = document.createElement('option');
        opt15.value = `${CURRENT_YEAR}-${String(idx+1).padStart(2,'0')}-15`;
        opt15.innerText = `${m} 15, ${CURRENT_YEAR}`;
        selector.appendChild(opt15);

        let optEnd = document.createElement('option');
        let lastDay = new Date(CURRENT_YEAR, idx + 1, 0).getDate();
        optEnd.value = `${CURRENT_YEAR}-${String(idx+1).padStart(2,'0')}-${lastDay}`;
        optEnd.innerText = `${m} ${lastDay}, ${CURRENT_YEAR}`;
        selector.appendChild(optEnd);
    });

    const today = new Date();
    if (today.getFullYear() === CURRENT_YEAR) {
        const targetDay = today.getDate() <= 15 ? 15 : new Date(CURRENT_YEAR, today.getMonth() + 1, 0).getDate();
        selector.value = `${CURRENT_YEAR}-${String(today.getMonth() + 1).padStart(2, '0')}-${targetDay}`;
    } else {
        selector.value = `2026-06-30`;
    }
}

// CORRECTED: Fixed index slice logic strings & toLocaleDateString array index assignment
window.processPeriodEngineChange = async function() {
    const val = document.getElementById('periodSelector').value;
    const pieces = val.split('-');
    const year = parseInt(pieces);
    const monthIdx = parseInt(pieces) - 1;
    const day = parseInt(pieces);

    activeDatesArray = [];

    if (day === 15) {
        let prevMonthDate = new Date(year, monthIdx - 1, 29);
        let currentTarget = new Date(prevMonthDate);
        while (currentTarget <= new Date(year, monthIdx, 13)) {
            activeDatesArray.push(new Date(currentTarget));
            currentTarget.setDate(currentTarget.getDate() + 1);
        }
    } else {
        let currentTarget = new Date(year, monthIdx, 14);
        while (currentTarget <= new Date(year, monthIdx, 28)) {
            activeDatesArray.push(new Date(currentTarget));
            currentTarget.setDate(currentTarget.getDate() + 1);
        }
    }

    const startStr = activeDatesArray.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const endStr = activeDatesArray[activeDatesArray.length - 1].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('payableRangeDisplay').value = `${startStr} - ${endStr}`;

    timelineBuffer = {};
    document.getElementById('inputSSS').value = "0.00";
    document.getElementById('inputPHIC').value = "0.00";
    document.getElementById('inputHDMF').value = "0.00";
    document.getElementById('inputAdvances').value = "0.00";
    document.getElementById('inputDoublePay').value = "0.00";
    document.getElementById('inputReimbursements').value = "0.00";

    try {
        const transSnap = await getDoc(doc(db, "salary_transactions", `${userId}_${val}`));
        if (transSnap.exists()) {
            const loadedData = transSnap.data();
            if (loadedData.timelineBuffer) timelineBuffer = loadedData.timelineBuffer;
            if (loadedData.inputSSS) document.getElementById('inputSSS').value = loadedData.inputSSS;
            if (loadedData.inputPHIC) document.getElementById('inputPHIC').value = loadedData.inputPHIC;
            if (loadedData.inputHDMF) document.getElementById('inputHDMF').value = loadedData.inputHDMF;
            if (loadedData.inputAdvances) document.getElementById('inputAdvances').value = loadedData.inputAdvances;
            if (loadedData.inputDoublePay) document.getElementById('inputDoublePay').value = loadedData.inputDoublePay;
            if (loadedData.inputReimbursements) document.getElementById('inputReimbursements').value = loadedData.inputReimbursements;
        }
    } catch (err) {
        console.error("Error loading isolated period data: ", err);
    }

    evaluateLockExecutionConstraints(year, monthIdx, day);
    renderActivePeriodCalendarGrid();
    recomputeGlobalFinancials();
};

function evaluateLockExecutionConstraints(year, monthIdx, targetDay) {
    const today = new Date();
    const currentMonthNum = today.getMonth();
    const currentYearNum = today.getFullYear();

    let lockActive = true;

    if (year === currentYearNum) {
        if (monthIdx === currentMonthNum) {
            lockActive = false;
        } else if (monthIdx === currentMonthNum - 1 && targetDay > 15) {
            lockActive = false;
        } else if (monthIdx === currentMonthNum + 1 && targetDay === 15) {
            lockActive = false;
        }
    }

    const wrapper = document.getElementById('netPayWrapperDeck');
    const badge = document.getElementById('lockBadgeDisplay');
    if (lockActive) {
        if (wrapper) wrapper.classList.add('blurred-lock');
        if (badge) badge.style.display = "inline-block";
    } else {
        if (wrapper) wrapper.classList.remove('blurred-lock');
        if (badge) badge.style.display = "none";
    }
}

function renderActivePeriodCalendarGrid() {
    const grid = document.getElementById('calendarNodeGrid');
    if (!grid) return;
    grid.innerHTML = "";

    const today = new Date();
    const currentMonthNum = today.getMonth();
    const currentYearNum = today.getFullYear();

    activeDatesArray.forEach(dateObj => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dayOfWeekStr = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

        let isPastDate = false;
        if (year < currentYearNum) {
            isPastDate = true;
        } else if (year === currentYearNum && dateObj.getMonth() < currentMonthNum) {
            if (!(dateObj.getMonth() === currentMonthNum - 1 && dateObj.getDate() >= 29)) {
                isPastDate = true;
            }
        }

        const cell = document.createElement('div');
        cell.className = "calendar-day-node";
        if (isPastDate) {
            cell.classList.add("node-locked");
        }

        cell.innerHTML = `
            <span class="day-num">${day}</span>
            <span class="day-lbl">${dayOfWeekStr}</span>
        `;

        if (isPastDate) {
            const iconSpan = document.createElement('span');
            iconSpan.className = "lock-corner-icon";
            iconSpan.innerHTML = `<i data-lucide="lock" style="width:10px;height:10px;"></i>`;
            cell.appendChild(iconSpan);
        }

        if (timelineBuffer[dateKey] && timelineBuffer[dateKey].filled) {
            cell.style.backgroundColor = document.documentElement.style.getPropertyValue('--primary') || "var(--primary)";
            cell.style.color = "#000000";
            cell.querySelector('.day-lbl').style.color = "rgba(0,0,0,0.6)";
            if (isPastDate && cell.querySelector('.lock-corner-icon')) {
                cell.querySelector('.lock-corner-icon').style.color = "#000000";
            }
        }

        cell.onclick = () => {
            if (isPastDate) {
                alert("THIS HISTORICAL RECORD CYCLE IS LOCKED AND UNFILLABLE.");
                return;
            }
            launchTimeTransactionModal(dateKey, isPastDate);
        };
        grid.appendChild(cell);
    });
    if (window.lucide) window.lucide.createIcons();
}

window.launchTimeTransactionModal = function(dateKey, isPastDate = false) {
    currentTargetDateString = dateKey;
    document.getElementById('modalTargetDateHeader').innerText = `LOGS FOR ${dateKey}`;
    
    document.getElementById('modalTimeIn1').value = "";
    document.getElementById('modalTimeOut1').value = "";
    document.getElementById('modalTimeIn2').value = "";
    document.getElementById('modalTimeOut2').value = "";
    document.getElementById('modalTimeInOT').value = "";
    document.getElementById('modalTimeOutOT').value = "";
    
    document.getElementById('chkEnableOT').checked = false;
    document.getElementById('otSubSectionDeck').style.display = "none";

    if (timelineBuffer[dateKey]) {
        const rec = timelineBuffer[dateKey];
        document.getElementById('modalTimeIn1').value = rec.in1 || "";
        document.getElementById('modalTimeOut1').value = rec.out1 || "";
        document.getElementById('modalTimeIn2').value = rec.in2 || "";
        document.getElementById('modalTimeOut2').value = rec.out2 || "";
        if (rec.hasOT) {
            document.getElementById('chkEnableOT').checked = true;
            document.getElementById('otSubSectionDeck').style.display = "block";
            document.getElementById('modalTimeInOT').value = rec.inOT || "";
            document.getElementById('modalTimeOutOT').value = rec.outOT || "";
        }
    } else {
        if (salarySettings.hasLunchBreak !== false) {
            document.getElementById('modalTimeIn1').value = salarySettings.timeIn || "08:00";
            document.getElementById('modalTimeOut1').value = "12:00";
            document.getElementById('modalTimeIn2').value = "13:00";
            document.getElementById('modalTimeOut2').value = salarySettings.timeOut || "17:00";
        } else {
            document.getElementById('modalTimeIn1').value = salarySettings.timeIn || "08:00";
            document.getElementById('modalTimeOut1').value = salarySettings.timeOut || "17:00";
            document.getElementById('modalTimeIn2').value = "";
            document.getElementById('modalTimeOut2').value = "";
        }
    }

    const inputs = document.getElementById('modalBoxContainer').querySelectorAll('input, select');
    if (isPastDate) {
        inputs.forEach(el => el.setAttribute('disabled', 'true'));
        document.getElementById('modalActionFooterDeck').style.display = "none";
        document.getElementById('modalLockedWarningLabel').style.display = "block";
    } else {
        inputs.forEach(el => el.removeAttribute('disabled'));
        document.getElementById('modalActionFooterDeck').style.display = "grid";
        document.getElementById('modalLockedWarningLabel').style.display = "none";
    }

    runRealtimeMetricsDeductionEngine();
    document.getElementById('timeConfigModalOverlay').classList.add('active');
};

window.evaluateLunchBreakConstraints = function() {
    const out1 = document.getElementById('modalTimeOut1').value;
    if (out1) {
        const out1Mins = timeStringToMinutes(out1);
        const noonMins = timeStringToMinutes("12:59");
        if (out1Mins < noonMins) {
            document.getElementById('modalTimeIn2').value = "";
            document.getElementById('modalTimeOut2').value = "";
        }
    }
};

window.closeTimeTransactionModal = function() {
    document.getElementById('timeConfigModalOverlay').classList.remove('active');
};

window.toggleOvertimeSubSection = function() {
    const chk = document.getElementById('chkEnableOT');
    const segment = document.getElementById('otSubSectionDeck');
    if(chk && segment) {
        segment.style.display = chk.checked ? "block" : "none";
    }
};

window.runRealtimeMetricsDeductionEngine = function() {
    const schedIn = salarySettings.timeIn || "08:00";
    const schedOut = salarySettings.timeOut || "17:00";
    const in1 = document.getElementById('modalTimeIn1').value;
    const out1 = document.getElementById('modalTimeOut1').value;
    const in2 = document.getElementById('modalTimeIn2').value;
    const out2 = document.getElementById('modalTimeOut2').value;

    let lateMinutes = 0;
    let undertimeMinutes = 0;

    if (in1) {
        const schedInMins = timeStringToMinutes(schedIn);
        const actualInMins = timeStringToMinutes(in1);
        if (actualInMins > schedInMins) lateMinutes += (actualInMins - schedInMins);
    }
    const effectiveFinalOut = out2 ? out2 : out1;
    if (effectiveFinalOut) {
        const schedOutMins = timeStringToMinutes(schedOut);
        const actualOutMins = timeStringToMinutes(effectiveFinalOut);
        if (actualOutMins < schedOutMins) undertimeMinutes += (schedOutMins - actualOutMins);
    }

    document.getElementById('rtLateDisplay').innerText = `${lateMinutes} MINS`;
    document.getElementById('rtUndertimeDisplay').innerText = `${undertimeMinutes} MINS`;
};

window.saveTimeTransactionRecord = function() {
    if (!currentTargetDateString) return;
    
    const in1 = document.getElementById('modalTimeIn1').value;
    const out1 = document.getElementById('modalTimeOut1').value;
    const in2 = document.getElementById('modalTimeIn2').value;
    const out2 = document.getElementById('modalTimeOut2').value;
    const hasOT = document.getElementById('chkEnableOT').checked;
    const inOT = document.getElementById('modalTimeInOT').value;
    const outOT = document.getElementById('modalTimeOutOT').value;

    timelineBuffer[currentTargetDateString] = {
        filled: !!in1,
        in1, out1, in2, out2,
        hasOT, inOT, outOT
    };

    closeTimeTransactionModal();
    renderActivePeriodCalendarGrid();
    recomputeGlobalFinancials();
};

window.clearTimeTransactionRecord = function() {
    if (!currentTargetDateString) return;
    delete timelineBuffer[currentTargetDateString];
    closeTimeTransactionModal();
    renderActivePeriodCalendarGrid();
    recomputeGlobalFinancials();
};

window.recomputeGlobalFinancials = function() {
    let totalLates = 0;
    let totalUndertime = 0;
    let daysWorked = 0;
    let totalOTMinutes = 0;

    const dailyRate = parseFloat(salarySettings.dailyRate) || 460;
    const hourlyRate = dailyRate / 8;
    const minuteRate = hourlyRate / 60;

    const tbody = document.getElementById('uiDailyBreakdownBody');
    if(tbody) tbody.innerHTML = "";

    activeDatesArray.forEach(dateObj => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dayOfWeekStr = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

        let lates = 0;
        let undertime = 0;
        let dayGross = 0;
        let dayDeduction = 0;
        let otMinutes = 0;

        const rec = timelineBuffer[dateKey];
        if (rec && rec.filled) {
            daysWorked++;
            dayGross = dailyRate;

            const schedInMins = timeStringToMinutes(salarySettings.timeIn || "08:00");
            const actualInMins = timeStringToMinutes(rec.in1);
            if (actualInMins > schedInMins) lates = actualInMins - schedInMins;

            const schedOutMins = timeStringToMinutes(salarySettings.timeOut || "17:00");
            const effectiveOut = rec.out2 ? rec.out2 : rec.out1;
            const actualOutMins = timeStringToMinutes(effectiveOut);
            if (actualOutMins < schedOutMins) undertime = schedOutMins - actualOutMins;

            if (rec.hasOT && rec.inOT && rec.outOT) {
                const otInMins = timeStringToMinutes(rec.inOT);
                const otOutMins = timeStringToMinutes(rec.outOT);
                if (otOutMins > otInMins) otMinutes = otOutMins - otInMins;
            }

            dayDeduction = (lates + undertime) * minuteRate;
            totalLates += lates;
            totalUndertime += undertime;
            totalOTMinutes += otMinutes;
        }

        if (tbody) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${dateKey}</td>
                <td>${dayOfWeekStr}</td>
                <td>${rec?.in1 || '-'}</td>
                <td>${rec?.out1 || '-'}</td>
                <td>${rec?.in2 || '-'}</td>
                <td>${rec?.out2 || '-'}</td>
                <td>${rec?.inOT || '-'}</td>
                <td>${rec?.outOT || '-'}</td>
                <td>${lates}</td>
                <td>${undertime}</td>
                <td style="text-align: right;">₱${formatCurrency(dayGross)}</td>
                <td style="text-align: right; color: #ef4444;">₱${formatCurrency(dayDeduction)}</td>
                <td style="text-align: right; color: #22c55e;">₱${formatCurrency(dayGross - dayDeduction)}</td>
            `;
            tbody.appendChild(tr);
        }
    });

    const basicPay = daysWorked * dailyRate;
    const otPay = totalOTMinutes * (minuteRate * 1.25); // 1.25x Premium OT
    const doublePay = parseFloat(document.getElementById('inputDoublePay').value) || 0;
    const reimbursements = parseFloat(document.getElementById('inputReimbursements').value) || 0;
    const incentives = doublePay + reimbursements;

    const grossPay = basicPay + otPay + incentives;

    const sss = parseFloat(document.getElementById('inputSSS').value) || 0;
    const phic = parseFloat(document.getElementById('inputPHIC').value) || 0;
    const hdmf = parseFloat(document.getElementById('inputHDMF').value) || 0;
    const advances = parseFloat(document.getElementById('inputAdvances').value) || 0;
    const attendancePenalties = (totalLates + totalUndertime) * minuteRate;
    const totalDeductions = sss + phic + hdmf + advances + attendancePenalties;

    const netPay = grossPay - totalDeductions;

    // Update UI elements safely
    if (document.getElementById('totalLates')) document.getElementById('totalLates').innerText = totalLates;
    if (document.getElementById('totalUndertime')) document.getElementById('totalUndertime').innerText = totalUndertime;
    
    document.getElementById('breakdownBasic').innerText = `₱${formatCurrency(basicPay)}`;
    document.getElementById('breakdownOT').innerText = `₱${formatCurrency(otPay)}`;
    document.getElementById('breakdownIncentives').innerText = `₱${formatCurrency(incentives)}`;
    document.getElementById('breakdownGross').innerText = `₱${formatCurrency(grossPay)}`;
    
    document.getElementById('breakdownSSS').innerText = `₱${formatCurrency(sss)}`;
    document.getElementById('breakdownPHIC').innerText = `₱${formatCurrency(phic)}`;
    document.getElementById('breakdownHDMF').innerText = `₱${formatCurrency(hdmf)}`;
    document.getElementById('breakdownPenalties').innerText = `₱${formatCurrency(attendancePenalties)}`;
    document.getElementById('breakdownAdvances').innerText = `₱${formatCurrency(advances)}`;
    document.getElementById('breakdownTotalDed').innerText = `₱${formatCurrency(totalDeductions)}`;
    document.getElementById('breakdownNet').innerText = `₱${formatCurrency(netPay)}`;
};

window.commitTimelineTransactionToCloud = async function() {
    const val = document.getElementById('periodSelector').value;
    try {
        await setDoc(doc(db, "salary_transactions", `${userId}_${val}`), {
            timelineBuffer,
            inputSSS: document.getElementById('inputSSS').value,
            inputPHIC: document.getElementById('inputPHIC').value,
            inputHDMF: document.getElementById('inputHDMF').value,
            inputAdvances: document.getElementById('inputAdvances').value,
            inputDoublePay: document.getElementById('inputDoublePay').value,
            inputReimbursements: document.getElementById('inputReimbursements').value
        });
        alert("TRANSACTION RECORD COMMITTED TO CLOUD VAULT SECURELY.");
    } catch (err) {
        console.error("Cloud saving exception: ", err);
        alert("FAILED TO RECORD METRICS TO THE DATABASE STORAGE ENGINE.");
    }
};

window.triggerCSVExportPipeline = function() {
    const csvRows = [];
    csvRows.push([`"PAYSLIP AUDIT SUMMARY ENGINE REPORT"`]);
    csvRows.push([`"EMPLOYEE NAME"`, `"${document.getElementById('profSettingsNameDisplay').innerText}"`]);
    csvRows.push([]);
    csvRows.push([`"EARNING MATRIX ITEMS"`, `"VALUE AMOUNT"`]);
    csvRows.push([`"BASIC RUN PAY"`, `"${document.getElementById('breakdownBasic').innerText.replace('₱','')}"`]);
    csvRows.push([`"OVERTIME PAY"`, `"${document.getElementById('breakdownOT').innerText.replace('₱','')}"`]);
    csvRows.push([`"TOTAL GROSS"`, `"${document.getElementById('breakdownGross').innerText.replace('₱','')}"`]);
    csvRows.push([]);
    csvRows.push([`"DEDUCTION ACCOUNT ITEMS"`]);
    csvRows.push([`"SSS CONTRIBUTION"`, `"${document.getElementById('breakdownSSS').innerText.replace('₱','')}"`]);
    csvRows.push([`"PHIC MEDICAL PREMIUM"`, `"${document.getElementById('breakdownPHIC').innerText.replace('₱','')}"`]);
    csvRows.push([`"HDMF FUND CONTRIB"`, `"${document.getElementById('breakdownHDMF').innerText.replace('₱','')}"`]);
    csvRows.push([`"TOTAL DEDUCTIONS"`, `"${document.getElementById('breakdownTotalDed').innerText.replace('₱','')}"`]);
    csvRows.push([]);
    csvRows.push([`"NET DISBURSABLE PAYOUT"`, `"${document.getElementById('breakdownNet').innerText.replace('₱','')}"`]);

    const csvString = csvRows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `PAYSLIP_AUDIT_LOGS_${userId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.triggerPrintPreviewPipeline = function() {
    window.print();
};

// Start application hook
document.addEventListener("DOMContentLoaded", bootEngineCore);
