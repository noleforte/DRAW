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
            const playerRef = db.collection('players').doc(playerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                const currentStats = playerDoc.data();
                await playerRef.update({
                    totalScore: (currentStats.totalScore || 0) + gameData.score,
                    gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
                    bestScore: Math.max(currentStats.bestScore || 0, gameData.score),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp(),
                    walletAddress: gameData.walletAddress || currentStats.walletAddress
                });
            } else {
                await playerRef.set({
                    playerName: gameData.playerName,
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
            console.log(`🔍 getPlayerStats called for playerId: ${playerId}`);
            const playerDoc = await db.collection('players').doc(playerId).get();
            
            if (playerDoc.exists) {
                const data = playerDoc.data();
                
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
                
                console.log(`✅ getPlayerStats found data for ${playerId}:`, extractedData);
                return extractedData;
            } else {
                console.log(`❌ getPlayerStats: No document found for playerId: ${playerId}`);
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
            await db.collection('players').doc(playerId).update({
                ...updates,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Error updating player profile:', error);
        }
    }

    // Save single coin to player's total (real-time)
    async savePlayerCoin(playerId, coinValue = 1) {
        try {
            const playerRef = db.collection('players').doc(playerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                // Update existing player's total coins
                await playerRef.update({
                    totalScore: admin.firestore.FieldValue.increment(coinValue),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Create new player if doesn't exist
                await playerRef.set({
                    playerName: `Player_${playerId}`,
                    totalScore: coinValue,
                    gamesPlayed: 0,
                    bestScore: 0,
                    firstPlayed: admin.firestore.FieldValue.serverTimestamp(),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error('Error saving player coin:', error);
        }
    }

    // Save player size for next game
    async savePlayerSize(playerId, size) {
        try {
            const playerRef = db.collection('players').doc(playerId);
            await playerRef.update({
                lastSize: size,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Saved player size ${size} for player ${playerId}`);
        } catch (error) {
            console.error('Error saving player size:', error);
        }
    }

    // Get player's current total coins
    async getPlayerTotalCoins(playerId) {
        try {
            const playerDoc = await db.collection('players').doc(playerId).get();
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
            const playerRef = db.collection('players').doc(playerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                await playerRef.update({
                    totalScore: admin.firestore.FieldValue.increment(coinCount),
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await playerRef.set({
                    playerName: `Player_${playerId}`,
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
            const playerRef = db.collection('players').doc(playerId);
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
                    playerName: `Player_${playerId}`,
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

    // Save completed game session (only called when player finishes a session)
    async saveGameSession(playerId, sessionData) {
        try {
            const playerRef = db.collection('players').doc(playerId);
            const playerDoc = await playerRef.get();
            
            if (playerDoc.exists) {
                const currentStats = playerDoc.data();
                await playerRef.update({
                    gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
                    bestScore: Math.max(currentStats.bestScore || 0, sessionData.score),
                    totalScore: admin.firestore.FieldValue.increment(sessionData.score), // Add score to totalScore
                    lastPlayed: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                await playerRef.set({
                    playerName: sessionData.playerName,
                    walletAddress: sessionData.walletAddress || '',
                    totalScore: sessionData.score, // Set initial totalScore to session score
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
}

module.exports = {
    admin,
    db,
    auth,
    GameDataService: new GameDataService()
}; 