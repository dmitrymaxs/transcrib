#!/usr/bin/env node
/**
 * Генерация кода активации по Device ID (из Telegram-сообщения пользователя).
 * Использование: node scripts/generate-activation-code.js <DEVICE_ID>
 */
const { generateActivationCodeForDevice } = require('../src/license');

const deviceId = process.argv[2];
if (!deviceId) {
    console.error('Укажите Device ID: node scripts/generate-activation-code.js <DEVICE_ID>');
    process.exit(1);
}

const code = generateActivationCodeForDevice(deviceId.trim().toUpperCase());
console.log('Device ID:', deviceId.trim().toUpperCase());
console.log('Код активации:', code);
