/* ==========================================================================
   1. FIREBASE CORE SYSTEM INITIALIZATION
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getDatabase, ref, onValue, set, push, onChildAdded, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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


/* ==========================================================================
   2. GLOBAL SESSION STATE ACCESSORS
   ========================================================================== */
const userId = localStorage.getItem("userId");
if (!userId) {
    window.location.href = "login.html";
}

let currentUserName = "Operator";
let currentUserAvatarRaw = "avatar-m1";
let selectedActiveChatPartnerId = null;
let isGroupChat = false;
let transientChatListenerRemoveHook = null;
const mappedRouteTrackingHooks = {};
let backgroundGcTrackingHook = null;

// Premium Assets Lookup Matrix
const premium3dAssets = {
    'https://global.discourse-cdn.com/monzo/original/3X/8/6/866e6d84e8c756b19050fbe2ca0932858118614c.jpg': 'https://global.discourse-cdn.com/monzo/original/3X/8/6/866e6d84e8c756b19050fbe2ca0932858118614c.jpg',
    'https://i.pinimg.com/474x/0e/d0/0d/0ed00d2ea51a4a714536d9b5d103827d.jpg': 'https://i.pinimg.com/474x/0e/d0/0d/0ed00d2ea51a4a714536d9b5d103827d.jpg',
    'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQhTNDbz1dNOrf54nnTuJcFcYzlK5xng6T7fg&s': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQhTNDbz1dNOrf54nnTuJcFcYzlK5xng6T7fg&s',
    'https://img.magnific.com/premium-photo/memoji-handsome-indian-guy-man-white-background-emoji-cartoon-character_826801-7987.jpg?w=360': 'https://img.magnific.com/premium-photo/memoji-handsome-indian-guy-man-white-background-emoji-cartoon-character_826801-7987.jpg?w=360',
    'https://png.pngtree.com/png-vector/20251122/ourmid/pngtree-korean-idol-memoji-teenager-blonde-buzz-cut-smiling-with-sunglasses-png-image_18044448.webp': 'https://png.pngtree.com/png-vector/20251122/ourmid/pngtree-korean-idol-memoji-teenager-blonde-buzz-cut-smiling-with-sunglasses-png-image_18044448.webp',
    'https://i.pinimg.com/1200x/da/5d/c8/da5dc83e0e40e252ff46d4c9c3960fca.jpg': 'https://i.pinimg.com/1200x/da/5d/c8/da5dc83e0e40e252ff46d4c9c3960fca.jpg',
    'https://pbs.twimg.com/media/EEq9BVQWkAA_nvZ.jpg': 'https://pbs.twimg.com/media/EEq9BVQWkAA_nvZ.jpg',
    'https://ih1.redbubble.net/image.1994467948.4288/raf,360x360,075,t,fafafa:ca443f4786.jpg': 'https://ih1.redbubble.net/image.1994467948.4288/raf,360x360,075,t,fafafa:ca443f4786.jpg',
    'https://i.pinimg.com/564x/72/49/6f/72496f59f26075667d354fe9883ff8be.jpg': 'https://i.pinimg.com/564x/72/49/6f/72496f59f26075667d354fe9883ff8be.jpg',
    'https://i.pinimg.com/736x/92/e6/74/92e674f6195b6fbcda64f47d6aa274cc.jpg': 'https://i.pinimg.com/736x/92/e6/74/92e674f6195b6fbcda64f47d6aa274cc.jpg',
    'bg-theme-1': 'https://img.magnific.com/premium-vector/smooth-gradient-colors-from-teal-orange-with-black-background-grainy-white-background-ar-3_858664-35836.jpg?semt=ais_hybrid&w=740&q=80?w=150',
    'bg-theme-2': 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=800',
    'bg-theme-3': 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800',
    'bg-theme-4': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
    'btn-theme-1': 'https://images.unsplash.com/photo-1618005198143-e5283b519a7f?w=300',
    'btn-theme-2': 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=300',
    'btn-theme-3': 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=300',
    'btn-theme-4': 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=300'
};

function hexToRgb(hex) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length == 3) { c = [c[0], c[0], c[1], c[1], c[2], c[2]]; }
        c = '0x' + c.join('');
        return [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',');
    }
    return "255,115,0";
}


/* ==========================================================================
   3. FIRESTORE CUSTOM PROFILE REAL-TIME TRACKING & INACTIVITY WATCHER
   ========================================================================== */
const userDocRef = doc(db, "accounts", userId);
let inactivityTimeout = null;
const INACTIVITY_LIMIT = 2 * 60 * 60 * 1000; // 2 Hours in milliseconds
let localProfileNoteCache = "";
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function forceLogoutUser() {
    console.log("Session expired due to inactivity.");
    set(ref(rtdb, 'presence/' + userId), null);
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "login.html";
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(forceLogoutUser, INACTIVITY_LIMIT);
}

function startInactivityWatcher() {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    activityEvents.forEach(eventType => {
        window.addEventListener(eventType, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
}

// Global real-time state engine listener hook
onSnapshot(userDocRef, (snapshot) => {
    if (snapshot.exists()) {
        const data = snapshot.data();

        if (data.esoaDisabled === true) {
            alert("Your access to eSOA has been suspended by management.");
            forceLogoutUser();
            return;
        }

        currentUserName = data.customName || "Operator";
        currentUserAvatarRaw = data.avatarUrl || "avatar-m1";
        
        document.getElementById('userDisplayName').innerText = currentUserName.split(' ')[0];

        const matchedAvatar = premium3dAssets[currentUserAvatarRaw] || currentUserAvatarRaw || premium3dAssets['avatar-m1'];
        document.getElementById('userDisplayAvatar').src = matchedAvatar;

        if (data.fontFamily) document.body.style.fontFamily = data.fontFamily;

        if (data.bgMode === "image") {
            const bgImg = premium3dAssets[data.bgValue] || data.bgValue;
            document.body.style.backgroundImage = `url('${bgImg}')`;
            document.body.style.backgroundSize = "cover";
            document.body.style.backgroundAttachment = "fixed";
        } else if (data.bgValue) {
            document.body.style.backgroundImage = "none";
            document.body.style.backgroundColor = data.bgValue;
        }

        const magnetBtn = document.getElementById('magnetBtn');
        if (data.btnMode === "image") {
            const btnImg = premium3dAssets[data.btnValue] || data.btnValue;
            magnetBtn.style.backgroundImage = `url('${btnImg}')`;
            magnetBtn.style.backgroundColor = "transparent";
        } else if (data.btnValue) {
            magnetBtn.style.backgroundImage = "none";
            document.documentElement.style.setProperty('--primary', data.btnValue);
            const parsedRgb = hexToRgb(data.btnValue);
            document.documentElement.style.setProperty('--glass', `rgba(${parsedRgb}, 0.15)`);
        }

        // ─── SELF PROFILE STATUS NOTE RENDERING (FIRESTORE ENGINE) ───
        const selfBubble = document.getElementById('profile-status-bubble-node');
        if (selfBubble) selfBubble.remove();

        if (data.statusNoteText && data.statusNoteUpdatedAt) {
            const ageDelta = Date.now() - data.statusNoteUpdatedAt;

            if (ageDelta < TWELVE_HOURS_MS && data.statusNoteText.trim() !== "") {
                localProfileNoteCache = data.statusNoteText;

                const avatarNode = document.querySelector('.profile-avatar-node');
                const triggerNode = document.querySelector('.profile-note-action-trigger');
                
                if (avatarNode && triggerNode) {
                    const bubbleNode = document.createElement('div');
                    bubbleNode.className = 'profile-status-note-bubble';
                    bubbleNode.id = 'profile-status-bubble-node';
                    bubbleNode.innerText = localProfileNoteCache; 
                    
                    if (data.statusNoteColor) {
                        bubbleNode.style.borderColor = data.statusNoteColor;
                        bubbleNode.style.color = data.statusNoteColor;
                    }

                    avatarNode.parentNode.insertBefore(bubbleNode, triggerNode);
                }
            } else {
                localProfileNoteCache = "";
            }
        } else {
            localProfileNoteCache = "";
        }

        // ─── PRESENCE HANDSHAKE TO REALTIME DATABASE ───
        if (!document.hidden) {
            const presenceData = {
                uid: userId,
                name: currentUserName,
                avatar: currentUserAvatarRaw,
                timestamp: Date.now(),
                statusNote: {
                    text: data.statusNoteText || "",
                    color: data.statusNoteColor || "#e5e5e5",
                    updatedAt: data.statusNoteUpdatedAt || 0
                }
            };

            set(ref(rtdb, 'presence/' + userId), presenceData)
                .catch(err => console.error("Presence sync failed:", err));

            updateDoc(userDocRef, { isOnline: true });
        }
    } else {
        forceLogoutUser();
    }
});

// Start checking interaction updates natively
startInactivityWatcher();


/* ==========================================================================
   TYPING INDICATOR HUB LISTENER
   ========================================================================== */
const typingHooks = {};
const typingUIFallbackTimeouts = {}; 

function bindTypingIndicator(partnerId, displayName) {
    if (typingHooks[partnerId]) return;

    const channelSessionKey =
        userId < partnerId
            ? `${userId}_${partnerId}`
            : `${partnerId}_${userId}`;

    const typingRef = ref(
        rtdb,
        `typing/${channelSessionKey}/${partnerId}`
    );

    typingHooks[partnerId] = onValue(typingRef, (snapshot) => {
        const peerNode = document.getElementById(`peer-node-${partnerId}`);
        if (!peerNode) return;

        const tag = peerNode.querySelector('.peer-name-hover');
        if (!tag) return;

        if (typingUIFallbackTimeouts[partnerId]) {
            clearTimeout(typingUIFallbackTimeouts[partnerId]);
            delete typingUIFallbackTimeouts[partnerId];
        }

        if (snapshot.val() === true) {
            tag.innerHTML = `
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            `;
            tag.dataset.typing = "true";

            typingUIFallbackTimeouts[partnerId] = setTimeout(() => {
                tag.textContent = displayName;
                tag.dataset.typing = "false";
                delete typingUIFallbackTimeouts[partnerId];
            }, 20000); 

        } else {
            tag.textContent = displayName;
            tag.dataset.typing = "false";
        }
    });
}


/* ==========================================================================
   4. PEER HUB & PRESENCE SYNCHRONIZATION (REALTIME DB) - FIRESTORE INTEGRATED
   ========================================================================== */
const hub = document.getElementById('peerActiveHub');
hub.innerHTML = '';

// GC UI rendering removed. Background listener retained to keep functions working.
bindBackgroundGcListener();

// --- STATUS NOTES CONFIGURATION & PERSISTENCE ---
(() => {
    const avatarNode = document.querySelector('.profile-avatar-node');
    if (!avatarNode) return;

    const actionTrigger = document.createElement('div');
    actionTrigger.className = 'profile-note-action-trigger';
    actionTrigger.innerText = '＋';
    avatarNode.parentNode.insertBefore(actionTrigger, avatarNode);

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.id = 'status-note-custom-modal';
    
    modalOverlay.innerHTML = `
        <div class="modal-content">
            <div class="input-group">
                <label>UPDATE STATUS NOTE</label>
                <input type="text" id="status-modal-field" placeholder="..." maxlength="10" autocomplete="off">
                <div class="modal-char-counter" id="status-modal-counter">0 / 10</div>
            </div>
            <div class="modal-copy-zone" id="status-modal-save-btn">SAVE STATUS</div>
            <button class="modal-close-btn" id="status-modal-close-btn">CANCEL</button>
        </div>
    `;
    document.body.appendChild(modalOverlay);

    const modalInputField = document.getElementById('status-modal-field');
    const modalCharCounter = document.getElementById('status-modal-counter');
    const modalSaveBtn = document.getElementById('status-modal-save-btn');
    const modalCloseBtn = document.getElementById('status-modal-close-btn');

    actionTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        modalInputField.value = localProfileNoteCache;
        modalCharCounter.innerText = `${localProfileNoteCache.length} / 10`;
        modalOverlay.classList.add('active');
        setTimeout(() => modalInputField.focus(), 50);
    });

    modalInputField.addEventListener('input', () => {
        if (modalInputField.value.length > 10) {
            modalInputField.value = modalInputField.value.substring(0, 10);
        }
        modalCharCounter.innerText = `${modalInputField.value.length} / 10`;
    });

    const closeModal = () => modalOverlay.classList.remove('active');
    modalCloseBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

    modalSaveBtn.addEventListener('click', () => {
        const cleanInput = modalInputField.value.trim().substring(0, 10);
        const activeLayoutColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#e5e5e5';
        
        if (cleanInput === "") {
            updateDoc(userDocRef, {
                statusNoteText: "",
                statusNoteColor: "",
                statusNoteUpdatedAt: null
            }).then(() => closeModal());
        } else {
            updateDoc(userDocRef, {
                statusNoteText: cleanInput,
                statusNoteColor: activeLayoutColor,
                statusNoteUpdatedAt: Date.now()
            })
            .then(() => {
                closeModal();
            })
            .catch(err => console.error("Could not sync status changes to Firestore:", err));
        }
    });
})();

const presenceRef = ref(rtdb, 'presence');
onValue(presenceRef, (snapshot) => {
    const users = snapshot.val() || {};
    const NOW = Date.now();

    const existingNodes = hub.querySelectorAll('.peer-wrapper:not(#gc-hub-node)');
    existingNodes.forEach(node => {
        const nodeUid = node.id.replace('peer-node-', '');

        if (!users[nodeUid] || nodeUid === userId) {
            node.classList.add('is-offline');
            node.style.order = "1";
        }
    });

    Object.keys(users).forEach(uid => {
        if (uid === userId) return;

        const peer = users[uid];
        if (!peer || !peer.uid) return;

        const singleWordLabel = peer.name ? peer.name.split(' ')[0] : "Operator";
        const cleanAvatarSrc = premium3dAssets[peer.avatar] || peer.avatar || premium3dAssets['avatar-m1'];

        let peerContainer = document.getElementById(`peer-node-${peer.uid}`);

        if (!peerContainer) {
            peerContainer = document.createElement('div');
            peerContainer.className = 'peer-wrapper';
            peerContainer.id = `peer-node-${peer.uid}`;

            const imgNode = document.createElement('img');
            imgNode.className = 'peer-avatar-bubble';
            imgNode.src = cleanAvatarSrc;
            imgNode.onclick = () => initTransientChatChannel(peer.uid, singleWordLabel);

            const dotNode = document.createElement('div');
            dotNode.className = 'peer-notif-dot';

            const nameTag = document.createElement('div');
            nameTag.className = 'peer-name-hover';
            nameTag.innerText = singleWordLabel;
            nameTag.dataset.typing = "false";

            peerContainer.appendChild(imgNode);
            peerContainer.appendChild(dotNode);
            peerContainer.appendChild(nameTag);
            hub.appendChild(peerContainer);

            bindBackgroundNotifListener(peer.uid);
            bindTypingIndicator(peer.uid, singleWordLabel);
        } else {
            const img = peerContainer.querySelector('.peer-avatar-bubble');
            if (img) img.src = cleanAvatarSrc;

            const tag = peerContainer.querySelector('.peer-name-hover');
            if (tag && tag.dataset.typing !== "true") {
                tag.innerText = singleWordLabel;
            }
        }

        const oldNote = peerContainer.querySelector('.peer-status-note');
        if (oldNote) oldNote.remove();

        if (peer.statusNote && peer.statusNote.updatedAt) {
            const timeElapsed = NOW - peer.statusNote.updatedAt;

            if (timeElapsed < TWELVE_HOURS_MS && peer.statusNote.text.trim() !== "") {
                const noteNode = document.createElement('div');
                noteNode.className = 'peer-status-note';
                noteNode.innerText = peer.statusNote.text; 
                
                if (peer.statusNote.color) {
                    noteNode.style.color = peer.statusNote.color;
                    noteNode.style.borderColor = peer.statusNote.color;
                }
                peerContainer.appendChild(noteNode);
            }
        }

        peerContainer.classList.remove('is-offline');
        peerContainer.style.order = "0";
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
});

/* ==========================================================================
   4. PEER HUB & PRESENCE SYNCHRONIZATION (REALTIME DB) - PERSISTENT
   ========================================================================== 
const hub = document.getElementById('peerActiveHub');
hub.innerHTML = '';

const gcWrapper = document.createElement('div');
gcWrapper.className = 'peer-wrapper';
gcWrapper.id = 'gc-hub-node';

const gcBubble = document.createElement('div');
gcBubble.className = 'group-chat-bubble';
gcBubble.innerHTML = '<i data-lucide="users" style="width:18px;height:18px;"></i>';
gcBubble.onclick = () => initGroupChatChannel();

const gcDotNode = document.createElement('div');
gcDotNode.className = 'peer-notif-dot';
gcDotNode.id = 'gc-notif-dot';

const gcNameTag = document.createElement('div');
gcNameTag.className = 'peer-name-hover';
gcNameTag.innerText = "GC";

gcWrapper.appendChild(gcBubble);
gcWrapper.appendChild(gcDotNode);
gcWrapper.appendChild(gcNameTag);
hub.appendChild(gcWrapper);

bindBackgroundGcListener();

// --- STATUS NOTES CONFIGURATION & PERSISTENCE ---
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
let localProfileNoteCache = "";

// Dynamic layout generation for the status note modal window context
(() => {
    const avatarNode = document.querySelector('.profile-avatar-node');
    if (!avatarNode) return;

    // Append the tiny plus action element on top of your profile avatar
    const actionTrigger = document.createElement('div');
    actionTrigger.className = 'profile-note-action-trigger';
    actionTrigger.innerText = '＋';
    avatarNode.parentNode.insertBefore(actionTrigger, avatarNode);

    // Create custom structural modal elements natively inside the document context
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.id = 'status-note-custom-modal';
    
    modalOverlay.innerHTML = `
        <div class="modal-content">
            <div class="input-group">
                <label>UPDATE STATUS NOTE</label>
                <input type="text" id="status-modal-field" placeholder="..." maxlength="10" autocomplete="off">
                <div class="modal-char-counter" id="status-modal-counter">0 / 10</div>
            </div>
            <div class="modal-copy-zone" id="status-modal-save-btn">SAVE STATUS</div>
            <button class="modal-close-btn" id="status-modal-close-btn">CANCEL</button>
        </div>
    `;
    document.body.appendChild(modalOverlay);

    const modalInputField = document.getElementById('status-modal-field');
    const modalCharCounter = document.getElementById('status-modal-counter');
    const modalSaveBtn = document.getElementById('status-modal-save-btn');
    const modalCloseBtn = document.getElementById('status-modal-close-btn');

    // Display modal workflow triggers safely
    actionTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        modalInputField.value = localProfileNoteCache;
        modalCharCounter.innerText = `${localProfileNoteCache.length} / 10`;
        modalOverlay.classList.add('active');
        setTimeout(() => modalInputField.focus(), 50);
    });

    // Realtime constraint counter adjustments tracking keystrokes up to 10 max
    modalInputField.addEventListener('input', () => {
        if (modalInputField.value.length > 10) {
            modalInputField.value = modalInputField.value.substring(0, 10);
        }
        modalCharCounter.innerText = `${modalInputField.value.length} / 10`;
    });

    // Close functionality tracking
    const closeModal = () => modalOverlay.classList.remove('active');
    modalCloseBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

    // Submit transactions directly to RTDB under the current user node layout to guarantee persistence
    modalSaveBtn.addEventListener('click', () => {
        const cleanInput = modalInputField.value.trim().substring(0, 10);
        const userNoteRef = ref(rtdb, `presence/${userId}/statusNote`);
        
        // Dynamic look-up of local theme color definitions to pack alongside data packets
        const activeLayoutColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#e5e5e5';
        
        if (cleanInput === "") {
            // If user cleared the input, remove it from DB cleanly
            set(userNoteRef, null).then(() => closeModal());
        } else {
            set(userNoteRef, {
                text: cleanInput,
                color: activeLayoutColor,
                updatedAt: Date.now()
            })
            .then(() => {
                closeModal();
            })
            .catch(err => console.error("Could not sync status changes accurately:", err));
        }
    });
})();

const presenceRef = ref(rtdb, 'presence');
onValue(presenceRef, (snapshot) => {
    const users = snapshot.val() || {};
    const NOW = Date.now();

    // Clear personal status bubble before processing iterations to prevent duplicates
    const selfBubble = document.getElementById('profile-status-bubble-node');
    if (selfBubble) selfBubble.remove();

    // Mark absent users offline
    const existingNodes = hub.querySelectorAll('.peer-wrapper:not(#gc-hub-node)');
    existingNodes.forEach(node => {
        const nodeUid = node.id.replace('peer-node-', '');

        if (!users[nodeUid] || nodeUid === userId) {
            node.classList.add('is-offline');
            node.style.order = "1";
        }
    });

    // Realtime peer synchronization
    Object.keys(users).forEach(uid => {
        const peer = users[uid];
        if (!peer || !peer.uid) return;

        // --- SELF PROFILE RENDERING SYSTEM (PERSISTENT & 12HR RETENTION) ---
        if (uid === userId) {
            if (peer.statusNote && peer.statusNote.updatedAt) {
                const ageDelta = NOW - peer.statusNote.updatedAt;
                
                // If past 12 hours, treat it as expired and clear local cache
                if (ageDelta >= TWELVE_HOURS_MS) {
                    localProfileNoteCache = "";
                    // Optional: Clean up expired note from database automatically
                    const userNoteRef = ref(rtdb, `presence/${userId}/statusNote`);
                    set(userNoteRef, null);
                    return;
                }

                localProfileNoteCache = peer.statusNote.text || "";

                if (localProfileNoteCache.trim() !== "") {
                    const avatarNode = document.querySelector('.profile-avatar-node');
                    const triggerNode = document.querySelector('.profile-note-action-trigger');
                    if (avatarNode && triggerNode) {
                        const bubbleNode = document.createElement('div');
                        bubbleNode.className = 'profile-status-note-bubble';
                        bubbleNode.id = 'profile-status-bubble-node';
                        bubbleNode.innerText = localProfileNoteCache; 
                        
                        if (peer.statusNote.color) {
                            bubbleNode.style.borderColor = peer.statusNote.color;
                            bubbleNode.style.color = peer.statusNote.color;
                        }

                        // Appends on top of the trigger node, stacking directly above your profile view
                        avatarNode.parentNode.insertBefore(bubbleNode, triggerNode);
                    }
                }
            } else {
                localProfileNoteCache = "";
            }
            return; 
        }

        const singleWordLabel =
            peer.name
                ? peer.name.split(' ')[0]
                : "Operator";

        const cleanAvatarSrc =
            premium3dAssets[peer.avatar] ||
            peer.avatar ||
            premium3dAssets['avatar-m1'];

        let peerContainer =
            document.getElementById(`peer-node-${peer.uid}`);

        if (!peerContainer) {
            peerContainer = document.createElement('div');
            peerContainer.className = 'peer-wrapper';
            peerContainer.id = `peer-node-${peer.uid}`;

            const imgNode = document.createElement('img');
            imgNode.className = 'peer-avatar-bubble';
            imgNode.src = cleanAvatarSrc;
            imgNode.onclick = () =>
                initTransientChatChannel(
                    peer.uid,
                    singleWordLabel
                );

            const dotNode = document.createElement('div');
            dotNode.className = 'peer-notif-dot';

            const nameTag = document.createElement('div');
            nameTag.className = 'peer-name-hover';
            nameTag.innerText = singleWordLabel;
            nameTag.dataset.typing = "false";

            peerContainer.appendChild(imgNode);
            peerContainer.appendChild(dotNode);
            peerContainer.appendChild(nameTag);

            hub.appendChild(peerContainer);

            bindBackgroundNotifListener(peer.uid);

            // Typing indicator
            bindTypingIndicator(
                peer.uid,
                singleWordLabel
            );

        } else {
            const img =
                peerContainer.querySelector('.peer-avatar-bubble');

            if (img) {
                img.src = cleanAvatarSrc;
            }

            const tag =
                peerContainer.querySelector('.peer-name-hover');

            if (tag && tag.dataset.typing !== "true") {
                tag.innerText = singleWordLabel;
            }
        }

        // --- INJECT PEER NOTES UPSTAIRS (TOP PLACEMENT - 12HR LIMIT) ---
        const oldNote = peerContainer.querySelector('.peer-status-note');
        if (oldNote) oldNote.remove();

        if (peer.statusNote && peer.statusNote.updatedAt) {
            const timeElapsed = NOW - peer.statusNote.updatedAt;

            if (timeElapsed < TWELVE_HOURS_MS && peer.statusNote.text.trim() !== "") {
                const noteNode = document.createElement('div');
                noteNode.className = 'peer-status-note';
                noteNode.innerText = peer.statusNote.text; 
                
                if (peer.statusNote.color) {
                    noteNode.style.color = peer.statusNote.color;
                    noteNode.style.borderColor = peer.statusNote.color;
                }

                peerContainer.appendChild(noteNode);
            }
        }

        peerContainer.classList.remove('is-offline');
        peerContainer.style.order = "0";
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
});
/* ==========================================================================
   5. BACKGROUND CHAT NOTIFICATION HOOKS
   ========================================================================== */
function bindBackgroundNotifListener(partnerId) {
    if (mappedRouteTrackingHooks[partnerId]) return;
    const channelSessionKey = userId < partnerId ? `${userId}_${partnerId}` : `${partnerId}_${userId}`;
    const chatRouteRef = ref(rtdb, `sessions/${channelSessionKey}`);

    let initialSyncComplete = false;
    onValue(chatRouteRef, () => { initialSyncComplete = true; }, { onlyOnce: true });                                    
    
    const hook = onChildAdded(chatRouteRef, (childSnap) => {
        if (!initialSyncComplete) return;
        if (childSnap.exists()) {
            const msg = childSnap.val();
            if (msg.sender === partnerId && selectedActiveChatPartnerId !== partnerId) {
                const peerContainer = document.getElementById(`peer-node-${partnerId}`);
                if (peerContainer) peerContainer.classList.add('has-unread');
            }
        }
    });
    mappedRouteTrackingHooks[partnerId] = hook;

    onValue(chatRouteRef, (snapshot) => {
        if (!initialSyncComplete) return;
        if (snapshot.exists() && selectedActiveChatPartnerId !== partnerId) {
            const messages = snapshot.val();
            Object.keys(messages).forEach(mId => {
                const m = messages[mId];
                if (m.reactions) {
                    Object.keys(m.reactions).forEach(uId => {
                        if (uId !== userId) {
                            const peerContainer = document.getElementById(`peer-node-${partnerId}`);
                            if (peerContainer) peerContainer.classList.add('has-unread');
                        }
                    });
                }
            });
        }
    });
}

function bindBackgroundGcListener() {
    if (backgroundGcTrackingHook) return;
    const gcRouteRef = ref(rtdb, `group_chat/messages`);

    let initialSyncComplete = false;
    onValue(gcRouteRef, () => { initialSyncComplete = true; }, { onlyOnce: true });

    backgroundGcTrackingHook = onChildAdded(gcRouteRef, (childSnap) => {
        if (!initialSyncComplete) return;
        if (childSnap.exists()) {
            const msg = childSnap.val();
            if (msg.sender !== userId && selectedActiveChatPartnerId !== "BARANGAY_GC") {
                const gcContainer = document.getElementById('gc-hub-node');
                if (gcContainer) gcContainer.classList.add('has-unread');
            }
        }
    });

    onValue(gcRouteRef, (snapshot) => {
        if (!initialSyncComplete) return;
        if (snapshot.exists() && selectedActiveChatPartnerId !== "BARANGAY_GC") {
            const messages = snapshot.val();
            Object.keys(messages).forEach(mId => {
                const m = messages[mId];
                if (m.reactions) {
                    Object.keys(m.reactions).forEach(uId => {
                        if (uId !== userId) {
                            const gcContainer = document.getElementById('gc-hub-node');
                            if (gcContainer) gcContainer.classList.add('has-unread');
                        }
                    });
                }
            });
        }
    });
}


/* ==========================================================================
   6. REALTIME REACTION-ENABLED CHAT PLATFORM LOGIC WITH EMBEDDED EMOJI PICKER
   ========================================================================== */
let activeReplyPayload = null; 

function formatMessageTimestamp(timestamp) {
    if (!timestamp) return '';
    const msgDate = new Date(timestamp);
    const today = new Date();

    const isToday = msgDate.getDate() === today.getDate() &&
                    msgDate.getMonth() === today.getMonth() &&
                    msgDate.getFullYear() === today.getFullYear();

    if (isToday) {
        return msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        return msgDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
               msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

function resolveUserRealName(uid, fallbackDataName) {
    if (uid === userId) return "You";
    if (fallbackDataName) return fallbackDataName.split(' ')[0];
    
    const peerNode = document.getElementById(`peer-node-${uid}`);
    if (peerNode && peerNode.querySelector('.peer-name-hover')) {
        return peerNode.querySelector('.peer-name-hover').innerText.split(' ')[0];
    }
    return "User " + uid.substring(0, 5);
}

function initGroupChatChannel() {
    isGroupChat = true;
    selectedActiveChatPartnerId = "BARANGAY_GC";
    document.getElementById('chatTargetName').innerText = `Group Chat`;
    document.getElementById('chatScroller').innerHTML = '';
    document.getElementById('chatDock').style.display = 'flex';
    clearActiveReplyRow();

    const gcContainer = document.getElementById('gc-hub-node');
    if (gcContainer) gcContainer.classList.remove('has-unread');

    cleanupTransientListeners();

    const chatRouteRef = ref(rtdb, `group_chat/messages`);
    transientChatListenerRemoveHook = onChildAdded(chatRouteRef, (childSnap) => {
        if (childSnap.exists()) {
            const msg = childSnap.val();
            appendBubbleToScroller(msg, childSnap.key, msg.sender === userId ? 'outgoing' : 'incoming');
        }
    });
}

function initTransientChatChannel(partnerId, partnerName) {
    isGroupChat = false;
    selectedActiveChatPartnerId = partnerId;
    clearActiveReplyRow();
    
    const cleanName = partnerName ? partnerName.split(' ')[0] : "Operator";
    document.getElementById('chatTargetName').innerText = `${cleanName}`;
    document.getElementById('chatScroller').innerHTML = '';
    document.getElementById('chatDock').style.display = 'flex';

    const peerContainer = document.getElementById(`peer-node-${partnerId}`);
    if (peerContainer) {
        peerContainer.classList.remove('has-unread');
    }

    cleanupTransientListeners();

    const channelSessionKey = userId < partnerId ? `${userId}_${partnerId}` : `${partnerId}_${userId}`;
    const input = document.getElementById('chatMsgInput');

    input.oninput = () => {
        const typingRef = ref(rtdb, `typing/${channelSessionKey}/${userId}`);
        set(typingRef, true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => { set(typingRef, false); }, 1500);
    };
    
    const chatRouteRef = ref(rtdb, `sessions/${channelSessionKey}`);
    transientChatListenerRemoveHook = onChildAdded(chatRouteRef, (childSnap) => {
        if (childSnap.exists()) {
            const msg = childSnap.val();
            appendBubbleToScroller(msg, childSnap.key, msg.sender === userId ? 'outgoing' : 'incoming');
        }
    });
}

function cleanupTransientListeners() {
    if (transientChatListenerRemoveHook) { transientChatListenerRemoveHook(); transientChatListenerRemoveHook = null; }
}

window.sendChatPayload = function () {
    const input = document.getElementById('chatMsgInput');
    const text = input.value.trim();
    if (!text || !selectedActiveChatPartnerId) return;

    const payload = {
        sender: userId,
        text: text,
        timestamp: Date.now()
    };

    if (isGroupChat) {
        payload.senderName = currentUserName;
        payload.senderAvatar = currentUserAvatarRaw;
    }

    if (activeReplyPayload) {
        payload.repliedTo = activeReplyPayload;
    }

    let chatRouteRef = isGroupChat 
        ? ref(rtdb, `group_chat/messages`) 
        : ref(rtdb, `sessions/${userId < selectedActiveChatPartnerId ? `${userId}_${selectedActiveChatPartnerId}` : `${selectedActiveChatPartnerId}_${userId}`}`);

    const newMsgRef = push(chatRouteRef);
    set(newMsgRef, payload);

    input.value = '';
    clearActiveReplyRow();

    if (!isGroupChat) {
        const channelSessionKey = userId < selectedActiveChatPartnerId ? `${userId}_${selectedActiveChatPartnerId}` : `${selectedActiveChatPartnerId}_${userId}`;
        set(ref(rtdb, `typing/${channelSessionKey}/${userId}`), false);
    }
};

function appendBubbleToScroller(msg, msgId, direction) {
    const view = document.getElementById('chatScroller');                                    
    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${direction}`;
    wrapper.id = `msg-wrap-${msgId}`;

    const metaRow = document.createElement('div');
    metaRow.className = 'msg-meta-row';

    if (isGroupChat) {
        const avatarSrc = premium3dAssets[msg.senderAvatar] || msg.senderAvatar || premium3dAssets['avatar-m1'];
        const avatarNode = document.createElement('img');
        avatarNode.className = 'msg-gc-avatar';
        avatarNode.src = avatarSrc;

        const authorTag = document.createElement('div');
        authorTag.className = 'msg-author-tag';
        authorTag.innerText = resolveUserRealName(msg.sender, msg.senderName);

        const timeTag = document.createElement('div');
        timeTag.className = 'msg-time-tag';
        timeTag.innerText = formatMessageTimestamp(msg.timestamp);

        metaRow.appendChild(avatarNode);
        metaRow.appendChild(authorTag);
        metaRow.appendChild(timeTag);
        wrapper.appendChild(metaRow);
    } else if (msg.timestamp) {
        const timeTag = document.createElement('div');
        timeTag.className = 'msg-time-tag';
        timeTag.innerText = formatMessageTimestamp(msg.timestamp);
        metaRow.appendChild(timeTag);
        wrapper.appendChild(metaRow);
    }

    if (msg.repliedTo) {
        const ghostPreview = document.createElement('div');
        ghostPreview.className = 'msg-ghost-reply-preview';
        const senderLabel = resolveUserRealName(msg.repliedTo.sender, msg.repliedTo.senderName);
        ghostPreview.innerHTML = `<strong>${senderLabel}</strong>: ${msg.repliedTo.text}`;
        wrapper.appendChild(ghostPreview);
    }

    const bbl = document.createElement('div');
    bbl.className = `msg-bubble ${direction}`;
    bbl.innerText = msg.text;

    if (msg.isDeleted) bbl.classList.add('msg-deleted-state');

    bbl.onclick = (e) => {
        e.stopPropagation();
        if (bbl.classList.contains('msg-deleted-state')) return;
        toggleReactionPicker(msgId, wrapper, msg);
    };

    wrapper.appendChild(bbl);

    const rxContainer = document.createElement('div');
    rxContainer.className = 'msg-reaction-container';
    rxContainer.id = `rx-container-${msgId}`;
    rxContainer.style.display = 'none';
    wrapper.appendChild(rxContainer);

    view.appendChild(wrapper);
    view.scrollTop = view.scrollHeight;

    let msgPath = isGroupChat ? `group_chat/messages/${msgId}` : `sessions/${userId < selectedActiveChatPartnerId ? `${userId}_${selectedActiveChatPartnerId}` : `${selectedActiveChatPartnerId}_${userId}`}/${msgId}`;
    onValue(ref(rtdb, msgPath), (snapshot) => {
        if (!snapshot.exists()) {
            wrapper.remove();
            return;
        }
        const updatedMsg = snapshot.val();
        bbl.innerText = updatedMsg.text;
        
        if (updatedMsg.isDeleted) {
            bbl.classList.add('msg-deleted-state');
            bbl.style.fontStyle = 'italic';
            if (wrapper.querySelector('.msg-ghost-reply-preview')) {
                wrapper.querySelector('.msg-ghost-reply-preview').remove();
            }
        } else if (updatedMsg.edited) {
            bbl.style.fontStyle = 'italic';
        } else {
            bbl.style.fontStyle = 'normal';
        }
    });

    syncReactionsDisplay(msgId, msg.senderName);
}

function toggleReactionPicker(msgId, wrapper, originalMsg) {
    const activeTray = document.getElementById(`tray-${msgId}`);
    if (activeTray) {
        activeTray.remove();
        return;
    }

    document.querySelectorAll('.reaction-picker-tray').forEach(el => el.remove());
    document.querySelectorAll('.native-emoji-matrix-panel').forEach(el => el.remove());

    const tray = document.createElement('div');
    tray.className = 'reaction-picker-tray';
    tray.id = `tray-${msgId}`;

    const emojis = ['😂', '😢', '😡', '🖕'];
    emojis.forEach(emoji => {
        const opt = document.createElement('div');
        opt.className = 'reaction-option';
        opt.innerText = emoji;
        opt.onclick = (e) => {
            e.stopPropagation();
            submitReaction(msgId, emoji);
            tray.remove();
        };
        tray.appendChild(opt);
    });

    const plusOpt = document.createElement('div');
    plusOpt.className = 'reaction-option tray-plus-trigger';
    plusOpt.innerText = '➕';
    plusOpt.onclick = (e) => {
        e.stopPropagation();
        toggleNativeEmojiPanel(msgId, wrapper, tray);
    };
    tray.appendChild(plusOpt);

    const replyBtn = document.createElement('button');
    replyBtn.className = 'msg-action-btn reply-btn';
    replyBtn.innerText = '↩️ Reply';
    replyBtn.onclick = (e) => {
        e.stopPropagation();
        stageMessageForReply(originalMsg);
        tray.remove();
    };
    tray.appendChild(replyBtn);

    if (wrapper.classList.contains('outgoing')) {
        const editBtn = document.createElement('button');
        editBtn.className = 'msg-action-btn edit-btn';
        editBtn.innerText = '✏️ Edit';
        editBtn.onclick = (e) => {
            e.stopPropagation();
            const minutesElapsed = (Date.now() - originalMsg.timestamp) / 1000 / 60;
            if (minutesElapsed > 5) {
                alert("You can only edit messages within 5 minutes.");
                tray.remove();
                return;
            }

            const currentText = wrapper.querySelector('.msg-bubble').innerText;
            const newText = prompt("Modify message:", currentText);
            if (newText !== null && newText.trim() !== "") {
                let msgPath = isGroupChat ? `group_chat/messages/${msgId}` : `sessions/${userId < selectedActiveChatPartnerId ? `${userId}_${selectedActiveChatPartnerId}` : `${selectedActiveChatPartnerId}_${userId}`}/${msgId}`;
                set(ref(rtdb, `${msgPath}/text`), newText.trim());
                set(ref(rtdb, `${msgPath}/edited`), true);
            }
            tray.remove();
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'msg-action-btn delete-btn';
        deleteBtn.innerText = '🗑️ Delete';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm("Delete message contents?")) {
                let msgPath = isGroupChat ? `group_chat/messages/${msgId}` : `sessions/${userId < selectedActiveChatPartnerId ? `${userId}_${selectedActiveChatPartnerId}` : `${selectedActiveChatPartnerId}_${userId}`}/${msgId}`;
                set(ref(rtdb, msgPath), {
                    sender: userId,
                    text: "Message deleted",
                    isDeleted: true,
                    timestamp: originalMsg.timestamp || Date.now()
                });
            }
            tray.remove();
        };

        tray.appendChild(editBtn);
        tray.appendChild(deleteBtn);
    }

    wrapper.appendChild(tray);
}

// 🔥 Updated: Spawns the native emoji panel with auto-close click handler
function toggleNativeEmojiPanel(msgId, wrapper, tray) {
    const activePanel = document.getElementById(`emoji-panel-${msgId}`);
    if (activePanel) {
        activePanel.remove();
        return;
    }

    const panel = document.createElement('div');
    panel.className = 'native-emoji-matrix-panel';
    panel.id = `emoji-panel-${msgId}`;

    const emojiMatrix = [
        '👍','👎','❤️','🔥','👏','🎉','✨','🙏',
        '😍','🥳','😎','🤔','😭','😱','🤫','🥱',
        '💯','💩','👀','🗣️','🔥','🚀','👑','✔️'
    ];

    emojiMatrix.forEach(emoji => {
        const item = document.createElement('button');
        item.className = 'matrix-emoji-node';
        item.innerText = emoji;
        item.onclick = (e) => {
            e.stopPropagation();
            submitReaction(msgId, emoji);
            panel.remove();
            tray.remove();
        };
        panel.appendChild(item);
    });

    wrapper.appendChild(panel);

    // 🔥 Added: Global window click detection listener to dismiss panel on click-away
    const closePanelHandler = (event) => {
        if (!panel.contains(event.target) && !tray.contains(event.target)) {
            panel.remove();
            document.removeEventListener('click', closePanelHandler);
        }
    };
    
    // Defer execution slightly to prevent immediate intercept of the current activation click event
    setTimeout(() => {
        document.addEventListener('click', closePanelHandler);
    }, 0);
}

function stageMessageForReply(msg) {
    activeReplyPayload = {
        sender: msg.sender,
        text: msg.text,
        senderName: msg.senderName || null
    };

    let activeBanner = document.getElementById('chatReplyTrackIndicator');
    if (!activeBanner) {
        activeBanner = document.createElement('div');
        activeBanner.id = 'chatReplyTrackIndicator';
        const panelDock = document.getElementById('chatDock');
        const inputRow = panelDock.querySelector('.chat-input-row');
        panelDock.insertBefore(activeBanner, inputRow);
    }

    const clearName = resolveUserRealName(msg.sender, msg.senderName);
    activeBanner.innerHTML = `
        <div class="reply-track-contents">
            <span>Replying to <strong>${clearName}</strong></span>
            <p>${msg.text}</p>
        </div>
        <button onclick="clearActiveReplyRow()">✕</button>
    `;
    document.getElementById('chatMsgInput').focus();
}

window.clearActiveReplyRow = function() {
    activeReplyPayload = null;
    const activeBanner = document.getElementById('chatReplyTrackIndicator');
    if (activeBanner) activeBanner.remove();
};

function submitReaction(msgId, emoji) {
    let path = isGroupChat 
        ? `group_chat/messages/${msgId}/reactions/${userId}`
        : `sessions/${userId < selectedActiveChatPartnerId ? `${userId}_${selectedActiveChatPartnerId}` : `${selectedActiveChatPartnerId}_${userId}`}/${msgId}/reactions/${userId}`;

    const rxRef = ref(rtdb, path);
    onValue(rxRef, (snapshot) => {
        if (snapshot.exists() && snapshot.val() === emoji) {
            remove(rxRef);
        } else {
            set(rxRef, emoji);
        }
    }, { onlyOnce: true });
}

function syncReactionsDisplay(msgId, fallbackName) {
    let basePath = isGroupChat 
        ? `group_chat/messages/${msgId}`
        : `sessions/${userId < selectedActiveChatPartnerId ? `${userId}_${selectedActiveChatPartnerId}` : `${selectedActiveChatPartnerId}_${userId}`}/${msgId}`;

    onValue(ref(rtdb, basePath), (msgSnapshot) => {
        const container = document.getElementById(`rx-container-${msgId}`);
        if (!container) return;

        container.innerHTML = '';
        if (!msgSnapshot.exists()) {
            container.style.display = 'none';
            return;
        }

        const msgData = msgSnapshot.val();
        if (msgData.isDeleted) {
            container.style.display = 'none';
            return;
        }

        const reactionData = msgData.reactions || {};
        const summary = {};
        
        Object.keys(reactionData).forEach(uid => {
            const emo = reactionData[uid];
            if (!summary[emo]) summary[emo] = { count: 0, userVoted: false, voters: [] };
            summary[emo].count++;
            
            const voterRealName = resolveUserRealName(uid, uid === msgData.sender ? fallbackName : null);
            summary[emo].voters.push(voterRealName);
            
            if (uid === userId) summary[emo].userVoted = true;
        });

        Object.keys(summary).forEach(emo => {
            const pill = document.createElement('div');
            pill.className = `reaction-pill ${summary[emo].userVoted ? 'user-voted' : ''}`;
            pill.title = summary[emo].voters.join(', ');

            if (isGroupChat) {
                pill.innerHTML = `<span>${emo}</span><span class="reaction-count">${summary[emo].count}</span>`;
            } else {
                pill.innerHTML = `<span>${emo}</span>`;
            }                                                                                    
            pill.onclick = (e) => {
                e.stopPropagation();
                submitReaction(msgId, emo);
            };
            container.appendChild(pill);
        });

        container.style.display = 'flex';
    });
}

window.closeChatSession = function () {
    if (!isGroupChat && selectedActiveChatPartnerId) {
        const channelSessionKey = userId < selectedActiveChatPartnerId ? `${userId}_${selectedActiveChatPartnerId}` : `${selectedActiveChatPartnerId}_${userId}`;
        set(ref(rtdb, `typing/${channelSessionKey}/${userId}`), false);
    }
    clearActiveReplyRow();
    document.getElementById('chatDock').style.display = 'none';
    cleanupTransientListeners();
    selectedActiveChatPartnerId = null;
};
/* ==========================================================================
   7. CORE UTILITY METRICS (DISCOUNTS, LIST TRAY POPOVERS)
   ========================================================================== */
let textTimeout; 
let currentFocusedIndex = 0;
let allRows = []; 
let highlighter = null; 
let container = null; 
let magnetBtn = null;

const extraItems = { 
    lab: ["CHEMISTRY: TRIGLYCERIDES", "CHEMISTRY: HDL", "CHEMISTRY: DIRECT LDL"], 
    supply: ["NEBULIZING KIT COMPLETE SET W/T-PIECE & MOUTHPIECE", "NEBULIZING KIT WITH MASK (PEDIA)", "OXYGEN CANNULA (ADULT)", "OXYGEN CANNULA (PEDIA)", "SYRINGE DISPOSABLE 1 CC", "SYRINGE DISPOSABLE ( 5.0 CC)"], 
    others: ["HM-AMLODIPINE", "HM-OMEPRAZOLE", "HM-COLCHICINE", "HM-SAMBONG", "HM-CEFIXIME", "HM-ACETYLCYSTEINE", "MEDICAL OXYGEN", "HBsAg", "DENGUE DUO", "SERUM ELECTROLYTES", "FECALYSIS", "H-PYLORI", "ECG", "TYPHIDOT", "TSH", "T3", "T4", "FT3", "FT4"] 
};

// Initialization Execution Lifecycles
window.addEventListener('DOMContentLoaded', () => {
    allRows = document.querySelectorAll('.item-row');
    highlighter = document.getElementById('highlighter');
    container = document.getElementById('mainContainer');
    magnetBtn = document.getElementById('magnetBtn');

    // NEW: Active Navigation Sliders logic hooks for the transparent layout buttons
    const hubContainer = document.getElementById('peerActiveHub');
    const prevBtn = document.querySelector('.scroll-nav-btn.prev');
    const nextBtn = document.querySelector('.scroll-nav-btn.next');

    if (prevBtn && nextBtn && hubContainer) {
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hubContainer.scrollBy({ left: -150, behavior: 'smooth' });
        });
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hubContainer.scrollBy({ left: 150, behavior: 'smooth' });
        });
    }

    // PRESERVED: 100% of your original structural timing and copy lifecycles
    setTimeout(() => updateFocus(0), 100);
    allRows.forEach((row, idx) => { 
        row.addEventListener('click', () => executeCopy(row, row.getAttribute('data-val'), idx)); 
    });

    if (window.lucide) window.lucide.createIcons();
    startIdle();
});

window.toggleModal = function (id, show) {
    const modal = document.getElementById(id);
    if (show) {
        document.getElementById('hospCharges').value = '';
        document.getElementById('caseRate').value = '';
        document.getElementById('finalDiscount').innerText = '0.00';
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
    } else {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 400);
    }
};

window.closeOutside = function (e, id) { 
    if (e.target.id === id) window.toggleModal(id, false); 
};

window.calcSr = function () {
    const charges = parseFloat(document.getElementById('hospCharges').value) || 0;
    const rate = parseFloat(document.getElementById('caseRate').value) || 0;
    document.getElementById('finalDiscount').innerText = (charges - ((charges * 0.20) + rate)).toFixed(2);
};

window.copyModalValue = function () {
    const val = document.getElementById('finalDiscount').innerText;
    navigator.clipboard.writeText(val).then(() => { flashMagnet(); window.toggleModal('srModal', false); });
};

window.openList = function (cat) {
    const listCont = document.getElementById('listContainer');
    listCont.innerHTML = '';
    document.getElementById('listTitle').innerText = cat.toUpperCase();
    extraItems[cat].forEach(text => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerText = text;
        div.onclick = () => { navigator.clipboard.writeText(text); window.toggleModal('listModal', false); flashMagnet(); };
        listCont.appendChild(div);
    });
    window.toggleModal('listModal', true);
};

/* ==========================================================================
   8. HIGHLIGHTER, MAGNETIC ENGINE & INTERACTION ANIMATIONS
   ========================================================================== */
function flashMagnet() {
    magnetBtn.innerText = "COPIED!";
    magnetBtn.classList.add('success-state');
    document.body.classList.add('copy-flash');
    setTimeout(() => {
        magnetBtn.innerText = "COPY";
        magnetBtn.classList.remove('success-state');
        document.body.classList.remove('copy-flash');
    }, 600);
}

document.addEventListener('mousemove', (e) => {
    if (!magnetBtn) return;
    const threshold = window.innerHeight * 0.75;
    if (e.clientY > threshold) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight - (window.innerHeight * 0.125);
        const pullX = (e.clientX - centerX) * 0.3;
        const pullY = (e.clientY - centerY) * 0.4;
        magnetBtn.style.transform = `translate(${pullX}px, ${pullY}px)`;
    } else {
        window.resetMagnet();
    }
});

window.resetMagnet = function () { 
    if (magnetBtn) magnetBtn.style.transform = `translate(0, 0)`; 
};

function updateFocus(index) {
    currentFocusedIndex = index;
    const targetRow = allRows[index];
    if (!targetRow || !highlighter || !container) return;
    const rect = targetRow.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    highlighter.style.opacity = "1";
    highlighter.style.top = (rect.top - containerRect.top) + "px";
    highlighter.style.height = rect.height + "px";
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function executeCopy(row, text, index) {
    updateFocus(index);
    navigator.clipboard.writeText(text).then(() => {
        document.querySelectorAll('.text-content').forEach(el => el.classList.remove('text-active'));
        clearTimeout(textTimeout);
        const textElement = row.querySelector('.text-content');
        textElement.classList.add('text-active');
        flashMagnet();
        let nextIdx = (index + 1) % allRows.length;
        const rowText = row.innerText.toUpperCase();
        if (rowText.includes("IV CATHETER G. 20")) {
            nextIdx = Array.from(allRows).findIndex(r => r.innerText.includes("MACROSET"));
        } else if (rowText.includes("IV CATHETER G. 24")) {
            nextIdx = Array.from(allRows).findIndex(r => r.innerText.includes("MICROSET"));
        }
        setTimeout(() => updateFocus(nextIdx), 450);
        textTimeout = setTimeout(() => textElement.classList.remove('text-active'), 8000);
    });
}

window.copyFocusedItem = function () { 
    executeCopy(allRows[currentFocusedIndex], allRows[currentFocusedIndex].getAttribute('data-val'), currentFocusedIndex); 
};

window.nextFocus = function () { 
    updateFocus((currentFocusedIndex + 1) % allRows.length); 
};

window.resetFocus = function () { 
    updateFocus(0); 
};


/* ==========================================================================
   9. UNIFIED TRACKING VISIBILITY & LIFECYCLE HANDLERS
   ========================================================================== */
let idleTimer;
function startIdle() { if (magnetBtn) magnetBtn.classList.add('idle'); }
function stopIdle() { if (magnetBtn) magnetBtn.classList.remove('idle'); }
function resetIdle() { stopIdle(); clearTimeout(idleTimer); idleTimer = setTimeout(startIdle, 2000); }

['mousemove', 'click', 'scroll'].forEach(e => document.addEventListener(e, resetIdle));

document.addEventListener('visibilitychange', () => {
    if (!userId) return;
    if (document.hidden) {
        set(ref(rtdb, 'presence/' + userId), null);
        updateDoc(doc(db, "accounts", userId), { isOnline: false });
    } else {
        set(ref(rtdb, 'presence/' + userId), {
            uid: userId,
            name: currentUserName,
            avatar: currentUserAvatarRaw,
            timestamp: Date.now()
        });
        updateDoc(doc(db, "accounts", userId), { isOnline: true });
    }
});

window.addEventListener('beforeunload', () => {
    if (userId) {
        set(ref(rtdb, 'presence/' + userId), null);
        updateDoc(doc(db, "accounts", userId), { isOnline: false });
    }
});

window.addEventListener('click', () => {
    document.querySelectorAll('.reaction-picker-tray').forEach(el => el.remove());
});


/* ==========================================================================\n   10. STANDBY IDLE ANIMATION CONTROLLER\n   ========================================================================== 
10. 

let standbyTimer;
let shuffleInterval;
const STANDBY_DELAY = 60000; // 1 minute inactivity timeout threshold
let isStandbyEnabled = false;
let slotElementsArray = [];

function getDeterministicSlotIndex(uid, totalSlots) {
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
        hash = uid.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % totalSlots;
}

function initStandbySystem() {
    if (document.getElementById('standby-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'standby-overlay';
    overlay.innerHTML = `
        <div class="standby-stage">
            <img id="standby-center-node" class="standby-center-profile" src="" alt="Me">
            <div id="standby-orbit-ring" class="standby-orbit-ring"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    
    syncHorizonCounterRotation();
}

function startStandbyMode() {
    if (isStandbyEnabled) return;
    isStandbyEnabled = true;

    const centerProfile = document.getElementById('standby-center-node');
    if (centerProfile && typeof currentUserAvatarRaw !== 'undefined') {
        centerProfile.src = currentUserAvatarRaw;
    }

    document.body.classList.add('standby-active');
    renderPersistentSymmetricalDots();

    // Trigger desynchronized 5s fluid gliding layout transitions
    clearInterval(shuffleInterval);
    shuffleInterval = setInterval(slideAmbientPositions, 5000);
    slideAmbientPositions();
}

function cancelStandbyMode() {
    if (!isStandbyEnabled) return;
    isStandbyEnabled = false;
    document.body.classList.remove('standby-active');
    clearInterval(shuffleInterval);
    resetStandbyTimeout();
}

function resetStandbyTimeout() {
    clearTimeout(standbyTimer);
    if (isStandbyEnabled) {
        cancelStandbyMode();
    }
    standbyTimer = setTimeout(startStandbyMode, STANDBY_DELAY);
}

['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetStandbyTimeout, { passive: true });
});

function renderPersistentSymmetricalDots() {
    const ringContainer = document.getElementById('standby-orbit-ring');
    if (!ringContainer || typeof rtdb === 'undefined') return;

    ringContainer.innerHTML = ''; 
    slotElementsArray = [];

    // Concentric Symmetrical Rings structure arrangement
    const LAYERS = [
        { count: 8,  radius: 88,  dotSize: 4  }, // Close layer -> Completely round, Small size
        { count: 12, radius: 130, dotSize: 7  }, // Middle layer -> Medium size
        { count: 16, radius: 175, dotSize: 11 }, // Distant layer -> Completely round, Big size
        { count: 20, radius: 220, dotSize: 15 }  // Outermost layer -> Biggest size
    ];

    const TOTAL_DOTS = LAYERS.reduce((sum, layer) => sum + layer.count, 0);

    LAYERS.forEach((layer) => {
        for (let i = 0; i < layer.count; i++) {
            const angle = (i / layer.count) * 2 * Math.PI;
            
            // Store pristine basic layout configurations directly inside target elements
            const tx = `${Math.round(layer.radius * Math.cos(angle))}px`;
            const ty = `${Math.round(layer.radius * Math.sin(angle))}px`;

            const slotNode = document.createElement('div');
            slotNode.className = 'standby-node-slot';
            slotNode.dataset.baseAngle = angle;
            slotNode.dataset.nativeRadius = layer.radius;
            
            slotNode.style.setProperty('--tx', tx);
            slotNode.style.setProperty('--ty', ty);

            const innerDot = document.createElement('div');
            innerDot.className = 'standby-ambient-dot';
            innerDot.style.setProperty('--dot-size', `${layer.dotSize}px`);

            slotNode.appendChild(innerDot);
            ringContainer.appendChild(slotNode);
            slotElementsArray.push(slotNode);
        }
    });

    // Realtime Firebase Presence Integration Engine
    const standbyPresenceRef = ref(rtdb, 'presence/');
    onValue(standbyPresenceRef, (snapshot) => {
        if (!isStandbyEnabled) return;

        const activeUsersData = snapshot.val() || {};
        const onlineRemotes = Object.values(activeUsersData).filter(u => u.uid !== userId);

        slotElementsArray.forEach(slot => {
            slot.classList.remove('is-active');
            slot.style.removeProperty('--avatar-img');
        });

        onlineRemotes.forEach((user) => {
            if (!user.uid) return;

            const dedicatedIndex = getDeterministicSlotIndex(user.uid, TOTAL_DOTS);
            const targetedSlot = slotElementsArray[dedicatedIndex];

            if (targetedSlot) {
                const resolvedUserAvatar = user.avatar || 'https://via.placeholder.com/150';
                targetedSlot.style.setProperty('--avatar-img', `url('${resolvedUserAvatar}')`);
                targetedSlot.classList.add('is-active'); // Pops smoothly into its spot
            }
        });
    });
}

// Slidably shifts coordinates smoothly on a 5-second interval time wrapper
function slideAmbientPositions() {
    if (!isStandbyEnabled) return;

    slotElementsArray.forEach((slot, index) => {
        const baseAngle = parseFloat(slot.dataset.baseAngle);
        const nativeRadius = parseInt(slot.dataset.nativeRadius);

        // Desynchronized organic layout micro-deviations (keeps the circles perfectly round, but shifts their drift values asynchronously)
        const angleShift = (Math.sin(Date.now() / 3000 + index) * 0.12); 
        const radiusShift = (Math.cos(Date.now() / 2000 + index) * 12); 

        const targetAngle = baseAngle + angleShift;
        const targetRadius = nativeRadius + radiusShift;

        const newTx = `${Math.round(targetRadius * Math.cos(targetAngle))}px`;
        const newTy = `${Math.round(targetRadius * Math.sin(targetAngle))}px`;

        // Setting custom properties overrides coordinates smoothly via CSS transition rules without popping
        slot.style.setProperty('--tx', newTx);
        slot.style.setProperty('--ty', newTy);
    });
}

function syncHorizonCounterRotation() {
    const ring = document.getElementById('standby-orbit-ring');
    
    function loop() {
        if (isStandbyEnabled && ring) {
            const computedStyle = window.getComputedStyle(ring);
            const matrix = computedStyle.transform;
            
            if (matrix && matrix !== 'none') {
                const values = matrix.split('(')[1].split(')')[0].split(',');
                const a = parseFloat(values[0]);
                const b = parseFloat(values[1]);
                let angle = Math.round(Math.atan2(b, a) * (180 / Math.PI));
                if (angle < 0) angle += 360;
                
                ring.style.setProperty('--base-rotation', `${angle}deg`);
            }
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', () => {
    initStandbySystem();
    resetStandbyTimeout();
});
*/

/* ==========================================================================\n   10. STANDBY IDLE CONSTELLATION CONTROLLER (WITH ACTIVE CLOCK ENGINE)\n   ========================================================================== */
/* ==========================================================================\n   10. STANDBY IDLE CONSTELLATION CONTROLLER (COLON CENTERING + CORNER EYE)\n   ========================================================================== */
const STANDBY_DELAY = 30000; // 30 sec in milliseconds

let standbyTimer;
let shuffleInterval;
let clockUpdateInterval;
let isStandbyEnabled = false;
let isManuallyTriggered = false; 
let slotElementsArray = [];
let lastRenderedMinutes = "";

function getDeterministicSlotIndex(uid, totalSlots) {
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
        hash = uid.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % totalSlots;
}

function initStandbySystem() {
    if (document.getElementById('standby-overlay')) return;
    
    // 1. Setup Corner Hover Detection Zone & Button Icon Container
    const boundaryBox = document.createElement('div');
    boundaryBox.className = 'standby-trigger-boundary-box';
    
    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'standby-manual-trigger-btn';
    triggerBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>`;
    
    triggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startStandbyMode(true);
    });
    
    boundaryBox.appendChild(triggerBtn);
    document.body.appendChild(boundaryBox);

    // 2. Setup Screen Space Layer Structure Overlay
    const overlay = document.createElement('div');
    overlay.id = 'standby-overlay';
    overlay.innerHTML = `
        <div class="standby-clock-container">
            <div class="standby-time-display">
                <span class="standby-hours-box"><span id="standby-hours">00</span></span><span class="standby-colon-separator">:</span><span class="standby-minutes-box"><span id="standby-minutes" class="standby-digit-minutes">00</span><span id="standby-ampm" class="standby-am-pm-side">AM</span></span>
            </div>
            <div id="standby-date" class="standby-date-display"></div>
        </div>
        <div class="standby-stage">
            <img id="standby-center-node" class="standby-center-profile" src="" alt="Me">
            <div id="standby-orbit-ring" class="standby-orbit-ring"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => {
        if (isStandbyEnabled) {
            cancelStandbyMode();
        }
    });
    
    renderPersistentSymmetricalDots();
}

// Fixed-Center 12-Hour Clock Loop Matrix Engine
function startStandbyClock() {
    const hoursDisplay = document.getElementById('standby-hours');
    const minutesDisplay = document.getElementById('standby-minutes');
    const ampmDisplay = document.getElementById('standby-ampm');
    const dateDisplay = document.getElementById('standby-date');

    function updateTimeAndDate() {
        const now = new Date();
        
        let hours = now.getHours();
        let minutes = now.getMinutes();
        
        const ampmStr = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; 
        
        // Pad single digits to ensure centering stability
        const processedHoursStr = hours < 10 ? '0' + hours : '' + hours;
        const processedMinutesStr = minutes < 10 ? '0' + minutes : '' + minutes;
        
        if (hoursDisplay) hoursDisplay.textContent = processedHoursStr;
        if (ampmDisplay) ampmDisplay.textContent = ampmStr;
        
        // Execute smooth blurred font translation shifts on structural minute updates
        if (minutesDisplay) {
            if (lastRenderedMinutes !== processedMinutesStr && lastRenderedMinutes !== "") {
                minutesDisplay.classList.add('is-shifting');
                setTimeout(() => {
                    minutesDisplay.textContent = processedMinutesStr;
                    minutesDisplay.classList.remove('is-shifting');
                }, 300);
            } else {
                minutesDisplay.textContent = processedMinutesStr;
            }
        }
        lastRenderedMinutes = processedMinutesStr;

        // Structured date outputs: MONDAY, JUNE 22 2026
        const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
        let dateString = now.toLocaleDateString('en-US', options);
        dateString = dateString.replace(/,([^,]*)$/, '$1');

        if (dateDisplay) {
            dateDisplay.textContent = dateString;
        }
    }

    clearInterval(clockUpdateInterval);
    lastRenderedMinutes = ""; 
    updateTimeAndDate();
    clockUpdateInterval = setInterval(updateTimeAndDate, 1000);
}

function startStandbyMode(forcedManually = false) {
    if (isStandbyEnabled) return;
    isStandbyEnabled = true;
    isManuallyTriggered = forcedManually;

    const centerProfile = document.getElementById('standby-center-node');
    if (centerProfile && typeof currentUserAvatarRaw !== 'undefined') {
        const fallbackAsset = premium3dAssets[currentUserAvatarRaw] || currentUserAvatarRaw;
        centerProfile.src = fallbackAsset;
    }

    document.body.classList.add('standby-active');
    startStandbyClock();
    syncActiveStandbyPresence();

    clearInterval(shuffleInterval);
    shuffleInterval = setInterval(slideAmbientPositions, 5000);
    slideAmbientPositions();
}

function cancelStandbyMode() {
    if (!isStandbyEnabled) return;
    isStandbyEnabled = false;
    isManuallyTriggered = false;
    document.body.classList.remove('standby-active');
    clearInterval(shuffleInterval);
    clearInterval(clockUpdateInterval);
    resetStandbyTimeout();
}

function resetStandbyTimeout() {
    clearTimeout(standbyTimer);
    if (isStandbyEnabled && isManuallyTriggered) return;

    if (isStandbyEnabled) {
        cancelStandbyMode();
    }
    standbyTimer = setTimeout(() => startStandbyMode(false), STANDBY_DELAY);
}

['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, () => {
        if (isStandbyEnabled && isManuallyTriggered) return;
        resetStandbyTimeout();
    }, { passive: true });
});

function renderPersistentSymmetricalDots() {
    const ringContainer = document.getElementById('standby-orbit-ring');
    if (!ringContainer) return;

    ringContainer.innerHTML = ''; 
    slotElementsArray = [];

    const LAYERS = [
        { count: 8,  radius: 92,  dotSize: 4  }, 
        { count: 12, radius: 140, dotSize: 6  }, 
        { count: 16, radius: 190, dotSize: 10 }, 
        { count: 20, radius: 240, dotSize: 14 }  
    ];

    const TOTAL_DOTS = LAYERS.reduce((sum, layer) => sum + layer.count, 0);

    LAYERS.forEach((layer) => {
        for (let i = 0; i < layer.count; i++) {
            const angle = (i / layer.count) * 2 * Math.PI;
            
            const tx = `${Math.round(layer.radius * Math.cos(angle))}px`;
            const ty = `${Math.round(layer.radius * Math.sin(angle))}px`;

            const slotNode = document.createElement('div');
            slotNode.className = 'standby-node-slot';
            slotNode.dataset.baseAngle = angle;
            slotNode.dataset.nativeRadius = layer.radius;
            
            slotNode.style.setProperty('--tx', tx);
            slotNode.style.setProperty('--ty', ty);

            const innerDot = document.createElement('div');
            innerDot.className = 'standby-ambient-dot';
            innerDot.style.setProperty('--dot-size', `${layer.dotSize}px`);

            slotNode.appendChild(innerDot);
            ringContainer.appendChild(slotNode);
            slotElementsArray.push(slotNode);
        }
    });
}

function syncActiveStandbyPresence() {
    if (typeof rtdb === 'undefined' || !isStandbyEnabled) return;

    const standbyPresenceRef = ref(rtdb, 'presence/');
    onValue(standbyPresenceRef, (snapshot) => {
        if (!isStandbyEnabled) return;

        const activeUsersData = snapshot.val() || {};
        const onlineRemotes = Object.values(activeUsersData).filter(u => u.uid !== userId);
        const TOTAL_DOTS = slotElementsArray.length;

        slotElementsArray.forEach(slot => {
            slot.classList.remove('is-active');
            slot.style.removeProperty('--avatar-img');
        });

        onlineRemotes.forEach((user) => {
            if (!user.uid) return;

            const dedicatedIndex = getDeterministicSlotIndex(user.uid, TOTAL_DOTS);
            const targetedSlot = slotElementsArray[dedicatedIndex];

            if (targetedSlot) {
                const rawAvatar = user.avatar || 'avatar-m1';
                const resolvedUserAvatar = premium3dAssets[rawAvatar] || rawAvatar;
                targetedSlot.style.setProperty('--avatar-img', `url('${resolvedUserAvatar}')`);
                targetedSlot.classList.add('is-active'); 
            }
        });
    });
}

function slideAmbientPositions() {
    if (!isStandbyEnabled) return;

    slotElementsArray.forEach((slot, index) => {
        const baseAngle = parseFloat(slot.dataset.baseAngle);
        const nativeRadius = parseInt(slot.dataset.nativeRadius);

        const angleShift = (Math.sin(Date.now() / 3000 + index) * 0.12); 
        const radiusShift = (Math.cos(Date.now() / 2000 + index) * 12); 

        const targetAngle = baseAngle + angleShift;
        const targetRadius = nativeRadius + radiusShift;

        const newTx = `${Math.round(targetRadius * Math.cos(targetAngle))}px`;
        const newTy = `${Math.round(targetRadius * Math.sin(targetAngle))}px`;

        slot.style.setProperty('--tx', newTx);
        slot.style.setProperty('--ty', newTy);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initStandbySystem();
    resetStandbyTimeout();
});
