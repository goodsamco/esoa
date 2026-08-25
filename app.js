/* ==========================================================================
   2D MONOCHROME ARENA - FIXED & OPTIMIZED ENGINE
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, doc, setDoc, getDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getDatabase, ref, set, get, onValue, update, remove, onDisconnect, child 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDaeNQF4qmW0vvwxUPp_NztnT0hoLzm1BQ",
  authDomain: "svls-289ee.firebaseapp.com",
  databaseURL: "https://svls-289ee-default-rtdb.firebaseio.com",
  projectId: "svls-289ee",
  storageBucket: "svls-289ee.firebasestorage.app",
  messagingSenderId: "500705386198",
  appId: "1:500705386198:web:96f189662bc2aa99cf7377"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

const AppState = {
  userId: localStorage.getItem("mono_userId") || null,
  profile: null,
  activeRoomId: null,
  isHost: false,
  currentGame: null,
  activeScene: null,
  roomListener: null
};

const WEAPONS = {
  PISTOL: { id: "PISTOL", name: "Pistol", damage: 15, fireRate: 350, ammoMax: 12, speed: 900, spread: 0.02, cost: 0 },
  SMG: { id: "SMG", name: "SMG", damage: 12, fireRate: 90, ammoMax: 30, speed: 950, spread: 0.08, cost: 100 },
  SHOTGUN: { id: "SHOTGUN", name: "Shotgun", damage: 14, fireRate: 750, ammoMax: 6, speed: 800, pellets: 5, spread: 0.22, cost: 250 },
  AK47: { id: "AK47", name: "Assault Rifle", damage: 24, fireRate: 140, ammoMax: 30, speed: 1000, spread: 0.04, cost: 500 },
  SNIPER: { id: "SNIPER", name: "Sniper Rifle", damage: 85, fireRate: 1200, ammoMax: 5, speed: 1500, spread: 0.001, cost: 750 },
  ROCKET: { id: "ROCKET", name: "Rocket Launcher", damage: 110, fireRate: 1500, ammoMax: 1, speed: 550, splashRadius: 120, cost: 1000 }
};

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.remove('hidden');
    target.style.zIndex = "50";
  }
}

function showLoading(show, text = "INITIALIZING SYSTEM...") {
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  document.getElementById('loadingText').innerText = text;
  if (show) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

// FIX 1: Reliable Profile Syncing & Direct Local Initialization Fallback
async function initAuth() {
  if (!AppState.userId) {
    AppState.userId = "op_" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("mono_userId", AppState.userId);
  }
  await fetchUserProfile();
}

async function fetchUserProfile() {
  showLoading(true, "RETRIEVING OPERATOR DATA...");
  const userDocRef = doc(db, "accounts", AppState.userId);

  try {
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      AppState.profile = snap.data();
    } else {
      const defaultProfile = {
        customName: "OPERATOR_" + AppState.userId.substring(3, 7).toUpperCase(),
        level: 1,
        xp: 0,
        coins: 150,
        stats: { matches: 0, wins: 0, kills: 0, deaths: 0, bestStreak: 0 },
        ownedWeapons: ["PISTOL"]
      };
      await setDoc(userDocRef, defaultProfile);
      AppState.profile = defaultProfile;
    }
  } catch (err) {
    console.warn("Firestore access offline or blocked. Loading local fallback session.");
    AppState.profile = {
      customName: "OPERATOR_" + AppState.userId.substring(3, 7).toUpperCase(),
      level: 1,
      xp: 0,
      coins: 150,
      stats: { matches: 0, wins: 0, kills: 0, deaths: 0, bestStreak: 0 },
      ownedWeapons: ["PISTOL"]
    };
  }

  updateProfileUI(AppState.profile);
  showLoading(false);
  showScreen('mainMenuScreen');
}

function updateProfileUI(data) {
  if (!data) return;
  const nameElem = document.getElementById('userDisplayName');
  if (nameElem) nameElem.innerText = data.customName;
  
  const lvlElem = document.getElementById('userLevel');
  if (lvlElem) lvlElem.innerText = data.level || 1;
  
  const coinElem = document.getElementById('userCurrency');
  if (coinElem) coinElem.innerText = `🪙 ${data.coins || 0}`;

  const stats = data.stats || {};
  if (document.getElementById('statMatches')) document.getElementById('statMatches').innerText = stats.matches || 0;
  if (document.getElementById('statWins')) document.getElementById('statWins').innerText = stats.wins || 0;
  if (document.getElementById('statKills')) document.getElementById('statKills').innerText = stats.kills || 0;
  if (document.getElementById('statDeaths')) document.getElementById('statDeaths').innerText = stats.deaths || 0;
}

// FIX 2: Persistent Room Creation and Join Logic
async function createOnlineRoom() {
  showLoading(true, "INITIALIZING NETWORK ROOM...");
  const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
  const roomRef = ref(rtdb, `rooms/${roomId}`);

  const initialRoomState = {
    hostId: AppState.userId,
    status: "WAITING",
    created: Date.now(),
    players: {
      [AppState.userId]: {
        name: AppState.profile.customName,
        x: 200,
        y: 800,
        facing: 'right',
        health: 100,
        shield: 50,
        score: 0,
        kills: 0,
        deaths: 0,
        weapon: "PISTOL"
      }
    }
  };

  await set(roomRef, initialRoomState);
  AppState.activeRoomId = roomId;
  AppState.isHost = true;

  showLoading(false);
  showToast(`ROOM READY: ${roomId}`);
  listenToRoomState(roomId);
}

async function joinOnlineRoom(roomId) {
  showLoading(true, "CONNECTING TO ROOM...");
  const cleanRoomId = roomId.toUpperCase().trim();
  const roomRef = ref(rtdb, `rooms/${cleanRoomId}`);
  const snap = await get(roomRef);

  if (!snap.exists()) {
    showLoading(false);
    showToast("INVALID ROOM CODE!");
    return;
  }

  const playerRef = ref(rtdb, `rooms/${cleanRoomId}/players/${AppState.userId}`);
  await update(playerRef, {
    name: AppState.profile.customName,
    x: 1400,
    y: 800,
    facing: 'left',
    health: 100,
    shield: 50,
    score: 0,
    kills: 0,
    deaths: 0,
    weapon: "PISTOL"
  });

  AppState.activeRoomId = cleanRoomId;
  AppState.isHost = false;

  await update(roomRef, { status: "PLAYING" });
  showLoading(false);
  listenToRoomState(cleanRoomId);
}

function listenToRoomState(roomId) {
  const roomRef = ref(rtdb, `rooms/${roomId}`);
  AppState.roomListener = onValue(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
      showToast("ROOM DISBANDED");
      exitToMenu();
      return;
    }
    const roomData = snapshot.val();
    if (roomData.status === "PLAYING" && (!AppState.currentGame || !AppState.currentGame.scene.isActive('MonochromeArenaScene'))) {
      launchPhaserGame(true);
    }
    if (AppState.activeScene && AppState.activeScene.isMultiplayer) {
      AppState.activeScene.syncRemotePlayers(roomData.players);
    }
  });
}

function exitToMenu() {
  if (AppState.activeRoomId) {
    remove(ref(rtdb, `rooms/${AppState.activeRoomId}/players/${AppState.userId}`));
    AppState.activeRoomId = null;
  }
  if (AppState.roomListener) {
    AppState.roomListener();
    AppState.roomListener = null;
  }
  if (AppState.currentGame) {
    AppState.currentGame.destroy(true);
    AppState.currentGame = null;
  }
  showScreen('mainMenuScreen');
}

// FIX 3: Phaser 3 Scene with Texture Pre-rendering & Layer Z-Index Sorting
class MonochromeArenaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MonochromeArenaScene' });
  }

  init(data) {
    this.isMultiplayer = data.isMultiplayer || false;
    this.remotePlayers = {};
    this.p1 = { sprite: null, health: 100, shield: 50, score: 0, kills: 0, deaths: 0, weapon: WEAPONS.PISTOL, facing: 'right' };
    this.bot = { sprite: null, health: 100, score: 0 };
  }

  preload() {
    // Generate High-Contrast Solid Canvas Textures
    const createSolidTexture = (key, width, height, color) => {
      const canvas = this.textures.createCanvas(key, width, height);
      const ctx = canvas.context;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, width, height);
      canvas.refresh();
    };

    createSolidTexture('p1_avatar_body', 36, 52, '#ffffff');
    createSolidTexture('bot_avatar_body', 36, 52, '#8c8c8c');
    createSolidTexture('mono_ground', 1600, 60, '#121212');
    createSolidTexture('mono_bullet', 12, 6, '#ffffff');
  }

  create() {
    AppState.activeScene = this;
    this.physics.world.setBounds(0, 0, 1600, 900);

    const ground = this.physics.add.staticGroup();
    const floor = ground.create(800, 870, 'mono_ground').refreshBody();
    floor.setDepth(10);

    const spawnX = AppState.isHost || !this.isMultiplayer ? 200 : 1400;
    
    // Explicit Z-Index Placement (Depth = 100)
    this.p1.sprite = this.physics.add.sprite(spawnX, 750, 'p1_avatar_body');
    this.p1.sprite.setCollideWorldBounds(true);
    this.p1.sprite.setDepth(100);
    this.physics.add.collider(this.p1.sprite, ground);

    if (!this.isMultiplayer) {
      this.bot.sprite = this.physics.add.sprite(1400, 750, 'bot_avatar_body');
      this.bot.sprite.setCollideWorldBounds(true);
      this.bot.sprite.setDepth(90);
      this.physics.add.collider(this.bot.sprite, ground);
    }

    this.keys = this.input.keyboard.addKeys('A,D,W,S,ESC');
  }

  update() {
    if (!this.p1.sprite || !this.p1.sprite.body) return;

    if (this.keys.A.isDown) {
      this.p1.sprite.setVelocityX(-300);
      this.p1.facing = 'left';
    } else if (this.keys.D.isDown) {
      this.p1.sprite.setVelocityX(300);
      this.p1.facing = 'right';
    } else {
      this.p1.sprite.setVelocityX(0);
    }

    if (this.keys.W.isDown && this.p1.sprite.body.touching.down) {
      this.p1.sprite.setVelocityY(-550);
    }

    if (this.isMultiplayer && AppState.activeRoomId) {
      const pRef = ref(rtdb, `rooms/${AppState.activeRoomId}/players/${AppState.userId}`);
      update(pRef, {
        x: this.p1.sprite.x,
        y: this.p1.sprite.y,
        facing: this.p1.facing,
        health: this.p1.health
      });
    }
  }

  syncRemotePlayers(playersData) {
    if (!playersData) return;
    Object.keys(playersData).forEach(id => {
      if (id === AppState.userId) return;
      const pData = playersData[id];
      if (!this.remotePlayers[id]) {
        const sprite = this.physics.add.sprite(pData.x, pData.y, 'bot_avatar_body');
        sprite.setCollideWorldBounds(true);
        sprite.setDepth(95);
        this.remotePlayers[id] = sprite;
      } else {
        this.remotePlayers[id].setPosition(pData.x, pData.y);
      }
    });
  }
}

function launchPhaserGame(isMultiplayer = false) {
  showScreen('gameContainer');
  if (AppState.currentGame) AppState.currentGame.destroy(true);

  const config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: 'phaserRenderCanvas',
    physics: { default: 'arcade', arcade: { gravity: { y: 1000 }, debug: false } },
    scene: [MonochromeArenaScene]
  };

  AppState.currentGame = new Phaser.Game(config);
}

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  document.getElementById('btnSinglePlayer').addEventListener('click', () => launchPhaserGame(false));
  document.getElementById('btnLobby').addEventListener('click', () => showScreen('lobbyScreen'));
  document.getElementById('btnCloseLobby').addEventListener('click', () => showScreen('mainMenuScreen'));
  document.getElementById('btnCreateRoom').addEventListener('click', createOnlineRoom);
  document.getElementById('btnJoinRoom').addEventListener('click', () => {
    const code = document.getElementById('inputRoomCode').value;
    if (code) joinOnlineRoom(code);
  });
});
