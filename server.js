const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const gameState = {
  players: new Map(),
  coins: new Map(),
  bots: new Map(),
  worldSize: 4000, // Large world size
  nextCoinId: 0,
  nextBotId: 0,
  matchTimeLeft: 120, // 2 minutes in seconds
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
  console.log('Starting new match...');
  gameState.matchTimeLeft = 120;
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
    timeLeft: gameState.matchTimeLeft
  });
}

// End current match
function endMatch() {
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
  
  // Notify all clients
  io.emit('gameEnded', finalResults);
  
  // Start new match after 10 seconds
  setTimeout(() => {
    if (gameState.players.size > 0 || gameState.bots.size > 0) {
      startNewMatch();
    }
  }, 10000);
}

// Match timer countdown
let timerSyncCounter = 0;
function updateMatchTimer() {
  if (!gameState.gameStarted || gameState.gameEnded) return;
  
  gameState.matchTimeLeft--;
  timerSyncCounter++;
  
  // Broadcast timer sync every 10 seconds to keep clients in sync
  if (timerSyncCounter >= 10) {
    io.emit('matchTimer', gameState.matchTimeLeft);
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
    
    const player = {
      id: socket.id,
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
    
    // Send current timer state
    socket.emit('matchTimer', gameState.matchTimeLeft);
    
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