// Offline Game state (no multiplayer)
let gameState = {
    players: [],
    bots: [],
    coins: [],
    worldSize: 4000,
    playerId: 'player1'
};

let camera = {
    x: 0,
    y: 0,
    zoom: 1
};

let localPlayer = null;
let canvas = null;
let ctx = null;
let keys = {};
let speechBubbles = new Map();
let chatMessages = [];
let isMobile = window.innerWidth < 1024 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let selectedColor = 0;
let chatCollapsed = false;
let matchTimeLeft = 86400;
let gameEnded = false;
let matchStartTime = null;
let clientTimerInterval = null;

// Background image
let backgroundImage = null;
let backgroundLoaded = false;

// Input handling
let movement = { x: 0, y: 0 };
let joystickActive = false;
let joystickCenter = { x: 0, y: 0 };

// Bot names (realistic player names)
const botNames = [
    'Alex', 'Mike', 'Sarah', 'John', 'Emma', 'David', 'Lisa', 'Tom', 'Anna', 'Chris',
    'Maria', 'James', 'Kate', 'Ben', 'Sofia', 'Nick', 'Amy', 'Dan', 'Luna', 'Max',
    'Zoe', 'Ryan', 'Mia', 'Sam', 'Lea', 'Jake', 'Ivy', 'Leo', 'Eva', 'Noah',
    'Ava', 'Luke', 'Eli', 'Kai', 'Joy', 'Tim', 'Sky', 'Ace', 'Rio', 'Zara'
];

// Bot messages
const botMessages = [
    "Nice catch!", "I'm coming for those coins!", "Watch out!",
    "So many shiny coins!", "This is fun!", "Great game everyone!",
    "I love collecting coins!", "Anyone else see that big coin?",
    "Fast fingers win!", "Golden opportunity!", "Coin rain!"
];

// Initialize offline game
function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Load background image
    loadBackgroundImage();
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    setupInputHandlers();
    setupUIHandlers();
    
    // Initialize offline game
    initializeOfflineGame();
    
    gameLoop();
}

function loadBackgroundImage() {
    backgroundImage = new Image();
    backgroundImage.onload = function() {
        backgroundLoaded = true;
        console.log('✅ Background image loaded successfully (offline)');
    };
    backgroundImage.onerror = function() {
        console.error('❌ Failed to load background image (offline)');
        backgroundLoaded = false;
    };
    backgroundImage.src = 'world_bg_4000x4000.png';
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function initializeOfflineGame() {
    // Generate coins
    generateCoins(300);
    
    // Create initial AI bots (start with fewer)
    for (let i = 0; i < 8; i++) {
        const bot = createBot(i);
        gameState.bots.push(bot);
    }
    
    // Start bot simulation
    startBotSimulation();
    
    // Start match
    startMatch();
}

// Bot simulation for offline version
function startBotSimulation() {
    function scheduleNextBotEvent() {
        // Random delay between 20 seconds and 3 minutes
        const delay = 20000 + Math.random() * 160000;
        const minutes = Math.floor(delay / 60000);
        const seconds = Math.floor((delay % 60000) / 1000);
        
        console.log(`⏰ Next bot event scheduled in ${minutes}m ${seconds}s`);
        
        setTimeout(() => {
            const currentBotCount = gameState.bots.length;
            const maxBots = 15;
            const minBots = 5;
            
            const action = Math.random();
            
            if (action < 0.5 && currentBotCount < maxBots) {
                // 50% chance to add a new bot (player joins)
                const newBot = createBot(gameState.bots.length);
                gameState.bots.push(newBot);
                console.log(`🤖 Bot "${newBot.name}" joined (${gameState.bots.length} bots online)`);
                
            } else if (action > 0.5 && currentBotCount > minBots) {
                // 50% chance to remove a random bot (player leaves)
                const randomIndex = Math.floor(Math.random() * gameState.bots.length);
                const leavingBot = gameState.bots[randomIndex];
                
                if (leavingBot) {
                    gameState.bots.splice(randomIndex, 1);
                    console.log(`👋 Bot "${leavingBot.name}" left (${gameState.bots.length} bots online)`);
                }
            }
            
            // Schedule next event
            scheduleNextBotEvent();
        }, delay);
    }
    
    // Start the simulation with a quick first event (5-30 seconds)
    setTimeout(() => {
        scheduleNextBotEvent();
    }, 5000 + Math.random() * 25000);
}

function generateCoins(count) {
    gameState.coins = [];
    for (let i = 0; i < count; i++) {
        const coin = {
            id: i,
            x: (Math.random() - 0.5) * gameState.worldSize,
            y: (Math.random() - 0.5) * gameState.worldSize,
            value: 1
        };
        gameState.coins.push(coin);
    }
}

function createBot(id) {
    return {
        id: `bot_${id}`,
        name: botNames[Math.floor(Math.random() * botNames.length)],
        x: (Math.random() - 0.5) * gameState.worldSize,
        y: (Math.random() - 0.5) * gameState.worldSize,
        vx: 0,
        vy: 0,
        score: 0,
        size: 20,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        isBot: true,
        speedVariation: 0.8 + Math.random() * 0.4,
        lastMessageTime: 0
    };
}

function startMatch() {
            matchTimeLeft = 86400;
    matchStartTime = Date.now();
    gameEnded = false;
    startClientTimer();
}



function startClientTimer() {
    stopClientTimer();
    
    clientTimerInterval = setInterval(() => {
        if (matchStartTime) {
            const elapsed = Math.floor((Date.now() - matchStartTime) / 1000);
            const currentTimeLeft = Math.max(0, matchTimeLeft - elapsed);
            updateTimerDisplay(currentTimeLeft);
            
            if (currentTimeLeft <= 0) {
                endMatch();
            }
        }
    }, 100);
}

function stopClientTimer() {
    if (clientTimerInterval) {
        clearInterval(clientTimerInterval);
        clientTimerInterval = null;
    }
}

function endMatch() {
    gameEnded = true;
    stopClientTimer();
    
    const allPlayers = [...gameState.bots];
    if (localPlayer) allPlayers.push(localPlayer);
    
    showGameOverModal(allPlayers);
}

function updateTimerDisplay(timeLeft = matchTimeLeft) {
    const hours = Math.floor(timeLeft / 3600);
    const minutes = Math.floor((timeLeft % 3600) / 60);
    const seconds = timeLeft % 60;
    const timerDisplay = document.getElementById('timerDisplay');
    
    if (timerDisplay) {
        // Format time as HH:MM:SS for 24-hour display
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        timerDisplay.textContent = timeString;
        
        const matchTimer = document.getElementById('matchTimer');
        if (timeLeft <= 3600) { // Less than 1 hour
            matchTimer.className = 'absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 bg-opacity-80 rounded-lg px-6 py-3 text-center z-10';
            timerDisplay.className = 'text-white font-mono text-2xl animate-pulse';
        } else if (timeLeft <= 7200) { // Less than 2 hours
            matchTimer.className = 'absolute top-4 left-1/2 transform -translate-x-1/2 bg-orange-600 bg-opacity-80 rounded-lg px-6 py-3 text-center z-10';
            timerDisplay.className = 'text-yellow-400 font-mono text-2xl';
        } else {
            matchTimer.className = 'absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-600 bg-opacity-80 rounded-lg px-6 py-3 text-center z-10';
            timerDisplay.className = 'text-white font-mono text-2xl';
        }
    }
}

function setupInputHandlers() {
    // Keyboard input
    document.addEventListener('keydown', (e) => {
        keys[e.code] = true;
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }
    });
    
    document.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });
    
    // Mobile joystick setup
    setupMobileJoystick();
}

function setupMobileJoystick() {
    const joystick = document.getElementById('joystick');
    const joystickKnob = document.getElementById('joystickKnob');
    
    if (!joystick || !joystickKnob) return;
    
    joystick.addEventListener('touchstart', handleJoystickStart, { passive: false });
    joystick.addEventListener('touchmove', handleJoystickMove, { passive: false });
    joystick.addEventListener('touchend', handleJoystickEnd, { passive: false });
    
    function handleJoystickStart(e) {
        e.preventDefault();
        joystickActive = true;
        const rect = joystick.getBoundingClientRect();
        joystickCenter.x = rect.left + rect.width / 2;
        joystickCenter.y = rect.top + rect.height / 2;
    }
    
    function handleJoystickMove(e) {
        if (!joystickActive) return;
        e.preventDefault();
        
        const touch = e.touches[0];
        const dx = touch.clientX - joystickCenter.x;
        const dy = touch.clientY - joystickCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 30;
        
        if (distance > maxDistance) {
            const angle = Math.atan2(dy, dx);
            movement.x = Math.cos(angle);
            movement.y = Math.sin(angle);
            
            joystickKnob.style.transform = `translate(-50%, -50%) translate(${Math.cos(angle) * maxDistance}px, ${Math.sin(angle) * maxDistance}px)`;
        } else {
            movement.x = dx / maxDistance;
            movement.y = dy / maxDistance;
            
            joystickKnob.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
        }
    }
    
    function handleJoystickEnd(e) {
        e.preventDefault();
        joystickActive = false;
        movement.x = 0;
        movement.y = 0;
        joystickKnob.style.transform = 'translate(-50%, -50%)';
    }
}

function setupUIHandlers() {
    // Color picker
    const colorOptions = document.querySelectorAll('.color-option');
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            colorOptions.forEach(opt => opt.classList.remove('border-white'));
            option.classList.add('border-white');
            selectedColor = parseInt(option.dataset.color);
        });
    });
    
    if (colorOptions.length > 0) {
        colorOptions[0].classList.add('border-white');
    }
    
    // Game start
    const nameInput = document.getElementById('playerNameInput');
    const walletInput = document.getElementById('playerWalletInput');
    const startBtn = document.getElementById('startGameBtn');
    const nameModal = document.getElementById('nameModal');
    
    function startGame() {
        const playerName = nameInput.value.trim() || `Player${Math.floor(Math.random() * 1000)}`;
        const wallet = walletInput.value.trim();
        
        localPlayer = {
            id: 'player1',
            name: playerName,
            wallet: wallet,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            score: 0,
            size: 20,
            color: `hsl(${selectedColor}, 70%, 50%)`,
            isBot: false
        };
        
        gameState.players = [localPlayer];
        camera.x = localPlayer.x;
        camera.y = localPlayer.y;
        
        nameModal.style.display = 'none';
    }
    
    startBtn.addEventListener('click', startGame);
    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') startGame();
    });
    walletInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') startGame();
    });
    
    // Game over modal handlers
    const playAgainBtn = document.getElementById('playAgainBtn');
    const changeSettingsBtn = document.getElementById('changeSettingsBtn');
    const gameOverModal = document.getElementById('gameOverModal');
    
    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }
    
    if (changeSettingsBtn) {
        changeSettingsBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }
    
    // Chat toggle
    const chatToggleBtn = document.getElementById('chatToggleBtn');
    const chatContent = document.getElementById('chatContent');
    
    if (chatToggleBtn && chatContent) {
        chatToggleBtn.addEventListener('click', () => {
            chatCollapsed = !chatCollapsed;
            if (chatCollapsed) {
                chatContent.style.height = '0';
                chatContent.style.overflow = 'hidden';
                chatContent.style.opacity = '0';
                chatToggleBtn.textContent = '+';
            } else {
                chatContent.style.height = 'auto';
                chatContent.style.overflow = 'visible';
                chatContent.style.opacity = '1';
                chatToggleBtn.textContent = '−';
            }
        });
    }
    
    // Chat input handlers (for offline mode, just visual feedback)
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    
    if (chatInput && sendChatBtn) {
        const sendMessage = () => {
            const message = chatInput.value.trim();
            if (message && localPlayer) {
                // Add message to chat (visual only in offline mode)
                addChatMessage({
                    playerName: localPlayer.name,
                    message: message,
                    timestamp: Date.now()
                });
                chatInput.value = '';
            }
        };
        
        sendChatBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
    
    // Mobile chat handlers
    setupMobileChat();
}

function setupMobileChat() {
    // Mobile chat toggle
    const mobileChatToggle = document.getElementById('mobileChatToggle');
    const mobileChatModal = document.getElementById('mobileChatModal');
    const closeMobileChatBtn = document.getElementById('closeMobileChatBtn');
    const mobileChatInput = document.getElementById('mobileChatInput');
    const sendMobileChatBtn = document.getElementById('sendMobileChatBtn');
    
    if (mobileChatToggle && mobileChatModal) {
        mobileChatToggle.addEventListener('click', () => {
            mobileChatModal.classList.remove('hidden');
            syncMobileChatMessages();
        });
    }
    
    if (closeMobileChatBtn && mobileChatModal) {
        closeMobileChatBtn.addEventListener('click', () => {
            mobileChatModal.classList.add('hidden');
        });
    }
    
    if (mobileChatInput && sendMobileChatBtn) {
        const sendMobileMessage = () => {
            const message = mobileChatInput.value.trim();
            if (message && localPlayer) {
                // Add message to chat (visual only in offline mode)
                addChatMessage({
                    playerName: localPlayer.name,
                    message: message,
                    timestamp: Date.now()
                });
                mobileChatInput.value = '';
                // Also sync to mobile chat
                syncMobileChatMessages();
            }
        };
        
        sendMobileChatBtn.addEventListener('click', sendMobileMessage);
        mobileChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMobileMessage();
            }
        });
    }
}

function syncMobileChatMessages() {
    const mobileChatMessagesDiv = document.getElementById('mobileChatMessages');
    if (!mobileChatMessagesDiv) return;
    
    mobileChatMessagesDiv.innerHTML = '';
    
    chatMessages.forEach(messageData => {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'bg-gray-800 rounded px-2 py-1';
        
        const timeStr = new Date(messageData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageDiv.innerHTML = `
            <span class="text-gray-400 text-xs">${timeStr}</span>
            <span class="font-semibold text-blue-300">${messageData.playerName}:</span>
            <span class="text-white">${messageData.message}</span>
        `;
        
        mobileChatMessagesDiv.appendChild(messageDiv);
    });
    
    mobileChatMessagesDiv.scrollTop = mobileChatMessagesDiv.scrollHeight;
}

function updateMovement() {
    if (!localPlayer || gameEnded) return;
    
    // If joystick is active (mobile), use joystick input
    if (isMobile && joystickActive) {
        // movement.x and movement.y are already set by joystick handlers
    } else {
        // Use keyboard input
        movement.x = 0;
        movement.y = 0;
        
        if (keys['KeyA'] || keys['ArrowLeft']) movement.x -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) movement.x += 1;
        if (keys['KeyW'] || keys['ArrowUp']) movement.y -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) movement.y += 1;
        
        if (movement.x !== 0 && movement.y !== 0) {
            const length = Math.sqrt(movement.x * movement.x + movement.y * movement.y);
            movement.x /= length;
            movement.y /= length;
        }
    }
    
    // Update player position
    const speed = 3;
    localPlayer.vx = movement.x * speed;
    localPlayer.vy = movement.y * speed;
    localPlayer.x += localPlayer.vx;
    localPlayer.y += localPlayer.vy;
    
    // Keep within bounds
    localPlayer.x = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, localPlayer.x));
    localPlayer.y = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, localPlayer.y));
    
    // Check coin collection
    gameState.coins.forEach((coin, index) => {
        const distance = Math.sqrt((coin.x - localPlayer.x) ** 2 + (coin.y - localPlayer.y) ** 2);
        if (distance < localPlayer.size) {
            localPlayer.score += coin.value;
            
            // Respawn coin
            gameState.coins[index] = {
                id: Date.now() + Math.random(),
                x: (Math.random() - 0.5) * gameState.worldSize,
                y: (Math.random() - 0.5) * gameState.worldSize,
                value: 1
            };
        }
    });
}

function updateBots() {
    if (gameEnded) return;
    
    gameState.bots.forEach(bot => {
        // Simple AI - move toward nearest coin
        let nearestCoin = null;
        let nearestDistance = Infinity;
        
        gameState.coins.forEach(coin => {
            const distance = Math.sqrt((coin.x - bot.x) ** 2 + (coin.y - bot.y) ** 2);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestCoin = coin;
            }
        });
        
        if (nearestCoin) {
            const dx = nearestCoin.x - bot.x;
            const dy = nearestCoin.y - bot.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                const speed = 2 * bot.speedVariation;
                bot.vx = (dx / distance) * speed;
                bot.vy = (dy / distance) * speed;
            }
        }
        
        bot.x += bot.vx;
        bot.y += bot.vy;
        
        // Keep within bounds
        bot.x = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, bot.x));
        bot.y = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, bot.y));
        
        // Check coin collection
        gameState.coins.forEach((coin, index) => {
            const distance = Math.sqrt((coin.x - bot.x) ** 2 + (coin.y - bot.y) ** 2);
            if (distance < bot.size) {
                bot.score += coin.value;
                
                // Respawn coin
                gameState.coins[index] = {
                    id: Date.now() + Math.random(),
                    x: (Math.random() - 0.5) * gameState.worldSize,
                    y: (Math.random() - 0.5) * gameState.worldSize,
                    value: 1
                };
            }
        });
    });
}

function updateCamera() {
    if (!localPlayer) return;
    
    const lerpFactor = 0.1;
    camera.x += (localPlayer.x - camera.x) * lerpFactor;
    camera.y += (localPlayer.y - camera.y) * lerpFactor;
    
    const speed = Math.sqrt(localPlayer.vx * localPlayer.vx + localPlayer.vy * localPlayer.vy);
    const targetZoom = Math.max(0.8, 1.2 - speed * 0.1);
    camera.zoom += (targetZoom - camera.zoom) * 0.05;
    
    const speedElement = document.getElementById('speedValue');
    if (speedElement) {
        speedElement.textContent = Math.round(speed * 10) / 10;
    }
}

function addChatMessage(messageData) {
    chatMessages.push(messageData);
    
    // Keep only last 50 messages
    if (chatMessages.length > 50) {
        chatMessages.shift();
    }
    
    // Add to chat display
    const chatMessagesDiv = document.getElementById('chatMessages');
    if (chatMessagesDiv) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'bg-gray-800 rounded px-2 py-1';
        
        const timeStr = new Date(messageData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageDiv.innerHTML = `
            <span class="text-gray-400 text-xs">${timeStr}</span>
            <span class="font-semibold text-blue-300">${messageData.playerName}:</span>
            <span class="text-white">${messageData.message}</span>
        `;
        
        chatMessagesDiv.appendChild(messageDiv);
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
        
        // Remove old messages from DOM
        while (chatMessagesDiv.children.length > 50) {
            chatMessagesDiv.removeChild(chatMessagesDiv.firstChild);
        }
    }
}

function updateLeaderboard() {
    const allEntities = [...gameState.bots];
    if (localPlayer) allEntities.push(localPlayer);
    
    allEntities.sort((a, b) => b.score - a.score);
    
    const leaderboardList = document.getElementById('leaderboardList');
    if (leaderboardList) {
        leaderboardList.innerHTML = '';
        
        allEntities.slice(0, 15).forEach((entity, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = `flex justify-between items-center text-sm ${entity.id === 'player1' ? 'bg-blue-800 bg-opacity-50 rounded px-2 py-1' : ''}`;
            
            const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const botIndicator = entity.isBot ? ' 🤖' : '';
            
            entryDiv.innerHTML = `
                <span class="flex-1 truncate">${rankEmoji} ${entity.name}${botIndicator}</span>
                <span class="text-yellow-400 font-bold">${entity.score}</span>
            `;
            
            leaderboardList.appendChild(entryDiv);
        });
    }
}

function worldToScreen(worldX, worldY) {
    return {
        x: (worldX - camera.x) * camera.zoom + canvas.width / 2,
        y: (worldY - camera.y) * camera.zoom + canvas.height / 2
    };
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    // Draw background image
    drawBackground();
    
    // Draw grid over the image
    drawGrid();
    
    // Draw coins
    gameState.coins.forEach(coin => {
        drawCoin(coin);
    });
    
    // Draw entities
    const allEntities = [...gameState.bots];
    if (localPlayer) allEntities.push(localPlayer);
    
    allEntities.forEach(entity => {
        drawEntity(entity);
    });
    
    ctx.restore();
}

function drawBackground() {
    if (!backgroundLoaded || !backgroundImage) {
        // Fallback to solid color if image not loaded
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    // Calculate the visible area in world coordinates
    const worldLeft = camera.x - (canvas.width / 2) / camera.zoom;
    const worldTop = camera.y - (canvas.height / 2) / camera.zoom;
    const worldRight = camera.x + (canvas.width / 2) / camera.zoom;
    const worldBottom = camera.y + (canvas.height / 2) / camera.zoom;
    
    // World bounds
    const worldSize = gameState.worldSize;
    const worldHalf = worldSize / 2;
    
    // Calculate which part of the background image to draw
    const bgLeft = Math.max(-worldHalf, worldLeft);
    const bgTop = Math.max(-worldHalf, worldTop);
    const bgRight = Math.min(worldHalf, worldRight);
    const bgBottom = Math.min(worldHalf, worldBottom);
    
    // Convert world coordinates to image coordinates (0 to 4000)
    const imgLeft = (bgLeft + worldHalf) / worldSize * backgroundImage.width;
    const imgTop = (bgTop + worldHalf) / worldSize * backgroundImage.height;
    const imgWidth = ((bgRight - bgLeft) / worldSize) * backgroundImage.width;
    const imgHeight = ((bgBottom - bgTop) / worldSize) * backgroundImage.height;
    
    // Convert world coordinates to screen coordinates
    const screenLeft = (bgLeft - camera.x) * camera.zoom + canvas.width / 2;
    const screenTop = (bgTop - camera.y) * camera.zoom + canvas.height / 2;
    const screenWidth = (bgRight - bgLeft) * camera.zoom;
    const screenHeight = (bgBottom - bgTop) * camera.zoom;
    
    // Draw the visible portion of the background
    if (imgWidth > 0 && imgHeight > 0 && screenWidth > 0 && screenHeight > 0) {
        ctx.drawImage(
            backgroundImage,
            imgLeft, imgTop, imgWidth, imgHeight,
            screenLeft, screenTop, screenWidth, screenHeight
        );
    }
}

function drawGrid() {
    const gridSize = 100;
    const startX = Math.floor((camera.x - canvas.width / 2 / camera.zoom) / gridSize) * gridSize;
    const startY = Math.floor((camera.y - canvas.height / 2 / camera.zoom) / gridSize) * gridSize;
    const endX = camera.x + canvas.width / 2 / camera.zoom;
    const endY = camera.y + canvas.height / 2 / camera.zoom;
    
    // Draw shadow layer first for better visibility
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    
    // Shadow vertical lines
    for (let x = startX; x <= endX; x += gridSize) {
        const screenPos = worldToScreen(x, startY);
        const screenEnd = worldToScreen(x, endY);
        ctx.beginPath();
        ctx.moveTo(screenPos.x + 1, screenPos.y + 1);
        ctx.lineTo(screenEnd.x + 1, screenEnd.y + 1);
        ctx.stroke();
    }
    
    // Shadow horizontal lines
    for (let y = startY; y <= endY; y += gridSize) {
        const screenStart = worldToScreen(startX, y);
        const screenEnd = worldToScreen(endX, y);
        ctx.beginPath();
        ctx.moveTo(screenStart.x + 1, screenStart.y + 1);
        ctx.lineTo(screenEnd.x + 1, screenEnd.y + 1);
        ctx.stroke();
    }
    
    // Main grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 4]);
    
    // Vertical lines
    for (let x = startX; x <= endX; x += gridSize) {
        const screenPos = worldToScreen(x, startY);
        const screenEnd = worldToScreen(x, endY);
        ctx.beginPath();
        ctx.moveTo(screenPos.x, screenPos.y);
        ctx.lineTo(screenEnd.x, screenEnd.y);
        ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = startY; y <= endY; y += gridSize) {
        const screenStart = worldToScreen(startX, y);
        const screenEnd = worldToScreen(endX, y);
        ctx.beginPath();
        ctx.moveTo(screenStart.x, screenStart.y);
        ctx.lineTo(screenEnd.x, screenEnd.y);
        ctx.stroke();
    }
    
    ctx.setLineDash([]);
}

function drawCoin(coin) {
    const screenPos = worldToScreen(coin.x, coin.y);
    const radius = 8 * camera.zoom;
    
    if (screenPos.x < -radius || screenPos.x > canvas.width + radius ||
        screenPos.y < -radius || screenPos.y > canvas.height + radius) {
        return;
    }
    
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    const time = Date.now() * 0.003;
    const shineOpacity = 0.5 + 0.3 * Math.sin(time + coin.id);
    ctx.fillStyle = `rgba(255, 255, 255, ${shineOpacity})`;
    ctx.beginPath();
    ctx.arc(screenPos.x - radius * 0.3, screenPos.y - radius * 0.3, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#FFA500';
    ctx.lineWidth = 2 * camera.zoom;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.stroke();
}

function drawEntity(entity) {
    const screenPos = worldToScreen(entity.x, entity.y);
    const radius = entity.size * camera.zoom;
    
    if (screenPos.x < -radius || screenPos.x > canvas.width + radius ||
        screenPos.y < -radius || screenPos.y > canvas.height + radius) {
        return;
    }
    
    ctx.fillStyle = entity.color;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = entity.id === 'player1' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = (entity.id === 'player1' ? 3 : 2) * camera.zoom;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Name
    ctx.fillStyle = 'white';
    ctx.font = `${Math.max(12, 14 * camera.zoom)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const nameWidth = ctx.measureText(entity.name).width + 8;
    const nameHeight = 20 * camera.zoom;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(screenPos.x - nameWidth / 2, screenPos.y - radius - nameHeight - 5, nameWidth, nameHeight);
    
    ctx.fillStyle = 'white';
    ctx.fillText(entity.name, screenPos.x, screenPos.y - radius - nameHeight / 2 - 5);
    
    // Score
    ctx.fillStyle = 'yellow';
    ctx.font = `${Math.max(10, 12 * camera.zoom)}px Arial`;
    ctx.fillText(`${entity.score}`, screenPos.x, screenPos.y + radius + 15 * camera.zoom);
    
    // Bot indicator
    if (entity.isBot) {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(screenPos.x + radius * 0.7, screenPos.y - radius * 0.7, 6 * camera.zoom, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = `${Math.max(8, 10 * camera.zoom)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('AI', screenPos.x + radius * 0.7, screenPos.y - radius * 0.7);
    }
}

function showGameOverModal(finalResults) {
    const gameOverModal = document.getElementById('gameOverModal');
    const finalLeaderboard = document.getElementById('finalLeaderboard');
    
    if (!gameOverModal || !finalLeaderboard) return;
    
    finalLeaderboard.innerHTML = '';
    finalResults.sort((a, b) => b.score - a.score);
    
    finalResults.slice(0, 15).forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'flex justify-between items-center p-2 bg-gray-700 rounded mb-1';
        
        const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const botIndicator = player.isBot ? ' 🤖' : '';
        const isCurrentPlayer = player.id === 'player1';
        
        if (isCurrentPlayer) {
            playerDiv.className += ' bg-blue-700';
        }
        
        playerDiv.innerHTML = `
            <span class="flex-1">${rankEmoji} ${player.name}${botIndicator}</span>
            <span class="text-yellow-400 font-bold">${player.score}</span>
        `;
        
        finalLeaderboard.appendChild(playerDiv);
    });
    
    gameOverModal.classList.remove('hidden');
}

function gameLoop() {
    if (gameEnded) {
        requestAnimationFrame(gameLoop);
        return;
    }
    
    updateMovement();
    updateBots();
    updateCamera();
    updateLeaderboard();
    render();
    
    requestAnimationFrame(gameLoop);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', init); 