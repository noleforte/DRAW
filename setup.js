#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🎮 Настройка Royale Ball с Firebase\n');

async function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function setup() {
    console.log('Для завершения настройки вам потребуется:');
    console.log('1. Service Account Key из Firebase Console');
    console.log('2. Project ID: royalball-8cc64\n');

    const hasServiceAccount = await question('У вас есть Service Account Key? (y/n): ');
    
    if (hasServiceAccount.toLowerCase() !== 'y') {
        console.log('\n📋 Инструкции для получения Service Account Key:');
        console.log('1. Перейдите в Firebase Console: https://console.firebase.google.com/');
        console.log('2. Выберите проект "royalball-8cc64"');
        console.log('3. Project Settings > Service accounts');
        console.log('4. Нажмите "Generate new private key"');
        console.log('5. Сохраните JSON файл');
        console.log('6. Запустите скрипт снова после получения ключа\n');
        rl.close();
        return;
    }

    const privateKey = await question('Вставьте private_key из JSON файла (начинается с -----BEGIN PRIVATE KEY-----): ');
    const clientEmail = await question('Вставьте client_email из JSON файла: ');

    const envContent = `# Firebase Admin SDK Configuration
FIREBASE_PROJECT_ID=royalball-8cc64
FIREBASE_CLIENT_EMAIL=${clientEmail}
FIREBASE_PRIVATE_KEY="${privateKey}"

# Server Configuration  
PORT=3001
NODE_ENV=development
`;

    try {
        fs.writeFileSync('.env', envContent);
        console.log('\n✅ Файл .env успешно создан!');
        console.log('\n🚀 Следующие шаги:');
        console.log('1. npm install');
        console.log('2. npm run dev');
        console.log('3. Откройте http://localhost:3001');
        console.log('\n📖 Полные инструкции в FIREBASE_SETUP.md');
    } catch (error) {
        console.error('\n❌ Ошибка создания .env файла:', error.message);
    }

    rl.close();
}

setup().catch(console.error); 