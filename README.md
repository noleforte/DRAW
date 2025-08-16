# 🎮 Royale Ball - Multiplayer Coin Collector

[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat&logo=socket.io&logoColor=white)](https://socket.io/)

Многопользовательская веб-игра, вдохновленная Agar.io, с интеграцией Firebase для хранения статистики игроков и системой кошельков.

## ✨ Особенности

- 🌐 **Многопользовательская игра в реальном времени** с WebSocket
- 🔥 **Firebase интеграция** для хранения статистики
- 🏆 **Глобальный и локальный лидерборды**
- 💬 **Чат система** с поддержкой мобильных устройств
- 🤖 **AI боты** для заполнения игры
- 👛 **Поддержка кошельков** (опционально)
- 📱 **Полная поддержка мобильных устройств** с виртуальным джойстиком
- 🎨 **Выбор цвета** персонажа
- ⏱️ **Таймер матчей** (2 минуты)

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
git clone <repository-url>
cd royale-ball
npm install
```

### 2. Настройка Firebase

Выполните одну из опций:

#### Опция A: Автоматическая настройка

```bash
npm run setup
```

Следуйте инструкциям в интерактивном скрипте.

#### Опция B: Ручная настройка

1. Создайте проект Firebase на [console.firebase.google.com](https://console.firebase.google.com/)
2. Настройте Firestore Database и Authentication
3. Получите Service Account Key (Project Settings > Service accounts)
4. Скопируйте `.env.example` в `.env` и заполните данными:

```env
FIREBASE_PROJECT_ID=royalball-8cc64
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@royalball-8cc64.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
PORT=3001
NODE_ENV=development
```

### 3. Запуск

```bash
# Для разработки
npm run dev

# Для продакшена
npm start
```

Откройте [http://localhost:3001](http://localhost:3001) в браузере.

## 📖 Подробная настройка Firebase

Полные инструкции доступны в файле [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

### Структура базы данных Firestore

```
players/
  ├── {userId}/
      ├── playerName: string
      ├── walletAddress: string  
      ├── totalScore: number
      ├── gamesPlayed: number
      ├── bestScore: number
      ├── firstPlayed: timestamp
      └── lastPlayed: timestamp

matches/
  ├── {matchId}/
      ├── players: array
      ├── winner: object
      ├── playersCount: number
      └── timestamp: timestamp
```

## 🎯 Геймплей

- Перемещайтесь по игровому полю и собирайте монеты 🪙
- Ваш счет увеличивается с каждой собранной монетой
- Соревнуйтесь с другими игроками и AI ботами
- Используйте чат для общения с другими игроками
- Матчи длятся 2 минуты, после чего подводятся итоги

### Управление

- **ПК**: WASD или стрелки для движения
- **Мобильные**: Виртуальный джойстик в левом нижнем углу
- **Чат**: Enter для фокуса на чате, затем введите сообщение

## 🏗️ Архитектура

### Клиентская часть

- `public/index.html` - основной HTML файл
- `public/game.js` - основная логика онлайн игры
- `public/game-offline.js` - офлайн режим для тестирования
- `public/firebase-config.js` - конфигурация Firebase
- `public/auth.js` - система аутентификации
- `public/leaderboard.js` - управление лидербордами

### Серверная часть

- `server.js` - основной сервер с Socket.io
- `firebase-admin.js` - Firebase Admin SDK и GameDataService

## 🔧 API Endpoints

- `GET /api/leaderboard?limit=10` - глобальный лидерборд
- `GET /api/player/:playerId` - статистика игрока

## 🌍 Деплой на Render

1. Создайте новый Web Service в [Render](https://render.com/)
2. Подключите ваш GitHub репозиторий
3. Настройте переменные окружения из `.env`
4. Build Command: `npm install`
5. Start Command: `npm start`

### Переменные окружения для Render

```
FIREBASE_PROJECT_ID=royalball-8cc64
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@royalball-8cc64.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n
NODE_ENV=production
```

## 🎨 Кастомизация

### Цвета игроков

Измените палитру в `public/index.html`:

```html
<div class="color-option" style="background-color: #your-color" data-color="hue-value"></div>
```

### Параметры игры

В `server.js`:

```javascript
const gameState = {
  worldSize: 4000,     // Размер игрового мира
  matchTimeLeft: 120,  // Длительность матча в секундах
  // ...
};
```

### AI боты

Настройте количество и поведение ботов в `server.js`:

```javascript
// Создание AI ботов
for (let i = 0; i < 8; i++) {  // Измените количество ботов
  const bot = createBot(gameState.nextBotId++);
  gameState.bots.set(bot.id, bot);
}
```

## 🐛 Отладка

### Проблемы с Firebase

1. **Ошибки подключения**: Проверьте правильность Service Account Key
2. **Ошибки Firestore**: Убедитесь, что правила безопасности настроены корректно
3. **CORS ошибки**: Добавьте ваш домен в настройки Firebase

### Проблемы с WebSocket

1. **Подключение отклонено**: Проверьте, что сервер запущен на правильном порту
2. **Проблемы на Render**: Убедитесь, что WebSocket трафик разрешен

## 📊 Мониторинг

### Firebase Console

- Просматривайте данные игроков в Firestore
- Отслеживайте аутентификацию в Authentication
- Анализируйте использование в Analytics

### Логи сервера

```bash
# При разработке
npm run dev

# Логи покажут:
# - Подключения игроков
# - Ошибки Firebase
# - Состояние матчей
```

## 🤝 Вклад в проект

1. Fork проекта
2. Создайте feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit изменения (`git commit -m 'Add some AmazingFeature'`)
4. Push в branch (`git push origin feature/AmazingFeature`)
5. Создайте Pull Request

## 📄 Лицензия

Этот проект лицензирован под MIT License - смотрите файл [LICENSE](LICENSE) для деталей.

## 🆘 Поддержка

Если у вас возникли проблемы:

1. Проверьте [Issues](https://github.com/your-repo/issues) на GitHub
2. Прочитайте [FIREBASE_SETUP.md](FIREBASE_SETUP.md)
3. Убедитесь, что все зависимости установлены: `npm install`
4. Проверьте логи сервера на наличие ошибок

---

Сделано с ❤️ для сообщества геймеров 