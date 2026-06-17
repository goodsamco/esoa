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
   3. FIRESTORE CUSTOM PROFILE REAL-TIME TRACKING
   ========================================================================== */
/* const userDocRef = doc(db, "accounts", userId);
        
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
*/

/* ==========================================================================
   3. FIRESTORE CUSTOM PROFILE REAL-TIME TRACKING & INACTIVITY WATCHER
   ========================================================================== */
const userDocRef = doc(db, "accounts", userId);
let inactivityTimeout = null;
const INACTIVITY_LIMIT = 2 * 60 * 60 * 1000; // 2 Hours in milliseconds

// Pure function to systematically strip credentials and session states
function forceLogoutUser() {
    console.log("Session expired due to inactivity.");
    // Clear presence state before leaving
    set(ref(rtdb, 'presence/' + userId), null);
    
    // Wipe local application storage contexts
    localStorage.clear();
    sessionStorage.clear();
    
    // Push layout state away
    window.location.href = "login.html";
}

// Resets the countdown timer whenever user engagement is intercepted
function resetInactivityTimer() {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(forceLogoutUser, INACTIVITY_LIMIT);
}

// Bind native input listener streams to supervise interaction activity
function startInactivityWatcher() {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    activityEvents.forEach(eventType => {
        window.addEventListener(eventType, resetInactivityTimer, { passive: true });
    });
    
    // Initialize the baseline interval timer on runtime execution
    resetInactivityTimer();
}

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

        if (!document.hidden) {
            set(ref(rtdb, 'presence/' + userId), {
                uid: userId,
                name: currentUserName,
                avatar: currentUserAvatarRaw,
                timestamp: Date.now()
            });
            updateDoc(userDocRef, { isOnline: true });
        }
        
        // Start monitoring interaction profiles once valid session snapshots are bound
        startInactivityWatcher();
    } else {
        forceLogoutUser();
    }
});


/* ==========================================================================
   TYPING INDICATOR HUB LISTENER
   ========================================================================== */
const typingHooks = {};

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

        if (snapshot.val() === true) {
tag.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
`;
            tag.dataset.typing = "true";
        } else {
            tag.textContent = displayName;
            tag.dataset.typing = "false";
        }
    });
}


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
        if (uid === userId) return;

        const peer = users[uid];
        if (!peer || !peer.uid) return;

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

            // Typing listener
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

        peerContainer.classList.remove('is-offline');
        peerContainer.style.order = "0";
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
});
/**
 * COMPLETE AND UNREDACTED JAVASCRIPT FOR SECTIONS 5 & 6
 * Includes: Persistent Storage Notifications, Timestamps, 
 * Message Creation, Editing, Deletion, and Reactions.
 */

// Global State
const CURRENT_USER_ID = "current-user";
let currentChatId = "chat-group-1";

// Fully functional in-memory message database
let messages = [
    {
        id: "msg-101",
        chatId: "chat-group-1",
        text: "Hey, are we still meeting today?",
        timestamp: "10:30 AM",
        senderId: "user-2",
        isEdited: false,
        reactions: { "👍": 2 }
    },
    {
        id: "msg-102",
        chatId: "chat-group-1",
        text: "Yeah, see you at 5!",
        timestamp: "10:31 AM",
        senderId: "current-user",
        isEdited: false,
        reactions: {}
    }
];

// ==========================================
// SECTION 5: PERSISTENT NOTIFICATIONS & TIMESTAMPS
// ==========================================

/**
 * Generates a clean, standardized timestamp string
 * @returns {string} e.g., "01:24 PM"
 */
function formatTimestamp() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Saves an unread chat ID to localStorage to survive page reloads
 * @param {string} chatId 
 */
function saveUnreadNotification(chatId) {
    const rawData = localStorage.getItem('unreadChats');
    let unreadChats = [];
    
    if (rawData) {
        try {
            unreadChats = JSON.parse(rawData);
            if (!Array.isArray(unreadChats)) unreadChats = [];
        } catch (e) {
            unreadChats = [];
        }
    }
    
    if (!unreadChats.includes(chatId)) {
        unreadChats.push(chatId);
        localStorage.setItem('unreadChats', JSON.stringify(unreadChats));
    }
    applyNotificationUI();
}

/**
 * Removes an unread chat ID from localStorage when read
 * @param {string} chatId 
 */
function markChatAsRead(chatId) {
    const rawData = localStorage.getItem('unreadChats');
    let unreadChats = [];
    
    if (rawData) {
        try {
            unreadChats = JSON.parse(rawData);
            if (!Array.isArray(unreadChats)) unreadChats = [];
        } catch (e) {
            unreadChats = [];
        }
    }
    
    unreadChats = unreadChats.filter(id => id !== chatId);
    localStorage.setItem('unreadChats', JSON.stringify(unreadChats));
    applyNotificationUI();
}

/**
 * Synchronizes DOM notification badges directly with localStorage data
 */
function applyNotificationUI() {
    const rawData = localStorage.getItem('unreadChats');
    let unreadChats = [];
    
    if (rawData) {
        try {
            unreadChats = JSON.parse(rawData);
            if (!Array.isArray(unreadChats)) unreadChats = [];
        } catch (e) {
            unreadChats = [];
        }
    }
    
    const badges = document.querySelectorAll('.notification-badge');
    badges.forEach(badge => {
        const id = badge.getAttribute('data-chat-id');
        if (unreadChats.includes(id)) {
            badge.classList.add('unread-active');
        } else {
            badge.classList.remove('unread-active');
        }
    });
}

// ==========================================
// SECTION 6: MESSAGE ACTIONS (EDIT, DELETE, REACT)
// ==========================================

/**
 * Completely renders the chat container viewport based on the messages state array
 */
function renderMessages() {
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;
    
    chatContainer.innerHTML = '';

    // Filter messages belonging to the active conversation context
    const activeMessages = messages.filter(m => m.chatId === currentChatId);

    activeMessages.forEach(msg => {
        const isMe = msg.senderId === CURRENT_USER_ID;
        
        // Parse and secure reactions array maps
        let reactionsHtml = '';
        if (msg.reactions && typeof msg.reactions === 'object') {
            reactionsHtml = Object.entries(msg.reactions)
                .map(([emoji, count]) => {
                    if (count <= 0) return '';
                    return `
                        <span class="reaction-badge" onclick="handleReaction('${msg.id}', '${emoji}')">
                            ${emoji} <span class="reaction-count">${count}</span>
                        </span>
                    `;
                }).join('');
        }

        // Text mutation display logic: wraps text inside italic tags if edited flag matches
        const textDisplay = msg.isEdited 
            ? `<em>${msg.text} <span class="edited-marker">(edited)</span></em>` 
            : msg.text;

        const messageHtml = `
            <div class="message-wrapper ${isMe ? 'sent' : 'received'}" id="msg-wrap-${msg.id}">
                <div class="message-bubble">
                    <div class="message-text" id="text-${msg.id}">
                        ${textDisplay}
                    </div>
                    <div class="message-meta">
                        <span class="message-time">${msg.timestamp}</span>
                    </div>
                </div>
                <div class="message-footer">
                    <div class="reactions-bar">
                        ${reactionsHtml}
                        <button class="add-reaction-btn" onclick="showReactionPicker('${msg.id}')">＋</button>
                    </div>
                    ${isMe ? `
                        <div class="message-actions">
                            <button class="action-btn edit-btn" onclick="initiateEdit('${msg.id}')">Edit</button>
                            <button class="action-btn delete-btn" onclick="deleteMessage('${msg.id}')">Delete</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        chatContainer.insertAdjacentHTML('beforeend', messageHtml);
    });
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Creates and appends a new message to the active chat stream
 * @param {string} textRaw 
 */
function sendNewMessage(textRaw) {
    if (!textRaw || textRaw.trim() === "") return;
    
    const newMessage = {
        id: "msg-" + Date.now(),
        chatId: currentChatId,
        text: textRaw.trim(),
        timestamp: formatTimestamp(),
        senderId: CURRENT_USER_ID,
        isEdited: false,
        reactions: {}
    };
    
    messages.push(newMessage);
    renderMessages();
}

/**
 * Modifies an existing message content inline and forces an explicit layout refresh
 * @param {string} msgId 
 */
function initiateEdit(msgId) {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    const newText = prompt("Edit your message:", msg.text);
    if (newText !== null && newText.trim() !== "") {
        msg.text = newText.trim();
        msg.isEdited = true;
        renderMessages();
    }
}

/**
 * Deletes a targeted message string out of local runtime arrays
 * @param {string} msgId 
 */
function deleteMessage(msgId) {
    const confirmed = confirm("Are you sure you want to delete this message?");
    if (confirmed) {
        messages = messages.filter(m => m.id !== msgId);
        renderMessages();
    }
}

/**
 * Increments or removes explicit emoji values assigned to a message instance
 * @param {string} msgId 
 * @param {string} emoji 
 */
function handleReaction(msgId, emoji) {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    if (!msg.reactions) {
        msg.reactions = {};
    }

    if (msg.reactions[emoji]) {
        msg.reactions[emoji] += 1;
    } else {
        msg.reactions[emoji] = 1;
    }
    
    renderMessages();
}

/**
 * Renders a browser selection interface input for emoji reactions
 * @param {string} msgId 
 */
function showReactionPicker(msgId) {
    const validEmojis = ["👍", "❤️", "😂", "😮", "🖕"];
    const choice = prompt(`Type an emoji to react:\n${validEmojis.join(" ")}`);
    if (choice && validEmojis.includes(choice.trim())) {
        handleReaction(msgId, choice.trim());
    }
}

/**
 * Global Simulation Engine Interface (For testing interactions safely)
 */
function simulateIncomingMessage(sender, textContent) {
    const simulatedMsg = {
        id: "msg-" + Date.now(),
        chatId: currentChatId,
        text: textContent,
        timestamp: formatTimestamp(),
        senderId: sender,
        isEdited: false,
        reactions: {}
    };
    messages.push(simulatedMsg);
    saveUnreadNotification(currentChatId);
    renderMessages();
}

// ==========================================
// INITIALIZATION EXECUTION ENTRY POINT
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Sync storage components
    applyNotificationUI();
    
    // Clear notifications for the actively open window upon initial stack load
    markChatAsRead(currentChatId);
    
    // Perform initial viewport buildout
    renderMessages();
});

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
