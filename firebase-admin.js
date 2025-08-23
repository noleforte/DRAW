const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    try {
    const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
    };

        // Check if required environment variables are set
        if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY) {
            console.warn('⚠️ Firebase environment variables not set, using mock mode');
            console.warn('⚠️ Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, etc. for full functionality');
        }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID
    });
        
        console.log('✅ Firebase Admin SDK initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin SDK:', error);
        console.warn('⚠️ Server will run in mock mode without database functionality');
    }
}

const db = admin.firestore();
const auth = admin.auth();

// Check if Firebase is available
const isFirebaseAvailable = () => {
    try {
        return admin.apps.length > 0 && db && auth;
    } catch (error) {
        return false;
    }
};

// Game data service
class GameDataService {
    // DEPRECATED: Save player statistics (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    async savePlayerStats(playerId, gameData) {
        console.warn('⚠️ savePlayerStats is deprecated. Use the new users collection instead.');
        return false; // Return false to indicate this method is deprecated
    }

    // DEPRECATED: Save player game data (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    async savePlayerGameData(playerId, gameData, nickname, email, walletAddress = '') {
        console.warn('⚠️ savePlayerGameData is deprecated. Use the new users collection instead.');
        return false; // Return false to indicate this method is deprecated
    }

    // DEPRECATED: Get player stats (old system)
    // This method is deprecated and will be removed in favor  of the new users collection
    async getPlayerStats(playerId) {
        console.warn('⚠️ getPlayerStats is deprecated. Use the new users collection instead.');
        return null; // Return null to indicate this method is deprecated
    }

    // DEPRECATED: Save player size (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    async savePlayerSize(playerId, size) {
        console.warn('⚠️ savePlayerSize is deprecated. Use the new users collection instead.');
        return false; // Return false to indicate this method is deprecated
    }

    // DEPRECATED: Save player coins (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    async savePlayerCoins(playerId, coinCount) {
        console.warn('⚠️ savePlayerCoins is deprecated. Use the new users collection instead.');
        return false; // Return false to indicate this method is deprecated
    }

    // DEPRECATED: Cleanup duplicate players (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    async cleanupDuplicatePlayers() {
        console.warn('⚠️ cleanupDuplicatePlayers is deprecated. Use the new users collection instead.');
        return false; // Return false to indicate this method is deprecated
    }

    // DEPRECATED: Get all players (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    async getAllPlayers() {
        console.warn('⚠️ getAllPlayers is deprecated. Use the new users collection instead.');
        return []; // Return empty array to indicate this method is deprecated
    }

    // DEPRECATED: Cleanup duplicate player documents by wallet (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    async cleanupDuplicatePlayerDocumentsByWallet() {
        console.warn('⚠️ cleanupDuplicatePlayerDocumentsByWallet is deprecated. Use the new users collection instead.');
        return false; // Return false to indicate this method is deprecated
    }

    // DEPRECATED: Find player by nickname (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    async findPlayerByNickname(nickname) {
        console.warn('⚠️ findPlayerByNickname is deprecated. Use the new users collection instead.');
        return null; // Return null to indicate this method is deprecated
    }

    // DEPRECATED: Find player by wallet (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    async findPlayerByWallet(walletAddress) {
        console.warn('⚠️ findPlayerByWallet is deprecated. Use the new users collection instead.');
        return null; // Return null to indicate this method is deprecated
    }

    // DEPRECATED: Find player by email (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    async findPlayerByEmail(email) {
        console.warn('⚠️ findPlayerByEmail is deprecated. Use the new users collection instead.');
        return null; // Return null to indicate this method is deprecated
    }

    // DEPRECATED: Find player by password hash (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    async findPlayerByPasswordHash(passwordHash) {
        console.warn('⚠️ findPlayerByPasswordHash is deprecated. Use the new users collection instead.');
        return null; // Return null to indicate this method is deprecated
    }

    // DEPRECATED: Normalize player ID (old system)
    // This method is deprecated and will be removed in favor of the new users collection
    normalizePlayerId(playerId) {
        console.warn('⚠️ normalizePlayerId is deprecated. Use the new users collection instead.');
        return playerId; // Return as-is to avoid breaking existing code
    }

    // Save match results
    async saveMatchResult(matchData) {
        try {
            // Check if Firebase is available
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, mock saving match result');
                console.log(`📝 Mock save match: ${matchData.players?.length || 0} players, Winner: ${matchData.winner?.name || 'Unknown'}`);
                return true; // Return success for mock mode
            }
            
            // Normalize playerId in matchData if it exists
            if (matchData.playerId) {
                matchData.playerId = matchData.playerId.toLowerCase();
            }
            
            await db.collection('matches').add({
                ...matchData,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error saving match result:', error);
        }
    }

    // Get global leaderboard
    async getGlobalLeaderboard(limit = 10) {
        try {
            // Check if Firebase is available
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, returning mock global leaderboard');
                const mockLeaderboard = [
                    {
                        id: 'mock_1',
                        nickname: 'TopPlayer1',
                        playerName: 'TopPlayer1',
                        totalScore: 2000,
                        bestScore: 2000,
                        gamesPlayed: 10,
                        wins: 5
                    },
                    {
                        id: 'mock_2',
                        nickname: 'TopPlayer2',
                        playerName: 'TopPlayer2',
                        totalScore: 1800,
                        bestScore: 1800,
                        gamesPlayed: 8,
                        wins: 4
                    }
                ];
                return mockLeaderboard.slice(0, limit);
            }
            
            const snapshot = await db.collection('users')
                .orderBy('bestScore', 'desc')
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                // Ensure consistent field names for display
                nickname: doc.data().nickname || doc.data().playerName || doc.id,
                playerName: doc.data().playerName || doc.data().nickname || doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error getting global leaderboard:', error);
            return [];
        }
    }

    // Update player profile
    async updatePlayerProfile(playerId, updates) {
        try {
            // Check if Firebase is available
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, mock updating player profile');
                console.log(`📝 Mock update: Player ${playerId}, Updates:`, updates);
                return true; // Return success for mock mode
            }
            
            console.log(`🔧 updatePlayerProfile: Looking for player with nickname: "${playerId}"`);
            
            // Find user by nickname in the users collection
            const usersSnapshot = await db.collection('users')
                .where('nickname', '==', playerId)
                .limit(1)
                .get();
            
            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];
                await userDoc.ref.update(updates);
                console.log(`✅ Player profile updated for user ${userDoc.id} (${playerId})`);
                return true;
            } else {
                console.log(`❌ Player not found for update: ${playerId}`);
                return false;
            }
        } catch (error) {
            console.error('Error updating player profile:', error);
            return false;
        }
    }

    // Save player's current total score (Score = Total Score)
    async savePlayerCoin(playerId, currentTotalScore) {
        try {
            console.log(`🔧 savePlayerCoin: Looking for player with nickname: "${playerId}"`);
            
            // Find user by nickname in the users collection
            const usersSnapshot = await db.collection('users')
                .where('nickname', '==', playerId)
                .limit(1)
                .get();
            
            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];
                const userData = userDoc.data();
                
                // Update existing user's stats
                const currentStats = userData.stats || {};
                const updatedStats = {
                    ...currentStats,
                    totalScore: currentTotalScore
                };
                
                await userDoc.ref.update({
                    stats: updatedStats,
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
                
                console.log(`✅ Player total score updated for user ${userDoc.id} (${playerId}): ${currentTotalScore}`);
            } else {
                console.log(`❌ User not found for coin save: ${playerId}`);
            }
        } catch (error) {
            console.error('Error saving player total score:', error);
        }
    }

    // Update player's best score
    async updateBestScore(playerId, newScore) {
        try {
            // Check if Firebase is available
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, mock updating best score');
                console.log(`📝 Mock update best score: Player ${playerId}, Score: ${newScore}`);
                return true; // Return success for mock mode
            }
            
            console.log(`🔧 updateBestScore: Looking for player with nickname: "${playerId}"`);
            
            // Find user by nickname in the users collection
            const usersSnapshot = await db.collection('users')
                .where('nickname', '==', playerId)
                .limit(1)
                .get();
            
            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];
                const userId = userDoc.id;
                const userData = userDoc.data();
                
                // Get current stats
                const currentStats = userData.stats || {};
                const currentBestScore = currentStats.bestScore || 0;
                
                if (newScore > currentBestScore) {
                    // Update best score in stats
                    const updatedStats = {
                        ...currentStats,
                        bestScore: newScore
                    };
                    
                    await userDoc.ref.update({
                        stats: updatedStats,
                        lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                    });
                    
                    console.log(`✅ Best score updated for user ${userId} (${playerId}): ${currentBestScore} -> ${newScore}`);
                    return true;
                } else {
                    console.log(`ℹ️ New score ${newScore} not higher than current best ${currentBestScore} for user ${userId} (${playerId})`);
                    return false;
                }
            } else {
                console.log(`❌ User not found for best score update: ${playerId}`);
                return false;
            }
        } catch (error) {
            console.error('Error updating best score:', error);
            return false;
        }
    }
    
    // Update player's full stats (score, totalScore, gamesPlayed)
    async updatePlayerFullStats(playerId, statsData) {
        try {
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerRef = db.collection('users').doc(normalizedPlayerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                const currentStats = playerDoc.data();
                console.log(`📊 Found existing player document for ${normalizedPlayerId}:`, currentStats);
                console.log(`📊 Current totalScore value: root=${currentStats.totalScore}`);
                
                const newGamesPlayed = Math.max(currentStats.gamesPlayed || 0, statsData.gamesPlayed || 0);
                const newBestScore = Math.max(currentStats.bestScore || 0, statsData.score);
                const newTotalScore = Math.max(currentStats.totalScore || 0, statsData.totalScore);
                
                console.log(`📊 Updating totalScore: current=${currentStats.totalScore || 0}, new=${statsData.totalScore}, final=${newTotalScore}`);
                
                await playerRef.update({
                    totalScore: newTotalScore,
                    gamesPlayed: newGamesPlayed,
                    bestScore: newBestScore,
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp(),
                    // Ensure consistent field names
                    nickname: statsData.nickname || currentStats.nickname || normalizedPlayerId,
                    playerName: statsData.nickname || currentStats.nickname || normalizedPlayerId
                });
                console.log(`✅ Updated full stats for player ${normalizedPlayerId}: totalScore=${newTotalScore} (was ${currentStats.totalScore || 0}), gamesPlayed=${newGamesPlayed} (was ${currentStats.gamesPlayed || 0}), bestScore=${newBestScore} (was ${currentStats.bestScore || 0})`);
            } else {
                console.log(`🆕 Creating new player document with totalScore: ${statsData.totalScore}`);
                await playerRef.set({
                    nickname: statsData.nickname || normalizedPlayerId,
                    playerName: statsData.nickname || normalizedPlayerId,
                    walletAddress: '',
                    totalScore: statsData.totalScore,
                    gamesPlayed: statsData.gamesPlayed || 0,
                    bestScore: statsData.score,
                    firstPlayed: admin.firestore.FieldValue.serverTimestamp(),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`🆕 Created new player ${normalizedPlayerId} with full stats: totalScore=${statsData.totalScore}, gamesPlayed=${statsData.gamesPlayed}, bestScore=${statsData.score}`);
            }
            
            return true;
        } catch (error) {
            console.error('Error updating player full stats:', error);
            return false;
        }
    }

    // Save completed game session (only called when player finishes a session)
    async saveGameSession(playerId, sessionData) {
        try {
            // Check if Firebase is available
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, mock saving game session');
                console.log(`📝 Mock save session: Player ${playerId}, Score: ${sessionData.score}`);
                return true; // Return success for mock mode
            }
            
            console.log(`🔧 saveGameSession: Looking for player with nickname: "${playerId}"`);
            
            // Find user by nickname in the users collection
            const usersSnapshot = await db.collection('users')
                .where('nickname', '==', playerId)
                .limit(1)
                .get();
            
            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];
                const userData = userDoc.data();
                const currentStats = userData.stats || {};
                
                // Update existing user's stats
                const updatedStats = {
                    ...currentStats,
                    gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
                    bestScore: Math.max(currentStats.bestScore || 0, sessionData.score),
                    totalScore: sessionData.score
                };
                
                await userDoc.ref.update({
                    stats: updatedStats,
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
                
                console.log(`✅ Game session saved for user ${userDoc.id} (${playerId}): score=${sessionData.score}`);
            } else {
                console.log(`❌ User not found for game session save: ${playerId}`);
            }
            
            return true;
        } catch (error) {
            console.error('Error saving game session:', error);
            return false;
        }
    }

    // Authentication methods for server-side auth
    async createUser(userId, userData) {
        try {
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, mock creating user');
                console.log(`📝 Mock create user: ${userId} - ${userData.nickname}`);
                return true;
            }
            
            await db.collection('users').doc(userId).set(userData);
            console.log(`✅ User created: ${userId} - ${userData.nickname}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to create user:', error);
            throw error;
        }
    }

    async getUserById(userId) {
        try {
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, mock getting user by ID');
                return null;
            }
            
            const doc = await db.collection('users').doc(userId).get();
            if (doc.exists) {
                return doc.data();
            }
            return null;
        } catch (error) {
            console.error('❌ Failed to get user by ID:', error);
            throw error;
        }
    }

    async getUserByNickname(nickname) {
        try {
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, mock getting user by nickname');
                return null;
            }
            
            const normalizedNickname = nickname.toLowerCase().trim();
            const snapshot = await db.collection('users')
                .where('nickname', '==', normalizedNickname)
                .limit(1)
                .get();
            
            if (!snapshot.empty) {
                return snapshot.docs[0].data();
            }
            return null;
        } catch (error) {
            console.error('❌ Failed to get user by nickname:', error);
            throw error;
        }
    }

    async getUserByEmailOrNickname(email, nickname) {
        try {
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, mock getting user by email/nickname');
                return [];
            }
            
            const normalizedEmail = email.toLowerCase().trim();
            const normalizedNickname = nickname.toLowerCase().trim();
            
            // Search by email
            const emailSnapshot = await db.collection('users')
                .where('email', '==', normalizedEmail)
                .get();
            
            // Search by nickname
            const nicknameSnapshot = await db.collection('users')
                .where('nickname', '==', normalizedNickname)
                .get();
            
            const users = [];
            
            emailSnapshot.forEach(doc => {
                users.push(doc.data());
            });
            
            nicknameSnapshot.forEach(doc => {
                // Avoid duplicates
                if (!users.find(u => u.id === doc.data().id)) {
                    users.push(doc.data());
                }
            });
            
            return users;
        } catch (error) {
            console.error('❌ Failed to get user by email/nickname:', error);
            throw error;
        }
    }

    async updateUser(userId, updates) {
        try {
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, mock updating user');
                console.log(`📝 Mock update user: ${userId}`, updates);
                return true;
            }
            
            console.log(`🔧 Attempting to update user ${userId} with:`, updates);
            
            // First check if document exists
            const docRef = db.collection('users').doc(userId);
            const doc = await docRef.get();
            
            if (!doc.exists) {
                console.error(`❌ User document not found: ${userId}`);
                throw new Error(`User document not found: ${userId}`);
            }
            
            console.log(`✅ User document found, updating...`);
            
            await docRef.update({
                ...updates,
                lastUpdated: Date.now()
            });
            
            console.log(`✅ User updated successfully: ${userId}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to update user:', error);
            console.error('❌ Error details:', {
                userId,
                errorCode: error.code,
                errorMessage: error.message,
                errorDetails: error.details
            });
            throw error;
        }
    }

    async updateUserLastLogin(userId) {
        try {
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, mock updating user last login');
                return true;
            }
            
            await db.collection('users').doc(userId).update({
                lastLogin: Date.now()
            });
            
            console.log(`✅ User last login updated: ${userId}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to update user last login:', error);
            throw error;
        }
    }

    // Get all users from the users collection
    async getAllUsers() {
        try {
            // Check if Firebase is available
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, returning mock users data');
                const mockUsers = [
                    {
                        playerId: 'mock_1',
                        nickname: 'TestPlayer1',
                        playerName: 'TestPlayer1',
                        totalScore: 1500,
                        gamesPlayed: 5,
                        wins: 2,
                        email: 'test1@example.com',
                        lastPlayed: new Date().toISOString()
                    },
                    {
                        playerId: 'mock_2',
                        nickname: 'TestPlayer2',
                        playerName: 'TestPlayer2',
                        totalScore: 1200,
                        gamesPlayed: 3,
                        wins: 1,
                        email: 'test2@example.com',
                        lastPlayed: new Date().toISOString()
                    }
                ];
                return mockUsers;
            }
            
            const snapshot = await db.collection('users').get();
            return snapshot.docs.map(doc => {
                const userData = doc.data();
                return {
                    playerId: doc.id,
                    nickname: userData.nickname || userData.playerName || doc.id,
                    playerName: userData.playerName || userData.nickname || doc.id,
                    totalScore: userData.stats?.totalScore || userData.totalScore || 0,
                    gamesPlayed: userData.stats?.gamesPlayed || userData.gamesPlayed || 0,
                    wins: userData.stats?.wins || userData.wins || 0,
                    email: userData.email || '',
                    lastPlayed: userData.lastPlayed || userData.lastLogin || null
                };
            });
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    }
}

// Create instance first
const gameDataServiceInstance = new GameDataService();

module.exports = {
    admin,
    db,
    auth,
    GameDataService: gameDataServiceInstance,
    findPlayerByPasswordHash: gameDataServiceInstance.findPlayerByPasswordHash.bind(gameDataServiceInstance),
    updateUser: gameDataServiceInstance.updateUser.bind(gameDataServiceInstance),
    updateUserLastLogin: gameDataServiceInstance.updateUserLastLogin.bind(gameDataServiceInstance),
    getAllUsers: gameDataServiceInstance.getAllUsers.bind(gameDataServiceInstance)
}; 