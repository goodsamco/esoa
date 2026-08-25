/* ==========================================================================
   Monochrome Line Duel - Main Game Logic
   Handles: Firebase Synchronization, Local Prediction, LERP Movement, Controls,
            Bullets, HUD, and State Transitions.
   ========================================================================== */

class GameEngine {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // State Tracking
        this.currentRoomCode = null;
        this.mySlotIndex = -1;
        this.isHost = false;
        this.maxPlayers = 2;
        this.gameState = 'LOBBY'; // 'LOBBY', 'WAITING', 'PLAYING', 'ENDED'

        // Local Player State & Input Tracking
        this.localPlayer = null;
        this.keys = { left: false, right: false, up: false, fire: false };
        this.touchControls = { left: false, right: false, up: false, fire: false };
        this.canShoot = true;
        this.lastShotTime = 0;

        // Synchronized Entities (Room Data)
        this.players = {};   // Index -> Player Object
        this.bullets = [];   // Array of active bullets
        this.scores = { left: 0, right: 0 };
        this.timerSeconds = 180;

        // Firebase References & Listeners
        this.roomRef = null;
        this.roomListener = null;

        // Bindings & Initialization
        this.initDOM();
        this.initControls();
        this.gameLoop = this.gameLoop.bind(this);
        requestAnimationFrame(this.gameLoop);
    }

    /* ----------------------------------------------------------------------
       1. DOM & UI LISTENERS
       ---------------------------------------------------------------------- */
    initDOM() {
        // Overlay DOM Elements
        this.lobbyOverlay = document.getElementById('lobbyOverlay');
        this.waitingOverlay = document.getElementById('waitingOverlay');
        this.gameOverOverlay = document.getElementById('gameOverOverlay');
        this.gameHud = document.getElementById('gameHud');
        
        // HUD Elements
        this.roomCodeDisplay = document.getElementById('roomCodeDisplay');
        this.playerCountDisplay = document.getElementById('playerCountDisplay');
        this.waitingStatus = document.getElementById('waitingStatus');
        this.playerListGrid = document.getElementById('playerList');
        this.scoreLeft = document.getElementById('scoreLeft');
        this.scoreRight = document.getElementById('scoreRight');
        this.gameTimer = document.getElementById('gameTimer');
        this.winnerText = document.getElementById('winnerText');

        // Buttons
        document.getElementById('createRoomBtn').addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.joinRoom());
        document.getElementById('leaveRoomBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('playAgainBtn').addEventListener('click', () => this.leaveRoom());
    }

    /* ----------------------------------------------------------------------
       2. CONTROLS (DESKTOP KEYBOARD & MOBILE TOUCH)
       ---------------------------------------------------------------------- */
    initControls() {
        // Keyboard Controls
        window.addEventListener('keydown', (e) => {
            if (this.gameState !== 'PLAYING') return;
            if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = true;
            if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = true;
            if (e.code === 'KeyW' || e.code === 'Space' || e.code === 'ArrowUp') this.keys.up = true;
            if (e.code === 'KeyF' || e.code === 'KeyJ') this.keys.fire = true;
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = false;
            if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = false;
            if (e.code === 'KeyW' || e.code === 'Space' || e.code === 'ArrowUp') this.keys.up = false;
            if (e.code === 'KeyF' || e.code === 'KeyJ') this.keys.fire = false;
        });

        // Touch Control Listeners
        const setupTouch = (id, keyName) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            
            const startHandler = (e) => {
                e.preventDefault();
                this.touchControls[keyName] = true;
            };
            const endHandler = (e) => {
                e.preventDefault();
                this.touchControls[keyName] = false;
            };

            btn.addEventListener('touchstart', startHandler);
            btn.addEventListener('touchend', endHandler);
            btn.addEventListener('mousedown', startHandler);
            btn.addEventListener('mouseup', endHandler);
            btn.addEventListener('mouseleave', endHandler);
        };

        setupTouch('btnLeft', 'left');
        setupTouch('btnRight', 'right');
        setupTouch('btnJump', 'up');
        setupTouch('btnFire', 'fire');
    }

    /* ----------------------------------------------------------------------
       3. FIREBASE ROOM MANAGEMENT (CREATE, JOIN, LEAVE)
       ---------------------------------------------------------------------- */
    async createRoom() {
        if (!window.rtdb || !window.rtdbUtils) return alert("Firebase is still initializing. Please wait...");

        const select = document.getElementById('maxPlayersSelect');
        this.maxPlayers = parseInt(select.value, 10);
        this.currentRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.isHost = true;
        this.mySlotIndex = 0;

        const userName = document.getElementById('userDisplayName').innerText;
        const avatarUrl = document.getElementById('userDisplayAvatar').src;

        const roomData = {
            code: this.currentRoomCode,
            maxPlayers: this.maxPlayers,
            state: 'WAITING',
            scores: { left: 0, right: 0 },
            timer: 180,
            players: {
                0: {
                    id: window.currentUserId,
                    name: userName,
                    avatar: avatarUrl,
                    x: 100,
                    y: 300,
                    vx: 0,
                    vy: 0,
                    side: 'left',
                    isGrounded: true,
                    facing: 'right'
                }
            }
        };

        const { ref, set, onDisconnect } = window.rtdbUtils;
        this.roomRef = ref(window.rtdb, `rooms/${this.currentRoomCode}`);
        
        await set(this.roomRef, roomData);
        onDisconnect(ref(window.rtdb, `rooms/${this.currentRoomCode}/players/0`)).remove();

        this.listenToRoom();
        this.showWaitingOverlay();
    }

    async joinRoom() {
        if (!window.rtdb || !window.rtdbUtils) return alert("Firebase is still initializing. Please wait...");

        const input = document.getElementById('joinRoomInput');
        const code = input.value.trim().toUpperCase();
        if (code.length !== 6) return alert("Please enter a valid 6-character Room Code.");

        const { ref, get, update, onDisconnect } = window.rtdbUtils;
        const targetRef = ref(window.rtdb, `rooms/${code}`);
        const snapshot = await get(targetRef);

        if (!snapshot.exists()) return alert("Room does not exist.");
        const data = snapshot.val();

        if (data.state !== 'WAITING') return alert("Room has already started or finished.");

        const existingSlots = data.players ? Object.keys(data.players).map(Number) : [];
        if (existingSlots.length >= data.maxPlayers) return alert("Room is full.");

        // Find available slot index
        let freeSlot = -1;
        for (let i = 0; i < data.maxPlayers; i++) {
            if (!existingSlots.includes(i)) {
                freeSlot = i;
                break;
            }
        }

        if (freeSlot === -1) return alert("Unable to assign player slot.");

        this.currentRoomCode = code;
        this.maxPlayers = data.maxPlayers;
        this.isHost = false;
        this.mySlotIndex = freeSlot;
        this.roomRef = targetRef;

        const userName = document.getElementById('userDisplayName').innerText;
        const avatarUrl = document.getElementById('userDisplayAvatar').src;
        const side = freeSlot % 2 === 0 ? 'left' : 'right';
        const startX = side === 'left' ? 100 + (freeSlot * 40) : 700 - (freeSlot * 40);

        const newPlayerData = {
            id: window.currentUserId,
            name: userName,
            avatar: avatarUrl,
            x: startX,
            y: 300,
            vx: 0,
            vy: 0,
            side: side,
            isGrounded: true,
            facing: side === 'left' ? 'right' : 'left'
        };

        await update(ref(window.rtdb, `rooms/${code}/players/${freeSlot}`), newPlayerData);
        onDisconnect(ref(window.rtdb, `rooms/${code}/players/${freeSlot}`)).remove();

        this.listenToRoom();
        this.showWaitingOverlay();
    }

    listenToRoom() {
        const { onValue } = window.rtdbUtils;
        this.roomListener = onValue(this.roomRef, (snapshot) => {
            if (!snapshot.exists()) {
                this.leaveRoom();
                return;
            }

            const data = snapshot.val();
            this.handleRoomUpdate(data);
        });
    }

    leaveRoom() {
        if (this.roomRef && this.mySlotIndex !== -1) {
            const { ref, remove } = window.rtdbUtils;
            remove(ref(window.rtdb, `rooms/${this.currentRoomCode}/players/${this.mySlotIndex}`));
        }

        this.currentRoomCode = null;
        this.mySlotIndex = -1;
        this.isHost = false;
        this.gameState = 'LOBBY';
        this.players = {};
        this.bullets = [];

        // Reset UI
        this.lobbyOverlay.style.display = 'flex';
        this.waitingOverlay.style.display = 'none';
        this.gameOverOverlay.style.display = 'none';
        this.gameHud.style.display = 'none';
        document.getElementById('leaveRoomBtn').style.display = 'none';
        this.roomCodeDisplay.innerText = "ROOM: ----";
        this.playerCountDisplay.innerText = "PLAYERS: 0/6";
    }

    /* ----------------------------------------------------------------------
       4. SYNCHRONIZATION & INTERPOLATION (LERP)
       ---------------------------------------------------------------------- */
    handleRoomUpdate(data) {
        this.maxPlayers = data.maxPlayers;
        this.scores = data.scores || { left: 0, right: 0 };
        this.timerSeconds = data.timer || 180;

        // Sync Player Count Display
        const activePlayers = data.players ? Object.keys(data.players) : [];
        this.playerCountDisplay.innerText = `PLAYERS: ${activePlayers.length}/${this.maxPlayers}`;
        this.roomCodeDisplay.innerText = `ROOM: ${this.currentRoomCode}`;

        // Host handles match start transition
        if (this.isHost && data.state === 'WAITING' && activePlayers.length === this.maxPlayers) {
            const { ref, update } = window.rtdbUtils;
            update(this.roomRef, { state: 'PLAYING' });
        }

        // Room state transition handling
        if (data.state === 'PLAYING' && this.gameState !== 'PLAYING') {
            this.startGame();
        } else if (data.state === 'ENDED' && this.gameState !== 'ENDED') {
            this.endGame(data.winnerText);
        }

        // Update Remote Players State (with target coords for interpolation)
        if (data.players) {
            Object.keys(data.players).forEach((slot) => {
                const pData = data.players[slot];
                const slotIdx = parseInt(slot, 10);

                if (slotIdx !== this.mySlotIndex) {
                    if (!this.players[slotIdx]) {
                        // Spawn Remote Player
                        this.players[slotIdx] = { ...pData, targetX: pData.x, targetY: pData.y };
                    } else {
                        // Update target positions for smoothing
                        this.players[slotIdx].targetX = pData.x;
                        this.players[slotIdx].targetY = pData.y;
                        this.players[slotIdx].vx = pData.vx;
                        this.players[slotIdx].vy = pData.vy;
                        this.players[slotIdx].facing = pData.facing;
                    }
                } else if (!this.localPlayer) {
                    // Initialize local player instance
                    this.localPlayer = { ...pData };
                    this.players[this.mySlotIndex] = this.localPlayer;
                }
            });
        }

        // Remove disconnected slots
        Object.keys(this.players).forEach((slot) => {
            if (!data.players || !data.players[slot]) {
                delete this.players[slot];
            }
        });

        // Sync Bullets array if supplied by server/host
        if (data.bullets) {
            this.bullets = data.bullets;
        }

        // Update Waiting Room Grid
        this.updateWaitingSlotGrid(data.players);
    }

    showWaitingOverlay() {
        this.lobbyOverlay.style.display = 'none';
        this.waitingOverlay.style.display = 'flex';
        document.getElementById('leaveRoomBtn').style.display = 'block';
    }

    updateWaitingSlotGrid(playersData = {}) {
        this.playerListGrid.innerHTML = '';
        const connectedCount = Object.keys(playersData).length;
        this.waitingStatus.innerText = `${connectedCount} / ${this.maxPlayers} Players Connected`;

        for (let i = 0; i < this.maxPlayers; i++) {
            const slotDiv = document.createElement('div');
            slotDiv.className = 'player-slot';

            if (playersData[i]) {
                slotDiv.classList.add('occupied');
                slotDiv.innerHTML = `
                    <img src="${playersData[i].avatar}" class="avatar-img" width="28" height="28" alt="">
                    <span>${playersData[i].name}</span>
                `;
            } else {
                slotDiv.innerHTML = `<span>SLOT ${i + 1}</span><small>Empty</small>`;
            }
            this.playerListGrid.appendChild(slotDiv);
        }
    }

    startGame() {
        this.gameState = 'PLAYING';
        this.lobbyOverlay.style.display = 'none';
        this.waitingOverlay.style.display = 'none';
        this.gameHud.style.display = 'flex';

        if (this.isHost) {
            this.startHostTimer();
        }
    }

    startHostTimer() {
        this.hostTimerInterval = setInterval(() => {
            if (this.gameState !== 'PLAYING') {
                clearInterval(this.hostTimerInterval);
                return;
            }
            this.timerSeconds--;
            const { ref, update } = window.rtdbUtils;
            update(this.roomRef, { timer: this.timerSeconds });

            if (this.timerSeconds <= 0) {
                clearInterval(this.hostTimerInterval);
                const winner = this.scores.left > this.scores.right ? "LEFT SIDE WINS!" :
                              (this.scores.right > this.scores.left ? "RIGHT SIDE WINS!" : "DRAW MATCH!");
                update(this.roomRef, { state: 'ENDED', winnerText: winner });
            }
        }, 1000);
    }

    endGame(winnerText) {
        this.gameState = 'ENDED';
        this.gameHud.style.display = 'none';
        this.gameOverOverlay.style.display = 'flex';
        this.winnerText.innerText = winnerText || "GAME OVER";
        document.getElementById('finalStats').innerText = `Final Score: ${this.scores.left} - ${this.scores.right}`;
    }

    /* ----------------------------------------------------------------------
       5. PHYSICS, LOCAL PREDICTION & BULLET LOGIC
       ---------------------------------------------------------------------- */
    updateLocalPlayerPhysics() {
        if (!this.localPlayer || this.gameState !== 'PLAYING') return;

        const isLeft = this.keys.left || this.touchControls.left;
        const isRight = this.keys.right || this.touchControls.right;
        const isUp = this.keys.up || this.touchControls.up;
        const isFire = this.keys.fire || this.touchControls.fire;

        const speed = 4.5;
        const gravity = 0.45;
        const jumpForce = -9.5;

        // Horizontal Movement
        if (isLeft) {
            this.localPlayer.vx = -speed;
            this.localPlayer.facing = 'left';
        } else if (isRight) {
            this.localPlayer.vx = speed;
            this.localPlayer.facing = 'right';
        } else {
            this.localPlayer.vx = 0;
        }

        // Jump Mechanics
        if (isUp && this.localPlayer.isGrounded) {
            this.localPlayer.vy = jumpForce;
            this.localPlayer.isGrounded = false;
        }

        // Apply Gravity
        this.localPlayer.vy += gravity;

        // Apply Velocity
        this.localPlayer.x += this.localPlayer.vx;
        this.localPlayer.y += this.localPlayer.vy;

        // Canvas Floor Collision
        if (this.localPlayer.y >= 330) {
            this.localPlayer.y = 330;
            this.localPlayer.vy = 0;
            this.localPlayer.isGrounded = true;
        }

        // Canvas Boundary Collisions
        if (this.localPlayer.x < 16) this.localPlayer.x = 16;
        if (this.localPlayer.x > 780) this.localPlayer.x = 780;

        // Firing Mechanics
        const now = Date.now();
        if (isFire && now - this.lastShotTime > 300) {
            this.spawnBullet(this.localPlayer);
            this.lastShotTime = now;
        }

        // Send Updated State to Firebase
        this.broadcastLocalPosition();
    }

    spawnBullet(shooter) {
        const bulletSpeed = 10;
        const dir = shooter.facing === 'left' ? -1 : 1;
        const newBullet = {
            id: Math.random().toString(36).substring(2, 7),
            x: shooter.x + (dir * 18),
            y: shooter.y - 12,
            vx: dir * bulletSpeed,
            shooterSlot: this.mySlotIndex,
            side: shooter.side
        };

        this.bullets.push(newBullet);
        this.broadcastBullets();
    }

    updateBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx;

            // Remove out-of-bounds bullets
            if (b.x < 0 || b.x > 800) {
                this.bullets.splice(i, 1);
                continue;
            }

            // Bullet - Player Collision Detection (Handled by Host)
            if (this.isHost) {
                Object.keys(this.players).forEach((slot) => {
                    const slotIdx = parseInt(slot, 10);
                    const p = this.players[slotIdx];

                    // Cannot hit teammates or self
                    if (p.side !== b.side) {
                        const dist = Math.hypot(b.x - p.x, b.y - (p.y - 16));
                        if (dist < 20) {
                            // Hit registered! Increase opposing team score
                            if (b.side === 'left') this.scores.left += 10;
                            else this.scores.right += 10;

                            // Reset hit player position
                            p.x = p.side === 'left' ? 100 : 700;
                            p.y = 300;

                            this.bullets.splice(i, 1);

                            // Sync score updates to Firebase
                            const { ref, update } = window.rtdbUtils;
                            update(this.roomRef, {
                                scores: this.scores,
                                [`players/${slotIdx}/x`]: p.x,
                                [`players/${slotIdx}/y`]: p.y
                            });
                        }
                    }
                });
            }
        }
    }

    broadcastLocalPosition() {
        if (!this.roomRef || this.mySlotIndex === -1) return;
        const { ref, update } = window.rtdbUtils;
        
        update(ref(window.rtdb, `rooms/${this.currentRoomCode}/players/${this.mySlotIndex}`), {
            x: Math.round(this.localPlayer.x),
            y: Math.round(this.localPlayer.y),
            vx: this.localPlayer.vx,
            vy: this.localPlayer.vy,
            facing: this.localPlayer.facing
        });
    }

    broadcastBullets() {
        if (!this.isHost || !this.roomRef) return;
        const { ref, update } = window.rtdbUtils;
        update(this.roomRef, { bullets: this.bullets });
    }

    /* ----------------------------------------------------------------------
       6. RENDER LOOP
       ---------------------------------------------------------------------- */
    gameLoop() {
        // Physics logic
        this.updateLocalPlayerPhysics();
        this.updateBullets();

        // Clear Canvas
        this.ctx.fillStyle = '#050505';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Render Ground Line
        this.ctx.strokeStyle = '#262626';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 346);
        this.ctx.lineTo(800, 346);
        this.ctx.stroke();

        // Smooth Interpolation & Draw Remote Players
        Object.keys(this.players).forEach((slot) => {
            const slotIdx = parseInt(slot, 10);
            const p = this.players[slotIdx];

            if (slotIdx !== this.mySlotIndex) {
                // Apply LERP (Factor 0.25) to prevent stuttering
                p.x += (p.targetX - p.x) * 0.25;
                p.y += (p.targetY - p.y) * 0.25;
            }

            this.drawPlayer(p, slotIdx === this.mySlotIndex);
        });

        // Draw Bullets
        this.ctx.fillStyle = '#ffffff';
        this.bullets.forEach((b) => {
            this.ctx.beginPath();
            this.ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Update HUD Values
        if (this.gameState === 'PLAYING') {
            this.scoreLeft.innerText = this.scores.left;
            this.scoreRight.innerText = this.scores.right;
            const mins = Math.floor(this.timerSeconds / 60).toString().padStart(2, '0');
            const secs = (this.timerSeconds % 60).toString().padStart(2, '0');
            this.gameTimer.innerText = `${mins}:${secs}`;
        }

        requestAnimationFrame(this.gameLoop);
    }

    drawPlayer(player, isLocal) {
        this.ctx.save();

        // Player Body Box
        this.ctx.fillStyle = isLocal ? '#ffffff' : (player.side === 'left' ? '#a3a3a3' : '#525252');
        this.ctx.fillRect(player.x - 12, player.y - 32, 24, 32);

        // Facing Line/Gun
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        const gunOffset = player.facing === 'left' ? -16 : 16;
        this.ctx.moveTo(player.x, player.y - 18);
        this.ctx.lineTo(player.x + gunOffset, player.y - 18);
        this.ctx.stroke();

        // Name Tag Above Head
        this.ctx.fillStyle = '#a3a3a3';
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.name || 'Player', player.x, player.y - 38);

        this.ctx.restore();
    }
}

// Instantiate engine when window completes loading
window.addEventListener('load', () => {
    window.gameEngine = new GameEngine();
});
