/* ==========================================================================
   MONOCHROME COMBAT 2D - ADVANCED GAMEPLAY & MULTIPLAYER ENGINE
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, doc, onSnapshot, updateDoc, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getDatabase, ref, set, get, onValue, update, remove, onDisconnect 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --------------------------------------------------------------------------
// 1. FIREBASE CONFIGURATION & INITIALIZATION
// --------------------------------------------------------------------------
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

// --------------------------------------------------------------------------
// 2. GLOBAL STATE & CONFIGURATIONS
// --------------------------------------------------------------------------
const AppState = {
  userId: localStorage.getItem("mono_userId") || null,
  profile: null,
  activeRoomId: null,
  isHost: false,
  currentGame: null,
  activeScene: null
};

const WEAPONS = {
  PISTOL: { id: "PISTOL", name: "Pistol", damage: 15, fireRate: 350, ammoMax: 12, speed: 900, spread: 0.02, cost: 0 },
  SMG: { id: "SMG", name: "SMG", damage: 12, fireRate: 90, ammoMax: 30, speed: 950, spread: 0.08, cost: 100 },
  SHOTGUN: { id: "SHOTGUN", name: "Shotgun", damage: 14, fireRate: 750, ammoMax: 6, speed: 800, pellets: 5, spread: 0.22, cost: 250 },
  AK47: { id: "AK47", name: "Assault Rifle", damage: 24, fireRate: 140, ammoMax: 30, speed: 1000, spread: 0.04, cost: 500 },
  SNIPER: { id: "SNIPER", name: "Sniper Rifle", damage: 85, fireRate: 1200, ammoMax: 5, speed: 1500, spread: 0.001, cost: 750 },
  ROCKET: { id: "ROCKET", name: "Rocket Launcher", damage: 110, fireRate: 1500, ammoMax: 1, speed: 550, splashRadius: 120, cost: 1000 }
};

const POWERS = {
  HEALTH_BOOST: { id: "HEALTH_BOOST", name: "HEALTH BOOST (+40%)" },
  FULL_HEAL: { id: "FULL_HEAL", name: "FULL HEAL (100%)" },
  DAMAGE_BOOST: { id: "DAMAGE_BOOST", name: "DAMAGE BOOST (+50% 10S)" },
  SHIELD: { id: "SHIELD", name: "REINFORCE SHIELD" }
};

const ESCALATION_RANKS = [
  { kills: 0, weapon: WEAPONS.PISTOL },
  { kills: 2, weapon: WEAPONS.SMG },
  { kills: 4, weapon: WEAPONS.SHOTGUN },
  { kills: 6, weapon: WEAPONS.AK47 },
  { kills: 8, weapon: WEAPONS.SNIPER },
  { kills: 10, weapon: WEAPONS.ROCKET }
];

// --------------------------------------------------------------------------
// 3. UI HELPER UTILITIES
// --------------------------------------------------------------------------
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(screenId);
  if (target) target.classList.remove('hidden');
}

function showLoading(show, text = "INITIALIZING SYSTEM...") {
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
  setTimeout(() => toast.remove(), 2800);
}

// --------------------------------------------------------------------------
// 4. USER AUTHENTICATION & PROFILE PERSISTENCE
// --------------------------------------------------------------------------
function initAuth() {
  if (!AppState.userId) {
    AppState.userId = "op_" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("mono_userId", AppState.userId);
  }
  listenToUserProfile();
}

function listenToUserProfile() {
  showLoading(true, "CONNECTING OPERATOR DATABASE...");
  const userDocRef = doc(db, "accounts", AppState.userId);

  onSnapshot(userDocRef, async (snapshot) => {
    if (snapshot.exists()) {
      AppState.profile = snapshot.data();
      updateProfileUI(AppState.profile);
      showLoading(false);
      showScreen('mainMenuScreen');
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
      updateProfileUI(defaultProfile);
      showLoading(false);
      showScreen('mainMenuScreen');
    }
  });
}

function updateProfileUI(data) {
  document.getElementById('userDisplayName').innerText = data.customName;
  document.getElementById('userLevel').innerText = data.level || 1;
  document.getElementById('userCurrency').innerText = `🪙 ${data.coins || 0}`;
  document.getElementById('shopCurrency').innerText = `🪙 ${data.coins || 0}`;

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

  const k = stats.kills || 0;
  const d = stats.deaths || 1;
  const acc = Math.min(100, Math.floor((k / (k + d)) * 100));
  document.getElementById('statAccuracy').innerText = `${acc}%`;
}

// --------------------------------------------------------------------------
// 5. SHOP & ARMORY SYSTEM
// --------------------------------------------------------------------------
function renderShopUI() {
  const container = document.getElementById('shopGridContainer');
  container.innerHTML = '';

  Object.values(WEAPONS).forEach(wpn => {
    const isOwned = AppState.profile.ownedWeapons.includes(wpn.id);
    const card = document.createElement('div');
    card.className = `shop-card ${isOwned ? 'owned' : ''}`;
    card.innerHTML = `
      <h3>${wpn.name}</h3>
      <p style="font-size: 0.75rem; color: #8c8c8c;">DMG: ${wpn.damage} | MAG: ${wpn.ammoMax}</p>
      <div>${isOwned ? '<strong style="color:#fff;">[OWNED]</strong>' : `🪙 ${wpn.cost}`}</div>
      ${!isOwned ? `<button class="btn primary-btn" style="padding: 6px 12px; margin-top: 5px;" onclick="buyWeapon('${wpn.id}')">PURCHASE</button>` : ''}
    `;
    container.appendChild(card);
  });
}

window.buyWeapon = async function(weaponId) {
  const wpn = WEAPONS[weaponId];
  if (AppState.profile.coins < wpn.cost) {
    showToast("INSUFFICIENT FUNDS!");
    return;
  }

  const updatedCoins = AppState.profile.coins - wpn.cost;
  const updatedWeapons = [...AppState.profile.ownedWeapons, weaponId];

  const userDocRef = doc(db, "accounts", AppState.userId);
  await updateDoc(userDocRef, {
    coins: updatedCoins,
    ownedWeapons: updatedWeapons
  });

  showToast(`PURCHASED: ${wpn.name}`);
  renderShopUI();
};

// --------------------------------------------------------------------------
// 6. PHASER 3 MONOCHROME ARENA SCENE (SINGLE FLAT PLATFORM)
// --------------------------------------------------------------------------
class MonochromeArenaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MonochromeArenaScene' });
  }

  init(data) {
    this.isMultiplayer = data.isMultiplayer || false;

    // Player 1 State
    this.p1 = {
      sprite: null,
      health: 100,
      maxHealth: 100,
      shield: 50,
      maxShield: 50,
      weapon: WEAPONS.PISTOL,
      ammo: WEAPONS.PISTOL.ammoMax,
      score: 0,
      kills: 0,
      deaths: 0,
      killStreak: 0,
      storedPower: null,
      damageMultiplier: 1.0,
      facing: 'right'
    };

    // Bot Opponent State
    this.bot = {
      sprite: null,
      health: 100,
      shield: 50,
      score: 0,
      weapon: WEAPONS.PISTOL,
      facing: 'left'
    };

    this.bullets = null;
    this.enemyBullets = null;
    this.dropsGroup = null;
  }

  preload() {
    // GENERATE MONOCHROME TEXTURES DYNAMICALLY
    const createTexture = (key, width, height, drawCallback) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      drawCallback(ctx, width, height);
      this.textures.addBase64(key, canvas.toDataURL());
    };

    // 1. Single Flat Ground Platform (Pure Monochrome Flat Floor)
    createTexture('mono_ground', 1600, 60, (ctx, w, h) => {
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(w, 2);
      ctx.stroke();
    });

    // 2. Monochromatic Humanoid Body Avatar (Player 1 - White Silhouette with Visor)
    createTexture('p1_avatar_body', 32, 48, (ctx, w, h) => {
      // Head
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(10, 4, 12, 12);
      // Visor
      ctx.fillStyle = '#050505';
      ctx.fillRect(16, 8, 6, 3);
      // Torso & Arms
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(8, 18, 16, 16);
      // Legs
      ctx.fillRect(10, 36, 5, 12);
      ctx.fillRect(17, 36, 5, 12);
    });

    // 3. Monochromatic Humanoid Body Avatar (Opponent Bot - Charcoal/Gray Silhouette)
    createTexture('bot_avatar_body', 32, 48, (ctx, w, h) => {
      // Head
      ctx.fillStyle = '#8c8c8c';
      ctx.fillRect(10, 4, 12, 12);
      // Visor
      ctx.fillStyle = '#050505';
      ctx.fillRect(10, 8, 6, 3);
      // Torso & Arms
      ctx.fillStyle = '#8c8c8c';
      ctx.fillRect(8, 18, 16, 16);
      // Legs
      ctx.fillRect(10, 36, 5, 12);
      ctx.fillRect(17, 36, 5, 12);
    });

    // 4. Projectiles and Drops
    createTexture('mono_bullet', 10, 4, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    });

    createTexture('coin_pickup', 16, 16, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(8, 8, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#050505';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('C', 5, 11);
    });

    createTexture('power_pickup', 18, 18, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#050505';
      ctx.fillRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(7, 7, 4, 4);
    });
  }

  create() {
    AppState.activeScene = this;
    this.physics.world.setBounds(0, 0, 1600, 900);

    // Create Single Plain Flat Platform Floor
    const ground = this.physics.add.staticGroup();
    ground.create(800, 870, 'mono_ground').refreshBody();

    // Spawn Player 1
    this.p1.sprite = this.physics.add.sprite(200, 800, 'p1_avatar_body');
    this.p1.sprite.setCollideWorldBounds(true);
    this.physics.add.collider(this.p1.sprite, ground);

    // Spawn Opponent Bot on the single platform
    if (!this.isMultiplayer) {
      this.bot.sprite = this.physics.add.sprite(1400, 800, 'bot_avatar_body');
      this.bot.sprite.setCollideWorldBounds(true);
      this.physics.add.collider(this.bot.sprite, ground);
    }

    // Weapon Projectiles & Drops Setup
    this.bullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.dropsGroup = this.physics.add.group();

    this.physics.add.collider(this.dropsGroup, ground);
    this.physics.add.overlap(this.bullets, this.bot.sprite, this.handleBotHit, null, this);
    this.physics.add.overlap(this.enemyBullets, this.p1.sprite, this.handlePlayerHit, null, this);
    this.physics.add.overlap(this.p1.sprite, this.dropsGroup, this.collectDrop, null, this);

    // Key Controls
    this.keys = this.input.keyboard.addKeys('A,D,W,S,R,E');
    this.input.on('pointerdown', (pointer) => this.fireWeapon(pointer.worldX, pointer.worldY));

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
    if (!this.p1.sprite || !this.p1.sprite.body) return;

    // Movement Controls on Plain Flat Platform
    if (this.keys.A.isDown) {
      this.p1.sprite.setVelocityX(-280);
      this.p1.sprite.setFlipX(true);
      this.p1.facing = 'left';
    } else if (this.keys.D.isDown) {
      this.p1.sprite.setVelocityX(280);
      this.p1.sprite.setFlipX(false);
      this.p1.facing = 'right';
    } else {
      this.p1.sprite.setVelocityX(0);
    }

    if (this.keys.W.isDown && this.p1.sprite.body.touching.down) {
      this.p1.sprite.setVelocityY(-520);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.reloadWeapon();
    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) this.activateStoredPower();

    // AI Bot Behavior Logic
    if (!this.isMultiplayer && this.bot.sprite) {
      this.updateBotAI(time);
    }

    this.updateHUDDisplay();
  }

  fireWeapon(targetX, targetY) {
    if (this.p1.ammo <= 0) {
      this.reloadWeapon();
      return;
    }

    this.p1.ammo--;
    const bullet = this.bullets.create(this.p1.sprite.x, this.p1.sprite.y - 4, 'mono_bullet');
    bullet.damage = this.p1.weapon.damage * this.p1.damageMultiplier;

    let angle = Phaser.Math.Angle.Between(this.p1.sprite.x, this.p1.sprite.y, targetX, targetY);
    angle += Phaser.Math.FloatBetween(-this.p1.weapon.spread, this.p1.weapon.spread);

    this.physics.velocityFromRotation(angle, this.p1.weapon.speed, bullet.body.velocity);
    bullet.setRotation(angle);

    this.time.delayedCall(1600, () => { if (bullet.active) bullet.destroy(); });
  }

  updateBotAI(time) {
    const dist = Phaser.Math.Distance.Between(this.bot.sprite.x, this.bot.sprite.y, this.p1.sprite.x, this.p1.sprite.y);
    if (dist < 700) {
      if (this.bot.sprite.x < this.p1.sprite.x - 120) {
        this.bot.sprite.setVelocityX(140);
        this.bot.sprite.setFlipX(false);
      } else if (this.bot.sprite.x > this.p1.sprite.x + 120) {
        this.bot.sprite.setVelocityX(-140);
        this.bot.sprite.setFlipX(true);
      } else {
        this.bot.sprite.setVelocityX(0);
      }

      if (Phaser.Math.Between(0, 100) < 3) {
        const b = this.enemyBullets.create(this.bot.sprite.x, this.bot.sprite.y - 4, 'mono_bullet');
        b.damage = 10;
        const angle = Phaser.Math.Angle.Between(this.bot.sprite.x, this.bot.sprite.y, this.p1.sprite.x, this.p1.sprite.y);
        this.physics.velocityFromRotation(angle, 750, b.body.velocity);
      }
    }
  }

  handleBotHit(bullet, bot) {
    bot.health -= bullet.damage;
    bullet.destroy();

    if (bot.health <= 0) {
      bot.health = 100;
      bot.setPosition(Phaser.Math.Between(300, 1300), 800);

      this.p1.score += 100;
      this.p1.kills++;
      this.p1.killStreak++;

      this.checkEscalationProgression();
      this.triggerKillStreakBanner();
      this.rollDropSpawns(bot.x, bot.y);
    }
  }

  handlePlayerHit(player, bullet) {
    const dmg = bullet.damage || 10;
    bullet.destroy();

    if (this.p1.shield > 0) {
      this.p1.shield = Math.max(0, this.p1.shield - dmg);
    } else {
      this.p1.health -= dmg;
    }

    if (this.p1.health <= 0) {
      this.p1.deaths++;
      this.p1.killStreak = 0;
      this.p1.health = 100;
      this.p1.shield = 50;
      this.p1.sprite.setPosition(200, 800);
      showToast("OPERATOR ELIMINATED!");
    }
  }

  checkEscalationProgression() {
    const unlockedRank = [...ESCALATION_RANKS].reverse().find(r => this.p1.kills >= r.kills);
    if (unlockedRank && unlockedRank.weapon !== this.p1.weapon) {
      this.p1.weapon = unlockedRank.weapon;
      this.p1.ammo = this.p1.weapon.ammoMax;
      showToast(`ESCALATION: UNLOCKED ${this.p1.weapon.name}!`);
    }
  }

  triggerKillStreakBanner() {
    const banner = document.getElementById('hudKillStreakBanner');
    let text = "";
    if (this.p1.killStreak === 2) text = "DOUBLE KILL";
    else if (this.p1.killStreak === 3) text = "TRIPLE KILL";
    else if (this.p1.killStreak === 5) text = "KILLING SPREE";
    else if (this.p1.killStreak === 7) text = "RAMPAGE";
    else if (this.p1.killStreak >= 10) text = "UNSTOPPABLE";

    if (text) {
      banner.innerText = text;
      banner.classList.remove('hidden');
      this.time.delayedCall(2200, () => banner.classList.add('hidden'));
    }
  }

  rollDropSpawns(x, y) {
    // 30% Chance rare coin drop on platform floor
    if (Phaser.Math.Between(1, 100) <= 30) {
      const coin = this.dropsGroup.create(x, y, 'coin_pickup');
      coin.dropType = 'COIN';
      coin.setBounce(0.3);
    }

    // 15% Chance power drop
    if (Phaser.Math.Between(1, 100) <= 15) {
      const powerKeys = Object.keys(POWERS);
      const power = this.dropsGroup.create(x + 12, y, 'power_pickup');
      power.dropType = 'POWER';
      power.powerData = POWERS[powerKeys[Math.floor(Math.random() * powerKeys.length)]];
      power.setBounce(0.3);
    }
  }

  collectDrop(p, drop) {
    if (drop.dropType === 'COIN') {
      AppState.profile.coins = (AppState.profile.coins || 0) + 25;
      showToast("ACQUIRED 🪙 25 COINS!");
    } else if (drop.dropType === 'POWER') {
      this.p1.storedPower = drop.powerData;
      document.getElementById('hudPowerSlot').innerText = `${drop.powerData.name} [E]`;
      document.getElementById('hudPowerSlot').classList.add('active');
      showToast(`POWER LOADED: ${drop.powerData.name}`);
    }
    drop.destroy();
  }

  activateStoredPower() {
    if (!this.p1.storedPower) return;

    const p = this.p1.storedPower;
    if (p.id === 'HEALTH_BOOST') this.p1.health = Math.min(100, this.p1.health + 40);
    else if (p.id === 'FULL_HEAL') this.p1.health = 100;
    else if (p.id === 'DAMAGE_BOOST') {
      this.p1.damageMultiplier = 1.5;
      this.time.delayedCall(10000, () => this.p1.damageMultiplier = 1.0);
    } else if (p.id === 'SHIELD') this.p1.shield = 100;

    showToast(`ACTIVATED: ${p.name}`);
    this.p1.storedPower = null;
    document.getElementById('hudPowerSlot').innerText = "POWER: NONE [E]";
    document.getElementById('hudPowerSlot').classList.remove('active');
  }

  reloadWeapon() {
    this.p1.ammo = this.p1.weapon.ammoMax;
    showToast("RELOADED!");
  }

  updateHUDDisplay() {
    document.getElementById('hudP1HealthFill').style.width = `${this.p1.health}%`;
    document.getElementById('hudP1ShieldFill').style.width = `${(this.p1.shield / 50) * 100}%`;
    document.getElementById('hudP1Weapon').innerText = this.p1.weapon.name;
    document.getElementById('hudP1Ammo').innerText = `${this.p1.ammo}/${this.p1.weapon.ammoMax}`;
    document.getElementById('hudP1Kills').innerText = this.p1.kills;
    document.getElementById('hudP1Score').innerText = this.p1.score;

    if (this.bot.sprite) {
      document.getElementById('hudP2HealthFill').style.width = `${this.bot.health}%`;
      document.getElementById('hudP2Score').innerText = this.bot.score;
    }
  }

  endMatch() {
    this.scene.stop();
    document.getElementById('gameContainer').classList.add('hidden');
    finishMatchAndSaveResults(this.p1.score, this.p1.kills, this.p1.deaths, this.p1.killStreak);
  }
}

// --------------------------------------------------------------------------
// 7. PERSISTENCE & RESULTS TERMINATION LOOP
// --------------------------------------------------------------------------
async function finishMatchAndSaveResults(score, kills, deaths, streak) {
  showLoading(true, "WRITING MATCH RESULTS...");

  const xpEarned = Math.floor(score * 1.5) + 50;
  const userDocRef = doc(db, "accounts", AppState.userId);
  const currentSnap = await getDoc(userDocRef);
  const currentData = currentSnap.data();

  const newXp = (currentData.xp || 0) + xpEarned;
  let newLevel = currentData.level || 1;
  if (newXp >= newLevel * 1000) newLevel++;

  const stats = currentData.stats || { matches: 0, wins: 0, kills: 0, deaths: 0, bestStreak: 0 };

  await updateDoc(userDocRef, {
    xp: newXp,
    level: newLevel,
    coins: AppState.profile.coins,
    stats: {
      matches: stats.matches + 1,
      wins: stats.wins + (score >= 200 ? 1 : 0),
      kills: stats.kills + kills,
      deaths: stats.deaths + deaths,
      bestStreak: Math.max(stats.bestStreak, streak)
    }
  });

  showLoading(false);

  document.getElementById('rewardXp').innerText = `+${xpEarned} XP`;
  document.getElementById('rewardCurrency').innerText = `+0 🪙 (IN-MATCH PICKUPS SAVED)`;
  document.getElementById('scoreboardBody').innerHTML = `
    <tr>
      <td>1</td>
      <td>${AppState.profile.customName}</td>
      <td>${kills}</td>
      <td>${deaths}</td>
      <td>${score}</td>
    </tr>
  `;

  showScreen('matchResultsScreen');
}

// --------------------------------------------------------------------------
// 8. LAUNCH ENGINE
// --------------------------------------------------------------------------
function launchPhaserGame(isMultiplayer = false) {
  showScreen('gameContainer');

  if (AppState.currentGame) {
    AppState.currentGame.destroy(true);
  }

  const config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: 'phaserRenderCanvas',
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 900 }, debug: false }
    },
    scene: [MonochromeArenaScene]
  };

  AppState.currentGame = new Phaser.Game(config);
  AppState.currentGame.scene.start('MonochromeArenaScene', { isMultiplayer });
}

// --------------------------------------------------------------------------
// 9. UI EVENT LISTENERS
// --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initAuth();

  document.getElementById('btnSinglePlayer').addEventListener('click', () => launchPhaserGame(false));
  document.getElementById('btnShop').addEventListener('click', () => {
    renderShopUI();
    showScreen('shopModal');
  });
  document.getElementById('btnCloseShop').addEventListener('click', () => showScreen('mainMenuScreen'));
  document.getElementById('btnProfile').addEventListener('click', () => showScreen('profileModal'));
  document.getElementById('closeProfileBtn').addEventListener('click', () => showScreen('mainMenuScreen'));
  document.getElementById('btnResultsContinue').addEventListener('click', () => showScreen('mainMenuScreen'));
});
