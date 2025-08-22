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

    toggleLeaderboardType() {
        console.log('🔄 Toggling leaderboard type from:', this.currentType);
        this.currentType = this.currentType === 'match' ? 'global' : 'match';
        console.log('🔄 New type:', this.currentType);
        
        const toggleBtn = document.getElementById('toggleLeaderboardType');
        if (toggleBtn) {
            toggleBtn.textContent = this.currentType === 'match' ? 'Match' : 'All Players';
            console.log('🔄 Button text updated to:', toggleBtn.textContent);
        } else {
            console.error('❌ Toggle button not found!');
        }

        if (this.currentType === 'global') {
            console.log('🔄 Loading global leaderboard...');
            console.log('🔄 Current globalLeaderboard data:', this.globalLeaderboard);
            console.log('🔄 globalLeaderboard length:', this.globalLeaderboard ? this.globalLeaderboard.length : 'undefined');
            
            // Always fetch fresh data for global leaderboard to ensure up-to-date information
            console.log('🔄 Fetching fresh global leaderboard data...');
            this.loadGlobalLeaderboard();
        } else {
            console.log('🔄 Switching to match leaderboard...');
            console.log('🔄 Current matchLeaderboard data:', this.matchLeaderboard);
            console.log('🔄 matchLeaderboard length:', this.matchLeaderboard ? this.matchLeaderboard.length : 'undefined');
            this.renderLeaderboard();
        }
    }

    async loadGlobalLeaderboard() {
        try {
            console.log('🔄 Fetching all players from Render server...');
            console.log('🔄 Current URL:', window.location.href);
            
            // Use correct Render server URL for API calls
            const apiUrl = 'https://draw-e67b.onrender.com/api/players';
            console.log('🔄 API URL:', apiUrl);
            
            console.log('🔄 Making fetch request...');
            const response = await fetch(apiUrl);
            console.log('🔄 API Response status:', response.status);
            console.log('🔄 API Response headers:', response.headers);
            
            if (response.ok) {
                const data = await response.json();
                console.log('🔄 Raw API response data:', data);
                console.log('🔄 Data type:', typeof data);
                console.log('🔄 Data length:', data ? data.length : 'undefined');
                
                if (Array.isArray(data)) {
                    this.globalLeaderboard = data;
                    console.log('🔄 Successfully loaded', this.globalLeaderboard.length, 'players');
                    console.log('🔄 First 3 players:', this.globalLeaderboard.slice(0, 3));
                    
                    // Check if data has the expected structure
                    if (this.globalLeaderboard.length > 0) {
                        const firstPlayer = this.globalLeaderboard[0];
                        console.log('🔄 First player sample:', firstPlayer);
                        console.log('🔄 First player fields:', Object.keys(firstPlayer));
                    }
                    
                    this.renderLeaderboard();
                } else {
                    console.error('❌ API returned non-array data:', data);
                    this.globalLeaderboard = [];
                    this.renderLeaderboard();
                }
            } else {
                console.error('❌ Failed to load all players:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('❌ Error response body:', errorText);
                
                // Show error in leaderboard
                this.globalLeaderboard = [];
                this.renderLeaderboard();
            }
        } catch (error) {
            console.error('❌ Error loading all players:', error);
            console.error('❌ Error stack:', error.stack);
            
            // Show error in leaderboard
            this.globalLeaderboard = [];
            this.renderLeaderboard();
        }
    }

    updateMatchLeaderboard() {
        console.log('🔄 updateMatchLeaderboard called');
        console.log('🔄 Current matchLeaderboard:', this.matchLeaderboard);
        console.log('🔄 Current type:', this.currentType);
        
        if (this.currentType === 'match') {
            console.log('🔄 Rendering match leaderboard...');
            this.renderLeaderboard();
        } else {
            console.log('🔄 Not rendering match leaderboard (current type is not match)');
        }
    }

    setMatchLeaderboard(players) {
        console.log('🔄 setMatchLeaderboard called with players:', players);
        console.log('🔄 Players type:', typeof players);
        console.log('🔄 Players length:', players ? players.length : 'undefined');
        
        if (Array.isArray(players)) {
            this.matchLeaderboard = players;
            console.log('🔄 Match leaderboard updated with', players.length, 'players');
            
            if (this.currentType === 'match') {
                console.log('🔄 Current type is match, rendering leaderboard...');
                this.renderLeaderboard();
            } else {
                console.log('🔄 Current type is not match, not rendering');
            }
        } else {
            console.error('❌ setMatchLeaderboard received non-array data:', players);
            this.matchLeaderboard = [];
        }
    }

    renderLeaderboard() {
        const leaderboardList = document.getElementById('leaderboardList');
        if (!leaderboardList) {
            console.error('❌ leaderboardList element not found!');
            return;
        }

        const data = this.currentType === 'match' ? this.matchLeaderboard : this.globalLeaderboard;
        console.log('🔄 Rendering leaderboard:', this.currentType);
        console.log('🔄 Data type:', typeof data);
        console.log('🔄 Data length:', data ? data.length : 'undefined');
        console.log('🔄 Raw data:', data);
        
        if (!data || data.length === 0) {
            const message = this.currentType === 'match' 
                ? 'No players in current match' 
                : 'No players found in database';
            leaderboardList.innerHTML = `<div class="text-gray-400 text-sm">${message}</div>`;
            console.log('🔄 No data available for', this.currentType, '- showing message:', message);
            return;
        }

        // Update header text based on type
        if (this.currentType === 'global') {
            console.log('🔄 Rendering global leaderboard with data:', data);
            const onlineCount = data.filter(p => p.isOnline).length;
            const totalCount = data.length;
            const headerText = `All Players (${onlineCount} Online, ${totalCount - onlineCount} Offline)`;
            console.log('🔄 Header text:', headerText);
            
            const leaderboardHeader = document.querySelector('.leaderboard-header h2');
            if (leaderboardHeader) {
                leaderboardHeader.textContent = headerText;
                console.log('🔄 Updated leaderboard header');
            } else {
                console.log('🔄 Leaderboard header element not found');
            }
        }

        const html = data.map((player, index) => {
            const score = this.currentType === 'match' ? player.score : player.totalScore;
            const name = player.nickname || player.playerName || player.name || 'Unknown';
            const isBot = player.isBot || false;
            const isOnline = player.isOnline || false;
            
            console.log(`🔄 Rendering player ${index + 1}:`, { name, score, isBot, isOnline });
            
            let emoji = '';
            if (index === 0) emoji = '🥇';
            else if (index === 1) emoji = '🥈';
            else if (index === 2) emoji = '🥉';
            else emoji = `${index + 1}.`;

            let nameDisplay = name;
            if (isBot) {
                nameDisplay = `🤖 ${name}`;
            } else if (this.currentType === 'global') {
                const onlineStatus = isOnline ? '🟢' : '🔴';
                const statusText = isOnline ? 'Online' : 'Offline';
                nameDisplay = `${onlineStatus} ${name} <span class="text-xs text-gray-400">(${statusText})</span>`;
            }

            return `
                <div class="flex justify-between items-center text-sm">
                    <span class="flex items-center">
                        <span class="w-6">${emoji}</span>
                        <span class="truncate max-w-24">${nameDisplay}</span>
                    </span>
                    <span class="font-bold text-yellow-400">${score}</span>
                </div>
            `;
        }).join('');

        leaderboardList.innerHTML = html;
        console.log('🔄 Leaderboard rendered successfully with', data.length, 'players');

        // Add type indicator
        const header = this.currentType === 'match' ? '🏆 Match Leaders' : '🌟 All Players Database (🟢 Online, 🔴 Offline)';
        const headerElement = document.querySelector('#leaderboard h3');
        if (headerElement) {
            headerElement.textContent = header;
        }
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