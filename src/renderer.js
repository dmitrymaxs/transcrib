const { ipcRenderer } = require('electron');

let appLicensed = true;

// Глобальные переменные
let segments = [];
let detectedLanguage = '';
let currentFilePath = '';
let currentTab = 'text';
let lastWhisperResult = null;
let isTranscribing = false;

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

// Логи Python в реальном времени
ipcRenderer.on('transcribe-log', (event, line) => {
    log(line);
});

function setAppLocked(locked) {
    document.body.classList.toggle('app-locked', locked);
    const overlay = document.getElementById('licenseOverlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !locked);
    }
}

function showActivationError(message) {
    const el = document.getElementById('activationError');
    if (el) el.textContent = message || '';
}

async function requestActivationCode() {
    try {
        await ipcRenderer.invoke('license-open-telegram');
        log('Открыт Telegram для запроса кода активации');
    } catch (e) {
        showActivationError('Не удалось открыть Telegram: ' + e.message);
    }
}

async function submitActivationCode() {
    const input = document.getElementById('activationCodeInput');
    const code = input ? input.value : '';
    showActivationError('');

    const result = await ipcRenderer.invoke('license-activate', code);
    if (!result.ok) {
        showActivationError(result.error || 'Ошибка активации');
        return;
    }

    appLicensed = true;
    if (input) input.value = '';
    setAppLocked(false);
    log('✅ Программа активирована');
    updateStatus('Активировано — готов к работе');
}

async function initLicense() {
    const status = await ipcRenderer.invoke('license-status');
    appLicensed = status.licensed;

    const deviceEl = document.getElementById('deviceIdDisplay');
    if (deviceEl) deviceEl.textContent = status.deviceId;

    if (!status.licensed && status.trialExpired) {
        setAppLocked(true);
        updateStatus('Требуется активация');
        log('Бесплатный период (' + status.trialDays + ' дн.) закончился');
        return;
    }

    setAppLocked(false);

    if (!status.activated && !status.trialExpired) {
        log('Бесплатный период: осталось ' + status.daysRemaining + ' дн.');
    }

    if (status.showTrialWarning && status.warningMessage) {
        log(status.warningMessage);
    }
}

// Проверка лицензии и окружения при старте
(async function startupChecks() {
    await initLicense();

    const requestBtn = document.getElementById('requestCodeBtn');
    const activateBtn = document.getElementById('activateBtn');
    const codeInput = document.getElementById('activationCodeInput');

    if (requestBtn) requestBtn.addEventListener('click', requestActivationCode);
    if (activateBtn) activateBtn.addEventListener('click', submitActivationCode);
    if (codeInput) {
        codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitActivationCode();
        });
    }
})();

// Проверка Python-окружения при старте
(async function checkEnvironment() {
    try {
        const env = await ipcRenderer.invoke('check-environment');
        if (!env.mainPy) {
            log('⚠️ Не найден main.py: ' + env.transcribRoot);
            updateStatus('Нет Python-бэкенда');
            return;
        }
        if (!env.python) {
            log('⚠️ Python/Whisper: ' + (env.messages[0] || 'не настроен'));
            log('💡 pip install -r requirements.txt в папке Transcrib');
            updateStatus('Требуется настройка Python');
        } else {
            log('✅ Python и Whisper доступны');
        }
    } catch (e) {
        log('⚠️ Проверка окружения: ' + e.message);
    }
})();

function setTranscribeBusy(busy) {
    isTranscribing = busy;
    const btn = document.querySelector('button.primary');
    if (btn) {
        btn.disabled = busy;
        btn.textContent = busy ? '⏳ Транскрибация...' : '🚀 Транскрибировать';
    }
}

// Выбор файла
async function selectFile() {
    if (!appLicensed) return;
    try {
        const filePath = await ipcRenderer.invoke('select-file');
        if (filePath) {
            document.getElementById('filePath').value = filePath;
            currentFilePath = filePath;
            log('Выбран файл: ' + filePath.split(/[/\\]/).pop());
        }
    } catch (e) {
        if (e.message === 'LICENSE_REQUIRED') {
            await initLicense();
            log('Требуется код активации');
        }
    }
}

// Запуск транскрибации
async function startTranscription() {
    if (!appLicensed) return;
    const filePath = document.getElementById('filePath').value;
    if (!filePath) {
        alert('Выберите файл для транскрибации');
        return;
    }

    if (isTranscribing) return;

    const model = document.getElementById('model').value;
    const language = document.getElementById('language').value;
    const convert = document.getElementById('convertAudio').checked;

    log('Начало транскрибации...');
    log('Файл: ' + filePath.split(/[/\\]/).pop());
    log('Модель: ' + model + ', Язык: ' + language + (convert ? ', конвертация' : ''));

    setTranscribeBusy(true);
    updateStatus('Загрузка модели...');
    showProgress(15);

    try {
        const result = await ipcRenderer.invoke('transcribe', {
            filePath,
            model,
            language: language === 'auto' ? null : language,
            convert,
        });

        lastWhisperResult = result;
        displayResult(result);
        const segCount = (result.segments && result.segments.length) || 0;
        log('Транскрибация завершена! Язык: ' + (result.language || 'unknown') + ', сегментов: ' + segCount);
        updateStatus('Готово');
        showProgress(100);
        setTimeout(hideProgress, 400);
    } catch (error) {
        if (error.message === 'LICENSE_REQUIRED') {
            await initLicense();
            log('Требуется код активации');
            updateStatus('Требуется активация');
        } else {
            log('Ошибка: ' + error.message);
            updateStatus('Ошибка');
        }
        hideProgress();
    } finally {
        setTranscribeBusy(false);
    }
}

// Отображение результата
function displayResult(result) {
    // Сохраняем сегменты
    if (result.segments && result.segments.length > 0) {
        segments = result.segments;
    }

    // Сохраняем язык
    if (result.language) {
        detectedLanguage = result.language;
    }

    // Если сегментов нет — показываем сырой текст
    if (segments.length === 0) {
        document.getElementById('resultText').value = result.text || '';
        return;
    }

    // Рендерим по текущей активной вкладке
    renderCurrentTab();
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
            if (lastWhisperResult) {
                return JSON.stringify(lastWhisperResult, null, 2);
            }
            return JSON.stringify({
                language: detectedLanguage,
                segments: segments,
                text: plainText,
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
    if (!appLicensed) return;
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

    try {
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
    } catch (e) {
        if (e.message === 'LICENSE_REQUIRED') {
            await initLicense();
            log('Требуется код активации');
        } else {
            log('Ошибка сохранения: ' + e.message);
        }
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
    lastWhisperResult = null;
    log('Очищено');
    updateStatus('Готов к работе');
}

// Переключение вкладок
function switchTab(tab, clickedBtn) {
    currentTab = tab;
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.remove('active'));
    if (clickedBtn) clickedBtn.classList.add('active');
    renderCurrentTab();
}

// Отрисовка содержимого текущей вкладки
function renderCurrentTab() {
    const resultText = document.getElementById('resultText');
    const timestampsOn = document.getElementById('timestamps').checked;

    if (currentTab === 'text') {
        // Текст с таймкодами (или без, если нет сегментов)
        if (segments.length > 0 && timestampsOn) {
            const lines = segments.map(seg => `[${formatTime(seg.start)}] ${seg.text}`);
            resultText.value = lines.join('\n\n');
        } else {
            resultText.value = segments.map(seg => seg.text.trim()).join('\n');
        }
    } else if (currentTab === 'segments') {
        // Список сегментов с началом и концом
        if (segments.length === 0) {
            resultText.value = '(нет сегментов — запустите транскрибацию с включёнными таймкодами)';
            return;
        }
        const lines = segments.map((seg, i) => {
            const start = formatTime(seg.start);
            const end   = formatTime(seg.end);
            return `#${i + 1}  ${start} → ${end}\n${seg.text.trim()}`;
        });
        resultText.value = lines.join('\n\n');
    }
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

// Перерисовка при смене режима таймкодов
document.addEventListener('DOMContentLoaded', () => {
    const timestampsEl = document.getElementById('timestamps');
    if (timestampsEl) {
        timestampsEl.addEventListener('change', () => {
            if (segments.length > 0) renderCurrentTab();
        });
    }
});
