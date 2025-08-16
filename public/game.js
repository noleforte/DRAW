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
let matchTimeLeft = null; // Will be calculated based on GMT day end
let matchDuration = 86400; // Total match duration in seconds (24 hours)
let gameEnded = false;
let matchStartTime = null;
let clientTimerInterval = null;
let timeOffset = 0; // Offset between client and server time

// Background image
let backgroundImage = null;
let backgroundLoaded = false;

// Input handling
let movement = { x: 0, y: 0 };
let joystickActive = false;
let joystickCenter = { x: 0, y: 0 };
let lastMovementSent = 0;
const MOVEMENT_SEND_INTERVAL = 1000 / 30; // Send movement at 30fps max

// Enhanced authentication system using localStorage
class NicknameAuthSystem {
    constructor() {
        this.users = this.loadUsers();
    }

    // Load users from localStorage
    loadUsers() {
        const users = localStorage.getItem('registeredUsers');
        return users ? JSON.parse(users) : {};
    }

    // Save users to localStorage
    saveUsers() {
        localStorage.setItem('registeredUsers', JSON.stringify(this.users));
    }

    // Simple password hashing (in real app use proper crypto)
    hashPassword(password) {
        // Simple hash - in production use bcrypt or similar
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    // Validate email format
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Register new user
    register(email, nickname, password, wallet = '') {
        const normalizedNickname = nickname.toLowerCase().trim();
        const normalizedEmail = email.toLowerCase().trim();
        
        // Validation
        if (!email || !this.isValidEmail(email)) {
            throw new Error('Please enter a valid email address');
        }

        if (!nickname || nickname.length < 3) {
            throw new Error('Nickname must be at least 3 characters');
        }

        if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }

        // Check for existing email
        const existingUserByEmail = Object.values(this.users).find(user => user.email === normalizedEmail);
        if (existingUserByEmail) {
            throw new Error('Email already registered');
        }

        // Check for existing nickname
        if (this.users[normalizedNickname]) {
            throw new Error('Nickname already exists');
        }

        // Create new user
        this.users[normalizedNickname] = {
            email: normalizedEmail,
            nickname: nickname.trim(),
            passwordHash: this.hashPassword(password),
            wallet: wallet.trim(),
            createdAt: Date.now(),
            lastLogin: Date.now(),
            stats: {
                gamesPlayed: 0,
                totalScore: 0,
                bestScore: 0,
                wins: 0
            }
        };

        this.saveUsers();
        return this.users[normalizedNickname];
    }

    // Login user
    login(nickname, password) {
        const normalizedNickname = nickname.toLowerCase().trim();
        const user = this.users[normalizedNickname];

        if (!user) {
            throw new Error('Nickname not found');
        }

        if (user.passwordHash !== this.hashPassword(password)) {
            throw new Error('Incorrect password');
        }

        // Update last login
        user.lastLogin = Date.now();
        this.saveUsers();

        return user;
    }

    // Check if nickname exists
    nicknameExists(nickname) {
        const normalizedNickname = nickname.toLowerCase().trim();
        return !!this.users[normalizedNickname];
    }

    // Check if email exists
    emailExists(email) {
        const normalizedEmail = email.toLowerCase().trim();
        return Object.values(this.users).some(user => user.email === normalizedEmail);
    }

    // Get current logged in user
    getCurrentUser() {
        const currentUser = localStorage.getItem('currentUser');
        return currentUser ? JSON.parse(currentUser) : null;
    }

    // Set current user
    setCurrentUser(user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
        localStorage.setItem('playerNickname', user.nickname);
        localStorage.setItem('playerWallet', user.wallet);
    }

    // Update user stats
    updateUserStats(nickname, stats) {
        const normalizedNickname = nickname.toLowerCase().trim();
        if (this.users[normalizedNickname]) {
            Object.assign(this.users[normalizedNickname].stats, stats);
            this.saveUsers();
            
            // Update current user if it's the same user
            const currentUser = this.getCurrentUser();
            if (currentUser && currentUser.nickname.toLowerCase() === normalizedNickname) {
                currentUser.stats = this.users[normalizedNickname].stats;
                this.setCurrentUser(currentUser);
            }
        }
    }

    // Logout
    logout() {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('playerNickname');
        localStorage.removeItem('playerWallet');
    }
}

// Initialize nickname auth system
const nicknameAuth = new NicknameAuthSystem();

// Initialize game
function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Load background image
    loadBackgroundImage();
    
    // Set canvas size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Show player info panel with animation
    setTimeout(() => {
        const nameModal = document.getElementById('nameModal');
        if (nameModal) {
            nameModal.classList.add('show');
        }
    }, 100);
    
    // Setup socket connection
    const isProduction = window.location.hostname !== 'localhost';
    // Use Render server URL in production, localhost for development
    const socketUrl = isProduction ? 'https://draw-e67b.onrender.com' : 'http://localhost:3001';
    
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
    
    // Calculate initial time until end of GMT day
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(23, 59, 59, 999);
    matchTimeLeft = Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));
    
    // Initialize timer display immediately
    updateTimerDisplay();
    
    // Start client timer for real-time updates
    startClientTimer();
}

function loadBackgroundImage() {
    backgroundImage = new Image();
    backgroundImage.onload = function() {
        backgroundLoaded = true;
    };
    backgroundImage.onerror = function() {
        backgroundLoaded = false;
        // Try to load a fallback or continue without background
    };
    backgroundImage.src = 'world_bg_4000x4000.png';
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function setupSocketListeners() {
    socket.on('connect', () => {
        // Connected to server - no logs
    });
    
    // Note: connect_error handler is now in setupSocketListeners
    
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
        
        const previousLocalPlayer = localPlayer;
        localPlayer = gameState.players.find(p => p.id === gameState.playerId);
        
        if (!localPlayer) {
            // Try to recover localPlayer
            if (previousLocalPlayer) {
                localPlayer = previousLocalPlayer;
            }
        }
        
        updateLeaderboard();
    });
    
    socket.on('chatMessage', (data) => {
        addChatMessage(data);
        showSpeechBubble(data);
    });
    
    socket.on('matchStarted', (data) => {
        matchTimeLeft = data.timeLeft;
        gameEnded = false;
        timeOffset = 0; // Reset time offset for new match
        
        // Store end of GMT day if provided
        if (data.endOfDayGMT) {
            window.endOfDayGMT = data.endOfDayGMT;
        }
        
        startClientTimer();
    });
    
    socket.on('matchTimer', (data) => {
        if (data.timeLeft !== undefined) {
            matchTimeLeft = data.timeLeft;
            
            // Calculate time offset between client and server for better sync
            timeOffset = Date.now() - data.serverTime;
            
            updateTimerDisplay(matchTimeLeft);
            
            if (data.endOfDayGMT) {
                window.endOfDayGMT = data.endOfDayGMT;
            }
        }
    });
    
    socket.on('gameEnded', async (finalResults) => {
        gameEnded = true;
        stopClientTimer();
        
        // Save game result to Firebase
        if (window.authSystem && localPlayer) {
            try {
                await window.authSystem.updateUserStats(localPlayer.nickname, {
                    gamesPlayed: localPlayer.stats.gamesPlayed + 1,
                    totalScore: localPlayer.stats.totalScore + localPlayer.score,
                    bestScore: Math.max(localPlayer.stats.bestScore, localPlayer.score),
                    wins: localPlayer.stats.wins + (finalResults.findIndex(p => p.id === localPlayer.id) + 1 === 1 ? 1 : 0)
                });
            } catch (error) {
                // Silent error handling
            }
        }
        
        showGameOverModal(finalResults);
    });
    
    socket.on('disconnect', () => {
        // Try to reconnect after short delay
        setTimeout(() => {
            if (!socket.connected) {
                socket.connect();
            }
        }, 3000);
    });
    
    socket.on('connect_error', (error) => {
        // Show user-friendly message for connection issues
        showConnectionError('Cannot connect to game server. Retrying...');
    });
    
    socket.on('serverShutdown', (data) => {
        showServerMessage('Server is restarting. Please refresh the page in a moment.');
    });
    
    socket.on('ping', () => {
        socket.emit('pong');
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
    // Color picker setup
    const colorOptions = document.querySelectorAll('.color-option');
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove previous selection
            colorOptions.forEach(opt => opt.classList.remove('border-white'));
            // Add selection to clicked option
            option.classList.add('border-white');
            selectedColor = parseInt(option.dataset.color);
        });
    });
    
    // Set default color selection
    if (colorOptions.length > 0) {
        colorOptions[0].classList.add('border-white');
    }
    
    // Game over modal close button
    const gameOverClose = document.getElementById('gameOverClose');
    if (gameOverClose) {
        gameOverClose.addEventListener('click', () => {
            document.getElementById('gameOverModal').classList.add('hidden');
            document.getElementById('nameModal').style.display = 'flex';
        });
    }
    
    // Try to find the button by multiple methods
    let startBtn = document.getElementById('startGameBtn');
    
    if (startBtn) {
        startBtn.addEventListener('click', startGame);
    }
    
    // Main Google Sign In Button
    const mainGoogleSignInBtn = document.getElementById('mainGoogleSignInBtn');
    if (mainGoogleSignInBtn) {
        mainGoogleSignInBtn.addEventListener('click', () => {
            if (window.authSystem) {
                window.authSystem.signInWithGoogle();
            }
        });
    }
    
    // More Sign-In Options Button
    const moreSignInBtn = document.getElementById('moreSignInBtn');
    if (moreSignInBtn) {
        moreSignInBtn.addEventListener('click', () => {
            console.log('🔍 More Sign-In Options clicked!'); // Debug log
            document.getElementById('nameModal').style.display = 'none';
            const authModal = document.getElementById('authModal');
            if (authModal) {
                console.log('🔍 Removing hidden class from authModal'); // Debug log
                authModal.classList.remove('hidden');
            } else {
                console.log('❌ authModal not found!'); // Debug log
            }
        });
    } else {
        console.log('❌ moreSignInBtn not found!'); // Debug log
    }
    
    // Continue as Guest Button
    const mainGuestPlayBtn = document.getElementById('mainGuestPlayBtn');
    if (mainGuestPlayBtn) {
        mainGuestPlayBtn.addEventListener('click', startGame);
    }
    
    // Event delegation fallback
    document.addEventListener('click', (e) => {
        if (e.target.id === 'startGameBtn' || e.target.closest('#startGameBtn')) {
            startGame(e);
        } else if (e.target.id === 'mainGoogleSignInBtn' || e.target.closest('#mainGoogleSignInBtn')) {
            if (window.authSystem) {
                window.authSystem.signInWithGoogle();
            }
        } else if (e.target.id === 'moreSignInBtn' || e.target.closest('#moreSignInBtn')) {
            console.log('🔍 More Sign-In Options clicked via delegation!'); // Debug log
            document.getElementById('nameModal').style.display = 'none';
            const authModal = document.getElementById('authModal');
            if (authModal) {
                console.log('🔍 Removing hidden class from authModal via delegation'); // Debug log
                authModal.classList.remove('hidden');
            }
        } else if (e.target.id === 'mainGuestPlayBtn' || e.target.closest('#mainGuestPlayBtn')) {
            startGame(e);
        }
    });
    
    function startGame(e) {
        if (e) e.preventDefault();
        
        const nameInput = document.getElementById('playerNameInput'); // Fixed: was 'playerName'
        const nameModal = document.getElementById('nameModal');
        const playerName = nameInput.value.trim();
        
        if (!playerName) {
            nameInput.focus();
            return;
        }
        
        // Auto-fill authenticated user info if available
        let wallet = '';
        if (window.authSystem && window.authSystem.currentUser) {
            try {
                if (window.authSystem.autoFillPlayerInfo) {
                    const userInfo = window.authSystem.autoFillPlayerInfo();
                    if (userInfo.wallet) {
                        wallet = userInfo.wallet;
                    }
                }
            } catch (error) {
                // Silent error handling
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
        
        // Force canvas visibility and test rendering
        if (canvas) {
            canvas.style.display = 'block';
            canvas.style.visibility = 'visible';
            
            // Test if we can draw on canvas
            if (ctx) {
                ctx.fillStyle = '#ff0000';
                ctx.fillRect(10, 10, 100, 100);
            }
        }
    }
    
    // Chat handlers
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const mobileChatInput = document.getElementById('mobileChatInput');
    const sendMobileChatBtn = document.getElementById('sendMobileChatBtn');
    
    // Add event listeners for name and wallet inputs
    const nameInput = document.getElementById('playerNameInput');
    const walletInput = document.getElementById('playerWalletInput');
    
    if (nameInput) {
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                startGame();
            }
        });
    }
    
    if (walletInput) {
        walletInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                startGame();
            }
        });
    }
    
    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', sendChatMessage);
    }
    
    if (sendMobileChatBtn) {
        sendMobileChatBtn.addEventListener('click', sendMobileChatMessage);
    }
    
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }
    
    if (mobileChatInput) {
        mobileChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMobileChatMessage();
            }
        });
    }
    
    // Mobile chat toggle
    const mobileChatToggle = document.getElementById('mobileChatToggle');
    const mobileChatModal = document.getElementById('mobileChatModal');
    const closeMobileChatBtn = document.getElementById('closeMobileChatBtn');
    
    if (mobileChatToggle) {
        mobileChatToggle.addEventListener('click', () => {
            mobileChatModal.classList.remove('hidden');
            syncChatMessages();
        });
    }
    
    if (closeMobileChatBtn) {
        closeMobileChatBtn.addEventListener('click', () => {
            mobileChatModal.classList.add('hidden');
        });
    }
    
    // Auth Modal handlers
    const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const guestPlayBtn = document.getElementById('guestPlayBtn');
    const signInBtn = document.getElementById('signInBtn');
    const showRegistrationBtn = document.getElementById('showRegistrationBtn');
    const authNicknameInput = document.getElementById('authNicknameInput');
    const authPasswordInput = document.getElementById('authPasswordInput');
    
    // Registration Modal handlers
    const closeRegistrationModalBtn = document.getElementById('closeRegistrationModalBtn');
    const createAccountBtn = document.getElementById('createAccountBtn');
    const backToLoginBtn = document.getElementById('backToLoginBtn');
    const regEmailInput = document.getElementById('regEmailInput');
    const regNicknameInput = document.getElementById('regNicknameInput');
    const regPasswordInput = document.getElementById('regPasswordInput');
    const regWalletInput = document.getElementById('regWalletInput');
    
    if (closeAuthModalBtn) {
        closeAuthModalBtn.addEventListener('click', () => {
            document.getElementById('authModal').classList.add('hidden');
            document.getElementById('nameModal').style.display = 'flex';
        });
    }
    
    if (closeRegistrationModalBtn) {
        closeRegistrationModalBtn.addEventListener('click', () => {
            document.getElementById('registrationModal').classList.add('hidden');
            document.getElementById('authModal').classList.remove('hidden');
        });
    }
    
    if (showRegistrationBtn) {
        showRegistrationBtn.addEventListener('click', () => {
            document.getElementById('authModal').classList.add('hidden');
            document.getElementById('registrationModal').classList.remove('hidden');
        });
    }
    
    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', () => {
            document.getElementById('registrationModal').classList.add('hidden');
            document.getElementById('authModal').classList.remove('hidden');
        });
    }
    
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', async () => {
            if (window.authSystem) {
                try {
                    await window.authSystem.signInWithGoogle();
                    // Close auth modal on success
                    document.getElementById('authModal').classList.add('hidden');
                    document.getElementById('nameModal').style.display = 'flex';
                } catch (error) {
                    // Handle error silently or show user-friendly message
                    alert('Sign in failed. Please try again.');
                }
            }
        });
    }
    
    if (signInBtn) {
        signInBtn.addEventListener('click', async () => {
            const nickname = authNicknameInput.value.trim();
            const password = authPasswordInput.value;
            
            if (!nickname || !password) {
                alert('Please enter both nickname and password.');
                return;
            }
            
            try {
                // Try to login with nickname + password
                const user = nicknameAuth.login(nickname, password);
                
                // Set as current user
                nicknameAuth.setCurrentUser(user);
                
                // Close auth modal on success
                document.getElementById('authModal').classList.add('hidden');
                document.getElementById('nameModal').style.display = 'flex';
                
                // Auto-fill the main name input
                const mainNameInput = document.getElementById('playerNameInput');
                if (mainNameInput) {
                    mainNameInput.value = user.nickname;
                }
                
                // Auto-fill wallet if available
                const mainWalletInput = document.getElementById('playerWalletInput');
                if (mainWalletInput && user.wallet) {
                    mainWalletInput.value = user.wallet;
                }
                
                // Update player info panel with stats
                updatePlayerInfoPanelWithStats(user);
                
                alert(`Welcome back, ${user.nickname}!`);
                
            } catch (error) {
                alert('Sign in failed: ' + error.message);
            }
        });
    }
    
    if (createAccountBtn) {
        createAccountBtn.addEventListener('click', async () => {
            const email = regEmailInput.value.trim();
            const nickname = regNicknameInput.value.trim();
            const password = regPasswordInput.value;
            const wallet = regWalletInput.value.trim();
            
            if (!email || !nickname || !password) {
                alert('Please fill in all required fields (Email, Nickname, Password).');
                return;
            }
            
            try {
                // Try to register new user
                const user = nicknameAuth.register(email, nickname, password, wallet);
                
                // Set as current user
                nicknameAuth.setCurrentUser(user);
                
                // Close registration modal on success
                document.getElementById('registrationModal').classList.add('hidden');
                document.getElementById('nameModal').style.display = 'flex';
                
                // Auto-fill the main name input
                const mainNameInput = document.getElementById('playerNameInput');
                if (mainNameInput) {
                    mainNameInput.value = user.nickname;
                }
                
                // Auto-fill wallet if available
                const mainWalletInput = document.getElementById('playerWalletInput');
                if (mainWalletInput && user.wallet) {
                    mainWalletInput.value = user.wallet;
                }
                
                // Update player info panel with stats
                updatePlayerInfoPanelWithStats(user);
                
                alert(`Account created successfully! Welcome, ${user.nickname}!`);
                
            } catch (error) {
                alert('Registration failed: ' + error.message);
            }
        });
    }
    
    // Add Enter key support for email form
    if (authNicknameInput) {
        authNicknameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                authPasswordInput.focus();
            }
        });
    }
    
    if (authPasswordInput) {
        authPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                signInBtn.click();
            }
        });
    }
    
    if (regEmailInput) {
        regEmailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                regNicknameInput.focus();
            }
        });
    }
    
    if (regNicknameInput) {
        regNicknameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                regPasswordInput.focus();
            }
        });
    }
    
    if (regPasswordInput) {
        regPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                createAccountBtn.click();
            }
        });
    }
    
    if (guestPlayBtn) {
        guestPlayBtn.addEventListener('click', async () => {
            if (window.authSystem) {
                try {
                    await window.authSystem.signInAnonymously();
                    // Close auth modal on success
                    document.getElementById('authModal').classList.add('hidden');
                    document.getElementById('nameModal').style.display = 'flex';
                } catch (error) {
                    // Handle error silently or show user-friendly message
                    alert('Guest sign in failed. Please try again.');
                }
            }
        });
    }

    // Logout button handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                nicknameAuth.logout();
                
                // Clear form inputs
                const mainNameInput = document.getElementById('playerNameInput');
                const mainWalletInput = document.getElementById('playerWalletInput');
                if (mainNameInput) mainNameInput.value = '';
                if (mainWalletInput) mainWalletInput.value = '';
                
                // Update player info panel
                updatePlayerInfoPanel('Guest', 'Not signed in');
                
                alert('Logged out successfully!');
            }
        });
    }
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
    if (!localPlayer) {
        return;
    }
    
    // Smooth camera follow
    const lerpFactor = 0.1;
    camera.x += (localPlayer.x - camera.x) * lerpFactor;
    camera.y += (localPlayer.y - camera.y) * lerpFactor;
    
    // Dynamic zoom based on speed (with safety checks)
    const vx = localPlayer.vx || 0;
    const vy = localPlayer.vy || 0;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const targetZoom = Math.max(0.8, 1.2 - speed * 0.1);
    camera.zoom += (targetZoom - camera.zoom) * 0.05;
    
    // Update speed indicator (with safety check)
    const speedElement = document.getElementById('speedValue');
    if (speedElement) {
        speedElement.textContent = isNaN(speed) ? '0.0' : (Math.round(speed * 10) / 10).toString();
    }
}

function worldToScreen(worldX, worldY) {
    return {
        x: (worldX - camera.x) * camera.zoom + canvas.width / 2,
        y: (worldY - camera.y) * camera.zoom + canvas.height / 2
    };
}

function render() {
    if (!ctx || !canvas) {
        return;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Save context
    ctx.save();
    
    // Draw background image
    drawBackground();
    
    // Always draw grid background over the image
    drawGrid();
    
    // Draw coins
    gameState.coins.forEach(coin => {
        drawCoin(coin);
    });
    
    // Draw players and bots
    const players = gameState.players || [];
    const bots = gameState.bots || [];
    const allEntities = [...players, ...bots];
    
    // Silent rendering - no logs
    allEntities.forEach(entity => {
        if (entity) {
            drawEntity(entity);
        }
    });
    
    // Restore context
    ctx.restore();
}

function drawBackground() {
    if (!backgroundLoaded || !backgroundImage) {
        // Fallback to solid color if image not loaded
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        console.log('⚠️ Background image not loaded, using fallback color');
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
    if (!entity) {
        console.warn('⚠️ Attempted to draw null entity');
        return;
    }
    
    const screenPos = worldToScreen(entity.x, entity.y);
    const radius = entity.size * camera.zoom;
    
    // Debug: log first few draws
    if (Math.random() < 0.01) { // 1% chance to avoid spam
        console.log(`🎯 Drawing entity "${entity.name}" at (${entity.x}, ${entity.y}) screen: (${screenPos.x}, ${screenPos.y}) radius: ${radius}`);
    }
    
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
    
    const timeStr = new Date(messageData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (messageData.isSystem) {
        // System messages (bot join/leave notifications)
        messageDiv.className = 'bg-yellow-900 bg-opacity-50 rounded px-2 py-1 border-l-2 border-yellow-500';
        messageDiv.innerHTML = `
            <span class="text-gray-400 text-xs">${timeStr}</span>
            <span class="font-semibold text-yellow-400">📢 System:</span>
            <span class="text-yellow-200 italic">${messageData.message}</span>
        `;
    } else {
        // Regular player messages
        messageDiv.className = 'bg-gray-800 rounded px-2 py-1';
    messageDiv.innerHTML = `
        <span class="text-gray-400 text-xs">${timeStr}</span>
        <span class="font-semibold text-blue-300">${messageData.playerName}:</span>
        <span class="text-white">${messageData.message}</span>
    `;
    }
    
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
        
        const timeStr = new Date(messageData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (messageData.isSystem) {
            // System messages for mobile
            messageDiv.className = 'bg-yellow-900 bg-opacity-50 rounded px-2 py-1 border-l-2 border-yellow-500';
            messageDiv.innerHTML = `
                <span class="text-gray-400 text-xs">${timeStr}</span>
                <span class="font-semibold text-yellow-400">📢</span>
                <span class="text-yellow-200 italic text-xs">${messageData.message}</span>
            `;
        } else {
            // Regular messages for mobile
            messageDiv.className = 'bg-gray-800 rounded px-2 py-1';
        messageDiv.innerHTML = `
            <span class="text-gray-400 text-xs">${timeStr}</span>
            <span class="font-semibold text-blue-300">${messageData.playerName}:</span>
            <span class="text-white">${messageData.message}</span>
        `;
        }
        
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
        window.leaderboardManager.setMatchLeaderboard(allEntities.slice(0, 15));
    } else {
        // Fallback to old system if leaderboard manager not available
    const leaderboardList = document.getElementById('leaderboardList');
        if (leaderboardList) {
    leaderboardList.innerHTML = '';
    
            allEntities.slice(0, 15).forEach((entity, index) => {
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
    
    console.log('🕐 Starting client timer');
    
    clientTimerInterval = setInterval(() => {
        // Calculate time remaining until end of GMT day
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setUTCHours(23, 59, 59, 999); // End at 23:59:59.999 GMT
        
        const currentTimeLeft = Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));
        matchTimeLeft = currentTimeLeft; // Update global variable
            updateTimerDisplay(currentTimeLeft);
            
            if (currentTimeLeft <= 0) {
            console.log('⏰ Day ended, stopping timer');
                stopClientTimer();
            }
    }, 1000); // Update every second is sufficient for day countdown
}

function stopClientTimer() {
    if (clientTimerInterval) {
        clearInterval(clientTimerInterval);
        clientTimerInterval = null;
    }
}

function showServerMessage(message, type = 'info') {
    const messageEl = document.createElement('div');
    const bgColor = type === 'warning' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#3b82f6';
    
    messageEl.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: ${bgColor}; color: white; padding: 12px 24px;
        border-radius: 8px; z-index: 1000; font-weight: bold;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        animation: slideDown 0.3s ease-out;
    `;
    messageEl.textContent = message;
    document.body.appendChild(messageEl);
    
    // Remove message after 10 seconds
    setTimeout(() => {
        if (messageEl.parentNode) {
            messageEl.style.animation = 'slideUp 0.3s ease-in';
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                }
            }, 300);
        }
    }, 10000);
}

function showConnectionError(message) {
    showServerMessage(message, 'error');
}

function updateTimerDisplay(timeLeft = matchTimeLeft) {
    const timerDisplay = document.getElementById('timerDisplay');
    const gmtDisplay = document.getElementById('gmtDisplay');

    // Always show current GMT time
    const gmtTime = new Date().toUTCString().split(' ')[4]; // Extract HH:MM:SS from GMT string
    if (gmtDisplay) {
        gmtDisplay.textContent = `GMT: ${gmtTime}`;
    }

    // If no timeLeft provided, calculate it manually
    if (timeLeft === undefined || timeLeft === null || isNaN(timeLeft)) {
        // Calculate time until end of GMT day
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setUTCHours(23, 59, 59, 999);
        timeLeft = Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));
    }

    const hours = Math.floor(timeLeft / 3600);
    const minutes = Math.floor((timeLeft % 3600) / 60);
    const seconds = timeLeft % 60;
    
    // Format time as HH:MM:SS
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    if (timerDisplay) {
        timerDisplay.textContent = timeString;
    }
    
    // Change color based on time left
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

function showGameOverModal(finalResults) {
    const gameOverModal = document.getElementById('gameOverModal');
    const finalLeaderboard = document.getElementById('finalLeaderboard');
    
    // Clear previous results
    finalLeaderboard.innerHTML = '';
    
    // Sort results by score
    finalResults.sort((a, b) => b.score - a.score);
    
    // Display top 15 players
    finalResults.slice(0, 15).forEach((player, index) => {
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

let gameLoopCounter = 0;

function gameLoop() {
    if (gameEnded) {
        requestAnimationFrame(gameLoop);
        return;
    }
    
    // Silent game loop - no logs
    updateMovement();
    
    // Send movement to server (throttled to 30fps max)
    if (socket) {
        const now = Date.now();
        if (now - lastMovementSent > MOVEMENT_SEND_INTERVAL) {
            socket.emit('playerMove', movement);
            lastMovementSent = now;
        }
    }
    
    updateCamera();
    updateSpeechBubbles();
    render();
    
    requestAnimationFrame(gameLoop);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    init();
    
    // Load saved player data
    loadSavedPlayerData();
});

function updatePlayerInfoPanel(nickname, status) {
    const playerInfoName = document.getElementById('playerInfoName');
    const playerInfoStatus = document.getElementById('playerInfoStatus');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (playerInfoName) {
        playerInfoName.textContent = nickname || 'Guest';
    }
    
    if (playerInfoStatus) {
        playerInfoStatus.textContent = status || 'Not signed in';
    }
    
    // Show/hide logout button based on authentication status
    if (logoutBtn) {
        if (status === 'Authenticated') {
            logoutBtn.classList.remove('hidden');
        } else {
            logoutBtn.classList.add('hidden');
        }
    }
}

function updatePlayerInfoPanelWithStats(user) {
    const playerInfoName = document.getElementById('playerInfoName');
    const playerInfoStatus = document.getElementById('playerInfoStatus');
    const logoutBtn = document.getElementById('logoutBtn');

    if (playerInfoName) {
        playerInfoName.textContent = user.nickname || 'Guest';
    }

    if (playerInfoStatus) {
        playerInfoStatus.textContent = 'Authenticated';
    }

    if (logoutBtn) {
        logoutBtn.classList.remove('hidden');
    }
}

function loadSavedPlayerData() {
    // Check if user is authenticated
    const currentUser = nicknameAuth.getCurrentUser();
    
    if (currentUser) {
        // Auto-fill main name input
        const mainNameInput = document.getElementById('playerNameInput');
        if (mainNameInput) {
            mainNameInput.value = currentUser.nickname;
        }
        
        // Auto-fill wallet input
        const mainWalletInput = document.getElementById('playerWalletInput');
        if (mainWalletInput && currentUser.wallet) {
            mainWalletInput.value = currentUser.wallet;
        }
        
        // Update player info panel
        updatePlayerInfoPanelWithStats(currentUser);
        
    } else {
        // Try to load old saved data (for backwards compatibility)
        const savedNickname = localStorage.getItem('playerNickname');
        const savedWallet = localStorage.getItem('playerWallet');
        
        if (savedNickname) {
            // Auto-fill main name input
            const mainNameInput = document.getElementById('playerNameInput');
            if (mainNameInput) {
                mainNameInput.value = savedNickname;
            }
            
            // Auto-fill wallet input
            const mainWalletInput = document.getElementById('playerWalletInput');
            if (mainWalletInput && savedWallet) {
                mainWalletInput.value = savedWallet;
            }
            
            // Update player info panel
            updatePlayerInfoPanel(savedNickname, 'Saved locally');
        }
    }
} 