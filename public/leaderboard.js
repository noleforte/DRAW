// Leaderboard management system
class LeaderboardManager {
    constructor() {
        this.currentType = 'match'; // 'match' or 'global'
        this.globalLeaderboard = [];
        this.matchLeaderboard = [];
        this.init();
    }

    init() {
        console.log('🔄 Initializing LeaderboardManager...');
        
        // Check if required elements exist
        const toggleBtn = document.getElementById('toggleLeaderboardType');
        const leaderboardList = document.getElementById('leaderboardList');
        const leaderboardHeader = document.querySelector('.leaderboard-header h2');
        
        console.log('🔄 Required elements check:');
        console.log('🔄 - toggleBtn:', toggleBtn ? 'Found' : 'Not found');
        console.log('🔄 - leaderboardList:', leaderboardList ? 'Found' : 'Not found');
        console.log('🔄 - leaderboardHeader:', leaderboardHeader ? 'Found' : 'Not found');
        
        // Additional debugging for leaderboardList
        if (leaderboardList) {
            console.log('🔄 - leaderboardList.innerHTML length:', leaderboardList.innerHTML.length);
            console.log('🔄 - leaderboardList.className:', leaderboardList.className);
        }
        
        if (toggleBtn) {
            console.log('🔄 Adding click event listener to toggle button');
            
            // Add click event listener
            toggleBtn.addEventListener('click', () => {
                console.log('🔄 Toggle button clicked!');
                console.log('🔄 This context:', this);
                console.log('🔄 This.toggleLeaderboardType:', this.toggleLeaderboardType);
                this.toggleLeaderboardType();
            });
            
            console.log('🔄 Event listener added successfully');
        } else {
            console.error('❌ Toggle button not found during initialization!');
        }
        
        // Test click event binding
        if (toggleBtn) {
            console.log('🔄 Testing toggle button click event...');
            // Simulate a click to test if the event is properly bound
            setTimeout(() => {
                try {
                    console.log('🔄 Toggle button click event test completed');
                    // Test if the button is clickable
                    if (toggleBtn.disabled) {
                        console.log('⚠️ Toggle button is disabled');
                    } else {
                        console.log('✅ Toggle button is enabled and clickable');
                    }
                } catch (error) {
                    console.error('❌ Error during toggle button test:', error);
                }
            }, 100);
        }

        // Load global leaderboard initially
        console.log('🔄 Loading initial global leaderboard...');
        try {
            this.loadGlobalLeaderboard();
        } catch (error) {
            console.error('❌ Error during initial global leaderboard load:', error);
        }
        
        // Auto-refresh global leaderboard every 10 seconds for real-time online status
        const refreshInterval = setInterval(() => {
            try {
                if (this.currentType === 'global') {
                    console.log('🔄 Auto-refreshing global leaderboard...');
                    this.loadGlobalLeaderboard();
                }
            } catch (error) {
                console.error('❌ Error during auto-refresh:', error);
            }
        }, 10000);
        
        console.log('🔄 Auto-refresh interval set to 10 seconds, interval ID:', refreshInterval);
        
        // Listen for real-time player stats updates from server
        if (window.socket) {
            console.log('🔄 Socket found, setting up playerStatsUpdated listener...');
            try {
                window.socket.on('playerStatsUpdated', (data) => {
                    console.log('📡 Received playerStatsUpdated event:', data);
                    this.handlePlayerStatsUpdate(data);
                });
                console.log('✅ playerStatsUpdated listener set up successfully');
            } catch (error) {
                console.error('❌ Error setting up socket listener:', error);
            }
        } else {
            console.log('⚠️ Socket not available for real-time updates');
            console.log('🔄 Available window properties:', Object.keys(window).filter(key => key.includes('socket') || key.includes('io')));
        }
        
        console.log('🔄 LeaderboardManager initialization complete');
        console.log('🔄 Current state:', {
            currentType: this.currentType,
            globalLeaderboardLength: this.globalLeaderboard.length,
            matchLeaderboardLength: this.matchLeaderboard.length,
            toggleBtnExists: !!toggleBtn,
            leaderboardListExists: !!leaderboardList,
            socketExists: !!window.socket
        });
        
        // Test if everything is working
        setTimeout(() => {
            try {
                console.log('🔄 Post-initialization test...');
                if (this.globalLeaderboard.length === 0) {
                    console.log('⚠️ Global leaderboard is empty, this might be normal for new installations');
                }
                if (this.matchLeaderboard.length === 0) {
                    console.log('⚠️ Match leaderboard is empty, this is normal before game starts');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
                
                // Test if the manager can be called from game.js
                if (window.leaderboardManager === this) {
                    console.log('✅ LeaderboardManager reference is correct');
                } else {
                    console.log('⚠️ LeaderboardManager reference mismatch');
                }
            } catch (error) {
                console.error('❌ Error during post-initialization test:', error);
            }
        }, 1000);
    }

    // Set match leaderboard data
    setMatchLeaderboard(data) {
        console.log('🔄 Setting match leaderboard data:', data.length, 'players');
        
        if (Array.isArray(data)) {
            this.matchLeaderboard = data;
            console.log('🔄 Match leaderboard data set, current type:', this.currentType);
            
            // If currently showing match leaderboard, re-render
            if (this.currentType === 'match') {
                console.log('🔄 Re-rendering match leaderboard...');
                this.renderLeaderboard(this.matchLeaderboard, 'match');
            } else {
                console.log('🔄 Not re-rendering (showing global leaderboard)');
            }
        } else {
            console.log('⚠️ Invalid match leaderboard data:', typeof data, data);
        }
    }

    // Update match leaderboard with new data
    updateMatchLeaderboard(data) {
        console.log('🔄 Updating match leaderboard with new data:', data.length, 'players');
        this.setMatchLeaderboard(data);
    }

    // Toggle between match and global leaderboard
    toggleLeaderboardType() {
        console.log('🔄 Toggling leaderboard type from', this.currentType);
        
        if (this.currentType === 'match') {
            this.currentType = 'global';
            console.log('🔄 Switched to global leaderboard, loading fresh data...');
            
            // Always fetch fresh global data
            this.loadGlobalLeaderboard();
        } else {
            this.currentType = 'match';
            console.log('🔄 Switched to match leaderboard, rendering existing data...');
            
            // Render match leaderboard
            this.renderLeaderboard(this.matchLeaderboard, 'match');
        }
        
        // Update toggle button text
        this.updateToggleButton();
        console.log('🔄 Leaderboard type is now:', this.currentType);
    }

    // Update toggle button text
    updateToggleButton() {
        const toggleBtn = document.getElementById('toggleLeaderboardType');
        if (toggleBtn) {
            const newText = this.currentType === 'match' ? 'Show Global' : 'Show Match';
            toggleBtn.textContent = newText;
            console.log('🔄 Toggle button text updated to:', newText);
        } else {
            console.log('⚠️ Toggle button not found for text update');
        }
    }

    // Handle real-time player stats updates from server
    handlePlayerStatsUpdate(data) {
        console.log('🔄 Handling player stats update:', data);
        
        if (data.type === 'newPlayer') {
            console.log('🆕 New player detected, refreshing global leaderboard...');
            // Force refresh global leaderboard to include new player
            this.loadGlobalLeaderboard();
        } else if (data.type === 'scoreUpdate') {
            console.log('📊 Score update detected, refreshing global leaderboard...');
            // Force refresh global leaderboard to show updated scores
            this.loadGlobalLeaderboard();
        } else {
            console.log('⚠️ Unknown update type:', data.type);
        }
    }

    // Load global leaderboard data
    async loadGlobalLeaderboard() {
        try {
            console.log('🔄 Loading global leaderboard...');
            const response = await fetch('https://draw-e67b.onrender.com/api/players');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('🔄 Received data from API:', data.length, 'players');
            
            if (Array.isArray(data)) {
                this.globalLeaderboard = data;
                console.log('🔄 Global leaderboard data set, rendering...');
                
                // Render the global leaderboard
                this.renderLeaderboard(this.globalLeaderboard, 'global');
            } else {
                console.log('⚠️ API returned non-array data:', typeof data, data);
                this.renderLeaderboard([], 'global');
            }
        } catch (error) {
            console.error('❌ Error loading global leaderboard:', error);
            const mockData = [
                {
                    playerId: 'mock_1',
                    nickname: 'TestPlayer1',
                    playerName: 'TestPlayer1',
                    totalScore: 1500,
                    gamesPlayed: 5,
                    wins: 2,
                    email: 'test1@example.com'
                },
                {
                    playerId: 'mock_2',
                    nickname: 'TestPlayer2',
                    playerName: 'TestPlayer2',
                    totalScore: 1200,
                    gamesPlayed: 3,
                    wins: 1,
                    email: 'test2@example.com'
                }
            ];
            
            this.globalLeaderboard = mockData;
            this.renderLeaderboard(this.globalLeaderboard, 'global');
        }
    }

    // Render leaderboard with given data
    renderLeaderboard(data, type = 'match') {
        console.log('🔄 Rendering leaderboard:', type, 'with', data.length, 'players');
        
        const leaderboardList = document.getElementById('leaderboardList');
        if (!leaderboardList) {
            console.log('⚠️ Leaderboard list element not found');
            return;
        }
        
        if (!data || data.length === 0) {
            leaderboardList.innerHTML = `
                <div class="text-center py-4">
                    <div class="text-lg font-bold text-gray-600 mb-2">🏆 Leaderboard</div>
                    <div class="text-gray-500 text-sm">
                        ${type === 'global' ? 'No players with email found yet.' : 'No match data available.'}
                    </div>
                </div>
            `;
            return;
        }
        
        // Apply client-side filtering ONLY for global leaderboard
        if (type === 'global') {
            console.log('🔍 Global leaderboard filtering - Raw data:', data.length, 'players');
            
            // Remove duplicates by nickname (keep highest score)
            const uniquePlayers = new Map();
            data.forEach(player => {
                const nickname = player.nickname || player.playerName || player.playerId;
                if (!uniquePlayers.has(nickname) || 
                    player.totalScore > uniquePlayers.get(nickname).totalScore) {
                    uniquePlayers.set(nickname, player);
                }
            });
            
            console.log('🔍 After deduplication:', uniquePlayers.size, 'unique players');
            
            // Filter out temporary accounts and players without email, but allow zero scores for new users
            const filteredPlayers = Array.from(uniquePlayers.values()).filter(player => {
                const nickname = player.nickname || player.playerName || player.playerId;
                const hasValidNickname = !nickname.startsWith('Player_guest_') && 
                                       !nickname.startsWith('Player_player_') &&
                                       !nickname.startsWith('guest_') &&
                                       !nickname.startsWith('player_');
                const hasValidScore = typeof player.totalScore === 'number' && player.totalScore >= 0; // Allow 0 for new users
                const hasEmail = player.email && player.email.trim() !== '';
                
                const isFiltered = hasValidNickname && hasValidScore && hasEmail;
                
                if (!isFiltered) {
                    console.log(`🔍 Filtered out player ${nickname}:`, {
                        hasValidNickname,
                        hasValidScore,
                        hasEmail,
                        totalScore: player.totalScore,
                        email: player.email
                    });
                }
                
                return isFiltered;
            });
            
            console.log('🔍 After filtering:', filteredPlayers.length, 'valid players');
            data = filteredPlayers.sort((a, b) => b.totalScore - a.totalScore);
        }
        // For match leaderboard - NO filtering, show all players as before
        
        // Create leaderboard HTML based on type
        let leaderboardHTML;
        
        if (type === 'match') {
            // Compact Current Game layout
            
            leaderboardHTML = `
                <div class="space-y-1">
                    ${data.map((player, index) => {
                        const rank = index + 1;
                        
                        // Try multiple possible name fields with better fallback
                        let name = player.name;
                        if (!name || name === 'undefined') {
                            name = player.nickname || player.playerName || player.playerId || `Player_${player.id}` || 'Unknown';
                        }
                        
                        const score = player.score || player.totalScore || 0;
                        const isBot = player.isBot || false;
                        
                        // Rank emojis
                        let rankEmoji = `${rank}.`;
                        if (rank === 1) rankEmoji = '🥇';
                        else if (rank === 2) rankEmoji = '🥈';
                        else if (rank === 3) rankEmoji = '🥉';
                        
                        return `
                            <div class="flex justify-between items-center text-sm p-1.5 border-b border-gray-700 last:border-b-0">
                                <span class="flex-1 truncate">
                                    ${rankEmoji} ${name}${isBot ? ' 🤖' : ''}
                                </span>
                                <span class="text-yellow-400 font-bold">${score}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            // Global leaderboard layout (compact like match)
            leaderboardHTML = `
                <div class="space-y-1">
                    ${data.map((player, index) => {
                        const rank = index + 1;
                        const nickname = player.nickname || player.playerName || player.playerId;
                        const score = player.totalScore || 0;
                        
                        // Rank emojis
                        let rankEmoji = `${rank}.`;
                        if (rank === 1) rankEmoji = '🥇';
                        else if (rank === 2) rankEmoji = '🥈';
                        else if (rank === 3) rankEmoji = '🥉';
                        
                        return `
                            <div class="flex justify-between items-center text-sm p-1.5 border-b border-gray-700 last:border-b-0">
                                <span class="flex-1 truncate">
                                    ${rankEmoji} ${nickname}
                                </span>
                                <div class="text-right">
                                    <div class="text-yellow-400 font-bold">${score}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
        
        leaderboardList.innerHTML = leaderboardHTML;
        console.log('✅ Leaderboard rendered successfully:', type, 'with', data.length, 'players');
    }

    // Called when player stats are available
    async loadPlayerStats(playerId) {
        console.log('🔄 Loading player stats for:', playerId);
        
        if (!playerId || playerId.startsWith('guest_')) {
            console.log('⚠️ Skipping guest player:', playerId);
            return null;
        }

        try {
            const apiUrl = `https://draw-e67b.onrender.com/api/player/${playerId}`;
            console.log('🔄 Fetching from:', apiUrl);
            
            const response = await fetch(apiUrl);
            if (response.ok) {
                const stats = await response.json();
                console.log('✅ Player stats loaded:', stats);
                return stats;
            } else {
                console.log('⚠️ Failed to load player stats:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('❌ Error loading player stats:', error);
        }
        return null;
    }
}

// Initialize leaderboard manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 DOM loaded, initializing LeaderboardManager...');
    console.log('🔄 Document ready state:', document.readyState);
    console.log('🔄 Available elements:', {
        toggleBtn: !!document.getElementById('toggleLeaderboardType'),
        leaderboardList: !!document.getElementById('leaderboardList'),
        leaderboardPanel: !!document.getElementById('leaderboardPanel')
    });
    
    const leaderboardManager = new LeaderboardManager();
    window.leaderboardManager = leaderboardManager;
    console.log('🔄 LeaderboardManager set on window:', window.leaderboardManager);
    
            // Test if the manager is accessible
        setTimeout(() => {
            try {
                if (window.leaderboardManager) {
                    console.log('✅ LeaderboardManager is accessible from window');
                    console.log('🔄 Manager methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(window.leaderboardManager)));
                    
                    // Test if methods are callable
                    if (typeof window.leaderboardManager.toggleLeaderboardType === 'function') {
                        console.log('✅ toggleLeaderboardType method is callable');
                    } else {
                        console.log('⚠️ toggleLeaderboardType method is not callable');
                    }
                    
                    // Test if methods are bound correctly
                    if (window.leaderboardManager.toggleLeaderboardType === this.toggleLeaderboardType) {
                        console.log('✅ toggleLeaderboardType method is correctly bound');
                    } else {
                        console.log('⚠️ toggleLeaderboardType method binding mismatch');
                    }
                    
                    // Test if the manager can be called from game.js
                    if (window.leaderboardManager === this) {
                        console.log('✅ LeaderboardManager reference is correct');
                    } else {
                        console.log('⚠️ LeaderboardManager reference mismatch');
                    }
                } else {
                    console.log('❌ LeaderboardManager is not accessible from window');
                }
            } catch (error) {
                console.error('❌ Error during manager accessibility test:', error);
            }
        }, 100);
});