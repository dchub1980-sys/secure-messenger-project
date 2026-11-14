import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"

app = FastAPI(title="Мессенджер", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class ConnectionManager:
    """Хранит подключения чата в памяти одного процесса."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self.connection_info: dict[WebSocket, dict[str, str]] = {}
        self.public_keys: dict[WebSocket, str] = {}
        self.broadcast_lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, username: str) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        self.connection_info[websocket] = {"username": username, "client_id": uuid4().hex}

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        self.connection_info.pop(websocket, None)
        self.public_keys.pop(websocket, None)

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

    async def relay_public_key(self, sender: WebSocket, public_key: str) -> None:
        """Relays SPKI public keys; private keys and derived secrets stay in browsers."""
        async with self.broadcast_lock:
            stale_connections = []
            peers = [
                (connection, self.connection_info[connection], self.public_keys.get(connection))
                for connection in self.active_connections
                if connection is not sender and connection in self.connection_info
            ]
            self.public_keys[sender] = public_key
            sender_info = self.connection_info.get(sender)
            if sender_info is None:
                return

            try:
                for _, peer_info, peer_key in peers:
                    if peer_key:
                        await sender.send_json({
                            "type": "public_key",
                            "client_id": peer_info["client_id"],
                            "username": peer_info["username"],
                            "public_key": peer_key,
                        })
            except (OSError, RuntimeError):
                stale_connections.append(sender)

            event = {
                "type": "public_key",
                "client_id": sender_info["client_id"],
                "username": sender_info["username"],
                "public_key": public_key,
            }
            for connection, _, _ in peers:
                try:
                    await connection.send_json(event)
                except (OSError, RuntimeError):
                    stale_connections.append(connection)

            for connection in stale_connections:
                self.disconnect(connection)


manager = ConnectionManager()


@app.get("/", include_in_schema=False)
async def chat_page() -> FileResponse:
    """Показывает страницу интерфейса чата."""
    return FileResponse(STATIC_DIR / "index.html")


@app.websocket("/ws")
async def chat_websocket(
    websocket: WebSocket,
    username: str = Query(default="Гость"),
) -> None:
    username = username.strip()[:32] or "Гость"
    await manager.connect(websocket, username)
    await manager.broadcast({"type": "system", "text": f"{username} подключился"})

    try:
        while True:
            payload = (await websocket.receive_text()).strip()
            try:
                event = json.loads(payload)
            except json.JSONDecodeError:
                event = None

            if isinstance(event, dict):
                if event.get("type") == "public_key":
                    public_key = event.get("public_key")
                    if isinstance(public_key, str) and 1 <= len(public_key) <= 2048:
                        await manager.relay_public_key(websocket, public_key)
                    continue
                if event.get("type") != "message":
                    continue
                text = event.get("text", "")
            else:
                # Keep accepting plain text from older versions of the demo client.
                text = payload

            if not isinstance(text, str):
                continue
            text = text.strip()
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
        info = manager.connection_info.get(websocket, {})
        manager.disconnect(websocket)
        if info:
            await manager.broadcast({
                "type": "peer_left",
                "client_id": info["client_id"],
                "username": info["username"],
            })
        await manager.broadcast({"type": "system", "text": f"{username} отключился"})
