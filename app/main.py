from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import asyncio
from datetime import datetime, timezone

APP_DIR=Path(__file__).resolve().parent
STATIC_DIR=APP_DIR/"static"

app=FastAPI(title="Мессенджер", version="0.1.0")
app.mount("/static",StaticFiles(directory=STATIC_DIR),name="static")

class ConnectionManager:
    """Хранит подключения чата в памяти одного процесса."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self.broadcast_lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, event: dict[str, str]) -> None:
        async with self.broadcast_lock:
            stale_connections = []
            for connection in self.active_connections.copy():
                try:
                    await connection.send_json(event)
                except (OSError, RuntimeError):
                    stale_connections.append(connection)

            for connection in stale_connections:
                self.disconnect(connection)


manager = ConnectionManager()

@app.get("/", include_in_schema=False)
async def chat_page() -> FileResponse:
    return FileResponse(STATIC_DIR/"index.html")

@app.websocket("/ws")
async def chat_websocket(
    websocket: WebSocket,
    username: str = Query(default="Гость"),
) -> None:
    username = username.strip()[:32] or "Гость"
    await manager.connect(websocket)
    await manager.broadcast({"type": "system", "text": f"{username} подключился"})

    try:
        while True:
            text = (await websocket.receive_text()).strip()
            if not text or len(text) > 1000:
                continue

            await manager.broadcast(
                {
                    "type": "message",
                    "username": username,
                    "text": text,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        await manager.broadcast({"type": "system", "text": f"{username} отключился"})