const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
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

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID
    });
}

const db = admin.firestore();
const auth = admin.auth();

// Game data service
class GameDataService {
    // Save player statistics
    async savePlayerStats(playerId, gameData) {
        try {
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
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 updatePlayerProfile: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            await db.collection('players').doc(normalizedPlayerId).update({
                ...updates,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error updating player profile:', error);
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

    // Get player's current total coins
    async getPlayerTotalCoins(playerId) {
        try {
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 getPlayerTotalCoins: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerDoc = await db.collection('players').doc(normalizedPlayerId).get();
            if (playerDoc.exists) {
                const data = playerDoc.data();
                return data.totalScore || 0;
            }
            return 0;
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

    // Update player's best score if current score is higher
    async updateBestScore(playerId, currentScore) {
        try {
            // Normalize playerId to lowercase to avoid duplicate documents
            const normalizedPlayerId = playerId.toLowerCase();
            console.log(`🔧 updateBestScore: Normalizing playerId: "${playerId}" -> "${normalizedPlayerId}"`);
            
            const playerRef = db.collection('players').doc(normalizedPlayerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                const currentStats = playerDoc.data();
                const currentBest = currentStats.bestScore || 0;
                
                if (currentScore > currentBest) {
                    await playerRef.update({
                        bestScore: currentScore,
                        lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                    });
                    return true;
                }
            } else {
                // Create new player if doesn't exist
                await playerRef.set({
                    nickname: normalizedPlayerId,
                    playerName: normalizedPlayerId,
                    walletAddress: '',
                    totalScore: 0,
                    gamesPlayed: 0,
                    bestScore: currentScore,
                    firstPlayed: admin.firestore.FieldValue.serverTimestamp(),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
                return true;
            }
            
            return false; // No update needed
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
            const playersSnapshot = await db.collection('players').get();
            const players = [];
            
            playersSnapshot.forEach(doc => {
                const data = doc.data();
                players.push({
                    playerId: doc.id,
                    nickname: data.nickname || data.playerName || doc.id,
                    playerName: data.playerName || data.nickname || doc.id,
                    totalScore: data.totalScore || 0,
                    bestScore: data.bestScore || 0,
                    gamesPlayed: data.gamesPlayed || 0,
                    wins: data.wins || 0,
                    wallet: data.wallet || data.walletAddress || '',
                    email: data.email || '',
                    lastLogin: data.lastLogin || null,
                    lastPlayed: data.lastPlayed || null,
                    lastSize: data.lastSize || null
                });
            });
            
            // Sort by totalScore descending
            players.sort((a, b) => b.totalScore - a.totalScore);
            
            console.log(`✅ Retrieved ${players.length} players from database`);
            return players;
        } catch (error) {
            console.error('❌ Error getting all players:', error);
            return [];
        }
    }
}

module.exports = {
    admin,
    db,
    auth,
    GameDataService: new GameDataService()
}; 