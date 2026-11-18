const form = document.querySelector("#message-form");
const input = document.querySelector("#message-input");
const sendButton = form.querySelector("button[type='submit']");
const messages = document.querySelector("#messages");
const statusLabel = document.querySelector("#connection-status");
const statusDot = document.querySelector("#connection-dot");
const keyStatus = document.querySelector("#key-status");
const localFingerprint = document.querySelector("#local-fingerprint");
const peerFingerprint = document.querySelector("#peer-fingerprint");
const chatTitle = document.querySelector("#chat-title");
const chatPreviewTitle = document.querySelector("#chat-preview-title");
const conversation = document.querySelector(".conversation");

const query = new URLSearchParams(window.location.search);
const requestedName = query.get("user")?.trim().slice(0, 32);
const username = requestedName || "Гость-" + Math.floor(Math.random() * 900 + 100);
document.querySelector("#current-username").textContent = username;
document.querySelector("#user-avatar").textContent = username.slice(0, 1).toUpperCase();

const scheme = window.location.protocol === "https:" ? "wss" : "ws";
const socket = new WebSocket(
  scheme + "://" + window.location.host + "/ws?username=" + encodeURIComponent(username),
);
let cryptoSession = null;
let publicKeySent = false;

function setConnectionStatus(text, connected = false) {
  statusLabel.textContent = text;
  statusDot.classList.toggle("online", connected);
  sendButton.disabled = !connected;
}

function setKeyStatus(text, state = "pending") {
  keyStatus.textContent = text;
  keyStatus.dataset.state = state;
}

function setChatPeerName(name) {
  const title = name ? "Чат с " + name : "Ожидание собеседника";
  chatTitle.textContent = title;
  chatPreviewTitle.textContent = title;
  conversation.setAttribute("aria-label", "Переписка: " + title);
}

function publishPublicKey() {
  if (!cryptoSession || publicKeySent || socket.readyState !== WebSocket.OPEN) return;

  try {
    socket.send(JSON.stringify({ type: "public_key", public_key: cryptoSession.publicKey }));
    publicKeySent = true;
    setKeyStatus("Открытый ключ отправлен. Ожидаем собеседника.");
  } catch (error) {
    setKeyStatus("Не удалось отправить открытый ключ: " + error.message, "error");
  }
}

async function initializeCrypto() {
  try {
    if (!window.MessengerCrypto?.createSession) {
      throw new Error("Модуль криптографии не загрузился. Обновите страницу.");
    }

    cryptoSession = await window.MessengerCrypto.createSession();
    localFingerprint.textContent = cryptoSession.fingerprint;
    setKeyStatus("Ключ ECDH создан. Ожидаем собеседника.");
    publishPublicKey();
  } catch (error) {
    localFingerprint.textContent = "Не удалось создать ключ";
    setKeyStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function handlePeerPublicKey(event) {
  if (!cryptoSession || typeof event.public_key !== "string") return;

  try {
    const fingerprint = await cryptoSession.deriveFromPeer(event.public_key);
    const peerName = typeof event.username === "string" && event.username.trim()
      ? event.username
      : "собеседника";
    peerFingerprint.textContent = peerName + ": " + fingerprint;
    setKeyStatus("ECDH успешно согласован с " + peerName + ".", "success");
  } catch (error) {
    peerFingerprint.textContent = "Не удалось проверить публичный ключ.";
    const reason = error instanceof Error ? error.message : String(error);
    setKeyStatus("Ошибка согласования ECDH: " + reason, "error");
  }
}

function formatTime(value) {
  return new Intl.DateTimeFormat("ru", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function scrollMessagesToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function appendSystemEvent(text) {
  const notice = document.createElement("p");
  notice.className = "system-message";
  notice.textContent = text;
  messages.append(notice);
  scrollMessagesToBottom();
}

function appendMessage(event) {
  document.querySelector("#empty-state")?.remove();

  const outgoing = event.username === username;
  const message = document.createElement("article");
  message.className = "message " + (outgoing ? "message-outgoing" : "message-incoming");

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
  scrollMessagesToBottom();
}

socket.addEventListener("open", () => {
  setConnectionStatus("Подключено", true);
  publishPublicKey();
});
socket.addEventListener("close", (event) => {
  if (event.code === 1008) {
    setConnectionStatus("Чат уже занят");
    setKeyStatus("В чате уже подключены два участника.", "error");
    return;
  }
  setConnectionStatus("Нет соединения");
});
socket.addEventListener("error", () => setConnectionStatus("Ошибка соединения"));
socket.addEventListener("message", (messageEvent) => {
  let event;
  try {
    event = JSON.parse(messageEvent.data);
  } catch {
    appendSystemEvent("Получено сообщение в неизвестном формате.");
    return;
  }

  if (event.type === "message") appendMessage(event);
  if (event.type === "system") appendSystemEvent(event.text);
  if (event.type === "peer") setChatPeerName(event.username);
  if (event.type === "public_key") void handlePeerPublicKey(event);
  if (event.type === "peer_left") {
    setChatPeerName(null);
    peerFingerprint.textContent = "Ожидание публичного ключа…";
    if (cryptoSession) {
      cryptoSession.clearSharedSecret();
      setKeyStatus("Ключ создан. Ожидаем собеседника.");
    }
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

void initializeCrypto();