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

// Enhanced hybrid authentication system using localStorage + Firestore
class HybridAuthSystem {
    constructor() {
        this.localUsers = this.loadLocalUsers();
        this.syncInProgress = false;
        this.isOnline = navigator.onLine;
        
        // Monitor online status
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.syncWithFirestore();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
        
        // Auto-sync when Firebase is ready
        this.waitForFirebase();
    }

    // Wait for Firebase to be ready, then sync
    async waitForFirebase() {
        if (window.firebaseReady && window.firebaseDb) {
            console.log('🔥 Firebase ready, starting sync...');
            await this.syncWithFirestore();
        } else {
            // Wait and try again
            setTimeout(() => this.waitForFirebase(), 1000);
        }
    }

    // Load users from localStorage (fast, offline)
    loadLocalUsers() {
        const users = localStorage.getItem('registeredUsers');
        return users ? JSON.parse(users) : {};
    }

    // Save users to localStorage (fast, offline)
    saveLocalUsers() {
        localStorage.setItem('registeredUsers', JSON.stringify(this.localUsers));
    }

    // Simple password hashing (in real app use proper crypto)
    hashPassword(password) {
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

    // Register new user (localStorage + Firestore)
    async register(email, nickname, password, wallet = '') {
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

        // Check for existing users in localStorage first (fast)
        const existingUserByEmail = Object.values(this.localUsers).find(user => user.email === normalizedEmail);
        if (existingUserByEmail) {
            throw new Error('Email already registered');
        }

        if (this.localUsers[normalizedNickname]) {
            throw new Error('Nickname already exists');
        }

        // Create new user
        const newUser = {
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

        // Save to localStorage immediately (fast)
        this.localUsers[normalizedNickname] = newUser;
        this.saveLocalUsers();

        // Sync to Firestore (when online)
        if (this.isOnline && window.firebaseDb) {
            try {
                await this.saveUserToFirestore(normalizedNickname, newUser);
                console.log('✅ User synced to Firestore:', normalizedNickname);
            } catch (error) {
                console.warn('⚠️ Firestore sync failed (will retry later):', error.message);
                // User is still registered locally, sync will happen later
            }
        }

        return newUser;
    }

    // Login user
    async login(nickname, password) {
        const normalizedNickname = nickname.toLowerCase().trim();
        
        // First check localStorage (fast)
        let user = this.localUsers[normalizedNickname];
        
        // If not found locally and online, check Firestore
        if (!user && this.isOnline && window.firebaseDb) {
            try {
                user = await this.loadUserFromFirestore(normalizedNickname);
                if (user) {
                    // Cache in localStorage for future fast access
                    this.localUsers[normalizedNickname] = user;
                    this.saveLocalUsers();
                    console.log('📥 User loaded from Firestore and cached locally');
                }
            } catch (error) {
                console.warn('⚠️ Firestore load failed:', error.message);
            }
        }

        if (!user) {
            throw new Error('Nickname not found');
        }

        if (user.passwordHash !== this.hashPassword(password)) {
            throw new Error('Incorrect password');
        }

        // Update last login
        user.lastLogin = Date.now();
        this.localUsers[normalizedNickname] = user;
        this.saveLocalUsers();

        // Sync to Firestore (when online)
        if (this.isOnline && window.firebaseDb) {
            try {
                await this.saveUserToFirestore(normalizedNickname, user);
            } catch (error) {
                console.warn('⚠️ Login sync to Firestore failed:', error.message);
            }
        }

        return user;
    }

    // Save user to Firestore
    async saveUserToFirestore(nickname, userData) {
        if (!window.firebaseDb) throw new Error('Firestore not available');
        
        await window.firebaseDb.collection('users').doc(nickname).set({
            ...userData,
            lastSync: Date.now()
        });
    }

    // Load user from Firestore
    async loadUserFromFirestore(nickname) {
        if (!window.firebaseDb) throw new Error('Firestore not available');
        
        const doc = await window.firebaseDb.collection('users').doc(nickname).get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    }

    // Sync all local users with Firestore
    async syncWithFirestore() {
        if (this.syncInProgress || !this.isOnline || !window.firebaseDb) return;
        
        this.syncInProgress = true;
        console.log('🔄 Starting Firestore sync...');

        try {
            // Download all users from Firestore
            const snapshot = await window.firebaseDb.collection('users').get();
            let syncedCount = 0;

            snapshot.forEach(doc => {
                const firestoreUser = doc.data();
                const nickname = doc.id;
                const localUser = this.localUsers[nickname];

                // If user doesn't exist locally or Firestore version is newer
                if (!localUser || firestoreUser.lastSync > (localUser.lastSync || 0)) {
                    this.localUsers[nickname] = firestoreUser;
                    syncedCount++;
                }
            });

            // Upload any local users that aren't in Firestore or are newer
            for (const [nickname, localUser] of Object.entries(this.localUsers)) {
                try {
                    const firestoreDoc = await window.firebaseDb.collection('users').doc(nickname).get();
                    
                    if (!firestoreDoc.exists || localUser.lastLogin > (firestoreDoc.data().lastLogin || 0)) {
                        await this.saveUserToFirestore(nickname, localUser);
                        syncedCount++;
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to sync user ${nickname}:`, error.message);
                }
            }

            // Save updated local data
            this.saveLocalUsers();
            console.log(`✅ Firestore sync completed. ${syncedCount} users synchronized.`);

        } catch (error) {
            console.error('❌ Firestore sync failed:', error);
        }

        this.syncInProgress = false;
    }

    // Check if nickname exists (check both local and Firestore)
    async nicknameExists(nickname) {
        const normalizedNickname = nickname.toLowerCase().trim();
        
        // Check locally first
        if (this.localUsers[normalizedNickname]) {
            return true;
        }

        // Check Firestore if online
        if (this.isOnline && window.firebaseDb) {
            try {
                const doc = await window.firebaseDb.collection('users').doc(normalizedNickname).get();
                return doc.exists;
            } catch (error) {
                console.warn('⚠️ Firestore nickname check failed:', error.message);
            }
        }

        return false;
    }

    // Check if email exists (check both local and Firestore)
    async emailExists(email) {
        const normalizedEmail = email.toLowerCase().trim();
        
        // Check locally first
        const localExists = Object.values(this.localUsers).some(user => user.email === normalizedEmail);
        if (localExists) return true;

        // Check Firestore if online
        if (this.isOnline && window.firebaseDb) {
            try {
                const snapshot = await window.firebaseDb.collection('users')
                    .where('email', '==', normalizedEmail)
                    .limit(1)
                    .get();
                return !snapshot.empty;
            } catch (error) {
                console.warn('⚠️ Firestore email check failed:', error.message);
            }
        }

        return false;
    }

    // Get current logged in user
    getCurrentUser() {
        const currentUser = localStorage.getItem('currentUser');
        return currentUser ? JSON.parse(currentUser) : null;
    }

    // Set current logged in user
    setCurrentUser(user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
    }

    // Update user stats (both local and Firestore)
    async updateUserStats(nickname, stats) {
        const normalizedNickname = nickname.toLowerCase().trim();
        
        if (this.localUsers[normalizedNickname]) {
            this.localUsers[normalizedNickname].stats = stats;
            this.localUsers[normalizedNickname].lastLogin = Date.now();
            this.saveLocalUsers();

            // Update current user if it's the same user
            const currentUser = this.getCurrentUser();
            if (currentUser && currentUser.nickname === nickname) {
                currentUser.stats = stats;
                this.setCurrentUser(currentUser);
            }

            // Sync to Firestore
            if (this.isOnline && window.firebaseDb) {
                try {
                    await this.saveUserToFirestore(normalizedNickname, this.localUsers[normalizedNickname]);
                    console.log('📊 Stats synced to Firestore for:', nickname);
                } catch (error) {
                    console.warn('⚠️ Stats sync to Firestore failed:', error.message);
                }
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
const nicknameAuth = new HybridAuthSystem();

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
        
        // Update Player Info Panel with current game stats
        if (localPlayer) {
            updatePlayerInfoPanelStats(localPlayer);
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
        
        // Reset current game stats display
        const currentScoreElement = document.getElementById('currentScore');
        const currentSizeElement = document.getElementById('currentSize');
        
        if (currentScoreElement) {
            currentScoreElement.textContent = '0';
        }
        
        if (currentSizeElement) {
            currentSizeElement.textContent = '20';
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
        
        // Save game result to localStorage for authenticated users
        const currentUser = nicknameAuth.getCurrentUser();
        if (currentUser && localPlayer && localPlayer.name === currentUser.nickname) {
            try {
                // Calculate new stats
                const currentGameScore = localPlayer.score || 0;
                const newStats = {
                    gamesPlayed: (currentUser.stats.gamesPlayed || 0) + 1,
                    totalScore: (currentUser.stats.totalScore || 0) + currentGameScore,
                    bestScore: Math.max((currentUser.stats.bestScore || 0), currentGameScore),
                    wins: (currentUser.stats.wins || 0) + (finalResults.findIndex(p => p.id === localPlayer.id) === 0 ? 1 : 0)
                };
                
                // Update user stats in localStorage
                await nicknameAuth.updateUserStats(currentUser.nickname, newStats);
                
                console.log('📊 Game stats saved:', newStats);
                console.log('🎮 Final score:', currentGameScore);
                
                // Refresh player info panel with updated stats
                const updatedUser = nicknameAuth.getCurrentUser();
                updatePlayerInfoPanelWithStats(updatedUser);
                
            } catch (error) {
                console.error('❌ Error saving game stats:', error);
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
        // Check if user is typing in an input field
        const activeElement = document.activeElement;
        const isTyping = activeElement && (
            activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' || 
            activeElement.contentEditable === 'true'
        );
        
        // Don't process game keys if user is typing
        if (!isTyping) {
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
            
            // Prevent default for game keys only when not typing
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        }
    });
    
    document.addEventListener('keyup', (e) => {
        // Check if user is typing in an input field
        const activeElement = document.activeElement;
        const isTyping = activeElement && (
            activeElement.tagName === 'INPUT' || 
            activeElement.tagName === 'TEXTAREA' || 
            activeElement.contentEditable === 'true'
        );
        
        // Don't process game keys if user is typing
        if (!isTyping) {
            keys[e.code] = false;
        }
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

    
    // Continue as Guest Button
    const mainGuestPlayBtn = document.getElementById('mainGuestPlayBtn');
    if (mainGuestPlayBtn) {
        mainGuestPlayBtn.addEventListener('click', startGame);
    }
    
    // Event delegation fallback
    document.addEventListener('click', (e) => {
        if (e.target.id === 'startGameBtn' || e.target.closest('#startGameBtn')) {
            startGame(e);
        } else if (e.target.id === 'showRegistrationFromMainBtn' || e.target.closest('#showRegistrationFromMainBtn')) {
            console.log('📧 Create New Account clicked via delegation!'); // Debug log
            document.getElementById('nameModal').style.display = 'none';
            const registrationModal = document.getElementById('registrationModal');
            if (registrationModal) {
                console.log('📧 Opening registration modal via delegation'); // Debug log
                registrationModal.classList.remove('hidden');
            }
        }
    });
    
    async function startGame(e) {
        if (e) e.preventDefault();
        
        // Get nickname and password from main inputs
        const nicknameInput = document.getElementById('mainNicknameInput');
        const passwordInput = document.getElementById('mainPasswordInput');
        const nameModal = document.getElementById('nameModal');
        
        if (!nicknameInput || !passwordInput) {
            alert('Error: Sign in fields not found!');
            return;
        }
        
        const nickname = nicknameInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (!nickname || !password) {
            alert('Please enter both nickname and password');
            if (!nickname) nicknameInput.focus();
            else passwordInput.focus();
            return;
        }
        
        // Variables for authenticated user data
        let playerName, wallet;
        
        // Try to authenticate the user
        try {
            const user = await nicknameAuth.login(nickname, password);
            
            // Update player info panel with authenticated user
            updatePlayerInfoPanelWithStats(user);
            
            // Use authenticated user's data
            playerName = user.nickname;
            wallet = user.wallet || '';
            
        } catch (error) {
            alert('Invalid nickname or password. Please try again or create a new account.');
            return;
        }
        
        console.log('🎮 Authentication successful, starting game...');
        console.log('👤 Player Name:', playerName);
        console.log('💰 Wallet:', wallet);
        console.log('🎨 Selected Color:', selectedColor);
        
        const playerId = window.authSystem ? window.authSystem.getCurrentUserId() : `guest_${Date.now()}_${Math.random()}`;
        
        console.log('🆔 Player ID:', playerId);
        console.log('🔗 Socket connected:', socket.connected);
        
        socket.emit('joinGame', { 
            name: playerName, 
            wallet: wallet, 
            color: selectedColor,
            playerId: playerId 
        });
        
        console.log('📤 joinGame event sent to server');
        
        nameModal.style.display = 'none';
        
        console.log('🎯 Name modal hidden, game should start...');
        
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
    
    // Add event listeners for main sign in inputs
    const mainNicknameInput = document.getElementById('mainNicknameInput');
    const mainPasswordInput = document.getElementById('mainPasswordInput');
    
    if (mainNicknameInput) {
        mainNicknameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                mainPasswordInput.focus(); // Move to password field
            }
        });
    }
    
    if (mainPasswordInput) {
        mainPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                startGame(); // Start game when Enter pressed in password field
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
            document.getElementById('nameModal').style.display = 'flex';
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
            document.getElementById('nameModal').style.display = 'flex';
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
                const user = await nicknameAuth.login(nickname, password);
                
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
                const user = await nicknameAuth.register(email, nickname, password, wallet);
                
                // Close registration modal on success
                document.getElementById('registrationModal').classList.add('hidden');
                document.getElementById('nameModal').style.display = 'flex';
                
                // Clear registration form
                regEmailInput.value = '';
                regNicknameInput.value = '';
                regPasswordInput.value = '';
                regWalletInput.value = '';
                
                // Focus on nickname input in main menu for sign in
                const mainNicknameInput = document.getElementById('mainNicknameInput');
                if (mainNicknameInput) {
                    mainNicknameInput.value = user.nickname; // Pre-fill nickname for convenience
                    document.getElementById('mainPasswordInput').focus(); // Focus on password
                }
                
                // Show success message with sync status
                const syncStatus = navigator.onLine && window.firebaseDb ? 
                    'Account created and synced to cloud!' : 
                    'Account created locally (will sync when online)!';
                alert(`${syncStatus} Please sign in with your new account.`);
                
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

    // Create New Account Button (opens registration modal)
    const showRegistrationFromMainBtn = document.getElementById('showRegistrationFromMainBtn');
    if (showRegistrationFromMainBtn) {
        showRegistrationFromMainBtn.addEventListener('click', () => {
            console.log('📧 Create New Account clicked!'); // Debug log
            document.getElementById('nameModal').style.display = 'none';
            const registrationModal = document.getElementById('registrationModal');
            if (registrationModal) {
                console.log('📧 Opening registration modal'); // Debug log
                registrationModal.classList.remove('hidden');
            } else {
                console.log('❌ registrationModal not found!'); // Debug log
            }
        });
    } else {
        console.log('❌ showRegistrationFromMainBtn not found!'); // Debug log
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
    // Check if user is typing in an input field
    const activeElement = document.activeElement;
    const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.contentEditable === 'true'
    );
    
    // Don't process movement if user is typing
    if (isTyping) {
        movement.x = 0;
        movement.y = 0;
        return;
    }
    
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

async function updatePlayerInfoPanelWithStats(user) {
    console.log('🔄 updatePlayerInfoPanelWithStats called with:', user);
    
    const playerInfoName = document.getElementById('playerInfoName');
    const playerInfoStatus = document.getElementById('playerInfoStatus');
    const logoutBtn = document.getElementById('logoutBtn');

    console.log('🔍 Found elements:', {
        playerInfoName: !!playerInfoName,
        playerInfoStatus: !!playerInfoStatus,
        logoutBtn: !!logoutBtn
    });

    if (playerInfoName) {
        playerInfoName.textContent = user.nickname || 'Guest';
        console.log('✅ Updated playerInfoName to:', user.nickname);
    } else {
        console.log('❌ playerInfoName element not found!');
    }

    if (playerInfoStatus) {
        playerInfoStatus.textContent = 'Authenticated';
        console.log('✅ Updated playerInfoStatus to: Authenticated');
    } else {
        console.log('❌ playerInfoStatus element not found!');
    }

    if (logoutBtn) {
        logoutBtn.classList.remove('hidden');
        console.log('✅ Showed logout button');
    } else {
        console.log('❌ logoutBtn element not found!');
    }
    
    // Load and display user's saved statistics
    const totalCoinsElement = document.getElementById('totalCoins');
    const matchesPlayedElement = document.getElementById('matchesPlayed');
    const bestScoreElement = document.getElementById('bestScore');
    
    console.log('📊 Loading user stats:', user.stats);
    
    // Load real-time total coins from Firebase if available
    if (window.authSystem && window.authSystem.currentUser) {
        console.log('🔄 Loading real-time coins from Firebase...');
        try {
            await window.authSystem.loadPlayerTotalCoins();
        } catch (error) {
            console.warn('⚠️ Failed to load coins from Firebase:', error);
        }
    }
    
    if (user.stats) {
        // Show accumulated total coins from all games (fallback to local data if Firebase fails)
        if (totalCoinsElement && !window.authSystem?.currentUser) {
            totalCoinsElement.textContent = user.stats.totalScore || 0;
            console.log('💰 Total coins loaded from local:', user.stats.totalScore);
        }
        
        // Show matches played
        if (matchesPlayedElement) {
            matchesPlayedElement.textContent = user.stats.gamesPlayed || 0;
            console.log('🎮 Matches played loaded:', user.stats.gamesPlayed);
        }
        
        // Show best score
        if (bestScoreElement) {
            bestScoreElement.textContent = user.stats.bestScore || 0;
            console.log('🏆 Best score loaded:', user.stats.bestScore);
        }
    } else {
        console.log('⚠️ No user stats found, using defaults');
        // Set default values only if not using Firebase
        if (!window.authSystem?.currentUser) {
            if (totalCoinsElement) totalCoinsElement.textContent = '0';
        }
        if (matchesPlayedElement) matchesPlayedElement.textContent = '0';
        if (bestScoreElement) bestScoreElement.textContent = '0';
    }
}

async function updatePlayerInfoPanelStats(player) {
    // Only update total accumulated stats, not current game
    const currentUser = nicknameAuth.getCurrentUser();
    if (!currentUser || player.name !== currentUser.nickname) {
        return; // Only update for authenticated current user
    }
    
    // Update best score if current score is higher
    const bestScoreElement = document.getElementById('bestScore');
    if (bestScoreElement) {
        const currentBest = parseInt(bestScoreElement.textContent) || 0;
        const currentGameScore = player.score || 0;
        
        if (currentGameScore > currentBest) {
            bestScoreElement.textContent = currentGameScore;
            
            // Update in Firestore/localStorage
            currentUser.stats.bestScore = currentGameScore;
            await nicknameAuth.updateUserStats(currentUser.nickname, currentUser.stats);
            console.log('🏆 New best score recorded:', currentGameScore);
        }
    }
}

function loadSavedPlayerData() {
    // Check if user is authenticated
    const currentUser = nicknameAuth.getCurrentUser();
    if (currentUser) {
        console.log('🔄 Loading saved player data for:', currentUser.nickname);
        
        // Load latest user data from Firestore/localStorage
        updatePlayerInfoPanelWithStats(currentUser);
        
        // Try to sync with Firestore to get latest data
        if (nicknameAuth.isOnline && window.firebaseDb) {
            setTimeout(async () => {
                try {
                    console.log('🔄 Syncing with Firestore for latest data...');
                    await nicknameAuth.syncWithFirestore();
                    
                    // Reload user data after sync
                    const updatedUser = nicknameAuth.getCurrentUser();
                    if (updatedUser) {
                        updatePlayerInfoPanelWithStats(updatedUser);
                        console.log('✅ Player data updated from Firestore');
                    }
                } catch (error) {
                    console.warn('⚠️ Failed to sync with Firestore:', error.message);
                }
            }, 2000); // Wait 2 seconds for Firebase to initialize
        }
    } else {
        console.log('ℹ️ No saved user data found');
    }
} 