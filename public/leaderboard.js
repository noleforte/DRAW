// Leaderboard management system
class LeaderboardManager {
    constructor() {
        this.currentType = 'match'; // 'match' or 'global'
        this.globalLeaderboard = [];
        this.matchLeaderboard = [];
        this.init();
    }

    init() {
        const toggleBtn = document.getElementById('toggleLeaderboardType');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.toggleLeaderboardType();
            });
        }

        // Auto-refresh global leaderboard every 30 seconds
        setInterval(() => {
            if (this.currentType === 'global') {
                this.loadGlobalLeaderboard();
            }
        }, 30000);
    }

    toggleLeaderboardType() {
        this.currentType = this.currentType === 'match' ? 'global' : 'match';
        const toggleBtn = document.getElementById('toggleLeaderboardType');
        
        if (toggleBtn) {
            toggleBtn.textContent = this.currentType === 'match' ? 'Match' : 'Global';
        }

        if (this.currentType === 'global') {
            this.loadGlobalLeaderboard();
        } else {
            this.updateMatchLeaderboard();
        }
    }

    async loadGlobalLeaderboard() {
        try {
            const response = await fetch('/api/leaderboard?limit=10');
            if (response.ok) {
                this.globalLeaderboard = await response.json();
                this.renderLeaderboard();
            } else {
                console.error('Failed to load global leaderboard');
            }
        } catch (error) {
            console.error('Error loading global leaderboard:', error);
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
        
        if (data.length === 0) {
            leaderboardList.innerHTML = '<div class="text-gray-400 text-sm">No data available</div>';
            return;
        }

        const html = data.map((player, index) => {
            const score = this.currentType === 'match' ? player.score : player.bestScore;
            const name = player.name || player.playerName || 'Unknown';
            const isBot = player.isBot || false;
            
            let emoji = '';
            if (index === 0) emoji = '🥇';
            else if (index === 1) emoji = '🥈';
            else if (index === 2) emoji = '🥉';
            else emoji = `${index + 1}.`;

            let nameDisplay = name;
            if (isBot) {
                nameDisplay = `🤖 ${name}`;
            } else if (this.currentType === 'global') {
                nameDisplay = `👤 ${name}`;
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
        const header = this.currentType === 'match' ? '🏆 Match Leaders' : '🌟 Global Best';
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

// Initialize leaderboard manager
const leaderboardManager = new LeaderboardManager();
window.leaderboardManager = leaderboardManager; 