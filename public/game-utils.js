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
    try {
        // Используем троттлинг для сохранения
        saveStats(stats);
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

// Троттлинг обновления статистики
const saveStats = (() => {
  let last = 0;
  let inflight = false;
  let queued = null;
  
  return async function(stats) {
    queued = stats;
    const now = Date.now();
    
    // Не чаще 1 раза в 500ms (мгновенно)
    if (inflight || now - last < 500) {
      return;
    }
    
    inflight = true;
    
    try {
      const payload = queued;
      queued = null;
      
      // Проверяем, доступен ли apiFetch
      if (!window.apiFetch) {
        console.warn('⚠️ apiFetch not available, using fallback fetch');
        const response = await fetch('https://draw-e67b.onrender.com/api/auth/profile', {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          },
          body: JSON.stringify({ stats: payload })
        });
        
        if (!response.ok) {
          throw new Error(`PUT profile ${response.status}`);
        }
      } else {
        const response = await window.apiFetch('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({ stats: payload })
        });
        
        if (!response.ok) {
          throw new Error(`PUT profile ${response.status}`);
        }
      }
      
      last = Date.now();
      console.log('✅ Stats saved successfully');
    } catch (error) {
      console.error('❌ Failed to save stats:', error);
    } finally {
      inflight = false;
    }
  };
})();

// Send coins to server with batch optimization
async function sendCoinsToServer(coinsGained) {
    const user = getCurrentUser();
    if (!user || !isUserAuthenticated()) {
        console.log('⚠️ No authenticated user, skipping coins update');
        return;
    }
    
    try {
        const currentStats = getUserStats();
        const newTotalScore = (currentStats.totalScore || 0) + coinsGained;
        const updatedStats = {
            ...currentStats,
            totalScore: newTotalScore,
            gamesPlayed: (currentStats.gamesPlayed || 0) + 1
        };
        updatedStats.bestScore = Math.max(currentStats.bestScore || 0, newTotalScore); // Update bestScore after totalScore

        statsUpdateQueue.push({ stats: updatedStats, timestamp: Date.now() });
        if (!statsUpdateTimeout) {
            statsUpdateTimeout = setTimeout(() => { processBatchStatsUpdate(); }, STATS_UPDATE_DELAY);
        }
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