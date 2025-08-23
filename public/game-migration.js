// Migration utilities to replace old nicknameAuth functions
// This file provides backward compatibility while we transition to server auth

// Legacy compatibility layer - replaces nicknameAuth calls
window.nicknameAuth = {
    getCurrentUserSync: () => window.gameUtils?.getCurrentUser(),
    getCurrentUser: async () => window.gameUtils?.getCurrentUser(),
    syncUserStatsFromFirestore: async () => window.gameUtils?.syncUserStatsFromServer(),
    refreshCurrentUser: () => window.gameUtils?.refreshUserData(),
    refreshCurrentUserFromFirestore: async () => window.gameUtils?.refreshUserData(),
    updateUserStats: async (nickname, stats) => window.gameUtils?.updateUserStats(stats),
    setCurrentUser: (user) => { 
        if (window.serverAuth) {
            window.serverAuth.currentUser = user;
        }
    },
    logout: async () => window.gameUtils?.logoutUser(),
    login: async (nickname, password) => {
        try {
            // serverAuth.login ожидает (email, nickname, password), но у нас нет email
            // Передаем пустую строку для email, так как сервер его не использует для входа
            const result = await window.serverAuth?.login('', nickname, password);
            return result?.user;
        } catch (error) {
            throw error;
        }
    },
    register: async (email, nickname, password, wallet) => {
        try {
            const result = await window.serverAuth?.register(email, nickname, password, wallet);
            return result?.user;
        } catch (error) {
            throw error;
        }
    },
    isOnline: true, // Server auth is always "online"
    getUserById: (userId) => {
        const currentUser = window.gameUtils?.getCurrentUser();
        return currentUser?.id === userId ? currentUser : null;
    },
    getUserByNickname: (nickname) => {
        const currentUser = window.gameUtils?.getCurrentUser();
        return currentUser?.nickname === nickname ? currentUser : null;
    }
};

console.log('🔄 Legacy nicknameAuth compatibility layer initialized');

// Also provide sendCoinsToFirestore as alias to sendCoinsToServer
window.sendCoinsToFirestore = window.sendCoinsToServer || function() {
    console.warn('⚠️ sendCoinsToFirestore is deprecated, use sendCoinsToServer');
}; 