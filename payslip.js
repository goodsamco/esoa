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

// Debounce & State Flags
let autoSaveTimer = null;
let hasUnsavedChanges = false;

function formatCurrency(amount) {
    return (amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeStringToMinutes(timeStr) {
    if(!timeStr || timeStr === "-") return 0;
    const p = timeStr.split(':');
    return parseInt(p[0]) * 60 + parseInt(p[1]);
}

// Custom Top Toast System
function showToast(message, duration = 3000) {
    let container = document.getElementById('toastEngineContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastEngineContainer';
        container.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); z-index:100000; display:flex; flex-direction:column; gap:10px; pointer-events:none;";
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = "background:#1e293b; color:#38bdf8; padding:12px 24px; border-radius:8px; border:1px solid #38bdf8; font-family:monospace; font-size:12px; font-weight:bold; box-shadow:0 10px 15px -3px rgba(0,0,0,0.5); transition:all 0.3s ease; opacity:0; transform:translateY(-20px); letter-spacing:1px;";
    toast.innerText = message.toUpperCase();
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    }, 50);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-20px)";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Loading Spinner Utilities
function showGlobalEngineLoader() {
    let loader = document.getElementById('engineGlobalLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'engineGlobalLoader';
        loader.innerHTML = `
            <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-family:monospace;">
                <div style="width:50px; height:50px; border:5px solid #333; border-top:5px solid #38bdf8; border-radius:50%; animation:spinEngine 1s linear infinite; margin-bottom:15px;"></div>
                <div style="letter-spacing:2px; font-size:12px; font-weight:bold;">COMPILING PAYROLL MATRIX...</div>
            </div>
            <style>@keyframes spinEngine { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        `;
        document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
}

function hideGlobalEngineLoader() {
    const loader = document.getElementById('engineGlobalLoader');
    if (loader) loader.style.display = 'none';
}

// Unsaved Changes Safety Modal UI
function injectExitGuardModal() {
    if(document.getElementById('exitGuardModalOverlay')) return;
    const modal = document.createElement('div');
    modal.id = 'exitGuardModalOverlay';
    modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:100001; display:none; align-items:center; justify-content:center; font-family:monospace;";
    modal.innerHTML = `
        <div style="background:#0f172a; border:2px solid #ef4444; padding:25px; width:90%; max-width:400px; border-radius:8px; color:#fff; text-align:center;">
            <div style="color:#ef4444; font-size:14px; font-weight:bold; margin-bottom:15px; letter-spacing:1px;">UNSAVED CHANGES DETECTED</div>
            <p style="font-size:11px; color:#94a3b8; margin-bottom:20px; line-height:1.5;">YOU HAVE UNCOMMITTED PAYROLL TRANSACTIONS. CHOOSE AN ACTION BEFORE LEAVING.</p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <button id="btnGuardSaveExit" style="background:#38bdf8; color:#000; border:none; padding:10px; font-weight:bold; cursor:pointer; font-family:monospace; font-size:11px; border-radius:4px;">SAVE & EXIT</button>
                <button id="btnGuardDiscard" style="background:#334155; color:#fff; border:none; padding:10px; font-weight:bold; cursor:pointer; font-family:monospace; font-size:11px; border-radius:4px;">DISCARD</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btnGuardSaveExit').onclick = async () => {
        await commitTimelineTransactionToCloud(true);
        hasUnsavedChanges = false;
        modal.style.display = 'none';
        showToast("DATA SECURED. EXIT PERMITTED.");
    };
    document.getElementById('btnGuardDiscard').onclick = () => {
        hasUnsavedChanges = false;
        modal.style.display = 'none';
        showToast("CHANGES DISCARDED.");
    };
}

// Trigger Auto Save Engine Loop (1-Second Delay)
function markChangeAndQueueAutoSave() {
    hasUnsavedChanges = true;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
        await commitTimelineTransactionToCloud(true);
    }, 1000);
}

// ==========================================================================
// 3. CORE INITIALIZATION ROUTINE ENGINE
// ==========================================================================
async function bootEngineCore() {
    showGlobalEngineLoader();
    injectExitGuardModal();
    try {
        const accountRef = doc(db, "accounts", userId);
        const accountSnap = await getDoc(accountRef);

        if (accountSnap.exists()) {
            const accountData = accountSnap.data();
            userProfile.name = accountData.username || localStorage.getItem("userName") || userProfile.name;
            if (accountData.customName) userProfile.customName = accountData.customName.toUpperCase();
            if (accountData.bgValue) document.documentElement.style.setProperty('--bg', accountData.bgValue);
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
            if (salarySettings.emailAddress) userProfile.email = salarySettings.emailAddress;
        }

        updateUIProfileElements();
        buildDropdownTargetIntervals();
        await fetchAndProcessSelectedPeriodPayload();

    } catch (err) {
        console.error("Setup initialization error: ", err);
    } finally {
        hideGlobalEngineLoader();
    }
}

function updateUIProfileElements() {
    if (document.getElementById('profSettingsNameDisplay')) document.getElementById('profSettingsNameDisplay').innerText = (userProfile.customName || "").toUpperCase();
    if (document.getElementById('profNameDisplay')) document.getElementById('profNameDisplay').innerText = (userProfile.name || "").toUpperCase();
    if (document.getElementById('profEmailDisplay')) document.getElementById('profEmailDisplay').innerText = (userProfile.email || "").toUpperCase();
    if (document.getElementById('profPosDisplay')) document.getElementById('profPosDisplay').innerText = (salarySettings.position || "Staff").toUpperCase();
    if (document.getElementById('profDeptDisplay')) document.getElementById('profDeptDisplay').innerText = (salarySettings.department || "Operations").toUpperCase();
    
    let rateElement = document.getElementById('profDailyRateDisplay');
    const formattedRate = `₱${formatCurrency(parseFloat(salarySettings.dailyRate) || 460)}`;
    if (rateElement) {
        rateElement.innerText = formattedRate;
    } else {
        const badgeDeck = document.querySelector('.profile-badge-deck');
        if (badgeDeck) {
            const newMetaRow = document.createElement('div');
            newMetaRow.className = "profile-meta-row";
            newMetaRow.innerHTML = `<span class="lbl">DAILY RATE</span><span class="val" id="profDailyRateDisplay">${formattedRate}</span>`;
            badgeDeck.appendChild(newMetaRow);
        }
    }
}

function buildDropdownTargetIntervals() {
    const selector = document.getElementById('periodSelector');
    if (!selector) return;
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

async function fetchAndProcessSelectedPeriodPayload() {
    if(hasUnsavedChanges) {
        const modal = document.getElementById('exitGuardModalOverlay');
        if(modal) modal.style.display = 'flex';
        return;
    }
    showGlobalEngineLoader();
    
    try {
        const selector = document.getElementById('periodSelector');
        if (!selector) return;
        const selectedPeriodKey = selector.value; 
        const pieces = selectedPeriodKey.split('-');
        const year = parseInt(pieces[0]);
        const monthIdx = parseInt(pieces[1]) - 1;
        const day = parseInt(pieces[2]);

        activeDatesArray = [];
        timelineBuffer = {};

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
        
        if (document.getElementById('payableRangeDisplay')) {
            document.getElementById('payableRangeDisplay').value = `${startStr} - ${endStr}`;
        }

        if (document.getElementById('inputSSS')) document.getElementById('inputSSS').value = "";
        if (document.getElementById('inputPHIC')) document.getElementById('inputPHIC').value = "";
        if (document.getElementById('inputHDMF')) document.getElementById('inputHDMF').value = "";
        if (document.getElementById('inputAdvances')) document.getElementById('inputAdvances').value = "";
        if (document.getElementById('inputDoublePay')) document.getElementById('inputDoublePay').value = "";
        if (document.getElementById('inputReimbursements')) document.getElementById('inputReimbursements').value = "";

        const transSnap = await getDoc(doc(db, "salary_transactions", `${userId}_${selectedPeriodKey}`));
        if (transSnap.exists()) {
            const loadedData = transSnap.data();
            if (loadedData.timelineBuffer) timelineBuffer = loadedData.timelineBuffer;
            if (document.getElementById('inputSSS')) document.getElementById('inputSSS').value = loadedData.inputSSS || "";
            if (document.getElementById('inputPHIC')) document.getElementById('inputPHIC').value = loadedData.inputPHIC || "";
            if (document.getElementById('inputHDMF')) document.getElementById('inputHDMF').value = loadedData.inputHDMF || "";
            if (document.getElementById('inputAdvances')) document.getElementById('inputAdvances').value = loadedData.inputAdvances || "";
            if (document.getElementById('inputDoublePay')) document.getElementById('inputDoublePay').value = loadedData.inputDoublePay || "";
            if (document.getElementById('inputReimbursements')) document.getElementById('inputReimbursements').value = loadedData.inputReimbursements || "";
        }
        
        evaluateDynamicLockAndBlurConstraints();
        renderActivePeriodCalendarGrid();
        recomputeGlobalFinancials();
        hasUnsavedChanges = false;
    } catch(e) {
        console.error("Payload data recovery error: ", e);
    } finally {
        hideGlobalEngineLoader();
    }
}

function evaluateDynamicLockAndBlurConstraints() {
    const today = new Date();
    const currentDay = today.getDate();

    let revealNetPay = false;
    if (today.getFullYear() === CURRENT_YEAR) {
        if ((currentDay >= 13 && currentDay <= 16) || (currentDay >= 28 || currentDay <= 2)) {
            revealNetPay = true;
        }
    }
    
    const wrapper = document.getElementById('netPayWrapperDeck');
    const badge = document.getElementById('lockBadgeDisplay');
    if (!revealNetPay) {
        if (wrapper) wrapper.classList.add('blurred-lock');
        if (badge) badge.style.display = "inline-block";
    } else {
        if (wrapper) wrapper.classList.remove('blurred-lock');
        if (badge) badge.style.display = "none";
    }
}

function verifyActionAllowedDateConstraints() {
    const today = new Date();
    const day = today.getDate();
    return ((day >= 13 && day <= 16) || (day >= 28 || day <= 2));
}

// ==========================================================================
// 4. MATRIX UI CALENDAR RENDER ENGINE
// ==========================================================================
function renderActivePeriodCalendarGrid() {
    const grid = document.getElementById('calendarNodeGrid');
    if (!grid) return;
    grid.innerHTML = "";

    const today = new Date();
    today.setHours(0,0,0,0);

    activeDatesArray.forEach(dateObj => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dayOfWeekStr = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

        const comparisonDate = new Date(dateObj);
        comparisonDate.setHours(0,0,0,0);

        let isLockedPastDate = false;
        let isFutureDate = false;

        if (comparisonDate.getTime() > today.getTime()) {
            isFutureDate = true;
        } else if (year < today.getFullYear()) {
            isLockedPastDate = true;
        } else if (year === today.getFullYear() && dateObj.getMonth() < today.getMonth()) {
            if (!(dateObj.getMonth() === today.getMonth() - 1 && dateObj.getDate() >= 29)) {
                isLockedPastDate = true;
            }
        }

        const cell = document.createElement('div');
        cell.className = "calendar-day-node";
        
        if (isFutureDate) {
            cell.classList.add("node-future-locked");
            cell.style.opacity = "0.4";
            cell.style.cursor = "not-allowed";
        } else if (isLockedPastDate) {
            cell.classList.add("node-locked");
        }

        cell.innerHTML = `<span class="day-num">${day}</span><span class="day-lbl">${dayOfWeekStr}</span>`;

        if (isLockedPastDate || isFutureDate) {
            const iconSpan = document.createElement('span');
            iconSpan.className = "lock-corner-icon";
            iconSpan.innerHTML = `<i data-lucide="lock" style="width:10px;height:10px;"></i>`;
            cell.appendChild(iconSpan);
        }

        if (timelineBuffer[dateKey] && timelineBuffer[dateKey].filled) {
            cell.style.backgroundColor = document.documentElement.style.getPropertyValue('--primary') || "var(--primary)";
            cell.style.color = "#000000";
            cell.querySelector('.day-lbl').style.color = "rgba(0,0,0,0.6)";
        }

        cell.onclick = () => {
            if (isFutureDate) {
                showToast("UNABLE TO LOG ATTENDANCE: THIS FUTURE CHRONOLOGICAL DATE HAS NOT TRANSPIRED YET.");
                return;
            }
            if (isLockedPastDate) {
                showToast("THIS HISTORICAL RECORD CYCLE IS LOCKED AND UNFILLABLE.");
                return;
            }
            launchTimeTransactionModal(dateKey, false);
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
    if (document.getElementById('modalTargetDateHeader')) document.getElementById('modalTargetDateHeader').innerText = `LOGS FOR ${dateKey}`;
    
    if (document.getElementById('modalTimeIn1')) document.getElementById('modalTimeIn1').value = "";
    if (document.getElementById('modalTimeOut1')) document.getElementById('modalTimeOut1').value = "";
    if (document.getElementById('modalTimeIn2')) document.getElementById('modalTimeIn2').value = "";
    if (document.getElementById('modalTimeOut2')) document.getElementById('modalTimeOut2').value = "";
    if (document.getElementById('modalTimeInOT')) document.getElementById('modalTimeInOT').value = "";
    if (document.getElementById('modalTimeOutOT')) document.getElementById('modalTimeOutOT').value = "";
    
    if (document.getElementById('chkEnableOT')) document.getElementById('chkEnableOT').checked = false;
    if (document.getElementById('otSubSectionDeck')) document.getElementById('otSubSectionDeck').style.display = "none";

    if (timelineBuffer[dateKey]) {
        const rec = timelineBuffer[dateKey];
        if (document.getElementById('modalTimeIn1')) document.getElementById('modalTimeIn1').value = rec.in1 || "";
        if (document.getElementById('modalTimeOut1')) document.getElementById('modalTimeOut1').value = rec.out1 || "";
        if (document.getElementById('modalTimeIn2')) document.getElementById('modalTimeIn2').value = rec.in2 || "";
        if (document.getElementById('modalTimeOut2')) document.getElementById('modalTimeOut2').value = rec.out2 || "";
        if (rec.hasOT) {
            if (document.getElementById('chkEnableOT')) document.getElementById('chkEnableOT').checked = true;
            if (document.getElementById('otSubSectionDeck')) document.getElementById('otSubSectionDeck').style.display = "block";
            if (document.getElementById('modalTimeInOT')) document.getElementById('modalTimeInOT').value = rec.inOT || "";
            if (document.getElementById('modalTimeOutOT')) document.getElementById('modalTimeOutOT').value = rec.outOT || "";
        }
    } else {
        if (salarySettings.hasLunchBreak !== false) {
            if (document.getElementById('modalTimeIn1')) document.getElementById('modalTimeIn1').value = salarySettings.timeIn || "08:00";
            if (document.getElementById('modalTimeOut1')) document.getElementById('modalTimeOut1').value = "12:00";
            if (document.getElementById('modalTimeIn2')) document.getElementById('modalTimeIn2').value = "13:00";
            if (document.getElementById('modalTimeOut2')) document.getElementById('modalTimeOut2').value = salarySettings.timeOut || "17:00";
        } else {
            if (document.getElementById('modalTimeIn1')) document.getElementById('modalTimeIn1').value = salarySettings.timeIn || "08:00";
            if (document.getElementById('modalTimeOut1')) document.getElementById('modalTimeOut1').value = salarySettings.timeOut || "17:00";
            if (document.getElementById('modalTimeIn2')) document.getElementById('modalTimeIn2').value = "";
            if (document.getElementById('modalTimeOut2')) document.getElementById('modalTimeOut2').value = "";
        }
    }

    const container = document.getElementById('modalBoxContainer');
    if (container) {
        const inputs = container.querySelectorAll('input, select');
        if (isPastDate) {
            inputs.forEach(el => el.setAttribute('disabled', 'true'));
            if (document.getElementById('modalActionFooterDeck')) document.getElementById('modalActionFooterDeck').style.display = "none";
            if (document.getElementById('modalLockedWarningLabel')) document.getElementById('modalLockedWarningLabel').style.display = "block";
        } else {
            inputs.forEach(el => el.removeAttribute('disabled'));
            if (document.getElementById('modalActionFooterDeck')) document.getElementById('modalActionFooterDeck').style.display = "grid";
            if (document.getElementById('modalLockedWarningLabel')) document.getElementById('modalLockedWarningLabel').style.display = "none";
        }
    }

    runRealtimeMetricsDeductionEngine();
    if (document.getElementById('timeConfigModalOverlay')) document.getElementById('timeConfigModalOverlay').classList.add('active');
}

function evaluateLunchBreakConstraints() {
    const out1El = document.getElementById('modalTimeOut1');
    if (out1El && out1El.value) {
        const out1Mins = timeStringToMinutes(out1El.value);
        if (out1Mins < timeStringToMinutes("12:59")) {
            if (document.getElementById('modalTimeIn2')) document.getElementById('modalTimeIn2').value = "";
            if (document.getElementById('modalTimeOut2')) document.getElementById('modalTimeOut2').value = "";
        }
    }
}

// Rest of code missing wrapper safe close helper fix
function closeTimeTransactionModal() {
    if (document.getElementById('timeConfigModalOverlay')) document.getElementById('timeConfigModalOverlay').classList.remove('active');
}

function runRealtimeMetricsDeductionEngine() {
    const schedIn = salarySettings.timeIn || "08:00";
    const schedOut = salarySettings.timeOut || "17:00";
    const in1 = document.getElementById('modalTimeIn1') ? document.getElementById('modalTimeIn1').value : "";
    const out1 = document.getElementById('modalTimeOut1') ? document.getElementById('modalTimeOut1').value : "";
    const out2 = document.getElementById('modalTimeOut2') ? document.getElementById('modalTimeOut2').value : "";

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

    if (document.getElementById('rtLateDisplay')) document.getElementById('rtLateDisplay').innerText = `${lateMinutes} MINS`;
    if (document.getElementById('rtUndertimeDisplay')) document.getElementById('rtUndertimeDisplay').innerText = `${undertimeMinutes} MINS`;
}

function toggleOvertimeSubSection() {
    const otCheck = document.getElementById('chkEnableOT');
    if(otCheck && otCheck.disabled) return;
    const checked = otCheck ? otCheck.checked : false;
    if (document.getElementById('otSubSectionDeck')) document.getElementById('otSubSectionDeck').style.display = checked ? "block" : "none";
}

function commitModalDayStateToLocalBuffer() {
    const in1 = document.getElementById('modalTimeIn1') ? document.getElementById('modalTimeIn1').value : "";
    const out1 = document.getElementById('modalTimeOut1') ? document.getElementById('modalTimeOut1').value : "";

    if (!in1 || !out1) {
        showToast("CORE TIMELINE IN & OUT VALUES REQUIRED.");
        return;
    }

    const hasOT = document.getElementById('chkEnableOT') ? document.getElementById('chkEnableOT').checked : false;
    timelineBuffer[currentTargetDateString] = {
        filled: true,
        in1: in1,
        out1: out1,
        in2: (document.getElementById('modalTimeIn2') ? document.getElementById('modalTimeIn2').value : "") || "",
        out2: (document.getElementById('modalTimeOut2') ? document.getElementById('modalTimeOut2').value : "") || "",
        hasOT: hasOT,
        inOT: hasOT ? (document.getElementById('modalTimeInOT') ? document.getElementById('modalTimeInOT').value : "") : "",
        outOT: hasOT ? (document.getElementById('modalTimeOutOT') ? document.getElementById('modalTimeOutOT').value : "") : ""
    };

    closeTimeTransactionModal();
    renderActivePeriodCalendarGrid();
    recomputeGlobalFinancials();
    markChangeAndQueueAutoSave();
}

function clearModalDayState() {
    if (timelineBuffer[currentTargetDateString]) {
        delete timelineBuffer[currentTargetDateString];
    }
    closeTimeTransactionModal();
    renderActivePeriodCalendarGrid();
    recomputeGlobalFinancials();
    markChangeAndQueueAutoSave();
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
    let aggDailyGrossOnly = 0; 
    let aggOtGrossOnly = 0;    
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

        let dayBasicGross = 0;
        let dayOtGross = 0;
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
            dayBasicGross = dailyRate;

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
                if (salarySettings.hasLunchBreak !== false) {
                    const lunchStartMins = timeStringToMinutes("12:00");
                    const lunchEndMins = timeStringToMinutes("13:00");
                    if (actOutMins <= lunchStartMins) {
                        dayUndertimeMins -= 60;
                    } else if (actOutMins > lunchStartMins && actualOutMins < lunchEndMins) {
                        dayUndertimeMins -= (lunchEndMins - actOutMins);
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
                    dayOtGross = otMins * minuteRate;
                    totalOvertimePay += dayOtGross;
                }
            }
        }
            
        let dayNet = (dayBasicGross + dayOtGross) - dayDed;

        aggLates += dayLateMins;
        aggUndertime += dayUndertimeMins;
        aggDailyGrossOnly += dayBasicGross;
        aggOtGrossOnly += dayOtGross;
        aggDed += dayDed;
        aggNet += dayNet;

        uiTableRowsHtml += `
            <tr style="border-bottom: 1px dashed #334155;">
                <td rowspan="2" style="vertical-align:middle; font-weight:bold; color:#f8fafc;">${dateKey}</td>
                <td rowspan="2" style="vertical-align:middle;">${dayOfWeekStr.toUpperCase()}</td>
                <td rowspan="2" style="vertical-align:middle;">${tIn1}</td>
                <td rowspan="2" style="vertical-align:middle;">${tOut1}</td>
                <td rowspan="2" style="vertical-align:middle;">${tIn2}</td>
                <td rowspan="2" style="vertical-align:middle;">${tOut2}</td>
                <td rowspan="2" style="vertical-align:middle;">${otIn}</td>
                <td rowspan="2" style="vertical-align:middle;">${otOut}</td>
                <td rowspan="2" style="vertical-align:middle; color:#94a3b8;">${dayLateMins}</td>
                <td rowspan="2" style="vertical-align:middle; color:#94a3b8;">${dayUndertimeMins}</td>
                <td style="color:#e2e8f0; text-align:right;">DAILY: ₱${formatCurrency(dayBasicGross)}</td>
                <td rowspan="2" style="vertical-align:middle; text-align:right; color:${dayDed > 0 ? '#ef4444' : '#64748b'};">₱${formatCurrency(dayDed)}</td>
                <td rowspan="2" style="vertical-align:middle; text-align:right; color:#38bdf8; font-weight:bold;">₱${formatCurrency(dayNet)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #334155;">
                <td style="color:#38bdf8; text-align:right; font-size:10px;">OT: ₱${formatCurrency(dayOtGross)}</td>
            </tr>
        `;

        structuralDailyArrayLogs.push({
            date: dateKey, dayStr: dayOfWeekStr.toUpperCase(),
            in1: tIn1, out1: tOut1, in2: tIn2, out2: tOut2, inOT: otIn, outOT: otOut,
            lates: dayLateMins, undertime: dayUndertimeMins,
            dailyGross: dayBasicGross, otGross: dayOtGross, deductions: dayDed, net: dayNet
        });
    });

    const breakdownBody = document.getElementById('uiDailyBreakdownBody');
    if (breakdownBody) breakdownBody.innerHTML = uiTableRowsHtml;

    if (document.getElementById('totalLates')) document.getElementById('totalLates').innerText = aggLates;
    if (document.getElementById('totalUndertime')) document.getElementById('totalUndertime').innerText = aggUndertime;
    if (document.getElementById('totalGross')) document.getElementById('totalGross').innerText = `₱${formatCurrency(aggDailyGrossOnly + aggOtGrossOnly)}`;
    if (document.getElementById('totalDed')) document.getElementById('totalDed').innerText = `₱${formatCurrency(aggDed)}`;
    if (document.getElementById('totalDailyNet')) document.getElementById('totalDailyNet').innerText = `₱${formatCurrency(aggNet)}`;

    const doublePay = parseFloat(document.getElementById('inputDoublePay') ? document.getElementById('inputDoublePay').value : 0) || 0;
    const reimbursements = parseFloat(document.getElementById('inputReimbursements') ? document.getElementById('inputReimbursements').value : 0) || 0;
    const totalIncentives = doublePay + reimbursements;

    const sss = parseFloat(document.getElementById('inputSSS') ? document.getElementById('inputSSS').value : 0) || 0;
    const phic = parseFloat(document.getElementById('inputPHIC') ? document.getElementById('inputPHIC').value : 0) || 0;
    const hdmf = parseFloat(document.getElementById('inputHDMF') ? document.getElementById('inputHDMF').value : 0) || 0;
    const advances = parseFloat(document.getElementById('inputAdvances') ? document.getElementById('inputAdvances').value : 0) || 0;

    const grossPay = totalBasicEarnings + totalOvertimePay + totalIncentives;
    const totalDeductions = sss + phic + hdmf + totalDeductionPenalties + advances;
    const netPay = grossPay - totalDeductions;

    if (document.getElementById('breakdownBasic')) document.getElementById('breakdownBasic').innerText = `₱${formatCurrency(totalBasicEarnings)}`;
    if (document.getElementById('breakdownOT')) document.getElementById('breakdownOT').innerText = `₱${formatCurrency(totalOvertimePay)}`;
    if (document.getElementById('breakdownIncentives')) document.getElementById('breakdownIncentives').innerText = `₱${formatCurrency(totalIncentives)}`;
    if (document.getElementById('breakdownGross')) document.getElementById('breakdownGross').innerText = `₱${formatCurrency(grossPay)}`;

    if (document.getElementById('breakdownSSS')) document.getElementById('breakdownSSS').innerText = `₱${formatCurrency(sss)}`;
    if (document.getElementById('breakdownPHIC')) document.getElementById('breakdownPHIC').innerText = `₱${formatCurrency(phic)}`;
    if (document.getElementById('breakdownHDMF')) document.getElementById('breakdownHDMF').innerText = `₱${formatCurrency(hdmf)}`;
    if (document.getElementById('breakdownPenalties')) document.getElementById('breakdownPenalties').innerText = `₱${formatCurrency(totalDeductionPenalties)}`;
    if (document.getElementById('breakdownAdvances')) document.getElementById('breakdownAdvances').innerText = `₱${formatCurrency(advances)}`;
    if (document.getElementById('breakdownTotalDed')) document.getElementById('breakdownTotalDed').innerText = `₱${formatCurrency(totalDeductions)}`;
    if (document.getElementById('breakdownNet')) document.getElementById('breakdownNet').innerText = `₱${formatCurrency(netPay)}`;

    generateCommercialReceiptLayout({
        totalBasicEarnings, totalOvertimePay, totalIncentives, doublePay, reimbursements, grossPay,
        sss, phic, hdmf, totalDeductionPenalties, advances, totalDeductions, netPay,
        actualDaysWorkedCounter, structuralDailyArrayLogs, aggLates, aggUndertime, aggDailyGrossOnly, aggOtGrossOnly, aggDed, aggNet
    });
}

async function commitTimelineTransactionToCloud(isAutoSave = false) {
    const selector = document.getElementById('periodSelector');
    if (!selector) return;
    const selectedPeriodKey = selector.value; 
    try {
        const payload = {
            timelineBuffer: timelineBuffer,
            inputSSS: document.getElementById('inputSSS') ? document.getElementById('inputSSS').value : "",
            inputPHIC: document.getElementById('inputPHIC') ? document.getElementById('inputPHIC').value : "",
            inputHDMF: document.getElementById('inputHDMF') ? document.getElementById('inputHDMF').value : "",
            inputAdvances: document.getElementById('inputAdvances') ? document.getElementById('inputAdvances').value : "",
            inputDoublePay: document.getElementById('inputDoublePay') ? document.getElementById('inputDoublePay').value : "",
            inputReimbursements: document.getElementById('inputReimbursements') ? document.getElementById('inputReimbursements').value : "",
            updatedAt: Date.now()
        };
        await setDoc(doc(db, "salary_transactions", `${userId}_${selectedPeriodKey}`), payload, { merge: true });
        hasUnsavedChanges = false;
        
        if(isAutoSave) {
            showToast("CHANGES SAVED AUTOMATICALLY");
        } else {
            showToast("TRANSACTIONS COMPILED AND SECURED SUCCESSFULLY.");
        }
    } catch (err) {
        console.error("Sync failure: ", err);
        showToast("CLOUD SYNC ERROR ENCOUNTERED");
    }
}

// ==========================================================================
// 7. COMPACT MATRIX RENDERING (FOR PRINTING/PDF WITH TWO ROWS PER ENTRY)
// ==========================================================================
function generateCommercialReceiptLayout(m) {
    const printContainer = document.getElementById('print-render-matrix');
    if (!printContainer) return;
    const dateRangeLabel = document.getElementById('payableRangeDisplay') ? document.getElementById('payableRangeDisplay').value : "";
    const timestampStr = new Date().toLocaleString('en-US', { hour12: true });
    const currentDailyRate = parseFloat(salarySettings.dailyRate) || 460;

    let dailyRowsHtml = "";
    m.structuralDailyArrayLogs.forEach(row => {
        dailyRowsHtml += `
            <tr style="border-bottom: 1px dashed #aaa;">
                <td rowspan="2" style="padding: 4px; font-weight:700; vertical-align:middle;">${row.date}</td>
                <td rowspan="2" style="padding: 4px; vertical-align:middle;">${row.dayStr}</td>
                <td rowspan="2" style="padding: 4px; vertical-align:middle;">${row.in1}</td>
                <td rowspan="2" style="padding: 4px; vertical-align:middle;">${row.out1}</td>
                <td rowspan="2" style="padding: 4px; vertical-align:middle;">${row.in2}</td>
                <td rowspan="2" style="padding: 4px; vertical-align:middle;">${row.out2}</td>
                <td rowspan="2" style="padding: 4px; vertical-align:middle;">${row.inOT}</td>
                <td rowspan="2" style="padding: 4px; vertical-align:middle;">${row.outOT}</td>
                <td rowspan="2" style="padding: 4px; vertical-align:middle;">${row.lates}</td>
                <td rowspan="2" style="padding: 4px; vertical-align:middle;">${row.undertime}</td>
                <td style="padding: 2px 4px; text-align: right; font-weight:500;">DAILY: ₱${formatCurrency(row.dailyGross)}</td>
                <td rowspan="2" style="padding: 4px; text-align: right; color:#c00; vertical-align:middle;">₱${formatCurrency(row.deductions)}</td>
                <td rowspan="2" style="padding: 4px; text-align: right; color:#00f; font-weight:bold; vertical-align:middle;">₱${formatCurrency(row.net)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #000;">
                <td style="padding: 2px 4px; text-align: right; color:#2563eb; font-size:7.5px;">OT: ₱${formatCurrency(row.otGross)}</td>
            </tr>
        `;
    });

    const bBasicStr = document.getElementById('breakdownBasic') ? document.getElementById('breakdownBasic').innerText.replace('₱','') : "0.00";
    const bOtStr = document.getElementById('breakdownOT') ? document.getElementById('breakdownOT').innerText.replace('₱','') : "0.00";
    const bIncentiveStr = document.getElementById('breakdownIncentives') ? document.getElementById('breakdownIncentives').innerText.replace('₱','') : "0.00";
    const bGrossStr = document.getElementById('breakdownGross') ? document.getElementById('breakdownGross').innerText.replace('₱','') : "0.00";
    const bTotalDedStr = document.getElementById('breakdownTotalDed') ? document.getElementById('breakdownTotalDed').innerText.replace('₱','') : "0.00";

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
                            <th style="padding:4px; text-align:right;">GROSS DATA RUN</th>
                            <th style="padding:4px; text-align:right;">DED.</th>
                            <th style="padding:4px; text-align:right;">NET</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dailyRowsHtml}
                        <tr style="border-top:2px solid #000; font-weight:bold; background:#eee;">
                            <td colspan="8" style="padding:4px;">TOTAL:</td>
                            <td style="padding:4px;">${m.aggLates}</td>
                            <td style="padding:4px;">${m.aggUndertime}</td>
                            <td style="padding:4px; text-align:right;">DAILY: ₱${formatCurrency(m.aggDailyGrossOnly)}<br><span style="color:#2563eb; font-size:7.5px;">OT: ₱${formatCurrency(m.aggOtGrossOnly)}</span></td>
                            <td style="padding:4px; text-align:right; color:#c00; vertical-align:middle;">₱${formatCurrency(m.aggDed)}</td>
                            <td style="padding:4px; text-align:right; color:#00f; vertical-align:middle;">₱${formatCurrency(m.aggNet)}</td>
                        </tr>
                    </tbody>
                </table>
                <table style="width:100%; font-size:9px; border-collapse:collapse;">
                    <thead><tr style="border-bottom:1px solid #000;"><th colspan="2" style="text-align:left; padding-bottom:4px;">SUMMARY</th></tr></thead>
                    <tbody>
                        <tr><td style="padding:2px 0;">Basic Baseline Run</td><td style="text-align:right;">₱${bBasicStr}</td></tr>
                        <tr style="background:#f1f5f9;"><td style="padding:2px 0; font-weight:bold;">OT Gross</td><td style="text-align:right; font-weight:bold;">₱${bOtStr}</td></tr>
                        <tr><td style="padding:2px 0;">Incentives</td><td style="text-align:right;">₱${bIncentiveStr}</td></tr>
                        <tr style="border-bottom:1px solid #000;"><td style="padding:2px 0;">Gross Run Total</td><td style="text-align:right;"><b>₱${bGrossStr}</b></td></tr>
                        <tr><td style="padding:2px 0;">SSS</td><td style="text-align:right;">₱${formatCurrency(m.sss)}</td></tr>
                        <tr><td style="padding:2px 0;">PhilHealth</td><td style="text-align:right;">₱${formatCurrency(m.phic)}</td></tr>
                        <tr><td style="padding:2px 0;">HDMF</td><td style="text-align:right;">₱${formatCurrency(m.hdmf)}</td></tr>
                        <tr><td style="padding:2px 0;">Late/UT Cut</td><td style="text-align:right;">₱${formatCurrency(m.totalDeductionPenalties)}</td></tr>
                        <tr style="border-bottom:1px solid #000;"><td style="padding:2px 0;">Cash Advances Pay</td><td style="text-align:right;">₱${formatCurrency(m.advances)}</td></tr>
                        <tr><td style="padding:4px 0;"><b>TOTAL DEDUCTION</b></td><td style="text-align:right; color:#c00;"><b>₱${bTotalDedStr}</b></td></tr>
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
    if(!verifyActionAllowedDateConstraints()){
        showToast("ACCESS DENIED: PRINT/PDF GENERATION PIPELINE RESTRICTED OUTSIDE CYCLE CLOSURE WINDOWS (DATES 13-16 OR 28-2).");
        return;
    }
    window.print();
}

function triggerCSVExportPipeline() {
    if(!verifyActionAllowedDateConstraints()){
        showToast("ACCESS DENIED: CSV EXPORT STREAM TERMINATED. SYSTEM RESTRICTED OUTSIDE ALLOTTED PAYROLL DATES (DATES 13-16 OR 28-2).");
        return;
    }
    const dailyRateValue = parseFloat(salarySettings.dailyRate) || 460;
    
    let csvRows = [];
    csvRows.push([`\"PAYSLIP ENGINE AUDIT REPORT EXPORT\"`]);
    csvRows.push([`\"NAME\"`,`\"${userProfile.customName || ""}\"`]);
    csvRows.push([`\"USERNAME\"`,`\"${(userProfile.name || "").toUpperCase()}\"`]);
    csvRows.push([`\"ID NO.\"`,`\"${(userProfile.email || "").toUpperCase()}\"`]);
    csvRows.push([`\"POSITION\"`,`\"${(salarySettings.position || 'Staff').toUpperCase()}\"`]);
    csvRows.push([`\"DEPARTMENT\"`,`\"${(salarySettings.department || 'Operations').toUpperCase()}\"`]);
    csvRows.push([`\"DAILY RATE\"`,`\"PHP ${formatCurrency(dailyRateValue)}\"`]);
    csvRows.push([`\"PERIOD RANGE\"`,`\"${document.getElementById('payableRangeDisplay') ? document.getElementById('payableRangeDisplay').value : ''}\"`]);
    csvRows.push([]);
    
    csvRows.push([
        `\"DATE\"`, `\"DAY\"`, `\"TIME IN 1\"`, `\"TIME OUT 1\"`, `\"TIME IN 2\"`, `\"TIME OUT 2\"`, `\"OT IN\"`, `\"OT OUT\"`, `\"LATES (MINS)\"`, `\"UNDERTIME (MINS)\"`, `\"DAILY GROSS\"`, `\"OT GROSS\"`, `\"DEDUCTION DAY CUT\"`, `\"DAILY NET\"`
    ]);
    
    const hourlyRate = dailyRateValue / 8;
    const minuteRate = hourlyRate / 60;
    const schedInMins = timeStringToMinutes(salarySettings.timeIn || "08:00");
    const schedOutMins = timeStringToMinutes(salarySettings.timeOut || "17:00");

    let sumLates = 0, sumUT = 0, sumDailyGross = 0, sumOtGross = 0, sumDed = 0, sumNet = 0;

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
            let dayDailyGross = dailyRateValue;
            let dayOtGross = 0;

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
                if (otMins > 0) dayOtGross = (otMins * minuteRate);
            }

            let dayNet = (dayDailyGross + dayOtGross) - dayDed;

            sumLates += lateMins;
            sumUT += utMins;
            sumDailyGross += dayDailyGross;
            sumOtGross += dayOtGross;
            sumDed += dayDed;
            sumNet += dayNet;

            csvRows.push([
                `\"${dateKey}\"`, `\"${dayOfWeekStr}\"`, `\"${rec.in1}\"`, `\"${rec.out1}\"`, `\"${rec.in2 || '-'}\"`, `\"${rec.out2 || '-'}\"`, `\"${rec.hasOT ? rec.inOT : '-'}\"`, `\"${rec.hasOT ? rec.outOT : '-'}\"`, lateMins, utMins, formatCurrency(dayDailyGross), formatCurrency(dayOtGross), formatCurrency(dayDed), formatCurrency(dayNet)
            ]);
        } else {
            csvRows.push([`\"${dateKey}\"`, `\"${dayOfWeekStr}\"`, `\"-\"`, `\"-\"`, `\"-\"`, `\"-\"`, `\"-\"`, `\"-\"`, 0, 0, `0.00`, `0.00`, `0.00`, `0.00`]);
        }
    });

    csvRows.push([
        `\"TOTALS\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, sumLates, sumUT, formatCurrency(sumDailyGross), formatCurrency(sumOtGross), formatCurrency(sumDed), formatCurrency(sumNet)
    ]);
    
    const bBasic = document.getElementById('breakdownBasic') ? document.getElementById('breakdownBasic').innerText.replace('₱','') : "0.00";
    const bOT = document.getElementById('breakdownOT') ? document.getElementById('breakdownOT').innerText.replace('₱','') : "0.00";
    const bGross = document.getElementById('breakdownGross') ? document.getElementById('breakdownGross').innerText.replace('₱','') : "0.00";
    const bSSS = document.getElementById('breakdownSSS') ? document.getElementById('breakdownSSS').innerText.replace('₱','') : "0.00";
    const bPHIC = document.getElementById('breakdownPHIC') ? document.getElementById('breakdownPHIC').innerText.replace('₱','') : "0.00";
    const bHDMF = document.getElementById('breakdownHDMF') ? document.getElementById('breakdownHDMF').innerText.replace('₱','') : "0.00";
    const bPenalties = document.getElementById('breakdownPenalties') ? document.getElementById('breakdownPenalties').innerText.replace('₱','') : "0.00";
    const bAdvances = document.getElementById('breakdownAdvances') ? document.getElementById('breakdownAdvances').innerText.replace('₱','') : "0.00";
    const bTotalDed = document.getElementById('breakdownTotalDed') ? document.getElementById('breakdownTotalDed').innerText.replace('₱','') : "0.00";
    const bNet = document.getElementById('breakdownNet') ? document.getElementById('breakdownNet').innerText.replace('₱','') : "0.00";

    csvRows.push([]);
    csvRows.push([`\"FINANCIAL STREAM ENTRIES SUMMARY\"`]);
    csvRows.push([`\"BASIC PAY RUN\"`, `\"${bBasic}\"`]);
    csvRows.push([`\"OVERTIME GROSS PAY\"`, `\"${bOT}\"`]);
    csvRows.push([`\"DOUBLE PAY INCENTIVE\"`, `\"${formatCurrency(parseFloat(document.getElementById('inputDoublePay') ? document.getElementById('inputDoublePay').value : 0))}\"`]);
    csvRows.push([`\"REIMBURSEMENTS ALLOWANCE\"`, `\"${formatCurrency(parseFloat(document.getElementById('inputReimbursements') ? document.getElementById('inputReimbursements').value : 0))}\"`]);
    csvRows.push([`\"TOTAL GROSS RUN\"`, `\"${bGross}\"`]);
    csvRows.push([]);
    csvRows.push([`\"DEDUCTION ACCOUNT ITEMS\"`]);
    csvRows.push([`\"SSS CONTRIBUTION\"`, `\"${bSSS}\"`]);
    csvRows.push([`\"PHIC MEDICAL PREMIUM\"`, `\"${bPHIC}\"`]);
    csvRows.push([`\"HDMF FUND CONTRIB\"`, `\"${bHDMF}\"`]);
    csvRows.push([`\"ATTENDANCE PENALTIES\"`, `\"${bPenalties}\"`]);
    csvRows.push([`\"CASH ADVANCES\"`, `\"${bAdvances}\"`]);
    csvRows.push([`\"TOTAL DEDUCTIONS\"`, `\"${bTotalDed}\"`]);
    csvRows.push([]);
    csvRows.push([`\"NET DISBURSABLE PAYOUT\"`, `\"${bNet}\"`]);

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

    // Unsaved Changes Page/Tab Exit Interceptor
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = 'YOU HAVE UNSAVED TIMELINE ENTRIES. ARE YOU SURE YOU WANT TO DISCARD AND EXIT?';
        }
    });

    if (document.getElementById('periodSelector')) {
        document.getElementById('periodSelector').addEventListener('change', fetchAndProcessSelectedPeriodPayload);
    }
    
    // Inputs linking directly to auto save tracking matrix
    const watchedInputs = ['inputDoublePay', 'inputReimbursements', 'inputSSS', 'inputPHIC', 'inputHDMF', 'inputAdvances'];
    watchedInputs.forEach(id => {
        const inputEl = document.getElementById(id);
        if (inputEl) {
            inputEl.addEventListener('input', () => {
                recomputeGlobalFinancials();
                markChangeAndQueueAutoSave();
            });
        }
    });

    if (document.getElementById('modalTimeIn1')) document.getElementById('modalTimeIn1').addEventListener('change', runRealtimeMetricsDeductionEngine);
    if (document.getElementById('modalTimeOut1')) {
        document.getElementById('modalTimeOut1').addEventListener('change', () => {
            evaluateLunchBreakConstraints();
            runRealtimeMetricsDeductionEngine();
        });
    }
    if (document.getElementById('modalTimeIn2')) document.getElementById('modalTimeIn2').addEventListener('change', runRealtimeMetricsDeductionEngine);
    if (document.getElementById('modalTimeOut2')) document.getElementById('modalTimeOut2').addEventListener('change', runRealtimeMetricsDeductionEngine);
    if (document.getElementById('chkEnableOTWrapper')) document.getElementById('chkEnableOTWrapper').addEventListener('click', toggleOvertimeSubSection);

    if (document.getElementById('btnSaveToCloud')) document.getElementById('btnSaveToCloud').addEventListener('click', () => commitTimelineTransactionToCloud(false));
    if (document.getElementById('btnPrintPreview')) document.getElementById('btnPrintPreview').addEventListener('click', triggerPrintPreviewPipeline);
    if (document.getElementById('btnExportCSV')) document.getElementById('btnExportCSV').addEventListener('click', triggerCSVExportPipeline);
    
    if (document.getElementById('btnModalClose')) document.getElementById('btnModalClose').addEventListener('click', closeTimeTransactionModal);
    if (document.getElementById('btnModalApply')) document.getElementById('btnModalApply').addEventListener('click', commitModalDayStateToLocalBuffer);
    if (document.getElementById('btnModalClear')) document.getElementById('btnModalClear').addEventListener('click', clearModalDayState);
});
