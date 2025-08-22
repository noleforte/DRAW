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

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

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
    const allPlayers = await GameDataService.getAllPlayers();
    console.log(`🔄 Retrieved ${allPlayers.length} players from GameDataService:`, allPlayers);
    
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
  return Math.min(50, 20 + Math.sqrt(score) * 2);
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
    if (player.score > 0 && (player.firebaseId || player.playerId)) {
      const playerIdForSave = player.firebaseId || player.playerId;
      GameDataService.savePlayerCoin(playerIdForSave, player.score)
        .then(() => {
          console.log(`💰 Saved ${player.score} coins for AFK player: ${player.name}`);
        })
        .catch((error) => {
          console.error(`❌ Failed to save coins for AFK player ${player.name}:`, error);
        });
    }
    
    // Save game session (match) for AFK player
    if ((player.firebaseId || player.playerId)) {
      const playerIdForSave = player.firebaseId || player.playerId;
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
      
      // Send AFK kick event first
      socket.emit('afkKick', {
        reason: 'AFK timeout',
        score: player.score,
        timeInactive: Math.floor((now - player.lastActivity) / 1000),
        playerName: player.name,
        lastActivity: player.lastActivity,
        kickTime: now
      });
      
      // Also send playerEaten event for compatibility
      socket.emit('playerEaten', {
        victimId: socketId,
        eatenByBot: 'AFK System',
        coinsLost: player.score,
        coinsSaved: player.score,
        afkKick: true // Special flag for AFK kick
      });
      
      console.log(`✅ AFK kick sent to player: ${player.name}`);
    }

    // Remove player from game
    gameState.players.delete(socketId);
    console.log(`🗑️ Removed AFK player from game: ${player.name}`);
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
  // Ensure coins spawn within the visible game field (not at the very edges)
  const margin = 50; // Reduced margin for better distribution
  const minX = -gameState.worldSize/2 + margin;
  const maxX = gameState.worldSize/2 - margin;
  const minY = -gameState.worldSize/2 + margin;
  const maxY = gameState.worldSize/2 - margin;
  
  // Use better random distribution (avoid clustering at edges)
  const x = minX + (maxX - minX) * (0.1 + 0.8 * Math.random()); // 10% margin from edges
  const y = minY + (maxY - minY) * (0.1 + 0.8 * Math.random()); // 10% margin from edges
  
  return { x, y };
}

// Generate coins with better distribution
function generateCoins(count = 300) {
  const margin = 50;
  const minX = -gameState.worldSize/2 + margin;
  const maxX = gameState.worldSize/2 - margin;
  const minY = -gameState.worldSize/2 + margin;
  const maxY = gameState.worldSize/2 - margin;
  
  // Create a grid-based distribution for more even spacing
  const gridSize = Math.ceil(Math.sqrt(count));
  const cellWidth = (maxX - minX) / gridSize;
  const cellHeight = (maxY - minY) / gridSize;
  
  console.log(`🎯 Generating ${count} coins with grid size ${gridSize}x${gridSize}, cell size: ${cellWidth.toFixed(0)}x${cellHeight.toFixed(0)}`);
  
  for (let i = 0; i < count; i++) {
    // Calculate grid position
    const gridX = i % gridSize;
    const gridY = Math.floor(i / gridSize);
    
    // Add some randomness within each grid cell (but not too much)
    const randomOffsetX = (Math.random() - 0.5) * cellWidth * 0.6;
    const randomOffsetY = (Math.random() - 0.5) * cellHeight * 0.6;
    
    const coin = {
      id: gameState.nextCoinId++,
      x: minX + gridX * cellWidth + randomOffsetX,
      y: minY + gridY * cellHeight + randomOffsetY,
      value: 1
    };
    
    // Ensure coin is within bounds
    coin.x = Math.max(minX, Math.min(maxX, coin.x));
    coin.y = Math.max(minY, Math.min(maxY, coin.y));
    
    gameState.coins.set(coin.id, coin);
  }
  
  console.log(`✅ Generated ${gameState.coins.size} coins with even distribution`);
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
      const newPos = getRandomPosition();
      coin.x = newPos.x;
      coin.y = newPos.y;
    }
  }
}

// Generate boosters
function generateBoosters(count = 2) { // Player Eater + Coin Booster
  // Generate Player Eater booster
  const playerEaterBooster = {
    id: `booster_${gameState.nextBoosterId++}`,
    ...getRandomPosition(),
    type: 'playerEater',
    name: 'Player Eater',
    color: 'rainbow', // Special rainbow color
    effect: 'Eat other players + Level 5 stats',
    isBooster: true,
    rainbowHue: 0 // For rainbow animation
  };
  gameState.boosters.set(playerEaterBooster.id, playerEaterBooster);
  
  // Generate Coin Booster
  const coinBooster = {
    id: `booster_${gameState.nextBoosterId++}`,
    ...getRandomPosition(),
    type: 'coins',
    name: 'Coin Multiplier',
    color: '#FFD700', // Gold color
    effect: 'x2 Coins for 2 minutes',
    isBooster: true
  };
  gameState.boosters.set(coinBooster.id, coinBooster);
}

// Create AI bot
function createBot(id) {
  const bot = {
    id: `bot_${id}`,
    name: botNames[Math.floor(Math.random() * botNames.length)],
    ...getRandomPosition(), // This already uses proper spawn logic
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

    // Apply speed multiplier if Player Eater is active
    const botSpeedMultiplier = bot.playerEater ? 1.0 : 1;
    
    // Update position with speed multiplier
    bot.x += bot.vx * botSpeedMultiplier;
    bot.y += bot.vy * botSpeedMultiplier;

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
          ...getRandomPosition(),
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
          bot.size = calculatePlayerSize(bot.score);
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
          
          // Set fixed speed for Player Eater boost - exactly 1.0 (100)
          bot.speed = 1.0;
          
          console.log(`👹 Bot ${bot.name} Player Eater speed: 1.0 (fixed at 100)`);
          
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
          
          // Mark bot as having coin boost - time starts from collection moment
          bot.coinBoost = true;
          bot.coinBoostEndTime = Date.now() + 120000; // 2 minutes from NOW
          
          // Send notification to all players
          io.emit('chatMessage', {
            playerId: 'system',
            playerName: 'System',
            message: `💰 Bot ${bot.name} collected Coin Multiplier! x2 coins for 2 minutes!`,
            timestamp: Date.now()
          });
          
          // Remove booster
          gameState.boosters.delete(booster.id);
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
              target.score = Math.floor(target.score * 0.9);
              
              // Mark entity for removal if score becomes 0
              if (target.score <= 0) {
                entitiesToRemove.push(target);
              }
              
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
              }
              
              // Set cooldown to prevent spam eating
              bot.lastEatTime = now;
              // Only eat one player per cooldown period
            }
          }
        });
      
      // Remove entities with 0 score
      entitiesToRemove.forEach(entity => {
        if (entity.socketId) {
          gameState.players.delete(entity.socketId);
        } else if (entity.isBot) {
          gameState.bots.delete(entity.id);
        }
      });
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
      
      // Respawn Player Eater booster on the map after 1 minute delay
      setTimeout(() => {
        const newBooster = {
          id: `booster_${gameState.nextBoosterId++}`,
          ...getRandomPosition(),
          type: 'playerEater',
          name: 'Player Eater',
          color: 'rainbow',
          effect: 'Eat other players + Level 5 stats',
          isBooster: true,
          rainbowHue: 0
        };
        gameState.boosters.set(newBooster.id, newBooster);
        console.log(`👹 Player Eater booster respawned on map after bot ${bot.name} expired (1 minute delay)`);
      }, 60000); // 1 minute delay before respawn
    }
    
    // Check and expire Coin Booster for bots
    if (bot.coinBoost && now > bot.coinBoostEndTime) {
      bot.coinBoost = false;
      bot.coinBoostEndTime = 0;
      console.log(`💰 Coin Multiplier expired for bot ${bot.name}`);
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
    
    // Apply speed multiplier if Player Eater is active
    const speedMultiplier = player.playerEater ? 1.0 : 1;
    
    // Update position based on velocity, deltaTime, and speed multiplier
    player.x += player.vx * deltaTime * speedMultiplier;
    player.y += player.vy * deltaTime * speedMultiplier;
    
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
        const playerIdForFirebase = player.firebaseId || player.playerId || player.id;
        if (playerIdForFirebase) {
          coinsToSave.push({ playerId: playerIdForFirebase, totalScore: player.score, playerName: player.name });
        } else {
        }
        
        // Player growth based on score (Agar.io style) - but don't override Player Eater boost
        if (!player.playerEater) {
          player.size = calculatePlayerSize(player.score);
        }
        
        // Save player size for next game
        if (player.firebaseId || player.playerId) {
          const playerIdForSize = player.firebaseId || player.playerId;
          setTimeout(async () => {
            try {
              await GameDataService.savePlayerSize(playerIdForSize, player.size);
            } catch (error) {
              console.error('Error saving player size:', error);
            }
          }, 0);
        }
      }
    });
    
    // Process collected coins
    coinsToDelete.forEach(coinId => {
      gameState.coins.delete(coinId);
      
              // Respawn coin with better positioning
      const newCoin = {
        id: gameState.nextCoinId++,
        ...getRandomPosition(),
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
                        console.log(`👹 Player ${player.name} collected Player Eater!`);
                        // Mark player as having player eater boost
                        player.playerEater = true;
                        player.playerEaterEndTime = Date.now() + 60000; // 1 minute
                        player.rainbowHue = 0; // Initialize rainbow color
                        
                        // Store original size and speed for restoration
                        player.playerEaterOriginalSize = player.size;
                        player.playerEaterOriginalSpeed = player.speed || 1;
                        
                        // Set player to Level 5 stats (minimum size for effectiveness)
                        player.size = Math.max(50, player.size); // At least Level 5 size, but can be bigger if player already has more score
                        
                        // Set fixed speed for Player Eater boost - exactly 1.0 (100)
                        player.speed = 1.0;
                        
                        console.log(`👹 Player ${player.name} Player Eater speed: 1.0 (fixed at 100)`);
                        
                        // Send notification to all players
                        io.emit('chatMessage', {
                            playerId: 'system',
                            playerName: 'System',
                            message: `👹 ${player.name} collected Player Eater! Can now eat other players for 1 minute! (Level 5 size & fixed speed 100)`,
                            timestamp: Date.now()
                        });
                    } else if (booster.type === 'coins') {
                        // Coin Multiplier effect
                        console.log(`💰 Player ${player.name} collected Coin Multiplier!`);
                        // Mark player as having coin boost - time starts from collection moment
                        player.coinBoost = true;
                        player.coinBoostEndTime = Date.now() + 120000; // 2 minutes from NOW
                        
                        // Send notification to all players
                        io.emit('chatMessage', {
                            playerId: 'system',
                            playerName: 'System',
                            message: `💰 ${player.name} collected Coin Multiplier! x2 coins for 2 minutes!`,
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
        // Player Eater respawns when effect expires (1 minute)
        setTimeout(() => {
          const newBooster = {
            id: `booster_${gameState.nextBoosterId++}`,
            ...getRandomPosition(),
            type: 'playerEater',
            name: 'Player Eater',
            color: 'rainbow',
            effect: 'Eat other players + Level 5 stats',
            isBooster: true,
            rainbowHue: 0
          };
          gameState.boosters.set(newBooster.id, newBooster);
        }, 60000); // Respawn after 1 minute (when effect expires)
      } else if (boosterType === 'coins') {
        // Coin Booster respawns after 2 minutes (same as effect duration)
        setTimeout(() => {
          const newBooster = {
            id: `booster_${gameState.nextBoosterId++}`,
            ...getRandomPosition(),
            type: 'coins',
            name: 'Coin Multiplier',
            color: '#FFD700',
            effect: 'x2 Coins for 2 minutes',
            isBooster: true
          };
          gameState.boosters.set(newBooster.id, newBooster);
        }, 120000); // Respawn after 2 minutes
      }
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
      console.log(`👹 Player Eater expired for player ${player.name} - restored original size and speed`);
      
      // Respawn Player Eater booster on the map after 1 minute delay
      setTimeout(() => {
        const newBooster = {
          id: `booster_${gameState.nextBoosterId++}`,
          ...getRandomPosition(),
          type: 'playerEater',
          name: 'Player Eater',
          color: 'rainbow',
          effect: 'Eat other players + Level 5 stats',
          isBooster: true,
          rainbowHue: 0
        };
        gameState.boosters.set(newBooster.id, newBooster);
        console.log(`👹 Player Eater booster respawned on map after player ${player.name} expired (1 minute delay)`);
      }, 60000); // 1 minute delay before respawn
    }
    
    if (player.coinBoost && now > player.coinBoostEndTime) {
      player.coinBoost = false;
      player.coinBoostEndTime = 0;
      console.log(`💰 Coin Multiplier expired for player ${player.name}`);
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
    // });
    
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
              target.score = Math.floor(target.score * 0.9);
              
              // Mark entity for removal if score becomes 0
              if (target.score <= 0) {
                entitiesToRemove.push(target);
              }
              
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
              }
              
              // Set cooldown to prevent spam eating
              player.lastEatTime = now;
              // Only eat one player per cooldown period
            }
          }
        });
      }
      
      // Remove entities with 0 score
      entitiesToRemove.forEach(entity => {
        if (entity.socketId) {
          gameState.players.delete(entity.socketId);
        } else if (entity.isBot) {
          gameState.bots.delete(entity.id);
        }
      });
    }
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
  
  // Generate initial boosters
  generateBoosters(3);
  
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
  
  // Regenerate boosters
  gameState.boosters.clear();
  gameState.nextBoosterId = 0;
  generateBoosters(3);
  
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
    const wallet = typeof playerData === 'string' ? '' : playerData.wallet;
    
    // Check if player is already in the game
    const existingPlayer = Array.from(gameState.players.values()).find(p => p.name === name);
    
    if (existingPlayer) {
      // Player reconnecting - preserve their current game state
      console.log(`🔄 Player ${name} reconnecting - Current score: ${existingPlayer.score}, size: ${existingPlayer.size}`);
      
      // Remove old player entry and create new one with new socket.id
      const oldSocketId = Array.from(gameState.players.entries()).find(([id, p]) => p.name === name)?.[0];
      if (oldSocketId) {
        gameState.players.delete(oldSocketId);
        console.log(`🗑️ Removed old player entry with socketId: ${oldSocketId}`);
      }
      
      // Create new player entry with new socket.id
      const reconnectedPlayer = {
        ...existingPlayer,
        socketId: socket.id,
        lastSeen: Date.now(),
        lastActivity: Date.now(),
        color: playerData.color || existingPlayer.color // Preserve or update color
      };
      
      // Add to gameState.players with new socket.id
      gameState.players.set(socket.id, reconnectedPlayer);
      console.log(`✅ Added reconnected player with new socketId: ${socket.id}`);
      
              // Load fresh data from Firestore for reconnected player (but preserve current game score)
        if (reconnectedPlayer.id) {
          console.log(`🔍 Loading data for reconnected player: ${reconnectedPlayer.id} (current score: ${reconnectedPlayer.score})`);
          // Load data asynchronously but update player immediately
          GameDataService.getPlayerStats(reconnectedPlayer.id)
            .then(playerStats => {
              console.log(`📊 Received playerStats for reconnected ${reconnectedPlayer.id}:`, playerStats);
              if (playerStats) {
                // Update size if newer data exists (but preserve current game score)
                if (playerStats.lastSize && playerStats.lastSize > reconnectedPlayer.size) {
                  reconnectedPlayer.size = playerStats.lastSize;
                  console.log(`🎯 Reconnected player ${reconnectedPlayer.id} - Updated size to ${playerStats.lastSize} (current game score preserved: ${reconnectedPlayer.score})`);
                }
                
                // Don't update score from Total Coins - this would cause score doubling
                // reconnectedPlayer.score should remain as current game score
                // Only update size based on totalScore if it's higher (represents player's progress)
                if (playerStats.totalScore) {
                  const calculatedSize = calculatePlayerSize(playerStats.totalScore);
                  if (calculatedSize > reconnectedPlayer.size) {
                    reconnectedPlayer.size = calculatedSize;
                    console.log(`💰 Reconnected player ${reconnectedPlayer.id} - Updated size to ${calculatedSize} based on totalScore ${playerStats.totalScore} (current game score remains ${reconnectedPlayer.score})`);
                  }
                }
                
                // Log final state for debugging
                console.log(`✅ Reconnected player ${reconnectedPlayer.id} final state - Score: ${reconnectedPlayer.score}, Size: ${reconnectedPlayer.size}`);
    } else {
                console.log(`❌ No playerStats found for reconnected ${reconnectedPlayer.id}`);
              }
            })
            .catch(error => {
              console.error('Error loading reconnected player data from Firestore:', error);
            });
        } else {
          console.log(`⚠️ No ID for reconnected player ${name}`);
        }
      
      // Send game state to reconnected player
      const gameStateForClient = {
        players: Array.from(gameState.players.values()),
        bots: Array.from(gameState.bots.values()),
        coins: Array.from(gameState.coins.values()),
        boosters: Array.from(gameState.boosters.values()),
        worldSize: gameState.worldSize,
        playerId: socket.id,
        matchTimeLeft: gameState.matchTimeLeft,
        gameStarted: gameState.gameStarted,
        gameEnded: gameState.gameEnded
      };
      
      socket.emit('gameState', gameStateForClient);
      console.log(`🔄 Player ${name} reconnected with preserved score: ${reconnectedPlayer.score}`);
    } else {
      // New player joining - create player object
      const playerId = wallet || `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create player with default values first
      const player = {
        id: playerId,
        name: name,
        ...getRandomPosition(), // Use the same spawn logic as coins to ensure proper positioning
        vx: 0,
        vy: 0,
        targetVx: 0,
        targetVy: 0,
        score: 0,
        size: 20,
        socketId: socket.id,
        lastSeen: Date.now(),
        wallet: wallet,
        color: playerData.color || `hsl(${Math.random() * 360}, 70%, 50%)`,
        isBot: false,
        lastActivity: Date.now(),
        lastPosition: { x: 0, y: 0 }
      };
      
      // Initialize last position
      player.lastPosition = { x: player.x, y: player.y };
      
      // Load saved player data from Firestore if player exists (but don't set score)
      if (playerId) {
        console.log(`🔍 Loading data for playerId: ${playerId} (new game, score starts at 0)`);
        // Load data synchronously to avoid race conditions
        GameDataService.getPlayerStats(playerId)
          .then(playerStats => {
            console.log(`📊 Received playerStats for ${playerId}:`, playerStats);
            if (playerStats) {
              // Load saved size (but preserve current game score at 0)
              if (playerStats.lastSize) {
                player.size = playerStats.lastSize;
                console.log(`🎯 Loaded saved size ${playerStats.lastSize} for player ${playerId} (current game score remains 0)`);
              }
              
              // Load size based on Total Coins (but don't set current game score)
              if (playerStats.totalScore) {
                // Don't set current game score to totalScore - keep it at 0 for new game
                // player.score = playerStats.totalScore; // REMOVED - this was causing score doubling
                // Update size based on loaded totalScore (this represents player's progress)
                player.size = calculatePlayerSize(playerStats.totalScore);
                console.log(`💰 Loaded totalScore ${playerStats.totalScore} from Firestore for player ${playerId}, calculated size: ${player.size} (current game score remains 0)`);
              }
              
              // Log final state for debugging
              console.log(`✅ New player ${playerId} final state - Score: ${player.score}, Size: ${player.size}`);
              
              // Update the player in gameState with loaded data (but don't change score)
              const playerInGame = gameState.players.get(socket.id);
              if (playerInGame) {
                // Only update size, not score (score should remain 0 for new game)
                playerInGame.size = player.size;
                console.log(`✅ Updated player ${playerId} in gameState with loaded data: size=${player.size} (score remains 0 for new game)`);
              }
            } else {
              console.log(`❌ No playerStats found for ${playerId}`);
            }
          })
          .catch(error => {
            console.error('Error loading player data from Firestore:', error);
          });
      } else {
        console.log(`⚠️ No playerId provided for ${name}`);
      }
      
      // Add player to game state using socket.id as key (for compatibility with existing code)
    gameState.players.set(socket.id, player);
    
      // Start match if this is the first player and game hasn't started
      if (gameState.players.size === 1 && !gameState.gameStarted && !gameState.gameEnded) {
        console.log(`🎮 First player joined, starting new match`);
        startNewMatch();
      }
      
      // Send game state to new player
      const gameStateForClient = {
      players: Array.from(gameState.players.values()),
      bots: Array.from(gameState.bots.values()),
      coins: Array.from(gameState.coins.values()),
        boosters: Array.from(gameState.boosters.values()),
      worldSize: gameState.worldSize,
        playerId: socket.id,
        matchTimeLeft: gameState.matchTimeLeft,
        gameStarted: gameState.gameStarted,
        gameEnded: gameState.gameEnded
      };
      
      socket.emit('gameState', gameStateForClient);
      
      // Broadcast new player to all other players
      socket.broadcast.emit('playerJoined', player);
      
      console.log(`🎮 New player ${name} joined with ID: ${playerId}, initial score: ${player.score}, initial size: ${player.size} (score starts at 0 for new game)`);
    }
  });

  socket.on('playerMove', (movement) => {
    const player = gameState.players.get(socket.id);
    if (player && !gameState.gameEnded) {
      // Debug: Log received movement
      console.log(`🎮 Received movement for ${player.name}: (${movement.x}, ${movement.y})`);
      
      // Update activity when player sends movement input
      if (movement.x !== 0 || movement.y !== 0) {
        player.lastActivity = Date.now();
      }
      
      // Calculate speed based on player size (bigger = slower)
      const baseSpeed = 200; // base pixels per second
              const sizeSpeedMultiplier = calculateSpeedMultiplier(player.score);
      let speed = baseSpeed * sizeSpeedMultiplier;
      
      // Apply speed booster if active
      if (player.speedBoost) {
        speed *= 2; // Double speed
        console.log(`🚀 Speed boost applied for player ${player.name}`);
      }
      
      // Set target velocity instead of instant position update
      player.targetVx = movement.x * speed;
      player.targetVy = movement.y * speed;
      
      // Debug: Log calculated target velocity
      console.log(`🎮 Player ${player.name} target velocity: (${Math.round(player.targetVx * 10) / 10}, ${Math.round(player.targetVy * 10) / 10})`);
    } else {
      // Enhanced debugging for playerMove issues
      console.log(`⚠️ playerMove ignored - Socket ID: ${socket.id}`);
      console.log(`⚠️ Player found: ${!!player}`);
      console.log(`⚠️ GameStarted: ${gameState.gameStarted}`);
      console.log(`⚠️ GameEnded: ${gameState.gameEnded}`);
      console.log(`⚠️ Total players in game: ${gameState.players.size}`);
      console.log(`⚠️ Available player names: ${Array.from(gameState.players.values()).map(p => p.name).join(', ')}`);
      console.log(`⚠️ Available socket IDs: ${Array.from(gameState.players.keys()).join(', ')}`);
    }
  });

  socket.on('chatMessage', (data) => {
    const player = gameState.players.get(socket.id);
    if (player && data.message && data.message.trim().length > 0) {
      // Update activity when player sends chat message
      player.lastActivity = Date.now();
      
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

  socket.on('updatePlayerScore', (data) => {
    // Update player score when client requests it (for initialization from Total Coins)
    const player = gameState.players.get(socket.id);
    if (player && data.playerId === player.id && typeof data.score === 'number' && data.score >= 0) {
      console.log(`💰 Updating player ${player.name} score from ${player.score} to ${data.score}`);
      player.score = data.score;
      
      // Broadcast updated game state to all clients
      io.emit('gameUpdate', {
        players: Array.from(gameState.players.values()).map(p => ({
          id: p.id,
          x: Math.round(p.x),
          y: Math.round(p.y),
          vx: Math.round(p.vx * 10) / 10,
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
          y: Math.round(c.y),
          value: c.value
        })),
        boosters: Array.from(gameState.boosters.values()).map(b => ({
          id: b.id,
          x: Math.round(b.x),
          y: Math.round(b.y),
          type: b.type,
          name: b.name,
          color: b.color,
          effect: b.effect
        }))
      });
    }
  });

  socket.on('updatePlayerSize', (data) => {
    // Update player size when client requests it (for initialization from saved size)
    const player = gameState.players.get(socket.id);
    if (player && data.playerId === player.id && typeof data.size === 'number' && data.size >= 20) {
      console.log(`📏 Updating player ${player.name} size from ${player.size} to ${data.size}`);
      player.size = data.size;
      
      // Broadcast updated game state to all clients
      io.emit('gameUpdate', {
        players: Array.from(gameState.players.values()).map(p => ({
          id: p.id,
          x: Math.round(p.x),
          y: Math.round(p.y),
          vx: Math.round(p.vx * 10) / 10,
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
          y: Math.round(c.y),
          value: c.value
        })),
        boosters: Array.from(gameState.boosters.values()).map(b => ({
          id: b.id,
          x: Math.round(b.x),
          y: Math.round(b.y),
          type: b.type,
          name: b.name,
          color: b.color,
          effect: b.effect
        }))
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket ${socket.id} disconnected`);
    
    // Save player state for potential reconnection (5 minutes)
    const player = gameState.players.get(socket.id);
    if (player && player.firebaseId) {
      console.log(`💾 Saving state for disconnected player: ${player.name} (${player.score} coins, size: ${player.size})`);
      
      // Save game session when player disconnects (regardless of score)
      GameDataService.saveGameSession(player.firebaseId, {
        playerName: player.name,
        score: player.score,
        walletAddress: player.wallet || ''
      }).then(() => {
        console.log(`✅ Game session saved for ${player.name}`);
      }).catch(error => {
        console.error(`❌ Failed to save game session for ${player.name}:`, error);
      });
      
      // Save player size when player disconnects
      if (player.firebaseId || player.playerId) {
        const playerIdForSize = player.firebaseId || player.playerId;
        setTimeout(async () => {
          try {
            await GameDataService.savePlayerSize(playerIdForSize, player.size);
            console.log(`✅ Player size saved for ${player.name}: ${player.size}`);
          } catch (error) {
            console.error('Error saving player size on disconnect:', error);
          }
        }, 0);
      }
      
      disconnectedPlayers.set(player.firebaseId, player);
      setTimeout(() => {
        if (disconnectedPlayers.has(player.firebaseId)) {
          disconnectedPlayers.delete(player.firebaseId);
          console.log(`🗑️ Cleaned up disconnected player data for: ${player.name}`);
        }
      }, 5 * 60 * 1000); // 5 minutes
    } else {
      console.log(`⚠️ No player found for disconnected socket: ${socket.id}`);
    }
    
    // Remove player from game state
    const removed = gameState.players.delete(socket.id);
    console.log(`🗑️ Player removed from game state: ${removed ? 'Yes' : 'No'} (socket: ${socket.id})`);
  });
});

// Game loop variables
let lastUpdate = Date.now();
let updateCounter = 0;
let lastAFKCheck = Date.now();

// Game loop (optimized)
setInterval(() => {
  const now = Date.now();
  const deltaTime = (now - lastUpdate) / 1000;
  lastUpdate = now;
  
  // Debug: Log game state
  console.log(`🔄 Game loop - Players: ${gameState.players.size}, Bots: ${gameState.bots.size}, Coins: ${gameState.coins.size}`);
  
  // Log coin distribution every 30 seconds
  if (now % 30000 < 16) {
    const coins = Array.from(gameState.coins.values());
    if (coins.length > 0) {
      const minX = Math.min(...coins.map(c => c.x));
      const maxX = Math.max(...coins.map(c => c.x));
      const minY = Math.min(...coins.map(c => c.y));
      const maxY = Math.max(...coins.map(c => c.y));
      console.log(`💰 Coin distribution - X: ${minX.toFixed(0)} to ${maxX.toFixed(0)}, Y: ${minY.toFixed(0)} to ${maxY.toFixed(0)}`);
    }
  }
  
  // Update game logic with deltaTime for smooth 60fps movement
  updatePlayers(deltaTime);
  updateBots();
  
  // Check for AFK players every 30 seconds (reduce server load)
  if (now - lastAFKCheck > 30000) {
    checkAFKPlayers();
    lastAFKCheck = now;
  }
  
  // Check and redistribute coins if needed (every 10 seconds)
  if (now % 10000 < 16) { // Every ~10 seconds (16ms is roughly one frame at 60fps)
    redistributeCoinsIfNeeded();
  }
  
  // Update rainbow colors for Player Eater boosters and players
  gameState.boosters.forEach(booster => {
    if (booster.type === 'playerEater') {
      booster.rainbowHue = (booster.rainbowHue + 2) % 360; // Rotate rainbow colors
    }
  });
  
  // Update rainbow colors for players with Player Eater boost
  gameState.players.forEach(player => {
    if (player.playerEater) {
      player.rainbowHue = ((player.rainbowHue || 0) + 2) % 360; // Rotate rainbow colors
    }
  });
  
  // Update rainbow colors for bots with Player Eater boost
  gameState.bots.forEach(bot => {
    if (bot.playerEater) {
      bot.rainbowHue = ((bot.rainbowHue || 0) + 2) % 360; // Rotate rainbow colors
    }
  });
  
  // Only broadcast every 3rd frame (20 FPS instead of 60)
  updateCounter++;
  if (updateCounter >= 3) {
    updateCounter = 0;
    
    // Debug: Log movement data
    if (gameState.players.size > 0) {
      const firstPlayer = Array.from(gameState.players.values())[0];
      console.log(`🎮 Player ${firstPlayer.name} - Pos: (${Math.round(firstPlayer.x)}, ${Math.round(firstPlayer.y)}), Vel: (${Math.round(firstPlayer.vx * 10) / 10}, ${Math.round(firstPlayer.vy * 10) / 10})`);
    }
    
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
                color: p.playerEater ? `hsl(${p.rainbowHue || 0}, 70%, 50%)` : p.color,
                playerEater: p.playerEater || false,
                playerEaterEndTime: p.playerEaterEndTime || 0,
                coinBoost: p.coinBoost || false,
                coinBoostEndTime: p.coinBoostEndTime || 0
      })),
      bots: Array.from(gameState.bots.values()).map(b => ({
        id: b.id,
        x: Math.round(b.x),
        y: Math.round(b.y),
        score: b.score,
        size: b.size,
        name: b.name,
                color: b.playerEater ? `hsl(${b.rainbowHue || 0}, 70%, 50%)` : b.color,
                playerEater: b.playerEater || false,
                playerEaterEndTime: b.playerEaterEndTime || 0,
                coinBoost: b.coinBoost || false,
                coinBoostEndTime: b.coinBoostEndTime || 0
      })),
      coins: Array.from(gameState.coins.values()).map(c => ({
        id: c.id,
        x: Math.round(c.x),
        y: Math.round(c.y)
            })),
            boosters: Array.from(gameState.boosters.values()).map(b => ({
                id: b.id,
                x: Math.round(b.x),
                y: Math.round(b.y),
                type: b.type,
                name: b.name,
                color: b.type === 'playerEater' ? `hsl(${b.rainbowHue || 0}, 70%, 50%)` : b.color,
                effect: b.effect,
                rainbowHue: b.rainbowHue || 0
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
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 API endpoints:`);
  console.log(`   - GET /api/players - All players with online status`);
  console.log(`   - GET /api/leaderboard - Global leaderboard`);
  console.log(`   - GET /api/player/:id - Player stats`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  
  // Notify all clients about server shutdown
  io.emit('serverShutdown', { message: 'Server is restarting, please wait...' });
  
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
}); 

// API endpoint for cleaning up duplicate players
app.post('/api/cleanup-duplicates', async (req, res) => {
  try {
    console.log('🧹 API /api/cleanup-duplicates called');
    await GameDataService.cleanupDuplicatePlayerDocuments();
    res.json({ message: 'Duplicate cleanup completed successfully' });
  } catch (error) {
    console.error('❌ Error cleaning up duplicates:', error);
    res.status(500).json({ error: 'Failed to cleanup duplicates' });
  }
}); 

// API endpoint for cleaning up duplicate players by wallet
app.post('/api/cleanup-duplicates-wallet', async (req, res) => {
  try {
    console.log('🧹 API /api/cleanup-duplicates-wallet called');
    await GameDataService.cleanupDuplicatePlayerDocumentsByWallet();
    res.json({ message: 'Wallet duplicate cleanup completed successfully' });
  } catch (error) {
    console.error('❌ Error cleaning up wallet duplicates:', error);
    res.status(500).json({ error: 'Failed to cleanup wallet duplicates' });
  }
}); 