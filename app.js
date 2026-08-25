/* ==========================================================================
   MINI COMBAT 2D - ADVANCED GAMEPLAY & SERVER-AUTHORITATIVE ARCHITECTURE
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
  appId: "1:500705386198:web:96f189662bc2aa99cf7377"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// --------------------------------------------------------------------------
// 2. CONFIGURATIONS, WEAPONS & POWER DROPS
// --------------------------------------------------------------------------
const AppState = {
  userId: localStorage.getItem("userId") || null,
  profile: null,
  activeRoomId: null,
  isHost: false,
  currentGame: null,
  activeScene: null
};

const WEAPONS = {
  PISTOL: { id: "PISTOL", name: "Pistol", damage: 15, fireRate: 350, ammoMax: 12, speed: 850, spread: 0.02, cost: 0 },
  SMG: { id: "SMG", name: "SMG", damage: 12, fireRate: 90, ammoMax: 30, speed: 900, spread: 0.08, cost: 100 },
  SHOTGUN: { id: "SHOTGUN", name: "Shotgun", damage: 14, fireRate: 750, ammoMax: 6, speed: 750, pellets: 5, spread: 0.22, cost: 250 },
  AK47: { id: "AK47", name: "Assault Rifle", damage: 24, fireRate: 140, ammoMax: 30, speed: 950, spread: 0.05, cost: 500 },
  SNIPER: { id: "SNIPER", name: "Sniper Rifle", damage: 85, fireRate: 1200, ammoMax: 5, speed: 1400, spread: 0.002, cost: 750 },
  ROCKET: { id: "ROCKET", name: "Rocket Launcher", damage: 110, fireRate: 1500, ammoMax: 1, speed: 500, splashRadius: 100, cost: 1000 }
};

const POWERS = {
  HEALTH_BOOST: { id: "HEALTH_BOOST", name: "Health Boost (+40%)" },
  FULL_HEAL: { id: "FULL_HEAL", name: "Full Heal (100%)" },
  DAMAGE_BOOST: { id: "DAMAGE_BOOST", name: "Damage Boost (+50% 10s)" },
  SHIELD: { id: "SHIELD", name: "Shield (Absorb Damage)" }
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
// 3. UI HELPER FUNCTIONS
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
// 4. USER AUTHENTICATION & PROFILE DATA
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
}

// --------------------------------------------------------------------------
// 5. SHOP ENGINE
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
      <p>Damage: ${wpn.damage} | Mag: ${wpn.ammoMax}</p>
      <div>${isOwned ? '<strong>OWNED</strong>' : `🪙 ${wpn.cost}`}</div>
      ${!isOwned ? `<button class="btn primary-btn btn-sm" onclick="buyWeapon('${wpn.id}')">BUY</button>` : ''}
    `;
    container.appendChild(card);
  });
}

window.buyWeapon = async function(weaponId) {
  const wpn = WEAPONS[weaponId];
  if (AppState.profile.coins < wpn.cost) {
    showToast("NOT ENOUGH COINS!");
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
// 6. PHASER 3 ADVANCED COMBAT SCENE
// --------------------------------------------------------------------------
class AdvancedArenaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'AdvancedArenaScene' });
  }

  init(data) {
    this.isMultiplayer = data.isMultiplayer || false;

    // Player State
    this.p1 = {
      sprite: null,
      health: 100,
      maxHealth: 100,
      shield: 50,
      maxShield: 50,
      weapon: WEAPONS.PISTOL,
      ammo: WEAPONS.PISTOL.ammoMax,
      reserveAmmo: 90,
      score: 0,
      kills: 0,
      deaths: 0,
      killStreak: 0,
      storedPower: null,
      damageMultiplier: 1.0
    };

    this.bot = {
      sprite: null,
      health: 100,
      shield: 50,
      score: 0,
      weapon: WEAPONS.PISTOL
    };

    this.bullets = null;
    this.enemyBullets = null;
    this.dropsGroup = null;
  }

  preload() {
    const drawRect = (key, color, w, h) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(color, 1);
      g.fillRect(0, 0, w, h);
      g.generateTexture(key, w, h);
    };

    drawRect('p1_skin', 0x00f0ff, 28, 42);
    drawRect('bot_skin', 0xff2a6d, 28, 42);
    drawRect('bullet_norm', 0xffff00, 8, 4);
    drawRect('coin_drop', 0xffb703, 16, 16);
    drawRect('power_drop', 0x05ffa1, 20, 20);
    drawRect('plat_metal', 0x2e3846, 200, 20);
    drawRect('ground_metal', 0x161c26, 1600, 40);
  }

  create() {
    AppState.activeScene = this;
    this.physics.world.setBounds(0, 0, 1600, 900);

    // Map Design with Vertical Combat Structures
    const platforms = this.physics.add.staticGroup();
    platforms.create(800, 880, 'ground_metal').refreshBody();
    platforms.create(350, 680, 'plat_metal');
    platforms.create(1250, 680, 'plat_metal');
    platforms.create(800, 500, 'plat_metal');
    platforms.create(350, 320, 'plat_metal');
    platforms.create(1250, 320, 'plat_metal');

    // Spawn Player 1
    this.p1.sprite = this.physics.add.sprite(200, 750, 'p1_skin');
    this.p1.sprite.setCollideWorldBounds(true);
    this.physics.add.collider(this.p1.sprite, platforms);

    // Spawn Enemy Bot (Single Player mode)
    if (!this.isMultiplayer) {
      this.bot.sprite = this.physics.add.sprite(1400, 750, 'bot_skin');
      this.bot.sprite.setCollideWorldBounds(true);
      this.physics.add.collider(this.bot.sprite, platforms);
    }

    // Groups & Collisions
    this.bullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.dropsGroup = this.physics.add.group();

    this.physics.add.collider(this.dropsGroup, platforms);
    this.physics.add.overlap(this.bullets, this.bot.sprite, this.handleBotHit, null, this);
    this.physics.add.overlap(this.enemyBullets, this.p1.sprite, this.handlePlayerHit, null, this);
    this.physics.add.overlap(this.p1.sprite, this.dropsGroup, this.collectDrop, null, this);

    // Controls
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

    // Movement Loop
    if (this.keys.A.isDown) this.p1.sprite.setVelocityX(-260);
    else if (this.keys.D.isDown) this.p1.sprite.setVelocityX(260);
    else this.p1.sprite.setVelocityX(0);

    if (this.keys.W.isDown && this.p1.sprite.body.touching.down) {
      this.p1.sprite.setVelocityY(-500);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.reloadWeapon();
    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) this.activateStoredPower();

    // AI Logic Engine
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
    const bullet = this.bullets.create(this.p1.sprite.x, this.p1.sprite.y, 'bullet_norm');
    bullet.damage = this.p1.weapon.damage * this.p1.damageMultiplier;

    let angle = Phaser.Math.Angle.Between(this.p1.sprite.x, this.p1.sprite.y, targetX, targetY);
    angle += Phaser.Math.FloatBetween(-this.p1.weapon.spread, this.p1.weapon.spread);

    this.physics.velocityFromRotation(angle, this.p1.weapon.speed, bullet.body.velocity);
    bullet.setRotation(angle);

    this.time.delayedCall(1800, () => { if (bullet.active) bullet.destroy(); });
  }

  updateBotAI(time) {
    const dist = Phaser.Math.Distance.Between(this.bot.sprite.x, this.bot.sprite.y, this.p1.sprite.x, this.p1.sprite.y);
    if (dist < 500) {
      if (this.bot.sprite.x < this.p1.sprite.x - 100) this.bot.sprite.setVelocityX(120);
      else if (this.bot.sprite.x > this.p1.sprite.x + 100) this.bot.sprite.setVelocityX(-120);

      if (Phaser.Math.Between(0, 100) < 2) {
        const b = this.enemyBullets.create(this.bot.sprite.x, this.bot.sprite.y, 'bullet_norm');
        b.damage = 10;
        const angle = Phaser.Math.Angle.Between(this.bot.sprite.x, this.bot.sprite.y, this.p1.sprite.x, this.p1.sprite.y);
        this.physics.velocityFromRotation(angle, 700, b.body.velocity);
      }
    }
  }

  handleBotHit(bullet, bot) {
    bot.health -= bullet.damage;
    bullet.destroy();

    if (bot.health <= 0) {
      bot.health = 100;
      bot.setPosition(Phaser.Math.Between(200, 1400), 100);

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
      this.p1.sprite.setPosition(200, 100);
      showToast("ELIMINATED!");
    }
  }

  checkEscalationProgression() {
    const unlockedRank = [...ESCALATION_RANKS].reverse().find(r => this.p1.kills >= r.kills);
    if (unlockedRank && unlockedRank.weapon !== this.p1.weapon) {
      this.p1.weapon = unlockedRank.weapon;
      this.p1.ammo = this.p1.weapon.ammoMax;
      showToast(`MATCH ESCALATION: UNLOCKED ${this.p1.weapon.name}!`);
    }
  }

  triggerKillStreakBanner() {
    const banner = document.getElementById('hudKillStreakBanner');
    let text = "";
    if (this.p1.killStreak === 2) text = "DOUBLE KILL!";
    else if (this.p1.killStreak === 3) text = "TRIPLE KILL!";
    else if (this.p1.killStreak === 5) text = "KILLING SPREE!";
    else if (this.p1.killStreak === 7) text = "RAMPAGE!";
    else if (this.p1.killStreak >= 10) text = "UNSTOPPABLE!";

    if (text) {
      banner.innerText = text;
      banner.classList.remove('hidden');
      this.time.delayedCall(2000, () => banner.classList.add('hidden'));
    }
  }

  rollDropSpawns(x, y) {
    // 25% Chance rare coin drop
    if (Phaser.Math.Between(1, 100) <= 25) {
      const coin = this.dropsGroup.create(x, y, 'coin_drop');
      coin.dropType = 'COIN';
      coin.setBounce(0.5);
    }

    // 10% Chance power drop
    if (Phaser.Math.Between(1, 100) <= 10) {
      const powerKeys = Object.keys(POWERS);
      const power = this.dropsGroup.create(x + 10, y, 'power_drop');
      power.dropType = 'POWER';
      power.powerData = POWERS[powerKeys[Math.floor(Math.random() * powerKeys.length)]];
      power.setBounce(0.5);
    }
  }

  collectDrop(p, drop) {
    if (drop.dropType === 'COIN') {
      AppState.profile.coins = (AppState.profile.coins || 0) + 25;
      showToast("COLLECTED 🪙 25 COINS!");
    } else if (drop.dropType === 'POWER') {
      this.p1.storedPower = drop.powerData;
      document.getElementById('hudPowerSlot').innerText = `POWER: ${drop.powerData.name} [E]`;
      document.getElementById('hudPowerSlot').classList.add('active');
      showToast(`ACQUIRED POWER: ${drop.powerData.name}`);
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
// 7. PERSISTENCE & RESULTS ENGINE
// --------------------------------------------------------------------------
async function finishMatchAndSaveResults(score, kills, deaths, streak) {
  showLoading(true, "SAVING PROGRESS...");

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
  document.getElementById('rewardCurrency').innerText = `+0 🪙 (COLLECTED IN MATCH)`;
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
      arcade: { gravity: { y: 800 }, debug: false }
    },
    scene: [AdvancedArenaScene]
  };

  AppState.currentGame = new Phaser.Game(config);
  AppState.currentGame.scene.start('AdvancedArenaScene', { isMultiplayer });
}

// --------------------------------------------------------------------------
// 9. EVENT LISTENERS
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
