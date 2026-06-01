const { ipcRenderer } = require('electron');

// Глобальные переменные
let segments = [];
let detectedLanguage = '';
let currentFilePath = '';

// ===== Управление темой =====
let isDarkTheme = true;

function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    applyTheme(isDarkTheme);
    // Сохраняем выбор темы
    localStorage.setItem('transcrib-theme', isDarkTheme ? 'dark' : 'light');
}

function applyTheme(dark) {
    const root = document.documentElement;
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');

    if (dark) {
        root.classList.remove('light-theme');
        if (icon) icon.textContent = '🌙';
        if (label) label.textContent = 'Тёмная';
    } else {
        root.classList.add('light-theme');
        if (icon) icon.textContent = '☀️';
        if (label) label.textContent = 'Светлая';
    }
}

// Инициализация темы при загрузке страницы
(function initTheme() {
    const saved = localStorage.getItem('transcrib-theme');
    if (saved === 'light') {
        isDarkTheme = false;
        applyTheme(false);
    } else {
        isDarkTheme = true;
        applyTheme(true);
    }
})();

// Выбор файла
async function selectFile() {
    const filePath = await ipcRenderer.invoke('select-file');
    if (filePath) {
        document.getElementById('filePath').value = filePath;
        currentFilePath = filePath;
        log('Выбран файл: ' + filePath.split(/[/\\]/).pop());
    }
}

// Запуск транскрибации
async function startTranscription() {
    const filePath = document.getElementById('filePath').value;
    if (!filePath) {
        alert('Выберите файл для транскрибации');
        return;
    }

    const model = document.getElementById('model').value;
    const language = document.getElementById('language').value;
    const timestamps = document.getElementById('timestamps').checked;

    log('Начало транскрибации...');
    log('Файл: ' + filePath.split(/[/\\]/).pop());
    log('Модель: ' + model + ', Язык: ' + language);
    
    updateStatus('Загрузка модели...');
    showProgress(30);

    try {
        const result = await ipcRenderer.invoke('transcribe', {
            filePath,
            model,
            language: language === 'auto' ? null : language,
            timestamps
        });

        displayResult(result, timestamps);
        log('Транскрибация завершена! Язык: ' + (result.language || 'unknown'));
        updateStatus('Готово');
        hideProgress();

    } catch (error) {
        log('Ошибка: ' + error.message);
        updateStatus('Ошибка: ' + error.message);
        hideProgress();
    }
}

// Отображение результата
function displayResult(result, timestamps) {
    const resultText = document.getElementById('resultText');
    
    // Сохраняем сегменты
    if (result.segments && result.segments.length > 0) {
        segments = result.segments;
    }
    
    // Сохраняем язык
    if (result.language) {
        detectedLanguage = result.language;
    }
    
    const text = result.text || '';
    
    if (!timestamps || segments.length === 0) {
        // Без таймкодов
        resultText.value = text;
    } else {
        // С таймкодами
        const lines = segments.map(seg => {
            const time = formatTime(seg.start);
            return `[${time}] ${seg.text}`;
        });
        resultText.value = lines.join('\n\n');
    }
}

// Форматирование времени
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
}

// Чистый текст транскрипции (без таймкодов из textarea)
function getPlainText() {
    if (segments && segments.length > 0) {
        return segments.map(seg => seg.text.trim()).join('\n');
    }
    return document.getElementById('resultText').value.trim();
}

function hasExportableData() {
    return getPlainText().length > 0;
}

// Содержимое файла только для выбранного формата
function buildExportContent(format) {
    const plainText = getPlainText();

    switch (format) {
        case 'txt':
            return plainText;
        case 'json':
            return JSON.stringify({
                language: detectedLanguage,
                segments: segments,
                text: plainText
            }, null, 2);
        case 'srt':
            return generateSRT();
        case 'vtt':
            return generateVTT();
        default:
            return null;
    }
}

// Сохранение файла
async function saveFile(format) {
    if (!hasExportableData()) {
        alert('Нет данных для сохранения');
        return;
    }

    if ((format === 'srt' || format === 'vtt') && (!segments || segments.length === 0)) {
        alert('Для субтитров SRT/VTT нужны сегменты с таймкодами. Включите «Включить таймкоды» и повторите транскрибацию.');
        return;
    }

    const content = buildExportContent(format);
    if (content === null) {
        alert('Неподдерживаемый формат');
        return;
    }

    const ext = '.' + format;
    const defaultName = currentFilePath
        ? currentFilePath.split(/[/\\]/).pop().replace(/\.[^.]+$/, '') + ext
        : 'transcription' + ext;

    const result = await ipcRenderer.invoke('save-export', {
        defaultName,
        format,
        content
    });

    if (result.ok) {
        log('Сохранено (' + format.toUpperCase() + '): ' + result.filePath);
    } else if (result.error) {
        log('Ошибка сохранения: ' + result.error);
    }
}

// Генерация SRT
function generateSRT() {
    if (!segments || segments.length === 0) return '';
    
    let srt = '';
    segments.forEach((seg, i) => {
        srt += (i + 1) + '\n';
        srt += formatSRTTime(seg.start) + ' --> ' + formatSRTTime(seg.end) + '\n';
        srt += seg.text.trim() + '\n\n';
    });
    return srt;
}

// Генерация VTT
function generateVTT() {
    if (!segments || segments.length === 0) return 'WEBVTT\n\n' + getPlainText();
    
    let vtt = 'WEBVTT\n\n';
    segments.forEach(seg => {
        vtt += formatVTTTime(seg.start) + ' --> ' + formatVTTTime(seg.end) + '\n';
        vtt += seg.text.trim() + '\n\n';
    });
    return vtt;
}

// Форматирование времени SRT
function formatSRTTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = (seconds % 60).toFixed(3);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.padStart(6,'0')}`.replace('.', ',');
}

// Форматирование времени VTT
function formatVTTTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = (seconds % 60).toFixed(3);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.padStart(6,'0')}`;
}

// Очистка
function clearAll() {
    document.getElementById('filePath').value = '';
    document.getElementById('resultText').value = '';
    segments = [];
    detectedLanguage = '';
    currentFilePath = '';
    log('Очищено');
    updateStatus('Готов к работе');
}

// Переключение вкладок
function switchTab(tab) {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    log('Переключено на вкладку: ' + tab);
}

// Логирование
function log(message) {
    const logArea = document.getElementById('log');
    const time = new Date().toLocaleTimeString();
    logArea.innerHTML += `<div>[${time}] ${message}</div>`;
    logArea.scrollTop = logArea.scrollHeight;
}

// Статус
function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

// Прогресс
function showProgress(percent) {
    document.getElementById('progress').style.width = percent + '%';
}

function hideProgress() {
    document.getElementById('progress').style.width = '0%';
}
