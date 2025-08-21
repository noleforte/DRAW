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
        
        const toggleBtn = document.getElementById('toggleLeaderboardType');
        console.log('🔄 Toggle button found:', toggleBtn);
        
        if (toggleBtn) {
            console.log('🔄 Adding click event listener to toggle button');
            
            // Add click event listener
            toggleBtn.addEventListener('click', () => {
                console.log('🔄 Toggle button clicked!');
                console.log('🔄 This context:', this);
                console.log('🔄 This.toggleLeaderboardType:', this.toggleLeaderboardType);
                this.toggleLeaderboardType();
            });
            
            // Also add a test click to see if the button is working
            console.log('🔄 Testing button click...');
            toggleBtn.click();
            
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
            this.loadGlobalLeaderboard();
        } else {
            console.log('🔄 Updating match leaderboard...');
            this.updateMatchLeaderboard();
        }
    }

    async loadGlobalLeaderboard() {
        try {
            console.log('🔄 Fetching all players from /api/players...');
            const response = await fetch('/api/players');
            if (response.ok) {
                this.globalLeaderboard = await response.json();
                console.log('🔄 Loaded', this.globalLeaderboard.length, 'players:', this.globalLeaderboard);
                this.renderLeaderboard();
            } else {
                console.error('❌ Failed to load all players:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('❌ Error loading all players:', error);
        }
    }

    updateMatchLeaderboard() {
        // This will be called from the main game logic
        this.renderLeaderboard();
    }

    setMatchLeaderboard(players) {
        this.matchLeaderboard = players;
        if (this.currentType === 'match') {
            this.renderLeaderboard();
        }
    }

    renderLeaderboard() {
        const leaderboardList = document.getElementById('leaderboardList');
        if (!leaderboardList) return;

        const data = this.currentType === 'match' ? this.matchLeaderboard : this.globalLeaderboard;
        console.log('🔄 Rendering leaderboard:', this.currentType, 'Data length:', data.length, 'Data:', data);
        
        if (data.length === 0) {
            leaderboardList.innerHTML = '<div class="text-gray-400 text-sm">No data available</div>';
            console.log('🔄 No data available for', this.currentType);
            return;
        }

        // Update header text based on type
        if (this.currentType === 'global') {
            const onlineCount = data.filter(p => p.isOnline).length;
            const totalCount = data.length;
            const headerText = `All Players (${onlineCount} Online, ${totalCount - onlineCount} Offline)`;
            const leaderboardHeader = document.querySelector('.leaderboard-header h2');
            if (leaderboardHeader) {
                leaderboardHeader.textContent = headerText;
            }
        }

        const html = data.map((player, index) => {
            const score = this.currentType === 'match' ? player.score : player.totalScore;
            const name = player.nickname || player.playerName || player.name || 'Unknown';
            const isBot = player.isBot || false;
            const isOnline = player.isOnline || false;
            
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
            const response = await fetch(`/api/player/${playerId}`);
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

// Also try to initialize immediately if DOM is already loaded
if (document.readyState === 'loading') {
    console.log('🔄 DOM is still loading, waiting for DOMContentLoaded...');
} else {
    console.log('🔄 DOM already loaded, initializing LeaderboardManager immediately...');
    const leaderboardManager = new LeaderboardManager();
    window.leaderboardManager = leaderboardManager;
    console.log('🔄 LeaderboardManager set on window:', window.leaderboardManager);
} 