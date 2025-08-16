// Authentication system for Royale Ball
class AuthSystem {
    constructor() {
        this.currentUser = null;
        this.playerStats = null;
        this.firebaseReady = false;
        this.init();
    }

    init() {
        // Wait for Firebase to be ready
        this.waitForFirebase().then(() => {
            this.firebaseReady = true;
            console.log('🔥 AuthSystem: Firebase ready, setting up auth listener');
            
            // Listen for auth state changes
            firebaseAuth.onAuthStateChanged((user) => {
                console.log('🔄 Auth state changed:', user ? `User: ${user.email || user.uid}` : 'No user');
                this.currentUser = user;
                if (user) {
                    this.loadPlayerStats();
                    this.showAuthenticatedUI();
                    // Auto-fill player name if signed in
                    this.autoFillPlayerInfo();
                } else {
                    this.showGuestUI();
                }
            });
        }).catch((error) => {
            console.error('❌ AuthSystem: Firebase not available:', error);
            this.showGuestUI();
        });
        
        // Also show guest UI initially
        this.showGuestUI();
    }

    async waitForFirebase() {
        let attempts = 0;
        while (attempts < 50) { // Wait up to 5 seconds
            if (window.firebaseReady && window.firebaseAuth) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        throw new Error('Firebase not ready after 5 seconds');
    }

    // Anonymous authentication for guest players
    async signInAnonymously() {
        if (!this.firebaseReady) {
            throw new Error('Firebase not ready yet. Please wait a moment and try again.');
        }

        try {
            console.log('👤 Starting anonymous sign-in...');
            const result = await firebaseAuth.signInAnonymously();
            console.log('✅ Anonymous sign-in successful:', result.user.uid);
            return result.user;
        } catch (error) {
            console.error('❌ Anonymous sign-in failed:', error);
            throw new Error(`Guest sign-in failed: ${error.message}`);
        }
    }

    // Google authentication
    async signInWithGoogle() {
        if (!this.firebaseReady) {
            throw new Error('Firebase not ready yet. Please wait a moment and try again.');
        }

        try {
            console.log('🔑 Starting Google sign-in...');
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.addScope('profile');
            provider.addScope('email');
            
            // Use popup for better compatibility
            const result = await firebaseAuth.signInWithPopup(provider);
            console.log('✅ Google sign-in successful:', {
                uid: result.user.uid,
                email: result.user.email,
                name: result.user.displayName
            });
            return result.user;
        } catch (error) {
            console.error('❌ Google sign-in failed:', error);
            
            // Handle specific error cases
            if (error.code === 'auth/popup-closed-by-user') {
                throw new Error('Sign-in was cancelled. Please try again.');
            } else if (error.code === 'auth/popup-blocked') {
                throw new Error('Popup was blocked by browser. Please allow popups and try again.');
            } else if (error.code === 'auth/cancelled-popup-request') {
                throw new Error('Another sign-in process is already in progress.');
            } else {
                throw new Error(`Sign-in failed: ${error.message}`);
            }
        }
    }

    // Email/password authentication
    async signInWithEmail(email, password) {
        if (!this.firebaseReady) {
            throw new Error('Firebase not ready yet. Please wait a moment and try again.');
        }

        try {
            console.log('📧 Starting email sign-in for:', email);
            const result = await firebaseAuth.signInWithEmailAndPassword(email, password);
            console.log('✅ Email sign-in successful:', result.user.uid);
            return result.user;
        } catch (error) {
            console.error('❌ Email sign-in failed:', error);
            
            // Handle specific error cases
            if (error.code === 'auth/user-not-found') {
                throw new Error('No account found with this email address.');
            } else if (error.code === 'auth/wrong-password') {
                throw new Error('Incorrect password.');
            } else if (error.code === 'auth/invalid-email') {
                throw new Error('Invalid email address.');
            } else if (error.code === 'auth/too-many-requests') {
                throw new Error('Too many failed attempts. Please try again later.');
            } else {
                throw new Error(`Sign-in failed: ${error.message}`);
            }
        }
    }

    // Create account with email/password
    async createAccount(email, password, displayName) {
        if (!this.firebaseReady) {
            throw new Error('Firebase not ready yet. Please wait a moment and try again.');
        }

        try {
            console.log('👤 Creating account for:', email);
            const result = await firebaseAuth.createUserWithEmailAndPassword(email, password);
            await result.user.updateProfile({
                displayName: displayName
            });
            console.log('✅ Account created successfully:', result.user.uid);
            return result.user;
        } catch (error) {
            console.error('❌ Account creation failed:', error);
            
            // Handle specific error cases
            if (error.code === 'auth/email-already-in-use') {
                throw new Error('An account with this email already exists.');
            } else if (error.code === 'auth/invalid-email') {
                throw new Error('Invalid email address.');
            } else if (error.code === 'auth/weak-password') {
                throw new Error('Password is too weak. Please use at least 6 characters.');
            } else {
                throw new Error(`Account creation failed: ${error.message}`);
            }
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
            playerNameInput.value = this.playerStats.playerName || this.currentUser.displayName || '';
        }
        
        if (authStatusText) {
            if (this.currentUser.isAnonymous) {
                authStatusText.innerHTML = '👤 Playing as Guest';
            } else if (this.currentUser.providerData && this.currentUser.providerData[0]) {
                const provider = this.currentUser.providerData[0].providerId;
                if (provider === 'google.com') {
                    authStatusText.innerHTML = `🔗 Google: ${this.currentUser.displayName || this.currentUser.email}`;
                } else if (provider === 'password') {
                    authStatusText.innerHTML = `📧 Email: ${this.currentUser.email}`;
                }
            } else {
                authStatusText.innerHTML = `✅ Logged in: ${this.currentUser.displayName || this.currentUser.email || 'User'}`;
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
            authStatusText.innerHTML = '👤 Not signed in';
        }
        
        if (signInBtn) {
            signInBtn.classList.remove('hidden');
            console.log('🔄 Showing Sign In button');
        }
        if (signOutBtn) {
            signOutBtn.classList.add('hidden');
        }
    }

    // Auto-fill player information when signed in
    autoFillPlayerInfo() {
        const playerNameInput = document.getElementById('playerNameInput');
        const playerWalletInput = document.getElementById('playerWalletInput');
        
        if (this.currentUser && playerNameInput) {
            // Fill name from Firebase profile or stats
            let displayName = '';
            if (this.playerStats?.playerName) {
                displayName = this.playerStats.playerName;
            } else if (this.currentUser.displayName) {
                displayName = this.currentUser.displayName;
            } else if (this.currentUser.email) {
                displayName = this.currentUser.email.split('@')[0];
            }
            
            if (displayName && !playerNameInput.value.trim()) {
                playerNameInput.value = displayName;
                console.log('📝 Auto-filled player name:', displayName);
            }
        }
        
        if (this.playerStats?.walletAddress && playerWalletInput) {
            if (!playerWalletInput.value.trim()) {
                playerWalletInput.value = this.playerStats.walletAddress;
                console.log('💳 Auto-filled wallet address');
            }
        }
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

    // Show authentication modal
    showAuthModal() {
        console.log('🔄 showAuthModal called');
        const authModal = document.getElementById('authModal');
        if (authModal) {
            console.log('✅ Auth modal found, showing it');
            authModal.classList.remove('hidden');
        } else {
            console.error('❌ Auth modal not found');
        }
    }

    // Hide authentication modal
    hideAuthModal() {
        const authModal = document.getElementById('authModal');
        if (authModal) {
            authModal.classList.add('hidden');
        }
    }

    // Show error message
    showError(title, message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm';
        errorDiv.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h4 class="font-bold">${title}</h4>
                    <p class="text-sm mt-1">${message}</p>
                </div>
                <button class="ml-2 text-white hover:text-gray-200" onclick="this.parentElement.parentElement.remove()">✕</button>
            </div>
        `;
        document.body.appendChild(errorDiv);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentElement) {
                errorDiv.remove();
            }
        }, 5000);
    }

    // Setup auth modal handlers
    setupAuthModalHandlers() {
        const authModal = document.getElementById('authModal');
        const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
        const googleSignInBtn = document.getElementById('googleSignInBtn');
        const emailSignInBtn = document.getElementById('emailSignInBtn');
        const emailCreateAccountBtn = document.getElementById('emailCreateAccountBtn');
        const guestPlayBtn = document.getElementById('guestPlayBtn');
        const authEmailInput = document.getElementById('authEmailInput');
        const authPasswordInput = document.getElementById('authPasswordInput');

        // Close modal handlers
        if (closeAuthModalBtn) {
            closeAuthModalBtn.addEventListener('click', () => this.hideAuthModal());
        }

        if (authModal) {
            authModal.addEventListener('click', (e) => {
                if (e.target === authModal) {
                    this.hideAuthModal();
                }
            });
        }

        // Google Sign In
        if (googleSignInBtn) {
            googleSignInBtn.addEventListener('click', async () => {
                const originalText = googleSignInBtn.innerHTML;
                googleSignInBtn.innerHTML = '<div class="flex items-center justify-center"><div class="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2"></div>Signing in...</div>';
                googleSignInBtn.disabled = true;
                
                try {
                    await this.signInWithGoogle();
                    this.hideAuthModal();
                } catch (error) {
                    console.error('Google sign-in error:', error);
                    this.showError('Google Sign-In Failed', error.message);
                } finally {
                    googleSignInBtn.innerHTML = originalText;
                    googleSignInBtn.disabled = false;
                }
            });
        }

        // Email Sign In
        if (emailSignInBtn) {
            emailSignInBtn.addEventListener('click', async () => {
                const email = authEmailInput?.value.trim();
                const password = authPasswordInput?.value;

                if (!email || !password) {
                    alert('Please enter both email and password');
                    return;
                }

                try {
                    await this.signInWithEmail(email, password);
                    this.hideAuthModal();
                } catch (error) {
                    this.showError('Email Sign-In Failed', error.message);
                }
            });
        }

        // Create Account
        if (emailCreateAccountBtn) {
            emailCreateAccountBtn.addEventListener('click', async () => {
                const email = authEmailInput?.value.trim();
                const password = authPasswordInput?.value;

                if (!email || !password) {
                    alert('Please enter both email and password');
                    return;
                }

                if (password.length < 6) {
                    alert('Password must be at least 6 characters long');
                    return;
                }

                try {
                    await this.createAccount(email, password, email.split('@')[0]);
                    this.hideAuthModal();
                } catch (error) {
                    this.showError('Account Creation Failed', error.message);
                }
            });
        }

        // Guest Play
        if (guestPlayBtn) {
            guestPlayBtn.addEventListener('click', async () => {
                try {
                    await this.signInAnonymously();
                    this.hideAuthModal();
                } catch (error) {
                    this.showError('Guest Access Failed', error.message);
                }
            });
        }

        // Enter key handlers
        [authEmailInput, authPasswordInput].forEach(input => {
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        emailSignInBtn.click();
                    }
                });
            }
        });
    }
}

// Initialize auth system
const authSystem = new AuthSystem();
window.authSystem = authSystem;

// Setup auth modal handlers when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 DOM loaded, setting up auth modal handlers');
    if (window.authSystem) {
        window.authSystem.setupAuthModalHandlers();
        console.log('✅ Auth modal handlers set up');
    } else {
        console.error('❌ AuthSystem not available on DOM load');
    }
}); 