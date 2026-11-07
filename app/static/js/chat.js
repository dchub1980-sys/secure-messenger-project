const form = document.querySelector("#message-form");
const input = document.querySelector("#message-input");
const sendButton = form.querySelector("button[type='submit']");
const messages = document.querySelector("#messages");
const statusLabel = document.querySelector("#connection-status");
const statusDot = document.querySelector("#connection-dot");

const query = new URLSearchParams(window.location.search);
const requestedName = query.get("user")?.trim().slice(0, 32);
const username = requestedName || `Гость-${Math.floor(Math.random() * 900 + 100)}`;
document.querySelector("#current-username").textContent = username;
document.querySelector("#user-avatar").textContent = username.slice(0, 1).toUpperCase();

const scheme = window.location.protocol === "https:" ? "wss" : "ws";
const socket = new WebSocket(
  `${scheme}://${window.location.host}/ws?username=${encodeURIComponent(username)}`,
);

function setConnectionStatus(text, connected = false) {
  statusLabel.textContent = text;
  statusDot.classList.toggle("online", connected);
  sendButton.disabled = !connected;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("ru", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function appendSystemEvent(text) {
  const notice = document.createElement("p");
  notice.className = "system-message";
  notice.textContent = text;
  messages.append(notice);
}

function appendMessage(event) {
  document.querySelector("#empty-state")?.remove();

  const outgoing = event.username === username;
  const message = document.createElement("article");
  message.className = `message ${outgoing ? "message-outgoing" : "message-incoming"}`;

  if (!outgoing) {
    const author = document.createElement("span");
    author.className = "message-author";
    author.textContent = event.username;
    message.append(author);
  }

  const body = document.createElement("p");
  body.textContent = event.text;

  const time = document.createElement("time");
  time.dateTime = event.timestamp;
  time.textContent = formatTime(event.timestamp);

  message.append(body, time);
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
}

socket.addEventListener("open", () => setConnectionStatus("Подключено", true));
socket.addEventListener("close", () => setConnectionStatus("Нет соединения"));
socket.addEventListener("error", () => setConnectionStatus("Ошибка соединения"));
socket.addEventListener("message", (messageEvent) => {
  try {
    const event = JSON.parse(messageEvent.data);
    if (event.type === "message") appendMessage(event);
    if (event.type === "system") appendSystemEvent(event.text);
  } catch {
    appendSystemEvent("Получено сообщение в неизвестном формате.");
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || socket.readyState !== WebSocket.OPEN) return;

  socket.send(text);
  input.value = "";
  input.focus();
});
