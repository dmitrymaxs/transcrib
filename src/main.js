const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Основное окно
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        backgroundColor: '#1e1e2e',
        show: false
    });

    mainWindow.loadFile('src/index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
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

// Выбор файла
ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Audio/Video', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'mp4', 'avi', 'mkv', 'mov'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result.filePaths[0] || null;
});

// Сохранение файла
ipcMain.handle('save-file', async (event, { defaultName, filters }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: filters
    });
    return result.filePath || null;
});

// Запись файла
ipcMain.handle('write-file', async (event, { filePath, content }) => {
    const fs = require('fs');
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
});

// Транскрибация через Python
ipcMain.handle('transcribe', async (event, { filePath, model, language, timestamps }) => {
    return new Promise((resolve, reject) => {
        // Аргументы для Python скрипта
        const args = [
            path.join(__dirname, '..', '..', 'main.py'),
            filePath,
            '-m', model,
            '--json-stdout'
        ];
        
        if (language && language !== 'auto') {
            args.push('-l', language);
        }

        console.log('Запуск транскрибации:', args);

        const python = spawn('python', args, {
            cwd: path.join(__dirname, '..', '..')
        });

        let output = '';
        let error = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
        });

        python.stderr.on('data', (data) => {
            error += data.toString();
        });

        python.on('close', (code) => {
            if (code !== 0) {
                console.error('Python error:', error);
                reject(new Error(error || 'Ошибка транскрибации'));
                return;
            }

            try {
                // Парсим JSON из вывода
                const lines = output.trim().split('\n');
                const jsonLine = lines.find(line => line.trim().startsWith('{'));
                
                if (jsonLine) {
                    const result = JSON.parse(jsonLine);
                    resolve(result);
                } else {
                    // Если нет JSON, возвращаем текст
                    resolve({
                        text: output,
                        segments: [],
                        language: 'unknown'
                    });
                }
            } catch (e) {
                console.error('Parse error:', e, output);
                resolve({
                    text: output,
                    segments: [],
                    language: 'unknown'
                });
            }
        });
    });
});
