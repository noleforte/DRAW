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

        // Load global leaderboard initially
        console.log('🔄 Loading initial global leaderboard...');
        this.loadGlobalLeaderboard();
        
        // Auto-refresh global leaderboard every 10 seconds for real-time online status
        setInterval(() => {
            if (this.currentType === 'global') {
                console.log('🔄 Auto-refreshing global leaderboard...');
                this.loadGlobalLeaderboard();
            }
        }, 10000);
        
        console.log('🔄 LeaderboardManager initialization complete');
    }

    // Set match leaderboard data
    setMatchLeaderboard(data) {
        console.log('🔄 setMatchLeaderboard called with data:', data);
        if (Array.isArray(data)) {
            this.matchLeaderboard = data;
            console.log(`✅ Match leaderboard updated with ${data.length} players`);
            
            // If currently showing match leaderboard, re-render
            if (this.currentType === 'match') {
                this.renderLeaderboard(this.matchLeaderboard, 'match');
            }
        } else {
            console.warn('⚠️ setMatchLeaderboard: data is not an array:', typeof data);
        }
    }

    // Update match leaderboard with new data
    updateMatchLeaderboard(data) {
        console.log('🔄 updateMatchLeaderboard called with data:', data);
        this.setMatchLeaderboard(data);
    }

    // Toggle between match and global leaderboard
    toggleLeaderboardType() {
        console.log('🔄 toggleLeaderboardType called');
        
        if (this.currentType === 'match') {
            console.log('🔄 Switching to global leaderboard');
            this.currentType = 'global';
            
            // Always fetch fresh global data
            this.loadGlobalLeaderboard();
        } else {
            console.log('🔄 Switching to match leaderboard');
            this.currentType = 'match';
            
            // Render match leaderboard
            this.renderLeaderboard(this.matchLeaderboard, 'match');
        }
        
        // Update toggle button text
        this.updateToggleButton();
    }

    // Update toggle button text
    updateToggleButton() {
        const toggleBtn = document.getElementById('toggleLeaderboardType');
        if (toggleBtn) {
            toggleBtn.textContent = this.currentType === 'match' ? 'Show Global' : 'Show Match';
            console.log('🔄 Toggle button text updated to:', toggleBtn.textContent);
        } else {
            console.error('❌ Toggle button not found!');
        }
    }

    // Load global leaderboard data
    async loadGlobalLeaderboard() {
        console.log('🔄 loadGlobalLeaderboard called');
        
        try {
            const response = await fetch('https://draw-e67b.onrender.com/api/players');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('✅ Global leaderboard data received:', data);
            
            if (Array.isArray(data)) {
                this.globalLeaderboard = data;
                console.log(`✅ Global leaderboard updated with ${data.length} players`);
                
                // Render the global leaderboard
                this.renderLeaderboard(this.globalLeaderboard, 'global');
            } else {
                console.error('❌ Global leaderboard data is not an array:', typeof data);
                this.renderLeaderboard([], 'global');
            }
        } catch (error) {
            console.error('❌ Error loading global leaderboard:', error);
            
            // Fallback to mock data for testing
            console.warn('⚠️ Using mock data as fallback');
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
        console.log(`🏆 Rendering ${type} leaderboard with ${data.length} players`);
        
        const leaderboardList = document.getElementById('leaderboardList');
        if (!leaderboardList) {
            console.error('❌ leaderboardList element not found!');
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
            // Remove duplicates by nickname (keep highest score)
            const uniquePlayers = new Map();
            data.forEach(player => {
                const nickname = player.nickname || player.playerName || player.playerId;
                if (!uniquePlayers.has(nickname) || 
                    player.totalScore > uniquePlayers.get(nickname).totalScore) {
                    uniquePlayers.set(nickname, player);
                }
            });
            
            // Filter out temporary accounts, zero scores, and players without email
            const filteredPlayers = Array.from(uniquePlayers.values()).filter(player => {
                const nickname = player.nickname || player.playerName || player.playerId;
                const hasValidNickname = !nickname.startsWith('Player_guest_') && 
                                       !nickname.startsWith('Player_player_') &&
                                       !nickname.startsWith('guest_') &&
                                       !nickname.startsWith('player_');
                const hasValidScore = player.totalScore && player.totalScore > 0;
                const hasEmail = player.email && player.email.trim() !== '';
                
                if (!hasValidNickname) {
                    console.log(`🔄 Filtered out temporary player: ${nickname}`);
                }
                if (!hasValidScore) {
                    console.log(`🔄 Filtered out player with zero score: ${nickname}`);
                }
                if (!hasEmail) {
                    console.log(`🔄 Filtered out player without email: ${nickname}`);
                }
                
                return hasValidNickname && hasValidScore && hasEmail;
            });
            
            data = filteredPlayers.sort((a, b) => b.totalScore - a.totalScore);
            console.log(`✅ Global leaderboard filtered: ${data.length} players (was ${uniquePlayers.size})`);
        }
        // For match leaderboard - NO filtering, show all players as before
        
        // Create leaderboard HTML based on type
        let leaderboardHTML;
        
        if (type === 'match') {
            // Compact Current Game layout
            console.log('🔄 Rendering Current Game with data:', data);
            if (data.length > 0) {
                console.log('🔄 First player data sample:', data[0]);
                console.log('🔄 Available fields:', Object.keys(data[0]));
                console.log('🔄 All players data:', data.map((p, i) => `Player ${i+1}: name="${p.name}", score=${p.score}, id=${p.id}`));
            }
            
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
                        
                        console.log(`🔄 Player ${index + 1}: name="${name}", score=${score}, isBot=${isBot}, id=${player.id}`);
                        
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
        console.log(`✅ ${type} leaderboard rendered successfully`);
    }

    // Called when player stats are available
    async loadPlayerStats(playerId) {
        if (!playerId || playerId.startsWith('guest_')) return null;

        try {
            const apiUrl = `https://draw-e67b.onrender.com/api/player/${playerId}`;
            const response = await fetch(apiUrl);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error loading player stats:', error);
        }
        return null;
    }
}

// Initialize leaderboard manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔄 DOM loaded, initializing LeaderboardManager...');
    const leaderboardManager = new LeaderboardManager();
    window.leaderboardManager = leaderboardManager;
    console.log('🔄 LeaderboardManager set on window:', window.leaderboardManager);
});