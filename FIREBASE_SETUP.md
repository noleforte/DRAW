# Настройка Firebase для Royale Ball

## 1. Создание проекта Firebase

1. Перейдите на [Firebase Console](https://console.firebase.google.com/)
2. Нажмите "Add project" или "Создать проект"
3. Введите название проекта: `royale-ball` (или ваше название)
4. Включите Google Analytics (опционально)
5. Выберите аккаунт Google Analytics
6. Нажмите "Create project"

## 2. Настройка Authentication

1. В боковом меню выберите "Authentication"
2. Перейдите на вкладку "Sign-in method"
3. Включите следующие методы:
   - **Anonymous** (для гостевых игроков) ✅ 
   - **Email/Password** (для зарегистрированных пользователей) ✅
   - **Google** (для входа через Google аккаунт) ✅
4. Сохраните настройки

### Настройка Google Sign-In:
1. Нажмите на "Google" в списке провайдеров
2. Переключите в положение "Enable"
3. Выберите Project support email
4. Нажмите "Save"

## 3. Настройка Firestore Database

1. В боковом меню выберите "Firestore Database"
2. Нажмите "Create database"
3. Выберите режим "Start in test mode" (для разработки)
4. Выберите локацию сервера (ближайшую к вашим пользователям)

### Структура коллекций:

```
players/
  ├── {userId}/
      ├── playerName: string
      ├── walletAddress: string
      ├── totalScore: number
      ├── gamesPlayed: number
      ├── bestScore: number
      ├── firstPlayed: timestamp
      ├── lastPlayed: timestamp
      └── lastUpdated: timestamp

matches/
  ├── {matchId}/
      ├── playerId: string
      ├── playerName: string
      ├── score: number
      ├── matchDuration: number
      ├── playersCount: number
      └── timestamp: timestamp
```

## 4. Настройка правил безопасности Firestore

1. В боковом меню выберите "Firestore Database"
2. Перейдите на вкладку "Rules"
3. Замените правила на содержимое файла `firestore.rules` из проекта:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Правила для коллекции игроков
    match /players/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow read: if true; // Разрешить чтение для лидерборда
    }
    
    // Правила для коллекции матчей
    match /matches/{matchId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }
    
    // Запретить доступ ко всем остальным коллекциям
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

4. Нажмите "Publish" для применения правил

## 5. Получение конфигурации для веб-приложения

1. В Project Overview нажмите на иконку веб-приложения (`</>`)
2. Введите nickname приложения: `royale-ball-web`
3. НЕ включайте Firebase Hosting пока
4. Нажмите "Register app"
5. Скопируйте конфигурацию Firebase

## 6. Настройка клиентской конфигурации

Отредактируйте файл `public/firebase-config.js`:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789012",
    appId: "your-app-id"
};
```

## 7. Настройка серверной конфигурации

### Создание Service Account:

1. В Project Settings > Service accounts
2. Нажмите "Generate new private key"
3. Сохраните JSON файл

### Настройка переменных окружения:

Создайте файл `.env` в корне проекта:

```env
# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com

# Другие настройки
PORT=3001
NODE_ENV=development
```

## 8. Установка зависимостей

```bash
npm install
```

## 9. Запуск приложения

```bash
# Для разработки
npm run dev

# Для продакшена
npm start
```

## 10. Тестирование

1. Откройте `http://localhost:3001`
2. Введите имя игрока и начните игру
3. Проверьте, что данные сохраняются в Firestore
4. Проверьте работу аутентификации

## Для деплоя на Render

1. В Render Dashboard создайте новый Web Service
2. Подключите GitHub репозиторий
3. Добавьте переменные окружения из файла `.env`
4. Установите Build Command: `npm install`
5. Установите Start Command: `npm start`

## Возможные проблемы

1. **Ошибки CORS**: Добавьте домен Render в настройки Firebase
2. **Ошибки аутентификации**: Проверьте правильность Service Account
3. **Ошибки Firestore**: Проверьте правила безопасности

## Полезные ссылки

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) 