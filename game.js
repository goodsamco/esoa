// Monochrome Duel Engine - Health, Powerups, Mouse Aim/Shoot & Continuation

let canvas, ctx;
let currentRoomId = null;
let roomListener = null;
let isHost = false;

// Game State
let gameState = {
    status: 'lobby', // 'lobby', 'waiting', 'playing', 'ended'
    maxPlayers: 2,
    players: {},
    bullets: [],
    powerups: [],
    scoreLeft: 0,
    scoreRight: 0,
    timer: 180
};

// Local Player Controls
let localInput = {
    left: false,
    right: false,
    jump: false,
    fire: false
};

const PHYSICS = {
    gravity: 0.45,
    moveSpeed: 4.0,
    acceleration: 0.6,
    friction: 0.82,
    jumpForce: -9.8,
    bulletSpeed: 8.5,
    maxLives: 5,
    playerWidth: 18,
    playerHeight: 28,
    groundY: 340,
    canvasWidth: 800,
    canvasHeight: 400
};

let localPlayerPos = {
    x: 100,
    y: PHYSICS.groundY - PHYSICS.playerHeight,
    vx: 0,
    vy: 0,
    isGrounded: true,
    facing: 1, // 1 for right, -1 for left
    lives: PHYSICS.maxLives, // 5 Health Units
    kills: 0,
    team: 'left'
};

let gameLoopId = null;
let lastFireTime = 0;
let lastPowerupSpawnTime = Date.now();

window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    if (window.lucide) {
        window.lucide.createIcons();
    }

    setupEventListeners();
    setupTouchControls();
});

function setupEventListeners() {
    document.getElementById('createRoomBtn').addEventListener('click', createRoom);
    document.getElementById('joinRoomBtn').addEventListener('click', joinRoom);
    document.getElementById('leaveRoomBtn').addEventListener('click', leaveRoom);
    document.getElementById('playAgainBtn').addEventListener('click', continueGame);

    // Keyboard Input (Arrow keys & WASD with smooth velocity acceleration)
    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));

    // Mouse Click to Shoot
    window.addEventListener('mousedown', (e) => {
        if (gameState.status === 'playing' && e.button === 0) { // Left click
            triggerFire();
        }
    });
}

function handleKey(e, isPressed) {
    if (gameState.status !== 'playing') return;

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') localInput.left = isPressed;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') localInput.right = isPressed;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        if (isPressed && !localInput.jump) localInput.jump = true;
        if (!isPressed) localInput.jump = false;
    }
    if (e.key === 'f' || e.key === 'F' || e.key === 'e' || e.key === 'E' || e.key === 'Shift') {
        if (isPressed && !localInput.fire) triggerFire();
        localInput.fire = isPressed;
    }
}

function setupTouchControls() {
    const bindBtn = (id, key) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); localInput[key] = true; if(key==='fire') triggerFire(); });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); localInput[key] = false; });
    };

    bindBtn('btnLeft', 'left');
    bindBtn('btnRight', 'right');
    bindBtn('btnJump', 'jump');
    bindBtn('btnFire', 'fire');
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function createRoom() {
    const maxPlayers = parseInt(document.getElementById('maxPlayersSelect').value, 10);
    const roomCode = generateRoomCode();
    currentRoomId = roomCode;
    isHost = true;

    const initialRoomData = {
        maxPlayers: maxPlayers,
        status: 'waiting',
        scoreLeft: 0,
        scoreRight: 0,
        timer: 180,
        bullets: [],
        powerups: [],
        createdAt: Date.now()
    };

    const { ref, set } = window.rtdbUtils;
    const roomRef = ref(window.rtdb, 'rooms/' + currentRoomId);
    
    await set(roomRef, initialRoomData);
    await joinRoomById(currentRoomId, true);
}

async function joinRoom() {
    const roomCode = document.getElementById('joinRoomInput').value.trim().toUpperCase();
    if (!roomCode || roomCode.length < 4) {
        alert('Please enter a valid Room Code.');
        return;
    }
    await joinRoomById(roomCode, false);
}

async function joinRoomById(roomCode, hostFlag) {
    const { ref, get, update, onDisconnect } = window.rtdbUtils;
    const roomRef = ref(window.rtdb, 'rooms/' + roomCode);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
        alert('Room does not exist!');
        return;
    }

    const roomData = snapshot.val();
    const players = roomData.players || {};
    const playerCount = Object.keys(players).length;

    if (playerCount >= roomData.maxPlayers && !players[window.currentUserId]) {
        alert('Room is full!');
        return;
    }

    currentRoomId = roomCode;
    isHost = hostFlag;

    const assignedIndex = playerCount;
    const team = (assignedIndex % 2 === 0) ? 'left' : 'right';
    
    const spawnX = team === 'left' ? 100 + (assignedIndex * 40) : 700 - (assignedIndex * 40);
    localPlayerPos = {
        x: spawnX,
        y: PHYSICS.groundY - PHYSICS.playerHeight,
        vx: 0,
        vy: 0,
        isGrounded: true,
        facing: team === 'left' ? 1 : -1,
        lives: PHYSICS.maxLives, // 5 Health Units max
        kills: 0,
        team: team,
        name: document.getElementById('userDisplayName').innerText || 'Player'
    };

    const playerRef = ref(window.rtdb, `rooms/${currentRoomId}/players/${window.currentUserId}`);
    await update(playerRef, localPlayerPos);
    onDisconnect(playerRef).remove();

    document.getElementById('roomCodeDisplay').innerText = `ROOM: ${currentRoomId}`;
    document.getElementById('leaveRoomBtn').style.display = 'flex';
    document.getElementById('lobbyOverlay').style.display = 'none';
    document.getElementById('waitingOverlay').style.display = 'flex';

    listenToRoomUpdates();
}

function listenToRoomUpdates() {
    const { ref, onValue } = window.rtdbUtils;
    const roomRef = ref(window.rtdb, 'rooms/' + currentRoomId);

    if (roomListener) roomListener();

    roomListener = onValue(roomRef, (snapshot) => {
        if (!snapshot.exists()) {
            alert('Room closed');
            resetToLobby();
            return;
        }

        gameState = snapshot.val();
        if (!gameState.players) gameState.players = {};
        if (!gameState.bullets) gameState.bullets = [];
        if (!gameState.powerups) gameState.powerups = [];

        updateWaitingRoomUI();

        if (gameState.status === 'playing' && document.getElementById('waitingOverlay').style.display !== 'none') {
            startGameplay();
        }

        if (gameState.status === 'playing' && document.getElementById('gameOverOverlay').style.display !== 'none') {
            // Continued game restarted
            document.getElementById('gameOverOverlay').style.display = 'none';
            document.getElementById('gameHud').style.display = 'flex';
            if (!gameLoopId) gameLoopId = requestAnimationFrame(gameLoop);
        }

        if (gameState.status === 'ended') {
            endGameUI();
        }

        if (isHost && gameState.status === 'waiting') {
            const count = Object.keys(gameState.players).length;
            if (count === gameState.maxPlayers) {
                window.rtdbUtils.update(ref(window.rtdb, 'rooms/' + currentRoomId), { status: 'playing' });
            }
        }
    });
}

function updateWaitingRoomUI() {
    const players = gameState.players || {};
    const count = Object.keys(players).length;
    
    document.getElementById('playerCountDisplay').innerText = `PLAYERS: ${count}/${gameState.maxPlayers}`;
    document.getElementById('waitingStatus').innerText = `${count} / ${gameState.maxPlayers} Players Connected`;

    const slotsGrid = document.getElementById('playerList');
    slotsGrid.innerHTML = '';

    for (let i = 0; i < gameState.maxPlayers; i++) {
        const pKeys = Object.keys(players);
        const player = pKeys[i] ? players[pKeys[i]] : null;

        const slot = document.createElement('div');
        slot.className = `player-slot ${player ? 'occupied' : ''}`;
        slot.innerHTML = player ? `
            <span class="slot-team">${player.team.toUpperCase()} TEAM</span>
            <strong>${player.name}</strong>
        ` : `
            <span class="slot-team">EMPTY</span>
            <span>Waiting...</span>
        `;
        slotsGrid.appendChild(slot);
    }
}

function startGameplay() {
    document.getElementById('waitingOverlay').style.display = 'none';
    document.getElementById('gameHud').style.display = 'flex';

    if (!gameLoopId) {
        gameLoopId = requestAnimationFrame(gameLoop);
    }
}

function triggerFire() {
    const now = Date.now();
    if (now - lastFireTime < 200) return; // Fire rate limit 200ms
    if (localPlayerPos.lives <= 0) return;

    lastFireTime = now;
    const bulletX = localPlayerPos.facing === 1 ? localPlayerPos.x + PHYSICS.playerWidth + 4 : localPlayerPos.x - 8;
    const bulletY = localPlayerPos.y + 10;

    const newBullet = {
        id: window.currentUserId + '_' + now,
        ownerId: window.currentUserId,
        team: localPlayerPos.team,
        x: bulletX,
        y: bulletY,
        vx: localPlayerPos.facing * PHYSICS.bulletSpeed
    };

    if (isHost) {
        gameState.bullets.push(newBullet);
    } else {
        const { ref, set } = window.rtdbUtils;
        set(ref(window.rtdb, `rooms/${currentRoomId}/bullets/${gameState.bullets.length}`), newBullet);
    }
}

function updatePhysics() {
    if (localPlayerPos.lives <= 0) return;

    // Movement Velocity Acceleration & Friction
    if (localInput.left) {
        localPlayerPos.vx -= PHYSICS.acceleration;
        if (localPlayerPos.vx < -PHYSICS.moveSpeed) localPlayerPos.vx = -PHYSICS.moveSpeed;
        localPlayerPos.facing = -1;
    } else if (localInput.right) {
        localPlayerPos.vx += PHYSICS.acceleration;
        if (localPlayerPos.vx > PHYSICS.moveSpeed) localPlayerPos.vx = PHYSICS.moveSpeed;
        localPlayerPos.facing = 1;
    } else {
        localPlayerPos.vx *= PHYSICS.friction;
        if (Math.abs(localPlayerPos.vx) < 0.05) localPlayerPos.vx = 0;
    }

    // Jump Physics
    if (localInput.jump && localPlayerPos.isGrounded) {
        localPlayerPos.vy = PHYSICS.jumpForce;
        localPlayerPos.isGrounded = false;
    }

    localPlayerPos.vy += PHYSICS.gravity;
    localPlayerPos.x += localPlayerPos.vx;
    localPlayerPos.y += localPlayerPos.vy;

    // Ground Collision
    if (localPlayerPos.y + PHYSICS.playerHeight >= PHYSICS.groundY) {
        localPlayerPos.y = PHYSICS.groundY - PHYSICS.playerHeight;
        localPlayerPos.vy = 0;
        localPlayerPos.isGrounded = true;
    }

    // Full Arena Bounds
    if (localPlayerPos.x < 10) localPlayerPos.x = 10;
    if (localPlayerPos.x > PHYSICS.canvasWidth - 10 - PHYSICS.playerWidth) {
        localPlayerPos.x = PHYSICS.canvasWidth - 10 - PHYSICS.playerWidth;
    }

    // Check Life Powerup Pickup locally
    (gameState.powerups || []).forEach((p) => {
        if (!p.collected && 
            localPlayerPos.x < p.x + 12 && localPlayerPos.x + PHYSICS.playerWidth > p.x &&
            localPlayerPos.y < p.y + 12 && localPlayerPos.y + PHYSICS.playerHeight > p.y) {
            
            p.collected = true;
            if (localPlayerPos.lives < PHYSICS.maxLives) {
                localPlayerPos.lives += 1; // Gain +1 Life Health
            }
        }
    });

    // Sync state to Firebase
    const { ref, update } = window.rtdbUtils;
    update(ref(window.rtdb, `rooms/${currentRoomId}/players/${window.currentUserId}`), {
        x: localPlayerPos.x,
        y: localPlayerPos.y,
        facing: localPlayerPos.facing,
        lives: localPlayerPos.lives,
        kills: localPlayerPos.kills
    });
}

function updateHostLogic() {
    if (!isHost || gameState.status !== 'playing') return;

    let updatedBullets = [];
    let updatedScoreLeft = gameState.scoreLeft || 0;
    let updatedScoreRight = gameState.scoreRight || 0;

    // Rare Life Powerup Drop Logic (Every 15-25 seconds)
    const now = Date.now();
    if (now - lastPowerupSpawnTime > 18000 && Math.random() < 0.005) {
        lastPowerupSpawnTime = now;
        gameState.powerups.push({
            id: 'powerup_' + now,
            x: 100 + Math.random() * 600,
            y: PHYSICS.groundY - 16,
            collected: false
        });
    }

    // Bullet Physics and Hit Detection
    (gameState.bullets || []).forEach(b => {
        b.x += b.vx;

        if (b.x < 0 || b.x > PHYSICS.canvasWidth) return;

        let hit = false;
        Object.keys(gameState.players).forEach(pId => {
            const p = gameState.players[pId];
            if (p.team !== b.team && p.lives > 0) {
                if (b.x >= p.x && b.x <= p.x + PHYSICS.playerWidth &&
                    b.y >= p.y && b.y <= p.y + PHYSICS.playerHeight) {
                    
                    hit = true;
                    p.lives -= 1; // Reduce 1 of 5 health
                    if (p.lives <= 0) {
                        p.lives = 0;
                        if (b.team === 'left') updatedScoreLeft += 100;
                        else updatedScoreRight += 100;
                    }
                }
            }
        });

        if (!hit) updatedBullets.push(b);
    });

    // Filter uncollected powerups
    let activePowerups = (gameState.powerups || []).filter(p => !p.collected);

    // Win condition: check if a side is wiped out
    let leftAlive = 0, rightAlive = 0;
    Object.values(gameState.players).forEach(p => {
        if (p.lives > 0) {
            if (p.team === 'left') leftAlive++;
            else rightAlive++;
        }
    });

    let newStatus = 'playing';
    if (leftAlive === 0 || rightAlive === 0) {
        newStatus = 'ended';
    }

    const { ref, update } = window.rtdbUtils;
    update(ref(window.rtdb, 'rooms/' + currentRoomId), {
        bullets: updatedBullets,
        powerups: activePowerups,
        scoreLeft: updatedScoreLeft,
        scoreRight: updatedScoreRight,
        status: newStatus,
        players: gameState.players
    });
}

function render() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, PHYSICS.canvasWidth, PHYSICS.canvasHeight);

    // Ground Line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, PHYSICS.groundY);
    ctx.lineTo(PHYSICS.canvasWidth, PHYSICS.groundY);
    ctx.stroke();

    // Draw Rare Life Drops (+ Icon)
    (gameState.powerups || []).forEach(p => {
        if (p.collected) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x, p.y, 12, 12);
        ctx.fillStyle = '#000000';
        ctx.fillRect(p.x + 5, p.y + 2, 2, 8);
        ctx.fillRect(p.x + 2, p.y + 5, 8, 2);
    });

    // Draw Players
    const players = gameState.players || {};
    Object.keys(players).forEach(pId => {
        const p = players[pId];
        if (p.lives <= 0) return;

        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = pId === window.currentUserId ? '#ffffff' : '#000000';
        ctx.lineWidth = 2;
        ctx.fillRect(p.x, p.y, PHYSICS.playerWidth, PHYSICS.playerHeight);
        ctx.strokeRect(p.x, p.y, PHYSICS.playerWidth, PHYSICS.playerHeight);

        // Direction Indicator Eye
        ctx.fillStyle = pId === window.currentUserId ? '#000000' : '#ffffff';
        const eyeX = p.facing === 1 ? p.x + 12 : p.x + 2;
        ctx.fillRect(eyeX, p.y + 4, 4, 4);

        // 5 Health Bars Indicator (5 pips)
        const totalBarWidth = 26;
        const pipWidth = (totalBarWidth / PHYSICS.maxLives) - 1;
        for (let i = 0; i < PHYSICS.maxLives; i++) {
            ctx.fillStyle = i < p.lives ? '#ffffff' : 'rgba(255,255,255,0.2)';
            ctx.fillRect(p.x - 4 + i * (pipWidth + 1), p.y - 10, pipWidth, 4);
        }

        // Name tag
        ctx.fillStyle = '#888888';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.name || 'Player', p.x + (PHYSICS.playerWidth / 2), p.y - 16);
    });

    // Draw Bullets
    ctx.fillStyle = '#ffffff';
    (gameState.bullets || []).forEach(b => {
        ctx.fillRect(b.x, b.y, 6, 2);
    });

    // Update Scores HUD
    document.getElementById('scoreLeft').innerText = gameState.scoreLeft || 0;
    document.getElementById('scoreRight').innerText = gameState.scoreRight || 0;
}

function gameLoop() {
    updatePhysics();
    updateHostLogic();
    render();

    if (gameState.status === 'playing') {
        gameLoopId = requestAnimationFrame(gameLoop);
    }
}

function endGameUI() {
    cancelAnimationFrame(gameLoopId);
    gameLoopId = null;

    document.getElementById('gameOverOverlay').style.display = 'flex';
    document.getElementById('gameHud').style.display = 'none';

    // Update Continue Button text
    const playAgainBtn = document.getElementById('playAgainBtn');
    if (playAgainBtn) playAgainBtn.innerText = 'CONTINUE MATCH';

    const winnerText = document.getElementById('winnerText');
    if (gameState.scoreLeft > gameState.scoreRight) {
        winnerText.innerText = 'LEFT SIDE WINS!';
    } else if (gameState.scoreRight > gameState.scoreLeft) {
        winnerText.innerText = 'RIGHT SIDE WINS!';
    } else {
        winnerText.innerText = 'DRAW MATCH!';
    }

    document.getElementById('finalStats').innerHTML = `
        <p style="margin-top:10px; font-size: 0.85rem; color:#888;">
            GAME OVER - ALL 5 HEALTH EXHAUSTED
        </p>
    `;
}

async function continueGame() {
    // Reset local player health & position
    localPlayerPos.lives = PHYSICS.maxLives;
    localPlayerPos.x = localPlayerPos.team === 'left' ? 100 : 700;
    localPlayerPos.y = PHYSICS.groundY - PHYSICS.playerHeight;
    localPlayerPos.vx = 0;
    localPlayerPos.vy = 0;

    const { ref, update } = window.rtdbUtils;
    await update(ref(window.rtdb, `rooms/${currentRoomId}/players/${window.currentUserId}`), localPlayerPos);

    if (isHost) {
        // Reset Room Healths and state for Continuation
        Object.keys(gameState.players).forEach(pId => {
            gameState.players[pId].lives = PHYSICS.maxLives;
        });
        await update(ref(window.rtdb, 'rooms/' + currentRoomId), {
            status: 'playing',
            bullets: [],
            powerups: [],
            players: gameState.players
        });
    }
}

async function leaveRoom() {
    if (currentRoomId) {
        const { ref, remove } = window.rtdbUtils;
        await remove(ref(window.rtdb, `rooms/${currentRoomId}/players/${window.currentUserId}`));
    }
    resetToLobby();
}

function resetToLobby() {
    if (roomListener) roomListener();
    if (gameLoopId) cancelAnimationFrame(gameLoopId);

    currentRoomId = null;
    isHost = false;
    gameLoopId = null;
    gameState.status = 'lobby';

    document.getElementById('lobbyOverlay').style.display = 'flex';
    document.getElementById('waitingOverlay').style.display = 'none';
    document.getElementById('gameOverOverlay').style.display = 'none';
    document.getElementById('gameHud').style.display = 'none';
    document.getElementById('leaveRoomBtn').style.display = 'none';
    document.getElementById('roomCodeDisplay').innerText = 'ROOM: ----';
    document.getElementById('playerCountDisplay').innerText = 'PLAYERS: 0/6';
}
