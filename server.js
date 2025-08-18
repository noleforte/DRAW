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

// Calculate speed multiplier based on size (bigger = slower)
function calculateSpeedMultiplier(size) {
  // Size ranges from 20 (minimum) to 50 (maximum)
  // Speed multiplier ranges from 1.0 (fastest, small size) to 0.4 (slowest, max size)
  const minSize = 20;
  const maxSize = 50;
  const minSpeedMultiplier = 0.4; // 40% of base speed for maximum size
  const maxSpeedMultiplier = 1.0; // 100% of base speed for minimum size
  
  // Clamp size to valid range
  const clampedSize = Math.max(minSize, Math.min(maxSize, size));
  
  // Linear interpolation from max speed (small size) to min speed (large size)
  const sizeProgress = (clampedSize - minSize) / (maxSize - minSize);
  const speedMultiplier = maxSpeedMultiplier - (sizeProgress * (maxSpeedMultiplier - minSpeedMultiplier));
  
  return speedMultiplier;
}

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

// Bot hunting messages
const botHuntingMessages = [
  "Looking for a snack!", "Time to hunt!", "I see you...",
  "Come here little one!", "You look tasty!", "Fresh meat!",
  "I have more coins than you!", "Easy target spotted!", "Dinner time!",
  "You can't hide!", "I'm coming for you!", "Coin count matters!"
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

// Calculate safe flee target that avoids world boundaries
function calculateSafeFleeTarget(bot, threat, worldSize) {
  const halfWorld = worldSize / 2;
  const safeMargin = 100; // Stay 100 pixels away from edges
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
        console.log(`🔄 Bot ${bot.name} using alternative flee direction`);
        return { x: candidateX, y: candidateY };
      }
    }
  }
  
  // Emergency fallback: move towards center of map
  const centerX = Math.max(minX, Math.min(maxX, 0));
  const centerY = Math.max(minY, Math.min(maxY, 0));
  console.log(`🆘 Bot ${bot.name} emergency flee to center`);
  
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
  
  gameState.bots.forEach(bot => {
    let targetFound = false;
    let targetX = 0, targetY = 0;
    let isFleeingFromThreat = false;
    
    // FIRST PRIORITY: Check for threats that can eat us and flee if needed
    let nearestThreat = null;
    let nearestThreatDistance = Infinity;
    
    const allEntities = [...gameState.players.values(), ...gameState.bots.values()];
    allEntities.forEach(entity => {
      if (entity.id !== bot.id) {
        const distance = Math.sqrt((entity.x - bot.x) ** 2 + (entity.y - bot.y) ** 2);
        
        // Check if this entity can eat us (has more coins) and is close enough to be a threat
        if (entity.score > bot.score && distance < 300) { // 300 pixel threat detection range
          if (distance < nearestThreatDistance) {
            nearestThreat = entity;
            nearestThreatDistance = distance;
          }
        }
      }
    });
    
    // If there's a threat, flee from it (highest priority)
    if (nearestThreat) {
      const dx = bot.x - nearestThreat.x; // Opposite direction
      const dy = bot.y - nearestThreat.y; // Opposite direction
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        // Calculate safe flee target considering world boundaries
        const fleeTarget = calculateSafeFleeTarget(bot, nearestThreat, gameState.worldSize);
        targetX = fleeTarget.x;
        targetY = fleeTarget.y;
        targetFound = true;
        isFleeingFromThreat = true;
        
        // Console logging for debugging  
        console.log(`🏃 Bot ${bot.name} (${bot.score} coins) fleeing from ${nearestThreat.name || nearestThreat.id} (${nearestThreat.score} coins) at distance ${Math.round(nearestThreatDistance)} to safe position (${Math.round(targetX)}, ${Math.round(targetY)})`);
        
        // Occasionally send flee message
        const now = Date.now();
        if (now - bot.lastMessageTime > 25000 && Math.random() < 0.15) { // 15% chance every 25 seconds
          const fleeMessages = [
            "Help! Someone's chasing me! 😱",
            "Running away! 🏃‍♂️💨",
            "Too dangerous here! 😰",
            "Retreat! Retreat! 🏃‍♀️",
            "Getting out of here! 😨",
            "Nope nope nope! 🏃‍♂️",
            "Tactical retreat! 📍",
            "Save yourselves! 😱💨"
          ];
          const fleeMessage = fleeMessages[Math.floor(Math.random() * fleeMessages.length)];
          bot.lastMessageTime = now;
          
          io.emit('chatMessage', {
            playerId: bot.id,
            playerName: bot.name,
            message: fleeMessage,
            timestamp: now
          });
        }
      }
    }
    
    // SECOND PRIORITY: Look for targets to eat (only if not fleeing)
    let bestTarget = null;
    if (!isFleeingFromThreat) {
      let bestTargetDistance = Infinity;
      let bestTargetReward = 0;
    
      // Check all entities for potential targets
      const potentialTargets = [...gameState.players.values(), ...gameState.bots.values()];
      potentialTargets.forEach(target => {
        if (target.id !== bot.id) {
          const distance = Math.sqrt((target.x - bot.x) ** 2 + (target.y - bot.y) ** 2);
          const sizeRatio = bot.size / target.size;
          
          // Only consider targets we can eat (have more coins) and that are worth pursuing
          if (bot.score > target.score && target.score > 5 && distance < 400) { // 400 pixel pursuit range
            const reward = target.score / Math.max(distance, 1); // Score per distance unit
            if (reward > bestTargetReward) {
              bestTarget = target;
              bestTargetDistance = distance;
              bestTargetReward = reward;
            }
          }
        }
      });
      
      // If we found a good target to eat, go for it
      if (bestTarget) {
        // Check if hunting target is safe from boundaries
        const huntingSafe = isTargetSafeFromBoundaries(bot, bestTarget, gameState.worldSize);
        if (huntingSafe) {
          targetX = bestTarget.x;
          targetY = bestTarget.y;
          targetFound = true;
        } else {
          console.log(`🔄 Bot ${bot.name} avoiding boundary while hunting, looking for coins instead`);
          bestTarget = null; // Don't hunt if it's unsafe, fall back to coin collection
        }
        
        // Occasionally taunt the target
        const now = Date.now();
        if (now - bot.lastMessageTime > 30000 && Math.random() < 0.1) { // 10% chance every 30 seconds
          const huntMessage = botHuntingMessages[Math.floor(Math.random() * botHuntingMessages.length)];
          bot.lastMessageTime = now;
          
          io.emit('chatMessage', {
            playerId: bot.id,
            playerName: bot.name,
            message: huntMessage,
            timestamp: now
          });
        }
      } else {
        // Otherwise, find nearest coin
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
          // Check if coin target would lead bot too close to boundaries
          const targetSafe = isTargetSafeFromBoundaries(bot, nearestCoin, gameState.worldSize);
          if (targetSafe) {
            targetX = nearestCoin.x;
            targetY = nearestCoin.y;
            targetFound = true;
          } else {
            // If nearest coin is unsafe, try to find a safer coin or move towards center
            const safeCoin = findSafeCoinTarget(bot, gameState.coins, gameState.worldSize);
            if (safeCoin) {
              targetX = safeCoin.x;
              targetY = safeCoin.y;
              targetFound = true;
              console.log(`🔄 Bot ${bot.name} avoiding boundary, targeting safer coin`);
            } else {
              // Move towards center as fallback
              targetX = 0;
              targetY = 0;
              targetFound = true;
              console.log(`🔄 Bot ${bot.name} moving to center to avoid boundaries`);
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
        
        if (isFleeingFromThreat) {
          // Bots move much faster when fleeing from threats
          speedMultiplier = 1.8; // 80% speed boost when fleeing
        } else if (bestTarget) {
          // Bots move faster when chasing targets to eat
          speedMultiplier = 1.3; // 30% speed boost when hunting
        }
        
        // Apply size-based speed reduction
        const sizeSpeedMultiplier = calculateSpeedMultiplier(bot.size);
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
        bot.score += coin.value;
        gameState.coins.delete(coin.id);
        
        // Respawn coin
        const newCoin = {
          id: gameState.nextCoinId++,
          ...getRandomPosition(),
          value: 1
        };
        gameState.coins.set(newCoin.id, newCoin);
        
        // Player growth based on score (Agar.io style)
        bot.size = Math.min(50, 20 + Math.sqrt(bot.score) * 2);
      }
    });

    // Check eating other players/bots (Agar.io mechanics for bots)
    const eatableEntities = [...gameState.players.values(), ...gameState.bots.values()];
    const entitiesToRemove = [];
    
    eatableEntities.forEach(target => {
             if (target.id !== bot.id) { // Don't eat yourself
         const distance = Math.sqrt((target.x - bot.x) ** 2 + (target.y - bot.y) ** 2);
         
         // Can eat if you have more coins and touching
         if (bot.score > target.score && distance < (bot.size + target.size) * 0.7) {
          // Transfer victim's score to bot
          bot.score += target.score;
          bot.size = Math.min(50, 20 + Math.sqrt(bot.score) * 2);
          
          // Mark entity for removal
          entitiesToRemove.push(target);
          
                     // Send eating message
           io.emit('chatMessage', {
             playerId: bot.id,
             playerName: bot.name,
             message: `Ate ${target.name}! (+${target.score} coins) [Size: ${Math.round(bot.size)}]`,
             timestamp: Date.now()
           });
           
           console.log(`🤖 Bot ${bot.name} (${bot.score} coins, size ${Math.round(bot.size)}) ate ${target.name} (${target.score} coins, size ${Math.round(target.size)})`);
        }
      }
    });
    
         // Remove eaten entities
     entitiesToRemove.forEach(target => {
       if (target.isBot) {
         gameState.bots.delete(target.id);
         // Respawn a new bot after a delay to maintain population
         setTimeout(() => {
           if (gameState.bots.size < 15) { // Maintain bot population
             const newBot = createBot(gameState.nextBotId++);
             gameState.bots.set(newBot.id, newBot);
             console.log(`🤖 Respawned new bot: ${newBot.name}`);
           }
         }, 5000 + Math.random() * 10000); // 5-15 seconds delay
             } else {
        // Save player's coins to Firestore before death
        if (target.score > 0 && (target.firebaseId || target.playerId)) {
          const playerIdForSave = target.firebaseId || target.playerId;
          GameDataService.savePlayerCoin(playerIdForSave, target.score)
            .then(() => {
              console.log(`💰 Saved ${target.score} coins to Firestore for player ${target.name} before death`);
            })
            .catch((error) => {
              console.error('❌ Failed to save coins before death:', error);
            });
        }
        
        // Save game session (match) when player dies to bot
        if ((target.firebaseId || target.playerId)) {
          const playerIdForSave = target.firebaseId || target.playerId;
          GameDataService.saveGameSession(playerIdForSave, {
            playerName: target.name,
            score: target.score,
            walletAddress: target.wallet || ''
          }).then(() => {
            console.log(`🎮 Saved match for player ${target.name} who died to bot (score: ${target.score})`);
          }).catch((error) => {
            console.error('❌ Failed to save match after death to bot:', error);
          });
        }
        
        gameState.players.delete(target.id);
        // If it was a player, send them a death message
        io.emit('playerEaten', {
          victimId: target.id,
          eatenByBot: bot.name,
          coinsLost: target.score, // Keep for backward compatibility
          coinsSaved: target.score // New field to indicate coins are saved
        });
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
        const playerIdForFirebase = player.firebaseId || player.playerId || player.id;
        if (playerIdForFirebase) {
          coinsToSave.push({ playerId: playerIdForFirebase, value: coin.value, playerName: player.name });
          console.log(`🪙 Queuing coin save for player: ${player.name} (ID: ${playerIdForFirebase})`);
        } else {
          console.warn(`⚠️ No player ID found for coin save: ${player.name}`);
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
    const entitiesToRemove = [];
    
    allEntities.forEach(target => {
             if (target.id !== player.id) { // Can eat anyone except yourself
         const distance = Math.sqrt((target.x - player.x) ** 2 + (target.y - player.y) ** 2);
         
         // Can eat if you have more coins and touching
         if (player.score > target.score && distance < (player.size + target.size) * 0.7) {
          // Transfer victim's score to player
          const coinsGained = target.score;
          player.score += coinsGained;
          player.size = Math.min(50, 20 + Math.sqrt(player.score) * 2);
          
          // Mark entity for removal
          entitiesToRemove.push(target);
          
          // Save gained coins to Firebase if player is authenticated
          if (player.firebaseId && coinsGained > 0) {
            setTimeout(async () => {
              try {
                await GameDataService.savePlayerCoin(player.firebaseId, coinsGained);
                console.log(`💾 Saved ${coinsGained} eating coins to Firestore for player ${player.name}`);
              } catch (error) {
                console.error('Error saving eating coins to Firestore:', error);
              }
            }, 0);
          }
          
                     // Send eating notification
           io.emit('chatMessage', {
             playerId: player.id,
             playerName: player.name,
             message: `Ate ${target.name}! (+${coinsGained} coins) [Size: ${Math.round(player.size)}]`,
             timestamp: Date.now()
           });
           
           console.log(`👤 Player ${player.name} (${player.score} coins, size ${Math.round(player.size)}) ate ${target.name} (${target.score} coins, size ${Math.round(target.size)})`);
        }
      }
    });
    
         // Remove eaten entities
     entitiesToRemove.forEach(target => {
       if (target.isBot) {
         gameState.bots.delete(target.id);
         // Respawn a new bot after a delay to maintain population
         setTimeout(() => {
           if (gameState.bots.size < 15) { // Maintain bot population
             const newBot = createBot(gameState.nextBotId++);
             gameState.bots.set(newBot.id, newBot);
             console.log(`🤖 Respawned new bot: ${newBot.name} (eaten by player)`);
           }
         }, 5000 + Math.random() * 10000); // 5-15 seconds delay
             } else {
        // Save player's coins to Firestore before death
        if (target.score > 0 && (target.firebaseId || target.playerId)) {
          const playerIdForSave = target.firebaseId || target.playerId;
          GameDataService.savePlayerCoin(playerIdForSave, target.score)
            .then(() => {
              console.log(`💰 Saved ${target.score} coins to Firestore for player ${target.name} before death`);
            })
            .catch((error) => {
              console.error('❌ Failed to save coins before death:', error);
            });
        }
        
        // Save game session (match) when player dies to player
        if ((target.firebaseId || target.playerId)) {
          const playerIdForSave = target.firebaseId || target.playerId;
          GameDataService.saveGameSession(playerIdForSave, {
            playerName: target.name,
            score: target.score,
            walletAddress: target.wallet || ''
          }).then(() => {
            console.log(`🎮 Saved match for player ${target.name} who died to player (score: ${target.score})`);
          }).catch((error) => {
            console.error('❌ Failed to save match after death to player:', error);
          });
        }
        
        gameState.players.delete(target.id);
        // If it was a player, send them a death message
        io.emit('playerEaten', {
          victimId: target.id,
          eatenByPlayer: player.name,
          coinsLost: target.score, // Keep for backward compatibility
          coinsSaved: target.score // New field to indicate coins are saved
        });
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
        playerId: playerId, // Also store as playerId for consistency
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
      
      console.log(`👤 New player joined: ${player.name} (Socket: ${socket.id}, PlayerID: ${playerId})`);
      console.log(`🎨 Player color: ${player.color} (hue: ${colorHue})`);
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
      // Calculate speed based on player size (bigger = slower)
      const baseSpeed = 200; // base pixels per second
      const sizeSpeedMultiplier = calculateSpeedMultiplier(player.size);
      const speed = baseSpeed * sizeSpeedMultiplier;
      
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
      // Save game session when player disconnects (regardless of score)
      GameDataService.saveGameSession(player.firebaseId, {
        playerName: player.name,
        score: player.score,
        walletAddress: player.wallet || ''
      }).then(() => {
        console.log(`💾 Saved game session for disconnecting player ${player.name} (score: ${player.score})`);
      }).catch(error => {
        console.error('Error saving game session on disconnect:', error);
      });
      
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