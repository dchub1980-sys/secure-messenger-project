const result = document.querySelector("#result");
const details = document.querySelector("#details");

MessengerCrypto.selfTest().then((check) => {
  result.textContent = check.matches ? "Проверка пройдена: секреты совпали." : "Проверка не пройдена.";
  details.textContent = "SHA-256 Alice: ${check.aliceFingerprint} | SHA-256 Bob: ${check.bobFingerprint}";
}).catch((error) => {
  result.textContent = "Проверка не пройдена: ${error.message}";
});