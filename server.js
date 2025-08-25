const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { GameDataService, updateUser, updateUserLastLogin, getAllUsers } = require('./firebase-admin');
const bcrypt = require('bcrypt'); // For password hashing
const crypto = require('crypto'); // For generating secure tokens
const jwt = require('jsonwebtoken'); // For JWT tokens

// JWT Secret (in production use environment variable) - ПЕРЕМЕЩАЕМ ВВЕРХ!
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

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
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://draw-e67b.onrender.com', 'https://caballcoin-eight.vercel.app'] 
      : ['http://localhost:3001', 'http://127.0.0.1:3001'],
    methods: ["GET", "POST"],
    credentials: true
  } 
});

// Улучшенный middleware аутентификации
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) {
      console.log('❌ JWT verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.user = payload; // { userId, email, nickname }
    next();
  });
}

// Utility function to generate unique user ID
function generateUserId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  } else {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
}

// Лёгкий /health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    ok: true, 
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// Упрощённый CORS
app.use(cors({
  origin: [
    'https://caballcoin-eight.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

app.options('*', cors());

app.use(express.json());
app.use(express.raw({ type: 'application/json' })); // For sendBeacon support
app.use(express.static(path.join(__dirname, 'public')));

// Game state - must be defined before API endpoints
const gameState = {
  players: new Map(),
  coins: new Map(),
  bots: new Map(),
  boosters: new Map(),
  worldSize: 4000, // Large world size
  nextCoinId: 0,
  nextBotId: 0,
  nextBoosterId: 0,
  matchTimeLeft: getTimeUntilEndOfGMTDay(), // Time until end of current GMT day
  matchStartTime: null, // When the current match started
  matchDuration: getTimeUntilEndOfGMTDay(), // Duration until end of GMT day
  gameStarted: false,
  gameEnded: false
};

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

// API endpoint for all players with online/offline status
app.get('/api/players', async (req, res) => {
  try {
    console.log('🔄 API /api/players called');
    const allPlayers = await getAllUsers();
    console.log(`🔄 Retrieved ${allPlayers.length} players from getAllUsers:`, allPlayers);
    
    // Current online players for debugging
    const onlinePlayerIds = Array.from(gameState.players.values()).map(p => p.id || p.playerId || p.name);
    console.log('🔄 Current online players:', onlinePlayerIds);
    
    // Add online/offline status
    const playersWithStatus = allPlayers.map(player => {
      const isOnline = gameState.players.has(player.socketId) || 
                      Array.from(gameState.players.values()).some(p => 
                        p.firebaseId === player.playerId || 
                        p.playerId === player.playerId ||
                        p.id === player.playerId ||
                        p.name === player.nickname ||
                        p.name === player.playerName
                      );
      
      console.log(`🔄 Player ${player.nickname} (${player.playerId}) - isOnline: ${isOnline}`);
      
      return {
        ...player,
        isOnline: isOnline,
        lastSeen: player.lastPlayed || null
      };
    });
    
    console.log(`🔄 Sending ${playersWithStatus.length} players with status:`, playersWithStatus);
    res.json(playersWithStatus);
  } catch (error) {
    console.error('❌ Error fetching all players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
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

// API endpoint for updating player's full stats (score, totalScore, gamesPlayed)
app.post('/api/player/:playerId/stats', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    const { score, totalScore, gamesPlayed } = req.body;
    
    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'Invalid score value' });
    }
    
    if (typeof totalScore !== 'number' || totalScore < 0) {
      return res.status(400).json({ error: 'Invalid totalScore value' });
    }
    
    const updated = await GameDataService.updatePlayerFullStats(playerId, { score, totalScore, gamesPlayed });
    res.json({ updated, score, totalScore, gamesPlayed });
  } catch (error) {
    console.error('Error updating player stats:', error);
    res.status(500).json({ error: 'Failed to update player stats' });
  } 
});
 
// Clean up duplicate player documents
app.post('/api/admin/cleanup-duplicates', async (req, res) => {
  try {
    console.log('🧹 Admin cleanup request received');
    await GameDataService.cleanupDuplicatePlayers();
    res.json({ success: true, message: 'Cleanup completed successfully' });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Failed to cleanup duplicate documents' });
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
    res.json({ success });
  } catch (error) {
    console.error('Error saving game session:', error);
    res.status(500).json({ error: 'Failed to save game session' });
  }
});

// Calculate speed multiplier based on score (more coins = slower)
function calculateSpeedMultiplier(score) {
  // Score-based speed system:
  // 0-100 coins: 100% speed (fast)
  // 100-250 coins: 85% speed
  // 250-500 coins: 70% speed  
  // 500-1000 coins: 55% speed
  // 1000+ coins: 40% speed (slow)
  
  if (score <= 100) {
    return 1.75; // 100% speed for 0-100 coins
  } else if (score <= 250) {
    // Linear interpolation from 100% to 85% for 100-250 coins
    const progress = (score - 100) / 150;
    return 1.50 - (progress * 0.15);
  } else if (score <= 500) {
    // Linear interpolation from 85% to 70% for 250-500 coins
    const progress = (score - 250) / 250;
    return 1.25 - (progress * 0.15);
  } else if (score <= 1000) {
    // Linear interpolation from 70% to 55% for 500-1000 coins
    const progress = (score - 500) / 500;
    return 1.0 - (progress * 0.15);
  } else {
    // 40% speed for 1000+ coins
    return 0.75;
  }
}

// Helper function to calculate player size based on score
function calculatePlayerSize(score) {
  // Ensure minimum size of 20 for all players (even with 0 score)
  const calculatedSize = Math.min(50, 20 + Math.sqrt(score) * 2);
  return Math.max(20, calculatedSize); // Never go below 20
}

// Check for AFK players and kick them
function checkAFKPlayers() {
  const now = Date.now();
  const afkTimeLimit = 2 * 60 * 1000; // 2 minutes in milliseconds
  const playersToKick = [];

  gameState.players.forEach((player, socketId) => {
    if (player.isBot) return; // Skip bots
    
    const timeSinceLastActivity = now - player.lastActivity;
    
    // Check if player has been inactive for more than 2 minutes
    if (timeSinceLastActivity > afkTimeLimit) {
      playersToKick.push({ player, socketId });
    }
  });

  // Kick AFK players
  playersToKick.forEach(({ player, socketId }) => {
    console.log(`⏰ Kicking AFK player: ${player.name} (${player.score} coins, inactive for ${Math.floor((now - player.lastActivity) / 1000)}s)`);
    
    // Save player's coins before kicking (same as death)
          if (player.score > 0 && (player.id || player.firebaseId || player.playerId)) {
        const playerIdForSave = player.id || player.firebaseId || player.playerId;
      GameDataService.savePlayerCoin(playerIdForSave, player.score)
        .then(() => {
          console.log(`💰 Saved ${player.score} coins for AFK player: ${player.name}`);
        })
        .catch((error) => {
          console.error(`❌ Failed to save coins for AFK player ${player.name}:`, error);
        });
    }
    
    // Save game session (match) for AFK player
    if ((player.id || player.firebaseId || player.playerId)) {
      const playerIdForSave = player.id || player.firebaseId || player.playerId;
      GameDataService.saveGameSession(playerIdForSave, {
        playerName: player.name,
        score: player.score,
        walletAddress: player.wallet || ''
      }).then(() => {
        console.log(`💾 Saved game session for AFK player: ${player.name}`);
      }).catch((error) => {
        console.error(`❌ Failed to save game session for AFK player ${player.name}:`, error);
      });
    }

    // Send AFK kick message to player
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      console.log(`📤 Sending AFK kick to player: ${player.name}`);
      
      // Send playerEaten event for compatibility
      socket.emit('playerEaten', {
        victimId: socketId,
        eatenByBot: 'AFK System',
        coinsLost: player.score,
        coinsSaved: player.score
      });
      
      console.log(`✅ AFK kick sent to player: ${player.name}`);
    }

    // Remove player from game
    gameState.players.delete(socketId);
    console.log(`🗑️ Removed AFK player from game: ${player.name}`);
    
    // Debug: Log all players after removal
    console.log(`🔍 Players remaining after AFK removal:`, Array.from(gameState.players.values()).map(p => ({
      name: p.name,
      id: p.id,
      firebaseId: p.firebaseId,
      score: p.score,
      size: p.size
    })));
  });
  
  if (playersToKick.length > 0) {
    console.log(`⏰ AFK check completed: kicked ${playersToKick.length} inactive players`);
  }
}

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

// Bot hunting messages
const botHuntingMessages = [
  "Looking for a snack!", "Time to hunt!", "I see you...",
  "Come here little one!", "You look tasty!", "Fresh meat!",
  "I have more coins than you!", "Easy target spotted!", "Dinner time!",
  "You can't hide!", "I'm coming for you!", "Coin count matters!"
];

// Generate random position within world bounds
function getRandomPosition() {
  // Ensure coins spawn across the entire game field for better distribution
  const margin = 100; // Increased margin to avoid very edges
  const minX = -gameState.worldSize/2 + margin;
  const maxX = gameState.worldSize/2 - margin;
  const minY = -gameState.worldSize/2 + margin;
  const maxY = gameState.worldSize/2 - margin;
  
  // Use full random distribution across the entire available area
  const x = minX + (maxX - minX) * Math.random(); // Full range distribution
  const y = minY + (maxY - minY) * Math.random(); // Full range distribution
  
  return { x, y };
}

// Get random position with minimum distance from existing boosters
function getRandomPositionWithMinDistance(minDistance = 800, maxAttempts = 100) {
  const margin = 50;
  const minX = -gameState.worldSize/2 + margin;
  const minY = -gameState.worldSize/2 + margin;
  const maxX = gameState.worldSize/2 - margin;
  const maxY = gameState.worldSize/2 - margin;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate random position with full area utilization for better distribution
    const x = minX + (maxX - minX) * Math.random();
    const y = minY + (maxY - minY) * Math.random();
    
    // Check distance from all existing boosters
    let isTooClose = false;
    for (const booster of gameState.boosters.values()) {
      const distance = Math.sqrt((x - booster.x) ** 2 + (y - booster.y) ** 2);
      if (distance < minDistance) {
        isTooClose = true;
        break;
      }
    }
    
    // Also check distance from players and bots to avoid spawning on top of them
    if (!isTooClose) {
      const minPlayerDistance = 200; // Minimum distance from players/bots
      
      for (const player of gameState.players.values()) {
        const distance = Math.sqrt((x - player.x) ** 2 + (y - player.y) ** 2);
        if (distance < minPlayerDistance) {
          isTooClose = true;
          break;
        }
      }
      
      if (!isTooClose) {
        for (const bot of gameState.bots.values()) {
          const distance = Math.sqrt((x - bot.x) ** 2 + (y - bot.y) ** 2);
          if (distance < minPlayerDistance) {
            isTooClose = true;
            break;
          }
        }
      }
    }
    
    // If position is far enough from all boosters, return it
    if (!isTooClose) {
      console.log(`✅ Found position with minimum distance ${minDistance}px after ${attempt + 1} attempts`);
      return { x, y };
    }
  }
  
  // If all attempts failed, return a random position (fallback)
  console.log(`⚠️ Could not find position with minimum distance ${minDistance}px after ${maxAttempts} attempts, using fallback`);
  return getRandomPosition();
}

// Generate coins with better distribution
function generateCoins(count = 300) {
  const margin = 100; // Increased margin to avoid very edges
  const minX = -gameState.worldSize/2 + margin;
  const maxX = gameState.worldSize/2 - margin;
  const minY = -gameState.worldSize/2 + margin;
  const maxY = gameState.worldSize/2 - margin;
  
  // Create a grid-based distribution for more even spacing across the entire map
  const gridSize = Math.ceil(Math.sqrt(count));
  const cellWidth = (maxX - minX) / gridSize;
  const cellHeight = (maxY - minY) / gridSize;
  
  console.log(`🎯 Generating ${count} coins with grid size ${gridSize}x${gridSize}, cell size: ${cellWidth.toFixed(0)}x${cellHeight.toFixed(0)}`);
  
  for (let i = 0; i < count; i++) {
    // Calculate grid position
    const gridX = i % gridSize;
    const gridY = Math.floor(i / gridSize);
    
    // Add randomness within each grid cell for natural distribution
    const randomOffsetX = (Math.random() - 0.5) * cellWidth * 0.8; // Increased randomness
    const randomOffsetY = (Math.random() - 0.5) * cellHeight * 0.8; // Increased randomness
    
    const coin = {
      id: gameState.nextCoinId++,
      x: minX + gridX * cellWidth + randomOffsetX,
      y: minY + gridY * cellHeight + randomOffsetY,
      value: 1
    };
    
    // Ensure minimum distance from other coins
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
      let tooClose = false;
      gameState.coins.forEach(existingCoin => {
        const distance = Math.sqrt((existingCoin.x - coin.x) ** 2 + (existingCoin.y - coin.y) ** 2);
        if (distance < 30) { // Minimum distance between coins
          tooClose = true;
        }
      });
      
      if (!tooClose) break;
      
      // Try new position within the same grid cell with more randomness
      const newRandomOffsetX = (Math.random() - 0.5) * cellWidth * 0.6;
      const newRandomOffsetY = (Math.random() - 0.5) * cellHeight * 0.6;
      coin.x = minX + gridX * cellWidth + newRandomOffsetX;
      coin.y = minY + gridY * cellHeight + newRandomOffsetY;
      attempts++;
    }
    
    // Ensure coin is within bounds
    coin.x = Math.max(minX, Math.min(maxX, coin.x));
    coin.y = Math.max(minY, Math.min(maxY, coin.y));
    
    gameState.coins.set(coin.id, coin);
  }
  
  console.log(`✅ Generated ${gameState.coins.size} coins with even distribution across the entire map`);
}

// Function to redistribute coins if they get too clustered
function redistributeCoinsIfNeeded() {
  const coins = Array.from(gameState.coins.values());
  if (coins.length < 10) return; // Not enough coins to redistribute
  
  // Check if coins are too clustered
  let totalDistance = 0;
  let pairCount = 0;
  
  for (let i = 0; i < coins.length; i++) {
    for (let j = i + 1; j < coins.length; j++) {
      const distance = Math.sqrt((coins[i].x - coins[j].x) ** 2 + (coins[i].y - coins[j].y) ** 2);
      totalDistance += distance;
      pairCount++;
    }
  }
  
  const averageDistance = totalDistance / pairCount;
  const expectedDistance = gameState.worldSize / Math.sqrt(coins.length); // Expected distance for even distribution
  
  // If coins are too clustered (average distance is much less than expected), redistribute some
  if (averageDistance < expectedDistance * 0.3) {
    console.log('🔄 Redistributing clustered coins...');
    
    // Redistribute 20% of coins
    const coinsToRedistribute = Math.floor(coins.length * 0.2);
    const shuffledCoins = coins.sort(() => Math.random() - 0.5);
    
            for (let i = 0; i < coinsToRedistribute; i++) {
          const coin = shuffledCoins[i];
          const newPos = getRandomPositionWithMinDistance(50); // Minimum 50px distance from other coins
          coin.x = newPos.x;
          coin.y = newPos.y;
        }
  }
}

// Generate boosters
function generateBoosters(count = 2) { // Player Eater + Coin Boosters
  // Generate Player Eater booster (only 1 on the map)
  const playerEaterBooster = {
    id: `booster_${gameState.nextBoosterId++}`,
    ...getRandomPositionWithMinDistance(800), // Minimum 800px distance from other boosters
    type: 'playerEater',
    name: 'Player Eater',
    color: 'rainbow', // Special rainbow color
    effect: 'Player Eater',
    isBooster: true,
    rainbowHue: 0 // For rainbow animation
  };
  gameState.boosters.set(playerEaterBooster.id, playerEaterBooster);
  
  // Check current number of Coin Multiplier boosters
  let existingCoinBoosters = 0;
  for (const booster of gameState.boosters.values()) {
    if (booster.type === 'coins') {
      existingCoinBoosters++;
    }
  }
  
  // Calculate how many Coin Boosters to generate (max 4 total)
  const coinBoostersToGenerate = Math.max(0, 4 - existingCoinBoosters);
  
  // Generate Coin Boosters with minimum distance between them
  for (let i = 0; i < coinBoostersToGenerate; i++) {
    const coinBooster = {
      id: `booster_${gameState.nextBoosterId++}`,
      ...getRandomPositionWithMinDistance(800), // Minimum 800px distance from other boosters
      type: 'coins',
      name: 'Coin Multiplier',
      color: '#FFD700', // Gold color
      effect: 'Coin Multiplier',
      isBooster: true,
      spawnTime: Date.now() // Track when booster spawned
    };
    gameState.boosters.set(coinBooster.id, coinBooster);
    
    // Set auto-respawn timer for this coin booster (2 minutes from spawn)
    setTimeout(() => {
      respawnCoinBooster(coinBooster.id);
    }, 120000); // 2 minutes = 120000ms
  }
  
  console.log(`🎯 Generated boosters: 1 Player Eater + ${coinBoostersToGenerate} Coin Boosters (${existingCoinBoosters + coinBoostersToGenerate} total) with minimum 800px spacing`);
}

// Create AI bot
function createBot(id) {
  const bot = {
    id: `bot_${id}`,
    name: botNames[Math.floor(Math.random() * botNames.length)],
    ...getRandomPositionWithMinDistance(200), // Minimum 200px distance from other entities for bots
    vx: 0,
    vy: 0,
    score: 0,
    size: 20,
    color: Math.floor(Math.random() * 360),
    target: null,
    lastMessageTime: 0,
    isBot: true,
    speedVariation: 0.8 + Math.random() * 0.4 // 0.8 to 1.2 speed multiplier for variety
  };
  return bot;
}

// Function to respawn coin booster in new random location
function respawnCoinBooster(boosterId) {
  const oldBooster = gameState.boosters.get(boosterId);
  if (!oldBooster) return;
  
  // Remove old booster
  gameState.boosters.delete(boosterId);
  
  // Check current number of Coin Multiplier boosters
  let coinBoosterCount = 0;
  for (const booster of gameState.boosters.values()) {
    if (booster.type === 'coins') {
      coinBoosterCount++;
    }
  }
  
  // Only respawn if we have less than 4 Coin Multiplier boosters
  if (coinBoosterCount >= 4) {
    console.log(`⚠️ Maximum Coin Multiplier limit reached (4), skipping respawn`);
    return;
  }
  
  // Create new coin booster in random location with minimum distance from other boosters
  const newCoinBooster = {
    id: `booster_${gameState.nextBoosterId++}`,
    ...getRandomPositionWithMinDistance(800), // Minimum 800px distance from other boosters
    type: 'coins',
    name: 'Coin Multiplier',
    color: '#FFD700',
    effect: 'Coin Multiplier',
    isBooster: true,
    spawnTime: Date.now() // Reset spawn time
  };
  
  // Set new respawn timer - regenerate after 2 minutes from spawn
  setTimeout(() => {
    respawnCoinBooster(newCoinBooster.id);
  }, 120000); // 2 minutes = 120000ms
  
  gameState.boosters.set(newCoinBooster.id, newCoinBooster);
  
  console.log(`🔄 Coin booster respawned at new location: ${Math.round(newCoinBooster.x)}, ${Math.round(newCoinBooster.y)} (Total Coin Multipliers: ${coinBoosterCount + 1})`);
}

// Calculate safe flee target that avoids world boundaries
function calculateSafeFleeTarget(bot, threat, worldSize) {
  const halfWorld = worldSize / 2;
  const safeMargin = 50; // Reduced margin for better distribution
  const minX = -halfWorld + safeMargin;
  const maxX = halfWorld - safeMargin;
  const minY = -halfWorld + safeMargin;
  const maxY = halfWorld - safeMargin;
  
  // Calculate primary flee direction (away from threat)
  const dx = bot.x - threat.x;
  const dy = bot.y - threat.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance === 0) {
    // If threat is at same position, pick random safe direction
    return {
      x: Math.max(minX, Math.min(maxX, bot.x + (Math.random() - 0.5) * 400)),
      y: Math.max(minY, Math.min(maxY, bot.y + (Math.random() - 0.5) * 400))
    };
  }
  
  // Normalize flee direction
  const fleeDirectionX = dx / distance;
  const fleeDirectionY = dy / distance;
  
  // Try different flee distances to find safe position
  const fleeDistances = [200, 150, 300, 100, 250];
  
  for (const fleeDistance of fleeDistances) {
    const candidateX = bot.x + fleeDirectionX * fleeDistance;
    const candidateY = bot.y + fleeDirectionY * fleeDistance;
    
    // Check if candidate position is within safe boundaries
    if (candidateX >= minX && candidateX <= maxX && 
        candidateY >= minY && candidateY <= maxY) {
      return { x: candidateX, y: candidateY };
    }
  }
  
  // If no safe position found in primary direction, try alternative directions
  const alternativeDirections = [
    { x: fleeDirectionY, y: -fleeDirectionX },  // Perpendicular right
    { x: -fleeDirectionY, y: fleeDirectionX },  // Perpendicular left
    { x: -fleeDirectionX, y: -fleeDirectionY }, // Towards threat (last resort)
  ];
  
  for (const direction of alternativeDirections) {
    for (const fleeDistance of fleeDistances) {
      const candidateX = bot.x + direction.x * fleeDistance;
      const candidateY = bot.y + direction.y * fleeDistance;
      
      if (candidateX >= minX && candidateX <= maxX && 
          candidateY >= minY && candidateY <= maxY) {
        return { x: candidateX, y: candidateY };
      }
    }
  }
  
  // Emergency fallback: move towards center of map
  const centerX = Math.max(minX, Math.min(maxX, 0));
  const centerY = Math.max(minY, Math.min(maxY, 0));
  
  return { x: centerX, y: centerY };
}

// Check if target position is safe from world boundaries
function isTargetSafeFromBoundaries(bot, target, worldSize) {
  const halfWorld = worldSize / 2;
  const safeMargin = 150; // Stay 150 pixels away from edges when planning movement
  
  // Check if target itself is too close to boundaries
  if (target.x < -halfWorld + safeMargin || target.x > halfWorld - safeMargin ||
      target.y < -halfWorld + safeMargin || target.y > halfWorld - safeMargin) {
    return false;
  }
  
  // Check if bot would get too close to boundaries while moving to target
  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance > 0) {
    // Simulate movement towards target to check intermediate positions
    const steps = Math.ceil(distance / 50); // Check every 50 pixels
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const checkX = bot.x + dx * progress;
      const checkY = bot.y + dy * progress;
      
      if (checkX < -halfWorld + safeMargin || checkX > halfWorld - safeMargin ||
          checkY < -halfWorld + safeMargin || checkY > halfWorld - safeMargin) {
        return false;
      }
    }
  }
  
  return true;
}

// Find a coin target that's safe from boundaries
function findSafeCoinTarget(bot, coins, worldSize) {
  const coinsArray = Array.from(coins.values());
  
  // Sort coins by distance from bot
  coinsArray.sort((a, b) => {
    const distA = Math.sqrt((a.x - bot.x) ** 2 + (a.y - bot.y) ** 2);
    const distB = Math.sqrt((b.x - bot.x) ** 2 + (b.y - bot.y) ** 2);
    return distA - distB;
  });
  
  // Find first safe coin
  for (const coin of coinsArray) {
    if (isTargetSafeFromBoundaries(bot, coin, worldSize)) {
      return coin;
    }
  }
  
  return null; // No safe coins found
}

// AI bot logic
function updateBots() {
  if (!gameState.gameStarted || gameState.gameEnded) return;
  
  // Track bot targets to avoid conflicts
  const botTargets = new Map(); // botId -> coinId
  const coinTargets = new Map(); // coinId -> [botId1, botId2, ...]
  
  // First pass: collect all bot targets
  gameState.bots.forEach(bot => {
    let nearestCoin = null;
    let nearestDistance = Infinity;
    
    gameState.coins.forEach(coin => {
      const distance = Math.sqrt((coin.x - bot.x) ** 2 + (coin.y - bot.y) ** 2);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCoin = coin;
      }
    });

    if (nearestCoin) {
      botTargets.set(bot.id, nearestCoin.id);
      
      // Track which bots are targeting this coin
      if (!coinTargets.has(nearestCoin.id)) {
        coinTargets.set(nearestCoin.id, []);
      }
      coinTargets.get(nearestCoin.id).push(bot.id);
    }
  });
  
  // Second pass: resolve conflicts and update bot targets
  gameState.bots.forEach(bot => {
    let targetFound = false;
    let targetX = 0, targetY = 0;
    
    // Check if current target has conflicts
    const currentTargetId = botTargets.get(bot.id);
    if (currentTargetId && coinTargets.has(currentTargetId)) {
      const botsTargetingThisCoin = coinTargets.get(currentTargetId);
      
      if (botsTargetingThisCoin.length > 1) {
        // Conflict detected! This bot should find another coin
        console.log(`🤖 Bot ${bot.name} avoiding conflict with ${botsTargetingThisCoin.length - 1} other bots for coin ${currentTargetId}`);
        
        // Find alternative coin that's not heavily contested
        let alternativeCoin = null;
        let bestAlternativeScore = -Infinity;
        
        gameState.coins.forEach(coin => {
          if (coin.id === currentTargetId) return; // Skip current conflicted coin
          
          const distance = Math.sqrt((coin.x - bot.x) ** 2 + (coin.y - bot.y) ** 2);
          const botsTargetingThisCoin = coinTargets.get(coin.id) || [];
          const competitionLevel = botsTargetingThisCoin.length;
          
          // Score based on distance and competition (prefer closer, less contested coins)
          const score = (1000 / Math.max(distance, 1)) - (competitionLevel * 100);
          
          if (score > bestAlternativeScore) {
            bestAlternativeScore = score;
            alternativeCoin = coin;
          }
        });
        
        if (alternativeCoin) {
          // Update bot's target to avoid conflict
          botTargets.set(bot.id, alternativeCoin.id);
          
          // Remove from old coin's target list
          if (coinTargets.has(currentTargetId)) {
            const oldList = coinTargets.get(currentTargetId);
            const index = oldList.indexOf(bot.id);
            if (index > -1) {
              oldList.splice(index, 1);
            }
          }
          
          // Add to new coin's target list
          if (!coinTargets.has(alternativeCoin.id)) {
            coinTargets.set(alternativeCoin.id, []);
          }
          coinTargets.get(alternativeCoin.id).push(bot.id);
          
          console.log(`🤖 Bot ${bot.name} switched to coin ${alternativeCoin.id} to avoid conflict`);
        }
      }
    }
    
    // Check if there are dangerous Player Eater players nearby
    let dangerousPlayerNearby = false;
    let escapeDirection = { x: 0, y: 0 };
    
    gameState.players.forEach(player => {
      if (player.playerEater) {
        const distanceToPlayer = Math.sqrt((player.x - bot.x) ** 2 + (player.y - bot.y) ** 2);
        if (distanceToPlayer < 150) { // If Player Eater is within 150 pixels
          dangerousPlayerNearby = true;
          // Calculate escape direction (opposite to player)
          const dx = bot.x - player.x;
          const dy = bot.y - player.y;
          const escapeDistance = Math.sqrt(dx * dx + dy * dy);
          if (escapeDistance > 0) {
            escapeDirection.x = dx / escapeDistance;
            escapeDirection.y = dy / escapeDistance;
          }
        }
      }
    });
    
    // If dangerous player nearby, prioritize escaping over coin collection
    if (dangerousPlayerNearby) {
      targetFound = false; // Cancel coin target
      // Move in escape direction
      targetX = bot.x + escapeDirection.x * 100;
      targetY = bot.y + escapeDirection.y * 100;
      console.log(`🤖 Bot ${bot.name} escaping from Player Eater!`);
    } else {
      // Get final target (either original or alternative) - normal coin collection
      const finalTargetId = botTargets.get(bot.id);
      if (finalTargetId) {
        const targetCoin = gameState.coins.get(finalTargetId);
        if (targetCoin) {
          // Check if coin target would lead bot too close to boundaries
          const targetSafe = isTargetSafeFromBoundaries(bot, targetCoin, gameState.worldSize);
          if (targetSafe) {
            targetX = targetCoin.x;
            targetY = targetCoin.y;
            targetFound = true;
          } else {
            // If target coin is unsafe, try to find a safer coin or move towards center
            const safeCoin = findSafeCoinTarget(bot, gameState.coins, gameState.worldSize);
            if (safeCoin) {
              targetX = safeCoin.x;
              targetY = safeCoin.y;
              targetFound = true;
            } else {
              // Move towards center as fallback
              targetX = 0;
              targetY = 0;
              targetFound = true;
            }
          }
        }
      }
    }

    // Move towards target with individual speed variation
    if (targetFound) {
      const dx = targetX - bot.x;
      const dy = targetY - bot.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        const baseSpeed = 2;
        let speedMultiplier = 1.0;
        
        // Apply size-based speed reduction
        const sizeSpeedMultiplier = calculateSpeedMultiplier(bot.score);
        const speed = baseSpeed * bot.speedVariation * speedMultiplier * sizeSpeedMultiplier;
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
        // Apply coin multiplier if active
        let actualCoinValue = coin.value;
        if (bot.coinBoost) {
          actualCoinValue = coin.value * 2; // Double coins
          console.log(`💰 Coin multiplier applied for bot ${bot.name}: ${coin.value} → ${actualCoinValue} coins`);
        }
        
        bot.score += actualCoinValue;
        gameState.coins.delete(coin.id);
        
        // Respawn coin with better positioning
        const newCoin = {
          id: gameState.nextCoinId++,
          ...getRandomPositionWithMinDistance(50), // Minimum 50px distance from other coins
          value: 1
        };
        
        // Try to avoid spawning too close to existing coins
        let attempts = 0;
        const maxAttempts = 10;
        while (attempts < maxAttempts) {
          let tooClose = false;
          gameState.coins.forEach(existingCoin => {
            const distance = Math.sqrt((existingCoin.x - newCoin.x) ** 2 + (existingCoin.y - newCoin.y) ** 2);
            if (distance < 30) { // Minimum distance between coins
              tooClose = true;
            }
          });
          
          if (!tooClose) break;
          
          // Try new position
          const newPos = getRandomPosition();
          newCoin.x = newPos.x;
          newCoin.y = newPos.y;
          attempts++;
        }
        
      gameState.coins.set(newCoin.id, newCoin);
        
        // Player growth based on score (Agar.io style) - but don't override Player Eater boost
        if (!bot.playerEater) {
          const oldSize = bot.size;
          bot.size = calculatePlayerSize(bot.score);
          
          // Log size changes for debugging
          if (oldSize !== bot.size) {
            console.log(`📏 Bot ${bot.name} size changed: ${oldSize} → ${bot.size} (score: ${bot.score})`);
          }
          
          // Ensure minimum size
          if (bot.size < 20) {
            console.log(`⚠️ WARNING: Bot ${bot.name} size too small: ${bot.size}, forcing to 20`);
            bot.size = 20;
          }
        }
      }
     });
     
     // Check booster collection for bots
     gameState.boosters.forEach(booster => {
       const distance = Math.sqrt((booster.x - bot.x) ** 2 + (booster.y - bot.y) ** 2);
       if (distance < bot.size) {
                         if (booster.type === 'playerEater') {
          console.log(`👹 Bot ${bot.name} collected Player Eater!`);
          
          // Mark bot as having player eater boost
          bot.playerEater = true;
          bot.playerEaterEndTime = Date.now() + 60000; // 1 minute
          bot.rainbowHue = 0; // Initialize rainbow color
          
          // Store original size and speed for restoration
          bot.playerEaterOriginalSize = bot.size;
          bot.playerEaterOriginalSpeed = bot.speed || 1;
          
          // Set bot to Level 5 stats (minimum size for effectiveness)
          bot.size = Math.max(50, bot.size); // At least Level 5 size, but can be bigger if bot already has more score
          
          // Set fixed speed for Player Eater boost - exactly 100 (0.5 multiplier of 200 base speed)
          bot.speed = 0.5;
          
          console.log(`👹 Bot ${bot.name} Player Eater speed: 0.5 (fixed at 100)`);
          
          // Send notification to all players
           io.emit('chatMessage', {
            playerId: 'system',
            playerName: 'System',
            message: `👹 Bot ${bot.name} collected Player Eater! Can now eat other players for 1 minute! (Level 5 size & fixed speed 100)`,
             timestamp: Date.now()
           });
           
          // Remove booster
          gameState.boosters.delete(booster.id);
        } else if (booster.type === 'coins') {
          console.log(`💰 Bot ${bot.name} collected Coin Multiplier!`);
          
          // Calculate remaining time based on when booster spawned
          const timeSinceSpawn = Date.now() - (booster.spawnTime || Date.now());
          const remainingTime = Math.max(0, 120000 - timeSinceSpawn); // 2 minutes total - time since spawn
          
          // Mark bot as having coin boost - time starts from collection moment
          bot.coinBoost = true;
          bot.coinBoostEndTime = Date.now() + remainingTime;
          
          // Send notification to all players with remaining time
          const remainingMinutes = Math.floor(remainingTime / 60000);
          const remainingSeconds = Math.floor((remainingTime % 60000) / 1000);
          const timeText = `${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`;
          
          io.emit('chatMessage', {
            playerId: 'system',
            playerName: 'System',
            message: `💰 Bot ${bot.name} collected Coin Multiplier! x2 coins for ${timeText} remaining!`,
            timestamp: Date.now()
          });
          
          // Remove booster
          gameState.boosters.delete(booster.id);
          
          // Respawn Coin Booster in new random location after 2 minutes delay
          setTimeout(() => {
            const newCoinBooster = {
              id: `booster_${gameState.nextBoosterId++}`,
              ...getRandomPositionWithMinDistance(800), // Minimum 800px distance from other boosters
              type: 'coins',
              name: 'Coin Multiplier',
              color: '#FFD700',
              effect: 'Coin Multiplier',
              isBooster: true,
              spawnTime: Date.now() // Reset spawn time
            };
            
            // Set new respawn timer for this booster
            setTimeout(() => {
              respawnCoinBooster(newCoinBooster.id);
            }, 120000); // 2 minutes
            
            gameState.boosters.set(newCoinBooster.id, newCoinBooster);
            console.log(`🔄 Coin booster respawned after bot ${bot.name} collected it: ${Math.round(newCoinBooster.x)}, ${Math.round(newCoinBooster.y)}`);
          }, 120000); // 2 minutes delay before respawn
        }
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
    
    // Check Player Eater mechanics for bots - can eat other players regardless of size
    if (bot.playerEater) {
      // Add cooldown to prevent spam eating
      const now = Date.now();
      if (!bot.lastEatTime || (now - bot.lastEatTime) > 3000) { // 3 second cooldown for bots
        const allEntities = [...gameState.players.values(), ...gameState.bots.values()];
        const entitiesToRemove = [];
        
        allEntities.forEach(target => {
          if (target.id !== bot.id) { // Can eat anyone except yourself
            const distance = Math.sqrt((target.x - bot.x) ** 2 + (target.y - bot.y) ** 2);
            
            // Can eat if touching (Player Eater ignores size requirements)
            if (distance < (bot.size + target.size) * 0.7) {
              // Transfer 10% of victim's score to bot
              const coinsGained = Math.floor(target.score * 0.1);
              bot.score += coinsGained;
              
              // Reduce victim's score by 10%
              const oldScore = target.score; // Сохраняем старый счет для записи в базу
              target.score = Math.floor(target.score * 0.9);
              
              // Don't remove entities - they just lose coins
              // Ensure score doesn't go below 0
              if (target.score < 0) {
                target.score = 0;
              }
              
              // Debug: Log victim state after being eaten
              console.log(`👹 Victim ${target.name} state after being eaten by bot:`, {
                id: target.id,
                firebaseId: target.firebaseId,
                score: target.score,
                socketId: target.socketId,
                isInGameState: gameState.players.has(target.socketId),
                size: target.size
              });
              
              
              // Send eating notification
              io.emit('chatMessage', {
                playerId: bot.id,
                playerName: bot.name,
                message: `👹 ${bot.name} ate ${target.name}! (+${coinsGained} coins, ${target.name} lost 10%)`,
                timestamp: Date.now()
              });
              
              // Send playerEaten event to victim if it's a player
              if (target.socketId) {
                io.to(target.socketId).emit('playerEaten', {
                  victimId: target.id,
                  eatenBy: bot.name,
                  coinsLost: Math.floor(target.score * 0.1),
                  remainingScore: target.score
                });
                
                // Debug: Check if target has Firebase ID
                console.log(`🔍 Target ${target.name} Firebase info:`, {
                  firebaseId: target.firebaseId,
                  playerId: target.playerId,
                  socketId: target.socketId,
                  score: target.score
                });
                
                                  // Save current score as totalScore to database for the victim (real player) - IMMEDIATELY
                                  if (target.id || target.firebaseId || target.playerId) {
                  const playerIdForFirebase = target.id || target.firebaseId || target.playerId;
                    console.log(`💾 IMMEDIATELY saving current score as totalScore for ${target.name}: ${target.score} (was ${oldScore})`);
                    
                    // Save immediately without setTimeout
                    (async () => {
                      try {
                        // Calculate coins lost and update totalScore accordingly
                        const coinsLost = Math.floor(oldScore * 0.1);
                        const newTotalScore = Math.max(0, (oldScore || 0) - coinsLost);
                        
                        // Use the new updateUser function to update totalScore
                        await updateUser(playerIdForFirebase, {
                          'stats.totalScore': newTotalScore,
                          'stats.lastPlayed': Date.now(),
                          'lastPlayed': Date.now()
                        });
                        console.log(`💰 Successfully saved current score as totalScore for ${target.name}: ${target.score} (previous score: ${oldScore})`);
                        
                        // Notify all clients about updated player stats for real-time leaderboard updates
                        io.emit('playerStatsUpdated', {
                          playerId: playerIdForFirebase,
                          nickname: target.name,
                          totalScore: newTotalScore,
                          type: 'scoreUpdate'
                        });
                        console.log(`📡 Notified all clients about ${target.name}'s totalScore update: ${target.score}`);
                      } catch (error) {
                        console.error(`❌ Failed to save current score as totalScore for ${target.name}:`, error);
                      }
                    })();
                  } else if (target.passwordHash) {
                    // Try to find player by passwordHash if no user ID
                    console.log(`🔍 Trying to find player ${target.name} by passwordHash for database update`);
                    (async () => {
                      try {
                        const { findPlayerByPasswordHash } = require('./firebase-admin');
                        const playerData = await findPlayerByPasswordHash(target.passwordHash);
                        
                        if (playerData) {
                          console.log(`✅ Found player ${target.name} by passwordHash, updating totalScore after losing coins`);
                          // Calculate coins lost and update totalScore accordingly
                          const coinsLost = Math.floor(oldScore * 0.1);
                          const newTotalScore = Math.max(0, (oldScore || 0) - coinsLost);
                          
                          await updateUser(playerData.id, {
                            'stats.totalScore': newTotalScore,
                            'stats.lastPlayed': Date.now(),
                            'lastPlayed': Date.now()
                          });
                          
                          // Notify all clients about updated player stats
                          io.emit('playerStatsUpdated', {
                            playerId: playerData.id,
                            nickname: target.name,
                            totalScore: newTotalScore,
                            type: 'scoreUpdate'
                          });
                          console.log(`📡 Notified all clients about ${target.name}'s totalScore update via passwordHash: ${newTotalScore}`);
                        } else {
                          console.log(`⚠️ Could not find player ${target.name} by passwordHash - cannot save to database`);
                        }
                      } catch (error) {
                        console.error(`❌ Error finding player by passwordHash for ${target.name}:`, error);
                      }
                    })();
                  } else {
                    console.log(`⚠️ Target ${target.name} has no Firebase ID or passwordHash - cannot save to database`);
                  }
              }
              
              // Set cooldown to prevent spam eating
              bot.lastEatTime = now;
              // Only eat one player per cooldown period
            }
          }
        });
      
      // No need to remove entities - they just lose coins and stay in the game
    }
  }
    
    // Check and expire Player Eater for bots
    if (bot.playerEater && now > bot.playerEaterEndTime) {
      bot.playerEater = false;
      bot.playerEaterEndTime = 0;
      // Restore original size and speed
      if (bot.playerEaterOriginalSize) {
        bot.size = bot.playerEaterOriginalSize;
        bot.playerEaterOriginalSize = undefined;
      }
      if (bot.playerEaterOriginalSpeed) {
        bot.speed = bot.playerEaterOriginalSpeed;
        bot.playerEaterOriginalSpeed = undefined;
      }
      console.log(`👹 Player Eater expired for bot ${bot.name} - restored original size and speed`);
      
      // Respawn Player Eater booster on the map immediately after effect expires
      const newBooster = {
        id: `booster_${gameState.nextBoosterId++}`,
        ...getRandomPositionWithMinDistance(800), // Minimum 800px distance from other boosters
        type: 'playerEater',
        name: 'Player Eater',
        color: 'rainbow',
        effect: 'Player Eater',
        isBooster: true,
        rainbowHue: 0
      };
      gameState.boosters.set(newBooster.id, newBooster);
      console.log(`👹 Player Eater booster respawned immediately after player ${bot.name} effect expired`);
    }
    
    // Check and expire Coin Booster for bots
    if (bot.coinBoost && now > bot.coinBoostEndTime) {
      bot.coinBoost = false;
      bot.coinBoostEndTime = 0;
      console.log(`💰 Coin Multiplier expired for bot ${bot.name}`);
      
      // Respawn Coin Booster on the map after 2 minutes delay
      setTimeout(() => {
        const newCoinBooster = {
          id: `booster_${gameState.nextBoosterId++}`,
          ...getRandomPositionWithMinDistance(800), // Minimum 800px distance from other boosters
          type: 'coins',
          name: 'Coin Multiplier',
          color: '#FFD700',
          effect: 'Coin Multiplier',
          isBooster: true,
          spawnTime: Date.now() // Reset spawn time
        };
        
        // Set new respawn timer for this booster
        setTimeout(() => {
          respawnCoinBooster(newCoinBooster.id);
        }, 120000); // 2 minutes
        
        gameState.boosters.set(newCoinBooster.id, newCoinBooster);
        console.log(`🔄 Coin booster respawned on map after bot ${bot.name} expired (2 minutes delay)`);
      }, 120000); // 2 minutes delay before respawn
    }
  });
}

// Update player positions with smooth 60fps movement
function updatePlayers(deltaTime) {
  gameState.players.forEach(player => {
    // Debug: Log player movement
    console.log(`🎮 Updating player ${player.name} - TargetVel: (${Math.round(player.targetVx * 10) / 10}, ${Math.round(player.targetVy * 10) / 10}), CurrentVel: (${Math.round(player.vx * 10) / 10}, ${Math.round(player.vy * 10) / 10})`);
    
    // Smooth velocity interpolation for 60fps movement
    const lerpFactor = Math.min(1, deltaTime * 8); // Smooth acceleration/deceleration
    player.vx += (player.targetVx - player.vx) * lerpFactor;
    player.vy += (player.targetVy - player.vy) * lerpFactor;
    
    // Update position based on velocity and deltaTime
    player.x += player.vx * deltaTime;
    player.y += player.vy * deltaTime;
    
    // Debug: Log position update
    console.log(`🎮 Player ${player.name} moved to (${Math.round(player.x)}, ${Math.round(player.y)})`);
    
    // Keep within world bounds
    player.x = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, player.x));
    player.y = Math.max(-gameState.worldSize/2, Math.min(gameState.worldSize/2, player.y));
    
    // Check coin collection
    const coinsToDelete = [];
    const coinsToSave = [];
    
    gameState.coins.forEach((coin) => {
      const distance = Math.sqrt((coin.x - player.x) ** 2 + (coin.y - player.y) ** 2);
      if (distance < player.size) {
        // Apply coin multiplier if active
        let actualCoinValue = coin.value;
        if (player.coinBoost) {
          actualCoinValue = coin.value * 2; // Double coins
          console.log(`💰 Coin multiplier applied for ${player.name}: ${coin.value} → ${actualCoinValue} coins`);
        }
        
        player.score += actualCoinValue;
        coinsToDelete.push(coin.id);
        
        // Update activity when player collects coin
        player.lastActivity = Date.now();
        
        // Queue player for Firebase saving (save total score, not individual coins)
        const playerIdForFirebase = player.id || player.firebaseId || player.playerId;
        if (playerIdForFirebase) {
          coinsToSave.push({ playerId: playerIdForFirebase, totalScore: player.score, playerName: player.name });
        } else {
        }
        
        // Player growth based on score (Agar.io style) - but don't override Player Eater boost
        if (!player.playerEater) {
          const oldSize = player.size;
          player.size = calculatePlayerSize(player.score);
          
          // Log size changes for debugging
          if (oldSize !== player.size) {
            console.log(`📏 Player ${player.name} size changed: ${oldSize} → ${player.size} (score: ${player.score})`);
          }
          
          // Ensure minimum size
          if (player.size < 20) {
            console.log(`⚠️ WARNING: Player ${player.name} size too small: ${player.size}, forcing to 20`);
            player.size = 20;
          }
        }
        
        // Save player size and totalScore for next game
              if (player.id || player.firebaseId || player.playerId) {
        const playerIdForSize = player.id || player.firebaseId || player.playerId;
          (async () => {
            try {
              // Save both size and totalScore immediately
              await Promise.all([
                GameDataService.savePlayerSize(playerIdForSize, player.size),
                GameDataService.updatePlayerFullStats(playerIdForSize, { totalScore: player.score })
              ]);
              console.log(`💾 Saved player data: ${player.name} - Size: ${player.size}, TotalScore: ${player.score}`);
            } catch (error) {
              console.error('Error saving player data:', error);
            }
          })();
        }
      }
    });
    
    // Process collected coins
    coinsToDelete.forEach(coinId => {
      gameState.coins.delete(coinId);
      
              // Respawn coin with better positioning
      const newCoin = {
        id: gameState.nextCoinId++,
        ...getRandomPositionWithMinDistance(50), // Minimum 50px distance from other coins
        value: 1
      };
        
        // Try to avoid spawning too close to existing coins
        let attempts = 0;
        const maxAttempts = 10;
        while (attempts < maxAttempts) {
          let tooClose = false;
          gameState.coins.forEach(existingCoin => {
            const distance = Math.sqrt((existingCoin.x - newCoin.x) ** 2 + (existingCoin.y - newCoin.y) ** 2);
            if (distance < 30) { // Minimum distance between coins
              tooClose = true;
            }
          });
          
          if (!tooClose) break;
          
          // Try new position
          const newPos = getRandomPosition();
          newCoin.x = newPos.x;
          newCoin.y = newPos.y;
          attempts++;
        }
        
      gameState.coins.set(newCoin.id, newCoin);
    });
    
    // Check booster collection
    const boostersToDelete = [];
    gameState.boosters.forEach((booster) => {
      const distance = Math.sqrt((booster.x - player.x) ** 2 + (booster.y - player.y) ** 2);
      if (distance < player.size) {
                            // Apply booster effect
                    if (booster.type === 'playerEater') {
                        // Player Eater effect
                        // Mark player as having player eater boost
                        player.playerEater = true;
                        player.playerEaterEndTime = Date.now() + 60000; // 1 minute
                        player.rainbowHue = 0; // Initialize rainbow color
                        
                        // Store original size and speed for restoration
                        player.playerEaterOriginalSize = player.size;
                        player.playerEaterOriginalSpeed = player.speed || 1;
                        
                        // Set player to Level 5 stats (minimum size for effectiveness)
                        player.size = Math.max(50, player.size); // At least Level 5 size, but can be bigger if player already has more score
                        
                        // Set fixed speed for Player Eater boost - exactly 100 (0.5 multiplier of 200 base speed)
                        player.speed = 0.5;
                        
                        // Send notification to all players
                        io.emit('chatMessage', {
                            playerId: 'system',
                            playerName: 'System',
                            message: `👹 ${player.name} collected Player Eater! Can now eat other players for 1 minute! (Level 5 size & speed 100)`,
                            timestamp: Date.now()
                        });
                    } else if (booster.type === 'coins') {
                        // Coin Multiplier effect
                        
                        // Calculate remaining time based on when booster spawned
                        const timeSinceSpawn = Date.now() - (booster.spawnTime || Date.now());
                        const remainingTime = Math.max(0, 120000 - timeSinceSpawn); // 2 minutes total - time since spawn
                        
                        // Mark player as having coin boost - time starts from collection moment
                        player.coinBoost = true;
                        player.coinBoostEndTime = Date.now() + remainingTime;
                        
                        // Send notification to all players with remaining time
                        const remainingMinutes = Math.floor(remainingTime / 60000);
                        const remainingSeconds = Math.floor((remainingTime % 60000) / 1000);
                        const timeText = `${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`;
                        
                        io.emit('chatMessage', {
                            playerId: 'system',
                            playerName: 'System',
                            message: `💰 ${player.name} collected Coin Multiplier! x2 coins for ${timeText} remaining!`,
                            timestamp: Date.now()
                        });
                    }
        
        boostersToDelete.push({ id: booster.id, type: booster.type });
        
        // Update activity when player collects booster
        player.lastActivity = Date.now();
      }
    });
    
    // Process collected boosters
    boostersToDelete.forEach(boosterData => {
      const boosterType = boosterData.type;
      gameState.boosters.delete(boosterData.id);
      
      // Respawn booster based on type
      if (boosterType === 'playerEater') {
        // Player Eater respawns immediately when effect expires (no delay)
        // The respawn is handled in the booster expiration check
      }
      // Note: Coin boosters are NOT respawned here - they regenerate automatically
      // through the timer set when they spawn (every 2 minutes)
    });
    
    // Check and expire boosters
    const now = Date.now();
    if (player.playerEater && now > player.playerEaterEndTime) {
      player.playerEater = false;
      player.playerEaterEndTime = 0;
      // Restore original size and speed
      if (player.playerEaterOriginalSize) {
        player.size = player.playerEaterOriginalSize;
        player.playerEaterOriginalSize = undefined;
      }
      if (player.playerEaterOriginalSpeed) {
        player.speed = player.playerEaterOriginalSpeed;
        player.playerEaterOriginalSpeed = undefined;
      }
      
      // Respawn Player Eater booster on the map immediately after effect expires
      const newBooster = {
        id: `booster_${gameState.nextBoosterId++}`,
        ...getRandomPositionWithMinDistance(800), // Minimum 800px distance from other boosters
        type: 'playerEater',
        name: 'Player Eater',
        color: 'rainbow',
        effect: 'Player Eater',
        isBooster: true,
        rainbowHue: 0
      };
      gameState.boosters.set(newBooster.id, newBooster);
      console.log(`👹 Player Eater booster respawned immediately after player ${player.name} effect expired`);
    }
    
    if (player.coinBoost && now > player.coinBoostEndTime) {
      player.coinBoost = false;
      player.coinBoostEndTime = 0;
      console.log(`💰 Coin Multiplier expired for player ${player.name}`);
      
      // Note: Coin boosters regenerate automatically through timers set when they spawn
      // No need to manually respawn them here
    }
    
    // Save player total scores to Firebase in batch (non-blocking)
    if (coinsToSave.length > 0) {
      // Use setTimeout to avoid blocking the game loop
      setTimeout(async () => {
        // Group by playerId to avoid multiple updates for the same player
        const playerScores = new Map();
        for (const playerData of coinsToSave) {
          playerScores.set(playerData.playerId, playerData.totalScore);
        }
        
        // Save the latest total score for each player
        for (const [playerId, totalScore] of playerScores) {
          try {
            await GameDataService.savePlayerCoin(playerId, totalScore);
          } catch (error) {
          }
        }
      }, 0);
    }
    
    // Check eating other players/bots (Agar.io mechanics) - DISABLED
    // const allEntities = [...gameState.players.values(), ...gameState.bots.values()];
    // const entitiesToRemove = [];
    
    // allEntities.forEach(target => {
    //   if (target.id !== player.id) { // Can eat anyone except yourself
    //     const distance = Math.sqrt((target.x - player.x) ** 2 + (target.y - player.y) ** 2);
         
    //     // Can eat if you have more coins and touching
    //     if (player.score > target.score && distance < (player.size + target.size) * 0.7) {
    //       // Transfer victim's score to player
    //       const coinsGained = target.score;
    //       player.score += coinsGained;
    //       player.size = Math.min(50, 20 + Math.sqrt(player.score) * 2);
          
    //       // Mark entity for removal
    //       entitiesToRemove.push(target);
          
    //       // Save gained coins to Firebase if player is authenticated
    //       if (player.firebaseId && coinsGained > 0) {
    //         setTimeout(async () => {
    //           try {
    //             await GameDataService.savePlayerCoin(player.firebaseId, coinsGained);
    //           } catch (error) {
    //           }
    //         }, 0);
    //       }
          
    //       // Send eating notification
    //       io.emit('chatMessage', {
    //         playerId: player.id,
    //         playerName: player.name,
    //         message: `Ate ${target.name}! (+${coinsGained} coins) [Size: ${Math.round(player.size)}]`,
    //         timestamp: Date.now()
    //       });
    //     }
    //   }
    // Note: Eating mechanics are disabled, so no entity removal needed
    
    // Check Player Eater mechanics - can eat other players regardless of size
    if (player.playerEater) {
      // Add cooldown to prevent spam eating
      const now = Date.now();
      const entitiesToRemove = [];
      
      if (!player.lastEatTime || (now - player.lastEatTime) > 2000) { // 2 second cooldown
        const allEntities = [...gameState.players.values(), ...gameState.bots.values()];
        
        allEntities.forEach(target => {
          if (target.id !== player.id) { // Can eat anyone except yourself
            const distance = Math.sqrt((target.x - player.x) ** 2 + (target.y - player.y) ** 2);
            
            // Can eat if touching (Player Eater ignores size requirements)
            if (distance < (player.size + target.size) * 0.7) {
              // Transfer 10% of victim's score to player
              const coinsGained = Math.floor(target.score * 0.1);
              player.score += coinsGained;
              
              // Reduce victim's score by 10%
              const oldScore = target.score; // Сохраняем старый счет для записи в базу
              target.score = Math.floor(target.score * 0.9);
              
              // Don't remove entities - they just lose coins
              // Ensure score doesn't go below 0
              if (target.score < 0) {
                target.score = 0;
              }
              
              // Debug: Log victim state after being eaten
              console.log(`👹 Victim ${target.name} state after being eaten by player:`, {
                id: target.id,
                firebaseId: target.firebaseId,
                score: target.score,
                socketId: target.socketId,
                isInGameState: gameState.players.has(target.socketId),
                size: target.size
              });
              
              
              // Send eating notification
              io.emit('chatMessage', {
                playerId: player.id,
                playerName: player.name,
                message: `👹 ${player.name} ate ${target.name}! (+${coinsGained} coins, ${target.name} lost 10%)`,
                timestamp: Date.now()
              });
              
              // Send playerEaten event to victim
              if (target.socketId) {
                io.to(target.socketId).emit('playerEaten', {
                  victimId: target.id,
                  eatenBy: player.name,
                  coinsLost: Math.floor(target.score * 0.1),
                  remainingScore: target.score
                });
                
                // Debug: Check if target has Firebase ID
                console.log(`🔍 Target ${target.name} Firebase info:`, {
                  firebaseId: target.firebaseId,
                  playerId: target.playerId,
                  socketId: target.socketId,
                  score: target.score
                });
                
                // Save current score as totalScore to database for the victim (real player) - IMMEDIATELY
                if (target.id || target.firebaseId || target.playerId) {
                  const playerIdForFirebase = target.id || target.firebaseId || target.playerId;
                  console.log(`💾 IMMEDIATELY saving current score as totalScore for ${target.name}: ${target.score} (was ${oldScore})`);
                  
                  // Save immediately without setTimeout
                  (async () => {
                    try {
                      // Calculate coins lost and update totalScore accordingly
                      const coinsLost = Math.floor(oldScore * 0.1);
                      const newTotalScore = Math.max(0, (oldScore || 0) - coinsLost);
                      
                      // Use the new updateUser function to update totalScore
                      await updateUser(playerIdForFirebase, {
                        'stats.totalScore': newTotalScore,
                        'stats.lastPlayed': Date.now(),
                        'lastPlayed': Date.now()
                      });
                      console.log(`💰 Successfully saved current score as totalScore for ${target.name}: ${target.score} (previous score: ${oldScore})`);
                      
                      // Notify all clients about updated player stats for real-time leaderboard updates
                      io.emit('playerStatsUpdated', {
                        playerId: playerIdForFirebase,
                        nickname: target.name,
                        totalScore: newTotalScore,
                        type: 'scoreUpdate'
                      });
                      console.log(`📡 Notified all clients about ${target.name}'s totalScore update: ${target.score}`);
                    } catch (error) {
                      console.error(`❌ Failed to save current score as totalScore for ${target.name}:`, error);
                    }
                  })();
                } else if (target.passwordHash) {
                  // Try to find player by passwordHash if no user ID
                  console.log(`🔍 Trying to find player ${target.name} by passwordHash for database update`);
                  (async () => {
                    try {
                      const { findPlayerByPasswordHash } = require('./firebase-admin');
                      const playerData = await findPlayerByPasswordHash(target.passwordHash);
                      
                      if (playerData) {
                          console.log(`✅ Found player ${target.name} by passwordHash, updating totalScore after losing coins`);
                          // Calculate coins lost and update totalScore accordingly
                          const coinsLost = Math.floor(oldScore * 0.1);
                          const newTotalScore = Math.max(0, (oldScore || 0) - coinsLost);
                          
                          await updateUser(playerData.id, {
                            'stats.totalScore': newTotalScore,
                            'stats.lastPlayed': Date.now(),
                            'lastPlayed': Date.now()
                          });
                          
                          // Notify all clients about updated player stats
                          io.emit('playerStatsUpdated', {
                            playerId: playerData.id,
                            nickname: target.name,
                            totalScore: newTotalScore,
                            type: 'scoreUpdate'
                          });
                          console.log(`📡 Notified all clients about ${target.name}'s totalScore update via passwordHash: ${newTotalScore}`);
                        } else {
                          console.log(`⚠️ Target ${target.name} has no Firebase ID or passwordHash - cannot save to database`);
                        }
                      } catch (error) {
                        console.error(`❌ Error finding player by passwordHash for ${target.name}:`, error);
                      }
                    })();
                  }
                }
              }
            }
          }
        );
      }
    }
  });

}