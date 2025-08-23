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
        const serverUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:3001' 
            : 'https://draw-e67b.onrender.com';
        const response = await fetch(`${serverUrl}/api/auth/profile`, {
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

// Batch operations for better performance
let statsUpdateQueue = [];
let statsUpdateTimeout = null;
const STATS_UPDATE_DELAY = 1000; // 1 second delay for batching

// Send coins to server with batch optimization
async function sendCoinsToServer(coinsGained) {
    const user = getCurrentUser();
    if (!user || !isUserAuthenticated()) {
        console.log('⚠️ Cannot save coins - no authenticated user');
        return;
    }
    
    try {
        // Get current user stats
        const currentStats = getUserStats();
        const newTotalScore = (currentStats.totalScore || 0) + coinsGained;
        
        // Update stats with new coins - totalScore first, then bestScore
        const updatedStats = {
            ...currentStats,
            totalScore: newTotalScore,
            gamesPlayed: (currentStats.gamesPlayed || 0) + 1
        };
        
        // Update bestScore only after totalScore is set
        const newBestScore = Math.max(currentStats.bestScore || 0, newTotalScore);
        updatedStats.bestScore = newBestScore;
        
        // Add to batch queue instead of immediate update
        statsUpdateQueue.push({
            stats: updatedStats,
            timestamp: Date.now()
        });
        
        // Schedule batch update
        if (!statsUpdateTimeout) {
            statsUpdateTimeout = setTimeout(() => {
                processBatchStatsUpdate();
            }, STATS_UPDATE_DELAY);
        }
        
        // Update local user data immediately for UI responsiveness
        if (window.serverAuth && window.serverAuth.currentUser) {
            window.serverAuth.currentUser.stats = updatedStats;
        }
        
        console.log(`💰 User ${user.nickname} gained ${coinsGained} coins. Total: ${newTotalScore} (queued for batch update)`);
        
    } catch (error) {
        console.error('❌ Failed to queue coins update:', error);
    }
}

// Process batch stats updates
async function processBatchStatsUpdate() {
    if (statsUpdateQueue.length === 0) {
        statsUpdateTimeout = null;
        return;
    }
    
    try {
        // Get the most recent stats update
        const latestUpdate = statsUpdateQueue[statsUpdateQueue.length - 1];
        
        // Clear the queue
        statsUpdateQueue = [];
        statsUpdateTimeout = null;
        
        // Send the latest stats to server
        await updateUserStats(latestUpdate.stats);
        
        console.log(`🚀 Batch stats update completed for ${latestUpdate.stats.totalScore} total coins`);
        
    } catch (error) {
        console.error('❌ Batch stats update failed:', error);
        
        // Retry failed updates
        if (statsUpdateQueue.length > 0) {
            statsUpdateTimeout = setTimeout(() => {
                processBatchStatsUpdate();
            }, STATS_UPDATE_DELAY * 2); // Double delay for retry
        }
    }
}

// Force immediate stats update (for important events like game end)
async function forceStatsUpdate() {
    if (statsUpdateQueue.length === 0) {
        return;
    }
    
    // Clear timeout and process immediately
    if (statsUpdateTimeout) {
        clearTimeout(statsUpdateTimeout);
        statsUpdateTimeout = null;
    }
    
    await processBatchStatsUpdate();
    console.log('⚡ Forced immediate stats update');
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
    forceStatsUpdate,
    logoutUser,
    syncUserStatsFromServer
};

console.log('🔧 Game utilities for server auth initialized'); 