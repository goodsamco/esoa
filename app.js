/* ==========================================================================
   MINI COMBAT 2D - APPLICATION ENGINE & MULTIPLAYER LOGIC (app.js)
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, doc, onSnapshot, updateDoc, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getDatabase, ref, set, get, child, onValue, update, remove, push, onDisconnect 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --------------------------------------------------------------------------
// 1. FIREBASE INITIALIZATION
// --------------------------------------------------------------------------
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

// --------------------------------------------------------------------------
// 2. GLOBAL APP STATE & ASSETS
// --------------------------------------------------------------------------
const AppState = {
  userId: localStorage.getItem("userId") || null,
  profile: null,
  activeRoomId: null,
  isHost: false,
  currentGame: null,
  isMultiplayer: false,
  activeScene: null
};

const DefaultAvatars = {
  "avatar-m1": "https://api.dicebear.com/7.x/bottts/svg?seed=Operator1",
  "avatar-m2": "https://api.dicebear.com/7.x/bottts/svg?seed=Operator2",
  "avatar-m3": "https://api.dicebear.com/7.x/bottts/svg?seed=Operator3"
};

// --------------------------------------------------------------------------
// 3. UI SCREEN MANAGEMENT & NOTIFICATIONS
// --------------------------------------------------------------------------
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(screenId);
  if (target) target.classList.remove('hidden');
}

function showLoading(show, text = "LOADING...") {
  const overlay = document.getElementById('loadingOverlay');
  document.getElementById('loadingText').innerText = text;
  if (show) overlay.classList.remove('hidden');
  else overlay.classList.add('hidden');
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Check for touch interface support
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  document.body.classList.add('touch-device');
}

// --------------------------------------------------------------------------
// 4. USER AUTHENTICATION & PROFILE ENGINE
// --------------------------------------------------------------------------
function initAuth() {
  if (!AppState.userId) {
    AppState.userId = "user_" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("userId", AppState.userId);
  }
  listenToUserProfile();
}

function listenToUserProfile() {
  showLoading(true, "LOADING PROFILE...");
  const userDocRef = doc(db, "accounts", AppState.userId);

  onSnapshot(userDocRef, async (snapshot) => {
    if (snapshot.exists()) {
      AppState.profile = snapshot.data();
      updateProfileUI(AppState.profile);
      showLoading(false);
      showScreen('mainMenuScreen');
    } else {
      // Create default account profile
      const defaultProfile = {
        customName: "Operator_" + AppState.userId.substring(5, 9),
        avatarUrl: "avatar-m1",
        level: 1,
        xp: 0,
        currency: 250,
        stats: {
          matches: 0,
          wins: 0,
          kills: 0,
          deaths: 0,
          bestStreak: 0
        }
      };
      await setDoc(userDocRef, defaultProfile);
      AppState.profile = defaultProfile;
      updateProfileUI(defaultProfile);
      showLoading(false);
      showScreen('mainMenuScreen');
    }
  }, (error) => {
    console.error("Firestore error:", error);
    showLoading(false);
    showScreen('authScreen');
  });
}

function updateProfileUI(data) {
  const name = data.customName || "Operator";
  const avatarKey = data.avatarUrl || "avatar-m1";
  const avatarSrc = DefaultAvatars[avatarKey] || avatarKey;

  document.getElementById('userDisplayName').innerText = name.split(' ')[0];
  document.getElementById('userDisplayAvatar').src = avatarSrc;
  document.getElementById('userLevel').innerText = data.level || 1;
  document.getElementById('userCurrency').innerText = `🪙 ${data.currency || 0}`;

  const currentXp = data.xp || 0;
  const nextLevelXp = (data.level || 1) * 1000;
  const xpPct = Math.min(100, Math.floor((currentXp / nextLevelXp) * 100));
  document.getElementById('userXpFill').style.width = `${xpPct}%`;
  document.getElementById('userXpText').innerText = `${currentXp} / ${nextLevelXp} XP`;

  // Update Profile Modal Details
  document.getElementById('profileModalName').innerText = name;
  document.getElementById('profileModalAvatar').src = avatarSrc;
  
  const stats = data.stats || {};
  document.getElementById('statMatches').innerText = stats.matches || 0;
  document.getElementById('statWins').innerText = stats.wins || 0;
  document.getElementById('statKills').innerText = stats.kills || 0;
  document.getElementById('statDeaths').innerText = stats.deaths || 0;
  document.getElementById('statBestStreak').innerText = stats.bestStreak || 0;
  
  const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : (stats.kills || 0).toFixed(2);
  document.getElementById('statKD').innerText = kd;
}

// --------------------------------------------------------------------------
// 5. LOBBY & MULTIPLAYER MATCHMAKING (REALTIME DB)
// --------------------------------------------------------------------------
function initLobbySystem() {
  document.getElementById('btnMultiplayer').addEventListener('click', () => {
    showScreen('lobbyScreen');
    listenToPublicRooms();
  });

  document.getElementById('btnLobbyBack').addEventListener('click', leaveActiveRoom);
  document.getElementById('btnCreateRoom').addEventListener('click', createRoom);
  document.getElementById('btnJoinByCode').addEventListener('click', () => {
    const code = document.getElementById('joinRoomCodeInput').value.trim().toUpperCase();
    if (code) joinRoom(code);
  });
  document.getElementById('btnToggleReady').addEventListener('click', toggleReadyState);
  document.getElementById('btnStartMatch').addEventListener('click', startMultiplayerMatch);
}

function listenToPublicRooms() {
  const roomsRef = ref(rtdb, 'rooms');
  onValue(roomsRef, (snapshot) => {
    const roomList = document.getElementById('roomList');
    roomList.innerHTML = '';
    
    if (!snapshot.exists()) {
      roomList.innerHTML = '<p class="subtitle">No active rooms. Create one!</p>';
      return;
    }

    snapshot.forEach((childSnap) => {
      const room = childSnap.val();
      const roomId = childSnap.key;
      if (room.status === 'waiting') {
        const row = document.createElement('div');
        row.className = 'room-row';
        row.innerHTML = `
          <div>
            <strong>${room.name}</strong> (${room.mode})
            <br><small>Map: ${room.map} | Players: ${Object.keys(room.players || {}).length}/${room.maxPlayers}</small>
          </div>
          <button class="btn primary-btn btn-sm">JOIN</button>
        `;
        row.querySelector('button').addEventListener('click', () => joinRoom(roomId));
        roomList.appendChild(row);
      }
    });
  });
}

async function createRoom() {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const roomRef = ref(rtdb, `rooms/${roomId}`);

  const initialRoom = {
    hostId: AppState.userId,
    name: `${AppState.profile.customName}'s Room`,
    mode: "deathmatch",
    map: "jungle_base",
    maxPlayers: 4,
    status: "waiting",
    players: {
      [AppState.userId]: {
        name: AppState.profile.customName,
        avatar: AppState.profile.avatarUrl || "avatar-m1",
        isReady: true,
        isHost: true
      }
    }
  };

  await set(roomRef, initialRoom);
  onDisconnect(ref(rtdb, `rooms/${roomId}/players/${AppState.userId}`)).remove();
  enterRoomView(roomId, true);
}

async function joinRoom(roomId) {
  const roomRef = ref(rtdb, `rooms/${roomId}`);
  const snap = await get(roomRef);

  if (!snap.exists()) {
    showToast("Room not found!");
    return;
  }

  const room = snap.val();
  const playerLength = Object.keys(room.players || {}).length;

  if (playerLength >= room.maxPlayers) {
    showToast("Room is full!");
    return;
  }

  await update(ref(rtdb, `rooms/${roomId}/players/${AppState.userId}`), {
    name: AppState.profile.customName,
    avatar: AppState.profile.avatarUrl || "avatar-m1",
    isReady: false,
    isHost: false
  });

  onDisconnect(ref(rtdb, `rooms/${roomId}/players/${AppState.userId}`)).remove();
  enterRoomView(roomId, false);
}

function enterRoomView(roomId, isHost) {
  AppState.activeRoomId = roomId;
  AppState.isHost = isHost;

  document.getElementById('roomBrowser').classList.add('hidden');
  document.getElementById('activeRoomView').classList.remove('hidden');
  document.getElementById('roomCodeDisplay').innerText = `CODE: ${roomId}`;

  // Listen to room modifications
  const roomRef = ref(rtdb, `rooms/${roomId}`);
  onValue(roomRef, (snapshot) => {
    if (!snapshot.exists()) {
      leaveActiveRoom();
      showToast("Room closed by host.");
      return;
    }

    const room = snapshot.data ? snapshot.data() : snapshot.val();
    renderRoomPlayers(room.players);

    if (room.status === 'starting') {
      launchPhaserGame(true, room);
    }
  });
}

function renderRoomPlayers(players = {}) {
  const list = document.getElementById('connectedPlayersList');
  list.innerHTML = '';

  let allReady = true;
  Object.entries(players).forEach(([pid, pdata]) => {
    if (!pdata.isReady && !pdata.isHost) allReady = false;

    const li = document.createElement('li');
    li.className = `player-card ${pdata.isReady ? 'ready' : ''}`;
    li.innerHTML = `
      <span>${pdata.name} ${pdata.isHost ? '👑 (Host)' : ''}</span>
      <span>${pdata.isReady ? 'READY' : 'WAITING'}</span>
    `;
    list.appendChild(li);
  });

  const startBtn = document.getElementById('btnStartMatch');
  if (AppState.isHost) {
    startBtn.classList.remove('hidden');
    startBtn.disabled = !allReady;
  } else {
    startBtn.classList.add('hidden');
  }
}

async function toggleReadyState() {
  if (!AppState.activeRoomId) return;
  const pRef = ref(rtdb, `rooms/${AppState.activeRoomId}/players/${AppState.userId}`);
  const snap = await get(pRef);
  if (snap.exists()) {
    const cur = snap.val().isReady;
    await update(pRef, { isReady: !cur });
  }
}

async function startMultiplayerMatch() {
  if (!AppState.isHost || !AppState.activeRoomId) return;
  await update(ref(rtdb, `rooms/${AppState.activeRoomId}`), {
    status: 'starting'
  });
}

async function leaveActiveRoom() {
  if (AppState.activeRoomId) {
    await remove(ref(rtdb, `rooms/${AppState.activeRoomId}/players/${AppState.userId}`));
    AppState.activeRoomId = null;
    AppState.isHost = false;
  }
  document.getElementById('activeRoomView').classList.add('hidden');
  document.getElementById('roomBrowser').classList.remove('hidden');
  showScreen('mainMenuScreen');
}

// --------------------------------------------------------------------------
// 6. PHASER 3 ARENA SHOOTER ENGINE
// --------------------------------------------------------------------------
class MainArenaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainArenaScene' });
  }

  init(data) {
    this.isMultiplayer = data.isMultiplayer || false;
    this.roomData = data.roomData || null;
    this.playerMap = new Map();
    this.bullets = null;
    this.score = 0;
    this.health = 100;
    this.ammo = 30;
    this.maxAmmo = 30;
    this.reserveAmmo = 120;
  }

  preload() {
    // Generate procedural colored textures for sprites
    const createTexture = (key, color, w = 32, h = 48) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(color, 1);
      g.fillRect(0, 0, w, h);
      g.generateTexture(key, w, h);
    };

    createTexture('player', 0x00ffcc, 28, 40);
    createTexture('bot', 0xff3366, 28, 40);
    createTexture('bullet', 0xffd700, 8, 4);
    createTexture('platform', 0x2a3646, 200, 20);
    createTexture('ground', 0x151c24, 1280, 40);
  }

  create() {
    AppState.activeScene = this;

    // Arena World & Physics Boundaries
    this.physics.world.setBounds(0, 0, 1280, 720);

    // Static Environment
    const platforms = this.physics.add.staticGroup();
    platforms.create(640, 700, 'ground').refreshBody();
    platforms.create(300, 520, 'platform');
    platforms.create(980, 520, 'platform');
    platforms.create(640, 360, 'platform');
    platforms.create(200, 200, 'platform');
    platforms.create(1080, 200, 'platform');

    // Local Player Creation
    this.player = this.physics.add.sprite(100, 600, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0.1);
    this.physics.add.collider(this.player, platforms);

    // Weapon Projectiles
    this.bullets = this.physics.add.group({
      defaultKey: 'bullet',
      maxSize: 60
    });

    // Keyboard Controls
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('A,D,W,S,R,F');

    // Single Player Bots Initialization
    this.bots = this.physics.add.group();
    if (!this.isMultiplayer) {
      for (let i = 0; i < 3; i++) {
        const bot = this.bots.create(300 + i * 300, 100, 'bot');
        bot.setCollideWorldBounds(true);
        bot.setBounce(0.1);
        bot.health = 100;
      }
      this.physics.add.collider(this.bots, platforms);
    }

    // Bullet Collisions
    this.physics.add.overlap(this.bullets, this.bots, this.handleBulletBotHit, null, this);
    this.physics.add.collider(this.bullets, platforms, (bullet) => bullet.destroy());

    // Mouse Aim & Fire
    this.input.on('pointerdown', (pointer) => {
      this.fireBullet(pointer.worldX, pointer.worldY);
    });

    // Mobile Joystick Setup
    this.setupMobileControls();

    // Match Countdown Timer
    this.matchTime = 180; // 3 minutes
    this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.matchTime--;
        const mins = Math.floor(this.matchTime / 60).toString().padStart(2, '0');
        const secs = (this.matchTime % 60).toString().padStart(2, '0');
        document.getElementById('hudMatchTimer').innerText = `${mins}:${secs}`;

        if (this.matchTime <= 0) this.endMatch();
      },
      loop: true
    });
  }

  update() {
    if (!this.player || !this.player.body) return;

    // Movement Physics
    if (this.keys.A.isDown || this.cursors.left.isDown) {
      this.player.setVelocityX(-220);
    } else if (this.keys.D.isDown || this.cursors.right.isDown) {
      this.player.setVelocityX(220);
    } else {
      this.player.setVelocityX(0);
    }

    // Jetpack / Jump
    if ((this.keys.W.isDown || this.cursors.up.isDown) && this.player.body.touching.down) {
      this.player.setVelocityY(-450);
    }

    // Reloading
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.reloadWeapon();
    }

    // Bot AI Logic Loop
    if (!this.isMultiplayer) {
      this.bots.getChildren().forEach(bot => {
        if (Phaser.Math.Between(0, 100) < 2) {
          bot.setVelocityX(Phaser.Math.Between(-150, 150));
        }
        if (Phaser.Math.Between(0, 100) < 1 && bot.body.touching.down) {
          bot.setVelocityY(-400);
        }
      });
    }

    // Update Network Position (Multiplayer Sync)
    if (this.isMultiplayer && AppState.activeRoomId) {
      const posRef = ref(rtdb, `rooms/${AppState.activeRoomId}/states/${AppState.userId}`);
      set(posRef, {
        x: this.player.x,
        y: this.player.y,
        vx: this.player.body.velocity.x,
        vy: this.player.body.velocity.y
      });
    }
  }

  fireBullet(targetX, targetY) {
    if (this.ammo <= 0) {
      this.reloadWeapon();
      return;
    }

    const bullet = this.bullets.get(this.player.x, this.player.y);
    if (bullet) {
      this.ammo--;
      this.updateHUD();

      bullet.setActive(true);
      bullet.setVisible(true);

      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY);
      this.physics.velocityFromRotation(angle, 700, bullet.body.velocity);
      bullet.setRotation(angle);

      // Auto destroy bullet after 2 seconds
      this.time.delayedCall(2000, () => {
        if (bullet.active) bullet.destroy();
      });
    }
  }

  reloadWeapon() {
    if (this.reserveAmmo <= 0 || this.ammo === this.maxAmmo) return;
    const needed = this.maxAmmo - this.ammo;
    const reloaded = Math.min(needed, this.reserveAmmo);
    this.reserveAmmo -= reloaded;
    this.ammo += reloaded;
    this.updateHUD();
    showToast("RELOADED!");
  }

  handleBulletBotHit(bullet, bot) {
    bullet.destroy();
    bot.health -= 35;

    if (bot.health <= 0) {
      bot.destroy();
      this.score += 100;
      this.updateHUD();
      this.addKillLog(`You eliminated Bot`);

      // Respawn Bot
      this.time.delayedCall(3000, () => {
        const newBot = this.bots.create(Phaser.Math.Between(200, 1080), 100, 'bot');
        newBot.setCollideWorldBounds(true);
        newBot.health = 100;
      });
    }
  }

  updateHUD() {
    document.getElementById('hudHealthFill').style.width = `${this.health}%`;
    document.getElementById('hudHealthText').innerText = this.health;
    document.getElementById('hudAmmoText').innerText = `${this.ammo} / ${this.reserveAmmo}`;
    document.getElementById('hudScoreValue').innerText = this.score;
  }

  addKillLog(text) {
    const log = document.getElementById('hudKillLog');
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.innerText = text;
    log.appendChild(entry);
    setTimeout(() => entry.remove(), 4000);
  }

  setupMobileControls() {
    const btnJump = document.getElementById('btnTouchJump');
    const btnReload = document.getElementById('btnTouchReload');
    
    btnJump.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.player.body.touching.down) this.player.setVelocityY(-450);
    });

    btnReload.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.reloadWeapon();
    });
  }

  endMatch() {
    this.scene.stop();
    document.getElementById('gameContainer').classList.add('hidden');
    finishMatchAndSaveResults(this.score);
  }
}

// --------------------------------------------------------------------------
// 7. MATCH LIFECYCLE & DATABASE SAVE ENGINE
// --------------------------------------------------------------------------
function launchPhaserGame(isMultiplayer = false, roomData = null) {
  showScreen('gameContainer');
  document.getElementById('gameContainer').classList.remove('hidden');

  if (AppState.currentGame) {
    AppState.currentGame.destroy(true);
  }

  const config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: 'gameContainer',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 800 },
        debug: false
      }
    },
    scene: [MainArenaScene]
  };

  AppState.currentGame = new Phaser.Game(config);
  AppState.currentGame.scene.start('MainArenaScene', { isMultiplayer, roomData });
}

async function finishMatchAndSaveResults(score) {
  showLoading(true, "SAVING PROGRESS...");

  const xpEarned = Math.floor(score * 1.5) + 50;
  const currencyEarned = Math.floor(score * 0.2) + 20;

  const userDocRef = doc(db, "accounts", AppState.userId);

  // Read latest profile data to prevent overwriting
  const currentSnap = await getDoc(userDocRef);
  const currentData = currentSnap.data();

  const newXp = (currentData.xp || 0) + xpEarned;
  let newLevel = currentData.level || 1;
  if (newXp >= newLevel * 1000) {
    newLevel++;
    showToast(`LEVEL UP! You are now Level ${newLevel}`);
  }

  const stats = currentData.stats || { matches: 0, wins: 0, kills: 0, deaths: 0, bestStreak: 0 };
  const killsInMatch = Math.floor(score / 100);

  const updatedStats = {
    matches: stats.matches + 1,
    wins: stats.wins + (score > 300 ? 1 : 0),
    kills: stats.kills + killsInMatch,
    deaths: stats.deaths + 1,
    bestStreak: Math.max(stats.bestStreak, killsInMatch)
  };

  // Perform Firestore Transaction/Update
  await updateDoc(userDocRef, {
    xp: newXp,
    level: newLevel,
    currency: (currentData.currency || 0) + currencyEarned,
    stats: updatedStats
  });

  showLoading(false);

  // Render Post-Match Results Overlay
  document.getElementById('rewardXp').innerText = `+${xpEarned} XP`;
  document.getElementById('rewardCurrency').innerText = `+${currencyEarned} 🪙`;

  const scoreboardBody = document.getElementById('scoreboardBody');
  scoreboardBody.innerHTML = `
    <tr>
      <td>1</td>
      <td>${AppState.profile.customName}</td>
      <td>${killsInMatch}</td>
      <td>1</td>
      <td>${score}</td>
    </tr>
  `;

  showScreen('matchResultsScreen');
}

// --------------------------------------------------------------------------
// 8. EVENT LISTENERS & APPLICATION BOOTSTRAP
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initLobbySystem();

  // Menu Button Listeners
  document.getElementById('btnQuickPlay').addEventListener('click', () => {
    launchPhaserGame(false);
  });

  document.getElementById('btnSinglePlayer').addEventListener('click', () => {
    launchPhaserGame(false);
  });

  document.getElementById('btnProfile').addEventListener('click', () => {
    showScreen('profileModal');
  });

  document.getElementById('closeProfileBtn').addEventListener('click', () => {
    showScreen('mainMenuScreen');
  });

  document.getElementById('guestLoginBtn').addEventListener('click', () => {
    const inputName = document.getElementById('authUsernameInput').value.trim();
    if (inputName) {
      updateDoc(doc(db, "accounts", AppState.userId), { customName: inputName });
    }
    showScreen('mainMenuScreen');
  });

  document.getElementById('btnResultsContinue').addEventListener('click', () => {
    showScreen('mainMenuScreen');
  });
});
