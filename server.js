const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { GameDataService } = require('./firebase-admin');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  } 
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint for global leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const leaderboard = await GameDataService.getGlobalLeaderboard(limit);
    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// API endpoint for player stats
app.get('/api/player/:playerId', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    const stats = await GameDataService.getPlayerStats(playerId);
    if (stats) {
      res.json(stats);
    } else {
      res.status(404).json({ error: 'Player not found' });
    }
  } catch (error) {
    console.error('Error fetching player stats:', error);
    res.status(500).json({ error: 'Failed to fetch player stats' });
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    players: Object.keys(gameState.players).length,
    matches: Object.keys(gameState.matches).length
  });
});

// Game state
const gameState = {
  players: new Map(),
  coins: new Map(),
  bots: new Map(),
  worldSize: 4000, // Large world size
  nextCoinId: 0,
  nextBotId: 0,
  matchTimeLeft: 86400, // 24 hours in seconds (24 * 60 * 60)
  matchStartTime: null, // When the current match started
  matchDuration: 86400, // Total match duration in seconds (24 hours)
  gameStarted: false,
  gameEnded: false
};

// Bot names
const botNames = [
  'BotMax', 'CoinHunter', 'Goldy', 'SpeedBot', 'CoinMaster',
  'BotAlex', 'QuickSilver', 'GoldRush', 'FastBot', 'CoinSeeker',
  'BotZero', 'Lightning', 'GoldDigger', 'RocketBot', 'CoinCollector'
];

// Bot chat messages
const botMessages = [
  "Nice catch!", "I'm coming for those coins!", "Watch out!",
  "So many shiny coins!", "This is fun!", "Great game everyone!",
  "I love collecting coins!", "Anyone else see that big coin?",
  "Fast fingers win!", "Golden opportunity!", "Coin rain!",
  "Speed is key!", "Catch me if you can!", "Shiny things everywhere!"
];

// Generate random position within world bounds
function getRandomPosition() {
  return {
    x: Math.random() * gameState.worldSize - gameState.worldSize / 2,
    y: Math.random() * gameState.worldSize - gameState.worldSize / 2
  };
}

// Generate coins
function generateCoins(count = 200) {
  for (let i = 0; i < count; i++) {
    const coin = {
      id: gameState.nextCoinId++,
      ...getRandomPosition(),
      value: 1
    };
    gameState.coins.set(coin.id, coin);
  }
}

// Create AI bot
function createBot(id) {
  const bot = {
    id: `bot_${id}`,
    name: botNames[Math.floor(Math.random() * botNames.length)] + Math.floor(Math.random() * 100),
    ...getRandomPosition(),
    vx: 0,
    vy: 0,
    score: 0,
    size: 20,
    color: `hsl(${Math.random() * 360}, 70%, 50%)`,
    target: null,
    lastMessageTime: 0,
    isBot: true,
    speedVariation: 0.8 + Math.random() * 0.4 // 0.8 to 1.2 speed multiplier for variety
  };
  return bot;
}

// AI bot logic
function updateBots() {
  if (!gameState.gameStarted || gameState.gameEnded) return;
  
  gameState.bots.forEach(bot => {
    // Find nearest coin (simple and smooth like before)
    let nearestCoin = null;
    let nearestDistance = Infinity;
    
    gameState.coins.forEach(coin => {
      const distance = Math.sqrt((coin.x - bot.x) ** 2 + (coin.y - bot.y) ** 2);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCoin = coin;
      }
    });

    // Move towards nearest coin with individual speed variation
    if (nearestCoin) {
      const dx = nearestCoin.x - bot.x;
      const dy = nearestCoin.y - bot.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        const baseSpeed = 2;
        const speed = baseSpeed * bot.speedVariation; // Use individual speed
        bot.vx = (dx / distance) * speed;
        bot.vy = (dy / distance) * speed;
      }
    }

    // Update position
    bot.x += bot.vx;
    bot.y += bot.vy;

    // Keep within world bounds
    bot.x = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, bot.x));
    bot.y = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, bot.y));

    // Check coin collection
    gameState.coins.forEach(coin => {
      const distance = Math.sqrt((coin.x - bot.x) ** 2 + (coin.y - bot.y) ** 2);
      if (distance < bot.size) {
        bot.score += coin.value;
        gameState.coins.delete(coin.id);
        
        // Respawn coin
        const newCoin = {
          id: gameState.nextCoinId++,
          ...getRandomPosition(),
          value: 1
        };
        gameState.coins.set(newCoin.id, newCoin);
      }
    });

    // Occasionally send chat messages (reduced frequency)
    const now = Date.now();
    if (now - bot.lastMessageTime > 120000 + Math.random() * 180000) { // 2-5 minutes
      if (Math.random() < 0.15) { // 15% chance (reduced from 30%)
        const message = botMessages[Math.floor(Math.random() * botMessages.length)];
        bot.lastMessageTime = now;
        
        io.emit('chatMessage', {
          playerId: bot.id,
          playerName: bot.name,
          message: message,
          timestamp: now
        });
      }
    }
  });
}

// Initialize game
function initializeGame() {
  generateCoins(200);
  
  // Create AI bots
  for (let i = 0; i < 8; i++) {
    const bot = createBot(gameState.nextBotId++);
    gameState.bots.set(bot.id, bot);
  }
}

// Start new match
function startNewMatch() {
  console.log('Starting new 24-hour match...');
  gameState.matchTimeLeft = 86400; // 24 hours
  gameState.matchStartTime = Date.now(); // Record exact start time
  gameState.gameStarted = true;
  gameState.gameEnded = false;
  
  // Reset all player scores
  gameState.players.forEach(player => {
    player.score = 0;
  });
  
  // Reset all bot scores
  gameState.bots.forEach(bot => {
    bot.score = 0;
  });
  
  // Regenerate coins
  gameState.coins.clear();
  gameState.nextCoinId = 0;
  generateCoins(200);
  
  // Notify all clients
  io.emit('matchStarted', {
    timeLeft: gameState.matchTimeLeft,
    startTime: gameState.matchStartTime,
    duration: gameState.matchDuration
  });
}

// End current match
async function endMatch() {
  console.log('Match ended!');
  gameState.gameEnded = true;
  gameState.gameStarted = false;
  
  // Get final results
  const allPlayers = [...gameState.players.values(), ...gameState.bots.values()];
  const finalResults = allPlayers.map(player => ({
    id: player.id,
    name: player.name,
    score: player.score,
    isBot: player.isBot || false
  }));
  
  // Save player statistics to Firebase
  for (const player of gameState.players.values()) {
    try {
      // Use Firebase ID if available, otherwise use socket ID
      const playerId = player.firebaseId || player.id;
      await GameDataService.savePlayerStats(playerId, {
        playerName: player.name,
        score: player.score,
        walletAddress: player.wallet || ''
      });
    } catch (error) {
      console.error('Error saving player stats:', error);
    }
  }
  
  // Save match result to Firebase
  try {
    await GameDataService.saveMatchResult({
      players: finalResults.filter(p => !p.isBot),
      winner: finalResults[0],
      playersCount: gameState.players.size,
      botsCount: gameState.bots.size,
              matchDuration: 86400 - gameState.matchTimeLeft
    });
  } catch (error) {
    console.error('Error saving match result:', error);
  }
  
  // Notify all clients
  io.emit('gameEnded', finalResults);
  
  // Start new match at the beginning of next day (GMT)
  const now = new Date();
  const nextDay = new Date(now);
  nextDay.setUTCDate(now.getUTCDate() + 1);
  nextDay.setUTCHours(0, 0, 0, 0); // Start at 00:00:00 GMT
  
  const timeUntilNextDay = nextDay.getTime() - now.getTime();
  
  console.log(`Next match will start at: ${nextDay.toUTCString()}`);
  console.log(`Time until next match: ${Math.floor(timeUntilNextDay / 1000 / 60)} minutes`);
  
  setTimeout(() => {
    if (gameState.players.size > 0 || gameState.bots.size > 0) {
      console.log('Starting new daily match at GMT 00:00');
      startNewMatch();
    }
  }, timeUntilNextDay);
}

// Match timer countdown
let timerSyncCounter = 0;
function updateMatchTimer() {
  if (!gameState.gameStarted || gameState.gameEnded || !gameState.matchStartTime) return;
  
  // Calculate accurate time based on start time
  const now = Date.now();
  const elapsed = Math.floor((now - gameState.matchStartTime) / 1000);
  gameState.matchTimeLeft = Math.max(0, gameState.matchDuration - elapsed);
  
  timerSyncCounter++;
  
  // Broadcast timer sync every 5 seconds to keep clients in sync
  if (timerSyncCounter >= 5) {
    io.emit('matchTimer', {
      timeLeft: gameState.matchTimeLeft,
      startTime: gameState.matchStartTime,
      duration: gameState.matchDuration,
      serverTime: now
    });
    timerSyncCounter = 0;
  }
  
  if (gameState.matchTimeLeft <= 0) {
    endMatch();
  }
}

// Socket.io connections
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  console.log('Total players:', gameState.players.size + 1);

  socket.on('joinGame', (playerData) => {
    const name = typeof playerData === 'string' ? playerData : playerData.name;
    const wallet = typeof playerData === 'object' ? playerData.wallet : '';
    const colorHue = typeof playerData === 'object' ? playerData.color : Math.random() * 360;
    const playerId = typeof playerData === 'object' && playerData.playerId ? playerData.playerId : socket.id;
    
    const player = {
      id: socket.id,
      firebaseId: playerId, // Store Firebase user ID separately from socket ID
      name: name || `Player${Math.floor(Math.random() * 1000)}`,
      wallet: wallet,
      ...getRandomPosition(),
      vx: 0,
      vy: 0,
      score: 0,
      size: 20,
      color: `hsl(${colorHue}, 70%, 50%)`,
      isBot: false
    };
    
    gameState.players.set(socket.id, player);
    
    // Send initial game state
    socket.emit('gameState', {
      players: Array.from(gameState.players.values()),
      bots: Array.from(gameState.bots.values()),
      coins: Array.from(gameState.coins.values()),
      worldSize: gameState.worldSize,
      playerId: socket.id
    });
    
    // Send current timer state with start time for synchronization
    socket.emit('matchTimer', {
      timeLeft: gameState.matchTimeLeft,
      startTime: gameState.matchStartTime,
      duration: gameState.matchDuration,
      serverTime: Date.now()
    });
    
    // Start match if this is the first player and game hasn't started
    if (gameState.players.size === 1 && !gameState.gameStarted && !gameState.gameEnded) {
      startNewMatch();
    }
  });

  socket.on('playerMove', (movement) => {
    const player = gameState.players.get(socket.id);
    if (player && gameState.gameStarted && !gameState.gameEnded) {
      const speed = 3;
      player.vx = movement.x * speed;
      player.vy = movement.y * speed;
      
      // Update position
      player.x += player.vx;
      player.y += player.vy;
      
      // Keep within world bounds
      player.x = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, player.x));
      player.y = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, player.y));

      // Check coin collection
      gameState.coins.forEach(coin => {
        const distance = Math.sqrt((coin.x - player.x) ** 2 + (coin.y - player.y) ** 2);
        if (distance < player.size) {
          player.score += coin.value;
          gameState.coins.delete(coin.id);
          
          // Respawn coin
          const newCoin = {
            id: gameState.nextCoinId++,
            ...getRandomPosition(),
            value: 1
          };
          gameState.coins.set(newCoin.id, newCoin);
        }
      });
    }
  });

  socket.on('chatMessage', (data) => {
    const player = gameState.players.get(socket.id);
    if (player && data.message && data.message.trim().length > 0) {
      io.emit('chatMessage', {
        playerId: socket.id,
        playerName: player.name,
        message: data.message.trim(),
        timestamp: Date.now()
      });
    }
  });

  socket.on('requestNewGame', () => {
    // Start new match immediately when requested
    if (!gameState.gameStarted || gameState.gameEnded) {
      startNewMatch();
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    gameState.players.delete(socket.id);
  });
});

// Game loop
setInterval(() => {
  updateBots();
  
  // Broadcast game state
  io.emit('gameUpdate', {
    players: Array.from(gameState.players.values()),
    bots: Array.from(gameState.bots.values()),
    coins: Array.from(gameState.coins.values())
  });
}, 1000 / 60); // 60 FPS

// Timer loop (every second)
setInterval(() => {
  updateMatchTimer();
}, 1000);

// Initialize and start server
initializeGame();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open your browser and go to: http://localhost:${PORT}`);
}); 