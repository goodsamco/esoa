// Monochrome Line Duel - Full Arena Multiplayer Engine

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
    scoreLeft: 0,
    scoreRight: 0,
    timer: 180
};

// Local Player Physics & Controls
let localInput = {
    left: false,
    right: false,
    jump: false,
    fire: false
};

const PHYSICS = {
    gravity: 0.45,
    moveSpeed: 3.5,
    jumpForce: -9.5,
    bulletSpeed: 8,
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
    lives: PHYSICS.maxLives,
    kills: 0,
    team: 'left'
};

let gameLoopId = null;
let lastFireTime = 0;

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
    document.getElementById('playAgainBtn').addEventListener('click', resetToLobby);

    // Keyboard Input
    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));
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
        btn.addEventListener('mousedown', () => { localInput[key] = true; if(key==='fire') triggerFire(); });
        btn.addEventListener('mouseup', () => { localInput[key] = false; });
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
        lives: PHYSICS.maxLives,
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

        updateWaitingRoomUI();

        if (gameState.status === 'playing' && document.getElementById('waitingOverlay').style.display !== 'none') {
            startGameplay();
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
    if (now - lastFireTime < 220) return; // Fire rate limit (220ms cooldown)
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

    // Movement Physics
    if (localInput.left) {
        localPlayerPos.vx = -PHYSICS.moveSpeed;
        localPlayerPos.facing = -1;
    } else if (localInput.right) {
        localPlayerPos.vx = PHYSICS.moveSpeed;
        localPlayerPos.facing = 1;
    } else {
        localPlayerPos.vx = 0;
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

    // Full Screen Boundaries (No Divider Line Constraint)
    if (localPlayerPos.x < 10) localPlayerPos.x = 10;
    if (localPlayerPos.x > PHYSICS.canvasWidth - 10 - PHYSICS.playerWidth) {
        localPlayerPos.x = PHYSICS.canvasWidth - 10 - PHYSICS.playerWidth;
    }

    // Sync to Realtime DB
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

    (gameState.bullets || []).forEach(b => {
        b.x += b.vx;

        // Check horizontal bounds
        if (b.x < 0 || b.x > PHYSICS.canvasWidth) return;

        let hit = false;
        Object.keys(gameState.players).forEach(pId => {
            const p = gameState.players[pId];
            if (p.team !== b.team && p.lives > 0) {
                if (b.x >= p.x && b.x <= p.x + PHYSICS.playerWidth &&
                    b.y >= p.y && b.y <= p.y + PHYSICS.playerHeight) {
                    
                    hit = true;
                    p.lives -= 1;
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
        scoreLeft: updatedScoreLeft,
        scoreRight: updatedScoreRight,
        status: newStatus,
        players: gameState.players
    });
}

function render() {
    // Clear Screen
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, PHYSICS.canvasWidth, PHYSICS.canvasHeight);

    // Draw Ground
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, PHYSICS.groundY);
    ctx.lineTo(PHYSICS.canvasWidth, PHYSICS.groundY);
    ctx.stroke();

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

        // Eyes (Direction Indicator)
        ctx.fillStyle = pId === window.currentUserId ? '#000000' : '#ffffff';
        const eyeX = p.facing === 1 ? p.x + 12 : p.x + 2;
        ctx.fillRect(eyeX, p.y + 4, 4, 4);

        // Health Bar
        const barWidth = 24;
        const healthPercent = p.lives / PHYSICS.maxLives;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(p.x - 3, p.y - 12, barWidth, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x - 3, p.y - 12, barWidth * healthPercent, 4);

        // Name tag
        ctx.fillStyle = '#888888';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.name || 'Player', p.x + (PHYSICS.playerWidth / 2), p.y - 16);
    });

    // Draw Fired Bullets
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
            FINAL SCORES: LEFT ${gameState.scoreLeft} - ${gameState.scoreRight} RIGHT
        </p>
    `;
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
