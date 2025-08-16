// Authentication system for Royale Ball
class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.playerStats = null;
        this.init();
    }

    init() {
        // Listen for auth state changes
        firebaseAuth.onAuthStateChanged((user) => {
            this.currentUser = user;
            if (user) {
                this.loadPlayerStats();
                this.showAuthenticatedUI();
            } else {
                this.showGuestUI();
            }
        });
    }

    // Anonymous authentication for guest players
    async signInAnonymously() {
        try {
            const result = await firebaseAuth.signInAnonymously();
            console.log('Signed in anonymously:', result.user.uid);
            return result.user;
        } catch (error) {
            console.error('Anonymous sign-in failed:', error);
            throw error;
        }
    }

    // Email/password authentication
    async signInWithEmail(email, password) {
        try {
            const result = await firebaseAuth.signInWithEmailAndPassword(email, password);
            return result.user;
        } catch (error) {
            console.error('Email sign-in failed:', error);
            throw error;
        }
    }

    // Create account with email/password
    async createAccount(email, password, displayName) {
        try {
            const result = await firebaseAuth.createUserWithEmailAndPassword(email, password);
            await result.user.updateProfile({
                displayName: displayName
            });
            return result.user;
        } catch (error) {
            console.error('Account creation failed:', error);
            throw error;
        }
    }

    // Sign out
    async signOut() {
        try {
            await firebaseAuth.signOut();
            this.currentUser = null;
            this.playerStats = null;
        } catch (error) {
            console.error('Sign out failed:', error);
        }
    }

    // Load player statistics from Firestore
    async loadPlayerStats() {
        if (!this.currentUser) return;

        try {
            const doc = await firebaseDb.collection('players').doc(this.currentUser.uid).get();
            if (doc.exists) {
                this.playerStats = doc.data();
            } else {
                // Create new player document
                this.playerStats = {
                    playerName: this.currentUser.displayName || `Player${Math.floor(Math.random() * 1000)}`,
                    walletAddress: '',
                    totalScore: 0,
                    gamesPlayed: 0,
                    bestScore: 0,
                    firstPlayed: firebase.firestore.FieldValue.serverTimestamp(),
                    lastPlayed: firebase.firestore.FieldValue.serverTimestamp()
                };
                await firebaseDb.collection('players').doc(this.currentUser.uid).set(this.playerStats);
            }
        } catch (error) {
            console.error('Error loading player stats:', error);
        }
    }

    // Save game result
    async saveGameResult(score, matchData) {
        if (!this.currentUser) return;

        try {
            const playerRef = firebaseDb.collection('players').doc(this.currentUser.uid);
            const doc = await playerRef.get();
            
            if (doc.exists) {
                const currentStats = doc.data();
                await playerRef.update({
                    totalScore: (currentStats.totalScore || 0) + score,
                    gamesPlayed: (currentStats.gamesPlayed || 0) + 1,
                    bestScore: Math.max(currentStats.bestScore || 0, score),
                    lastPlayed: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // Save match result
            await firebaseDb.collection('matches').add({
                playerId: this.currentUser.uid,
                playerName: this.playerStats?.playerName || 'Unknown',
                score: score,
                ...matchData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Reload stats
            await this.loadPlayerStats();
        } catch (error) {
            console.error('Error saving game result:', error);
        }
    }

    // Update player profile
    async updateProfile(updates) {
        if (!this.currentUser) return;

        try {
            // Update Firebase Auth profile
            if (updates.displayName) {
                await this.currentUser.updateProfile({
                    displayName: updates.displayName
                });
            }

            // Update Firestore document
            await firebaseDb.collection('players').doc(this.currentUser.uid).update({
                ...updates,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Reload stats
            await this.loadPlayerStats();
        } catch (error) {
            console.error('Error updating profile:', error);
        }
    }

    // Get global leaderboard
    async getGlobalLeaderboard(limit = 10) {
        try {
            const snapshot = await firebaseDb.collection('players')
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

    // Show UI for authenticated users
    showAuthenticatedUI() {
        // Update UI to show user is logged in
        const playerNameInput = document.getElementById('playerNameInput');
        const authStatusText = document.getElementById('authStatusText');
        const signInBtn = document.getElementById('signInBtn');
        const signOutBtn = document.getElementById('signOutBtn');
        
        if (playerNameInput && this.playerStats) {
            playerNameInput.value = this.playerStats.playerName || '';
        }
        
        if (authStatusText) {
            if (this.currentUser.isAnonymous) {
                authStatusText.textContent = 'Playing as Guest';
            } else {
                authStatusText.textContent = `Logged in: ${this.currentUser.email || 'User'}`;
            }
        }
        
        if (signInBtn) signInBtn.classList.add('hidden');
        if (signOutBtn) signOutBtn.classList.remove('hidden');
    }

    // Show UI for guest users
    showGuestUI() {
        const authStatusText = document.getElementById('authStatusText');
        const signInBtn = document.getElementById('signInBtn');
        const signOutBtn = document.getElementById('signOutBtn');
        
        if (authStatusText) {
            authStatusText.textContent = 'Not signed in';
        }
        
        if (signInBtn) signInBtn.classList.remove('hidden');
        if (signOutBtn) signOutBtn.classList.add('hidden');
    }

    // Get current user ID for game
    getCurrentUserId() {
        return this.currentUser ? this.currentUser.uid : `guest_${Date.now()}_${Math.random()}`;
    }

    // Get player display name
    getDisplayName() {
        if (this.playerStats?.playerName) {
            return this.playerStats.playerName;
        }
        if (this.currentUser?.displayName) {
            return this.currentUser.displayName;
        }
        return `Player${Math.floor(Math.random() * 1000)}`;
    }
}

// Initialize auth system
const authSystem = new AuthSystem();
window.authSystem = authSystem; 