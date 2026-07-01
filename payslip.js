import { initializeApp } from \"https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js\";
import { getFirestore, doc, getDoc, setDoc } from \"https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js\";

// ==========================================================================
// 1. FIREBASE ARCHITECTURE CONFIGURATION
// ==========================================================================
const firebaseConfig = {
    apiKey: \"AIzaSyDaeNQF4qmW0vvwxUPp_NztnT0hoLzm1BQ\",
    authDomain: \"svls-289ee.firebaseapp.com\",\n    databaseURL: \"https://svls-289ee-default-rtdb.firebaseio.com\",
    projectId: \"svls-289ee\",
    storageBucket: \"svls-289ee.firebasestorage.app\",
    messagingSenderId: \"500705386198\",
    appId: \"1:500705386198:web:96f189662bc2aa99cf7377\",
    measurementId: \"G-5TNBMQ2HN5\"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const userId = localStorage.getItem(\"userId\");
if (!userId) {
    window.location.href = \"login.html\";
}

// ==========================================================================
// 2. GLOBAL STATE MATRIX INITIALIZATION & OVERRIDE LIFE-MEMORIES
// ==========================================================================
let userProfile = { name: \"\", customName: \"\", email: \"\" };
let salarySettings = {};
let activeDatesArray = [];
let timelineBuffer = {};
let activeTargetDateKey = null;
let autoSaveDebounceTracker = null;
let hasUnsavedChanges = false;

let historicalOverrideActive = false;
let historicalClickCounter = 0;
let historicalAutoLockTimer = null;
const CURRENT_YEAR = 2026;

// ==========================================================================
// 2B. PIXEL-PERFECT UNIFIED TOAST ENGINE (SETTINGS.HTML PORT)
// ==========================================================================
function triggerToast(message, isWorking = false) {
    let toast = document.getElementById('toastHub');
    let txt = document.getElementById('toastText');
    let dot = document.getElementById('toastDot');

    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastHub';
        toast.className = 'toast-notification-hub';
        
        const inlineStyle = document.createElement('style');
        inlineStyle.innerHTML = `
            .toast-notification-hub {
                position: fixed;
                bottom: 30px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: rgba(0, 0, 0, 0.85);
                border: 1px solid var(--border-glass, rgba(255,255,255,0.12));
                backdrop-filter: blur(15px);
                -webkit-backdrop-filter: blur(15px);
                padding: 14px 28px;
                border-radius: 30px;
                display: flex;
                align-items: center;
                gap: 10px;
                z-index: 10000;
                opacity: 0;
                transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
                pointer-events: none;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }
            .toast-notification-hub.active {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
            .toast-indicator-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: var(--primary, #22c55e);
            }
            .toast-body-text {
                font-size: 0.72rem;
                font-weight: 800;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                color: #f1f5f9;
                font-family: 'Inter', sans-serif;
            }
            .blurred-lock {
                filter: blur(5.5px) !important;
                pointer-events: none !important;
                user-select: none !important;
            }
        `;
        document.head.appendChild(inlineStyle);

        dot = document.createElement('div');
        dot.id = 'toastDot';
        dot.className = 'toast-indicator-dot';

        txt = document.createElement('div');
        txt.id = 'toastText';
        txt.className = 'toast-body-text';

        toast.appendChild(dot);
        toast.appendChild(txt);
        document.body.appendChild(toast);
    }

    txt.innerText = message;
    dot.style.backgroundColor = isWorking ? "#ffaa00" : (document.documentElement.style.getPropertyValue('--primary') || "#22c55e");
    
    toast.classList.add('active');
    
    if (!isWorking) {
        setTimeout(() => {
            toast.classList.remove('active');
        }, 2500);
    }
}

function hideToast() {
    const toast = document.getElementById('toastHub');
    if (toast) toast.classList.remove('active');
}

// ==========================================================================
// 3. CORE INITIALIZATION ROUTINE ENGINE & OVERRIDE LIFECYCLE
// ==========================================================================
function formatCurrency(val) {
    return parseFloat(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showGlobalEngineLoader() {
    const loader = document.getElementById('globalEngineLoader');
    if (loader) loader.style.display = 'flex';
}

function hideGlobalEngineLoader() {
    const loader = document.getElementById('globalEngineLoader');
    if (loader) loader.style.display = 'none';
}

function injectExitGuardModal() {
    if (document.getElementById('exitGuardModalOverlay')) return;
    const modal = document.createElement('div');
    modal.id = 'exitGuardModalOverlay';
    modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:none;align-items:center;justify-content:center;z-index:10001;";
    modal.innerHTML = `
        <div style=\"background:#1e293b;padding:24px;border-radius:16px;max-width:320px;text-align:center;border:1px solid rgba(255,255,255,0.1);\">
            <h3 style=\"margin-top:0;font-size:1rem;font-weight:800;\">UNSAVED DATA CHANGED</h3>
            <p style=\"font-size:0.8rem;color:#94a3b8;margin-bottom:20px;\">YOU HAVE MODIFIED LOGS WITHOUT COMMITING TO FIREBASE. DISCARD CHANGES?</p>
            <div style=\"display:flex;gap:10px;justify-content:center;\">
                <button onclick=\"hasUnsavedChanges=false;document.getElementById('exitGuardModalOverlay').style.display='none';fetchAndProcessSelectedPeriodPayload();\" style=\"background:#ef4444;color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.75rem;\">DISCARD</button>
                <button onclick=\"document.getElementById('exitGuardModalOverlay').style.display='none';\" style=\"background:transparent;color:white;border:1px solid #475569;padding:8px 16px;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.75rem;\">CANCEL</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function bootEngineCore() {
    showGlobalEngineLoader();
    injectExitGuardModal();
    setupNetPayOverrideListener(); 
    try {
        const accountRef = doc(db, \"accounts\", userId);
        const accountSnap = await getDoc(accountRef);

        if (accountSnap.exists()) {
            const accountData = accountSnap.data();
            userProfile.name = accountData.username || localStorage.getItem(\"userName\") || userProfile.name;
            if (accountData.customName) userProfile.customName = accountData.customName.toUpperCase();
            if (accountData.bgValue) document.documentElement.style.setProperty('--bg', accountData.bgValue);
            if (accountData.btnValue) {
                document.documentElement.style.setProperty('--primary', accountData.btnValue);
                const modalBox = document.getElementById('modalBoxContainer');
                if (modalBox) modalBox.style.border = `1px solid ${accountData.btnValue}`;
            }
        }

        const settingsRef = doc(db, \"salary_settings\", userId);
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
            salarySettings = settingsSnap.data();
            if (salarySettings.firstName && salarySettings.lastName) {
                const mi = salarySettings.middleInitial ? ` ${salarySettings.middleInitial}.` : \"\";
                userProfile.customName = `${salarySettings.firstName}${mi} ${salarySettings.lastName}`.toUpperCase();
            }
            if (salarySettings.emailAddress) userProfile.email = salarySettings.emailAddress;
        }

        updateUIProfileElements();
        buildDropdownTargetIntervals();
        await fetchAndProcessSelectedPeriodPayload();

    } catch (err) {
        console.error(\"Setup initialization error: \", err);
    } finally {
        hideGlobalEngineLoader();
    }
}

function updateUIProfileElements() {
    document.getElementById('profSettingsNameDisplay').innerText = (userProfile.customName || \"\").toUpperCase();
    document.getElementById('profNameDisplay').innerText = (userProfile.name || \"\").toUpperCase();
    document.getElementById('profEmailDisplay').innerText = (userProfile.email || \"\").toUpperCase();
    document.getElementById('profPosDisplay').innerText = (salarySettings.position || \"Staff\").toUpperCase();
    document.getElementById('profDeptDisplay').innerText = (salarySettings.department || \"Operations\").toUpperCase();
    
    let rateElement = document.getElementById('profDailyRateDisplay');
    const formattedRate = `₱${formatCurrency(parseFloat(salarySettings.dailyRate) || 460)}`;
    if (rateElement) {
        rateElement.innerText = formattedRate;
    } else {
        const badgeDeck = document.querySelector('.profile-badge-deck');
        if (badgeDeck) {
            const newMetaRow = document.createElement('div');
            newMetaRow.className = \"profile-meta-row\";
            newMetaRow.innerHTML = `<span class=\"lbl\">DAILY RATE</span><span class=\"val\" id=\"profDailyRateDisplay\">${formattedRate}</span>`;
            badgeDeck.appendChild(newMetaRow);
        }
    }
}

function buildDropdownTargetIntervals() {
    const selector = document.getElementById('periodSelector');
    const months = [\"JANUARY\", \"FEBRUARY\", \"MARCH\", \"APRIL\", \"MAY\", \"JUNE\", \"JULY\", \"AUGUST\", \"SEPTEMBER\", \"OCTOBER\", \"NOVEMBER\", \"DECEMBER\"];
    
    selector.innerHTML = \"\";
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

    document.getElementById('inputSSS').value = \"\";
    document.getElementById('inputPHIC').value = \"\";
    document.getElementById('inputHDMF').value = \"\";
    document.getElementById('inputAdvances').value = \"\";
    document.getElementById('inputDoublePay').value = \"\";
    document.getElementById('inputReimbursements').value = \"\";

    try {
        const transSnap = await getDoc(doc(db, \"salary_transactions\", `${userId}_${selectedPeriodKey}`));
        if (transSnap.exists()) {
            const loadedData = transSnap.data();
            if (loadedData.timelineBuffer) timelineBuffer = loadedData.timelineBuffer;
            document.getElementById('inputSSS').value = loadedData.inputSSS || \"\";
            document.getElementById('inputPHIC').value = loadedData.inputPHIC || \"\";
            document.getElementById('inputHDMF').value = loadedData.inputHDMF || \"\";
            document.getElementById('inputAdvances').value = loadedData.inputAdvances || \"\";
            document.getElementById('inputDoublePay').value = loadedData.inputDoublePay || \"\";
            document.getElementById('inputReimbursements').value = loadedData.inputReimbursements || \"\";
        }
    } catch(e) {
        console.error(\"Payload data recovery error: \", e);
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

    const numericTotalFields = [
        document.getElementById('totalDailyGrossOnly'),
        document.getElementById('totalOtGrossOnly'),
        document.getElementById('totalDed'),
        document.getElementById('totalDailyNet')
    ];
    
    if (!revealNetPay) {
        if (wrapper) {
            wrapper.classList.add('blurred-lock');
            wrapper.setAttribute('data-blurred', 'true');
        }
        if (badge) badge.style.display = \"inline-block\";
        if (trackingTable) {
            trackingTable.classList.add('blurred-lock');
            trackingTable.setAttribute('data-blurred', 'true');
        }
        numericTotalFields.forEach(field => {
            if (field) field.classList.add('blurred-lock');
        });
    } else {
        if (wrapper) {
            wrapper.classList.remove('blurred-lock');
            wrapper.removeAttribute('data-blurred');
        }
        if (badge) badge.style.display = \"none\";
        if (trackingTable) {
            trackingTable.classList.remove('blurred-lock');
            trackingTable.removeAttribute('data-blurred');
        }
        numericTotalFields.forEach(field => {
            if (field) field.classList.remove('blurred-lock');
        });
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
                el.style.cursor = \"not-allowed\";
                el.style.opacity = \"0.6\";
            } else {
                el.removeAttribute('disabled');
                el.style.cursor = \"\";
                el.style.opacity = \"\";
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
                triggerToast(\"🔒 ADMIN OVERRIDE: HISTORICAL MATRIX SETTINGS UNLOCKED.\", false);
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
        triggerToast(\"⏳ SECURITY OVERRIDE EXPIRED. RECORDS RE-LOCKED.\", true);
        resetHistoricalOverrideState();
    }, 120000); 
}

function resetHistoricalOverrideState() {
    historicalOverrideActive = false;
    historicalClickCounter = 0;
    clearTimeout(historicalAutoLockTimer);
    teardownInactivitySignalTracers();
    evaluateDynamicLockAndBlurConstraints();
    if (typeof renderActivePeriodCalendarGrid === \"function\" && document.getElementById('calendarNodeGrid')) {
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

// ==========================================================================
// 4. MATRIX UI CALENDAR RENDER ENGINE
// ==========================================================================
function renderActivePeriodCalendarGrid() {
    const grid = document.getElementById('calendarNodeGrid');
    if (!grid) return;
    grid.innerHTML = \"\";

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
        cell.className = \"calendar-day-node\";
        
        if (isFutureDate) {
            cell.classList.add(\"node-future-locked\");
            cell.style.opacity = \"0.4\";
            cell.style.cursor = \"not-allowed\";
        } else if (isLockedPastDate) {
            cell.classList.add(\"node-locked\");
        }

        cell.innerHTML = `<span class=\"day-num\">${day}</span><span class=\"day-lbl\">${dayOfWeekStr}</span>`;

        if (isLockedPastDate || isFutureDate) {
            const iconSpan = document.createElement('span');
            iconSpan.className = \"lock-corner-icon\";
            iconSpan.innerHTML = `<i data-lucide=\"lock\" style=\"width:10px;height:10px;\"></i>`;
            cell.appendChild(iconSpan);
        }

        if (timelineBuffer[dateKey] && timelineBuffer[dateKey].filled) {
            cell.style.backgroundColor = document.documentElement.style.getPropertyValue('--primary') || \"var(--primary)\";
            cell.style.color = \"#000000\";
            const lbl = cell.querySelector('.day-lbl');
            if (lbl) lbl.style.color = \"rgba(0,0,0,0.6)\";
        }

        cell.onclick = () => {
            if (isFutureDate) {
                triggerToast(\"CHRONOLOGICAL ERROR: FUTURE DATE SELECTION DENIED.\", false);
                return;
            }
            if (isLockedPastDate) {
                triggerToast(\"HISTORICAL ERROR: CARD TRANSACTION ROW IS SECURED.\", false);
                return;
            }
            
            if (historicalOverrideActive && typeof renewHistoricalInactivityTimer === \"function\") {
                renewHistoricalInactivityTimer();
            }
            
            launchTimeTransactionModal(dateKey, false);
        };
        grid.appendChild(cell);
    });
    
    if (window.lucide) window.lucide.createIcons();
}

// ==========================================================================
// 5. MATHS ENGINE & TIME CALCULATION ALGORITHMS
// ==========================================================================
function parseTimeToMinutes(tStr) {
    if (!tStr) return null;
    const parts = tStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function calculateMinutesDifference(start, end) {
    if (start === null || end === null || end < start) return 0;
    return end - start;
}

function evaluateLunchBreakConstraints() {
    const hasLunch = salarySettings.hasLunchBreak !== false;
    const tOut1 = parseTimeToMinutes(document.getElementById('modalTimeOut1').value);
    
    if (hasLunch && tOut1 !== null) {
        const baseLunchStart = 12 * 60; 
        if (tOut1 > baseLunchStart) {
            // Cap out automatic parameters matching rules
        }
    }
}

function runRealtimeMetricsDeductionEngine() {
    const dailyRate = parseFloat(salarySettings.dailyRate) || 460;
    const minPerHour = dailyRate / 8 / 60;

    const in1 = parseTimeToMinutes(document.getElementById('modalTimeIn1').value);
    const out1 = parseTimeToMinutes(document.getElementById('modalTimeOut1').value);
    const in2 = parseTimeToMinutes(document.getElementById('modalTimeIn2').value);
    const out2 = parseTimeToMinutes(document.getElementById('modalTimeOut2').value);

    let lates = 0;
    let undertime = 0;
    let totalWorkedMinutes = 0;

    const schedIn1 = 8 * 60;  
    const schedOut1 = 12 * 60;
    const schedIn2 = 13 * 60; 
    const schedOut2 = 17 * 60;

    // Shift 1
    if (in1 !== null && out1 !== null) {
        if (in1 > schedIn1) lates += (in1 - schedIn1);
        if (out1 < schedOut1) undertime += (schedOut1 - out1);
        totalWorkedMinutes += calculateMinutesDifference(Math.max(in1, schedIn1), Math.min(out1, schedOut1));
    }
    // Shift 2
    if (in2 !== null && out2 !== null) {
        if (in2 > schedIn2) lates += (in2 - schedIn2);
        if (out2 < schedOut2) undertime += (schedOut2 - out2);
        totalWorkedMinutes += calculateMinutesDifference(Math.max(in2, schedIn2), Math.min(out2, schedOut2));
    }

    document.getElementById('modalCalcLates').value = lates;
    document.getElementById('modalCalcUndertime').value = undertime;

    let grossPay = (totalWorkedMinutes / 480) * dailyRate;
    if (grossPay > dailyRate) grossPay = dailyRate;
    
    let deduction = (lates + undertime) * minPerHour;
    let netPay = grossPay - deduction;
    if (netPay < 0) netPay = 0;

    document.getElementById('modalCalcGross').value = formatCurrency(grossPay);
    document.getElementById('modalCalcDeduction').value = formatCurrency(deduction);
    document.getElementById('modalCalcNet').value = formatCurrency(netPay);
}

function recomputeGlobalFinancials() {
    let totalLates = 0;
    let totalUndertime = 0;
    let accumulatedDailyGross = 0;
    let accumulatedOtGross = 0;
    let accumulatedDeductions = 0;
    let accumulatedDailyNet = 0;

    const tableBody = document.getElementById('uiDailyBreakdownBody');
    if (!tableBody) return;
    tableBody.innerHTML = \"\";

    const dailyRate = parseFloat(salarySettings.dailyRate) || 460;
    const minPerHour = dailyRate / 8 / 60;
    const otRatePerHour = parseFloat(salarySettings.overtimeRate) || 60;

    activeDatesArray.forEach(dateObj => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

        let rowData = timelineBuffer[dateKey] || {
            in1: \"\", out1: \"\", in2: \"\", out2: \"\", otIn: \"\", otOut: \"\", 
            lates: 0, undertime: 0, otMins: 0, gross: 0, otGross: 0, ded: 0, net: 0, filled: false
        };

        if (rowData.filled) {
            totalLates += parseInt(rowData.lates) || 0;
            totalUndertime += parseInt(rowData.undertime) || 0;
            accumulatedDailyGross += parseFloat(rowData.gross) || 0;
            accumulatedOtGross += parseFloat(rowData.otGross) || 0;
            accumulatedDeductions += parseFloat(rowData.ded) || 0;
            accumulatedDailyNet += parseFloat(rowData.net) || 0;
        }

        const tr = document.createElement('tr');
        if (rowData.filled) tr.style.background = \"rgba(255,255,255,0.01)\";

        // Admin session tracking inside matrix lines
        tr.onclick = () => {
            const selector = document.getElementById('periodSelector');
            let periodIsPast = false;
            if (selector) {
                const pDate = new Date(selector.value);
                pDate.setHours(0,0,0,0);
                const nDate = new Date();
                nDate.setHours(0,0,0,0);
                if (pDate.getTime() < nDate.getTime()) periodIsPast = true;
            }
            if (periodIsPast && !historicalOverrideActive) {
                triggerToast(\"HISTORICAL SECURE ERROR: COMPONENT IS READ ONLY.\");
                return;
            }
            launchTimeTransactionModal(dateKey, false);
        };

        tr.innerHTML = `
            <td>${month}/${day}</td>
            <td style=\"color:#64748b;\">${dayName}</td>
            <td>${rowData.in1 || '-'}</td>
            <td>${rowData.out1 || '-'}</td>
            <td>${rowData.in2 || '-'}</td>
            <td>${rowData.out2 || '-'}</td>
            <td>${rowData.otIn || '-'}</td>
            <td>${rowData.otOut || '-'}</td>
            <td style=\"color:${rowData.lates > 0 ? '#ef4444':'#64748b'};\">${rowData.lates || 0}</td>
            <td style=\"color:${rowData.undertime > 0 ? '#ef4444':'#64748b'};\">${rowData.undertime || 0}</td>
            <td style=\"text-align:right;\">₱${formatCurrency(rowData.gross)}</td>
            <td style=\"text-align:right;color:#38bdf8;\">₱${formatCurrency(rowData.otGross)}</td>
            <td style=\"text-align:right;color:#ef4444;\">₱${formatCurrency(rowData.ded)}</td>
            <td style=\"text-align:right;font-weight:700;color:var(--primary);\">₱${formatCurrency(rowData.net)}</td>
        `;
        tableBody.appendChild(tr);
    });

    document.getElementById('totalLates').innerText = totalLates;
    document.getElementById('totalUndertime').innerText = totalUndertime;
    document.getElementById('totalDailyGrossOnly').innerText = `₱${formatCurrency(accumulatedDailyGross)}`;
    document.getElementById('totalOtGrossOnly').innerText = `₱${formatCurrency(accumulatedOtGross)}`;
    document.getElementById('totalDed').innerText = `₱${formatCurrency(accumulatedDeductions)}`;
    document.getElementById('totalDailyNet').innerText = `₱${formatCurrency(accumulatedDailyNet)}`;

    // Process External Structural Modifiers
    const sss = parseFloat(document.getElementById('inputSSS').value) || 0;
    const phic = parseFloat(document.getElementById('inputPHIC').value) || 0;
    const hdmf = parseFloat(document.getElementById('inputHDMF').value) || 0;
    const adv = parseFloat(document.getElementById('inputAdvances').value) || 0;
    const dbPay = parseFloat(document.getElementById('inputDoublePay').value) || 0;
    const reim = parseFloat(document.getElementById('inputReimbursements').value) || 0;

    const totalStatDeductions = sss + phic + hdmf + adv;
    const totalEarnings = accumulatedDailyNet + dbPay + reim;
    const ultimateNetPay = totalEarnings - totalStatDeductions;

    document.getElementById('renderGrossIncomeValue').innerText = `₱${formatCurrency(accumulatedDailyGross + accumulatedOtGross)}`;
    document.getElementById('renderStatDeductionValue').innerText = `₱${formatCurrency(totalStatDeductions)}`;
    document.getElementById('renderNetTakeHomePayValue').innerText = `₱${formatCurrency(ultimateNetPay < 0 ? 0 : ultimateNetPay)}`;
}

// ==========================================================================
// 6. MODAL INTERACTION CONTROL ROOM LAYER
// ==========================================================================
function launchTimeTransactionModal(dateKey, readOnly = false) {
    activeTargetDateKey = dateKey;
    const modal = document.getElementById('modalBoxContainer');
    const overlay = document.getElementById('modalOverlayWrapper');
    if (!modal || !overlay) return;

    const pieces = dateKey.split('-');
    document.getElementById('modalTargetDateTitle').innerText = `${pieces[1]}/${pieces[2]}/${pieces[0]}`;

    let data = timelineBuffer[dateKey] || {
        in1:\"\", out1:\"\", in2:\"\", out2:\"\", otIn:\"\", otOut:\"\", lates:0, undertime:0, gross:0, otGross:0, ded:0, net:0, filled:false, hasOT:false
    };

    document.getElementById('modalTimeIn1').value = data.in1 || \"\";
    document.getElementById('modalTimeOut1').value = data.out1 || \"\";
    document.getElementById('modalTimeIn2').value = data.in2 || \"\";
    document.getElementById('modalTimeOut2').value = data.out2 || \"\";
    document.getElementById('modalTimeInOT').value = data.otIn || \"\";
    document.getElementById('modalTimeOutOT').value = data.otOut || \"\";

    const chkOt = document.getElementById('chkEnableOT');
    const otBlock = document.getElementById('modalOvertimeInputSubSection');
    if (data.hasOT) {
        chkOt.checked = true;
        if (otBlock) otBlock.style.display = \"grid\";
    } else {
        chkOt.checked = false;
        if (otBlock) otBlock.style.display = \"none\";
    }

    document.getElementById('modalCalcLates').value = data.lates || 0;
    document.getElementById('modalCalcUndertime').value = data.undertime || 0;
    document.getElementById('modalCalcGross').value = formatCurrency(data.gross);
    document.getElementById('modalCalcDeduction').value = formatCurrency(data.ded);
    document.getElementById('modalCalcNet').value = formatCurrency(data.net);

    overlay.style.display = \"flex\";
    modal.style.display = \"block\";
}

function closeTimeTransactionModal() {
    const modal = document.getElementById('modalBoxContainer');
    const overlay = document.getElementById('modalOverlayWrapper');
    if (modal) modal.style.display = \"none\";
    if (overlay) overlay.style.display = \"none\";
    activeTargetDateKey = null;
}

function toggleOvertimeSubSection() {
    const chk = document.getElementById('chkEnableOT');
    const sub = document.getElementById('modalOvertimeInputSubSection');
    if (!sub) return;
    sub.style.display = chk.checked ? \"grid\" : \"none\";
}

function commitModalDayStateToLocalBuffer() {
    if (!activeTargetDateKey) return;

    const in1 = document.getElementById('modalTimeIn1').value;
    const out1 = document.getElementById('modalTimeOut1').value;
    const in2 = document.getElementById('modalTimeIn2').value;
    const out2 = document.getElementById('modalTimeOut2').value;
    const otIn = document.getElementById('modalTimeInOT').value;
    const otOut = document.getElementById('modalTimeOutOT').value;
    const hasOT = document.getElementById('chkEnableOT').checked;

    let lates = parseInt(document.getElementById('modalCalcLates').value) || 0;
    let undertime = parseInt(document.getElementById('modalCalcUndertime').value) || 0;
    
    let gross = parseFloat(document.getElementById('modalCalcGross').value.replace(/,/g, '')) || 0;
    let ded = parseFloat(document.getElementById('modalCalcDeduction').value.replace(/,/g, '')) || 0;
    let net = parseFloat(document.getElementById('modalCalcNet').value.replace(/,/g, '')) || 0;

    let otMins = 0;
    let otGross = 0;

    if (hasOT && otIn && otOut) {
        const oInMin = parseTimeToMinutes(otIn);
        const oOutMin = parseTimeToMinutes(otOut);
        if (oOutMin > oInMin) {
            otMins = oOutMin - oInMin;
            const otRatePerHour = parseFloat(salarySettings.overtimeRate) || 60;
            otGross = (otMins / 60) * otRatePerHour;
        }
    }

    net += otGross;

    timelineBuffer[activeTargetDateKey] = {
        in1, out1, in2, out2, otIn, otOut, hasOT, lates, undertime, otMins, gross, otGross, ded, net, filled: true
    };

    hasUnsavedChanges = true;
    closeTimeTransactionModal();
    recomputeGlobalFinancials();
    renderActivePeriodCalendarGrid();
    markChangeAndQueueAutoSave();
}

function clearModalDayState() {
    if (!activeTargetDateKey) return;
    delete timelineBuffer[activeTargetDateKey];
    hasUnsavedChanges = true;
    closeTimeTransactionModal();
    recomputeGlobalFinancials();
    renderActivePeriodCalendarGrid();
    markChangeAndQueueAutoSave();
}

// ==========================================================================
// 7. DATA RECOVERY TRANSMISSION SYNC & EXPORTS
// ==========================================================================
function markChangeAndQueueAutoSave() {
    clearTimeout(autoSaveDebounceTracker);
    autoSaveDebounceTracker = setTimeout(() => {
        commitTimelineTransactionToCloud(true);
    }, 5000); 
}

async function commitTimelineTransactionToCloud(isBackground = false) {
    if (!isBackground) showGlobalEngineLoader();
    else triggerToast(\"SYNCING PAYROLL CONFIG...\", true);

    const selectedPeriodKey = document.getElementById('periodSelector').value;
    const txId = `${userId}_${selectedPeriodKey}`;

    const payload = {
        userId,
        periodKey: selectedPeriodKey,
        timelineBuffer,
        inputSSS: document.getElementById('inputSSS').value,
        inputPHIC: document.getElementById('inputPHIC').value,
        inputHDMF: document.getElementById('inputHDMF').value,
        inputAdvances: document.getElementById('inputAdvances').value,
        inputDoublePay: document.getElementById('inputDoublePay').value,
        inputReimbursements: document.getElementById('inputReimbursements').value,
        lastUpdated: new Date().toISOString()
    };

    try {
        await setDoc(doc(db, \"salary_transactions\", txId), payload);
        hasUnsavedChanges = false;
        triggerToast(\"FIREBASE RUNTIME SYNCHRONIZED.\", false);
    } catch (err) {
        console.error(\"Transaction Sync Error: \", err);
        triggerToast(\"SYNCHRONIZATION ERROR CAUGHT.\", false);
    } finally {
        if (!isBackground) hideGlobalEngineLoader();
    }
}

function triggerCSVExportPipeline() {
    let csv = \"DATE,DAY,IN1,OUT1,IN2,OUT2,OT IN,OT OUT,LATES,UNDERTIME,GROSS,OT GROSS,DEDUCTION,NET\\n\";
    activeDatesArray.forEach(dateObj => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });

        let d = timelineBuffer[dateKey] || { in1:\"\", out1:\"\", in2:\"\", out2:\"\", otIn:\"\", otOut:\"\", lates:0, undertime:0, gross:0, otGross:0, ded:0, net:0 };
        csv += `${month}/${day},${dayName},${d.in1},${d.out1},${d.in2},${d.out2},${d.otIn},${d.otOut},${d.lates},${d.undertime},${d.gross},${d.otGross},${d.ded},${d.net}\\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement(\"a\");
    link.href = URL.createObjectURL(blob);
    link.setAttribute(\"download\", `PAYSLIP_BREAKDOWN_${userId}_${document.getElementById('periodSelector').value}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function triggerPrintPreviewPipeline() {
    let printContainer = document.getElementById('print-render-matrix');
    if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'print-render-matrix';
        document.body.appendChild(printContainer);
    }

    const startStr = activeDatesArray[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const endStr = activeDatesArray[activeDatesArray.length - 1].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    let tableRowsHtml = \"\";
    activeDatesArray.forEach(dateObj => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        let d = timelineBuffer[dateKey] || { in1:\"-\", out1:\"-\", in2:\"-\", out2:\"-\", otIn:\"-\", otOut:\"-\", lates:0, undertime:0, gross:0, otGross:0, ded:0, net:0 };

        tableRowsHtml += `
            <tr>
                <td>${month}/${day} (${dayName})</td>
                <td>${d.in1 || '-'}</td><td>${d.out1 || '-'}</td>
                <td>${d.in2 || '-'}</td><td>${d.out2 || '-'}</td>
                <td>${d.otIn || '-'}</td><td>${d.otOut || '-'}</td>
                <td>${d.lates || 0}</td><td>${d.undertime || 0}</td>
                <td>₱${formatCurrency(d.gross)}</td>
                <td>₱${formatCurrency(d.otGross)}</td>
                <td>₱${formatCurrency(d.ded)}</td>
                <td>₱${formatCurrency(d.net)}</td>
            </tr>
        `;
    });

    printContainer.innerHTML = `
        <div style=\"font-family:sans-serif; padding:20px; color:#000;\">
            <h2 style=\"margin:0; text-transform:uppercase;\">OFFICIAL PAYSLIP TIMELINE MATRIX</h2>
            <p style=\"font-size:12px; margin:4px 0 20px 0;\">PAYABLE DURATION COVERED: <strong>${startStr} - ${endStr}</strong></p>
            
            <div style=\"margin-bottom:20px; display:grid; grid-template-columns: 1fr 1fr; gap:20px; font-size:13px;\">
                <div>
                    <div>EMPLOYEE IDENTIFIER: <strong>${(userProfile.customName || userProfile.name).toUpperCase()}</strong></div>
                    <div>DEPARTMENT COMPARTMENT: <strong>${(salarySettings.department || 'Operations').toUpperCase()}</strong></div>
                </div>
                <div style=\"text-align:right;\">
                    <div>GROSS SUM: <strong>${document.getElementById('renderGrossIncomeValue').innerText}</strong></div>
                    <div>STATUTORY TOTAL DEDUCTIONS: <strong>${document.getElementById('renderStatDeductionValue').innerText}</strong></div>
                    <div style=\"font-size:15px; margin-top:4px;\">ULTIMATE NET TAKE HOME: <strong>${document.getElementById('renderNetTakeHomePayValue').innerText}</strong></div>
                </div>
            </div>

            <table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"width:100%; border-collapse:collapse; font-size:11px; text-align:left;\">
                <thead>
                    <tr style=\"background:#f2f2f2;\">
                        <th>DATE</th><th>IN1</th><th>OUT1</th><th>IN2</th><th>OUT2</th><th>OT IN</th><th>OT OUT</th><th>LATE</th><th>UT</th><th>GROSS</th><th>OT GROSS</th><th>DED</th><th>NET</th>
                    </tr>
                </thead>
                <tbody>${tableRowsHtml}</tbody>
            </table>
        </div>
    `;

    window.print();
}

// ==========================================================================
// 8. LIFECYCLE MAP WINDOW EVENT LISTENERS
// ==========================================================================
document.addEventListener(\"DOMContentLoaded\", () => {
    bootEngineCore();

    document.getElementById('periodSelector').addEventListener('change', fetchAndProcessSelectedPeriodPayload);

    const watchedInputs = ['inputDoublePay', 'inputReimbursements', 'inputSSS', 'inputPHIC', 'inputHDMF', 'inputAdvances'];
    watchedInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                recomputeGlobalFinancials();
                markChangeAndQueueAutoSave();
            });
        }
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

window.addEventListener('beforeunload', resetHistoricalOverrideState);
