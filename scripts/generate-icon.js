#!/usr/bin/env node
/**
 * Сборка transcrib-icon.ico из PNG в корне проекта (Windows).
 */
const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'transcrib-icon.ico');

const SOURCES = [
    'transcrib-icon-256.png',
    'transcrib-icon-512.png',
    'transcrib-icon-1024.png',
].map((name) => path.join(ROOT, name));

async function main() {
    const existing = SOURCES.filter((p) => fs.existsSync(p));
    if (existing.length === 0) {
        console.error('Нет PNG-иконок в корне проекта (transcrib-icon-256.png и т.д.)');
        process.exit(1);
    }

    const buf = await pngToIco(existing);
    fs.writeFileSync(OUT, buf);
    console.log('Создан:', OUT, `(${existing.length} размер(ов))`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
