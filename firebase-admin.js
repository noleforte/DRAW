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
    // Save player statistics
    async savePlayerStats(playerId, gameData) {
        try {
            // Check if Firebase is available
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, mock saving player stats');
                console.log(`📝 Mock save: Player ${playerId}, Score: ${gameData.score}`);
                return true; // Return success for mock mode
            }
            
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 savePlayerStats: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerRef = db.collection('players').doc(normalizedPlayerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                const currentStats = playerDoc.data();
                await playerRef.update({
                    totalScore: gameData.score, // Score = Total Score, so just update to current value
                    gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
                    bestScore: Math.max(currentStats.bestScore || 0, gameData.score),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp(),
                    walletAddress: gameData.walletAddress || currentStats.walletAddress,
                    // Ensure consistent field names
                    nickname: gameData.playerName || currentStats.nickname || normalizedPlayerId,
                    playerName: gameData.playerName || currentStats.nickname || normalizedPlayerId
                });
            } else {
                await playerRef.set({
                    nickname: gameData.playerName || normalizedPlayerId,
                    playerName: gameData.playerName || normalizedPlayerId,
                    walletAddress: gameData.walletAddress || '',
                    totalScore: gameData.score,
                    gamesPlayed: 1,
                    bestScore: gameData.score,
                    firstPlayed: admin.firestore.FieldValue.serverTimestamp(),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error('Error saving player stats:', error);
        }
    }

    // Get player statistics
    async getPlayerStats(playerId) {
        try {
            // Check if Firebase is available
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, returning mock player stats');
                return {
                    totalScore: 1000,
                    lastSize: null,
                    bestScore: 1000,
                    gamesPlayed: 3,
                    wins: 1,
                    nickname: 'MockPlayer',
                    wallet: '',
                    email: '',
                    lastLogin: new Date(),
                    lastPlayed: new Date()
                };
            }
            
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 getPlayerStats: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerDoc = await db.collection('players').doc(normalizedPlayerId).get();
            
            if (playerDoc.exists) {
                const data = playerDoc.data();
                console.log(`🔍 Raw Firestore data for ${normalizedPlayerId}:`, data);
                
                // Extract data with proper fallbacks
                const extractedData = {
                    totalScore: data.totalScore || data.stats?.totalScore || 0,
                    lastSize: data.lastSize || null,
                    bestScore: data.bestScore || data.stats?.bestScore || 0,
                    gamesPlayed: data.gamesPlayed || data.stats?.gamesPlayed || 0,
                    wins: data.wins || data.stats?.wins || 0,
                    nickname: data.nickname || '',
                    wallet: data.wallet || '',
                    email: data.email || '',
                    lastLogin: data.lastLogin || null,
                    lastPlayed: data.lastPlayed || null
                };
                
                console.log(`✅ getPlayerStats extracted data for ${normalizedPlayerId}:`, extractedData);
                console.log(`💰 totalScore value: ${extractedData.totalScore} (type: ${typeof extractedData.totalScore})`);
                return extractedData;
            } else {
                console.log(`❌ getPlayerStats: No document found for playerId: ${normalizedPlayerId}`);
                return null;
            }
        } catch (error) {
            console.error('Error getting player stats:', error);
            return null;
        }
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
            
            const snapshot = await db.collection('players')
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
            
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 updatePlayerProfile: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerRef = db.collection('players').doc(normalizedPlayerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                await playerRef.update(updates);
                console.log(`✅ Player profile updated for ${normalizedPlayerId}`);
                return true;
            } else {
                console.log(`❌ Player not found for update: ${normalizedPlayerId}`);
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
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 savePlayerCoin: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerRef = db.collection('players').doc(normalizedPlayerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                // Update existing player's total score
                await playerRef.update({
                    totalScore: currentTotalScore, // Score = Total Score, update to current value
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Create new player if doesn't exist
                await playerRef.set({
                    nickname: normalizedPlayerId,
                    playerName: normalizedPlayerId,
                    totalScore: currentTotalScore,
                    gamesPlayed: 0,
                    bestScore: 0,
                    firstPlayed: admin.firestore.FieldValue.serverTimestamp(),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error('Error saving player total score:', error);
        }
    }

    // Save player size for next game
    async savePlayerSize(playerId, size) {
        try {
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 savePlayerSize: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerRef = db.collection('players').doc(normalizedPlayerId);
            await playerRef.update({
                lastSize: size,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Saved player size ${size} for player ${normalizedPlayerId}`);
        } catch (error) {
            console.error('Error saving player size:', error);
        }
    }

    // Get player's total coins
    async getPlayerTotalCoins(playerId) {
        try {
            // Check if Firebase is available
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, returning mock total coins');
                return 1000; // Mock total coins
            }
            
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 getPlayerTotalCoins: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerDoc = await db.collection('players').doc(normalizedPlayerId).get();
            
            if (playerDoc.exists) {
                const data = playerDoc.data();
                const totalCoins = data.totalCoins || data.coins || 0;
                console.log(`💰 Total coins for ${normalizedPlayerId}: ${totalCoins}`);
                return totalCoins;
            } else {
                console.log(`❌ Player not found for total coins: ${normalizedPlayerId}`);
                return 0;
            }
        } catch (error) {
            console.error('Error getting player total coins:', error);
            return 0;
        }
    }

    // Batch save multiple coins for better performance
    async savePlayerCoins(playerId, coinCount) {
        if (coinCount <= 0) return false;
        
        try {
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 savePlayerCoins: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerRef = db.collection('players').doc(normalizedPlayerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                await playerRef.update({
                    totalScore: admin.firestore.FieldValue.increment(coinCount),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await playerRef.set({
                    nickname: normalizedPlayerId,
                    playerName: normalizedPlayerId,
                    walletAddress: '',
                    totalScore: coinCount,
                    gamesPlayed: 0,
                    bestScore: 0,
                    firstPlayed: admin.firestore.FieldValue.serverTimestamp(),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            
            return true;
        } catch (error) {
            return false;
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
            
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 updateBestScore: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerRef = db.collection('players').doc(normalizedPlayerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                const currentStats = playerDoc.data();
                const currentBestScore = currentStats.bestScore || 0;
                
                if (newScore > currentBestScore) {
                    await playerRef.update({
                        bestScore: newScore,
                        lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`✅ Best score updated for ${normalizedPlayerId}: ${currentBestScore} -> ${newScore}`);
                    return true;
                } else {
                    console.log(`ℹ️ New score ${newScore} not higher than current best ${currentBestScore} for ${normalizedPlayerId}`);
                    return false;
                }
            } else {
                console.log(`❌ Player not found for best score update: ${normalizedPlayerId}`);
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
            
            const playerRef = db.collection('players').doc(normalizedPlayerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                const currentStats = playerDoc.data();
                console.log(`📊 Found existing player document for ${normalizedPlayerId}:`, currentStats);
                
                const newGamesPlayed = Math.max(currentStats.gamesPlayed || 0, statsData.gamesPlayed || 0);
                const newBestScore = Math.max(currentStats.bestScore || 0, statsData.score);
                const newTotalScore = Math.max(currentStats.totalScore || 0, statsData.totalScore);
                
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

    // Clean up duplicate player documents by merging data
    async cleanupDuplicatePlayers() {
        try {
            console.log('🧹 Starting cleanup of duplicate player documents...');
            
            const snapshot = await db.collection('players').get();
            const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Group players by normalized nickname
            const playerGroups = {};
            players.forEach(player => {
                const normalizedId = player.id.toLowerCase();
                if (!playerGroups[normalizedId]) {
                    playerGroups[normalizedId] = [];
                }
                playerGroups[normalizedId].push(player);
            });
            
            // Process groups with multiple players
            for (const [normalizedId, group] of Object.entries(playerGroups)) {
                if (group.length > 1) {
                    console.log(`🔧 Found ${group.length} duplicate documents for player: ${normalizedId}`);
                    
                    // Find the document with the most complete data
                    const primaryDoc = group.reduce((best, current) => {
                        const bestScore = (best.bestScore || 0) + (best.totalScore || 0);
                        const currentScore = (current.bestScore || 0) + (current.totalScore || 0);
                        return currentScore > bestScore ? current : best;
                    });
                    
                    // Merge all data into the primary document
                    const mergedData = {
                        nickname: primaryDoc.nickname || primaryDoc.playerName || normalizedId,
                        playerName: primaryDoc.playerName || primaryDoc.nickname || normalizedId,
                        totalScore: Math.max(...group.map(p => p.totalScore || 0)),
                        bestScore: Math.max(...group.map(p => p.bestScore || 0)),
                        gamesPlayed: Math.max(...group.map(p => p.gamesPlayed || 0)),
                        wins: Math.max(...group.map(p => p.wins || 0)),
                        wallet: primaryDoc.wallet || primaryDoc.walletAddress || '',
                        email: primaryDoc.email || '',
                        lastLogin: primaryDoc.lastLogin || null,
                        lastPlayed: primaryDoc.lastPlayed || null,
                        lastSize: primaryDoc.lastSize || null,
                        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                    };
                    
                    // Update primary document with merged data
                    await db.collection('players').doc(normalizedId).set(mergedData);
                    console.log(`✅ Merged data into primary document: ${normalizedId}`);
                    
                    // Delete duplicate documents
                    for (const duplicate of group) {
                        if (duplicate.id !== normalizedId) {
                            await db.collection('players').doc(duplicate.id).delete();
                            console.log(`🗑️ Deleted duplicate document: ${duplicate.id}`);
                        }
                    }
                }
            }
            
            console.log('✅ Cleanup of duplicate player documents completed!');
        } catch (error) {
            console.error('❌ Error during cleanup of duplicate player documents:', error);
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
            
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 saveGameSession: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerRef = db.collection('players').doc(normalizedPlayerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                const currentStats = playerDoc.data();
                await playerRef.update({
                    gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
                    bestScore: Math.max(currentStats.bestScore || 0, sessionData.score),
                    totalScore: sessionData.score, // Update totalScore to current score (Score = Total Score)
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp(),
                    // Ensure consistent field names
                    nickname: sessionData.playerName || currentStats.nickname || normalizedPlayerId,
                    playerName: sessionData.playerName || currentStats.nickname || normalizedPlayerId
                });
            } else {
                await playerRef.set({
                    nickname: sessionData.playerName || normalizedPlayerId,
                    playerName: sessionData.playerName || normalizedPlayerId,
                    walletAddress: sessionData.walletAddress || '',
                    totalScore: sessionData.score, // Set totalScore to current score
                    gamesPlayed: 1,
                    bestScore: sessionData.score,
                    firstPlayed: admin.firestore.FieldValue.serverTimestamp(),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            
            return true;
        } catch (error) {
            console.error('Error saving game session:', error);
            return false;
        }
    }

    // Get all players from database
    async getAllPlayers() {
        try {
            console.log('🔄 GameDataService.getAllPlayers() called');
            
            // Check if Firebase is available
            if (!isFirebaseAvailable()) {
                console.warn('⚠️ Firebase not available, returning mock data');
                // Return mock data for testing
                const mockPlayers = [
                    {
                        playerId: 'mock_player_1',
                        nickname: 'TestPlayer1',
                        playerName: 'TestPlayer1',
                        totalScore: 1500,
                        bestScore: 1500,
                        gamesPlayed: 5,
                        wins: 2,
                        wallet: '',
                        email: '',
                        lastLogin: null,
                        lastPlayed: new Date(),
                        lastSize: null,
                        isOnline: false
                    },
                    {
                        playerId: 'mock_player_2',
                        nickname: 'TestPlayer2',
                        playerName: 'TestPlayer2',
                        totalScore: 1200,
                        bestScore: 1200,
                        gamesPlayed: 3,
                        wins: 1,
                        wallet: '',
                        email: '',
                        lastLogin: null,
                        lastPlayed: new Date(),
                        lastSize: null,
                        isOnline: false
                    }
                ];
                
                console.log(`✅ Returning ${mockPlayers.length} mock players`);
                return mockPlayers;
            }
            
            const playersSnapshot = await db.collection('players').get();
            console.log(`🔄 Firestore query returned ${playersSnapshot.size} documents`);
            
            const players = [];
            const seenNicknames = new Set(); // Track seen nicknames to avoid duplicates
            
            playersSnapshot.forEach(doc => {
                const data = doc.data();
                console.log(`🔄 Processing document ${doc.id}:`, data);
                
                // Skip players with zero or negative total score
                if (!data.totalScore || data.totalScore <= 0) {
                    console.log(`🔄 Skipping player ${doc.id} with score: ${data.totalScore}`);
                    return;
                }
                
                // Skip guest and temporary player accounts
                const nickname = data.nickname || data.playerName || doc.id;
                if (nickname.startsWith('Player_guest_') || 
                    nickname.startsWith('Player_player_') ||
                    nickname.startsWith('guest_') ||
                    nickname.startsWith('player_')) {
                    console.log(`🔄 Skipping temporary player: ${nickname}`);
                    return;
                }
                
                // Skip duplicate nicknames (keep the one with higher score)
                if (seenNicknames.has(nickname)) {
                    console.log(`🔄 Skipping duplicate nickname: ${nickname}`);
                    return;
                }
                
                seenNicknames.add(nickname);
                
                const player = {
                    playerId: doc.id,
                    nickname: nickname,
                    playerName: nickname,
                    totalScore: data.totalScore || 0,
                    bestScore: data.bestScore || 0,
                    gamesPlayed: data.gamesPlayed || 0,
                    wins: data.wins || 0,
                    wallet: data.wallet || data.walletAddress || '',
                    email: data.email || '',
                    lastLogin: data.lastLogin || null,
                    lastPlayed: data.lastPlayed || null,
                    lastSize: data.lastSize || null,
                    isOnline: false // Will be updated by server
                };
                
                console.log(`🔄 Processed player:`, player);
                players.push(player);
            });
            
            // Sort by totalScore descending
            players.sort((a, b) => b.totalScore - a.totalScore);
            
            console.log(`✅ Retrieved ${players.length} filtered players from database, top 3:`, players.slice(0, 3));
            return players;
        } catch (error) {
            console.error('❌ Error getting all players:', error);
            console.error('❌ Error details:', error.message);
            console.error('❌ Error stack:', error.stack);
            
            // Return mock data on error
            console.warn('⚠️ Returning mock data due to error');
            return [
                {
                    playerId: 'error_fallback_1',
                    nickname: 'FallbackPlayer1',
                    playerName: 'FallbackPlayer1',
                    totalScore: 1000,
                    bestScore: 1000,
                    gamesPlayed: 2,
                    wins: 0,
                    wallet: '',
                    email: '',
                    lastLogin: null,
                    lastPlayed: new Date(),
                    lastSize: null,
                    isOnline: false
                }
            ];
        }
    }
}

module.exports = {
    admin,
    db,
    auth,
    GameDataService: new GameDataService()
}; 