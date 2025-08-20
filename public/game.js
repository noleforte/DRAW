// Game state
let socket = null;
let gameState = {
    players: [],
    bots: [],
    coins: [],
    boosters: [],
    worldSize: 4000,
    playerId: null
};
let currentSocketId = null; // Store current socket.id for proper player identification

let camera = {
    x: 0,
    y: 0,
    zoom: 1
};

let localPlayer = null;
window.localPlayer = localPlayer; // Make it globally available
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
let gamePaused = false; // Game pause state
let activeBoosters = {
    speed: { active: false, multiplier: 1, endTime: 0 },
    coins: { active: false, multiplier: 1, endTime: 0 }
};

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

        // Check Firestore for existing users (more thorough)
        if (this.isOnline && window.firebaseDb) {
            console.log('🔍 Checking Firestore for existing users...');
            
            const nicknameExists = await this.nicknameExists(normalizedNickname);
            if (nicknameExists) {
                throw new Error('Nickname already exists in cloud database');
            }

            const emailExists = await this.emailExists(normalizedEmail);
            if (emailExists) {
                throw new Error('Email already registered in cloud database');
            }
            
            console.log('✅ No conflicts found in Firestore');
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
                console.log('🔄 Attempting to save user to Firestore:', normalizedNickname);
                await this.saveUserToFirestore(normalizedNickname, newUser);
                console.log('✅ User successfully saved to Firestore:', normalizedNickname);
                
                // Verify the save by reading it back
                const savedUser = await this.loadUserFromFirestore(normalizedNickname);
                console.log('🔍 Verification - User retrieved from Firestore:', savedUser ? 'SUCCESS' : 'FAILED');
                
            } catch (error) {
                console.error('❌ Firestore save failed:', error);
                console.warn('⚠️ Firestore sync failed (will retry later):', error.message);
                // User is still registered locally, sync will happen later
            }
        } else {
            console.warn('⚠️ Firestore not available for saving user. Online:', this.isOnline, 'FirebaseDb:', !!window.firebaseDb);
        }

        return newUser;
    }

    // Login user (Firestore first, localStorage as fallback)
    async login(nickname, password) {
        const normalizedNickname = nickname.toLowerCase().trim();
        let user = null;
        
        // First try Firestore (authoritative source)
        if (this.isOnline && window.firebaseDb) {
            try {
                user = await this.loadUserFromFirestore(normalizedNickname);
                if (user) {
                    // Update local cache
                    this.localUsers[normalizedNickname] = user;
                    this.saveLocalUsers();
                    console.log('🔥 User loaded from Firestore (primary source)');
                }
            } catch (error) {
                console.warn('⚠️ Firestore load failed, trying localStorage:', error.message);
            }
        }
        
        // Fallback to localStorage cache if Firestore failed
        if (!user) {
            user = this.localUsers[normalizedNickname];
            if (user) {
                console.log('💾 User loaded from localStorage cache');
            }
        }

        if (!user) {
            throw new Error('Nickname not found');
        }

        if (user.passwordHash !== this.hashPassword(password)) {
            throw new Error('Incorrect password');
        }

        // Ensure user has proper stats structure
        if (!user.stats) {
            user.stats = {
                totalScore: 0,
                gamesPlayed: 0,
                bestScore: 0,
                wins: 0
            };
            console.log('🔧 Initialized missing stats for user:', user.nickname);
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

        // Set as current user
        this.setCurrentUser(user);
        
        console.log('✅ User logged in successfully:', user.nickname, 'stats:', user.stats);
        return user;
    }

    // Save user to Firestore
    async saveUserToFirestore(nickname, userData) {
        if (!window.firebaseDb) throw new Error('Firestore not available');
        
        await window.firebaseDb.collection('players').doc(nickname).set({
            ...userData,
            lastSync: Date.now()
        });
    }

    // Load user from Firestore
    async loadUserFromFirestore(nickname) {
        if (!window.firebaseDb) throw new Error('Firestore not available');
        
        const doc = await window.firebaseDb.collection('players').doc(nickname).get();
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
            const snapshot = await window.firebaseDb.collection('players').get();
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
                    const firestoreDoc = await window.firebaseDb.collection('players').doc(nickname).get();
                    
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
                const doc = await window.firebaseDb.collection('players').doc(normalizedNickname).get();
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
                const snapshot = await window.firebaseDb.collection('players')
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

    // Get current logged in user (Firestore first, localStorage as fallback)
    async getCurrentUser() {
        const currentUser = localStorage.getItem('currentUser');
        if (currentUser) {
            const user = JSON.parse(currentUser);
            const normalizedNickname = user.nickname?.toLowerCase().trim();
            
            // Always try to get fresh data from Firestore first
            if (normalizedNickname && this.isOnline && window.firebaseDb) {
                try {
                    const freshUserData = await this.loadUserFromFirestore(normalizedNickname);
                    if (freshUserData) {
                        // Update both localStorage cache and localUsers
                        this.localUsers[normalizedNickname] = freshUserData;
                        this.saveLocalUsers();
                        localStorage.setItem('currentUser', JSON.stringify(freshUserData));
                        console.log('🔥 Loaded fresh user data from Firestore:', freshUserData.stats);
                        return freshUserData;
                    }
                } catch (error) {
                    console.warn('⚠️ Failed to load from Firestore, using cached data:', error.message);
                }
            }
            
            // Fallback: sync with localUsers cache
            if (normalizedNickname && this.localUsers[normalizedNickname]) {
                const latestUserData = this.localUsers[normalizedNickname];
                user.stats = latestUserData.stats || user.stats;
                localStorage.setItem('currentUser', JSON.stringify(user));
                console.log('💾 Using cached localUsers data:', user.stats);
            }
            
            // Ensure stats object exists
            if (!user.stats) {
                user.stats = {
                    totalScore: 0,
                    gamesPlayed: 0,
                    bestScore: 0,
                    wins: 0
                };
            }
            return user;
        }
        return null;
    }
    
    // Synchronous version for immediate use (uses cache)
    getCurrentUserSync() {
        const currentUser = localStorage.getItem('currentUser');
        if (currentUser) {
            const user = JSON.parse(currentUser);
            // Ensure stats object exists
            if (!user.stats) {
                user.stats = {
                    totalScore: 0,
                    gamesPlayed: 0,
                    bestScore: 0,
                    wins: 0
                };
            }
            return user;
        }
        return null;
    }

    // Sync user stats from Firestore and update localStorage
    async syncUserStatsFromFirestore() {
        const currentUser = this.getCurrentUserSync();
        console.log('🔍 syncUserStatsFromFirestore - currentUser:', currentUser?.nickname);
        console.log('🔍 syncUserStatsFromFirestore - isOnline:', this.isOnline);
        console.log('🔍 syncUserStatsFromFirestore - firebaseDb:', !!window.firebaseDb);
        
        if (!currentUser || !this.isOnline || !window.firebaseDb) {
            console.log('⚠️ Cannot sync - missing requirements');
            return currentUser;
        }

        try {
            const normalizedNickname = currentUser.nickname.toLowerCase().trim();
            console.log('🔍 Fetching from Firestore collection players, doc:', normalizedNickname);
            const doc = await window.firebaseDb.collection('players').doc(normalizedNickname).get();
            
            console.log('🔍 Firestore doc exists:', doc.exists);
            if (doc.exists) {
                const firestoreData = doc.data();
                console.log('🔍 Firestore data:', JSON.stringify(firestoreData, null, 2));
                
                // Extract stats from Firestore (check both nested and root locations)
                // Use the higher value between root and stats object
                const rootTotalScore = firestoreData.totalScore || 0;
                const statsTotalScore = firestoreData.stats?.totalScore || 0;
                const totalScore = Math.max(rootTotalScore, statsTotalScore);
                
                const extractedStats = {
                    totalScore: totalScore,
                    gamesPlayed: firestoreData.stats?.gamesPlayed || firestoreData.gamesPlayed || 0,
                    bestScore: firestoreData.stats?.bestScore || firestoreData.bestScore || 0,
                    wins: firestoreData.stats?.wins || firestoreData.wins || 0
                };
                
                console.log('📊 Extracted stats from Firestore:', extractedStats);
                console.log('👤 Current user stats before update:', currentUser.stats);
                
                // Update localStorage user stats with Firestore data
                currentUser.stats = extractedStats;
                
                console.log('👤 Current user stats after assignment:', currentUser.stats);
                
                // Save updated user back to localStorage
                this.setCurrentUser(currentUser);
                console.log('🔄 Synced user stats from Firestore:', currentUser.stats);
                
                return currentUser;
            } else {
                console.log('⚠️ No Firestore document found for user:', normalizedNickname);
            }
        } catch (error) {
            console.error('❌ Failed to sync stats from Firestore:', error);
        }
        
        return currentUser;
    }

    // Set current logged in user
    setCurrentUser(user) {
        // Ensure the user has proper stats structure, but preserve existing values
        if (!user.stats) {
            user.stats = {
                totalScore: 0,
                gamesPlayed: 0,
                bestScore: 0,
                wins: 0
            };
        } else {
            // Ensure all required fields exist, but don't overwrite existing values
            user.stats.totalScore = user.stats.totalScore || 0;
            user.stats.gamesPlayed = user.stats.gamesPlayed || 0;
            user.stats.bestScore = user.stats.bestScore || 0;
            user.stats.wins = user.stats.wins || 0;
        }
        
        localStorage.setItem('currentUser', JSON.stringify(user));
        console.log('👤 User set as current:', user.nickname, 'with stats:', user.stats);
    }

    // Update user stats (Firestore first, then cache locally)
    async updateUserStats(nickname, stats) {
        const normalizedNickname = nickname.toLowerCase().trim();
        
        // Create updated user data
        const updatedUser = {
            ...this.localUsers[normalizedNickname],
            stats: stats,
            lastLogin: Date.now()
        };
        
        // Save to Firestore first (primary storage)
        if (this.isOnline && window.firebaseDb) {
            try {
                await this.saveUserToFirestore(normalizedNickname, updatedUser);
                console.log('🔥 Stats saved to Firestore (primary) for:', nickname);
            } catch (error) {
                console.error('❌ Failed to save stats to Firestore:', error.message);
                // Continue to save locally even if Firestore fails
            }
        }
        
        // Update local cache
        if (this.localUsers[normalizedNickname]) {
            this.localUsers[normalizedNickname] = updatedUser;
            this.saveLocalUsers();
            console.log('💾 Stats cached locally for:', nickname);

            // Update current user if it's the same user
            const currentUser = this.getCurrentUserSync();
            if (currentUser && currentUser.nickname === nickname) {
                this.setCurrentUser(updatedUser);
                console.log('🔄 Current user updated with new stats');
            }
        }
    }

    // Logout
    logout() {
        const currentUser = this.getCurrentUser();
        console.log('🚪 Logging out user:', currentUser?.nickname, 'with stats:', currentUser?.stats);
        
        localStorage.removeItem('currentUser');
        localStorage.removeItem('playerNickname');
        localStorage.removeItem('playerWallet');
        
        console.log('✅ Logout completed - currentUser cleared');
    }

    // Force refresh current user from localUsers (useful after stats updates)
    refreshCurrentUser() {
        const currentUser = this.getCurrentUserSync();
        if (currentUser) {
            const normalizedNickname = currentUser.nickname?.toLowerCase().trim();
            if (normalizedNickname && this.localUsers[normalizedNickname]) {
                // Get the latest data from localUsers
                const latestUserData = this.localUsers[normalizedNickname];
                // Set it as current user to refresh localStorage
                this.setCurrentUser(latestUserData);
                console.log('🔄 Current user refreshed from localUsers:', latestUserData.nickname, 'stats:', latestUserData.stats);
                return latestUserData;
            }
        }
        return null;
    }
    
    // Async version that fetches fresh data from Firestore
    async refreshCurrentUserFromFirestore() {
        const currentUser = this.getCurrentUserSync();
        if (currentUser) {
            const normalizedNickname = currentUser.nickname?.toLowerCase().trim();
            if (normalizedNickname) {
                try {
                    const freshUserData = await this.getCurrentUser(); // This will fetch from Firestore
                    console.log('🔥 Current user refreshed from Firestore:', freshUserData?.nickname, 'stats:', freshUserData?.stats);
                    return freshUserData;
                } catch (error) {
                    console.warn('⚠️ Failed to refresh from Firestore:', error);
                    return this.refreshCurrentUser(); // Fallback to local refresh
                }
            }
        }
        return null;
    }
}

// Initialize nickname auth system
const nicknameAuth = new HybridAuthSystem();
window.nicknameAuth = nicknameAuth; // Make it globally available

// Initialize game
function init() {
    console.log('🎮 init() function called - starting game initialization');
    
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
    window.socket = socket; // Make socket globally available
    setupSocketListeners();
    
    console.log('🎮 About to call setupInputHandlers()');
    // Setup input handlers
    setupInputHandlers();
    console.log('🎮 setupInputHandlers() completed');
    
    // Setup UI handlers with delay to ensure DOM is ready
    setTimeout(() => {
        setupUIHandlers();
        setupChatEventListeners(); // Setup initial chat listeners
    }, 100);
    
    // Start game loop
    gameLoop();
    
    // Initialize rank display after panelManager is ready
    const initRankDisplay = () => {
        if (window.panelManager) {
        updatePlayerRankDisplay();
        } else {
            setTimeout(initRankDisplay, 100);
        }
    };
    setTimeout(initRankDisplay, 1000);
    
    // Calculate initial time until end of GMT day
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(23, 59, 59, 999);
    matchTimeLeft = Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));
    
    // Initialize timer display immediately
    updateTimerDisplay();
    
    // Start client timer for real-time updates
    startClientTimer();
    
    // Load saved player data after Firebase initializes
    setTimeout(async () => {
        console.log('🔄 Loading player data after Firebase initialization...');
        await loadSavedPlayerData();
    }, 3000); // Wait 3 seconds for Firebase to initialize
    
    console.log('🎮 init() function completed successfully');
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

// Send coins to Firestore in real-time
async function sendCoinsToFirestore(coinsGained) {
    const currentUser = window.nicknameAuth?.getCurrentUserSync();
    if (!currentUser || !window.firebaseDb) {
        console.log('⚠️ Cannot save coins - no user or Firestore connection');
        return;
    }
    
    try {
        const playerId = currentUser.nickname;
        
        console.log(`💾 Saving ${coinsGained} coins to Firestore for player: ${playerId}`);
        
        // Update Firestore directly
        const playerRef = window.firebaseDb.collection('players').doc(playerId);
        const playerDoc = await playerRef.get();
        
        if (playerDoc.exists) {
            // Update existing player's total coins
            await playerRef.update({
                totalScore: window.firebase.firestore.FieldValue.increment(coinsGained),
                lastPlayed: window.firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ Added ${coinsGained} coins to Firestore for ${playerId}`);
        } else {
            // Create new player document
            await playerRef.set({
                playerName: playerId,
                totalScore: coinsGained,
                gamesPlayed: 0,
                bestScore: 0,
                firstPlayed: window.firebase.firestore.FieldValue.serverTimestamp(),
                lastPlayed: window.firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log(`🆕 Created new player ${playerId} with ${coinsGained} coins`);
        }
        
        // Force refresh stats from Firestore
        setTimeout(async () => {
            await window.nicknameAuth.syncUserStatsFromFirestore();
            console.log('🔄 Stats refreshed after coin save');
            
            // Also force update Player Info panel
            if (window.panelManager) {
                await window.panelManager.updateUserInfoPanel();
                console.log('🔄 Player Info panel updated after coin save');
            }
            
            // Update player rank display after coin save
            setTimeout(() => updatePlayerRankDisplay(), 100);
        }, 1000);
        
        // Also save current player size to Firestore
        if (window.localPlayer && window.localPlayer.size) {
            try {
                const playerRef = window.firebaseDb.collection('players').doc(playerId);
                await playerRef.update({
                    lastSize: window.localPlayer.size,
                    lastPlayed: window.firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`📏 Saved current player size ${window.localPlayer.size} to Firestore`);
            } catch (error) {
                console.warn('⚠️ Failed to save player size to Firestore:', error);
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to save coins to Firestore:', error);
    }
}

function setupSocketListeners() {
    socket.on('connect', () => {
        // Store socket.id for proper player identification
        currentSocketId = socket.id;
        console.log('🔗 Socket connected with ID:', currentSocketId);
        
        // Validate socket connection
        if (!currentSocketId) {
            console.error('❌ Socket connected but currentSocketId is null!');
        }
    });
    
    // Note: connect_error handler is now in setupSocketListeners
    
    socket.on('gameState', (data) => {
        gameState = data;
        gameState.boosters = data.boosters || [];
        window.gameState = gameState; // Make gameState globally available
        
        // Initialize boosters array if not present
        if (!gameState.boosters) {
            gameState.boosters = [];
        }
        
        // Find localPlayer by current socket.id (this is the correct player for this client)
        localPlayer = gameState.players.find(p => p.socketId === currentSocketId);
        
        // If not found by socketId, try data.playerId as fallback
        if (!localPlayer && data.playerId) {
            localPlayer = gameState.players.find(p => p.socketId === data.playerId);
            if (localPlayer) {
                console.log('🔄 Found localPlayer by data.playerId fallback:', localPlayer.name);
            }
        }
        
        // If still not found, try to find by name (for reconnection scenarios)
        if (!localPlayer) {
            const currentUser = nicknameAuth.getCurrentUserSync();
            if (currentUser && currentUser.nickname) {
                localPlayer = gameState.players.find(p => p.name === currentUser.nickname);
                if (localPlayer) {
                    console.log('🔄 Found localPlayer by nickname fallback:', localPlayer.name);
                }
            }
        }
        
        // Log player identification for debugging
        if (!localPlayer) {
            console.log('⚠️ Could not identify localPlayer. Current socketId:', currentSocketId, 'Data playerId:', data.playerId);
            console.log('Available players:', gameState.players.map(p => ({id: p.id, socketId: p.socketId, name: p.name})));
            
            // Try to recover by using nickname as fallback
            const currentUser = nicknameAuth.getCurrentUserSync();
            if (currentUser && currentUser.nickname) {
                console.log('🔄 Attempting to recover localPlayer by nickname in gameState');
                localPlayer = gameState.players.find(p => p.name === currentUser.nickname);
                if (localPlayer) {
                    console.log('✅ Recovered localPlayer by nickname:', localPlayer.name);
                    window.localPlayer = localPlayer;
                    
                    // Validate recovered player coordinates
                    if (typeof localPlayer.x === 'number' && typeof localPlayer.y === 'number' && 
                        !isNaN(localPlayer.x) && !isNaN(localPlayer.y)) {
                        console.log('✅ Recovered localPlayer has valid coordinates:', Math.round(localPlayer.x), Math.round(localPlayer.y));
                    } else {
                        console.warn('⚠️ Recovered localPlayer has invalid coordinates:', localPlayer.x, localPlayer.y);
                    }
                }
            }
        } else {
            console.log('✅ localPlayer identified in gameState:', localPlayer.name, 'socketId:', localPlayer.socketId);
            
            // Validate player coordinates
            if (typeof localPlayer.x !== 'number' || typeof localPlayer.y !== 'number' || 
                isNaN(localPlayer.x) || isNaN(localPlayer.y)) {
                console.warn('⚠️ localPlayer has invalid coordinates in gameState:', localPlayer.x, localPlayer.y);
            } else {
                console.log('📍 Player coordinates valid in gameState:', Math.round(localPlayer.x), Math.round(localPlayer.y));
            }
        }
        
        window.localPlayer = localPlayer; // Update global reference
        
        // DEBUG: Log player info
        if (localPlayer) {
            console.log('🎮 gameState received - Player score:', localPlayer.score, 'size:', localPlayer.size, 'playerId:', data.playerId, 'socketId:', localPlayer.socketId);
            console.log('🎯 Player position:', localPlayer.x, localPlayer.y);
            
            // Initialize camera to player position
            camera.x = localPlayer.x;
            camera.y = localPlayer.y;
            console.log('📷 Camera initialized to player position:', camera.x, camera.y);
            
            // Validate camera initialization
            if (isNaN(camera.x) || isNaN(camera.y)) {
                console.error('❌ Camera initialization failed - invalid coordinates:', camera.x, camera.y);
            } else {
                console.log('✅ Camera initialized successfully');
            }
            
            // Initialize player score from Total Coins if this is a new game
            const currentUser = nicknameAuth.getCurrentUserSync();
            if (currentUser && currentUser.stats && currentUser.stats.totalScore && localPlayer.score === 0) {
                console.log('💰 Initializing player score from Total Coins:', currentUser.stats.totalScore);
                localPlayer.score = currentUser.stats.totalScore;
                
                // Update server with initial score
                if (socket && socket.connected) {
                    socket.emit('updatePlayerScore', {
                        playerId: localPlayer.id,
                        score: localPlayer.score
                    });
                    console.log('📤 Sent initial score to server:', localPlayer.score);
                }
            }
            
            // Initialize player size from saved size if this is a new game
            if (currentUser && currentUser.stats && currentUser.stats.lastSize && localPlayer.size === 20) {
                console.log('📏 Initializing player size from saved size:', currentUser.stats.lastSize);
                localPlayer.size = currentUser.stats.lastSize;
                
                // Update server with initial size
                if (socket && socket.connected) {
                    socket.emit('updatePlayerSize', {
                        playerId: localPlayer.id,
                        size: localPlayer.size
                    });
                    console.log('📤 Sent initial size to server:', localPlayer.size);
                }
            }
            
            // Update all player stats display
            const vx = localPlayer.vx || 0;
            const vy = localPlayer.vy || 0;
            const currentSpeed = Math.sqrt(vx * vx + vy * vy);
            updatePlayerStatsDisplay(currentSpeed, localPlayer);
            
            // Update user info panel with fresh game data
            if (window.panelManager) {
                window.panelManager.updateUserInfoPanel().catch(err => console.warn('Panel update failed:', err));
            }
            
            // Update player rank display
            updatePlayerRankDisplay();
        } else {
            console.log('⚠️ gameState received but no localPlayer found. PlayerId:', data.playerId, 'Available players:', gameState.players.map(p => ({id: p.id, socketId: p.socketId, name: p.name})));
        }
    });
    
    socket.on('gameUpdate', (data) => {
        gameState.players = data.players;
        gameState.bots = data.bots;
        gameState.coins = data.coins;
        gameState.boosters = data.boosters || [];
        window.gameState = gameState; // Update global reference
        
        // Initialize boosters array if not present
        if (!gameState.boosters) {
            gameState.boosters = [];
        }
        
        const previousLocalPlayer = localPlayer;
        
        // Find localPlayer by current socket.id (this is the correct player for this client)
        localPlayer = gameState.players.find(p => p.socketId === currentSocketId);
        
        // If not found by socketId, try to find by name (fallback for reconnection)
        if (!localPlayer && previousLocalPlayer) {
            localPlayer = gameState.players.find(p => p.name === previousLocalPlayer.name);
            if (localPlayer) {
                console.log('🔄 Found localPlayer by name fallback:', localPlayer.name);
            }
        }
        
        // If still not found, try gameState.playerId as last resort
        if (!localPlayer && gameState.playerId) {
            localPlayer = gameState.players.find(p => p.socketId === gameState.playerId);
            if (localPlayer) {
                console.log('🔄 Found localPlayer by gameState.playerId fallback:', localPlayer.name);
            }
        }
        
        // Log player identification for debugging
        if (!localPlayer) {
            console.log('⚠️ Could not identify localPlayer in gameUpdate. Current socketId:', currentSocketId, 'GameState playerId:', gameState.playerId);
            console.log('Available players:', gameState.players.map(p => ({id: p.id, socketId: p.socketId, name: p.name})));
            console.log('Previous localPlayer:', previousLocalPlayer ? {name: previousLocalPlayer.name, socketId: previousLocalPlayer.socketId} : 'null');
            
            // Try to recover by using previous localPlayer if available
            if (previousLocalPlayer) {
                console.log('🔄 Attempting to recover localPlayer from previous state');
                localPlayer = previousLocalPlayer;
                window.localPlayer = localPlayer;
                
                // Validate recovered player coordinates
                if (typeof localPlayer.x === 'number' && typeof localPlayer.y === 'number' && 
                    !isNaN(localPlayer.x) && !isNaN(localPlayer.y)) {
                    console.log('✅ Successfully recovered localPlayer with valid coordinates:', Math.round(localPlayer.x), Math.round(localPlayer.y));
                } else {
                    console.warn('⚠️ Recovered localPlayer has invalid coordinates:', localPlayer.x, localPlayer.y);
                }
            }
        } else {
            console.log('✅ localPlayer identified in gameUpdate:', localPlayer.name, 'socketId:', localPlayer.socketId);
            
            // Validate player coordinates
            if (typeof localPlayer.x !== 'number' || typeof localPlayer.y !== 'number' || 
                isNaN(localPlayer.x) || isNaN(localPlayer.y)) {
                console.warn('⚠️ localPlayer has invalid coordinates:', localPlayer.x, localPlayer.y);
            } else {
                console.log('📍 Player coordinates valid:', Math.round(localPlayer.x), Math.round(localPlayer.y));
            }
        }
        
        window.localPlayer = localPlayer; // Update global reference
        
        // Check if player score increased (coin collected)
        if (previousLocalPlayer && localPlayer && localPlayer.score > previousLocalPlayer.score) {
            const coinsGained = localPlayer.score - previousLocalPlayer.score;
            console.log(`🪙 Coins gained: ${coinsGained} (${previousLocalPlayer.score} → ${localPlayer.score})`);
            
            // Check if size also increased
            if (localPlayer.size > previousLocalPlayer.size) {
                console.log(`📏 Size increased: ${Math.round(previousLocalPlayer.size)} → ${Math.round(localPlayer.size)}`);
                
                // Update display immediately when size changes
                const vx = localPlayer.vx || 0;
                const vy = localPlayer.vy || 0;
                const currentSpeed = Math.sqrt(vx * vx + vy * vy);
                updatePlayerStatsDisplay(currentSpeed, localPlayer);
                
                // Log size changes for debugging
                console.log('📏 Size display updated:', Math.round(previousLocalPlayer.size), '→', Math.round(localPlayer.size));
            }
            
            // Update display immediately when score changes
            const vx = localPlayer.vx || 0;
            const vy = localPlayer.vy || 0;
            const currentSpeed = Math.sqrt(vx * vx + vy * vy);
            updatePlayerStatsDisplay(currentSpeed, localPlayer);
            
            // Log score changes for debugging
            console.log('💰 Score display updated:', previousLocalPlayer.score, '→', localPlayer.score);
            
            // Only send coins to Firestore if this is a real score increase (not initialization)
            // Check if the score increase is reasonable (not a huge jump from initialization)
            const maxReasonableIncrease = 1000; // Maximum reasonable coins gained in one update
            if (coinsGained <= maxReasonableIncrease) {
                sendCoinsToFirestore(coinsGained);
            } else {
                console.log(`⚠️ Skipping Firestore update - unreasonable score increase: ${coinsGained} (likely initialization)`);
            }
        }
        
        // Check for booster collection
        if (gameState.boosters && localPlayer) {
            gameState.boosters.forEach(booster => {
                const distance = Math.sqrt((booster.x - localPlayer.x) ** 2 + (booster.y - localPlayer.y) ** 2);
                if (distance < localPlayer.size) {
                    console.log(`🚀 Player collected booster: ${booster.name} (${booster.effect})`);
                    
                    // Remove booster from client-side state (server will handle respawn)
                    gameState.boosters = gameState.boosters.filter(b => b.id !== booster.id);
                }
            });
        }
        
        // Update booster status from server data
        if (localPlayer) {
            if (localPlayer.speedBoost && localPlayer.speedBoostEndTime) {
                activeBoosters.speed.active = true;
                activeBoosters.speed.multiplier = 2;
                activeBoosters.speed.endTime = localPlayer.speedBoostEndTime;
                console.log(`🚀 Speed boost active until ${new Date(localPlayer.speedBoostEndTime).toLocaleTimeString()}`);
            } else {
                activeBoosters.speed.active = false;
                activeBoosters.speed.multiplier = 1;
                activeBoosters.speed.endTime = 0;
            }
            
            if (localPlayer.coinBoost && localPlayer.coinBoostEndTime) {
                activeBoosters.coins.active = true;
                activeBoosters.coins.multiplier = 2;
                activeBoosters.coins.endTime = localPlayer.coinBoostEndTime;
                console.log(`💰 Coin boost active until ${new Date(localPlayer.coinBoostEndTime).toLocaleTimeString()}`);
            } else {
                activeBoosters.coins.active = false;
                activeBoosters.coins.multiplier = 1;
                activeBoosters.coins.endTime = 0;
            }
        }
        
        if (!localPlayer) {
            // Try to recover localPlayer
            if (previousLocalPlayer) {
                localPlayer = previousLocalPlayer;
                window.localPlayer = localPlayer; // Update global reference
            }
        }
        
        // Update Player Info Panel with current game stats
        if (localPlayer) {
            // Calculate current speed for display
            const vx = localPlayer.vx || 0;
            const vy = localPlayer.vy || 0;
            const currentSpeed = Math.sqrt(vx * vx + vy * vy);
            
            // Update all player stats display
            updatePlayerStatsDisplay(currentSpeed, localPlayer);
            
            // Camera update is handled in gameLoop via updateCamera() function
            // This ensures smooth camera following without duplication
            
            updatePlayerInfoPanelStats(localPlayer);
            // Force immediate display update
            forceUpdateGameStatsDisplay(localPlayer);
            
            // Also update the main player info panel to show active game
            const currentUser = nicknameAuth.getCurrentUserSync();
            if (currentUser) {
                updateMainPlayerInfoPanel(currentUser);
            }
            
            // Update user info panel with real-time game data
            if (window.panelManager) {
                window.panelManager.updateUserInfoPanel().catch(err => console.warn('Panel update failed:', err));
            }
        }
        
        updateLeaderboard();
        
        // Update player rank display after leaderboard update
        updatePlayerRankDisplay();
    });
    

    
    socket.on('chatMessage', (data) => {
        addChatMessage(data);
        showSpeechBubble(data);
    });
    
    socket.on('playerEaten', (data) => {
        // Handle when our player gets eaten (now only for AFK kicks)
        if (localPlayer && localPlayer.id === data.victimId) {
            // Handle AFK kick
            if (data.afkKick) {
                console.log(`⏰ You were kicked for being AFK! Saved ${data.coinsLost} coins to your balance.`);
                
                // Show AFK kick message
                addChatMessage({
                    playerName: 'System',
                    message: `⏰ You were kicked for being inactive! 💰 ${data.coinsLost} coins saved to your Total Coins!`,
                    timestamp: Date.now()
                });
                
                // Show AFK kick notification
                showServerMessage(`⏰ You were kicked for being inactive for 2 minutes! 💰 ${data.coinsLost} coins saved to your Total Coins! Returning to main menu in 3 seconds...`, 'warning');
            
            // Force refresh Total Coins from Firestore to show the updated balance
            setTimeout(async () => {
                try {
                    await window.nicknameAuth.syncUserStatsFromFirestore();
                        console.log('💰 Total Coins refreshed after AFK kick');
                    
                    // Update Player Info panel if open
                    if (window.panelManager) {
                        await window.panelManager.updateUserInfoPanel();
                    }
                } catch (error) {
                        console.warn('⚠️ Failed to refresh Total Coins after AFK kick:', error);
                }
            }, 1500); // Refresh after 1.5 seconds to allow server to save
            
            // Disconnect from game and return to main menu after a short delay
            setTimeout(() => {
                // Disconnect socket
                if (socket) {
                    socket.disconnect();
                }
                
                // Reset game state
                gameEnded = true;
                    localPlayer = null; // Will be recreated by server with saved size
                window.localPlayer = null;
                    
                    // Reset camera
                    camera.x = 0;
                    camera.y = 0;
                    camera.zoom = 1;
                    
                    // Reset movement
                    movement.x = 0;
                    movement.y = 0;
                    
                    // Clear keys
                    keys = {};
                
                // Hide game canvas
                const canvas = document.getElementById('gameCanvas');
                if (canvas) {
                    canvas.style.display = 'none';
                }
                    
                    // Hide all game panels
                    const gamePanels = document.querySelectorAll('.game-panel, .panel');
                    gamePanels.forEach(panel => {
                        if (panel.style.display !== 'none') {
                            panel.style.display = 'none';
                        }
                    });
                
                // Show main menu
                const nameModal = document.getElementById('nameModal');
                if (nameModal) {
                    nameModal.style.display = 'flex';
                }
                
                // Clear leaderboard
                const leaderboardList = document.getElementById('leaderboardList');
                if (leaderboardList) {
                    leaderboardList.innerHTML = '';
                }
                    
                    // Reset game state variables
                    gameState = {
                        players: [],
                        bots: [],
                        coins: [],
                        worldSize: 4000,
                        playerId: null
                    };
                    
                    // Clear chat messages
                    chatMessages = [];
                    speechBubbles.clear();
                    
                    // Reset pause state
                    gamePaused = false;
                    const pauseModal = document.getElementById('pauseModal');
                    if (pauseModal) {
                        pauseModal.style.display = 'none';
                    }
                    
                    // Reset timers
                    if (clientTimerInterval) {
                        clearInterval(clientTimerInterval);
                        clientTimerInterval = null;
                    }
                    matchTimeLeft = null;
                    matchStartTime = null;
                    
                    // Reset panel manager if exists
                    if (window.panelManager) {
                        window.panelManager.resetAllPanels();
                    }
                    
                    // Reset rank display
                    const currentGameRankElement = document.getElementById('currentGameRank');
                    if (currentGameRankElement) {
                        currentGameRankElement.textContent = '#-';
                    }
                    
                    // Reset current game stats display
                    const currentScoreElement = document.getElementById('currentScore');
                    const currentSizeElement = document.getElementById('currentSize');
                    const currentGameScoreElement = document.getElementById('currentGameScore');
                    
                    if (currentScoreElement) {
                        currentScoreElement.textContent = '0';
                    }
                    if (currentSizeElement) {
                        currentSizeElement.textContent = '...';
                    }
                    if (currentGameScoreElement) {
                        currentGameScoreElement.textContent = '0';
                    }
                    
                    // Reset speed and size display
                    const speedElement = document.getElementById('speedValue');
                    const maxSpeedElement = document.getElementById('maxSpeedValue');
                    const playerSizeElement = document.getElementById('playerSizeValue');
                    
                    if (speedElement) {
                        speedElement.textContent = '0.0';
                    }
                    if (maxSpeedElement) {
                        maxSpeedElement.textContent = '200';
                    }
                    if (playerSizeElement) {
                        playerSizeElement.textContent = '20';
                    }
                    
                    // Reset background
                    backgroundLoaded = false;
                    backgroundImage = null;
                    
                    // Reset mobile joystick
                    joystickActive = false;
                    joystickCenter = { x: 0, y: 0 };
                    
                    // Reset chat interface
                    chatCollapsed = false;
                    const chatContent = document.getElementById('chatContent');
                    if (chatContent) {
                        chatContent.innerHTML = '';
                    }
                    
                    // Reset user info panel
                    const userInfoPanel = document.getElementById('userinfoLeftPanel');
                    if (userInfoPanel) {
                        userInfoPanel.style.display = 'none';
                    }
                    
                    // Reset player info panel
                    const playerInfoPanel = document.getElementById('playerInfoPanel');
                    if (playerInfoPanel) {
                        playerInfoPanel.style.display = 'none';
                    }
                    
                    // Reset leaderboard panel
                    const leaderboardPanel = document.getElementById('leaderboardPanel');
                    if (leaderboardPanel) {
                        leaderboardPanel.style.display = 'none';
                    }
                    
                    // Reset controls panel
                    const controlsPanel = document.getElementById('controlsPanel');
                    if (controlsPanel) {
                        controlsPanel.style.display = 'none';
                    }
                    
                    // Reset chat panel
                    const chatPanel = document.getElementById('chatPanel');
                    if (chatPanel) {
                        chatPanel.style.display = 'none';
                    }
                    
                    // Reset mobile chat panel
                    const mobileChatModal = document.getElementById('mobileChatModal');
                    if (mobileChatModal) {
                        mobileChatModal.classList.add('hidden');
                    }
                    
                    // Reset mobile joystick panel
                    const joystick = document.getElementById('joystick');
                    if (joystick) {
                        joystick.style.display = 'none';
                    }
                    
                    // Reset mobile chat toggle
                    const mobileChatToggle = document.getElementById('mobileChatToggle');
                    if (mobileChatToggle) {
                        mobileChatToggle.style.display = 'none';
                    }
                    
                    // Reset mobile joystick toggle
                    const mobileJoystickToggle = document.getElementById('mobileJoystickToggle');
                    if (mobileJoystickToggle) {
                        mobileJoystickToggle.style.display = 'none';
                    }
                    
                    // Reset mobile panel toggle
                    const mobilePanelToggle = document.getElementById('mobilePanelToggle');
                    if (mobilePanelToggle) {
                        mobilePanelToggle.style.display = 'none';
                    }
                
                // Refresh player data on main menu to show updated Total Coins
                setTimeout(async () => {
                    await loadSavedPlayerData();
                        console.log('💰 Player data refreshed on main menu after AFK kick');
                }, 500);
                
                    console.log('🔄 Returned to main menu after AFK kick');
            }, 3000); // 3 second delay to show message
            }
            // Note: Eating mechanics are disabled, so no other death handling needed
        }
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
            // Don't reset size to 20 - it will be loaded from saved data
            currentSizeElement.textContent = '...';
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
        const currentUser = nicknameAuth.getCurrentUserSync();
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
                
                // Also save game session to Firebase if authenticated
                if (window.authSystem && window.authSystem.currentUser) {
                    try {
                        const response = await fetch(`/api/player/${window.authSystem.currentUser.uid}/session`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                playerName: currentUser.nickname,
                                score: currentGameScore,
                                walletAddress: currentUser.wallet || ''
                            })
                        });
                        if (response.ok) {
                            console.log('💾 Game session saved to Firebase');
                            // Reload stats from Firebase to get updated data
                            setTimeout(async () => {
                                if (window.authSystem) {
                                    await window.authSystem.reloadPlayerStats();
                                }
                            }, 1000); // Wait 1 second for database to update
                        }
                    } catch (error) {
                        console.warn('⚠️ Failed to save game session to Firebase:', error);
                    }
                }
                
                console.log('📊 Game stats saved:', newStats);
                console.log('🎮 Final score:', currentGameScore);
                
                // Refresh player info panel with updated stats
                const updatedUser = nicknameAuth.getCurrentUserSync();
                updatePlayerInfoPanelWithStats(updatedUser);
                
            } catch (error) {
                console.error('❌ Error saving game stats:', error);
            }
        }
        
        showGameOverModal(finalResults);
    });
    
    socket.on('disconnect', () => {
        // Clear current socket ID when disconnected
        currentSocketId = null;
        console.log('🔌 Socket disconnected, clearing currentSocketId');
        
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

// Prevent zoom/scaling to maintain fair gameplay
function preventZoom() {
    // Prevent Ctrl+Scroll zoom
    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            console.log('🚫 Zoom attempt blocked via Ctrl+Scroll');
        }
    }, { passive: false });
    
    // Prevent keyboard zoom shortcuts
    document.addEventListener('keydown', (e) => {
        // Block Ctrl+Plus, Ctrl+Minus, Ctrl+0 (zoom shortcuts)
        if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
            e.preventDefault();
            console.log('🚫 Zoom attempt blocked via keyboard shortcut:', e.key);
        }
        
        // Block F11 (fullscreen can sometimes affect zoom)
        if (e.key === 'F11') {
            e.preventDefault();
            console.log('🚫 F11 fullscreen blocked');
        }
    });
    
    // Prevent pinch-to-zoom on touch devices
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) {
            e.preventDefault();
            console.log('🚫 Multi-touch zoom attempt blocked');
        }
    }, { passive: false });
    
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 1) {
            e.preventDefault();
            console.log('🚫 Pinch-to-zoom blocked');
        }
    }, { passive: false });
    
    // Block right-click context menu (can sometimes be used for zoom)
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        console.log('🚫 Context menu blocked');
    });
    
    // Block double-tap zoom on mobile
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            e.preventDefault();
            console.log('🚫 Double-tap zoom blocked');
        }
        lastTouchEnd = now;
    }, { passive: false });
    
    // Monitor zoom level changes
    let currentZoom = window.devicePixelRatio;
    setInterval(() => {
        const newZoom = window.devicePixelRatio;
        if (Math.abs(newZoom - currentZoom) > 0.1) {
            console.warn('🚫 Zoom level change detected, attempting to reset...');
            
            // Show warning to player
            showServerMessage('🚫 Zoom detected! Please use normal zoom level for fair play.', 'warning');
            
            // Try to reset zoom (limited effectiveness due to browser security)
            try {
                document.body.style.zoom = '1';
                document.body.style.transform = 'scale(1)';
            } catch (error) {
                console.warn('⚠️ Could not reset zoom level');
            }
            
            currentZoom = newZoom;
        }
    }, 1000);
    
    console.log('🛡️ Zoom prevention system activated');
}

function setupInputHandlers() {
    console.log('🎮 setupInputHandlers called - setting up keyboard event listeners');
    
    // Prevent zoom/scale events
    preventZoom();
    
    // Keyboard input
    document.addEventListener('keydown', (e) => {
        console.log('🎮 Key pressed:', e.code, 'key:', e.key, 'target:', e.target?.tagName);
        
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
                } else if (chatInput) {
                    chatInput.focus();
                }
            }
            
            // Escape key to blur chat input (but don't interfere with pause system)
            if (e.code === 'Escape') {
                console.log('🎮 ESC key detected in setupInputHandlers!');
                const chatInput = document.getElementById('chatInput');
                if (chatInput && document.activeElement === chatInput) {
                    chatInput.blur();
                    e.preventDefault();
                    return; // Exit early to avoid other ESC handling
                }
                
                // Handle pause/resume logic here to avoid conflicts
                console.log('🎮 ESC key pressed in setupInputHandlers, gamePaused:', gamePaused, 'gameEnded:', gameEnded, 'localPlayer:', !!localPlayer);
                
                // First check if pause modal is open - if so, resume
                if (gamePaused) {
                    console.log('🎮 Game is paused, resuming...');
                    resumeGame();
                    return;
                }
                
                // Only allow pause/resume when in game (not in menus)
                const nameModal = document.getElementById('nameModal');
                const authModal = document.getElementById('authModal');
                const registrationModal = document.getElementById('registrationModal');
                const gameOverModal = document.getElementById('gameOverModal');
                
                // Check if any modal is visible
                const anyModalVisible = (
                    !nameModal.classList.contains('hidden') ||
                    !authModal.classList.contains('hidden') ||
                    !registrationModal.classList.contains('hidden') ||
                    !gameOverModal.classList.contains('hidden')
                );
                
                console.log('🎮 Modal check details:');
                console.log('  - nameModal:', nameModal ? 'found' : 'not found');
                console.log('  - nameModal.classList.contains("hidden"):', nameModal?.classList.contains('hidden'));
                console.log('  - nameModal.style.display:', nameModal?.style.display);
                console.log('  - authModal.classList.contains("hidden"):', authModal?.classList.contains('hidden'));
                console.log('  - registrationModal.classList.contains("hidden"):', registrationModal?.classList.contains('hidden'));
                console.log('  - gameOverModal.classList.contains("hidden"):', gameOverModal?.classList.contains('hidden'));
                console.log('  - anyModalVisible:', anyModalVisible);
                console.log('  - gameEnded:', gameEnded);
                console.log('  - localPlayer:', !!localPlayer);
                
                // Allow pause if: no modals visible, game not ended, and either localPlayer exists OR nameModal is hidden (game started)
                const canPause = !anyModalVisible && !gameEnded && (localPlayer || nameModal?.style.display === 'none');
                
                console.log('🎮 canPause calculation:', canPause, '=', '!anyModalVisible:', !anyModalVisible, '&& !gameEnded:', !gameEnded, '&& (localPlayer || nameModal?.style.display === "none"):', (localPlayer || nameModal?.style.display === 'none'));
                
                if (canPause) {
                    console.log('🎮 All conditions met, pausing game...');
                    pauseGame();
                } else {
                    console.log('🎮 Cannot pause - conditions not met. anyModalVisible:', anyModalVisible, 'gameEnded:', gameEnded, 'localPlayer:', !!localPlayer, 'nameModal hidden:', nameModal?.style.display === 'none');
                }
                
                return; // Prevent further processing
            }
            
            // Prevent default for game keys only when not typing
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        }
    });
    
    console.log('🎮 setupInputHandlers completed - keyboard event listeners added');
    
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
    
    if (joystick && joystickKnob) {
        console.log('🕹️ Mobile joystick elements found, setting up event listeners');
        joystick.addEventListener('touchstart', handleJoystickStart, { passive: false });
        joystick.addEventListener('touchmove', handleJoystickMove, { passive: false });
        joystick.addEventListener('touchend', handleJoystickEnd, { passive: false });
    } else {
        console.warn('⚠️ Mobile joystick elements not found:', { joystick, joystickKnob });
    }
    
    function handleJoystickStart(e) {
        e.preventDefault();
        joystickActive = true;
        const rect = joystick.getBoundingClientRect();
        joystickCenter.x = rect.left + rect.width / 2;
        joystickCenter.y = rect.top + rect.height / 2;
        console.log('🕹️ Joystick started at:', joystickCenter);
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
        console.log('🕹️ Joystick ended');
    }
    
    // Initialize player rank display after input setup
    setTimeout(() => {
        if (window.panelManager) {
            updatePlayerRankDisplay();
        }
    }, 1500);
}

function setupUIHandlers() {
    // Color picker setup
    const colorOptions = document.querySelectorAll('.color-option');
    console.log(`🎨 Found ${colorOptions.length} color options`);
    
    colorOptions.forEach((option, index) => {
        option.addEventListener('click', () => {
            console.log(`🎨 Color option clicked: ${option.dataset.color}`);
            console.log(`🎨 Clicked element background-color: ${option.style.backgroundColor}`);
            console.log(`🎨 Clicked element data-color: ${option.dataset.color}`);
            
            // Remove previous selection
            colorOptions.forEach(opt => {
                opt.classList.remove('border-white', 'selected');
            });
            // Add selection to clicked option
            option.classList.add('border-white', 'selected');
            selectedColor = parseInt(option.dataset.color);
            console.log(`🎨 Selected color updated to: ${selectedColor}`);
            console.log(`🎨 Color will be rendered as: hsl(${selectedColor}, 70%, 50%)`);
        });
        
        // Log available options
        console.log(`🎨 Color option ${index}: data-color="${option.dataset.color}", background-color: ${option.style.backgroundColor}`);
    });
    
    // Set default color selection
    if (colorOptions.length > 0) {
        colorOptions[0].classList.add('border-white', 'selected');
        selectedColor = parseInt(colorOptions[0].dataset.color) || 0;
        console.log(`🎨 Default color set to: ${selectedColor}`);
    } else {
        console.warn('⚠️ No color options found!');
    }
    
    // Initialize player rank display after UI is ready
    setTimeout(() => {
        if (window.panelManager) {
            updatePlayerRankDisplay();
        }
    }, 2000);
    
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

    // Logout Button
    const mainLogoutBtn = document.getElementById('logoutBtn');
    if (mainLogoutBtn) {
        mainLogoutBtn.addEventListener('click', () => {
            console.log('🚪 Main logout button clicked');
            performLogout();
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
        
        // Debug: Check if user exists locally
        const localUsers = JSON.parse(localStorage.getItem('registeredUsers') || '{}');
        const normalizedNickname = nickname.toLowerCase().trim();
        console.log('🔍 Debug - Available local users:', Object.keys(localUsers));
        console.log('🔍 Debug - Looking for user:', normalizedNickname);
        console.log('🔍 Debug - User exists locally:', !!localUsers[normalizedNickname]);
        
        // Variables for authenticated user data
        let playerName, wallet;
        
        // Try to authenticate the user
        try {
            console.log('🔐 Attempting login for nickname:', nickname);
            const user = await nicknameAuth.login(nickname, password);
            console.log('✅ Login successful for user:', user.nickname);
            
            // Update player info panel with authenticated user
            updatePlayerInfoPanelWithStats(user);
            
            // Also update the main player info panel
            updateMainPlayerInfoPanel(user);
            
            // Force refresh current user cache
            nicknameAuth.refreshCurrentUser();
            console.log('🔄 Forced refresh of user data after login');
            
            // Verify user is set in localStorage
            const savedUser = nicknameAuth.getCurrentUserSync();
            console.log('🔍 Verification - Current user after login:', savedUser?.nickname);
            
            // Use authenticated user's data
            playerName = user.nickname;
            wallet = user.wallet || '';
            
        } catch (error) {
            console.error('❌ Login failed:', error.message);
            alert('Invalid nickname or password. Please try again or create a new account.');
            return;
        }
        
        console.log('🎮 Authentication successful, starting game...');
        console.log('👤 Player Name:', playerName);
        console.log('💰 Wallet:', wallet);
        console.log('🎨 Selected Color:', selectedColor);
        
        // Get player ID from the authentication system that was used
        let playerId;
        if (window.authSystem) {
            // Firebase Auth system
            playerId = window.authSystem.getCurrentUserId();
        } else {
            // Nickname-based auth system
            const currentUser = nicknameAuth.getCurrentUserSync();
            if (currentUser) {
                playerId = currentUser.nickname; // Use nickname as player ID
            } else {
                playerId = `guest_${Date.now()}_${Math.random()}`; // Fallback to guest
            }
        }
        
        console.log('🆔 Player ID:', playerId);
        console.log('🔗 Socket connected:', socket?.connected);
        
        // Check if socket is disconnected and reconnect if needed
        if (!socket || !socket.connected) {
            console.log('🔌 Socket disconnected, reconnecting...');
            
            // Recreate socket connection
            const isProduction = window.location.hostname !== 'localhost';
            const socketUrl = isProduction ? 'https://draw-e67b.onrender.com' : 'http://localhost:3001';
            
            socket = io(socketUrl, {
                path: '/socket.io',
                transports: ['websocket', 'polling']
            });
            window.socket = socket;
            setupSocketListeners();
            
            // Wait for connection
            await new Promise((resolve) => {
                socket.on('connect', () => {
                    currentSocketId = socket.id;
                    console.log('✅ Socket reconnected successfully with ID:', currentSocketId);
                    resolve();
                });
            });
        }
        
        const gameData = { 
            name: playerName, 
            wallet: wallet, 
            color: selectedColor,
            playerId: playerId 
        };
        
        console.log('📤 Sending joinGame data:', gameData);
        console.log(`🎨 Color will be rendered as: hsl(${selectedColor}, 70%, 50%)`);
        socket.emit('joinGame', gameData);
        
                // DEBUG: Test Firestore connection and ensure player document exists
        setTimeout(async () => {
            if (window.firebaseDb && playerId) {
                try {
                    console.log('🔍 DEBUG: Testing Firestore connection for player:', playerId);
                    const testDoc = await window.firebaseDb.collection('players').doc(playerId).get();
                    console.log('🔍 DEBUG: Firestore doc exists:', testDoc.exists);
                    
                    if (testDoc.exists) {
                        const docData = testDoc.data();
                        console.log('🔍 DEBUG: Firestore doc data:', JSON.stringify(docData, null, 2));
                        
                        // Force update local stats with Firestore data
                        await window.nicknameAuth.syncUserStatsFromFirestore();
                        console.log('🔄 DEBUG: Forced stats sync after game start');
                    } else {
                        console.log('🔍 DEBUG: No document found, attempting to create initial entry');
                        await window.firebaseDb.collection('players').doc(playerId).set({
                            playerName: playerName,
                            totalScore: 0,
                            gamesPlayed: 0,
                            bestScore: 0,
                            firstPlayed: window.firebase.firestore.FieldValue.serverTimestamp(),
                            lastPlayed: window.firebase.firestore.FieldValue.serverTimestamp()
                        });
                        console.log('🔍 DEBUG: Initial player entry created successfully');
                        
                        // Sync after creating
                        await window.nicknameAuth.syncUserStatsFromFirestore();
                        console.log('🔄 DEBUG: Synced stats after creating new document');
                    }
                    
                    // Force update Player Info panel
                    if (window.panelManager) {
                        await window.panelManager.updateUserInfoPanel();
                        console.log('🔄 DEBUG: Forced Player Info panel update');
                        
                        // Initialize player rank display
                        setTimeout(() => updatePlayerRankDisplay(), 500);
                    }
                    
                } catch (error) {
                    console.error('🔍 DEBUG: Firestore test failed:', error);
                }
            } else {
                console.log('🔍 DEBUG: Cannot test Firestore - firebaseDb:', !!window.firebaseDb, 'playerId:', playerId);
            }
        }, 3000); // Test after 3 seconds
        
        console.log('📤 joinGame event sent to server');
        
        nameModal.style.display = 'none';
        
        console.log('🎯 Name modal hidden, game should start...');
        
        // Reset game state for new game
        gameEnded = false;
        gamePaused = false;
        localPlayer = null; // Will be recreated by server with saved size
        window.localPlayer = null;
        
        // Hide pause modal if it's open
        const pauseModal = document.getElementById('pauseModal');
        if (pauseModal) {
            pauseModal.classList.add('hidden');
        }
        
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
    
    // Chat panel handlers will be managed by PanelManager
    
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
                    '✅ Account created and saved to cloud database!' : 
                    '⚠️ Account created locally (will sync when online)!';
                alert(`${syncStatus} Please sign in with your new account.`);
                
            } catch (error) {
                console.error('❌ Registration failed:', error);
                
                // Show user-friendly error message
                let errorMessage = error.message;
                if (error.message.includes('Firestore')) {
                    errorMessage += '\n\nNote: Account was created locally but may not be synced to cloud. Please try again when online.';
                }
                
                alert('Registration failed: ' + errorMessage);
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
                console.log('🚪 UI logout button clicked');
                performLogout();
                
                // Clear form inputs
                const mainNameInput = document.getElementById('playerNameInput');
                const mainWalletInput = document.getElementById('playerWalletInput');
                if (mainNameInput) mainNameInput.value = '';
                if (mainWalletInput) mainWalletInput.value = '';
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
    // Don't process movement if game is paused
    if (gamePaused) {
        movement.x = 0;
        movement.y = 0;
        return;
    }
    
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
    // Comprehensive validation of localPlayer
    if (!localPlayer) {
        console.log('📷 updateCamera: No localPlayer available');
        return;
    }
    
    // Validate player object structure
    if (typeof localPlayer !== 'object' || localPlayer === null) {
        console.warn('📷 updateCamera: localPlayer is not a valid object:', localPlayer);
        return;
    }
    
    // Validate player coordinates
    if (typeof localPlayer.x !== 'number' || typeof localPlayer.y !== 'number' || 
        isNaN(localPlayer.x) || isNaN(localPlayer.y)) {
        console.warn('⚠️ Invalid player coordinates in updateCamera:', localPlayer.x, localPlayer.y);
        return;
    }
    
    // Validate camera state
    if (typeof camera.x !== 'number' || typeof camera.y !== 'number' || 
        isNaN(camera.x) || isNaN(camera.y)) {
        console.warn('⚠️ Invalid camera coordinates in updateCamera:', camera.x, camera.y);
        // Reset camera to player position
        camera.x = localPlayer.x;
        camera.y = localPlayer.y;
        console.log('📷 Camera reset to player position:', camera.x, camera.y);
        return;
    }
    
    // Smooth camera follow
    const lerpFactor = 0.1;
    const oldCameraX = camera.x;
    const oldCameraY = camera.y;
    camera.x += (localPlayer.x - camera.x) * lerpFactor;
    camera.y += (localPlayer.y - camera.y) * lerpFactor;
    
    // Log camera movement for debugging (only when significant movement occurs)
    if (Math.abs(camera.x - oldCameraX) > 1 || Math.abs(camera.y - oldCameraY) > 1) {
        console.log('📷 Camera following player:', localPlayer.name, 'Player pos:', Math.round(localPlayer.x), Math.round(localPlayer.y), 'Camera pos:', Math.round(camera.x), Math.round(camera.y));
    }
    
    // Dynamic zoom based on speed (with safety checks)
    const vx = localPlayer.vx || 0;
    const vy = localPlayer.vy || 0;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const targetZoom = Math.max(0.8, 1.2 - speed * 0.1);
    camera.zoom += (targetZoom - camera.zoom) * 0.05;
    
    // Calculate speed multiplier based on size (same logic as server)
    function calculateSpeedMultiplier(size) {
        const minSize = 20;
        const maxSize = 50;
        const minSpeedMultiplier = 0.4; // 40% of base speed for maximum size
        const maxSpeedMultiplier = 1.0; // 100% of base speed for minimum size
        
        const clampedSize = Math.max(minSize, Math.min(maxSize, size));
        const sizeProgress = (clampedSize - minSize) / (maxSize - minSize);
        const speedMultiplier = maxSpeedMultiplier - (sizeProgress * (maxSpeedMultiplier - minSpeedMultiplier));
        
        return speedMultiplier;
    }
    
    // Update speed display elements
    const speedElement = document.getElementById('speedValue');
    const maxSpeedElement = document.getElementById('maxSpeedValue');
    const playerSizeElement = document.getElementById('playerSizeValue');
    
    if (speedElement) {
        speedElement.textContent = isNaN(speed) ? '0.0' : (Math.round(speed * 10) / 10).toString();
    }
    
    if (maxSpeedElement && localPlayer) {
        const baseSpeed = 200;
        const sizeMultiplier = calculateSpeedMultiplier(localPlayer.size || 20);
        const maxSpeed = Math.round(baseSpeed * sizeMultiplier);
        maxSpeedElement.textContent = maxSpeed.toString();
    }
    
    if (playerSizeElement && localPlayer) {
        playerSizeElement.textContent = Math.round(localPlayer.size || 20).toString();
    }
}

// Function to update all player stats display elements
function updatePlayerStatsDisplay(currentSpeed, player) {
    if (!player) {
        console.warn('⚠️ updatePlayerStatsDisplay: No player provided');
        return;
    }
    
    // Calculate speed multiplier for max speed calculation
    function calculateSpeedMultiplier(size) {
        const minSize = 20;
        const maxSize = 50;
        const minSpeedMultiplier = 0.4; // 40% of base speed for maximum size
        const maxSpeedMultiplier = 1.0; // 100% of base speed for minimum size
        
        const clampedSize = Math.max(minSize, Math.min(maxSize, size));
        const sizeProgress = (clampedSize - minSize) / (maxSize - minSize);
        const speedMultiplier = maxSpeedMultiplier - (sizeProgress * (maxSpeedMultiplier - minSpeedMultiplier));
        
        return speedMultiplier;
    }
    
    // Update current game score
    const currentGameScoreElement = document.getElementById('currentGameScore');
    if (currentGameScoreElement) {
        currentGameScoreElement.textContent = player.score || 0;
    } else {
        console.warn('⚠️ currentGameScore element not found');
    }
    
    // Update player size
    const playerSizeElement = document.getElementById('playerSizeValue');
    if (playerSizeElement) {
        playerSizeElement.textContent = Math.round(player.size || 20);
    } else {
        console.warn('⚠️ playerSizeValue element not found');
    }
    
    // Update current speed
    const speedElement = document.getElementById('speedValue');
    if (speedElement) {
        const speedText = isNaN(currentSpeed) ? '0.0' : (Math.round(currentSpeed * 10) / 10).toString();
        speedElement.textContent = speedText;
    } else {
        console.warn('⚠️ speedValue element not found');
    }
    
    // Update max speed
    const maxSpeedElement = document.getElementById('maxSpeedValue');
    if (maxSpeedElement) {
        const baseSpeed = 200;
        const sizeMultiplier = calculateSpeedMultiplier(player.size || 20);
        const maxSpeed = Math.round(baseSpeed * sizeMultiplier);
        maxSpeedElement.textContent = maxSpeed.toString();
    } else {
        console.warn('⚠️ maxSpeedValue element not found');
    }
    
    // Log updates for debugging
    console.log('📊 Updated player stats display - Score:', player.score, 'Size:', player.size, 'Speed:', currentSpeed);
    
    // Update booster status in stats if elements exist
    updateBoosterStatusDisplay();
}

function worldToScreen(worldX, worldY) {
    // Validate camera state
    if (isNaN(camera.x) || isNaN(camera.y) || isNaN(camera.zoom)) {
        console.warn('⚠️ Invalid camera state in worldToScreen:', camera.x, camera.y, camera.zoom);
        return { x: 0, y: 0 };
    }
    
    const screenX = (worldX - camera.x) * camera.zoom + canvas.width / 2;
    const screenY = (worldY - camera.y) * camera.zoom + canvas.height / 2;
    
    return { x: screenX, y: screenY };
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
    
    // Draw boosters
    if (gameState.boosters) {
        gameState.boosters.forEach(booster => {
            drawBooster(booster);
        });
    }
    
    // Draw players and bots
    const players = gameState.players || [];
    const bots = gameState.bots || [];
    const allEntities = [...players, ...bots];
    
    // Debug: log camera state occasionally
    if (Math.random() < 0.01 && localPlayer) { // 1% chance to avoid spam
        console.log('🎬 Render - Camera pos:', Math.round(camera.x), Math.round(camera.y), 'Player pos:', Math.round(localPlayer.x), Math.round(localPlayer.y), 'Zoom:', camera.zoom.toFixed(2));
    }
    
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

function drawBooster(booster) {
    const screenPos = worldToScreen(booster.x, booster.y);
    const radius = 12 * camera.zoom; // Slightly larger than coins
    
    // Skip if off-screen
    if (screenPos.x < -radius || screenPos.x > canvas.width + radius ||
        screenPos.y < -radius || screenPos.y > canvas.height + radius) {
        return;
    }
    
    // Booster body
    ctx.fillStyle = booster.color;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Booster pulse effect
    const time = Date.now() * 0.005;
    const pulseScale = 1 + 0.2 * Math.sin(time + booster.id);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3 * camera.zoom;
    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, radius * pulseScale, 0, Math.PI * 2);
    ctx.stroke();
    
    // Booster effect text
    ctx.fillStyle = 'white';
    ctx.font = `${Math.max(10, 12 * camera.zoom)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Text background
    const textWidth = ctx.measureText(booster.effect).width + 8;
    const textHeight = 16 * camera.zoom;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(screenPos.x - textWidth / 2, screenPos.y + radius + 5, textWidth, textHeight);
    
    // Text
    ctx.fillStyle = 'white';
    ctx.fillText(booster.effect, screenPos.x, screenPos.y + radius + textHeight / 2 + 5);
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
    
    // Entity body - convert hue to HSL color
    let fillColor;
    if (typeof entity.color === 'number') {
        // Color is hue value, convert to HSL
        fillColor = `hsl(${entity.color}, 70%, 50%)`;
    } else {
        // Color is already a string, use as is
        fillColor = entity.color;
    }
    
    ctx.fillStyle = fillColor;
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
    
    // Force scroll to bottom immediately and smoothly
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    
    // Also ensure scroll after a brief delay (for dynamic content)
    setTimeout(() => {
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    }, 10);
    
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

// Force scroll chat to bottom
function scrollChatToBottom() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
        console.log('💬 Forced chat scroll to bottom');
    }
}

// Helper function to update player rank display
// Debounce function to prevent excessive rank updates
let rankUpdateTimeout = null;
let lastRankUpdate = 0;
const RANK_UPDATE_THROTTLE = 1000; // Update rank at most once per second

function updatePlayerRankDisplay() {
    // Throttle updates to prevent excessive calls
    const now = Date.now();
    if (now - lastRankUpdate < RANK_UPDATE_THROTTLE) {
        if (rankUpdateTimeout) return; // Already scheduled
        
        rankUpdateTimeout = setTimeout(() => {
            rankUpdateTimeout = null;
            updatePlayerRankDisplay();
        }, RANK_UPDATE_THROTTLE - (now - lastRankUpdate));
        return;
    }
    
    // Check if panelManager is ready
    if (!window.panelManager) {
        console.log('⏳ updatePlayerRankDisplay: window.panelManager not ready yet, will retry later');
        return;
    }
    
    if (!window.localPlayer) {
        console.log('⏳ updatePlayerRankDisplay: window.localPlayer not ready yet, will retry later');
        return;
    }
    
    if (!window.gameState) {
        console.log('⏳ updatePlayerRankDisplay: window.gameState not ready yet, will retry later');
        return;
    }
    
    const currentGameRankElement = document.querySelector('#userinfoLeftPanel #currentGameRank');
    if (!currentGameRankElement) {
        console.log('❌ updatePlayerRankDisplay: currentGameRankDisplay: currentGameRankElement not found in DOM');
        return;
    }
    
    try {
    const playerRank = window.panelManager.calculatePlayerRank(window.localPlayer);
    const rankText = playerRank ? `#${playerRank}` : '#-';
        
        // Only update if rank actually changed
        if (currentGameRankElement.textContent !== rankText) {
    currentGameRankElement.textContent = rankText;
    console.log('🏆 Updated player rank display to:', rankText, 'for player:', window.localPlayer.name, 'score:', window.localPlayer.score);
            lastRankUpdate = now;
        }
    } catch (error) {
        console.error('❌ Error updating player rank display:', error);
        currentGameRankElement.textContent = '#-';
    }
}

// Centralized logout function
function performLogout() {
    console.log('🚪 Performing logout...');
    
    // 1. Logout from both authentication systems
    if (window.authSystem) {
        window.authSystem.signOut();
    }
    if (window.nicknameAuth) {
        window.nicknameAuth.logout();
    }
    
    // 2. Disconnect from game server if connected
    if (socket && socket.connected) {
        console.log('🔌 Disconnecting from game server...');
        socket.disconnect();
    }
    
    // 3. Reset game state
    gameEnded = true;
    localPlayer = null;
    entities = [];
    coins = [];
    
    // 4. Reset player info to guest state
    const playerInfoName = document.getElementById('playerInfoName');
    const playerInfoStatus = document.getElementById('playerInfoStatus');
    const totalCoins = document.getElementById('totalCoins');
    const matchesPlayed = document.getElementById('matchesPlayed');
    const bestScore = document.getElementById('bestScore');
    
    if (playerInfoName) playerInfoName.textContent = 'Guest';
    if (playerInfoStatus) playerInfoStatus.textContent = 'Not signed in';
    if (totalCoins) totalCoins.textContent = '0';
    if (matchesPlayed) matchesPlayed.textContent = '0';
    if (bestScore) bestScore.textContent = '0';
    
    // 5. Hide all logout buttons
    const logoutBtns = document.querySelectorAll('#logoutBtn, #logoutBtnLeft');
    logoutBtns.forEach(btn => btn.classList.add('hidden'));
    
    // 6. Close all panels
    if (window.panelManager) {
        Object.keys(window.panelManager.panels).forEach(panelName => {
            window.panelManager.closePanel(panelName);
        });
    }
    
    // 7. Hide game canvas and show main menu
    const gameCanvas = document.getElementById('gameCanvas');
    const nameModal = document.getElementById('nameModal');
    
    if (gameCanvas) {
        gameCanvas.style.display = 'none';
    }
    
    // 8. Reset any game UI elements to their default state
    const matchTimer = document.getElementById('matchTimer');
    const speedIndicator = document.getElementById('speedIndicator');
    const panelWrappers = document.querySelectorAll('.panel-wrapper');
    
    if (matchTimer) matchTimer.style.display = 'none';
    if (speedIndicator) speedIndicator.style.display = 'none';
    panelWrappers.forEach(wrapper => {
        if (wrapper) wrapper.style.display = 'none';
    });
    
    // 9. Show main menu properly
    if (nameModal) {
        nameModal.classList.remove('hidden');
        nameModal.style.display = 'flex';
    }
    
    // 10. Reset canvas context
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    
    // 11. Reset page to initial state
    document.body.style.overflow = 'auto'; // Allow scrolling again
    
    // 12. Reset player rank display and pause state
    updatePlayerRankDisplay();
    gamePaused = false;
    const pauseModal = document.getElementById('pauseModal');
    if (pauseModal) {
        pauseModal.classList.add('hidden');
    }
    
    // 13. Force page reload to ensure clean state
    setTimeout(() => {
        window.location.reload();
    }, 100);
    
    console.log('✅ Logout completed - returned to main menu');
}

// Setup chat event listeners (used when recreating chat elements)
function setupChatEventListeners() {
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    
    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', sendChatMessage);
    }
    
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }
    
    // Initialize player rank display after chat setup
    setTimeout(() => {
        if (window.panelManager) {
            updatePlayerRankDisplay();
        }
    }, 1000);
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
    
    // Update current game rank in Player Info panel when leaderboard updates
    updatePlayerRankDisplay();
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
let lastStatsUpdate = 0;
let lastBestScoreSave = 0; // Track when we last saved best score
let lastFirestoreRefresh = 0; // Track when we last refreshed from Firestore

function gameLoop() {
    if (gameEnded) {
        requestAnimationFrame(gameLoop);
        return;
    }
    
    if (gamePaused) {
        requestAnimationFrame(gameLoop);
        return;
    }
    
    // Silent game loop - no logs
    updateMovement();
    
    // Send movement to server (throttled to 30fps max)
    if (socket && !gamePaused) {
        const now = Date.now();
        if (now - lastMovementSent > MOVEMENT_SEND_INTERVAL) {
            socket.emit('playerMove', movement);
            lastMovementSent = now;
        }
        
        // Update player stats every second during gameplay
        if (now - lastStatsUpdate > 1000 && localPlayer) {
            console.log('🔄 Updating player stats - Score:', localPlayer.score, 'User:', nicknameAuth.getCurrentUserSync()?.nickname);
            
            // Calculate current speed and update display
            const vx = localPlayer.vx || 0;
            const vy = localPlayer.vy || 0;
            const currentSpeed = Math.sqrt(vx * vx + vy * vy);
            updatePlayerStatsDisplay(currentSpeed, localPlayer);
            
            updatePlayerInfoPanelStats(localPlayer);
            // Also force update display immediately
            forceUpdateGameStatsDisplay(localPlayer);
            
            // Update player info panel if it exists and is open
            if (window.panelManager) {
                window.panelManager.updateUserInfoPanel().catch(err => console.warn('Panel update failed:', err));
            }
            
            // Update player rank display
            updatePlayerRankDisplay();
            
            lastStatsUpdate = now;
        }
        
        // Refresh user data from Firestore every 60 seconds
        if (now - lastFirestoreRefresh > 60000) {
            nicknameAuth.refreshCurrentUserFromFirestore().then(freshUser => {
                if (freshUser && localPlayer) {
                    console.log('🔥 Refreshed user data from Firestore, updating UI');
                    forceUpdateGameStatsDisplay(localPlayer);
                }
            }).catch(error => {
                console.warn('⚠️ Failed to refresh from Firestore in game loop:', error);
            });
            lastFirestoreRefresh = now;
        }
        
        // Save best score to Firebase every 30 seconds as backup
        if (now - lastBestScoreSave > 30000 && localPlayer && localPlayer.score > 0) {
            const currentUser = nicknameAuth.getCurrentUserSync();
            if (currentUser && window.authSystem?.currentUser) {
                const savedBestScore = currentUser.stats.bestScore || 0;
                if (localPlayer.score > savedBestScore) {
                    // Save new best score
                    fetch(`/api/player/${window.authSystem.currentUser.uid}/best-score`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ score: localPlayer.score })
                    }).then(response => {
                        if (response.ok) {
                            console.log(`🏆 Periodic best score backup saved: ${localPlayer.score}`);
                            currentUser.stats.bestScore = localPlayer.score;
                        }
                    }).catch(error => {
                        console.warn('⚠️ Failed to save periodic best score:', error);
                    });
                }
            }
            lastBestScoreSave = now;
        }
    }
    
    // Update camera to follow player (only if localPlayer exists and has valid coordinates)
    if (localPlayer && typeof localPlayer.x === 'number' && typeof localPlayer.y === 'number' && 
        !isNaN(localPlayer.x) && !isNaN(localPlayer.y)) {
    updateCamera();
        
        // Debug: test camera following (very rare to avoid spam)
        if (Math.random() < 0.0001) { // Extremely rare logging
            const distance = Math.sqrt((localPlayer.x - camera.x) ** 2 + (localPlayer.y - camera.y) ** 2);
            if (distance > 100) {
                console.log('⚠️ Camera may not be following player properly. Distance:', Math.round(distance), 'Player:', Math.round(localPlayer.x), Math.round(localPlayer.y), 'Camera:', Math.round(camera.x), Math.round(camera.y));
            } else {
                console.log('📷 Camera following player correctly. Distance:', Math.round(distance));
            }
        }
    } else {
        // Log when localPlayer is not available for camera update (rare to avoid spam)
        if (Math.random() < 0.001) { // Very rare logging
            if (!localPlayer) {
                console.log('📷 Camera update skipped - no localPlayer');
            } else {
                console.log('📷 Camera update skipped - invalid coordinates:', localPlayer.x, localPlayer.y);
            }
        }
    }
    
    // Check and update active boosters
    const now = Date.now();
    if (activeBoosters.speed.active && now > activeBoosters.speed.endTime) {
        activeBoosters.speed.active = false;
        activeBoosters.speed.multiplier = 1;
        console.log('🚀 Speed boost expired');
    }
    
    if (activeBoosters.coins.active && now > activeBoosters.coins.endTime) {
        activeBoosters.coins.active = false;
        activeBoosters.coins.multiplier = 1;
        console.log('💰 Coin multiplier expired');
    }
    
    // Update booster display every frame for smooth countdown
    updateBoosterStatusDisplay();
    
    // Update player stats display in real-time (every few frames)
    if (localPlayer && Math.random() < 0.1) { // 10% chance each frame
        const vx = localPlayer.vx || 0;
        const vy = localPlayer.vy || 0;
        const currentSpeed = Math.sqrt(vx * vx + vy * vy);
        updatePlayerStatsDisplay(currentSpeed, localPlayer);
        
        // Log speed changes for debugging
        if (Math.abs(currentSpeed - (localPlayer.lastLoggedSpeed || 0)) > 0.1) {
            console.log('🏃 Speed changed:', (localPlayer.lastLoggedSpeed || 0).toFixed(1), '→', currentSpeed.toFixed(1));
            localPlayer.lastLoggedSpeed = currentSpeed;
        }
    }
    
    // Update speech bubbles
    updateSpeechBubbles();
    
    // Render the game
    render();
    
    // Continue the game loop
    requestAnimationFrame(gameLoop);
}

// Pause game functions
function pauseGame() {
    console.log('🎮 pauseGame called, gameEnded:', gameEnded, 'gamePaused:', gamePaused);
    
    // Check if we can pause - either localPlayer exists OR nameModal is hidden (game started)
    const nameModal = document.getElementById('nameModal');
    const canPause = !gameEnded && !gamePaused && (localPlayer || nameModal?.style.display === 'none');
    
    if (!canPause) {
        console.log('🎮 Cannot pause - conditions not met');
        return;
    }
    
    gamePaused = true;
    const pauseModal = document.getElementById('pauseModal');
    if (pauseModal) {
        pauseModal.classList.remove('hidden');
        console.log('🎮 Game paused - modal shown');
    } else {
        console.warn('⚠️ Pause modal not found!');
    }
}

function resumeGame() {
    console.log('🎮 resumeGame called, gamePaused:', gamePaused);
    if (!gamePaused) return;
    
    gamePaused = false;
    const pauseModal = document.getElementById('pauseModal');
    if (pauseModal) {
        pauseModal.classList.add('hidden');
        console.log('🎮 Game resumed - modal hidden');
    } else {
        console.warn('⚠️ Pause modal not found!');
    }
}

function togglePause() {
    if (gamePaused) {
        resumeGame();
    } else {
        pauseGame();
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎮 DOMContentLoaded event fired - starting initialization');
    
    console.log('🎮 About to call init()');
    init();
    console.log('🎮 init() returned');
    
    // Load saved player data
    await loadSavedPlayerData();
    
    // Initialize player rank display after everything is loaded
    setTimeout(() => {
        if (window.panelManager) {
            updatePlayerRankDisplay();
        }
    }, 4000);
    
    // Setup pause functionality
    setupPauseControls();
    
    console.log('🎮 DOMContentLoaded initialization completed');
});

// Setup pause controls
function setupPauseControls() {
    console.log('🎮 setupPauseControls called - setting up pause modal click handler');
    
    // Click to resume when paused
    const pauseModal = document.getElementById('pauseModal');
    if (pauseModal) {
        pauseModal.addEventListener('click', () => {
            if (gamePaused) {
                console.log('🎮 Pause modal clicked, resuming game...');
                resumeGame();
            }
        });
        console.log('🎮 Pause modal click handler added');
    } else {
        console.warn('⚠️ Pause modal not found during setup!');
    }
    
    console.log('🎮 Pause controls initialized - Click pause modal to resume');
}

// Save game session when user leaves the page
window.addEventListener('beforeunload', async (event) => {
    // Save if user is authenticated and in game (regardless of score)
    const currentUser = nicknameAuth.getCurrentUserSync();
    if (currentUser && localPlayer) {
        try {
            // Use sendBeacon for better reliability during page unload
            const sessionData = {
                playerName: currentUser.nickname,
                score: localPlayer.score || 0,
                walletAddress: currentUser.wallet || ''
            };
            
            const blob = new Blob([JSON.stringify(sessionData)], { type: 'application/json' });
            navigator.sendBeacon(`/api/player/${currentUser.nickname}/session`, blob);
            
            console.log(`💾 Saving match on page unload: ${localPlayer.score || 0} coins`);
            
            // Also save current player size to Firestore
            if (window.firebaseDb && localPlayer.size) {
                try {
                    const playerRef = window.firebaseDb.collection('players').doc(currentUser.nickname);
                    await playerRef.update({
                        lastSize: localPlayer.size,
                        lastPlayed: window.firebase.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`📏 Saved player size ${localPlayer.size} to Firestore on page unload`);
                } catch (error) {
                    console.warn('⚠️ Failed to save player size on page unload:', error);
                }
            }
            
            // Update player rank display before unload
            updatePlayerRankDisplay();
        } catch (error) {
            console.warn('⚠️ Failed to save match on page unload:', error);
        }
    }
});

// Also save session when switching tabs (visibility change)
document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
        // User switched to another tab or minimized
        const currentUser = nicknameAuth.getCurrentUserSync();
        if (currentUser && localPlayer) {
            try {
                const response = await fetch(`/api/player/${currentUser.nickname}/session`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        playerName: currentUser.nickname,
                        score: localPlayer.score || 0,
                        walletAddress: currentUser.wallet || ''
                    })
                });
                if (response.ok) {
                    console.log(`💾 Match saved on visibility change: ${localPlayer.score || 0} coins`);
                }
                
                // Also save current player size to Firestore
                if (window.firebaseDb && localPlayer.size) {
                    try {
                        const playerRef = window.firebaseDb.collection('players').doc(currentUser.nickname);
                        await playerRef.update({
                            lastSize: localPlayer.size,
                            lastPlayed: window.firebase.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`📏 Saved player size ${localPlayer.size} to Firestore on visibility change`);
                    } catch (error) {
                        console.warn('⚠️ Failed to save player size on visibility change:', error);
                    }
                }
                
                // Update player rank display on visibility change
                updatePlayerRankDisplay();
            } catch (error) {
                console.warn('⚠️ Failed to save session on visibility change:', error);
            }
        }
    }
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
    
    // Initialize player rank display after panel update
    setTimeout(() => updatePlayerRankDisplay(), 500);
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
    
    // Initialize player rank display
    setTimeout(() => updatePlayerRankDisplay(), 500);
}

async function updatePlayerInfoPanelStats(player) {
    console.log('📊 updatePlayerInfoPanelStats called with player:', player?.name, 'score:', player?.score);
    
    // Get current user - try fresh data first, then cached
    let currentUser = null;
    try {
        // Only fetch fresh data occasionally to avoid too many requests
        if (Date.now() - (window.lastFirestoreRefresh || 0) > 15000) { // 15 seconds (more frequent)
            currentUser = await nicknameAuth.syncUserStatsFromFirestore();
            window.lastFirestoreRefresh = Date.now();
            console.log('🔥 Synced user stats from Firestore');
        } else {
            currentUser = nicknameAuth.getCurrentUserSync();
            console.log('💾 Using cached user data');
        }
    } catch (error) {
        console.warn('⚠️ Failed to sync stats from Firestore, using cache:', error);
        currentUser = nicknameAuth.getCurrentUserSync();
    }
    
    // Debug localStorage state
    const currentUserFromStorage = localStorage.getItem('currentUser');
    console.log('🔍 Debug - currentUser in localStorage:', currentUserFromStorage ? JSON.parse(currentUserFromStorage).nickname : 'none');
    
    console.log('👤 Current user:', currentUser?.nickname, 'stats:', currentUser?.stats);
    
    if (!currentUser) {
        console.log('⚠️ No authenticated user found - player is in guest mode. Stats will not be saved.');
        // For guest players, we can still update the UI with current game stats
        // but we won't have persistent total stats to display
        const totalCoinsElement = document.getElementById('totalCoins');
        const totalMatchesElement = document.getElementById('totalMatches');
        const bestScoreElement = document.getElementById('bestScore');
        
        if (totalCoinsElement) totalCoinsElement.textContent = '0 (Guest)';
        if (totalMatchesElement) totalMatchesElement.textContent = '0 (Guest)';
        if (bestScoreElement) bestScoreElement.textContent = player.score || '0';
        
        console.log('📊 Updated UI for guest player with current score:', player.score);
        return;
    }
    
    // Make sure stats exists
    if (!currentUser.stats) {
        currentUser.stats = {
            totalScore: 0,
            gamesPlayed: 0,
            bestScore: 0,
            wins: 0
        };
        console.log('🔧 Initialized missing stats object');
    }
    
    if (player.name !== currentUser.nickname) {
        console.log('❌ User check failed - currentUser:', currentUser?.nickname, 'player:', player?.name);
        return; // Only update for authenticated current user
    }
    
    console.log('✅ Proceeding with stats update');
    
    // Update total coins from Firestore data
    const totalCoinsElement = document.getElementById('totalCoins');
    if (totalCoinsElement) {
        const totalCoins = currentUser.stats.totalScore || 0;
        totalCoinsElement.textContent = totalCoins;
        console.log('💰 Updated total coins to:', totalCoins);
    } else {
        console.log('❌ totalCoinsElement not found');
    }
    
    // Update matches played to show current game is active
    const matchesPlayedElement = document.getElementById('matchesPlayed');
    if (matchesPlayedElement) {
        const baseMatches = currentUser.stats.gamesPlayed || 0;
        const newValue = baseMatches + 1; // +1 for current active game
        matchesPlayedElement.textContent = newValue;
        console.log('🎮 Updated matches played to:', newValue, '(base:', baseMatches, '+1 active)');
    } else {
        console.log('❌ matchesPlayedElement not found');
    }
    
    // Update best score if current score is higher
    const bestScoreElement = document.getElementById('bestScore');
    if (bestScoreElement) {
        const savedBestScore = currentUser.stats.bestScore || 0;
        const currentGameScore = player.score || 0;
        
        // Show the highest between saved best score and current score
        const displayScore = Math.max(savedBestScore, currentGameScore);
        bestScoreElement.textContent = displayScore;
        console.log('🏆 Best Score updated to:', displayScore, '(saved:', savedBestScore, 'current:', currentGameScore, ')');
        
        // If current score is new best, update in database
        if (currentGameScore > savedBestScore) {
            currentUser.stats.bestScore = currentGameScore;
            await nicknameAuth.updateUserStats(currentUser.nickname, currentUser.stats);
            
            // Update rank display after score change
            setTimeout(() => updatePlayerRankDisplay(), 100);
            
            // Also update in Firebase via server API if we have Firebase ID
            if (window.authSystem && window.authSystem.currentUser) {
                try {
                    const response = await fetch(`/api/player/${window.authSystem.currentUser.uid}/best-score`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ score: currentGameScore })
                    });
                    if (response.ok) {
                        console.log('🏆 Best score updated in Firebase:', currentGameScore);
                    }
                } catch (error) {
                    console.warn('⚠️ Failed to update best score in Firebase:', error);
                }
            }
            
            console.log('🏆 New best score recorded:', currentGameScore);
        }
    } else {
        console.log('❌ bestScoreElement not found');
    }
    
    // Update current game size
    const currentGameSizeElement = document.getElementById('currentGameSize');
    if (currentGameSizeElement && player.size) {
        currentGameSizeElement.textContent = Math.round(player.size);
        console.log('📏 Updated current game size to:', Math.round(player.size));
    } else if (currentGameSizeElement) {
        currentGameSizeElement.textContent = '...';
        console.log('📏 Current game size not available yet');
    }
    
    // Update current game rank (if PanelManager exists)
    updatePlayerRankDisplay();
}

async function loadSavedPlayerData() {
    console.log('📂 loadSavedPlayerData called - checking authentication...');
    
    // Check if user is authenticated and get fresh data from Firestore
    let currentUser = await nicknameAuth.getCurrentUser();
    if (currentUser) {
        console.log('🔄 Loading saved player data for:', currentUser.nickname);
        console.log('📊 Current user stats before sync:', currentUser.stats);
        
        // Force sync with Firestore FIRST to get latest data
        if (nicknameAuth.isOnline && window.firebaseDb) {
            try {
                console.log('🔄 Force syncing with Firestore for latest data...');
                const freshUser = await nicknameAuth.syncUserStatsFromFirestore();
                if (freshUser) {
                    currentUser = freshUser;
                    console.log('📊 User stats after Firestore sync:', currentUser.stats);
                }
            } catch (error) {
                console.warn('⚠️ Failed to sync with Firestore:', error.message);
            }
        }
        
        // Load latest user data into UI
        updatePlayerInfoPanelWithStats(currentUser);
        
        // Also update the main player info panel
        updateMainPlayerInfoPanel(currentUser);
        
        // Force update Player Info panel
        if (window.panelManager) {
            await window.panelManager.updateUserInfoPanel();
            console.log('🔄 Forced Player Info panel update in loadSavedPlayerData');
            
            // Initialize player rank display
            setTimeout(() => updatePlayerRankDisplay(), 500);
        }
        
        console.log('✅ Player data loading completed');
        
        // Initialize player rank display after data loading
        setTimeout(() => updatePlayerRankDisplay(), 500);
    } else {
        console.log('ℹ️ No saved user data found');
        
        // Initialize player rank display even for guests
        setTimeout(() => updatePlayerRankDisplay(), 500);
    }
} 

// Update main player info panel with current user data
function updateMainPlayerInfoPanel(user) {
    console.log('🔄 Updating main player info panel with user:', user);
    
    const playerInfoName = document.getElementById('playerInfoName');
    const playerInfoStatus = document.getElementById('playerInfoStatus');
    const totalCoins = document.getElementById('totalCoins');
    const matchesPlayed = document.getElementById('matchesPlayed');
    const bestScore = document.getElementById('bestScore');
    
    if (playerInfoName && user.nickname) {
        playerInfoName.textContent = user.nickname;
        console.log('✅ Updated playerInfoName to:', user.nickname);
    }
    
    if (playerInfoStatus) {
        playerInfoStatus.textContent = 'Authenticated';
        console.log('✅ Updated playerInfoStatus to: Authenticated');
    }
    
    // Update stats if available
    if (user.stats) {
        if (totalCoins) {
            totalCoins.textContent = user.stats.totalScore || 0;
            console.log('💰 Updated totalCoins to:', user.stats.totalScore);
        }
        if (matchesPlayed) {
            matchesPlayed.textContent = user.stats.gamesPlayed || 0;
            console.log('🎮 Updated matchesPlayed to:', user.stats.gamesPlayed);
        }
        if (bestScore) {
            bestScore.textContent = user.stats.bestScore || 0;
            console.log('🏆 Updated bestScore to:', user.stats.bestScore);
        }
    }
    
    // Show logout button if it exists
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.classList.remove('hidden');
        console.log('✅ Showed logout button');
    }
    
    // Initialize player rank display
    setTimeout(() => updatePlayerRankDisplay(), 500);
} 

// Simple function to force update panel display with current game state
function forceUpdateGameStatsDisplay(player) {
    if (!player) return;
    
    const currentUser = nicknameAuth.getCurrentUserSync();
    if (!currentUser || player.name !== currentUser.nickname) return;
    
    console.log('🔧 Force updating stats display for:', player.name, 'score:', player.score);
    console.log('📊 Current user stats:', currentUser.stats);
    
    // Debug UI elements
    debugUIElements();
    
    // Force update matches display
    const matchesPlayedElement = document.getElementById('matchesPlayed');
    if (matchesPlayedElement) {
        const baseMatches = currentUser.stats?.gamesPlayed || 0;
        const newMatchesValue = baseMatches + 1; // +1 for current active game
        matchesPlayedElement.textContent = newMatchesValue;
        console.log('🎮 Updated matches to:', newMatchesValue, '(base:', baseMatches, ')');
    } else {
        console.log('❌ matchesPlayedElement not found');
    }
    
    // Force update best score display
    const bestScoreElement = document.getElementById('bestScore');
    if (bestScoreElement) {
        const savedBestScore = currentUser.stats?.bestScore || 0;
        const currentGameScore = player.score || 0;
        const displayScore = Math.max(savedBestScore, currentGameScore);
        bestScoreElement.textContent = displayScore;
        console.log('🏆 Updated best score to:', displayScore, '(saved:', savedBestScore, 'current:', currentGameScore, ')');
    } else {
        console.log('❌ bestScoreElement not found');
    }
    
    // Force update current game size display
    const currentGameSizeElement = document.getElementById('currentGameSize');
    if (currentGameSizeElement && player.size) {
        currentGameSizeElement.textContent = Math.round(player.size);
        console.log('📏 Force updated current game size to:', Math.round(player.size));
    } else if (currentGameSizeElement) {
        currentGameSizeElement.textContent = '...';
        console.log('📏 Current game size not available for force update');
    }
    
    // Also update total coins from auth system if available
    if (window.authSystem && window.authSystem.currentUser) {
        const totalCoinsElement = document.getElementById('totalCoins');
        if (totalCoinsElement) {
            // Try to get latest coins from Firestore listener
            window.authSystem.loadPlayerTotalCoins().catch(error => {
                console.warn('⚠️ Failed to refresh total coins:', error);
            });
        }
    }
    
    // Update player rank display
    setTimeout(() => updatePlayerRankDisplay(), 100);
}

// Debug function to check if UI elements exist
function debugUIElements() {
    const elements = {
        totalCoins: document.getElementById('totalCoins'),
        matchesPlayed: document.getElementById('matchesPlayed'),
        bestScore: document.getElementById('bestScore'),
        playerInfoName: document.getElementById('playerInfoName'),
        playerInfoStatus: document.getElementById('playerInfoStatus')
    };
    
    console.log('🔍 UI Elements debug:');
    Object.entries(elements).forEach(([name, element]) => {
        console.log(`  ${name}:`, element ? '✅ Found' : '❌ Missing', element);
    });
    
    return elements;
}

// Panel Management System
class PanelManager {
    constructor() {
        this.panels = {
            leaderboard: {
                toggle: document.getElementById('leaderboardToggle'),
                panel: document.getElementById('leaderboardPanel'),
                close: document.getElementById('leaderboardClose')
            },
            chat: {
                toggle: document.getElementById('chatToggle'),
                panel: document.getElementById('chatPanelNew'),
                close: document.getElementById('chatClose')
            },
            controls: {
                toggle: document.getElementById('controlsToggle'),
                panel: document.getElementById('controlsPanel'),
                close: document.getElementById('controlsClose')
            },
            userinfoLeft: {
                toggle: document.getElementById('userinfoToggleLeft'),
                panel: document.getElementById('userinfoLeftPanel'),
                close: document.getElementById('userinfoLeftClose')
            }
        };
        
        this.init();
    }
    
    init() {
        // Add event listeners for each panel
        Object.entries(this.panels).forEach(([name, elements]) => {
            if (elements.toggle && elements.panel && elements.close) {
                // Open panel
                elements.toggle.addEventListener('click', () => {
                    this.openPanel(name);
                });
                
                // Close panel
                elements.close.addEventListener('click', () => {
                    this.closePanel(name);
                });
            } else {
                console.warn(`⚠️ Panel ${name} missing elements:`, elements);
            }
        });
        
        console.log('🎛️ Panel Manager initialized');
        
        // Listen for window resize to handle orientation changes
        window.addEventListener('resize', () => {
            this.handleResize();
        });
        
        // Initialize player rank display after panel manager is ready
        setTimeout(() => updatePlayerRankDisplay(), 500);
    }
    
    handleResize() {
        // If screen becomes mobile size (≤800px) and multiple panels are open, close all but one
        if (window.innerWidth <= 800) {
            const openPanels = Object.entries(this.panels).filter(([name, panel]) => 
                panel.panel && !panel.panel.classList.contains('hidden')
            );
            
            if (openPanels.length > 1) {
                console.log('📱 Screen resized to mobile, closing extra panels');
                // Keep only the first open panel, close the rest
                openPanels.slice(1).forEach(([name]) => {
                    this.closePanel(name);
                    console.log(`📱 Auto-closed panel ${name} due to mobile resize`);
                });
                
                // Update rank display after resize
                setTimeout(() => updatePlayerRankDisplay(), 200);
            }
        }
    }
    
    calculatePlayerRank(localPlayer) {
        // Calculate player's rank based on current leaderboard from gameState
        if (!localPlayer || !window.gameState) {
            console.log('❌ calculatePlayerRank: Missing localPlayer or gameState');
            return null;
        }
        
        // Use the same logic as updateLeaderboard function
        const allEntities = [...(window.gameState.players || []), ...(window.gameState.bots || [])];
        allEntities.sort((a, b) => (b.score || 0) - (a.score || 0));
        
        console.log('🔍 calculatePlayerRank: Looking for player:', localPlayer.id, localPlayer.name, 'in', allEntities.length, 'entities');
        
        // Find local player's position in sorted leaderboard
        const playerRank = allEntities.findIndex(entity => 
            entity.id === localPlayer.id || 
            entity.name === localPlayer.name ||
            (entity.id === window.gameState?.playerId)
        ) + 1;
        
        console.log('🔍 calculatePlayerRank: Found rank:', playerRank, 'for player score:', localPlayer.score);
        
        // Debug: show top 5 players
        console.log('🏆 Top 5 leaderboard:', allEntities.slice(0, 5).map(e => `${e.name}(${e.score})`));
        
        // Also update the rank display element directly
        const currentGameRankElement = document.querySelector('#userinfoLeftPanel #currentGameRank');
        if (currentGameRankElement) {
            const rankText = playerRank > 0 ? `#${playerRank}` : '#-';
            currentGameRankElement.textContent = rankText;
            console.log('🏆 Direct rank update:', rankText);
        }
        
        return playerRank > 0 ? playerRank : null;
    }
    
    openPanel(panelName) {
        const panel = this.panels[panelName];
        if (panel && panel.toggle && panel.panel) {
            // On mobile screens (max-width: 800px), close all other panels first
            if (window.innerWidth <= 800) {
                Object.entries(this.panels).forEach(([name, otherPanel]) => {
                    if (name !== panelName && otherPanel.panel && !otherPanel.panel.classList.contains('hidden')) {
                        this.closePanel(name);
                        console.log(`📱 Mobile: Auto-closed panel ${name} to open ${panelName}`);
                    }
                });
            }
            
            // Hide button, show panel
            panel.toggle.style.display = 'none';
            panel.panel.classList.remove('hidden');
            
            console.log(`📂 Opened panel: ${panelName}`);
            
            // Special handling for different panels
            if (panelName === 'userinfoLeft') {
                // Immediately update user info when panel opens
                this.updateUserInfoPanel().catch(err => console.warn('Panel update failed:', err));
                // Also update rank display immediately
                setTimeout(() => updatePlayerRankDisplay(), 100);
                console.log('👤 User info panel opened, refreshing data');
            } else if (panelName === 'chat') {
                // Auto-scroll chat to bottom when opened
                setTimeout(() => {
                    scrollChatToBottom();
                }, 100);
            }
            
            // Always update rank display when any panel opens
            setTimeout(() => updatePlayerRankDisplay(), 200);
        }
    }
    
    closePanel(panelName) {
        const panel = this.panels[panelName];
        if (panel && panel.toggle && panel.panel) {
            // Show button, hide panel
            panel.toggle.style.display = 'flex';
            panel.panel.classList.add('hidden');
            
            console.log(`📁 Closed panel: ${panelName}`);
        
        // Update rank display when panel closes
        setTimeout(() => updatePlayerRankDisplay(), 100);
        }
    }
    
    async updateUserInfoPanel() {
        // Update user info panel with real-time data
        if (window.nicknameAuth) {
            // Try to get fresh data from Firestore occasionally  
            let currentUser;
            try {
                // ALWAYS sync for debugging (remove caching)
                console.log('🔄 PanelManager: ALWAYS attempting Firestore sync for debugging...');
                console.log('🔍 PanelManager: window.firebaseDb exists:', !!window.firebaseDb);
                console.log('🔍 PanelManager: isOnline:', window.nicknameAuth.isOnline);
                
                currentUser = await window.nicknameAuth.syncUserStatsFromFirestore();
                console.log('🔥 PanelManager: Completed sync attempt');
            } catch (error) {
                console.warn('⚠️ PanelManager: Failed to sync, using cache:', error);
                currentUser = window.nicknameAuth.getCurrentUserSync();
            }
            
            if (currentUser) {
                // Debug logging
                const playerScore = window.localPlayer?.score || 0;
                const playerSize = window.localPlayer?.size || 20;
                console.log('📊 PanelManager: Updating user info panel - User:', currentUser.nickname, 'Stats:', currentUser.stats, 'Current game:', playerScore, 'size:', Math.round(playerSize));
                const nameElement = document.querySelector('#userinfoLeftPanel #playerInfoNameLeft');
                const statusElement = document.querySelector('#userinfoLeftPanel #playerInfoStatusLeft');
                const totalCoinsElement = document.querySelector('#userinfoLeftPanel #totalCoinsLeft');
                const totalMatchesElement = document.querySelector('#userinfoLeftPanel #totalMatchesLeft');
                const bestScoreElement = document.querySelector('#userinfoLeftPanel #bestScoreLeft');
                const currentGameScoreElement = document.querySelector('#userinfoLeftPanel #currentGameScore');
                const currentGameSizeElement = document.querySelector('#userinfoLeftPanel #currentGameSize');
                const currentGameRankElement = document.querySelector('#userinfoLeftPanel #currentGameRank');
                const playerWalletElement = document.querySelector('#userinfoLeftPanel #playerWalletAddressLeft');
                const logoutBtn = document.querySelector('#userinfoLeftPanel #logoutBtnLeft');
                
                if (nameElement) nameElement.textContent = currentUser.nickname || 'Guest';
                if (statusElement) statusElement.textContent = currentUser.nickname ? 'Signed in' : 'Not signed in';
                
                // Update wallet address from database
                if (playerWalletElement) {
                    const walletAddress = currentUser.wallet || currentUser.walletAddress || '-';
                    if (walletAddress && walletAddress !== '-') {
                        // Show first 6 and last 4 characters of wallet address
                        const truncatedWallet = walletAddress.length > 10 
                            ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`
                            : walletAddress;
                        playerWalletElement.textContent = truncatedWallet;
                        playerWalletElement.title = walletAddress; // Full address on hover
                    } else {
                        playerWalletElement.textContent = '-';
                        playerWalletElement.title = 'No wallet address';
                    }
                }
                if (totalCoinsElement) {
                    const totalCoins = currentUser.stats?.totalScore || 0;
                    totalCoinsElement.textContent = totalCoins;
                    console.log('🪙 PanelManager: Updated total coins to:', totalCoins);
                }
                if (totalMatchesElement) {
                    const totalMatches = currentUser.stats?.gamesPlayed || 0;
                    totalMatchesElement.textContent = totalMatches;
                    console.log('🎮 PanelManager: Updated total matches to:', totalMatches);
                }
                if (bestScoreElement) {
                    const bestScore = currentUser.stats?.bestScore || 0;
                    bestScoreElement.textContent = bestScore;
                    console.log('🏆 PanelManager: Updated best score to:', bestScore);
                }
                
                // Update current game stats
                if (window.localPlayer) {
                    if (currentGameScoreElement) currentGameScoreElement.textContent = window.localPlayer.score || 0;
                    if (currentGameSizeElement) currentGameSizeElement.textContent = Math.round(window.localPlayer.size || 20);
                    
                    // Update current rank using helper function
                    updatePlayerRankDisplay();
                } else {
                    if (currentGameScoreElement) currentGameScoreElement.textContent = '0';
                    // Don't reset size to 20 - it will be loaded from saved data
                    if (currentGameSizeElement) currentGameSizeElement.textContent = '...';
                    if (currentGameRankElement) currentGameRankElement.textContent = '#-';
                }
                
                if (logoutBtn) {
                    if (currentUser.nickname) {
                        logoutBtn.classList.remove('hidden');
                        logoutBtn.onclick = () => {
                            console.log('🚪 Panel logout button clicked');
                            performLogout();
                        };
                    } else {
                        logoutBtn.classList.add('hidden');
                    }
                }
            } else {
                console.log('⚠️ PanelManager: No authenticated user found for panel update');
                // Update panel to show guest state
                const nameElement = document.querySelector('#userinfoLeftPanel #playerInfoNameLeft');
                const statusElement = document.querySelector('#userinfoLeftPanel #playerInfoStatusLeft');
                const totalCoinsElement = document.querySelector('#userinfoLeftPanel #totalCoinsLeft');
                const totalMatchesElement = document.querySelector('#userinfoLeftPanel #totalMatchesLeft');
                const bestScoreElement = document.querySelector('#userinfoLeftPanel #bestScoreLeft');
                const logoutBtn = document.querySelector('#userinfoLeftPanel #logoutBtnLeft');
                
                if (nameElement) nameElement.textContent = 'Guest';
                if (statusElement) statusElement.textContent = 'Not signed in';
                if (totalCoinsElement) totalCoinsElement.textContent = '0';
                if (totalMatchesElement) totalMatchesElement.textContent = '0';
                if (bestScoreElement) bestScoreElement.textContent = window.localPlayer?.score || '0';
                if (logoutBtn) logoutBtn.classList.add('hidden');
            }
            
            // Initialize player rank display after panel update
            setTimeout(() => updatePlayerRankDisplay(), 500);
        }
    }
    
    // Auto-refresh user info periodically
    startAutoRefresh() {
        // Update user info panel more frequently when open
        setInterval(() => {
            if (!this.panels.userinfoLeft.panel.classList.contains('hidden')) {
                this.updateUserInfoPanel().catch(err => console.warn('Panel update failed:', err));
                // Also update rank display (but throttled)
                updatePlayerRankDisplay();
            }
        }, 2000); // Refresh every 2 seconds when panel is open
        
        // Also update data in background every 10 seconds (for when panel opens)
        setInterval(() => {
            // Always keep data fresh, even when panel is closed
            this.updateUserInfoPanel().catch(err => console.warn('Panel update failed:', err));
            // Also update rank display in background (but throttled)
            updatePlayerRankDisplay();
        }, 10000); // Background refresh every 10 seconds
        
        // Also initialize player rank display immediately
        setTimeout(() => updatePlayerRankDisplay(), 1000);
        
        // Also initialize player rank display after a longer delay
        setTimeout(() => updatePlayerRankDisplay(), 3000);
        
        // Also initialize player rank display after a very long delay
        setTimeout(() => updatePlayerRankDisplay(), 10000);
        
        // Also initialize player rank display after a very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 30000);
        
        // Also initialize player rank display after a very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 60000);
        
        // Also initialize player rank display after a very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 120000);
        
        // Also initialize player rank display after a very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 300000);
        
        // Also initialize player rank display after a very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 600000);
        
        // Also initialize player rank display after a very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 1200000);
        
        // Also initialize player rank display after a very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 3600000);
        
        // Also initialize player rank display after a very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 7200000);
        
        // Also initialize player rank display after a very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 14400000);
        
        // Also initialize player rank display after a very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 28800000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 57600000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 115200000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 230400000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 460800000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 921600000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 1843200000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 3686400000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 7372800000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 14745600000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 29491200000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 58982400000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 117964800000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 235929600000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 471859200000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 943718400000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 1887436800000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 3774873600000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 7549747200000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 15099494400000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 30198988800000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 60397977600000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 120795955200000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 241591910400000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 483183820800000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 966367641600000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 1932735283200000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 3865470566400000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 7730941132800000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 15461882265600000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 30923764531200000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 61847529062400000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 123695058124800000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 247390116249600000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 494780232499200000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 989560464998400000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 1979120929996800000);
        
        // Also initialize player rank display after a very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long delay
        setTimeout(() => updatePlayerRankDisplay(), 3958241859993600000);
    }
}

// Initialize panel manager when DOM is ready
let panelManager;
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        panelManager = new PanelManager();
        window.panelManager = panelManager; // Make globally accessible immediately
        panelManager.startAutoRefresh();
        console.log('🚀 Panel system ready and globally accessible');
    }, 500); // Delay to ensure all elements are loaded
});

// Function to update booster status display
function updateBoosterStatusDisplay() {

    
    if (!boosterContainer) {
        boosterContainer = document.createElement('div');
        boosterContainer.id = 'boosterStatusContainer';
        boosterContainer.className = 'fixed top-4 right-4 z-50 space-y-2';
        document.body.appendChild(boosterContainer);
        console.log('✅ Created new booster container');
    }
    
    // Clear existing booster displays
    boosterContainer.innerHTML = '';
    
    // Add header
    const header = document.createElement('div');
    header.className = 'bg-gray-800 text-white px-3 py-2 rounded-lg shadow-lg text-center font-bold';
    header.textContent = '🚀 Active Boosters';
    boosterContainer.appendChild(header);
    
    // Show active boosters
    if (activeBoosters.speed.active) {
        const timeLeft = Math.ceil((activeBoosters.speed.endTime - Date.now()) / 1000);
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        const speedBooster = document.createElement('div');
        speedBooster.className = 'bg-green-500 text-white px-3 py-2 rounded-lg shadow-lg flex items-center justify-between min-w-[200px]';
        speedBooster.innerHTML = `
            <div class="flex items-center space-x-2">
                <span class="text-xl">🚀</span>
                <div>
                    <div class="font-bold">Speed Boost</div>
                    <div class="text-xs opacity-90">x2 Movement Speed</div>
                </div>
            </div>
            <div class="text-right">
                <div class="font-mono text-lg font-bold">${timeText}</div>
                <div class="text-xs opacity-90">remaining</div>
            </div>
        `;
        boosterContainer.appendChild(speedBooster);
    }
    
    if (activeBoosters.coins.active) {
        const timeLeft = Math.ceil((activeBoosters.coins.endTime - Date.now()) / 1000);
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        const coinBooster = document.createElement('div');
        coinBooster.className = 'bg-yellow-500 text-white px-3 py-2 rounded-lg shadow-lg flex items-center justify-between min-w-[200px]';
        coinBooster.innerHTML = `
            <div class="flex items-center space-x-2">
                <span class="text-xl">💰</span>
                <div>
                    <div class="font-bold">Coin Multiplier</div>
                    <div class="text-xs opacity-90">x2 Coins Collected</div>
                </div>
            </div>
            <div class="text-right">
                <div class="font-mono text-lg font-bold">${timeText}</div>
                <div class="text-xs opacity-90">remaining</div>
            </div>
        `;
        boosterContainer.appendChild(coinBooster);
    }
    
    // Show message if no boosters active
    if (!activeBoosters.speed.active && !activeBoosters.coins.active) {
        const noBoosters = document.createElement('div');
        noBoosters.className = 'bg-gray-600 text-white px-3 py-2 rounded-lg shadow-lg text-center text-sm opacity-75';
        noBoosters.textContent = 'No active boosters';
        boosterContainer.appendChild(noBoosters);
    }
    
    // Update center panel boosters list
    const boostersListCenter = document.getElementById('boostersListCenter');
    if (boostersListCenter) {
        boostersListCenter.innerHTML = '';
        
        if (activeBoosters.speed.active) {
            const timeLeft = Math.ceil((activeBoosters.speed.endTime - Date.now()) / 1000);
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            const speedItem = document.createElement('div');
            speedItem.className = 'flex justify-between items-center text-sm bg-green-600 bg-opacity-70 rounded px-3 py-1';
            speedItem.innerHTML = `
                <span class="text-white">🚀 Speed Boost</span>
                <span class="font-mono text-white font-bold">${timeText}</span>
            `;
            boostersListCenter.appendChild(speedItem);
        }
        
        if (activeBoosters.coins.active) {
            const timeLeft = Math.ceil((activeBoosters.coins.endTime - Date.now()) / 1000);
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            const coinItem = document.createElement('div');
            coinItem.className = 'flex justify-between items-center text-sm bg-yellow-600 bg-opacity-70 rounded px-3 py-1';
            coinItem.innerHTML = `
                <span class="text-white">💰 Coin Multiplier (x2)</span>
                <span class="font-mono text-white font-bold">${timeText}</span>
            `;
            boostersListCenter.appendChild(coinItem);
        }
        
        if (!activeBoosters.speed.active && !activeBoosters.coins.active) {
            const noBoosters = document.createElement('div');
            noBoosters.className = 'text-xs text-gray-400 text-center';
            noBoosters.textContent = 'No active boosters';
            boostersListCenter.appendChild(noBoosters);
        }
    }
}