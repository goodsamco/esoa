import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================================================
// 1. FIREBASE ARCHITECTURE CONFIGURATION
// ==========================================================================
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

// Authentication Guard Control Lock
const userId = localStorage.getItem("userId");
if (!userId) {
    window.location.href = "login.html";
}

// ==========================================================================
// 2. GLOBAL STATE MATRIX INITIALIZATION
// ==========================================================================
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
const CURRENT_YEAR = 2026;

// Helper to add comma separators for local financial currencies representation
function formatCurrency(amount) {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Helper to convert time string values directly into scalar minutes integers
function timeStringToMinutes(timeStr) {
    if(!timeStr || timeStr === "-") return 0;
    const p = timeStr.split(':');
    return parseInt(p[0]) * 60 + parseInt(p[1]);
}

// ==========================================================================
// 3. CORE INITIALIZATION ROUTINE ENGINE
// ==========================================================================
async function bootEngineCore() {
    try {
        // Fetch structural accounts profiling records
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

        // Fetch salary configuration settings matrix
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
        processPeriodEngineChange();
        
        // Fetch active/cached historical cycles payload transaction structures
        const transSnap = await getDoc(doc(db, "salary_transactions", `${userId}_current`));
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
        
        renderActivePeriodCalendarGrid();
        recomputeGlobalFinancials();

    } catch (err) {
        console.error("Setup initialization error: ", err);
    }
}

function updateUIProfileElements() {
    document.getElementById('profSettingsNameDisplay').innerText = (userProfile.customName || "").toUpperCase();
    document.getElementById('profNameDisplay').innerText = (userProfile.name || "").toUpperCase();
    document.getElementById('profEmailDisplay').innerText = (userProfile.email || "").toUpperCase();
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

function processPeriodEngineChange() {
    const val = document.getElementById('periodSelector').value;
    const pieces = val.split('-');
    const year = parseInt(pieces[0]);
    const monthIdx = parseInt(pieces[1]) - 1;
    const day = parseInt(pieces[2]);

    activeDatesArray = [];

    // Construct array of date entities corresponding to dynamic bi-weekly windows
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

    const startStr = activeDatesArray[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const endStr = activeDatesArray[activeDatesArray.length - 1].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    document.getElementById('payableRangeDisplay').value = `${startStr} - ${endStr}`;

    evaluateLockExecutionConstraints(year, monthIdx, day);
    renderActivePeriodCalendarGrid();
    recomputeGlobalFinancials();
}

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

// ==========================================================================
// 4. MATRIX UI CALENDAR RENDER ENGINE
// ==========================================================================
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

// ==========================================================================
// 5. TRANSACTIONS MODAL PROCESS ENGINE
// ==========================================================================
function launchTimeTransactionModal(dateKey, isPastDate = false) {
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
}

function evaluateLunchBreakConstraints() {
    const out1 = document.getElementById('modalTimeOut1').value;
    if (out1) {
        const out1Mins = timeStringToMinutes(out1);
        const noonMins = timeStringToMinutes("12:59");
        if (out1Mins < noonMins) {
            document.getElementById('modalTimeIn2').value = "";
            document.getElementById('modalTimeOut2').value = "";
        }
    }
}

function closeTimeTransactionModal() {
    document.getElementById('timeConfigModalOverlay').classList.remove('active');
}

function runRealtimeMetricsDeductionEngine() {
    const schedIn = salarySettings.timeIn || "08:00";
    const schedOut = salarySettings.timeOut || "17:00";
    
    const in1 = document.getElementById('modalTimeIn1').value;
    const out1 = document.getElementById('modalTimeOut1').value;
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
        if (actualOutMins < schedOutMins) {
            undertimeMinutes += (schedOutMins - actualOutMins);
            
            // Real-time verification protection: Exclude unpaid break bounds
            if (salarySettings.hasLunchBreak !== false) {
                const lunchStartMins = timeStringToMinutes("12:00");
                const lunchEndMins = timeStringToMinutes("13:00");
                if (actualOutMins <= lunchStartMins) {
                    undertimeMinutes -= 60;
                } else if (actualOutMins > lunchStartMins && actualOutMins < lunchEndMins) {
                    undertimeMinutes -= (lunchEndMins - actualOutMins);
                }
            }
        }
    }

    document.getElementById('rtLateDisplay').innerText = `${lateMinutes} MINS`;
    document.getElementById('rtUndertimeDisplay').innerText = `${undertimeMinutes} MINS`;
}

function toggleOvertimeSubSection() {
    if(document.getElementById('chkEnableOT').disabled) return;
    const checked = document.getElementById('chkEnableOT').checked;
    document.getElementById('otSubSectionDeck').style.display = checked ? "block" : "none";
}

function commitModalDayStateToLocalBuffer() {
    const in1 = document.getElementById('modalTimeIn1').value;
    const out1 = document.getElementById('modalTimeOut1').value;

    if (!in1 || !out1) {
        alert("CORE TIMELINE IN & OUT VALUES REQUIRED.");
        return;
    }

    const hasOT = document.getElementById('chkEnableOT').checked;

    timelineBuffer[currentTargetDateString] = {
        filled: true,
        in1: in1,
        out1: out1,
        in2: document.getElementById('modalTimeIn2').value || "",
        out2: document.getElementById('modalTimeOut2').value || "",
        hasOT: hasOT,
        inOT: hasOT ? document.getElementById('modalTimeInOT').value : "",
        outOT: hasOT ? document.getElementById('modalTimeOutOT').value : ""
    };

    closeTimeTransactionModal();
    renderActivePeriodCalendarGrid();
    recomputeGlobalFinancials();
}

function clearModalDayState() {
    if (timelineBuffer[currentTargetDateString]) {
        delete timelineBuffer[currentTargetDateString];
    }
    closeTimeTransactionModal();
    renderActivePeriodCalendarGrid();
    recomputeGlobalFinancials();
}

// ==========================================================================
// 6. FINANCIAL RECOMPUTATION STREAM MODULE
// ==========================================================================
function recomputeGlobalFinancials() {
    const dailyRate = parseFloat(salarySettings.dailyRate) || 460;
    const hourlyRate = dailyRate / 8;
    const minuteRate = hourlyRate / 60;

    let totalBasicEarnings = 0;
    let totalOvertimePay = 0;
    let totalDeductionPenalties = 0;
    let actualDaysWorkedCounter = 0;

    let aggLates = 0;
    let aggUndertime = 0;
    let aggGross = 0;
    let aggDed = 0;
    let aggNet = 0;

    const schedInStr = salarySettings.timeIn || "08:00";
    const schedOutStr = salarySettings.timeOut || "17:00";

    let structuralDailyArrayLogs = [];
    let uiTableRowsHtml = "";

    activeDatesArray.forEach(dateObj => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dayOfWeekStr = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

        let dayGross = 0;
        let dayDed = 0;
        let dayLateMins = 0;
        let dayUndertimeMins = 0;

        let tIn1 = "-";
        let tOut1 = "-";
        let tIn2 = "-";
        let tOut2 = "-";
        let otIn = "-";
        let otOut = "-";

        if (timelineBuffer[dateKey] && timelineBuffer[dateKey].filled) {
            actualDaysWorkedCounter++;
            totalBasicEarnings += dailyRate;
            dayGross += dailyRate;

            const rec = timelineBuffer[dateKey];
            tIn1 = rec.in1 || "-";
            tOut1 = rec.out1 || "-";
            tIn2 = rec.in2 || "-";
            tOut2 = rec.out2 || "-";

            const schedInMins = timeStringToMinutes(schedInStr);
            const actInMins = timeStringToMinutes(rec.in1);
            if (actInMins > schedInMins) dayLateMins = (actInMins - schedInMins);

            const effectiveFinalOut = rec.out2 ? rec.out2 : rec.out1;
            const schedOutMins = timeStringToMinutes(schedOutStr);
            const actOutMins = timeStringToMinutes(effectiveFinalOut);
            
            if (actOutMins < schedOutMins) {
                dayUndertimeMins = (schedOutMins - actOutMins);
                
                // CRITICAL STRUCTURAL FIX: Protect lunch break from being captured in undertime
                if (salarySettings.hasLunchBreak !== false) {
                    const lunchStartMins = timeStringToMinutes("12:00");
                    const lunchEndMins = timeStringToMinutes("13:00");
                    
                    if (actOutMins <= lunchStartMins) {
                        dayUndertimeMins -= 60; // Knock out the full 12-1 session
                    } else if (actOutMins > lunchStartMins && actOutMins < lunchEndMins) {
                        dayUndertimeMins -= (lunchEndMins - actOutMins); // Truncate partial overlap
                    }
                }
            }

            dayDed = (dayLateMins + dayUndertimeMins) * minuteRate;
            totalDeductionPenalties += dayDed;

            if (rec.hasOT && rec.inOT && rec.outOT) {
                otIn = rec.inOT;
                otOut = rec.outOT;

                const oInMins = timeStringToMinutes(rec.inOT);
                const oOutMins = timeStringToMinutes(rec.outOT);

                if (oOutMins > oInMins) {
                    const otMins = oOutMins - oInMins;
                    const otPay = otMins * minuteRate;

                    totalOvertimePay += otPay;
                    dayGross += otPay;
                }
            }
        }
            
        let dayNet = dayGross - dayDed;

        aggLates += dayLateMins;
        aggUndertime += dayUndertimeMins;
        aggGross += dayGross;
        aggDed += dayDed;
        aggNet += dayNet;

        uiTableRowsHtml += `
            <tr>
                <td>${dateKey}</td>
                <td>${dayOfWeekStr.toUpperCase()}</td>
                <td>${tIn1}</td>
                <td>${tOut1}</td>
                <td>${tIn2}</td>
                <td>${tOut2}</td>
                <td>${otIn}</td>
                <td>${otOut}</td>
                <td style="color: #94a3b8;">${dayLateMins}</td>
                <td style="color: #94a3b8;">${dayUndertimeMins}</td>
                <td style="text-align: right; color: ${dayGross > 0 ? '#fff' : '#64748b'};">₱${formatCurrency(dayGross)}</td>
                <td style="text-align: right; color: ${dayDed > 0 ? '#ef4444' : '#64748b'};">₱${formatCurrency(dayDed)}</td>
                <td style="text-align: right; color: #38bdf8;">₱${formatCurrency(dayNet)}</td>
            </tr>
        `;

        structuralDailyArrayLogs.push({
            date: dateKey,
            dayStr: dayOfWeekStr.toUpperCase(),
            in1: tIn1,
            out1: tOut1,
            in2: tIn2,
            out2: tOut2,
            inOT: otIn,
            outOT: otOut,
            lates: dayLateMins,
            undertime: dayUndertimeMins,
            gross: dayGross,
            deductions: dayDed,
            net: dayNet
        });
    });

    const breakdownBody = document.getElementById('uiDailyBreakdownBody');
    if (breakdownBody) breakdownBody.innerHTML = uiTableRowsHtml;

    document.getElementById('totalLates').innerText = aggLates;
    document.getElementById('totalUndertime').innerText = aggUndertime;
    document.getElementById('totalGross').innerText = `₱${formatCurrency(aggGross)}`;
    document.getElementById('totalDed').innerText = `₱${formatCurrency(aggDed)}`;
    document.getElementById('totalDailyNet').innerText = `₱${formatCurrency(aggNet)}`;

    const doublePay = parseFloat(document.getElementById('inputDoublePay').value) || 0;
    const reimbursements = parseFloat(document.getElementById('inputReimbursements').value) || 0;
    const totalIncentives = doublePay + reimbursements;

    const sss = parseFloat(document.getElementById('inputSSS').value) || 0;
    const phic = parseFloat(document.getElementById('inputPHIC').value) || 0;
    const hdmf = parseFloat(document.getElementById('inputHDMF').value) || 0;
    const advances = parseFloat(document.getElementById('inputAdvances').value) || 0;

    const grossPay = totalBasicEarnings + totalOvertimePay + totalIncentives;
    const totalDeductions = sss + phic + hdmf + totalDeductionPenalties + advances;
    const netPay = grossPay - totalDeductions;

    document.getElementById('breakdownBasic').innerText = `₱${formatCurrency(totalBasicEarnings)}`;
    document.getElementById('breakdownOT').innerText = `₱${formatCurrency(totalOvertimePay)}`;
    document.getElementById('breakdownIncentives').innerText = `₱${formatCurrency(totalIncentives)}`;
    document.getElementById('breakdownGross').innerText = `₱${formatCurrency(grossPay)}`;

    document.getElementById('breakdownSSS').innerText = `₱${formatCurrency(sss)}`;
    document.getElementById('breakdownPHIC').innerText = `₱${formatCurrency(phic)}`;
    document.getElementById('breakdownHDMF').innerText = `₱${formatCurrency(hdmf)}`;
    document.getElementById('breakdownPenalties').innerText = `₱${formatCurrency(totalDeductionPenalties)}`;
    document.getElementById('breakdownAdvances').innerText = `₱${formatCurrency(advances)}`;
    document.getElementById('breakdownTotalDed').innerText = `₱${formatCurrency(totalDeductions)}`;
    document.getElementById('breakdownNet').innerText = `₱${formatCurrency(netPay)}`;

    generateCommercialReceiptLayout({
        totalBasicEarnings, totalOvertimePay, totalIncentives, doublePay, reimbursements, grossPay,
        sss, phic, hdmf, totalDeductionPenalties, advances, totalDeductions, netPay,
        actualDaysWorkedCounter, structuralDailyArrayLogs, aggLates, aggUndertime, aggGross, aggDed, aggNet
    });
}

async function commitTimelineTransactionToCloud() {
    try {
        const payload = {
            timelineBuffer: timelineBuffer,
            inputSSS: document.getElementById('inputSSS').value,
            inputPHIC: document.getElementById('inputPHIC').value,
            inputHDMF: document.getElementById('inputHDMF').value,
            inputAdvances: document.getElementById('inputAdvances').value,
            inputDoublePay: document.getElementById('inputDoublePay').value,
            inputReimbursements: document.getElementById('inputReimbursements').value,
            updatedAt: Date.now()
        };
        await setDoc(doc(db, "salary_transactions", `${userId}_current`), payload, { merge: true });
        alert("TRANSACTIONS COMPILED AND SECURED SUCCESSFULLY.");
    } catch (err) {
        console.error("Sync failure: ", err);
    }
}

// ==========================================================================
// 7. COMPACT MATRIX RENDERING (FOR PRINTING/PDF)
// ==========================================================================
function generateCommercialReceiptLayout(m) {
    const printContainer = document.getElementById('print-render-matrix');
    if (!printContainer) return;
    const dateRangeLabel = document.getElementById('payableRangeDisplay').value;
    const timestampStr = new Date().toLocaleString('en-US', { hour12: true });
    const currentDailyRate = parseFloat(salarySettings.dailyRate) || 460;

    let dailyRowsHtml = "";
    m.structuralDailyArrayLogs.forEach(row => {
        dailyRowsHtml += `
            <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 4px; font-weight:700;">${row.date}</td>
                <td style="padding: 4px;">${row.dayStr}</td>
                <td style="padding: 4px;">${row.in1}</td>
                <td style="padding: 4px;">${row.out1}</td>
                <td style="padding: 4px;">${row.in2}</td>
                <td style="padding: 4px;">${row.out2}</td>
                <td style="padding: 4px;">${row.inOT}</td>
                <td style="padding: 4px;">${row.outOT}</td>
                <td style="padding: 4px;">${row.lates}</td>
                <td style="padding: 4px;">${row.undertime}</td>
                <td style="padding: 4px; text-align: right;">₱${formatCurrency(row.gross)}</td>
                <td style="padding: 4px; text-align: right; color:#c00;">₱${formatCurrency(row.deductions)}</td>
                <td style="padding: 4px; text-align: right; color:#00f;">₱${formatCurrency(row.net)}</td>
            </tr>
        `;
    });

    printContainer.innerHTML = `
        <div class="print-sheet" style="font-size:9px; width:100%; max-width:1000px; margin:0 auto; padding:10px; font-family:monospace; color:#000 !important; background:#fff !important; box-sizing:border-box;">
            <div style="border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:12px; text-align:center;">
                <div style="font-size:16px; font-weight:900; letter-spacing:1px;">PAYSLIP STATEMENT</div>
                <div style="font-size:10px;">Payroll Period: ${dateRangeLabel}</div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:15px; background:#f9f9f9; padding:10px; border:1px solid #ddd;">
                <div style="display:grid; grid-template-columns: 80px 1fr; gap: 5px;">
                    <div style="font-weight:700;">NAME:</div>    <div>${userProfile.customName || ""}</div>
                    <div style="font-weight:700;">USERNAME:</div>      <div>${(userProfile.name || "").toUpperCase()}</div>
                    <div style="font-weight:700;">ID NO.:</div>   <div>${(userProfile.email || "").toUpperCase()}</div>
                </div>
                <div style="display:grid; grid-template-columns: 90px 1fr; gap: 5px;">
                    <div style="font-weight:700;">POSITION:</div>  <div>${(salarySettings.position || 'Staff').toUpperCase()}</div>
                    <div style="font-weight:700;">DEPARTMENT:</div>      <div>${(salarySettings.department || 'Operations').toUpperCase()}</div>
                    <div style="font-weight:700;">DAILY RATE:</div><div><b>₱${formatCurrency(currentDailyRate)}</b></div>
                    <div style="font-weight:700;">WORKED:</div>    <div>${m.actualDaysWorkedCounter} DAYS</div>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 3fr 1fr; gap: 15px;">
                <table style="width:100%; border-collapse:collapse; font-size:8px;">
                    <thead>
                        <tr style="background:#000; color:#fff; font-weight:800;">
                            <th style="padding:4px; text-align:left;">DATE</th>
                            <th style="padding:4px; text-align:left;">DAY</th>
                            <th style="padding:4px; text-align:left;">IN 1</th>
                            <th style="padding:4px; text-align:left;">OUT 1</th>
                            <th style="padding:4px; text-align:left;">IN 2</th>
                            <th style="padding:4px; text-align:left;">OUT 2</th>
                            <th style="padding:4px; text-align:left;">OT IN</th>
                            <th style="padding:4px; text-align:left;">OT OUT</th>
                            <th style="padding:4px; text-align:left;">LATE</th>
                            <th style="padding:4px; text-align:left;">UT</th>
                            <th style="padding:4px; text-align:right;">GROSS</th>
                            <th style="padding:4px; text-align:right;">DED.</th>
                            <th style="padding:4px; text-align:right;">NET</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dailyRowsHtml}
                        <tr style="border-top:2px solid #000; font-weight:bold; background:#eee;">
                            <td colspan="8" style="padding:4px;">TOTALS</td>
                            <td style="padding:4px;">${m.aggLates}</td>
                            <td style="padding:4px;">${m.aggUndertime}</td>
                            <td style="padding:4px; text-align:right;">₱${formatCurrency(m.aggGross)}</td>
                            <td style="padding:4px; text-align:right; color:#c00;">₱${formatCurrency(m.aggDed)}</td>
                            <td style="padding:4px; text-align:right; color:#00f;">₱${formatCurrency(m.aggNet)}</td>
                        </tr>
                    </tbody>
                </table>
                <table style="width:100%; font-size:9px; border-collapse:collapse;">
                    <thead><tr style="border-bottom:1px solid #000;"><th colspan="2" style="text-align:left; padding-bottom:4px;">SUMMARY</th></tr></thead>
                    <tbody>
                        <tr><td style="padding:2px 0;">Basic</td><td style="text-align:right;">₱${formatCurrency(m.totalBasicEarnings)}</td></tr>
                        <tr><td style="padding:2px 0;">OT Pay</td><td style="text-align:right;">₱${formatCurrency(m.totalOvertimePay)}</td></tr>
                        <tr><td style="padding:2px 0;">Incentives</td><td style="text-align:right;">₱${formatCurrency(m.totalIncentives)}</td></tr>
                        <tr style="border-bottom:1px solid #000;"><td style="padding:2px 0;">Gross Run</td><td style="text-align:right;"><b>₱${formatCurrency(m.grossPay)}</b></td></tr>
                        <tr><td style="padding:2px 0;">SSS</td><td style="text-align:right;">₱${formatCurrency(m.sss)}</td></tr>
                        <tr><td style="padding:2px 0;">PhilHealth</td><td style="text-align:right;">₱${formatCurrency(m.phic)}</td></tr>
                        <tr><td style="padding:2px 0;">HDMF</td><td style="text-align:right;">₱${formatCurrency(m.hdmf)}</td></tr>
                        <tr><td style="padding:2px 0;">Late/UT Cut</td><td style="text-align:right;">₱${formatCurrency(m.totalDeductionPenalties)}</td></tr>
                        <tr style="border-bottom:1px solid #000;"><td style="padding:2px 0;">Cash Advances Pay</td><td style="text-align:right;">₱${formatCurrency(m.advances)}</td></tr>
                        <tr><td style="padding:4px 0;"><b>TOTAL DEDUCTION</b></td><td style="text-align:right; color:#c00;"><b>₱${formatCurrency(m.totalDeductions)}</b></td></tr>
                    </tbody>
                </table>
            </div>
            <div style="margin-top:15px; border:2px solid #000; padding:10px; text-align:center; background:#eee;">
                <span style="font-weight:900; font-size:14px;">NET PAY: ₱${formatCurrency(m.netPay)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:40px; font-size:10px;">
                <div style="text-align:center;">________________________<br>Payroll Administrator</div>
                <div style="text-align:center;">________________________<br>Employee Signature</div>
            </div>
            <div style="margin-top:10px; font-size:8px; color:#888; text-align:center;">PRINTED: ${timestampStr}</div>
        </div>
    `;
}

function triggerPrintPreviewPipeline() {
    window.print();
}

function triggerCSVExportPipeline() {
    const dailyRateValue = parseFloat(salarySettings.dailyRate) || 460;
    
    let csvRows = [];
    csvRows.push([`\"PAYSLIP ENGINE AUDIT REPORT EXPORT\"`]);
    csvRows.push([`\"NAME\"`,`\"${userProfile.customName || ""}\"`]);
    csvRows.push([`\"USERNAME\"`,`\"${(userProfile.name || "").toUpperCase()}\"`]);
    csvRows.push([`\"ID NO.\"`,`\"${(userProfile.email || "").toUpperCase()}\"`]);
    csvRows.push([`\"POSITION\"`,`\"${(salarySettings.position || 'Staff').toUpperCase()}\"`]);
    csvRows.push([`\"DEPARTMENT\"`,`\"${(salarySettings.department || 'Operations').toUpperCase()}\"`]);
    csvRows.push([`\"DAILY RATE\"`,`\"PHP ${formatCurrency(dailyRateValue)}\"`]);
    csvRows.push([`\"PERIOD RANGE\"`,`\"${document.getElementById('payableRangeDisplay').value}\"`]);
    csvRows.push([]);
    
    csvRows.push([
        `\"DATE\"`, `\"DAY\"`, `\"TIME IN 1\"`, `\"TIME OUT 1\"`, `\"TIME IN 2\"`, `\"TIME OUT 2\"`, `\"OT IN\"`, `\"OT OUT\"`, `\"LATES (MINS)\"`, `\"UNDERTIME (MINS)\"`, `\"GROSS DAY VALUE\"`, `\"DEDUCTION DAY CUT\"`, `\"DAILY NET\"`
    ]);
    
    const hourlyRate = dailyRateValue / 8;
    const minuteRate = hourlyRate / 60;
    const schedInMins = timeStringToMinutes(salarySettings.timeIn || "08:00");
    const schedOutMins = timeStringToMinutes(salarySettings.timeOut || "17:00");

    let sumLates = 0, sumUT = 0, sumGross = 0, sumDed = 0, sumNet = 0;

    activeDatesArray.forEach(dateObj => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dayOfWeekStr = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
        
        if(timelineBuffer[dateKey] && timelineBuffer[dateKey].filled) {
            const rec = timelineBuffer[dateKey];
            let lateMins = 0;
            let utMins = 0;
            let dayGross = dailyRateValue;

            if (timeStringToMinutes(rec.in1) > schedInMins) lateMins = timeStringToMinutes(rec.in1) - schedInMins;
            
            const effectiveFinalOut = rec.out2 ? rec.out2 : rec.out1;
            const actOutMins = timeStringToMinutes(effectiveFinalOut);
            
            if (actOutMins < schedOutMins) {
                utMins = schedOutMins - actOutMins;
                if (salarySettings.hasLunchBreak !== false) {
                    const lunchStartMins = timeStringToMinutes("12:00");
                    const lunchEndMins = timeStringToMinutes("13:00");
                    if (actOutMins <= lunchStartMins) {
                        utMins -= 60;
                    } else if (actOutMins > lunchStartMins && actOutMins < lunchEndMins) {
                        utMins -= (lunchEndMins - actOutMins);
                    }
                }
            }
            
            let dayDed = (lateMins + utMins) * minuteRate;

            if (rec.hasOT && rec.inOT && rec.outOT) {
                const otMins = timeStringToMinutes(rec.outOT) - timeStringToMinutes(rec.inOT);
                if (otMins >= 30) dayGross += (otMins * minuteRate);
            }

            let dayNet = dayGross - dayDed;

            sumLates += lateMins;
            sumUT += utMins;
            sumGross += dayGross;
            sumDed += dayDed;
            sumNet += dayNet;

            csvRows.push([
                `\"${dateKey}\"`, `\"${dayOfWeekStr}\"`, `\"${rec.in1}\"`, `\"${rec.out1}\"`, `\"${rec.in2 || '-'}\"`, `\"${rec.out2 || '-'}\"`, `\"${rec.hasOT ? rec.inOT : '-'}\"`, `\"${rec.hasOT ? rec.outOT : '-'}\"`, lateMins, utMins, formatCurrency(dayGross), formatCurrency(dayDed), formatCurrency(dayNet)
            ]);
        } else {
            csvRows.push([`\"${dateKey}\"`, `\"${dayOfWeekStr}\"`, `\"-\"`, `\"-\"`, `\"-\"`, `\"-\"`, `\"-\"`, `\"-\"`, 0, 0, `0.00`, `0.00`, `0.00`]);
        }
    });

    csvRows.push([
        `\"TOTALS\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, sumLates, sumUT, formatCurrency(sumGross), formatCurrency(sumDed), formatCurrency(sumNet)
    ]);
    
    csvRows.push([]);
    csvRows.push([`\"FINANCIAL STREAM ENTRIES SUMMARY\"`]);
    csvRows.push([`\"BASIC PAY RUN\"`, `\"${document.getElementById('breakdownBasic').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"OVERTIME PAY\"`, `\"${document.getElementById('breakdownOT').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"DOUBLE PAY INCENTIVE\"`, `\"${formatCurrency(parseFloat(document.getElementById('inputDoublePay').value || 0))}\"`]);
    csvRows.push([`\"REIMBURSEMENTS ALLOWANCE\"`, `\"${formatCurrency(parseFloat(document.getElementById('inputReimbursements').value || 0))}\"`]);
    csvRows.push([`\"TOTAL GROSS RUN\"`, `\"${document.getElementById('breakdownGross').innerText.replace('₱','')}\"`]);
    csvRows.push([]);
    csvRows.push([`\"DEDUCTION ACCOUNT ITEMS\"`]);
    csvRows.push([`\"SSS CONTRIBUTION\"`, `\"${document.getElementById('breakdownSSS').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"PHIC MEDICAL PREMIUM\"`, `\"${document.getElementById('breakdownPHIC').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"HDMF FUND CONTRIB\"`, `\"${document.getElementById('breakdownHDMF').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"ATTENDANCE PENALTIES\"`, `\"${document.getElementById('breakdownPenalties').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"CASH ADVANCES\"`, `\"${document.getElementById('breakdownAdvances').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"TOTAL DEDUCTIONS\"`, `\"${document.getElementById('breakdownTotalDed').innerText.replace('₱','')}\"`]);
    csvRows.push([]);
    csvRows.push([`\"NET DISBURSABLE PAYOUT\"`, `\"${document.getElementById('breakdownNet').innerText.replace('₱','')}\"`]);

    const csvString = csvRows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `PAYSLIP_AUDIT_LOGS_${userId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================================================
// 8. MODERN DOM EVENT LISTENERS ATTACHMENTS
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    bootEngineCore();
    
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // Dynamic Input Value Streams Remapping Listeners
    document.getElementById('periodSelector').addEventListener('change', processPeriodEngineChange);
    document.getElementById('inputDoublePay').addEventListener('input', recomputeGlobalFinancials);
    document.getElementById('inputReimbursements').addEventListener('input', recomputeGlobalFinancials);
    document.getElementById('inputSSS').addEventListener('input', recomputeGlobalFinancials);
    document.getElementById('inputPHIC').addEventListener('input', recomputeGlobalFinancials);
    document.getElementById('inputHDMF').addEventListener('input', recomputeGlobalFinancials);
    document.getElementById('inputAdvances').addEventListener('input', recomputeGlobalFinancials);

    // Modal Real-time Listener Events Actions
    document.getElementById('modalTimeIn1').addEventListener('change', runRealtimeMetricsDeductionEngine);
    document.getElementById('modalTimeOut1').addEventListener('change', () => {
        evaluateLunchBreakConstraints();
        runRealtimeMetricsDeductionEngine();
    });
    document.getElementById('modalTimeIn2').addEventListener('change', runRealtimeMetricsDeductionEngine);
    document.getElementById('modalTimeOut2').addEventListener('change', runRealtimeMetricsDeductionEngine);
    document.getElementById('chkEnableOTWrapper').addEventListener('click', toggleOvertimeSubSection);

    // Core Controls Action Listeners
    document.getElementById('btnSaveToCloud').addEventListener('click', commitTimelineTransactionToCloud);
    document.getElementById('btnPrintPreview').addEventListener('click', triggerPrintPreviewPipeline);
    document.getElementById('btnExportCSV').addEventListener('click', triggerCSVExportPipeline);
    
    document.getElementById('btnModalClose').addEventListener('click', closeTimeTransactionModal);
    document.getElementById('btnModalApply').addEventListener('click', commitModalDayStateToLocalBuffer);
    document.getElementById('btnModalClear').addEventListener('click', clearModalDayState);
});
