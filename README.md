# Transcrib Electron

Десктоп-оболочка для Python-проекта [Transcrib](../) (Whisper + FFmpeg).

## Требования

- Node.js 18+
- Python 3.8+ с зависимостями из `../requirements.txt` (корень Transcrib)
- FFmpeg в PATH

Установка Python-зависимостей (из корня Transcrib):

```bash
cd ..
pip install -r requirements.txt
```

## Установка Electron

```bash
cd transcrib-electron
npm install
```

## Запуск

```bash
npm start
```

Приложение вызывает `../main.py` с флагом `--json-stdout` и не создаёт лишних файлов на диске до ручного сохранения.

## Сборка

```bash
npm run build
```

## Структура

```text
Transcrib/
├── main.py              # CLI и бэкенд для Electron
├── config.py            # Модели, языки, форматы
├── transcrib_app.py     # Tkinter GUI (эталон функций)
└── transcrib-electron/
    └── src/
        ├── main.js      # Electron + spawn Python
        ├── renderer.js  # UI
        └── index.html
```

## Функции

- Те же модели Whisper: tiny … large
- Языки из `config.py` (авто + ru, uk, en, …)
- Конвертация аудио (`--convert`) для проблемных файлов
- Вкладки: текст с таймкодами / список сегментов
- Сохранение в один выбранный формат: TXT, JSON, SRT, VTT
- Лог процесса Python в панели приложения
