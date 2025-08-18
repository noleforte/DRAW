const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { GameDataService } = require('./firebase-admin');

// Helper function to get time until end of GMT day
function getTimeUntilEndOfGMTDay() {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);
  return Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));
}

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
app.use(express.raw({ type: 'application/json' })); // For sendBeacon support
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

// API endpoint for player total coins
app.get('/api/player/:playerId/coins', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    const totalCoins = await GameDataService.getPlayerTotalCoins(playerId);
    res.json({ totalCoins });
  } catch (error) {
    console.error('Error fetching player total coins:', error);
    res.status(500).json({ error: 'Failed to fetch player total coins' });
  }
});

// API endpoint for updating player's best score
app.post('/api/player/:playerId/best-score', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    const { score } = req.body;
    
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'Invalid score value' });
    }
    
    const updated = await GameDataService.updateBestScore(playerId, score);
    res.json({ updated, score });
  } catch (error) {
    console.error('Error updating player best score:', error);
    res.status(500).json({ error: 'Failed to update best score' });
  }
});

// API endpoint for saving completed game session
app.post('/api/player/:playerId/session', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    
    // Handle both regular JSON and sendBeacon requests
    let sessionData;
    if (Buffer.isBuffer(req.body)) {
      sessionData = JSON.parse(req.body.toString());
    } else {
      sessionData = req.body;
    }
    
    const success = await GameDataService.saveGameSession(playerId, sessionData);
    console.log(`💾 Game session saved for player ${playerId}: score ${sessionData.score}`);
    res.json({ success });
  } catch (error) {
    console.error('Error saving game session:', error);
    res.status(500).json({ error: 'Failed to save game session' });
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
  matchTimeLeft: getTimeUntilEndOfGMTDay(), // Time until end of current GMT day
  matchStartTime: null, // When the current match started
  matchDuration: getTimeUntilEndOfGMTDay(), // Duration until end of GMT day
  gameStarted: false,
  gameEnded: false
};

// Bot names (realistic player names)
const botNames = [
  'Alex', 'Mike', 'Sarah', 'John', 'Emma', 'David', 'Lisa', 'Tom', 'Anna', 'Chris',
  'Maria', 'James', 'Kate', 'Ben', 'Sofia', 'Nick', 'Amy', 'Dan', 'Luna', 'Max',
  'Zoe', 'Ryan', 'Mia', 'Sam', 'Lea', 'Jake', 'Ivy', 'Leo', 'Eva', 'Noah',
  'Ava', 'Luke', 'Eli', 'Kai', 'Joy', 'Tim', 'Sky', 'Ace', 'Rio', 'Zara'
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
function generateCoins(count = 300) {
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
    name: botNames[Math.floor(Math.random() * botNames.length)],
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

// Update player positions with smooth 60fps movement
function updatePlayers(deltaTime) {
  gameState.players.forEach(player => {
    // Smooth velocity interpolation for 60fps movement
    const lerpFactor = Math.min(1, deltaTime * 8); // Smooth acceleration/deceleration
    player.vx += (player.targetVx - player.vx) * lerpFactor;
    player.vy += (player.targetVy - player.vy) * lerpFactor;
    
    // Update position based on velocity and deltaTime
    player.x += player.vx * deltaTime;
    player.y += player.vy * deltaTime;
    
    // Keep within world bounds
    player.x = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, player.x));
    player.y = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, player.y));
    
    // Check coin collection
    const coinsToDelete = [];
    const coinsToSave = [];
    
    gameState.coins.forEach((coin) => {
      const distance = Math.sqrt((coin.x - player.x) ** 2 + (coin.y - player.y) ** 2);
      if (distance < player.size) {
        player.score += coin.value;
        coinsToDelete.push(coin.id);
        
        // Queue coin for Firebase saving
        if (player.firebaseId) {
          coinsToSave.push({ playerId: player.firebaseId, value: coin.value, playerName: player.name });
        }
        
        // Player growth based on score (Agar.io style)
        player.size = Math.min(50, 20 + Math.sqrt(player.score) * 2);
      }
    });
    
    // Process collected coins
    coinsToDelete.forEach(coinId => {
      gameState.coins.delete(coinId);
      
      // Respawn coin
      const newCoin = {
        id: gameState.nextCoinId++,
        ...getRandomPosition(),
        value: 1
      };
      gameState.coins.set(newCoin.id, newCoin);
    });
    
    // Save coins to Firebase in batch (non-blocking)
    if (coinsToSave.length > 0) {
      // Use setTimeout to avoid blocking the game loop
      setTimeout(async () => {
        for (const coinData of coinsToSave) {
          try {
            await GameDataService.savePlayerCoin(coinData.playerId, coinData.value);
            console.log(`💾 Saved coin to Firestore for player ${coinData.playerName} (${coinData.playerId})`);
          } catch (error) {
            console.error('Error saving coin to Firestore:', error);
          }
        }
      }, 0);
    }
    
    // Check eating other players/bots (Agar.io mechanics)
    const allEntities = [...gameState.players.values(), ...gameState.bots.values()];
    allEntities.forEach(target => {
      if (target.id !== player.id && !target.isBot !== !player.isBot) {
        const distance = Math.sqrt((target.x - player.x) ** 2 + (target.y - player.y) ** 2);
        const sizeRatio = player.size / target.size;
        
        // Can eat if 15% larger and touching
        if (sizeRatio > 1.15 && distance < (player.size + target.size) * 0.7) {
          player.score += target.score;
          player.size = Math.min(50, 20 + Math.sqrt(player.score) * 2);
          
          // Remove eaten entity
          if (target.isBot) {
            gameState.bots.delete(target.id);
          } else {
            gameState.players.delete(target.id);
          }
          
          // Silent eating - no logs
        }
      }
    });
  });
}

// Initialize game
// Bot simulation system
function startBotSimulation() {
  // Make existing bots also leave randomly (after 1-5 minutes)
  function scheduleExistingBotLeave() {
    const existingBots = Array.from(gameState.bots.values());
    existingBots.forEach(bot => {
      const leaveDelay = 60000 + Math.random() * 240000; // 1-5 minutes
      setTimeout(() => {
        // Check if bot still exists and there are enough bots
        if (gameState.bots.has(bot.id) && gameState.bots.size > 5) {
          gameState.bots.delete(bot.id);
          
          // Notify players about leaving "player"
          if (gameState.players.size > 0) {
            const leaveMessages = [
              `${bot.name} left the game`,
              `${bot.name} disconnected`,
              `Goodbye ${bot.name}!`,
              `${bot.name} went offline`,
              `See you later, ${bot.name}!`
            ];
            const message = leaveMessages[Math.floor(Math.random() * leaveMessages.length)];
            io.emit('chatMessage', {
              playerId: 'system',
              playerName: 'System',
              message: message,
              timestamp: Date.now(),
              isSystem: true
            });
          }
        }
      }, leaveDelay);
    });
  }
  
  function scheduleNextBotEvent() {
    // Random delay between 20 seconds and 3 minutes
    const delay = 20000 + Math.random() * 160000;
    
    setTimeout(() => {
      const currentBotCount = gameState.bots.size;
      const maxBots = 15;
      const minBots = 5;
      
      // Random chance to add or remove a bot
      const action = Math.random();
      
      if (action <= 0.5 && currentBotCount < maxBots) {
        // 50% chance to add a bot (player joins)
        const newBot = createBot(gameState.nextBotId++);
        gameState.bots.set(newBot.id, newBot);
        
        // Notify players about new "player"
        if (gameState.players.size > 0) {
          const joinMessages = [
            `${newBot.name} joined the game!`,
            `Welcome ${newBot.name}!`,
            `${newBot.name} entered the battlefield!`,
            `${newBot.name} is ready to play!`,
            `A new player ${newBot.name} appeared!`
          ];
          const message = joinMessages[Math.floor(Math.random() * joinMessages.length)];
          io.emit('chatMessage', {
            playerId: 'system',
            playerName: 'System',
            message: message,
            timestamp: Date.now(),
            isSystem: true
          });
        }
        
      } else if (action > 0.5 && currentBotCount > minBots) {
        // 50% chance to remove a bot (player leaves)
        const botIds = Array.from(gameState.bots.keys());
        const randomBotId = botIds[Math.floor(Math.random() * botIds.length)];
        const leavingBot = gameState.bots.get(randomBotId);
        
        if (leavingBot) {
          gameState.bots.delete(randomBotId);
          
          // Notify players about leaving "player"
          if (gameState.players.size > 0) {
            const leaveMessages = [
              `${leavingBot.name} left the game`,
              `${leavingBot.name} disconnected`,
              `Goodbye ${leavingBot.name}!`,
              `${leavingBot.name} went offline`,
              `See you later, ${leavingBot.name}!`
            ];
            const message = leaveMessages[Math.floor(Math.random() * leaveMessages.length)];
            io.emit('chatMessage', {
              playerId: 'system',
              playerName: 'System',
              message: message,
              timestamp: Date.now(),
              isSystem: true
            });
          }
                  }
        } else {
        }
        
        // Schedule next event
        scheduleNextBotEvent();
    }, delay);
  }
  
  // Schedule existing bots to leave randomly
  scheduleExistingBotLeave();
  
  // Start the simulation with a quick first event (5-30 seconds)
  const firstEventDelay = 5000 + Math.random() * 25000;
  
  setTimeout(() => {
    scheduleNextBotEvent();
  }, firstEventDelay);
  
  // Fallback: force bot action after 2 minutes if nothing happened
  setTimeout(() => {
    if (gameState.bots.size < 15) {
      const newBot = createBot(gameState.nextBotId++);
      gameState.bots.set(newBot.id, newBot);
    }
  }, 120000); // 2 minutes
}

function initializeGame() {
  generateCoins(300);
  
  // Create initial AI bots (start with fewer)
  for (let i = 0; i < 8; i++) {
    const bot = createBot(gameState.nextBotId++);
    gameState.bots.set(bot.id, bot);
  }
  
  // Start bot simulation (players joining/leaving)
  startBotSimulation();
}

// Start new match
function startNewMatch() {
  // Calculate time until end of current GMT day
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999); // End at 23:59:59.999 GMT
  
  const timeUntilEndOfDay = Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
  
  gameState.matchTimeLeft = timeUntilEndOfDay;
  gameState.matchDuration = timeUntilEndOfDay;
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
  generateCoins(300);
  
  // Notify all clients
  const matchStartNow = new Date();
  const matchEndOfDay = new Date(matchStartNow);
  matchEndOfDay.setUTCHours(23, 59, 59, 999);
  
  io.emit('matchStarted', {
    timeLeft: gameState.matchTimeLeft,
    endOfDayGMT: matchEndOfDay.getTime()
  });
}

// End current match
async function endMatch() {
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
  
  setTimeout(() => {
    if (gameState.players.size > 0 || gameState.bots.size > 0) {
      startNewMatch();
    }
  }, timeUntilNextDay);
}

// Match timer countdown
let timerSyncCounter = 0;
function updateMatchTimer() {
  if (!gameState.gameStarted || gameState.gameEnded) return;
  
  // Calculate time remaining until end of current GMT day
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999); // End at 23:59:59.999 GMT
  
  gameState.matchTimeLeft = Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));
  
  timerSyncCounter++;
  
  // Broadcast timer sync every 5 seconds to keep clients in sync
  if (timerSyncCounter >= 5) {
    io.emit('matchTimer', {
      timeLeft: gameState.matchTimeLeft,
      serverTime: Date.now(),
      endOfDayGMT: endOfDay.getTime()
    });
    timerSyncCounter = 0;
  }
  
  if (gameState.matchTimeLeft <= 0) {
    endMatch();
  }
}

// Player reconnection storage
const disconnectedPlayers = new Map();

// Socket.io connections
io.on('connection', (socket) => {
  // Heartbeat to detect connection issues
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });
  
  socket.on('ping', () => {
    socket.isAlive = true;
    socket.emit('pong');
  });

  socket.on('joinGame', (playerData) => {
    const name = typeof playerData === 'string' ? playerData : playerData.name;
    const wallet = typeof playerData === 'object' ? playerData.wallet : '';
    const colorHue = typeof playerData === 'object' ? playerData.color : Math.random() * 360;
    const playerId = typeof playerData === 'object' && playerData.playerId ? playerData.playerId : socket.id;
    
    // Check for reconnection
    let player = null;
    if (playerId && disconnectedPlayers.has(playerId)) {
      // Restore disconnected player
      player = disconnectedPlayers.get(playerId);
      player.id = socket.id; // Update socket ID
      disconnectedPlayers.delete(playerId);
    } else {
      // New player
      player = {
        id: socket.id,
        firebaseId: playerId, // Store Firebase user ID separately from socket ID
        name: name || `Player${Math.floor(Math.random() * 1000)}`,
        wallet: wallet,
        ...getRandomPosition(),
        vx: 0,
        vy: 0,
        targetVx: 0, // Add target velocity for smooth 60fps movement
        targetVy: 0,
        score: 0,
        size: 20,
        color: `hsl(${colorHue}, 70%, 50%)`,
        isBot: false
      };
    }
    
    gameState.players.set(socket.id, player);
    
    // Send initial game state
    socket.emit('gameState', {
      players: Array.from(gameState.players.values()),
      bots: Array.from(gameState.bots.values()),
      coins: Array.from(gameState.coins.values()),
      worldSize: gameState.worldSize,
      playerId: socket.id
    });
    
    // Send current timer state for synchronization
    const timerNow = new Date();
    const timerEndOfDay = new Date(timerNow);
    timerEndOfDay.setUTCHours(23, 59, 59, 999);
    
    socket.emit('matchTimer', {
      timeLeft: gameState.matchTimeLeft,
      serverTime: Date.now(),
      endOfDayGMT: timerEndOfDay.getTime()
    });
    
    // Start match if this is the first player and game hasn't started
    if (gameState.players.size === 1 && !gameState.gameStarted && !gameState.gameEnded) {
      startNewMatch();
    }
  });

  socket.on('playerMove', (movement) => {
    const player = gameState.players.get(socket.id);
    if (player && gameState.gameStarted && !gameState.gameEnded) {
      const speed = 200; // pixels per second for 60fps smooth movement
      // Set target velocity instead of instant position update
      player.targetVx = movement.x * speed;
      player.targetVy = movement.y * speed;
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
    // Save player state for potential reconnection (5 minutes)
    const player = gameState.players.get(socket.id);
    if (player && player.firebaseId) {
      // Save game session when player disconnects
      if (player.score > 0) {
        GameDataService.saveGameSession(player.firebaseId, {
          playerName: player.name,
          score: player.score,
          walletAddress: player.wallet || ''
        }).catch(error => {
          console.error('Error saving game session on disconnect:', error);
        });
        console.log(`💾 Saved game session for disconnecting player ${player.name} (score: ${player.score})`);
      }
      
      disconnectedPlayers.set(player.firebaseId, player);
      setTimeout(() => {
        if (disconnectedPlayers.has(player.firebaseId)) {
          disconnectedPlayers.delete(player.firebaseId);
        }
      }, 5 * 60 * 1000); // 5 minutes
    }
    
    gameState.players.delete(socket.id);
  });
});

// Game loop variables
let lastUpdate = Date.now();
let updateCounter = 0;

// Game loop (optimized)
setInterval(() => {
  const now = Date.now();
  const deltaTime = (now - lastUpdate) / 1000;
  lastUpdate = now;
  
  // Update game logic with deltaTime for smooth 60fps movement
  updatePlayers(deltaTime);
  updateBots();
  
  // Only broadcast every 3rd frame (20 FPS instead of 60)
  updateCounter++;
  if (updateCounter >= 3) {
    updateCounter = 0;
    
    // Only send essential data, not full objects
    const gameUpdate = {
      players: Array.from(gameState.players.values()).map(p => ({
        id: p.id,
        x: Math.round(p.x),
        y: Math.round(p.y),
        vx: Math.round(p.vx * 10) / 10, // Send velocity for client-side interpolation
        vy: Math.round(p.vy * 10) / 10,
        score: p.score,
        size: p.size,
        name: p.name,
        color: p.color
      })),
      bots: Array.from(gameState.bots.values()).map(b => ({
        id: b.id,
        x: Math.round(b.x),
        y: Math.round(b.y),
        score: b.score,
        size: b.size,
        name: b.name,
        color: b.color
      })),
      coins: Array.from(gameState.coins.values()).map(c => ({
        id: c.id,
        x: Math.round(c.x),
        y: Math.round(c.y)
      }))
    };
    
    io.emit('gameUpdate', gameUpdate);
  }
}, 1000 / 60); // 60 FPS logic, 20 FPS network

// Timer loop (every second)
setInterval(() => {
  updateMatchTimer();
}, 1000);

// Heartbeat check every 30 seconds
setInterval(() => {
  io.sockets.sockets.forEach((socket) => {
    if (socket.isAlive === false) {
      socket.disconnect();
      return;
    }
    
    socket.isAlive = false;
    socket.emit('ping'); // Use Socket.IO ping instead
  });
}, 30000);

// Initialize and start server
initializeGame();

// Keep Render server awake (ping every 14 minutes)
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    // Silent ping to keep server awake
  }, 14 * 60 * 1000); // 14 minutes
}

// Debug bot status every 30 seconds
setInterval(() => {
  // Silent monitoring - no logs
}, 30000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open your browser and go to: http://localhost:${PORT}`);
  console.log(`🤖 Current bots in game: ${gameState.bots.size}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  
  // Notify all clients about server shutdown
  io.emit('serverShutdown', { message: 'Server is restarting, please wait...' });
  
  server.close(() => {
    console.log('💤 Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('💤 Server closed');
    process.exit(0);
  });
}); 