/* ==========================================================================
   MINI COMBAT 2D - ADVANCED GAMEPLAY ENGINE (app.js)
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, doc, onSnapshot, updateDoc, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getDatabase, ref, set, get, onValue, update, remove, onDisconnect 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --------------------------------------------------------------------------
// 1. FIREBASE CONFIG & INITIALIZATION
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
// 2. ADVANCED GAME CONFIGURATION & WEAPON DATABASE
// --------------------------------------------------------------------------
const AppState = {
  userId: localStorage.getItem("userId") || null,
  profile: null,
  activeRoomId: null,
  isHost: false,
  currentGame: null,
  isMultiplayer: false,
  isLocalTwoPlayer: false,
  activeScene: null
};

const WEAPONS = {
  PISTOL: { name: "Pistol", damage: 15, fireRate: 350, ammoMax: 12, speed: 850, spread: 0.02 },
  AK47: { name: "Assault Rifle", damage: 24, fireRate: 120, ammoMax: 30, speed: 950, spread: 0.05 },
  SHOTGUN: { name: "Shotgun", damage: 14, fireRate: 750, ammoMax: 6, speed: 750, pellets: 5, spread: 0.22 },
  SNIPER: { name: "Sniper Rifle", damage: 85, fireRate: 1200, ammoMax: 4, speed: 1400, spread: 0.005 },
  ROCKET: { name: "Rocket Launcher", damage: 110, fireRate: 1500, ammoMax: 2, speed: 500, splashRadius: 100 }
};

// --------------------------------------------------------------------------
// 3. UI ENGINE & NAVIGATION
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

// --------------------------------------------------------------------------
// 4. FIRESTORE AUTHENTICATION & PROFILES
// --------------------------------------------------------------------------
function initAuth() {
  if (!AppState.userId) {
    AppState.userId = "user_" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("userId", AppState.userId);
  }
  listenToUserProfile();
}

function listenToUserProfile() {
  showLoading(true, "CONNECTING OPERATOR...");
  const userDocRef = doc(db, "accounts", AppState.userId);

  onSnapshot(userDocRef, async (snapshot) => {
    if (snapshot.exists()) {
      AppState.profile = snapshot.data();
      updateProfileUI(AppState.profile);
      showLoading(false);
      showScreen('mainMenuScreen');
    } else {
      const defaultProfile = {
        customName: "Operator_" + AppState.userId.substring(5, 9),
        avatarUrl: "avatar-m1",
        level: 1,
        xp: 0,
        currency: 500,
        stats: { matches: 0, wins: 0, kills: 0, deaths: 0, bestStreak: 0 }
      };
      await setDoc(userDocRef, defaultProfile);
      AppState.profile = defaultProfile;
      updateProfileUI(defaultProfile);
      showLoading(false);
      showScreen('mainMenuScreen');
    }
  });
}

function updateProfileUI(data) {
  const name = data.customName || "Operator";
  document.getElementById('userDisplayName').innerText = name.split(' ')[0];
  document.getElementById('userLevel').innerText = data.level || 1;
  document.getElementById('userCurrency').innerText = `🪙 ${data.currency || 0}`;

  const currentXp = data.xp || 0;
  const nextLevelXp = (data.level || 1) * 1000;
  const xpPct = Math.min(100, Math.floor((currentXp / nextLevelXp) * 100));
  document.getElementById('userXpFill').style.width = `${xpPct}%`;
  document.getElementById('userXpText').innerText = `${currentXp} / ${nextLevelXp} XP`;

  const stats = data.stats || {};
  document.getElementById('statMatches').innerText = stats.matches || 0;
  document.getElementById('statWins').innerText = stats.wins || 0;
  document.getElementById('statKills').innerText = stats.kills || 0;
  document.getElementById('statDeaths').innerText = stats.deaths || 0;
  document.getElementById('statBestStreak').innerText = stats.bestStreak || 0;
}

// --------------------------------------------------------------------------
// 5. PHASER 3 ADVANCED MULTIPLAYER & DUAL-PLAYER GAMEPLAY SCENE
// --------------------------------------------------------------------------
class AdvancedArenaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'AdvancedArenaScene' });
  }

  init(data) {
    this.isMultiplayer = data.isMultiplayer || false;
    this.isLocalTwoPlayer = data.isLocalTwoPlayer || false;
    this.roomData = data.roomData || null;

    this.remotePlayers = new Map();
    this.pickupsGroup = null;

    // Player 1 Config
    this.p1 = {
      sprite: null,
      health: 100,
      jetpackFuel: 100,
      weapon: WEAPONS.AK47,
      ammo: WEAPONS.AK47.ammoMax,
      reserveAmmo: 90,
      score: 0,
      lastFired: 0,
      kills: 0
    };

    // Player 2 Config (For local 2-Player Versus Mode)
    this.p2 = {
      sprite: null,
      health: 100,
      jetpackFuel: 100,
      weapon: WEAPONS.SHOTGUN,
      ammo: WEAPONS.SHOTGUN.ammoMax,
      reserveAmmo: 30,
      score: 0,
      lastFired: 0,
      kills: 0
    };
  }

  preload() {
    // Generate Visual Procedural Textures
    const drawRect = (key, color, w, h) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(color, 1);
      g.fillRect(0, 0, w, h);
      g.generateTexture(key, w, h);
    };

    drawRect('p1_skin', 0x00ffcc, 28, 42);
    drawRect('p2_skin', 0xffaa00, 28, 42);
    drawRect('bot_skin', 0xff3366, 28, 42);
    drawRect('bullet_norm', 0xffff00, 8, 4);
    drawRect('bullet_rocket', 0xff4400, 14, 8);
    drawRect('pickup_wpn', 0x00a2ff, 20, 20);
    drawRect('plat_metal', 0x2a3646, 200, 20);
    drawRect('ground_metal', 0x151c24, 1600, 40);
  }

  create() {
    AppState.activeScene = this;
    this.physics.world.setBounds(0, 0, 1600, 900);

    // Map Construction
    const platforms = this.physics.add.staticGroup();
    platforms.create(800, 880, 'ground_metal').refreshBody();
    platforms.create(350, 680, 'plat_metal');
    platforms.create(1250, 680, 'plat_metal');
    platforms.create(800, 500, 'plat_metal');
    platforms.create(350, 320, 'plat_metal');
    platforms.create(1250, 320, 'plat_metal');

    // Create Player 1
    this.p1.sprite = this.physics.add.sprite(150, 750, 'p1_skin');
    this.p1.sprite.setCollideWorldBounds(true);
    this.physics.add.collider(this.p1.sprite, platforms);

    // Projectiles & Pickups
    this.bullets = this.physics.add.group();
    this.pickupsGroup = this.physics.add.group();
    this.physics.add.collider(this.pickupsGroup, platforms);

    // Create Local Player 2 if Local Dual-Player Enabled
    if (this.isLocalTwoPlayer) {
      this.p2.sprite = this.physics.add.sprite(1450, 750, 'p2_skin');
      this.p2.sprite.setCollideWorldBounds(true);
      this.physics.add.collider(this.p2.sprite, platforms);

      this.physics.add.overlap(this.bullets, this.p1.sprite, (p1, bullet) => this.handleHit(p1, bullet, 1));
      this.physics.add.overlap(this.bullets, this.p2.sprite, (p2, bullet) => this.handleHit(p2, bullet, 2));
    }

    // Single Player Bots
    this.bots = this.physics.add.group();
    if (!this.isMultiplayer && !this.isLocalTwoPlayer) {
      for (let i = 0; i < 4; i++) {
        const bot = this.bots.create(400 + i * 250, 200, 'bot_skin');
        bot.setCollideWorldBounds(true);
        bot.health = 100;
        bot.weapon = WEAPONS.AK47;
      }
      this.physics.add.collider(this.bots, platforms);
      this.physics.add.overlap(this.bullets, this.bots, this.handleBotHit, null, this);
    }

    this.physics.add.collider(this.bullets, platforms, (b) => b.destroy());

    // Input Controllers
    this.keysP1 = this.input.keyboard.addKeys('A,D,W,S,R,F');
    this.keysP2 = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      shoot: Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO,
      reload: Phaser.Input.Keyboard.KeyCodes.NUMPAD_DECIMAL
    });

    this.input.on('pointerdown', (pointer) => {
      if (!this.isLocalTwoPlayer) {
        this.fireWeapon(this.p1, pointer.worldX, pointer.worldY);
      }
    });

    // Weapon Drop Spawner Loop
    this.time.addEvent({
      delay: 10000,
      callback: () => this.spawnWeaponDrop(),
      loop: true
    });

    this.physics.add.overlap(this.p1.sprite, this.pickupsGroup, (p, pickup) => this.collectPickup(this.p1, pickup));
    if (this.isLocalTwoPlayer) {
      this.physics.add.overlap(this.p2.sprite, this.pickupsGroup, (p, pickup) => this.collectPickup(this.p2, pickup));
    }

    // Match Timer
    this.matchTimer = 180;
    this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.matchTimer--;
        const m = Math.floor(this.matchTimer / 60).toString().padStart(2, '0');
        const s = (this.matchTimer % 60).toString().padStart(2, '0');
        document.getElementById('hudMatchTimer').innerText = `${m}:${s}`;
        if (this.matchTimer <= 0) this.endMatch();
      },
      loop: true
    });
  }

  update(time) {
    this.updatePlayerPhysics(this.p1, this.keysP1, time);

    if (this.isLocalTwoPlayer) {
      this.updatePlayerPhysicsP2(this.p2, this.keysP2, time);
    } else if (!this.isMultiplayer) {
      this.updateBotAI();
    }

    // Network Syncing in Multiplayer
    if (this.isMultiplayer && AppState.activeRoomId) {
      const stateRef = ref(rtdb, `rooms/${AppState.activeRoomId}/states/${AppState.userId}`);
      set(stateRef, {
        x: this.p1.sprite.x,
        y: this.p1.sprite.y,
        vx: this.p1.sprite.body.velocity.x,
        vy: this.p1.sprite.body.velocity.y,
        hp: this.p1.health
      });
    }

    this.updateHUDDisplay();
  }

  updatePlayerPhysics(p, keys, time) {
    if (!p.sprite || !p.sprite.body) return;

    // Lateral Movement
    if (keys.A.isDown) p.sprite.setVelocityX(-240);
    else if (keys.D.isDown) p.sprite.setVelocityX(240);
    else p.sprite.setVelocityX(0);

    // Jetpack Flying Engine
    if (keys.W.isDown && p.jetpackFuel > 0) {
      p.sprite.setVelocityY(-380);
      p.jetpackFuel = Math.max(0, p.jetpackFuel - 0.6);
    } else if (p.sprite.body.touching.down) {
      p.jetpackFuel = Math.min(100, p.jetpackFuel + 0.8); // Recharge fuel on ground
    }

    if (Phaser.Input.Keyboard.JustDown(keys.R)) this.reloadWeapon(p);
  }

  updatePlayerPhysicsP2(p, keys, time) {
    if (!p.sprite || !p.sprite.body) return;

    if (keys.left.isDown) p.sprite.setVelocityX(-240);
    else if (keys.right.isDown) p.sprite.setVelocityX(240);
    else p.sprite.setVelocityX(0);

    if (keys.up.isDown && p.jetpackFuel > 0) {
      p.sprite.setVelocityY(-380);
      p.jetpackFuel = Math.max(0, p.jetpackFuel - 0.6);
    } else if (p.sprite.body.touching.down) {
      p.jetpackFuel = Math.min(100, p.jetpackFuel + 0.8);
    }

    if (keys.shoot.isDown && time > p.lastFired) {
      const aimX = p.sprite.x + (p.sprite.body.velocity.x >= 0 ? 300 : -300);
      this.fireWeapon(p, aimX, p.sprite.y);
      p.lastFired = time + p.weapon.fireRate;
    }

    if (Phaser.Input.Keyboard.JustDown(keys.reload)) this.reloadWeapon(p);
  }

  updateBotAI() {
    this.bots.getChildren().forEach(bot => {
      if (!bot.active) return;
      const distToP1 = Phaser.Math.Distance.Between(bot.x, bot.y, this.p1.sprite.x, this.p1.sprite.y);
      if (distToP1 < 450) {
        bot.setVelocityX(bot.x < this.p1.sprite.x ? 120 : -120);
        if (Phaser.Math.Between(0, 100) < 2) {
          this.fireWeapon({ sprite: bot, weapon: WEAPONS.AK47, ammo: 99 }, this.p1.sprite.x, this.p1.sprite.y);
        }
      }
    });
  }

  fireWeapon(p, targetX, targetY) {
    if (p.ammo <= 0) {
      this.reloadWeapon(p);
      return;
    }

    p.ammo--;
    const pellets = p.weapon.pellets || 1;

    for (let i = 0; i < pellets; i++) {
      const key = p.weapon === WEAPONS.ROCKET ? 'bullet_rocket' : 'bullet_norm';
      const bullet = this.bullets.create(p.sprite.x, p.sprite.y, key);
      bullet.damage = p.weapon.damage;
      bullet.owner = p;

      let angle = Phaser.Math.Angle.Between(p.sprite.x, p.sprite.y, targetX, targetY);
      if (p.weapon.spread) angle += Phaser.Math.FloatBetween(-p.weapon.spread, p.weapon.spread);

      this.physics.velocityFromRotation(angle, p.weapon.speed, bullet.body.velocity);
      bullet.setRotation(angle);

      this.time.delayedCall(1800, () => { if (bullet.active) bullet.destroy(); });
    }
  }

  reloadWeapon(p) {
    if (p.ammo === p.weapon.ammoMax || p.reserveAmmo <= 0) return;
    const needed = p.weapon.ammoMax - p.ammo;
    const taken = Math.min(needed, p.reserveAmmo);
    p.reserveAmmo -= taken;
    p.ammo += taken;
  }

  handleHit(targetSprite, bullet, targetPlayerNum) {
    if (bullet.owner.sprite === targetSprite) return; // Prevent self-harm
    const dmg = bullet.damage || 20;
    bullet.destroy();

    const victim = targetPlayerNum === 1 ? this.p1 : this.p2;
    const attacker = targetPlayerNum === 1 ? this.p2 : this.p1;

    victim.health -= dmg;

    if (victim.health <= 0) {
      attacker.score += 100;
      attacker.kills++;
      victim.health = 100;

      // Respawn Victim
      victim.sprite.setPosition(Phaser.Math.Between(200, 1400), 100);
      showToast(`PLAYER ${targetPlayerNum} ELIMINATED!`);
    }
  }

  handleBotHit(bullet, bot) {
    if (bullet.owner !== this.p1) return;
    bot.health -= bullet.damage || 25;
    bullet.destroy();

    if (bot.health <= 0) {
      bot.destroy();
      this.p1.score += 100;
      this.p1.kills++;

      this.time.delayedCall(4000, () => {
        const b = this.bots.create(Phaser.Math.Between(200, 1400), 100, 'bot_skin');
        b.setCollideWorldBounds(true);
        b.health = 100;
      });
    }
  }

  spawnWeaponDrop() {
    const keys = Object.keys(WEAPONS);
    const selectedKey = keys[Math.floor(Math.random() * keys.length)];
    const x = Phaser.Math.Between(200, 1400);

    const pickup = this.pickupsGroup.create(x, 50, 'pickup_wpn');
    pickup.weaponData = WEAPONS[selectedKey];
    pickup.setBounce(0.3);
  }

  collectPickup(p, pickup) {
    p.weapon = pickup.weaponData;
    p.ammo = p.weapon.ammoMax;
    p.reserveAmmo += 30;
    showToast(`EQUIPPED: ${p.weapon.name}`);
    pickup.destroy();
  }

  updateHUDDisplay() {
    document.getElementById('hudHealthFill').style.width = `${this.p1.health}%`;
    document.getElementById('hudHealthText').innerText = this.p1.health;
    document.getElementById('hudAmmoText').innerText = `${this.p1.ammo} / ${this.p1.reserveAmmo}`;
    document.getElementById('hudScoreValue').innerText = this.p1.score;
  }

  endMatch() {
    this.scene.stop();
    document.getElementById('gameContainer').classList.add('hidden');
    finishMatchAndSaveResults(this.p1.score);
  }
}

// --------------------------------------------------------------------------
// 6. MULTIPLAYER LOBBY SYSTEM
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
}

function listenToPublicRooms() {
  const roomsRef = ref(rtdb, 'rooms');
  onValue(roomsRef, (snapshot) => {
    const roomList = document.getElementById('roomList');
    roomList.innerHTML = '';

    if (!snapshot.exists()) {
      roomList.innerHTML = '<p class="subtitle">No open matches. Create one!</p>';
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
            <br><small>Players: ${Object.keys(room.players || {}).length}/${room.maxPlayers}</small>
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

  await set(roomRef, {
    hostId: AppState.userId,
    name: `${AppState.profile.customName}'s Arena`,
    mode: "deathmatch",
    maxPlayers: 4,
    status: "waiting",
    players: {
      [AppState.userId]: {
        name: AppState.profile.customName,
        isHost: true
      }
    }
  });

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

  await update(ref(rtdb, `rooms/${roomId}/players/${AppState.userId}`), {
    name: AppState.profile.customName,
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

  onValue(ref(rtdb, `rooms/${roomId}`), (snapshot) => {
    if (!snapshot.exists()) {
      leaveActiveRoom();
      return;
    }
    const room = snapshot.val();
    if (room.status === 'starting') {
      launchPhaserGame(true, false, room);
    }
  });
}

async function leaveActiveRoom() {
  if (AppState.activeRoomId) {
    await remove(ref(rtdb, `rooms/${AppState.activeRoomId}/players/${AppState.userId}`));
    AppState.activeRoomId = null;
  }
  document.getElementById('activeRoomView').classList.add('hidden');
  document.getElementById('roomBrowser').classList.remove('hidden');
  showScreen('mainMenuScreen');
}

// --------------------------------------------------------------------------
// 7. LAUNCH ENGINE & FIRESTORE SAVE ENGINE
// --------------------------------------------------------------------------
function launchPhaserGame(isMultiplayer = false, isLocalTwoPlayer = false, roomData = null) {
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
      arcade: { gravity: { y: 750 }, debug: false }
    },
    scene: [AdvancedArenaScene]
  };

  AppState.currentGame = new Phaser.Game(config);
  AppState.currentGame.scene.start('AdvancedArenaScene', { isMultiplayer, isLocalTwoPlayer, roomData });
}

async function finishMatchAndSaveResults(score) {
  showLoading(true, "SAVING PROGRESS...");

  const xpEarned = Math.floor(score * 1.5) + 50;
  const currencyEarned = Math.floor(score * 0.2) + 25;

  const userDocRef = doc(db, "accounts", AppState.userId);
  const currentSnap = await getDoc(userDocRef);
  const currentData = currentSnap.data();

  const newXp = (currentData.xp || 0) + xpEarned;
  let newLevel = currentData.level || 1;
  if (newXp >= newLevel * 1000) newLevel++;

  const stats = currentData.stats || { matches: 0, wins: 0, kills: 0, deaths: 0, bestStreak: 0 };
  const killsInMatch = Math.floor(score / 100);

  await updateDoc(userDocRef, {
    xp: newXp,
    level: newLevel,
    currency: (currentData.currency || 0) + currencyEarned,
    stats: {
      matches: stats.matches + 1,
      wins: stats.wins + (score >= 200 ? 1 : 0),
      kills: stats.kills + killsInMatch,
      deaths: stats.deaths + 1,
      bestStreak: Math.max(stats.bestStreak, killsInMatch)
    }
  });

  showLoading(false);

  document.getElementById('rewardXp').innerText = `+${xpEarned} XP`;
  document.getElementById('rewardCurrency').innerText = `+${currencyEarned} 🪙`;
  document.getElementById('scoreboardBody').innerHTML = `
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
// 8. BOOTSTRAP INITIALIZATION
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initLobbySystem();

  // Mode Selection Listeners
  document.getElementById('btnQuickPlay').addEventListener('click', () => launchPhaserGame(false, false));
  document.getElementById('btnSinglePlayer').addEventListener('click', () => launchPhaserGame(false, false));
  
  // Inject Local 2-Player Button Dyno Listener
  const menuActions = document.querySelector('.menu-actions');
  const twoPlayerBtn = document.createElement('button');
  twoPlayerBtn.className = 'btn action-btn';
  twoPlayerBtn.innerText = '⚔️ 2-PLAYER VERSUS (LOCAL)';
  twoPlayerBtn.addEventListener('click', () => launchPhaserGame(false, true));
  menuActions.insertBefore(twoPlayerBtn, menuActions.children[2]);

  document.getElementById('btnProfile').addEventListener('click', () => showScreen('profileModal'));
  document.getElementById('closeProfileBtn').addEventListener('click', () => showScreen('mainMenuScreen'));
  document.getElementById('btnResultsContinue').addEventListener('click', () => showScreen('mainMenuScreen'));
});
