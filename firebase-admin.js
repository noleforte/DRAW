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
            const playerDoc = await db.collection('players').doc(playerId).get();
            return playerDoc.exists ? playerDoc.data() : null;
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
}

module.exports = {
    admin,
    db,
    auth,
    GameDataService: new GameDataService()
}; 