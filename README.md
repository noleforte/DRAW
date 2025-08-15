# 🪙 Multiplayer Coin Collector Game

A real-time multiplayer web game inspired by Agar.io, featuring a large world map where players control balls to collect coins and compete for the highest score!

## 🎮 Features

### Core Gameplay
- **Large World Map**: 4000x4000 unit world with infinite scrolling grid background
- **Smooth Movement**: WASD/Arrow keys for desktop, virtual joystick for mobile
- **Dynamic Camera**: Follows player with smooth interpolation and speed-based zoom
- **Coin Collection**: 200+ randomly spawned coins across the map
- **Real-time Multiplayer**: Up to multiple players can play simultaneously

### AI System
- **Smart AI Bots**: 8 AI-controlled players with pathfinding to nearest coins
- **Bot Personalities**: Random names (BotMax, CoinHunter, Goldy, etc.)
- **AI Chat**: Bots occasionally send funny messages in chat

### Social Features
- **Real-time Chat**: Chat panel for player communication
- **Speech Bubbles**: Messages appear above player balls for 4 seconds
- **Leaderboard**: Top 10 players displayed in real-time
- **Player Identification**: Your ball has a white border, bots have AI indicators

### Responsive Design
- **Desktop**: Full chat panel on right side, keyboard controls
- **Tablet**: Collapsible chat panel, optimized layout
- **Mobile**: Virtual joystick, mobile-optimized chat modal

### Visual Polish
- **Coin Animations**: Shimmering gold coins with shine effects
- **Smooth Animations**: Interpolated movement for all entities
- **Grid Background**: Infinite scrolling grid for spatial awareness
- **Speed Indicator**: Shows current movement speed
- **Color-coded Players**: Random HSL colors for each player

## 🚀 Setup & Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation Steps

1. **Clone or download the project**
   ```bash
   cd DRAW
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open your browser**
   Navigate to: `http://localhost:3000`

### Development Mode
For development with auto-restart:
```bash
npm run dev
```

## 🎯 How to Play

### Getting Started
1. Enter your name when prompted (or get a random name)
2. Use WASD or arrow keys to move your ball (desktop)
3. Use the virtual joystick on mobile devices
4. Collect golden coins to increase your score

### Controls
- **Desktop**: WASD or Arrow Keys for movement
- **Mobile**: Virtual joystick in bottom-left corner
- **Chat**: Press Enter to focus chat input, Enter again to send
- **Mobile Chat**: Tap the chat button (💬) to open chat modal

### Objectives
- Collect as many coins as possible to increase your score
- Compete with other players and AI bots for the top spot
- Chat with other players using the chat system
- Watch your position on the real-time leaderboard

## 🔧 Technical Details

### Backend (Node.js + Socket.io)
- Real-time WebSocket communication
- 60 FPS game loop for smooth gameplay
- AI bot pathfinding and behavior
- Coin respawning system
- Player state management

### Frontend (HTML5 Canvas + JavaScript)
- Canvas-based rendering for optimal performance
- Responsive design with Tailwind CSS
- Mobile touch controls
- Real-time UI updates
- Speech bubble animations

### Features Implemented
- ✅ Large world map (4000x4000 units)
- ✅ Smooth camera movement with dynamic zoom
- ✅ Keyboard and mobile joystick controls
- ✅ Random coin spawning and collection
- ✅ AI bots with pathfinding
- ✅ Real-time leaderboard
- ✅ Chat system with speech bubbles
- ✅ Responsive design for all devices
- ✅ Visual animations and polish

## 📱 Mobile Support

The game is fully optimized for mobile devices:
- Touch-based virtual joystick for movement
- Responsive UI that adapts to screen size
- Mobile-optimized chat modal
- Smaller speech bubbles for better visibility
- Performance optimizations for mobile browsers

## 🤖 AI Bots

AI bots enhance the multiplayer experience:
- **Pathfinding**: Move toward nearest coins using distance calculations
- **Realistic Behavior**: Avoid overlapping with other players when possible
- **Chat Participation**: Send random messages every 30-90 seconds
- **Leaderboard Competition**: Can achieve high scores and appear on leaderboard
- **Visual Indicators**: Green AI badge to distinguish from human players

## 🌐 Browser Compatibility

- ✅ Chrome/Chromium (Recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Edge
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## 🎨 Customization

You can easily customize the game:
- Modify `worldSize` in `server.js` for different world sizes
- Change bot names in the `botNames` array
- Adjust AI behavior in the `updateBots()` function
- Modify coin count by changing the parameter in `generateCoins()`
- Customize colors and styling in the CSS and canvas rendering

## 🐛 Troubleshooting

**Game not loading?**
- Check that the server is running on port 3000
- Ensure no other applications are using port 3000
- Try refreshing the browser

**Mobile controls not working?**
- Ensure you're using a modern mobile browser
- Try reloading the page
- Check if touch events are enabled

**Performance issues?**
- Close other browser tabs
- Try reducing the number of AI bots in `server.js`
- Use Chrome for best performance

## 🎉 Enjoy Playing!

Have fun collecting coins and competing with players and AI bots from around the world! The game features a persistent leaderboard, real-time chat, and smooth multiplayer action that scales beautifully across all devices.

Happy gaming! 🎮✨ 