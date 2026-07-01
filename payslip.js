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
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function markChangeAndQueueAutoSave() {
    hasUnsavedChanges = true;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
        await commitTimelineTransactionToCloud(true);
    }, 1000);
}

// ==========================================================================
// 3. CORE INITIALIZATION ROUTINE ENGINE & OVERRIDE LIFECYCLE
// ==========================================================================
let historicalOverrideActive = false;
let historicalClickCounter = 0;
let historicalAutoLockTimer = null;

function showSystemToastNotification(message, duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:10px;";
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = "background:#333; color:#fff; padding:12px 24px; border-radius:4px; font-family:sans-serif; font-size:13px; box-shadow:0 4px 12px rgba(0,0,0,0.15); opacity:0; transition:opacity 0.3s ease; border-left:4px solid var(--primary, #2563eb);";
    toast.innerText = message;
    container.appendChild(toast);
    
    setTimeout(() => toast.style.opacity = "1", 50);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

async function bootEngineCore() {
    showGlobalEngineLoader();
    injectExitGuardModal();
    setupNetPayOverrideListener(); 
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
            newMetaRow.innerHTML = `<span class="lbl">DAILY RATE</span><span class="val" id="profDailyRateDisplay">${formattedRate}</span>`;
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
        selector.value = `2026-07-15`;
    }
}

async function fetchAndProcessSelectedPeriodPayload() {
    if(hasUnsavedChanges) {
        document.getElementById('exitGuardModalOverlay').style.display = 'flex';
        return;
    }
    
    resetHistoricalOverrideState();
    showGlobalEngineLoader();
    
    const selectedPeriodKey = document.getElementById('periodSelector').value; 
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
    document.getElementById('payableRangeDisplay').value = `${startStr} - ${endStr}`;

    document.getElementById('inputSSS').value = "";
    document.getElementById('inputPHIC').value = "";
    document.getElementById('inputHDMF').value = "";
    document.getElementById('inputAdvances').value = "";
    document.getElementById('inputDoublePay').value = "";
    document.getElementById('inputReimbursements').value = "";

    try {
        const transSnap = await getDoc(doc(db, "salary_transactions", `${userId}_${selectedPeriodKey}`));
        if (transSnap.exists()) {
            const loadedData = transSnap.data();
            if (loadedData.timelineBuffer) timelineBuffer = loadedData.timelineBuffer;
            document.getElementById('inputSSS').value = loadedData.inputSSS || "";
            document.getElementById('inputPHIC').value = loadedData.inputPHIC || "";
            document.getElementById('inputHDMF').value = loadedData.inputHDMF || "";
            document.getElementById('inputAdvances').value = loadedData.inputAdvances || "";
            document.getElementById('inputDoublePay').value = loadedData.inputDoublePay || "";
            document.getElementById('inputReimbursements').value = loadedData.inputReimbursements || "";
        }
    } catch(e) {
        console.error("Payload data recovery error: ", e);
    }

    evaluateDynamicLockAndBlurConstraints();
    renderActivePeriodCalendarGrid();
    recomputeGlobalFinancials();
    hasUnsavedChanges = false;
    hideGlobalEngineLoader();
}

function evaluateDynamicLockAndBlurConstraints() {
    const today = new Date();
    const currentDay = today.getDate();

    const selector = document.getElementById('periodSelector');
    if (!selector) return;

    const selectedPeriodKey = selector.value; 
    const pieces = selectedPeriodKey.split('-');
    const year = parseInt(pieces[0]);
    const monthIdx = parseInt(pieces[1]) - 1;
    const targetDay = parseInt(pieces[2]);
    
    const periodDate = new Date(year, monthIdx, targetDay);
    
    today.setHours(0,0,0,0);
    periodDate.setHours(0,0,0,0);

    const isPastPayrollPeriod = periodDate.getTime() < today.getTime();
    let revealNetPay = false;

    if (isPastPayrollPeriod) {
        revealNetPay = true;
    } else {
        if (targetDay === 15) {
            if (currentDay >= 13 && currentDay <= 16) revealNetPay = true;
        } else {
            if (currentDay >= 28 || currentDay === 1) revealNetPay = true;
        }
    }
    
    const wrapper = document.getElementById('netPayWrapperDeck');
    const badge = document.getElementById('lockBadgeDisplay');
    const trackingTable = document.getElementById('uiDailyBreakdownTable');
    
    if (!revealNetPay) {
        if (wrapper) {
            wrapper.classList.add('blurred-lock');
            wrapper.setAttribute('data-blurred', 'true');
        }
        if (badge) badge.style.display = "inline-block";
        if (trackingTable) {
            trackingTable.classList.add('blurred-lock');
            trackingTable.setAttribute('data-blurred', 'true');
        }
    } else {
        if (wrapper) {
            wrapper.classList.remove('blurred-lock');
            wrapper.removeAttribute('data-blurred');
        }
        if (badge) badge.style.display = "none";
        if (trackingTable) {
            trackingTable.classList.remove('blurred-lock');
            trackingTable.removeAttribute('data-blurred');
        }
    }

    const targetElementsToSecure = [
        'inputSSS', 'inputPHIC', 'inputHDMF', 'inputAdvances', 
        'inputDoublePay', 'inputReimbursements', 'btnSaveToCloud'
    ];

    targetElementsToSecure.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (isPastPayrollPeriod && !historicalOverrideActive) {
                el.setAttribute('disabled', 'true');
                el.style.cursor = "not-allowed";
                el.style.opacity = "0.6";
            } else {
                el.removeAttribute('disabled');
                el.style.cursor = "";
                el.style.opacity = "";
            }
        }
    });
}

function verifyActionAllowedDateConstraints() {
    if (historicalOverrideActive) {
        renewHistoricalInactivityTimer();
        return true;
    }

    const today = new Date();
    const selector = document.getElementById('periodSelector');
    if (!selector) return true;

    const selectedPeriodKey = selector.value;
    const pieces = selectedPeriodKey.split('-');
    const periodDate = new Date(parseInt(pieces[0]), parseInt(pieces[1]) - 1, parseInt(pieces[2]));
    
    today.setHours(0,0,0,0);
    periodDate.setHours(0,0,0,0);

    if (periodDate.getTime() < today.getTime()) {
        return false;
    }

    return true;
}

function setupNetPayOverrideListener() {
    const wrapper = document.getElementById('netPayWrapperDeck');
    if (!wrapper) return;

    wrapper.removeAttribute('onclick'); 
    wrapper.addEventListener('click', () => {
        const today = new Date();
        const selector = document.getElementById('periodSelector');
        if (!selector) return;

        const selectedPeriodKey = selector.value;
        const pieces = selectedPeriodKey.split('-');
        const periodDate = new Date(parseInt(pieces[0]), parseInt(pieces[1]) - 1, parseInt(pieces[2]));
        
        today.setHours(0,0,0,0);
        periodDate.setHours(0,0,0,0);

        if (periodDate.getTime() < today.getTime()) {
            historicalClickCounter++;
            if (historicalClickCounter >= 10 && !historicalOverrideActive) {
                historicalOverrideActive = true;
                showSystemToastNotification("🔒 ADMIN OVERRIDE: Historical data fields & daily logs unlocked for 2 minutes.");
                evaluateDynamicLockAndBlurConstraints();
                renderActivePeriodCalendarGrid(); 
                renewHistoricalInactivityTimer();
                setupInactivitySignalTracers();
            }
        }
    });
}

function renewHistoricalInactivityTimer() {
    if (!historicalOverrideActive) return;
    clearTimeout(historicalAutoLockTimer);
    historicalAutoLockTimer = setTimeout(() => {
        showSystemToastNotification("⏳ Session expired. Historical matrix logs and tracking charts re-locked.");
        resetHistoricalOverrideState();
    }, 120000); 
}

function resetHistoricalOverrideState() {
    historicalOverrideActive = false;
    historicalClickCounter = 0;
    clearTimeout(historicalAutoLockTimer);
    teardownInactivitySignalTracers();
    evaluateDynamicLockAndBlurConstraints();
    if (typeof renderActivePeriodCalendarGrid === "function" && document.getElementById('calendarDaysGridDeck')) {
        renderActivePeriodCalendarGrid(); 
    }
}

// Fixed function declaration naming error
function setupInactivitySignalTracers() {
    const targets = ['inputSSS', 'inputPHIC', 'inputHDMF', 'inputAdvances', 'inputDoublePay', 'inputReimbursements'];
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', renewHistoricalInactivityTimer);
        }
    });
}

function teardownInactivitySignalTracers() {
    const targets = ['inputSSS', 'inputPHIC', 'inputHDMF', 'inputAdvances', 'inputDoublePay', 'inputReimbursements'];
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.removeEventListener('input', renewHistoricalInactivityTimer);
        }
    });
}

window.addEventListener('beforeunload', resetHistoricalOverrideState);

// ==========================================================================
// 4. MATRIX UI CALENDAR RENDER ENGINE
// ==========================================================================
function renderActivePeriodCalendarGrid() {
    const grid = document.getElementById('calendarNodeGrid');
    if (!grid) return;
    grid.innerHTML = "";

    const today = new Date();
    today.setHours(0,0,0,0);

    const selector = document.getElementById('periodSelector');
    let isCurrentPeriodPast = false;
    if (selector) {
        const selectedPeriodKey = selector.value;
        const pieces = selectedPeriodKey.split('-');
        const periodDate = new Date(parseInt(pieces[0]), parseInt(pieces[1]) - 1, parseInt(pieces[2]));
        periodDate.setHours(0,0,0,0);
        if (periodDate.getTime() < today.getTime()) {
            isCurrentPeriodPast = true;
        }
    }

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
        } else if (isCurrentPeriodPast) {
            if (!historicalOverrideActive) {
                isLockedPastDate = true;
            }
        } else if (year < today.getFullYear()) {
            isLockedPastDate = true;
        } else if (year === today.getFullYear() && dateObj.getMonth() < today.getMonth()) {
            if (!(dateObj.getMonth() === today.getMonth() - 1 && dateObj.getDate() >= 29)) {
                isLockedPastDate = true;
            }
        }

        if (historicalOverrideActive && isLockedPastDate) {
            isLockedPastDate = false;
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
            const lbl = cell.querySelector('.day-lbl');
            if (lbl) lbl.style.color = "rgba(0,0,0,0.6)";
        }

        cell.onclick = () => {
            if (isFutureDate) {
                showSystemToastNotification("UNABLE TO LOG ATTENDANCE: THIS FUTURE CHRONOLOGICAL DATE HAS NOT TRANSPIRED YET.");
                return;
            }
            if (isLockedPastDate) {
                showSystemToastNotification("THIS HISTORICAL RECORD CYCLE IS LOCKED AND UNFILLABLE.");
                return;
            }
            
            if (historicalOverrideActive) {
                if (typeof renewHistoricalInactivityTimer === "function") renewHistoricalInactivityTimer();
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
    document.getElementById('modalTargetDateHeader').innerText = `LOGS FOR ${dateKey}`;
    
    document.getElementById('modalTimeIn1').value = "";
    document.getElementById('modalTimeOut1').value = "";
    document.getElementById('modalTimeIn2').value = "";
    document.getElementById('modalTimeOut2').value = "";
    document.getElementById('modalTimeInOT').value = "";
    document.getElementById('modalTimeOutOT').value = "";
    
    // Safety matching with optional chains in case HTML uses slightly alternative naming
    const otCheck = document.getElementById('chkEnableOT') || document.getElementById('chkEnableOTWrapper');
    if (otCheck) otCheck.checked = false;
    
    const otDeck = document.getElementById('otSubSectionDeck');
    if (otDeck) otDeck.style.display = "none";

    if (timelineBuffer[dateKey]) {
        const rec = timelineBuffer[dateKey];
        document.getElementById('modalTimeIn1').value = rec.in1 || "";
        document.getElementById('modalTimeOut1').value = rec.out1 || "";
        document.getElementById('modalTimeIn2').value = rec.in2 || "";
        document.getElementById('modalTimeOut2').value = rec.out2 || "";
        if (rec.hasOT) {
            if (otCheck) otCheck.checked = true;
            if (otDeck) otDeck.style.display = "block";
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

    const modalBox = document.getElementById('modalBoxContainer');
    if (modalBox) {
        const inputs = modalBox.querySelectorAll('input, select');
        if (isPastDate) {
            inputs.forEach(el => el.setAttribute('disabled', 'true'));
            document.getElementById('modalActionFooterDeck').style.display = "none";
            document.getElementById('modalLockedWarningLabel').style.display = "block";
        } else {
            inputs.forEach(el => el.removeAttribute('disabled'));
            document.getElementById('modalActionFooterDeck').style.display = "grid";
            document.getElementById('modalLockedWarningLabel').style.display = "none";
        }
    }

    runRealtimeMetricsDeductionEngine();
    document.getElementById('timeConfigModalOverlay').classList.add('active');
}

function evaluateLunchBreakConstraints() {
    const out1 = document.getElementById('modalTimeOut1').value;
    if (out1) {
        const out1Mins = timeStringToMinutes(out1);
        if (out1Mins < timeStringToMinutes("12:59")) {
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
    const otCheck = document.getElementById('chkEnableOT') || document.getElementById('chkEnableOTWrapper');
    if(!otCheck || otCheck.disabled) return;
    document.getElementById('otSubSectionDeck').style.display = otCheck.checked ? "block" : "none";
}

function commitModalDayStateToLocalBuffer() {
    const in1 = document.getElementById('modalTimeIn1').value;
    const out1 = document.getElementById('modalTimeOut1').value;
    if (!in1 || !out1) {
        showToast("CORE TIMELINE IN & OUT VALUES REQUIRED.");
        return;
    }
    const otCheck = document.getElementById('chkEnableOT') || document.getElementById('chkEnableOTWrapper');
    const hasOT = otCheck ? otCheck.checked : false;

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
    
    const schedInStr = salarySettings.timeIn || "08:00";
    const schedOutStr = salarySettings.timeOut || "17:00";
    const schedInMins = timeStringToMinutes(schedInStr);
    const schedOutMins = timeStringToMinutes(schedOutStr);

    let uiTableRowsHtml = "";

    activeDatesArray.forEach(dateObj => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dayOfWeekStr = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

        let dayDailyGross = 0;
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
            dayDailyGross = dailyRate;

            const rec = timelineBuffer[dateKey];
            tIn1 = rec.in1 || "-";
            tOut1 = rec.out1 || "-";
            tIn2 = rec.in2 || "-";
            tOut2 = rec.out2 || "-";

            // Late calculations
            if (rec.in1) {
                const actualInMins = timeStringToMinutes(rec.in1);
                if (actualInMins > schedInMins) {
                    dayLateMins = (actualInMins - schedInMins);
                }
            }

            // Undertime calculations
            const finalOutStr = rec.out2 ? rec.out2 : rec.out1;
            if (finalOutStr) {
                const actualOutMins = timeStringToMinutes(finalOutStr);
                if (actualOutMins < schedOutMins) {
                    dayUndertimeMins = (schedOutMins - actualOutMins);
                    if (salarySettings.hasLunchBreak !== false) {
                        const lunchStart = timeStringToMinutes("12:00");
                        const lunchEnd = timeStringToMinutes("13:00");
                        if (actualOutMins <= lunchStart) {
                            dayUndertimeMins -= 60;
                        } else if (actualOutMins > lunchStart && actualOutMins < lunchEnd) {
                            dayUndertimeMins -= (lunchEnd - actualOutMins);
                        }
                    }
                }
            }

            // Overtime calculations
            if (rec.hasOT && rec.inOT && rec.outOT) {
                otIn = rec.inOT;
                otOut = rec.outOT;
                const otInM = timeStringToMinutes(rec.inOT);
                const otOutM = timeStringToMinutes(rec.outOT);
                if (otOutM > otInM) {
                    const otHours = (otOutM - otInM) / 60;
                    dayOtGross = otHours * hourlyRate * 1.25; 
                }
            }

            dayDed = (dayLateMins + dayUndertimeMins) * minuteRate;
            
            aggLates += dayLateMins;
            aggUndertime += dayUndertimeMins;
            totalOvertimePay += dayOtGross;
            totalDeductionPenalties += dayDed;
        }

        const dayNet = dayDailyGross + dayOtGross - dayDed;

        uiTableRowsHtml += `
            <tr>
                <td style="font-weight:bold; color:var(--primary);">${day} <span style="font-size:9px; color:#64748b;">${dayOfWeekStr}</span></td>
                <td><span class="time-block">${tIn1}</span></td>
                <td><span class="time-block">${tOut1}</span></td>
                <td><span class="time-block">${tIn2}</span></td>
                <td><span class="time-block">${tOut2}</span></td>
                <td><span class="time-block">${otIn}</span></td>
                <td><span class="time-block">${otOut}</span></td>
                <td style="color:#ef4444;">-${formatCurrency(dayDed)}</td>
                <td style="font-weight:bold; color:#f1f5f9;">₱${formatCurrency(dayNet)}</td>
            </tr>
        `;
    });

    const breakdownBody = document.getElementById('breakdownTableBody');
    if (breakdownBody) breakdownBody.innerHTML = uiTableRowsHtml;

    // Fixed stat summaries inputs
    const inputSSS = parseFloat(document.getElementById('inputSSS').value) || 0;
    const inputPHIC = parseFloat(document.getElementById('inputPHIC').value) || 0;
    const inputHDMF = parseFloat(document.getElementById('inputHDMF').value) || 0;
    const inputAdvances = parseFloat(document.getElementById('inputAdvances').value) || 0;
    const inputDoublePay = parseFloat(document.getElementById('inputDoublePay').value) || 0;
    const inputReimbursements = parseFloat(document.getElementById('inputReimbursements').value) || 0;

    const totalStatutoryDeductions = inputSSS + inputPHIC + inputHDMF + inputAdvances;
    const grandDeductions = totalDeductionPenalties + totalStatutoryDeductions;
    const grossSalary = totalBasicEarnings + totalOvertimePay + inputDoublePay + inputReimbursements;
    const netPay = grossSalary - grandDeductions;

    document.getElementById('lblDaysWorked').innerText = `${actualDaysWorkedCounter} DAYS`;
    document.getElementById('lblTotalLateMins').innerText = `${aggLates} MINS`;
    document.getElementById('lblTotalUndertimeMins').innerText = `${aggUndertime} MINS`;

    document.getElementById('lblBasicSalaryEarnings').innerText = `₱${formatCurrency(totalBasicEarnings)}`;
    document.getElementById('lblOvertimePayEarnings').innerText = `₱${formatCurrency(totalOvertimePay)}`;
    document.getElementById('lblDeductionPenalties').innerText = `₱${formatCurrency(totalDeductionPenalties)}`;
    document.getElementById('lblNetPayDisplay').innerText = `₱${formatCurrency(netPay)}`;
}

async function commitTimelineTransactionToCloud(isAutoSave = false) {
    if (!verifyActionAllowedDateConstraints()) return;
    const selectedPeriodKey = document.getElementById('periodSelector').value;

    const payload = {
        timelineBuffer: timelineBuffer,
        inputSSS: document.getElementById('inputSSS').value,
        inputPHIC: document.getElementById('inputPHIC').value,
        inputHDMF: document.getElementById('inputHDMF').value,
        inputAdvances: document.getElementById('inputAdvances').value,
        inputDoublePay: document.getElementById('inputDoublePay').value,
        inputReimbursements: document.getElementById('inputReimbursements').value,
        lastUpdated: new Date().toISOString()
    };

    try {
        await setDoc(doc(db, "salary_transactions", `${userId}_${selectedPeriodKey}`), payload, { merge: true });
        hasUnsavedChanges = false;
        if (!isAutoSave) {
            showToast("PAYROLL RECORD MATRIX SYNCHRONIZED SUCCESSFUL.");
        }
    } catch (err) {
        console.error("Cloud vault synchronization fault: ", err);
        showToast("VAULT TRANSYNC REJECTED.");
    }
}

function triggerPrintPreviewPipeline() {
    window.print();
}

function triggerCSVExportPipeline() {
    let csv = "Day,Time In 1,Time Out 1,Time In 2,Time Out 2,OT In,OT Out\n";
    activeDatesArray.forEach(dateObj => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        if (timelineBuffer[dateKey]) {
            const r = timelineBuffer[dateKey];
            csv += `${day},${r.in1||''},${r.out1||''},${r.in2||''},${r.out2||''},${r.inOT||''},${r.outOT||''}\n`;
        } else {
            csv += `${day},,,,,,\n`;
        }
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `Payroll_Report_${document.getElementById('periodSelector').value}.csv`);
    a.click();
}

// ==========================================================================
// 7. GLOBAL CONTEXT EVENT BINDING ARRAYS
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    // Run Main Core Initializer
    bootEngineCore();

    const watchedInputs = ['inputSSS', 'inputPHIC', 'inputHDMF', 'inputAdvances', 'inputDoublePay', 'inputReimbursements'];
    watchedInputs.forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            recomputeGlobalFinancials();
            markChangeAndQueueAutoSave();
        });
    });

    document.getElementById('periodSelector')?.addEventListener('change', fetchAndProcessSelectedPeriodPayload);

    document.getElementById('modalTimeIn1')?.addEventListener('change', runRealtimeMetricsDeductionEngine);
    document.getElementById('modalTimeOut1')?.addEventListener('change', () => {
        evaluateLunchBreakConstraints();
        runRealtimeMetricsDeductionEngine();
    });
    document.getElementById('modalTimeIn2')?.addEventListener('change', runRealtimeMetricsDeductionEngine);
    document.getElementById('modalTimeOut2')?.addEventListener('change', runRealtimeMetricsDeductionEngine);
    
    // Fallback selectors check for alternative naming variations in the HTML markup
    const otTrigger = document.getElementById('chkEnableOTWrapper') || document.getElementById('chkEnableOT');
    otTrigger?.addEventListener('click', toggleOvertimeSubSection);
    otTrigger?.addEventListener('change', toggleOvertimeSubSection);

    document.getElementById('btnSaveToCloud')?.addEventListener('click', () => commitTimelineTransactionToCloud(false));
    document.getElementById('btnPrintPreview')?.addEventListener('click', triggerPrintPreviewPipeline);
    document.getElementById('btnExportCSV')?.addEventListener('click', triggerCSVExportPipeline);
    
    document.getElementById('btnModalClose')?.addEventListener('click', closeTimeTransactionModal);
    document.getElementById('btnModalApply')?.addEventListener('click', commitModalDayStateToLocalBuffer);
    document.getElementById('btnModalClear')?.addEventListener('click', clearModalDayState);
});
