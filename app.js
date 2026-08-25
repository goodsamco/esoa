/* ==========================================================================
   ADVANCED COMBAT ARENA SCENE WITH SHOOTING ENEMY AI & VISUAL FX
   ========================================================================== */

class AdvancedArenaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'AdvancedArenaScene' });
  }

  init(data) {
    this.isMultiplayer = data.isMultiplayer || false;
    this.isLocalTwoPlayer = data.isLocalTwoPlayer || false;

    // Player State
    this.p1 = {
      sprite: null,
      health: 100,
      maxHealth: 100,
      jetpackFuel: 100,
      maxFuel: 100,
      weapon: WEAPONS.AK47,
      ammo: WEAPONS.AK47.ammoMax,
      reserveAmmo: 120,
      score: 0,
      lastFired: 0,
      lastDamageTime: 0,
      isFlying: false
    };

    this.enemyGroup = null;
    this.playerBullets = null;
    this.enemyBullets = null;
    this.particleEmitters = {};
  }

  preload() {
    const drawRect = (key, color, w, h) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(color, 1);
      g.fillRect(0, 0, w, h);
      g.generateTexture(key, w, h);
    };

    drawRect('hero_sprite', 0x00ffcc, 28, 42);
    drawRect('enemy_sprite', 0xff2255, 28, 42);
    drawRect('p_bullet', 0x00ffff, 10, 4);
    drawRect('e_bullet', 0xffaa00, 10, 4);
    drawRect('spark_particle', 0xffcc00, 4, 4);
    drawRect('jetpack_particle', 0xff6600, 6, 6);
    drawRect('plat_metal', 0x2a3646, 200, 20);
    drawRect('ground_metal', 0x151c24, 1600, 40);
  }

  create() {
    AppState.activeScene = this;
    this.physics.world.setBounds(0, 0, 1600, 900);

    // Arena Platforms
    const platforms = this.physics.add.staticGroup();
    platforms.create(800, 880, 'ground_metal').refreshBody();
    platforms.create(350, 680, 'plat_metal');
    platforms.create(1250, 680, 'plat_metal');
    platforms.create(800, 500, 'plat_metal');
    platforms.create(350, 320, 'plat_metal');
    platforms.create(1250, 320, 'plat_metal');

    // Hero Character Setup
    this.p1.sprite = this.physics.add.sprite(200, 750, 'hero_sprite');
    this.p1.sprite.setCollideWorldBounds(true);
    this.physics.add.collider(this.p1.sprite, platforms);

    // Bullet Groups
    this.playerBullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();

    // Particle FX Systems
    this.setupParticles();

    // Spawn Shooting Enemies
    this.enemyGroup = this.physics.add.group();
    this.spawnShootingEnemies(4);
    this.physics.add.collider(this.enemyGroup, platforms);

    // Collision Detection
    this.physics.add.overlap(this.playerBullets, this.enemyGroup, this.handleEnemyHit, null, this);
    this.physics.add.overlap(this.enemyBullets, this.p1.sprite, this.handlePlayerHit, null, this);
    this.physics.add.collider(this.playerBullets, platforms, (b) => this.createSparkFX(b.x, b.y));
    this.physics.add.collider(this.enemyBullets, platforms, (b) => this.createSparkFX(b.x, b.y));

    // Inputs
    this.keys = this.input.keyboard.addKeys('A,D,W,S,R');
    this.input.on('pointerdown', (pointer) => this.firePlayerWeapon(pointer.worldX, pointer.worldY));

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

  update(time, delta) {
    if (!this.p1.sprite || !this.p1.sprite.body) return;

    // Player Lateral Movement
    if (this.keys.A.isDown) {
      this.p1.sprite.setVelocityX(-260);
    } else if (this.keys.D.isDown) {
      this.p1.sprite.setVelocityX(260);
    } else {
      this.p1.sprite.setVelocityX(0);
    }

    // Jetpack Flying Logic
    if (this.keys.W.isDown && this.p1.jetpackFuel > 0) {
      this.p1.sprite.setVelocityY(-400);
      this.p1.jetpackFuel = Math.max(0, this.p1.jetpackFuel - 0.7);
      this.particleEmitters.jetpack.emitParticleAt(this.p1.sprite.x, this.p1.sprite.y + 20);
    } else if (this.p1.sprite.body.touching.down) {
      this.p1.jetpackFuel = Math.min(this.p1.maxFuel, this.p1.jetpackFuel + 0.9);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.reloadWeapon();

    // Out-of-Combat Health Regeneration
    if (time - this.p1.lastDamageTime > 5000 && this.p1.health < this.p1.maxHealth) {
      this.p1.health = Math.min(this.p1.maxHealth, this.p1.health + 0.1);
    }

    // Advanced Enemy AI Engine Loop
    this.updateEnemyAI(time);

    // Update HUD
    this.updateHUDDisplay();
  }

  setupParticles() {
    this.particleEmitters.sparks = this.add.particles(0, 0, 'spark_particle', {
      speed: { min: 50, max: 200 },
      scale: { start: 1, end: 0 },
      lifespan: 300,
      emitting: false
    });

    this.particleEmitters.jetpack = this.add.particles(0, 0, 'jetpack_particle', {
      speedY: { min: 100, max: 200 },
      scale: { start: 1, end: 0 },
      lifespan: 200,
      emitting: false
    });
  }

  spawnShootingEnemies(count) {
    for (let i = 0; i < count; i++) {
      const enemy = this.enemyGroup.create(400 + i * 300, 200, 'enemy_sprite');
      enemy.setCollideWorldBounds(true);
      enemy.health = 100;
      enemy.lastFired = 0;
      enemy.fireRate = Phaser.Math.Between(800, 1400);
    }
  }

  updateEnemyAI(time) {
    this.enemyGroup.getChildren().forEach(enemy => {
      if (!enemy.active) return;

      const distToHero = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.p1.sprite.x, this.p1.sprite.y);

      // Enemy Vision Range Trigger (600px)
      if (distToHero < 600) {
        // Line-of-sight Movement
        if (enemy.x < this.p1.sprite.x - 80) enemy.setVelocityX(140);
        else if (enemy.x > this.p1.sprite.x + 80) enemy.setVelocityX(-140);
        else enemy.setVelocityX(0);

        // Jump over platforms
        if (enemy.body.touching.down && (this.p1.sprite.y < enemy.y - 100) && Phaser.Math.Between(0, 100) < 3) {
          enemy.setVelocityY(-420);
        }

        // Enemy Firing Mechanism
        if (time > enemy.lastFired) {
          this.fireEnemyWeapon(enemy);
          enemy.lastFired = time + enemy.fireRate;
        }
      }
    });
  }

  firePlayerWeapon(targetX, targetY) {
    if (this.p1.ammo <= 0) {
      this.reloadWeapon();
      return;
    }

    this.p1.ammo--;
    const bullet = this.playerBullets.create(this.p1.sprite.x, this.p1.sprite.y, 'p_bullet');
    bullet.damage = this.p1.weapon.damage;

    // Calculate Vector Angle with Spread Variation
    let angle = Phaser.Math.Angle.Between(this.p1.sprite.x, this.p1.sprite.y, targetX, targetY);
    angle += Phaser.Math.FloatBetween(-this.p1.weapon.spread, this.p1.weapon.spread);

    this.physics.velocityFromRotation(angle, this.p1.weapon.speed, bullet.body.velocity);
    bullet.setRotation(angle);

    // Screen Shake Recoil Effect
    this.cameras.main.shake(50, 0.003);

    this.time.delayedCall(2000, () => { if (bullet.active) bullet.destroy(); });
  }

  fireEnemyWeapon(enemy) {
    const bullet = this.enemyBullets.create(enemy.x, enemy.y, 'e_bullet');
    bullet.damage = 18;

    // Aim toward hero position
    let angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.p1.sprite.x, this.p1.sprite.y);
    angle += Phaser.Math.FloatBetween(-0.08, 0.08); // Intentional bot aim spread

    this.physics.velocityFromRotation(angle, 700, bullet.body.velocity);
    bullet.setRotation(angle);

    this.time.delayedCall(2000, () => { if (bullet.active) bullet.destroy(); });
  }

  handlePlayerHit(hero, bullet) {
    const dmg = bullet.damage || 15;
    bullet.destroy();

    this.p1.health -= dmg;
    this.p1.lastDamageTime = this.time.now;

    // Directional Screen Shake on Damage Impact
    this.cameras.main.shake(150, 0.015);
    this.createSparkFX(hero.x, hero.y);

    if (this.p1.health <= 0) {
      this.p1.health = this.p1.maxHealth;
      this.p1.sprite.setPosition(200, 100);
      showToast("ELIMINATED! RESPAWNING...");
    }
  }

  handleEnemyHit(bullet, enemy) {
    const dmg = bullet.damage || 25;
    bullet.destroy();

    enemy.health -= dmg;
    this.createSparkFX(enemy.x, enemy.y);

    if (enemy.health <= 0) {
      enemy.destroy();
      this.p1.score += 100;

      // Respawn timer for defeated enemy
      this.time.delayedCall(3000, () => {
        const respawned = this.enemyGroup.create(Phaser.Math.Between(300, 1300), 100, 'enemy_sprite');
        respawned.setCollideWorldBounds(true);
        respawned.health = 100;
        respawned.lastFired = 0;
        respawned.fireRate = Phaser.Math.Between(800, 1400);
      });
    }
  }

  createSparkFX(x, y) {
    this.particleEmitters.sparks.emitParticleAt(x, y, 8);
  }

  reloadWeapon() {
    if (this.p1.ammo === this.p1.weapon.ammoMax || this.p1.reserveAmmo <= 0) return;
    const needed = this.p1.weapon.ammoMax - this.p1.ammo;
    const reloaded = Math.min(needed, this.p1.reserveAmmo);
    this.p1.reserveAmmo -= reloaded;
    this.p1.ammo += reloaded;
    showToast("WEAPON RELOADED!");
  }

  updateHUDDisplay() {
    document.getElementById('hudHealthFill').style.width = `${Math.max(0, this.p1.health)}%`;
    document.getElementById('hudHealthText').innerText = Math.ceil(this.p1.health);
    document.getElementById('hudAmmoText').innerText = `${this.p1.ammo} / ${this.p1.reserveAmmo}`;
    document.getElementById('hudScoreValue').innerText = this.p1.score;
  }

  endMatch() {
    this.scene.stop();
    document.getElementById('gameContainer').classList.add('hidden');
    finishMatchAndSaveResults(this.p1.score);
  }
}
