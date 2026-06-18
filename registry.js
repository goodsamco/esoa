import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getDatabase, ref, onValue, set, child, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Your shared Firebase configuration setup
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
const rtdb = getDatabase(app);

const userId = localStorage.getItem("userId") || "testUser";
const userDocRef = doc(db, "accounts", userId);

let layoutMovableActive = false;
let activeEditRow = null;

const baseDataset = {
    icd: [
        { code: "J06.9", desc: "UPPER RESPIRATORY TRACT INFECTION" },
        { code: "M06.99", desc: "ARTHRITIS" },
        { code: "I10.1", desc: "HYPERTENSION STAGE II" },
        { code: "I10.9", desc: "ESSENTIAL HYPERTENSION" },
        { code: "K29.9", desc: "GASTRITIS" }
    ],
    member: [
        { code: "POS INCAPABLE", desc: "INDIGENT" },
        { code: "NTHS", desc: "INDIGENT" },
        { code: "DIRECT", desc: "CONTRIBUTOR - INDIVIDUAL PAYING" }
    ],
    zipcode: [
        { code: "9417", desc: "ARAKAN" },
        { code: "9415", desc: "ALEOSAN" },
        { code: "9400", desc: "PIGKAWAYAN" }
    ]
};

// Defensive user interface synchronization from Firestore profile data
onSnapshot(userDocRef, (snapshot) => {
    if (snapshot.exists()) {
        const data = snapshot.data();
        const nameEl = document.getElementById('userDisplayName');
        if (nameEl && data.customName) nameEl.innerText = data.customName.split(' ')[0];

        const avatarEl = document.getElementById('userDisplayAvatar');
        if (avatarEl && data.avatarUrl) avatarEl.src = data.avatarUrl;

        // Clean element lookup safeguards to completely prevent application breakdowns
        const magnetBtn = document.getElementById('magnetBtn');
        if (magnetBtn) {
            if (data.btnMode === "image") {
                magnetBtn.style.backgroundImage = `url('${data.btnValue}')`;
            } else if (data.btnValue) {
                magnetBtn.style.backgroundImage = "none";
                document.documentElement.style.setProperty('--primary', data.btnValue);
            }
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initializeRegistryData();

    document.getElementById('icdHeader')?.addEventListener('click', function() { toggleCategoryAccordion('icd-wrapper', this); });
    document.getElementById('zipHeader')?.addEventListener('click', function() { toggleCategoryAccordion('zip-wrapper', this); });
    document.getElementById('memberHeader')?.addEventListener('click', function() { toggleCategoryAccordion('member-wrapper', this); });

    document.getElementById('registrySearch')?.addEventListener('input', filterRegistryRealtime);

    document.getElementById('addRecordModalTrigger')?.addEventListener('click', () => { toggleModal('addRecordModal', true); });
    document.getElementById('sortToggleTrigger')?.addEventListener('click', toggleMovableLayout);
    document.getElementById('modalTypeSelector')?.addEventListener('change', synchronizeModalInputs);
    document.getElementById('modalSaveBtn')?.addEventListener('click', pushRecordToDatabase);
    document.getElementById('modalDismissBtn')?.addEventListener('click', () => { toggleModal('addRecordModal', false); });
});

async function initializeRegistryData() {
    const sectionMap = { icd: 'icd-section-group', member: 'member-section-group', zipcode: 'zip-section-group' };
    for (const type of ['icd', 'member', 'zipcode']) {
        const targetContainer = document.getElementById(sectionMap[type]);
        if (!targetContainer) continue;
        targetContainer.innerHTML = '';

        let activeList = [];
        try {
            const snapshot = await get(child(ref(rtdb), `clinical_references/${type}`));
            if (snapshot.exists()) {
                const dataObj = snapshot.val();
                activeList = Object.keys(dataObj).map(k => ({ code: dataObj[k].code, desc: dataObj[k].description }));
            }
        } catch (e) {}

        if (activeList.length === 0) activeList = baseDataset[type];

        activeList.forEach((item, index) => {
            appendRowToDOM(targetContainer, type, item.code, item.desc, index >= 5);
        });

        if (activeList.length > 5) {
            const expandBtn = document.createElement('button');
            expandBtn.className = 'expand-list-action-trigger';
            expandBtn.setAttribute('data-expanded', 'false');
            expandBtn.innerHTML = `Show all (${activeList.length}) <i data-lucide="chevron-down" style="width:14px;height:14px;"></i>`;
            expandBtn.addEventListener('click', function() { toggleSectionListExpansion(this, sectionMap[type]); });
            targetContainer.appendChild(expandBtn);
        }
    }
    if (window.lucide) window.lucide.createIcons();
}

function appendRowToDOM(container, type, key, val, isOverflowItem) {
    const rowDiv = document.createElement('div');
    rowDiv.className = `item-row ${isOverflowItem ? 'hidden-overflow-item' : ''}`;
    rowDiv.setAttribute('data-ref-type', type);
    rowDiv.setAttribute('data-code', key);
    rowDiv.setAttribute('data-val', type === 'icd' ? val : `${key} - ${val}`);
    
    rowDiv.addEventListener('click', function() { handleSelectiveCopy(this); });
    
    rowDiv.innerHTML = `
        <span class="text-content"><span class="item-code-prefix">${key}</span><span class="item-desc-text">${val}</span></span>
        <div class="row-context-actions">
            <button class="context-action-node edit-trigger" title="Edit"><i data-lucide="edit-2" style="width:12px;height:12px;"></i></button>
        </div>
    `;
    
    container.appendChild(rowDiv);
}

function toggleCategoryAccordion(wrapperId, headerElement) {
    if (layoutMovableActive) return; 
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    wrapper.classList.toggle('collapsed');
}

function toggleSectionListExpansion(buttonElement, targetGroupId) {
    const container = document.getElementById(targetGroupId);
    if (!container) return;
    const isExpanded = buttonElement.getAttribute('data-expanded') === 'true';
    const rows = container.querySelectorAll('.item-row');
    
    if (!isExpanded) {
        rows.forEach(r => r.classList.remove('hidden-overflow-item'));
        buttonElement.setAttribute('data-expanded', 'true');
        buttonElement.innerHTML = `Hide <i data-lucide="chevron-up" style="width:14px;height:14px;"></i>`;
    } else {
        rows.forEach((r, idx) => { if (idx >= 5) r.classList.add('hidden-overflow-item'); });
        buttonElement.setAttribute('data-expanded', 'false');
        buttonElement.innerHTML = `Show all (${rows.length}) <i data-lucide="chevron-down" style="width:14px;height:14px;"></i>`;
    }
    if (window.lucide) window.lucide.createIcons();
}

function filterRegistryRealtime() {
    const query = document.getElementById('registrySearch').value.toLowerCase().trim();
    const container = document.getElementById('mainContainer');
    const searchTargetGroup = document.getElementById('searchResultTargetGroup');

    if (!searchTargetGroup) return;
    searchTargetGroup.innerHTML = '';
    
    if (query === "") {
        container.classList.remove('searching-active');
        return;
    }

    container.classList.add('searching-active');
    container.querySelectorAll('.section-group-inner .item-row').forEach(row => {
        const code = row.getAttribute('data-code').toLowerCase();
        const textVal = row.getAttribute('data-val').toLowerCase();
        if (code.includes(query) || textVal.includes(query)) {
            const clonedRow = row.cloneNode(true);
            clonedRow.classList.remove('hidden-overflow-item');
            clonedRow.addEventListener('click', function() { handleSelectiveCopy(this); });
            searchTargetGroup.appendChild(clonedRow);
        }
    });
}

function handleSelectiveCopy(element) {
    const dataVal = element.getAttribute('data-val');
    navigator.clipboard.writeText(dataVal).then(() => {
        const textNode = element.querySelector('.item-desc-text');
        if (textNode) {
            const originalText = textNode.textContent;
            textNode.textContent = "COPIED!";
            setTimeout(() => { textNode.textContent = originalText; }, 1000);
        }
    });
}

function synchronizeModalInputs() {
    const currentType = document.getElementById('modalTypeSelector').value;
    const primaryLabel = document.getElementById('primaryFieldLabel');
    const secondaryLabel = document.getElementById('secondaryFieldLabel');
    if (!primaryLabel || !secondaryLabel) return;
    
    if (currentType === 'icd') {
        primaryLabel.textContent = "Diagnosis Code"; secondaryLabel.textContent = "Diagnosis Description";
    } else {
        primaryLabel.textContent = "Code"; secondaryLabel.textContent = "Value";
    }
}

async function pushRecordToDatabase() {
    const type = document.getElementById('modalTypeSelector').value;
    const key = document.getElementById('newRecordKey').value.trim();
    const val = document.getElementById('newRecordValue').value.trim();
    if (!key || !val) return alert("Please specify all fields.");

    try {
        await set(ref(rtdb, `clinical_references/${type}/${key.replace(/[.#$\[\]]/g, "_")}`), { code: key, description: val });
        initializeRegistryData();
        toggleModal('addRecordModal', false);
    } catch (err) {
        console.error(err);
    }
}

function toggleMovableLayout() {
    layoutMovableActive = !layoutMovableActive;
    document.getElementById('mainContainer')?.classList.toggle('edit-mode-active', layoutMovableActive);
    document.getElementById('sortToggleTrigger')?.classList.toggle('active-mode', layoutMovableActive);
}

function toggleModal(id, isActive) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    if (isActive) {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('active'), 10);
    } else {
        overlay.classList.remove('active');
        setTimeout(() => { overlay.style.display = 'none'; }, 220);
    }
}
