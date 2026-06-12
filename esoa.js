/* ==========================================================================
   1. FIREBASE CORE SYSTEM INITIALIZATION
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getDatabase, ref, onValue, set, push, onChildAdded, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
    'avatar-m1': 'https://api.dicebear.com/7.x/notionists/svg?seed=Felix',
    'avatar-m2': 'https://api.dicebear.com/7.x/notionists/svg?seed=Jack',
    'avatar-m3': 'https://api.dicebear.com/7.x/notionists/svg?seed=Oliver',
    'avatar-f1': 'https://api.dicebear.com/7.x/notionists/svg?seed=Lily',
    'avatar-f2': 'https://api.dicebear.com/7.x/notionists/svg?seed=Chloe',
    'avatar-f3': 'https://api.dicebear.com/7.x/notionists/svg?seed=Ruby',
    'animal-g1': 'https://api.dicebear.com/7.x/thumbs/svg?seed=Kitty',
    'animal-g2': 'https://api.dicebear.com/7.x/thumbs/svg?seed=Mimi',
    'animal-g3': 'https://api.dicebear.com/7.x/thumbs/svg?seed=Daisy',
    'animal-m1': 'https://api.dicebear.com/7.x/thumbs/svg?seed=Rocky',
    'animal-m2': 'https://api.dicebear.com/7.x/thumbs/svg?seed=Spike',
    'animal-m3': 'https://api.dicebear.com/7.x/thumbs/svg?seed=Rex',
    'plant-1': 'https://api.dicebear.com/7.x/shapes/svg?seed=Rose',
    'plant-2': 'https://api.dicebear.com/7.x/shapes/svg?seed=Fern',
    'plant-3': 'https://api.dicebear.com/7.x/shapes/svg?seed=Ivy',
    'bg-theme-1': 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
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
   3. FIRESTORE CUSTOM PROFILE REAL-TIME TRACKING
   ========================================================================== */
const userDocRef = doc(db, "accounts", userId);
        
onSnapshot(userDocRef, (snapshot) => {
    if (snapshot.exists()) {
        const data = snapshot.data();

        if (data.esoaDisabled === true) {
            alert("Your access to eSOA has been suspended by management.");
            set(ref(rtdb, 'presence/' + userId), null);
            window.location.href = "login.html";
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

        if (!document.hidden) {
            set(ref(rtdb, 'presence/' + userId), {
                uid: userId,
                name: currentUserName,
                avatar: currentUserAvatarRaw,
                timestamp: Date.now()
            });
            updateDoc(userDocRef, { isOnline: true });
        }
    } else {
        window.location.href = "login.html";
    }
});


/* ==========================================================================
   4. PEER HUB & PRESENCE SYNCHRONIZATION (REALTIME DB)
   ========================================================================== */
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

const presenceRef = ref(rtdb, 'presence');
onValue(presenceRef, (snapshot) => {
    const users = snapshot.val() || {};

    const existingNodes = hub.querySelectorAll('.peer-wrapper:not(#gc-hub-node)');
    existingNodes.forEach(node => {
        const nodeUid = node.id.replace('peer-node-', '');
        if (!users[nodeUid] || nodeUid === userId) {
            node.remove();
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

            peerContainer.appendChild(imgNode);
            peerContainer.appendChild(dotNode);
            peerContainer.appendChild(nameTag);
            hub.appendChild(peerContainer);

            bindBackgroundNotifListener(peer.uid);
        } else {
            const img = peerContainer.querySelector('.peer-avatar-bubble');
            if (img) img.src = cleanAvatarSrc;
            const tag = peerContainer.querySelector('.peer-name-hover');
            if (tag) tag.innerText = singleWordLabel;
        }
    });
    if (window.lucide) window.lucide.createIcons();
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

/* ==========================================================================
   6. REALTIME REACTION-ENABLED CHAT PLATFORM LOGIC
   ========================================================================== */
function initGroupChatChannel() {
    isGroupChat = true;
    selectedActiveChatPartnerId = "BARANGAY_GC";
    document.getElementById('chatTargetName').innerText = `Group Chat`;
    document.getElementById('chatScroller').innerHTML = '';
    document.getElementById('chatDock').style.display = 'flex';

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

    if (isGroupChat) {
        const chatRouteRef = ref(rtdb, `group_chat/messages`);
        const newMsgRef = push(chatRouteRef);
        set(newMsgRef, {
            sender: userId,
            senderName: currentUserName,
            senderAvatar: currentUserAvatarRaw,
            text: text,
            timestamp: Date.now()
        });
    } else {
        const channelSessionKey = userId < selectedActiveChatPartnerId ? `${userId}_${selectedActiveChatPartnerId}` : `${selectedActiveChatPartnerId}_${userId}`;
        const chatRouteRef = ref(rtdb, `sessions/${channelSessionKey}`);
        const newMsgRef = push(chatRouteRef);
        set(newMsgRef, {
             sender: userId,
             text: text,
             timestamp: Date.now()
          });
    }
    input.value = '';
};

function appendBubbleToScroller(msg, msgId, direction) {
    const view = document.getElementById('chatScroller');                                    
    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${direction}`;
    wrapper.id = `msg-wrap-${msgId}`;

    if (isGroupChat) {
        const metaRow = document.createElement('div');
        metaRow.className = 'msg-meta-row';

        const avatarSrc = premium3dAssets[msg.senderAvatar] || msg.senderAvatar || premium3dAssets['avatar-m1'];
        const avatarNode = document.createElement('img');
        avatarNode.className = 'msg-gc-avatar';
        avatarNode.src = avatarSrc;

        const authorTag = document.createElement('div');
        authorTag.className = 'msg-author-tag';
        authorTag.innerText = msg.senderName ? msg.senderName.split(' ')[0] : "Operator";

        const timeTag = document.createElement('div');
        timeTag.className = 'msg-time-tag';
        timeTag.innerText = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        metaRow.appendChild(avatarNode);
        metaRow.appendChild(authorTag);
        metaRow.appendChild(timeTag);
        wrapper.appendChild(metaRow);
    }

    const bbl = document.createElement('div');
    bbl.className = `msg-bubble ${direction}`;
    bbl.innerText = msg.text;                                    
    bbl.onclick = (e) => {
        e.stopPropagation();
        toggleReactionPicker(msgId, wrapper);
    };

    wrapper.appendChild(bbl);

    const rxContainer = document.createElement('div');
    rxContainer.className = 'msg-reaction-container';
    rxContainer.id = `rx-container-${msgId}`;
    rxContainer.style.display = 'none';
    wrapper.appendChild(rxContainer);

    view.appendChild(wrapper);
    view.scrollTop = view.scrollHeight;

    syncReactionsDisplay(msgId);
}

function toggleReactionPicker(msgId, wrapper) {
    const activeTray = document.getElementById(`tray-${msgId}`);
    if (activeTray) {
        activeTray.remove();
        return;
    }

    document.querySelectorAll('.reaction-picker-tray').forEach(el => el.remove());

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

    wrapper.appendChild(tray);
}

function submitReaction(msgId, emoji) {
    let path = `sessions/${userId < selectedActiveChatPartnerId ? `${userId}_${selectedActiveChatPartnerId}` : `${selectedActiveChatPartnerId}_${userId}`}/${msgId}/reactions/${userId}`;
    if (isGroupChat) {
        path = `group_chat/messages/${msgId}/reactions/${userId}`;
    }

    const rxRef = ref(rtdb, path);
    onValue(rxRef, (snapshot) => {
        if (snapshot.exists() && snapshot.val() === emoji) {
            remove(rxRef);
        } else {
            set(rxRef, emoji);
        }
    }, { onlyOnce: true });
}

function syncReactionsDisplay(msgId) {
    let path = `sessions/${userId < selectedActiveChatPartnerId ? `${userId}_${selectedActiveChatPartnerId}` : `${selectedActiveChatPartnerId}_${userId}`}/${msgId}/reactions`;
    if (isGroupChat) {
        path = `group_chat/messages/${msgId}/reactions`;
    }

    onValue(ref(rtdb, path), (snapshot) => {
        const container = document.getElementById(`rx-container-${msgId}`);
        if (!container) return;

        container.innerHTML = '';
        if (!snapshot.exists()) {
            container.style.display = 'none';
            return;
        }

        const reactionData = snapshot.val();
        const summary = {};
        Object.keys(reactionData).forEach(uid => {
            const emo = reactionData[uid];
            if (!summary[emo]) summary[emo] = { count: 0, userVoted: false };
            summary[emo].count++;
            if (uid === userId) summary[emo].userVoted = true;
        });

        Object.keys(summary).forEach(emo => {
            const pill = document.createElement('div');
            pill.className = `reaction-pill ${summary[emo].userVoted ? 'user-voted' : ''}`;                                                            
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
    lab: ["CHEMISTRY: TRIGLYCERIDES", "CHEMISTRY: HDL", "CHEMISTRY: DIRECT LDL", "CHEMISTRY: ALT"], 
    supply: ["NEBULIZING KIT COMPLETE SET W/T-PIECE & MOUTHPIECE", "NEBULIZING KIT WITH MASK (PEDIA)", "COTTON BALLS, 3'S/PACK", "OXYGEN CANNULA (ADULT)", "OXYGEN CANNULA (PEDIA)", "SYRINGE DISPOSABLE 1 CC", "SYRINGE DISPOSABLE ( 5.0 CC)"], 
    others: ["HM-AMLODIPINE", "HM-OMEPRAZOLE", "HM-COLCHICINE", "HM-SAMBONG", "HM-CEFIXIME", "HM-ACETYLCYSTEINE", "MEDICAL OXYGEN", "HBsAg", "DENGUE DUO", "SERUM ELECTROLYTES", "FECALYSIS", "H-PYLORI", "ECG", "TYPHIDOT", "TSH", "T3", "T4", "FT3", "FT4"] 
};

// Initialization Execution Lifecycles
window.addEventListener('DOMContentLoaded', () => {
    allRows = document.querySelectorAll('.item-row');
    highlighter = document.getElementById('highlighter');
    container = document.getElementById('mainContainer');
    magnetBtn = document.getElementById('magnetBtn');

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
