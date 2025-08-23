// Server-based authentication system for Royale Ball
class ServerAuthSystem {
    constructor() {
        this.currentUser = null;
        this.token = localStorage.getItem('authToken');
        // Use Render server URL for production, localhost for development
        this.serverUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001' 
            : 'https://draw-e67b.onrender.com';
        this.init();
    }

    init() {
        // Check if we have a valid token on startup
        if (this.token) {
            this.validateToken();
        }
        
        // Setup event listeners
        this.setupEventListeners();
    }

    // Validate stored token
    async validateToken() {
        try {
            const response = await fetch(`${this.serverUrl}/api/auth/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const userData = await response.json();
                this.currentUser = userData;
                this.showAuthenticatedUI();
                console.log('✅ Token validated, user authenticated:', userData.nickname);
                return true;
            } else {
                // Token is invalid, clear it
                this.logout();
                return false;
            }
        } catch (error) {
            console.error('❌ Token validation failed:', error);
            this.logout();
            return false;
        }
    }

    // Register new user
    async register(email, nickname, password, wallet) {
        try {
            const response = await fetch(`${this.serverUrl}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email.trim(),
                    nickname: nickname.trim(),
                    password: password,
                    wallet: wallet.trim()
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Store token and user data
                this.token = data.token;
                this.currentUser = data.user;
                localStorage.setItem('authToken', this.token);
                
                this.showAuthenticatedUI();
                console.log('✅ User registered successfully:', data.user.nickname);
                
                return {
                    success: true,
                    user: data.user
                };
            } else {
                throw new Error(data.error || 'Registration failed');
            }
        } catch (error) {
            console.error('❌ Registration error:', error);
            throw error;
        }
    }

    // Login user
    async login(nickname, password) {
        try {
            const response = await fetch(`${this.serverUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nickname: nickname.trim(),
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Store token and user data
                this.token = data.token;
                this.currentUser = data.user;
                localStorage.setItem('authToken', this.token);
                
                this.showAuthenticatedUI();
                console.log('✅ User logged in successfully:', data.user.nickname);
                
                return {
                    success: true,
                    user: data.user
                };
            } else {
                throw new Error(data.error || 'Login failed');
            }
        } catch (error) {
            console.error('❌ Login error:', error);
            throw error;
        }
    }

    // Logout user
    async logout() {
        try {
            if (this.token) {
                await fetch(`${this.serverUrl}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            console.warn('⚠️ Logout request failed:', error);
        } finally {
            // Clear local data regardless of server response
            this.token = null;
            this.currentUser = null;
            localStorage.removeItem('authToken');
            
            this.showGuestUI();
            console.log('✅ User logged out');
        }
    }

    // Get current user info
    async getCurrentUser() {
        if (this.currentUser) {
            return this.currentUser;
        }
        
        if (this.token) {
            await this.validateToken();
            return this.currentUser;
        }
        
        return null;
    }

    // Get current user info synchronously
    getCurrentUserSync() {
        return this.currentUser;
    }

    // Update user profile
    async updateProfile(updates) {
        try {
            const response = await fetch(`${this.serverUrl}/api/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });

            const data = await response.json();

            if (response.ok) {
                this.currentUser = data.user;
                this.showAuthenticatedUI();
                console.log('✅ Profile updated successfully');
                return data.user;
            } else {
                throw new Error(data.error || 'Profile update failed');
            }
        } catch (error) {
            console.error('❌ Profile update error:', error);
            throw error;
        }
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.currentUser && !!this.token;
    }

    // Get user ID for game operations
    getUserId() {
        return this.currentUser?.id;
    }

    // Get user nickname for game operations
    getNickname() {
        return this.currentUser?.nickname;
    }

    // Get user wallet
    getWallet() {
        return this.currentUser?.wallet || '';
    }

    // Get user stats
    getStats() {
        return this.currentUser?.stats || {
            gamesPlayed: 0,
            totalScore: 0,
            bestScore: 0,
            wins: 0
        };
    }

    // Show authenticated user UI
    showAuthenticatedUI() {
        const authStatusText = document.getElementById('authStatusText');
        const signInBtn = document.getElementById('signInBtn');
        const signOutBtn = document.getElementById('signOutBtn');
        const playerNameInput = document.getElementById('playerNameInput');
        const playerWalletInput = document.getElementById('playerWalletInput');
        
        if (authStatusText) {
            authStatusText.innerHTML = `✅ Signed in as ${this.currentUser.nickname}`;
        }
        
        if (signInBtn) signInBtn.classList.add('hidden');
        if (signOutBtn) signOutBtn.classList.remove('hidden');
        
        // Auto-fill player information
        if (playerNameInput && this.currentUser.nickname) {
            playerNameInput.value = this.currentUser.nickname;
        }
        
        if (playerWalletInput && this.currentUser.wallet) {
            playerWalletInput.value = this.currentUser.wallet;
        }
        
        // Update player info panel
        this.updatePlayerInfoPanel();
    }

    // Show guest user UI
    showGuestUI() {
        const authStatusText = document.getElementById('authStatusText');
        const signInBtn = document.getElementById('signInBtn');
        const signOutBtn = document.getElementById('signOutBtn');
        
        if (authStatusText) {
            authStatusText.innerHTML = '👤 Not signed in';
        }
        
        if (signInBtn) signInBtn.classList.remove('hidden');
        if (signOutBtn) signOutBtn.classList.add('hidden');
        
        // Update player info panel for guest
        this.updatePlayerInfoPanel();
    }

    // Update player info panel
    updatePlayerInfoPanel() {
        const playerInfoName = document.getElementById('playerInfoName');
        const playerInfoStatus = document.getElementById('playerInfoStatus');
        const totalCoins = document.getElementById('totalCoins');
        const matchesPlayed = document.getElementById('matchesPlayed');
        const bestScore = document.getElementById('bestScore');
        
        if (this.currentUser) {
            // Update with authenticated user data
            if (playerInfoName) {
                playerInfoName.textContent = this.currentUser.nickname;
            }
            
            if (playerInfoStatus) {
                playerInfoStatus.textContent = 'Signed in';
            }
            
            const stats = this.currentUser.stats || {};
            if (totalCoins) totalCoins.textContent = stats.totalScore || 0;
            if (matchesPlayed) matchesPlayed.textContent = stats.gamesPlayed || 0;
            if (bestScore) bestScore.textContent = stats.bestScore || 0;
        } else {
            // Show guest info
            if (playerInfoName) playerInfoName.textContent = 'Guest';
            if (playerInfoStatus) playerInfoStatus.textContent = 'Not signed in';
            if (totalCoins) totalCoins.textContent = '0';
            if (matchesPlayed) matchesPlayed.textContent = '0';
            if (bestScore) bestScore.textContent = '0';
        }
        
        // Ensure panel is always visible
        const playerInfoPanel = document.getElementById('playerInfoPanel');
        if (playerInfoPanel) {
            playerInfoPanel.style.display = 'block';
            playerInfoPanel.style.visibility = 'visible';
        }
    }

    // Setup event listeners
    setupEventListeners() {
        // Sign out button
        const signOutBtn = document.getElementById('signOutBtn');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', () => this.logout());
        }
        
        // Logout button in player info panel
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }

    // Show authentication modal
    showAuthModal() {
        const authModal = document.getElementById('authModal');
        if (authModal) {
            authModal.classList.remove('hidden');
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
}

// Initialize server auth system
const serverAuth = new ServerAuthSystem();
window.serverAuth = serverAuth;

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServerAuthSystem;
} 