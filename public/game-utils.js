// Game utilities for server-based authentication
// This file provides compatibility functions for the new server auth system

// Get current user (replaces nicknameAuth.getCurrentUserSync())
function getCurrentUser() {
    return window.serverAuth?.getCurrentUserSync() || null;
}

// Get user ID
function getUserId() {
    const user = getCurrentUser();
    return user?.id || null;
}

// Get user nickname
function getUserNickname() {
    const user = getCurrentUser();
    return user?.nickname || null;
}

// Get user wallet
function getUserWallet() {
    const user = getCurrentUser();
    return user?.wallet || '';
}

// Get user stats
function getUserStats() {
    const user = getCurrentUser();
    return user?.stats || {
        gamesPlayed: 0,
        totalScore: 0,
        bestScore: 0,
        wins: 0
    };
}

// Check if user is authenticated
function isUserAuthenticated() {
    return window.serverAuth?.isAuthenticated() || false;
}

// Update user stats on server (replaces nicknameAuth.updateUserStats())
async function updateUserStats(stats) {
    const user = getCurrentUser();
    if (!user) {
        console.warn('⚠️ Cannot update stats - no authenticated user');
        return;
    }
    
    try {
        // Update stats via API call to server
        const response = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${window.serverAuth.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ stats })
        });
        
        if (response.ok) {
            const data = await response.json();
            // Update local user data
            if (window.serverAuth) {
                window.serverAuth.currentUser = data.user;
            }
            console.log('✅ User stats updated on server');
        } else {
            console.error('❌ Failed to update user stats on server');
        }
    } catch (error) {
        console.error('❌ Error updating user stats:', error);
    }
}

// Refresh user data from server (replaces nicknameAuth.refreshCurrentUser())
async function refreshUserData() {
    if (!window.serverAuth) {
        console.warn('⚠️ Server auth not available');
        return null;
    }
    
    try {
        await window.serverAuth.validateToken();
        return getCurrentUser();
    } catch (error) {
        console.error('❌ Failed to refresh user data:', error);
        return null;
    }
}

// Send coins to server (replaces old Firestore logic)
async function sendCoinsToServer(coinsGained) {
    const user = getCurrentUser();
    if (!user || !isUserAuthenticated()) {
        console.log('⚠️ Cannot save coins - no authenticated user');
        return;
    }
    
    try {
        // In the new system, stats are managed by the server
        // This is a placeholder for future server-side coin management
        console.log(`💰 User ${user.nickname} gained ${coinsGained} coins`);
        
        // The server will handle coin updates through game events
        // For now, we just log the event
    } catch (error) {
        console.error('❌ Failed to send coins to server:', error);
    }
}

// Logout user (replaces nicknameAuth.logout())
async function logoutUser() {
    if (window.serverAuth) {
        await window.serverAuth.logout();
    }
}

// Sync user stats from server (replaces nicknameAuth.syncUserStatsFromFirestore())
async function syncUserStatsFromServer() {
    if (!window.serverAuth) {
        console.warn('⚠️ Server auth not available');
        return getCurrentUser();
    }
    
    try {
        await window.serverAuth.validateToken();
        return getCurrentUser();
    } catch (error) {
        console.error('❌ Failed to sync user stats from server:', error);
        return getCurrentUser();
    }
}

// Legacy compatibility functions
window.gameUtils = {
    getCurrentUser,
    getUserId,
    getUserNickname,
    getUserWallet,
    getUserStats,
    isUserAuthenticated,
    updateUserStats,
    refreshUserData,
    sendCoinsToServer,
    logoutUser,
    syncUserStatsFromServer
};

console.log('🔧 Game utilities for server auth initialized'); 