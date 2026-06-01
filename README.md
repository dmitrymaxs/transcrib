# Transcrib Electron

Audio transcription / Транскрибация аудио

Версия приложения Transcrib на Electron (JavaScript/TypeScript)

## Требования

- Node.js 18+
- npm или yarn
- FFmpeg (для обработки аудио)

## Установка

```bash
cd transcrib-electron
npm install
```

## Запуск

```bash
npm start
```

## Сборка

```bash
npm run build
```

## Структура проекта

```text
transcrib-electron/
├── package.json      # Зависимости и скрипты
├── src/
│   ├── main.js      # Главный процесс Electron
│   ├── index.html   # Интерфейс пользователя
│   └── renderer.js  # Логика рендерера
└── dist/            # Скомпилированное приложение
```

## Функции

- Выбор аудио/видео файла
- Транскрибация с Whisper
- Настройка модели и языка
- Включение/отключение таймкодов
- Сохранение в TXT, JSON, SRT, VTT
