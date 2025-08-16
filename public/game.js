// Game state
let socket = null;
let gameState = {
    players: [],
    bots: [],
    coins: [],
    worldSize: 4000,
    playerId: null
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
let isMobile = window.innerWidth < 1024;
let selectedColor = 0; // Default color
let chatCollapsed = false;
let matchTimeLeft = 120; // 2 minutes in seconds
let gameEnded = false;
let matchStartTime = null;
let clientTimerInterval = null;

// Input handling
let movement = { x: 0, y: 0 };
let joystickActive = false;
let joystickCenter = { x: 0, y: 0 };

// Initialize game
function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Set canvas size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Setup socket connection
    const isProduction = window.location.hostname !== 'localhost';
    // Use Render server URL in production, localhost for development
    const socketUrl = isProduction ? 'https://royale-ball-server.onrender.com' : 'http://localhost:3001';
    
    socket = io(socketUrl, {
        path: '/socket.io',
        transports: ['websocket', 'polling']
    });
    setupSocketListeners();
    
    // Setup input handlers
    setupInputHandlers();
    
    // Setup UI handlers
    setupUIHandlers();
    
    // Start game loop
    gameLoop();
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Connected to server!');
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        alert('Cannot connect to game server. Please check if the server is running.');
    });
    
    socket.on('gameState', (data) => {
        gameState = data;
        localPlayer = gameState.players.find(p => p.id === data.playerId);
        if (localPlayer) {
            camera.x = localPlayer.x;
            camera.y = localPlayer.y;
        }
    });
    
    socket.on('gameUpdate', (data) => {
        gameState.players = data.players;
        gameState.bots = data.bots;
        gameState.coins = data.coins;
        
        localPlayer = gameState.players.find(p => p.id === gameState.playerId);
        updateLeaderboard();
    });
    
    socket.on('chatMessage', (data) => {
        addChatMessage(data);
        showSpeechBubble(data);
    });
    
    socket.on('matchStarted', (data) => {
        matchTimeLeft = data.timeLeft;
        matchStartTime = Date.now();
        gameEnded = false;
        startClientTimer();
    });
    
    socket.on('matchTimer', (timeLeft) => {
        // Sync with server time
        matchTimeLeft = timeLeft;
        matchStartTime = Date.now();
    });
    
    socket.on('gameEnded', async (finalResults) => {
        gameEnded = true;
        stopClientTimer();
        
        // Save game result to Firebase
        if (window.authSystem && localPlayer) {
            try {
                await window.authSystem.saveGameResult(localPlayer.score, {
                    finalPosition: finalResults.findIndex(p => p.id === localPlayer.id) + 1,
                    totalPlayers: finalResults.filter(p => !p.isBot).length,
                    matchDuration: 120 - matchTimeLeft
                });
            } catch (error) {
                console.error('Failed to save game result:', error);
            }
        }
        
        showGameOverModal(finalResults);
    });
}

function setupInputHandlers() {
    // Keyboard input
    document.addEventListener('keydown', (e) => {
        keys[e.code] = true;
        
        // Chat input focus handling
        if (e.code === 'Enter') {
            const chatInput = document.getElementById('chatInput');
            if (document.activeElement === chatInput) {
                sendChatMessage();
            } else {
                chatInput.focus();
            }
        }
        
        // Prevent default for game keys
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }
    });
    
    document.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });
    
    // Touch input for mobile joystick
    const joystick = document.getElementById('joystick');
    const joystickKnob = document.getElementById('joystickKnob');
    
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
    console.log('🔧 Setting up UI handlers');
    
    // Color picker setup
    const colorOptions = document.querySelectorAll('.color-option');
    console.log('🎨 Found color options:', colorOptions.length);
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove previous selection
            colorOptions.forEach(opt => opt.classList.remove('border-white'));
            // Add selection to clicked option
            option.classList.add('border-white');
            selectedColor = parseInt(option.dataset.color);
            console.log('🎨 Color selected:', selectedColor);
        });
    });
    
    // Set default color selection
    if (colorOptions.length > 0) {
        colorOptions[0].classList.add('border-white');
        console.log('🎨 Default color set');
    }
    
    // Name input and game start
    const nameInput = document.getElementById('playerNameInput');
    const walletInput = document.getElementById('playerWalletInput');
    const startBtn = document.getElementById('startGameBtn');
    const nameModal = document.getElementById('nameModal');
    
    startBtn.addEventListener('click', startGame);
    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            startGame();
        }
    });
    walletInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            startGame();
        }
    });
    
    async function startGame() {
        const playerName = nameInput.value.trim() || `Player${Math.floor(Math.random() * 1000)}`;
        const wallet = walletInput.value.trim();
        
        // Sign in anonymously if not already authenticated
        if (window.authSystem && !window.authSystem.currentUser) {
            try {
                await window.authSystem.signInAnonymously();
            } catch (error) {
                console.error('Failed to sign in:', error);
            }
        }
        
        // Update player profile if authenticated
        if (window.authSystem && window.authSystem.currentUser) {
            try {
                await window.authSystem.updateProfile({
                    playerName: playerName,
                    walletAddress: wallet
                });
            } catch (error) {
                console.error('Failed to update profile:', error);
            }
        }
        
        const playerId = window.authSystem ? window.authSystem.getCurrentUserId() : `guest_${Date.now()}_${Math.random()}`;
        socket.emit('joinGame', { 
            name: playerName, 
            wallet: wallet, 
            color: selectedColor,
            playerId: playerId 
        });
        nameModal.style.display = 'none';
    }
    
    // Chat handlers
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const mobileChatInput = document.getElementById('mobileChatInput');
    const sendMobileChatBtn = document.getElementById('sendMobileChatBtn');
    
    sendChatBtn.addEventListener('click', sendChatMessage);
    sendMobileChatBtn.addEventListener('click', sendMobileChatMessage);
    
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    mobileChatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMobileChatMessage();
        }
    });
    
    // Mobile chat toggle
    const mobileChatToggle = document.getElementById('mobileChatToggle');
    const mobileChatModal = document.getElementById('mobileChatModal');
    const closeMobileChatBtn = document.getElementById('closeMobileChatBtn');
    
    mobileChatToggle.addEventListener('click', () => {
        mobileChatModal.classList.remove('hidden');
        syncChatMessages();
    });
    
    closeMobileChatBtn.addEventListener('click', () => {
        mobileChatModal.classList.add('hidden');
    });
    
    // Desktop chat toggle
    const chatToggleBtn = document.getElementById('chatToggleBtn');
    const chatContent = document.getElementById('chatContent');
    const chatPanel = document.getElementById('chatPanel');
    
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
    

    
    // Game over modal handlers
    const playAgainBtn = document.getElementById('playAgainBtn');
    const changeSettingsBtn = document.getElementById('changeSettingsBtn');
    const gameOverModal = document.getElementById('gameOverModal');
    
    playAgainBtn.addEventListener('click', () => {
        gameOverModal.classList.add('hidden');
        gameEnded = false;
        matchTimeLeft = 120;
        socket.emit('requestNewGame');
    });
    
    changeSettingsBtn.addEventListener('click', () => {
        gameOverModal.classList.add('hidden');
        nameModal.style.display = 'block';
        gameEnded = false;
        matchTimeLeft = 120;
    });
    
    // Firebase auth handlers
    const signInBtn = document.getElementById('signInBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    
    if (signInBtn) {
        console.log('✅ Sign In button found, adding event listener');
        signInBtn.addEventListener('click', () => {
            console.log('🖱️ Sign In button clicked');
            if (window.authSystem) {
                console.log('🔄 Opening auth modal');
                window.authSystem.showAuthModal();
            } else {
                console.error('❌ AuthSystem not available');
            }
        });
    } else {
        console.error('❌ Sign In button not found');
    }
    
    if (signOutBtn) {
        signOutBtn.addEventListener('click', async () => {
            if (window.authSystem) {
                try {
                    await window.authSystem.signOut();
                } catch (error) {
                    console.error('Sign out failed:', error);
                }
            }
        });
    }
    
    // Debug: List all buttons
    const allButtons = document.querySelectorAll('button');
    console.log('🔍 All buttons found:', Array.from(allButtons).map(btn => `${btn.id || 'no-id'}: ${btn.textContent.trim().substring(0, 20)}`));
    
    // Main Google Sign In button (in welcome modal)
    const mainGoogleSignInBtn = document.getElementById('mainGoogleSignInBtn');
    console.log('🔍 Looking for mainGoogleSignInBtn:', mainGoogleSignInBtn);
    if (mainGoogleSignInBtn) {
        console.log('✅ Main Google Sign In button found');
        mainGoogleSignInBtn.addEventListener('click', async () => {
            console.log('🔑 Main Google Sign In clicked');
            const originalText = mainGoogleSignInBtn.innerHTML;
            mainGoogleSignInBtn.innerHTML = '<div class="flex items-center justify-center"><div class="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></div>Signing in...</div>';
            mainGoogleSignInBtn.disabled = true;
            
            if (window.authSystem) {
                try {
                    await window.authSystem.signInWithGoogle();
                    console.log('✅ Google sign-in successful from main button');
                    // The auth state change will hide the modal automatically
                } catch (error) {
                    console.error('❌ Google sign-in failed:', error);
                    if (window.authSystem.showError) {
                        window.authSystem.showError('Google Sign-In Failed', error.message);
                    } else {
                        alert('Google Sign-In Failed: ' + error.message);
                    }
                }
            } else {
                console.error('❌ AuthSystem not available');
                alert('Authentication system not ready. Please refresh and try again.');
            }
            
            mainGoogleSignInBtn.innerHTML = originalText;
            mainGoogleSignInBtn.disabled = false;
        });
    }
    
    // More Sign-In Options button
    const moreSignInBtn = document.getElementById('moreSignInBtn');
    console.log('🔍 Looking for moreSignInBtn:', moreSignInBtn);
    if (moreSignInBtn) {
        console.log('✅ More Sign-In Options button found');
        moreSignInBtn.addEventListener('click', () => {
            console.log('📧 More Sign-In Options clicked');
            if (window.authSystem) {
                window.authSystem.showAuthModal();
            } else {
                console.error('❌ AuthSystem not available');
            }
        });
    } else {
        console.error('❌ More Sign-In Options button not found');
    }
    
    // Main Guest Play button (in welcome modal)
    const mainGuestPlayBtn = document.getElementById('mainGuestPlayBtn');
    console.log('🔍 Looking for mainGuestPlayBtn:', mainGuestPlayBtn);
    if (mainGuestPlayBtn) {
        console.log('✅ Main Guest Play button found');
        mainGuestPlayBtn.addEventListener('click', async () => {
            console.log('👤 Guest play clicked');
            mainGuestPlayBtn.textContent = 'Signing in as guest...';
            mainGuestPlayBtn.disabled = true;
            
            if (window.authSystem) {
                try {
                    await window.authSystem.signInAnonymously();
                    console.log('✅ Anonymous sign-in successful from main button');
                    // Auth state change will handle the rest
                } catch (error) {
                    console.error('❌ Anonymous sign-in failed:', error);
                    if (window.authSystem.showError) {
                        window.authSystem.showError('Guest Access Failed', error.message);
                    } else {
                        alert('Guest Access Failed: ' + error.message);
                    }
                }
            } else {
                console.error('❌ AuthSystem not available');
                alert('Authentication system not ready. Please refresh and try again.');
            }
            
            mainGuestPlayBtn.textContent = 'Continue as Guest (no progress saved)';
            mainGuestPlayBtn.disabled = false;
        });
    } else {
        console.error('❌ Main Guest Play button not found');
    }
    
    // Alternative: Use event delegation as fallback
    document.addEventListener('click', (e) => {
        if (e.target.id === 'mainGoogleSignInBtn' || e.target.closest('#mainGoogleSignInBtn')) {
            console.log('🔥 Google Sign-In clicked via delegation');
            e.preventDefault();
            handleGoogleSignIn();
        } else if (e.target.id === 'moreSignInBtn' || e.target.closest('#moreSignInBtn')) {
            console.log('🔥 More Options clicked via delegation');
            e.preventDefault();
            handleMoreSignInOptions();
        } else if (e.target.id === 'mainGuestPlayBtn' || e.target.closest('#mainGuestPlayBtn')) {
            console.log('🔥 Guest Play clicked via delegation');
            e.preventDefault();
            handleGuestPlay();
        }
    });
}

// Separate handler functions
async function handleGoogleSignIn() {
    console.log('🔑 Handling Google Sign-In');
    if (window.authSystem) {
        try {
            await window.authSystem.signInWithGoogle();
            console.log('✅ Google sign-in successful');
        } catch (error) {
            console.error('❌ Google sign-in failed:', error);
            if (window.authSystem.showError) {
                window.authSystem.showError('Google Sign-In Failed', error.message);
            } else {
                alert('Google Sign-In Failed: ' + error.message);
            }
        }
    } else {
        console.error('❌ AuthSystem not available');
        alert('Authentication system not ready. Please refresh and try again.');
    }
}

function handleMoreSignInOptions() {
    console.log('📧 Handling More Sign-In Options');
    if (window.authSystem) {
        window.authSystem.showAuthModal();
    } else {
        console.error('❌ AuthSystem not available');
        alert('Authentication system not ready. Please refresh and try again.');
    }
}

async function handleGuestPlay() {
    console.log('👤 Handling Guest Play');
    if (window.authSystem) {
        try {
            await window.authSystem.signInAnonymously();
            console.log('✅ Anonymous sign-in successful');
        } catch (error) {
            console.error('❌ Anonymous sign-in failed:', error);
            if (window.authSystem.showError) {
                window.authSystem.showError('Guest Access Failed', error.message);
            } else {
                alert('Guest Access Failed: ' + error.message);
            }
        }
    } else {
        console.error('❌ AuthSystem not available');
        alert('Authentication system not ready. Please refresh and try again.');
    }
}

function updateMovement() {
    if (isMobile && joystickActive) {
        // Use joystick input
        return;
    }
    
    // Keyboard input
    movement.x = 0;
    movement.y = 0;
    
    if (keys['KeyA'] || keys['ArrowLeft']) movement.x -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) movement.x += 1;
    if (keys['KeyW'] || keys['ArrowUp']) movement.y -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) movement.y += 1;
    
    // Normalize diagonal movement
    if (movement.x !== 0 && movement.y !== 0) {
        const length = Math.sqrt(movement.x * movement.x + movement.y * movement.y);
        movement.x /= length;
        movement.y /= length;
    }
}

function updateCamera() {
    if (!localPlayer) return;
    
    // Smooth camera follow
    const lerpFactor = 0.1;
    camera.x += (localPlayer.x - camera.x) * lerpFactor;
    camera.y += (localPlayer.y - camera.y) * lerpFactor;
    
    // Dynamic zoom based on speed
    const speed = Math.sqrt(localPlayer.vx * localPlayer.vx + localPlayer.vy * localPlayer.vy);
    const targetZoom = Math.max(0.8, 1.2 - speed * 0.1);
    camera.zoom += (targetZoom - camera.zoom) * 0.05;
    
    // Update speed indicator
    document.getElementById('speedValue').textContent = Math.round(speed * 10) / 10;
}

function worldToScreen(worldX, worldY) {
    return {
        x: (worldX - camera.x) * camera.zoom + canvas.width / 2,
        y: (worldY - camera.y) * camera.zoom + canvas.height / 2
    };
}

function render() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save context
    ctx.save();
    
    // Draw grid background
    drawGrid();
    
    // Draw coins
    gameState.coins.forEach(coin => {
        drawCoin(coin);
    });
    
    // Draw players and bots
    [...gameState.players, ...gameState.bots].forEach(entity => {
        drawEntity(entity);
    });
    
    // Restore context
    ctx.restore();
}

function drawGrid() {
    const gridSize = 100;
    const startX = Math.floor((camera.x - canvas.width / 2 / camera.zoom) / gridSize) * gridSize;
    const startY = Math.floor((camera.y - canvas.height / 2 / camera.zoom) / gridSize) * gridSize;
    const endX = camera.x + canvas.width / 2 / camera.zoom;
    const endY = camera.y + canvas.height / 2 / camera.zoom;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
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
    
    // Skip if off-screen
    if (screenPos.x < -radius || screenPos.x > canvas.width + radius ||
        screenPos.y < -radius || screenPos.y > canvas.height + radius) {
        return;
    }
    
    // Coin body
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Coin shine effect
    const time = Date.now() * 0.003;
    const shineOpacity = 0.5 + 0.3 * Math.sin(time + coin.id);
    ctx.fillStyle = `rgba(255, 255, 255, ${shineOpacity})`;
    ctx.beginPath();
    ctx.arc(screenPos.x - radius * 0.3, screenPos.y - radius * 0.3, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // Coin border
    ctx.strokeStyle = '#FFA500';
    ctx.lineWidth = 2 * camera.zoom;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.stroke();
}

function drawEntity(entity) {
    const screenPos = worldToScreen(entity.x, entity.y);
    const radius = entity.size * camera.zoom;
    
    // Skip if off-screen
    if (screenPos.x < -radius || screenPos.x > canvas.width + radius ||
        screenPos.y < -radius || screenPos.y > canvas.height + radius) {
        return;
    }
    
    // Entity body
    ctx.fillStyle = entity.color;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Entity border
    ctx.strokeStyle = entity.id === gameState.playerId ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = (entity.id === gameState.playerId ? 3 : 2) * camera.zoom;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Name label
    ctx.fillStyle = 'white';
    ctx.font = `${Math.max(12, 14 * camera.zoom)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Name background
    const nameWidth = ctx.measureText(entity.name).width + 8;
    const nameHeight = 20 * camera.zoom;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(screenPos.x - nameWidth / 2, screenPos.y - radius - nameHeight - 5, nameWidth, nameHeight);
    
    // Name text
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

function showSpeechBubble(messageData) {
    const entity = [...gameState.players, ...gameState.bots].find(e => e.id === messageData.playerId);
    if (!entity) return;
    
    // Remove existing bubble for this entity
    const existingBubble = document.querySelector(`[data-player-id="${messageData.playerId}"]`);
    if (existingBubble) {
        existingBubble.remove();
        speechBubbles.delete(messageData.playerId);
    }
    
    // Create speech bubble
    const bubble = document.createElement('div');
    bubble.className = 'speech-bubble';
    bubble.textContent = messageData.message;
    bubble.setAttribute('data-player-id', messageData.playerId);
    
    document.body.appendChild(bubble);
    
    // Position bubble function that gets updated entity position
    function updateBubblePosition() {
        const currentEntity = [...gameState.players, ...gameState.bots].find(e => e.id === messageData.playerId);
        if (!currentEntity) {
            bubble.remove();
            speechBubbles.delete(messageData.playerId);
            return;
        }
        
        const screenPos = worldToScreen(currentEntity.x, currentEntity.y);
        const bubbleRect = bubble.getBoundingClientRect();
        
        // Check if bubble is visible on screen
        if (screenPos.x > -100 && screenPos.x < window.innerWidth + 100 && 
            screenPos.y > -100 && screenPos.y < window.innerHeight + 100) {
            bubble.style.display = 'block';
            bubble.style.left = `${screenPos.x - bubbleRect.width / 2}px`;
            bubble.style.top = `${screenPos.y - currentEntity.size * camera.zoom - bubbleRect.height - 40}px`;
        } else {
            bubble.style.display = 'none';
        }
    }
    
    updateBubblePosition();
    
    // Store update function for animation frame
    speechBubbles.set(messageData.playerId, updateBubblePosition);
    
    // Remove bubble after 4 seconds
    setTimeout(() => {
        bubble.remove();
        speechBubbles.delete(messageData.playerId);
    }, 4000);
}

function updateSpeechBubbles() {
    speechBubbles.forEach((updateFunc) => {
        updateFunc();
    });
}

function addChatMessage(messageData) {
    chatMessages.push(messageData);
    
    // Keep only last 50 messages
    if (chatMessages.length > 50) {
        chatMessages.shift();
    }
    
    // Add to desktop chat
    const chatMessagesDiv = document.getElementById('chatMessages');
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

function syncChatMessages() {
    const mobileChatMessagesDiv = document.getElementById('mobileChatMessages');
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

function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    
    if (message && socket) {
        socket.emit('chatMessage', { message });
        chatInput.value = '';
        chatInput.blur();
    }
}

function sendMobileChatMessage() {
    const mobileChatInput = document.getElementById('mobileChatInput');
    const message = mobileChatInput.value.trim();
    
    if (message && socket) {
        socket.emit('chatMessage', { message });
        mobileChatInput.value = '';
    }
}

function updateLeaderboard() {
    const allEntities = [...gameState.players, ...gameState.bots];
    allEntities.sort((a, b) => b.score - a.score);
    
    // Update match leaderboard in leaderboard manager
    if (window.leaderboardManager) {
        window.leaderboardManager.setMatchLeaderboard(allEntities.slice(0, 10));
    } else {
        // Fallback to old system if leaderboard manager not available
        const leaderboardList = document.getElementById('leaderboardList');
        if (leaderboardList) {
            leaderboardList.innerHTML = '';
            
            allEntities.slice(0, 10).forEach((entity, index) => {
                const entryDiv = document.createElement('div');
                entryDiv.className = `flex justify-between items-center text-sm ${entity.id === gameState.playerId ? 'bg-blue-800 bg-opacity-50 rounded px-2 py-1' : ''}`;
                
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
}

function startClientTimer() {
    stopClientTimer(); // Clear any existing timer
    
    clientTimerInterval = setInterval(() => {
        if (matchStartTime) {
            const elapsed = Math.floor((Date.now() - matchStartTime) / 1000);
            const currentTimeLeft = Math.max(0, matchTimeLeft - elapsed);
            updateTimerDisplay(currentTimeLeft);
            
            if (currentTimeLeft <= 0) {
                stopClientTimer();
            }
        }
    }, 100); // Update every 100ms for smooth countdown
}

function stopClientTimer() {
    if (clientTimerInterval) {
        clearInterval(clientTimerInterval);
        clientTimerInterval = null;
    }
}

function updateTimerDisplay(timeLeft = matchTimeLeft) {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timerDisplay = document.getElementById('timerDisplay');
    
    timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Change color based on time left
    const matchTimer = document.getElementById('matchTimer');
    if (timeLeft <= 30) {
        matchTimer.className = 'absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 bg-opacity-80 rounded-lg px-6 py-3 text-center z-10';
        timerDisplay.className = 'text-white font-mono text-2xl animate-pulse';
    } else if (timeLeft <= 60) {
        matchTimer.className = 'absolute top-4 left-1/2 transform -translate-x-1/2 bg-orange-600 bg-opacity-80 rounded-lg px-6 py-3 text-center z-10';
        timerDisplay.className = 'text-yellow-400 font-mono text-2xl';
    } else {
        matchTimer.className = 'absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-900 bg-opacity-80 rounded-lg px-6 py-3 text-center z-10';
        timerDisplay.className = 'text-yellow-400 font-mono text-2xl';
    }
}

function showGameOverModal(finalResults) {
    const gameOverModal = document.getElementById('gameOverModal');
    const finalLeaderboard = document.getElementById('finalLeaderboard');
    
    // Clear previous results
    finalLeaderboard.innerHTML = '';
    
    // Sort results by score
    finalResults.sort((a, b) => b.score - a.score);
    
    // Display top 10 players
    finalResults.slice(0, 10).forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'flex justify-between items-center p-2 bg-gray-700 rounded mb-1';
        
        const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const botIndicator = player.isBot ? ' 🤖' : '';
        const isCurrentPlayer = player.id === gameState.playerId;
        
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
    
    // Send movement to server
    if (socket && (movement.x !== 0 || movement.y !== 0)) {
        socket.emit('playerMove', movement);
    }
    
    updateCamera();
    updateSpeechBubbles();
    render();
    
    requestAnimationFrame(gameLoop);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM Content Loaded - Starting game initialization');
    init();
}); 