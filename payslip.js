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

// Clean, global-safe UI toast notification engine
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
        // Safe document resolution checking global db and userId properties
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
        // Historical logs display amounts natively
        revealNetPay = true;
    } else {
        // Upcoming Period constraint windows
        if (targetDay === 15) {
            if (currentDay >= 13 && currentDay <= 16) revealNetPay = true;
        } else {
            if (currentDay >= 28 || currentDay === 1) revealNetPay = true;
        }
    }
    
    const wrapper = document.getElementById('netPayWrapperDeck');
    const badge = document.getElementById('lockBadgeDisplay');
    const trackingTable = document.getElementById('uiDailyBreakdownTable');
    
    // Manage blurring across widgets and the daily metric breakdown table element
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
            // If the overall period chosen is historical, lock down days implicitly 
            // unless overridden by the 10-click administrative session bypass
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

        // Final security check: If admin bypass is warm and running, open up all historical dates
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
            
            // If historical unlock is currently running, feed inactivity tracker on cell engagement
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
    if(document.getElementById('chkEnableOT').disabled) return;
    const checked = document.getElementById('chkEnableOT').checked;
    document.getElementById('otSubSectionDeck').style.display = checked ? "block" : "none";
}

function commitModalDayStateToLocalBuffer() {
    const in1 = document.getElementById('modalTimeIn1').value;
    const out1 = document.getElementById('modalTimeOut1').value;

    if (!in1 || !out1) {
        showToast("CORE TIMELINE IN & OUT VALUES REQUIRED.");
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
    let aggDailyGross = 0;
    let aggOtGross = 0;
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
                    } else if (actOutMins > lunchStartMins && actOutMins < lunchEndMins) {
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
            
        let dayNet = (dayDailyGross + dayOtGross) - dayDed;

        aggLates += dayLateMins;
        aggUndertime += dayUndertimeMins;
        aggDailyGross += dayDailyGross;
        aggOtGross += dayOtGross;
        aggDed += dayDed;
        aggNet += dayNet;

        // UI view layout retained exactly but separated horizontally into distinct Daily Gross & OT Gross columns
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
                <td style="text-align: right; color: ${dayDailyGross > 0 ? '#fff' : '#64748b'};">₱${formatCurrency(dayDailyGross)}</td>
                <td style="text-align: right; color: ${dayOtGross > 0 ? '#38bdf8' : '#64748b'};">₱${formatCurrency(dayOtGross)}</td>
                <td style="text-align: right; color: ${dayDed > 0 ? '#ef4444' : '#64748b'};">₱${formatCurrency(dayDed)}</td>
                <td style="text-align: right; color: #38bdf8; font-weight: bold;">₱${formatCurrency(dayNet)}</td>
            </tr>
        `;

        structuralDailyArrayLogs.push({
            date: dateKey, dayStr: dayOfWeekStr.toUpperCase(),
            in1: tIn1, out1: tOut1, in2: tIn2, out2: tOut2, inOT: otIn, outOT: otOut,
            lates: dayLateMins, undertime: dayUndertimeMins,
            dailyGross: dayDailyGross, otGross: dayOtGross, deductions: dayDed, net: dayNet
        });
    });

    const breakdownBody = document.getElementById('uiDailyBreakdownBody');
    if (breakdownBody) breakdownBody.innerHTML = uiTableRowsHtml;

    document.getElementById('totalLates').innerText = aggLates;
    document.getElementById('totalUndertime').innerText = aggUndertime; // Fixed the '!' typo
    
    // Added a safety check so it won't crash if totalGross doesn't exist in the HTML
    const totalGrossEl = document.getElementById('totalGross');
    if (totalGrossEl) {
        totalGrossEl.innerText = `₱${formatCurrency(aggDailyGross + aggOtGross)}`;
    }
    
    document.getElementById('totalDed').innerText = `₱${formatCurrency(aggDed)}`;
    document.getElementById('totalDailyNet').innerText = `₱${formatCurrency(aggNet)}`;

    // Handle column totals injections safely if separate DOM labels exist
    const uiTotalDailyGrossField = document.getElementById('totalDailyGrossOnly');
    if (uiTotalDailyGrossField) uiTotalDailyGrossField.innerText = `₱${formatCurrency(aggDailyGross)}`;
    const uiTotalOtGrossField = document.getElementById('totalOtGrossOnly');
    if (uiTotalOtGrossField) uiTotalOtGrossField.innerText = `₱${formatCurrency(aggOtGross)}`;

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
        actualDaysWorkedCounter, structuralDailyArrayLogs, aggLates, aggUndertime, aggDailyGross, aggOtGross, aggDed, aggNet
    });
}

async function commitTimelineTransactionToCloud(isAutoSave = false) {
    const selectedPeriodKey = document.getElementById('periodSelector').value; 
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
// 7. COMPACT MATRIX RENDERING (FOR PRINTING/PDF)
// ==========================================================================
function generateCommercialReceiptLayout(m) {
    const printContainer = document.getElementById('print-render-matrix');
    if (!printContainer) return;
    const dateRangeLabel = document.getElementById('payableRangeDisplay').value;
    const timestampStr = new Date().toLocaleString('en-US', { hour12: true });
    const currentDailyRate = parseFloat(salarySettings.dailyRate) || 460;

    // Check if values should be masked based on the active UI state attribute
    const wrapper = document.getElementById('netPayWrapperDeck');
    const isBlurred = wrapper && wrapper.getAttribute('data-blurred') === 'true';

    let dailyRowsHtml = "";
    m.structuralDailyArrayLogs.forEach(row => {
        const displayDailyGross = isBlurred ? "HIDDEN" : `₱${formatCurrency(row.dailyGross)}`;
        const displayOtGross = isBlurred ? "HIDDEN" : `₱${formatCurrency(row.otGross)}`;
        const displayDeductions = isBlurred ? "HIDDEN" : `₱${formatCurrency(row.deductions)}`;
        const displayNet = isBlurred ? "HIDDEN" : `₱${formatCurrency(row.net)}`;

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
                <td style="padding: 4px; text-align: right;">${displayDailyGross}</td>
                <td style="padding: 4px; text-align: right; color:#2563eb;">${displayOtGross}</td>
                <td style="padding: 4px; text-align: right; color:#c00;">${displayDeductions}</td>
                <td style="padding: 4px; text-align: right; color:#00f; font-weight: bold;">${displayNet}</td>
            </tr>
        `;
    });

    const displayAggDailyGross = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.aggDailyGross)}`;
    const displayAggOtGross = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.aggOtGross)}`;
    const displayAggDed = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.aggDed)}`;
    const displayAggNet = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.aggNet)}`;

    const displayTotalBasic = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.totalBasicEarnings)}`;
    const displayTotalOTPay = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.totalOvertimePay)}`;
    const displayTotalIncentives = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.totalIncentives)}`;
    const displayGrossPay = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.grossPay)}`;
    const displaySSS = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.sss)}`;
    const displayPHIC = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.phic)}`;
    const displayHDMF = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.hdmf)}`;
    const displayPenalties = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.totalDeductionPenalties)}`;
    const displayAdvances = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.advances)}`;
    const displayTotalDeductions = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.totalDeductions)}`;
    const displayNetPay = isBlurred ? "HIDDEN" : `₱${formatCurrency(m.netPay)}`;

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
                            <th style="padding:4px; text-align:right;">DAILY GROSS</th>
                            <th style="padding:4px; text-align:right;">OT GROSS</th>
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
                            <td style="padding:4px; text-align:right;">${displayAggDailyGross}</td>
                            <td style="padding:4px; text-align:right; color:#2563eb;">${displayAggOtGross}</td>
                            <td style="padding:4px; text-align:right; color:#c00;">${displayAggDed}</td>
                            <td style="padding:4px; text-align:right; color:#00f;">${displayAggNet}</td>
                        </tr>
                    </tbody>
                </table>
                <table style="width:100%; font-size:9px; border-collapse:collapse;">
                    <thead><tr style="border-bottom:1px solid #000;"><th colspan="2" style="text-align:left; padding-bottom:4px;">SUMMARY</th></tr></thead>
                    <tbody>
                        <tr><td style="padding:2px 0;">Basic</td><td style="text-align:right;">${displayTotalBasic}</td></tr>
                        <tr style="background:#f1f5f9;"><td style="padding:2px 0; font-weight:bold;">OT Gross</td><td style="text-align:right; font-weight:bold;">${displayTotalOTPay}</td></tr>
                        <tr><td style="padding:2px 0;">Incentives</td><td style="text-align:right;">${displayTotalIncentives}</td></tr>
                        <tr style="border-bottom:1px solid #000;"><td style="padding:2px 0;">Gross Run</td><td style="text-align:right;"><b>${displayGrossPay}</b></td></tr>
                        <tr><td style="padding:2px 0;">SSS</td><td style="text-align:right;">${displaySSS}</td></tr>
                        <tr><td style="padding:2px 0;">PhilHealth</td><td style="text-align:right;">${displayPHIC}</td></tr>
                        <tr><td style="padding:2px 0;">HDMF</td><td style="text-align:right;">${displayHDMF}</td></tr>
                        <tr><td style="padding:2px 0;">Late/UT Cut</td><td style="text-align:right;">${displayPenalties}</td></tr>
                        <tr style="border-bottom:1px solid #000;"><td style="padding:2px 0;">Cash Advances Pay</td><td style="text-align:right;">${displayAdvances}</td></tr>
                        <tr><td style="padding:4px 0;"><b>TOTAL DEDUCTION</b></td><td style="text-align:right; color:#c00;"><b>${displayTotalDeductions}</b></td></tr>
                    </tbody>
                </table>
            </div>
            <div style="margin-top:15px; border:2px solid #000; padding:10px; text-align:center; background:#eee;">
                <span style="font-weight:900; font-size:14px;">NET PAY: ${displayNetPay}</span>
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
    // Restrictions completely removed: Print capability is enabled at all times
    window.print();
}

function triggerCSVExportPipeline() {
    // Restrictions completely removed: CSV capability is enabled at all times
    const dailyRateValue = parseFloat(salarySettings.dailyRate) || 460;
    
    const wrapper = document.getElementById('netPayWrapperDeck');
    const isBlurred = wrapper && wrapper.getAttribute('data-blurred') === 'true';

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

            const csvDailyGrossValue = isBlurred ? "HIDDEN" : formatCurrency(dayDailyGross);
            const csvOtGrossValue = isBlurred ? "HIDDEN" : formatCurrency(dayOtGross);
            const csvDedValue = isBlurred ? "HIDDEN" : formatCurrency(dayDed);
            const csvNetValue = isBlurred ? "HIDDEN" : formatCurrency(dayNet);

            csvRows.push([
                `\"${dateKey}\"`, `\"${dayOfWeekStr}\"`, `\"${rec.in1}\"`, `\"${rec.out1}\"`, `\"${rec.in2 || '-'}\"`, `\"${rec.out2 || '-'}\"`, `\"${rec.hasOT ? rec.inOT : '-'}\"`, `\"${rec.hasOT ? rec.outOT : '-'}\"`, lateMins, utMins, csvDailyGrossValue, csvOtGrossValue, csvDedValue, csvNetValue
            ]);
        } else {
            csvRows.push([`\"${dateKey}\"`, `\"${dayOfWeekStr}\"`, `\"-\"`, `\"-\"`, `\"-\"`, `\"-\"`, `\"-\"`, `\"-\"`, 0, 0, `0.00`, `0.00`, `0.00`, `0.00`]);
        }
    });

    const csvTotalDailyGross = isBlurred ? "HIDDEN" : formatCurrency(sumDailyGross);
    const csvTotalOtGross = isBlurred ? "HIDDEN" : formatCurrency(sumOtGross);
    const csvTotalDed = isBlurred ? "HIDDEN" : formatCurrency(sumDed);
    const csvTotalNet = isBlurred ? "HIDDEN" : formatCurrency(sumNet);

    csvRows.push([
        `\"TOTALS\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, `\"\"`, sumLates, sumUT, csvTotalDailyGross, csvTotalOtGross, csvTotalDed, csvTotalNet
    ]);
    
    csvRows.push([]);
    csvRows.push([`\"FINANCIAL STREAM ENTRIES SUMMARY\"`]);
    csvRows.push([`\"BASIC PAY RUN\"`, `\"${isBlurred ? "HIDDEN" : document.getElementById('breakdownBasic').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"OVERTIME GROSS PAY\"`, `\"${isBlurred ? "HIDDEN" : document.getElementById('breakdownOT').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"DOUBLE PAY INCENTIVE\"`, `\"${isBlurred ? "HIDDEN" : formatCurrency(parseFloat(document.getElementById('inputDoublePay').value || 0))}\"`]);
    csvRows.push([`\"REIMBURSEMENTS ALLOWANCE\"`, `\"${isBlurred ? "HIDDEN" : formatCurrency(parseFloat(document.getElementById('inputReimbursements').value || 0))}\"`]);
    csvRows.push([`\"TOTAL GROSS RUN\"`, `\"${isBlurred ? "HIDDEN" : document.getElementById('breakdownGross').innerText.replace('₱','')}\"`]);
    csvRows.push([]);
    csvRows.push([`\"DEDUCTION ACCOUNT ITEMS\"`]);
    csvRows.push([`\"SSS CONTRIBUTION\"`, `\"${isBlurred ? "HIDDEN" : document.getElementById('breakdownSSS').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"PHIC MEDICAL PREMIUM\"`, `\"${isBlurred ? "HIDDEN" : document.getElementById('breakdownPHIC').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"HDMF FUND CONTRIB\"`, `\"${isBlurred ? "HIDDEN" : document.getElementById('breakdownHDMF').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"ATTENDANCE PENALTIES\"`, `\"${isBlurred ? "HIDDEN" : document.getElementById('breakdownPenalties').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"CASH ADVANCES\"`, `\"${isBlurred ? "HIDDEN" : document.getElementById('breakdownAdvances').innerText.replace('₱','')}\"`]);
    csvRows.push([`\"TOTAL DEDUCTIONS\"`, `\"${isBlurred ? "HIDDEN" : document.getElementById('breakdownTotalDed').innerText.replace('₱','')}\"`]);
    csvRows.push([]);
    csvRows.push([`\"NET DISBURSABLE PAYOUT\"`, `\"${isBlurred ? "HIDDEN" : document.getElementById('breakdownNet').innerText.replace('₱','')}\"`]);

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

    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = 'YOU HAVE UNSAVED TIMELINE ENTRIES. ARE YOU SURE YOU WANT TO DISCARD AND EXIT?';
        }
    });

    document.getElementById('periodSelector').addEventListener('change', fetchAndProcessSelectedPeriodPayload);
    
    const watchedInputs = ['inputDoublePay', 'inputReimbursements', 'inputSSS', 'inputPHIC', 'inputHDMF', 'inputAdvances'];
    watchedInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            recomputeGlobalFinancials();
            markChangeAndQueueAutoSave();
        });
    });

    document.getElementById('modalTimeIn1').addEventListener('change', runRealtimeMetricsDeductionEngine);
    document.getElementById('modalTimeOut1').addEventListener('change', () => {
        evaluateLunchBreakConstraints();
        runRealtimeMetricsDeductionEngine();
    });
    document.getElementById('modalTimeIn2').addEventListener('change', runRealtimeMetricsDeductionEngine);
    document.getElementById('modalTimeOut2').addEventListener('change', runRealtimeMetricsDeductionEngine);
    document.getElementById('chkEnableOTWrapper').addEventListener('click', toggleOvertimeSubSection);

    document.getElementById('btnSaveToCloud').addEventListener('click', () => commitTimelineTransactionToCloud(false));
    document.getElementById('btnPrintPreview').addEventListener('click', triggerPrintPreviewPipeline);
    document.getElementById('btnExportCSV').addEventListener('click', triggerCSVExportPipeline);
    
    document.getElementById('btnModalClose').addEventListener('click', closeTimeTransactionModal);
    document.getElementById('btnModalApply').addEventListener('click', commitModalDayStateToLocalBuffer);
    document.getElementById('btnModalClear').addEventListener('click', clearModalDayState);
});
