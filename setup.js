#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


async function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function setup() {
    

    const hasServiceAccount = await question('У вас есть Service Account Key? (y/n): ');
    
    if (hasServiceAccount.toLowerCase() !== 'y') {
        
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
        
    } catch (error) {
        console.error('\n❌ Ошибка создания .env файла:', error.message);
    }

    rl.close();
}

setup().catch(console.error); 