# Мессенджер — базовый прототип

Минимальное приложение на FastAPI со статической страницей чата. Отправленные через форму сообщения добавляются только в текущую вкладку браузера. Передачи данных на сервер, WebSocket и шифрования пока нет.

## Запуск в Windows PowerShell

Откройте PowerShell в корневой папке проекта и выполните:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Откройте в браузере <http://127.0.0.1:8000>. Остановка сервера: `Ctrl+C` в PowerShell.

Если PowerShell запрещает активацию виртуального окружения, в этом окне можно выполнить:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.venv\Scripts\Activate.ps1
```

## Файлы

```text
app/
├── main.py                 # FastAPI и маршруты страницы и статики
└── static/
    ├── index.html          # Страница чата
    ├── style.css           # Оформление
    └── js/
        └── chat.js         # Добавление демонстрационных сообщений в страницу
requirements.txt            # FastAPI и Uvicorn
```
