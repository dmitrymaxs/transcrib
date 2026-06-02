const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const license = require('./license');

const APP_ROOT = path.join(__dirname, '..');

function getAppIconPath() {
    const ico = path.join(APP_ROOT, 'transcrib-icon.ico');
    const png = path.join(APP_ROOT, 'transcrib-icon-256.png');
    if (process.platform === 'win32' && fs.existsSync(ico)) return ico;
    if (fs.existsSync(png)) return png;
    return undefined;
}

/** Корень Python-проекта Transcrib (родитель transcrib-electron) */
const TRANSCRIB_ROOT = path.join(__dirname, '..', '..');
const MAIN_PY = path.join(TRANSCRIB_ROOT, 'main.py');
const JSON_STDOUT_MARKER = 'TRANSCRIB_RESULT:';

const EXPORT_FORMATS = {
    txt: { name: 'Текст (TXT)', ext: 'txt' },
    json: { name: 'JSON', ext: 'json' },
    srt: { name: 'Субтитры (SRT)', ext: 'srt' },
    vtt: { name: 'Субтитры (VTT)', ext: 'vtt' },
};

function ensureExtension(filePath, ext) {
    const expected = '.' + ext;
    if (path.extname(filePath).toLowerCase() === expected) {
        return filePath;
    }
    return filePath + expected;
}

function getPythonCandidates() {
    if (process.platform === 'win32') {
        return ['py', 'python', 'python3'];
    }
    return ['python3', 'python'];
}

async function runPython(args, onLog) {
    const candidates = getPythonCandidates();
    let lastError = null;

    for (const cmd of candidates) {
        const spawnArgs = cmd === 'py' ? ['-3', ...args] : args;

        try {
            const result = await new Promise((resolve, reject) => {
                const child = spawn(cmd, spawnArgs, {
                    cwd: TRANSCRIB_ROOT,
                    windowsHide: true,
                });

                let stdout = '';
                let stderr = '';

                const emitLog = (text, stream) => {
                    if (!text || !onLog) return;
                    text.split(/\r?\n/).forEach((line) => {
                        const trimmed = line.trim();
                        if (trimmed) onLog(trimmed, stream);
                    });
                };

                child.stdout.on('data', (data) => {
                    const chunk = data.toString();
                    stdout += chunk;
                    emitLog(chunk, 'stdout');
                });

                child.stderr.on('data', (data) => {
                    const chunk = data.toString();
                    stderr += chunk;
                    emitLog(chunk, 'stderr');
                });

                child.on('error', (err) => reject(err));

                child.on('close', (code) => {
                    resolve({ code, stdout, stderr, command: cmd });
                });
            });

            return result;
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error('Python не найден. Установите Python 3 и добавьте в PATH.');
}

function parseTranscribJson(stdout) {
    const markerIndex = stdout.indexOf(JSON_STDOUT_MARKER);
    if (markerIndex >= 0) {
        const jsonPart = stdout.slice(markerIndex + JSON_STDOUT_MARKER.length).trim();
        return JSON.parse(jsonPart);
    }

    const start = stdout.indexOf('{');
    const end = stdout.lastIndexOf('}');
    if (start >= 0 && end > start) {
        return JSON.parse(stdout.slice(start, end + 1));
    }

    throw new Error('Не удалось разобрать ответ Python (нет JSON в выводе)');
}

let mainWindow;
const PROGRAM_SITE_URL = 'https://xn----7sbbimud6a4an4b5dh.org/transcrib/';
const LICENSE_PATH = path.join(APP_ROOT, 'LICENSE');

function getUserDataPath() {
    return app.getPath('userData');
}

function assertLicensed() {
    if (!license.isAppLicensed(getUserDataPath())) {
        throw new Error('LICENSE_REQUIRED');
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        icon: getAppIconPath(),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        backgroundColor: '#1e1e2e',
        show: false,
    });

    mainWindow.loadFile('src/index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

async function showLicenseDialog() {
    const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Лицензия',
        message: 'Transcrib Electron распространяется по Business Source License 1.1',
        detail: [
            'Правообладатель: Dmitry Maksimov',
            'Change Date: January 1, 2030',
            'Change License: Apache License, Version 2.0',
        ].join('\n'),
        buttons: ['Закрыть', 'Открыть LICENSE'],
        defaultId: 0,
        cancelId: 0,
    });

    if (result.response === 1) {
        await shell.openPath(LICENSE_PATH);
    }
}

function createAppMenu() {
    const template = [
        {
            label: 'Файл',
            submenu: [{ role: 'quit', label: 'Выход' }],
        },
        {
            label: 'Вид',
            submenu: [
                { role: 'reload', label: 'Обновить' },
                { role: 'forceReload', label: 'Принудительно обновить' },
                { role: 'toggleDevTools', label: 'Инструменты разработчика' },
                { type: 'separator' },
                { role: 'resetZoom', label: 'Сбросить масштаб' },
                { role: 'zoomIn', label: 'Увеличить масштаб' },
                { role: 'zoomOut', label: 'Уменьшить масштаб' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Полноэкранный режим' },
            ],
        },
        {
            label: 'Помощь',
            submenu: [
                {
                    label: 'Лицензия',
                    click: showLicenseDialog,
                },
                { type: 'separator' },
                {
                    label: 'Сайт программы',
                    click: async () => {
                        await shell.openExternal(PROGRAM_SITE_URL);
                    },
                },
            ],
        },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
    createAppMenu();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.handle('license-status', () => license.getLicenseStatus(getUserDataPath()));

ipcMain.handle('license-activate', (event, code) =>
    license.activateWithCode(getUserDataPath(), code)
);

ipcMain.handle('license-open-telegram', async () => {
    const { deviceId } = license.getLicenseStatus(getUserDataPath());
    const url = license.buildTelegramRequestUrl(deviceId);
    await shell.openExternal(url);
    return { ok: true };
});

ipcMain.handle('select-file', async () => {
    assertLicensed();
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            {
                name: 'Audio/Video',
                extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'mp4', 'avi', 'mkv', 'mov'],
            },
            { name: 'All Files', extensions: ['*'] },
        ],
    });
    return result.filePaths[0] || null;
});

ipcMain.handle('save-export', async (event, { defaultName, format, content }) => {
    assertLicensed();
    const config = EXPORT_FORMATS[format];
    if (!config) {
        return { ok: false, error: 'Неподдерживаемый формат' };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [{ name: config.name, extensions: [config.ext] }],
    });

    if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
    }

    const filePath = ensureExtension(result.filePath, config.ext);
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true, filePath };
});

ipcMain.handle('check-environment', async () => {
    const checks = {
        python: false,
        mainPy: fs.existsSync(MAIN_PY),
        whisper: false,
        ffmpeg: false,
        transcribRoot: TRANSCRIB_ROOT,
        messages: [],
    };

    if (!checks.mainPy) {
        checks.messages.push(`Не найден main.py: ${MAIN_PY}`);
        return checks;
    }

    try {
        const { code, stderr } = await runPython([
            '-c',
            "import whisper; import ffmpeg; print('ok')",
        ]);
        checks.python = code === 0;
        checks.whisper = checks.python;
        checks.ffmpeg = checks.python;
        if (!checks.python) {
            checks.messages.push(stderr.trim() || 'Установите: pip install -r requirements.txt');
        }
    } catch (e) {
        checks.messages.push(String(e.message || e));
    }

    return checks;
});

ipcMain.handle('transcribe', async (event, { filePath, model, language, convert }) => {
    assertLicensed();
    if (!fs.existsSync(MAIN_PY)) {
        throw new Error(`Не найден Python-бэкенд: ${MAIN_PY}`);
    }

    const args = [MAIN_PY, filePath, '-m', model, '--json-stdout'];

    if (language && language !== 'auto') {
        args.push('-l', language);
    }

    if (convert) {
        args.push('--convert');
    }

    const sendLog = (line) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('transcribe-log', line);
        }
    };

    console.log('Запуск транскрибации:', args.join(' '));

    const { code, stdout, stderr, command } = await runPython(args, sendLog);

    if (code !== 0) {
        const detail = (stderr || stdout).trim();
        throw new Error(detail || `Python завершился с кодом ${code} (${command})`);
    }

    try {
        return parseTranscribJson(stdout);
    } catch (e) {
        console.error('Parse error:', e.message, stdout.slice(-500));
        throw new Error('Ошибка разбора результата: ' + e.message);
    }
});
