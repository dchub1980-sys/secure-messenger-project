(function () {
  const curve = { name: "ECDH", namedCurve: "P-256" };

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function fromBase64(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function fingerprint(spki) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", spki));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(":");
  }

  async function createSession() {
    if (!globalThis.crypto?.subtle) {
      throw new Error("Web Crypto недоступен. Откройте приложение на localhost или HTTPS.");
    }

    const keyPair = await crypto.subtle.generateKey(curve, false, ["deriveBits"]);
    const publicSpki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    let sharedSecret = null;
    return {
      publicKey: toBase64(publicSpki),
      fingerprint: await fingerprint(publicSpki),
      async deriveFromPeer(encodedPublicKey) {
        const publicBytes = fromBase64(encodedPublicKey);
        const peerPublicKey = await crypto.subtle.importKey("spki", publicBytes, curve, false, []);
        const secretBits = await crypto.subtle.deriveBits(
          { name: "ECDH", public: peerPublicKey },
          keyPair.privateKey,
          256,
        );
        sharedSecret = new Uint8Array(secretBits);
        return fingerprint(publicBytes);
      },
      clearSharedSecret() {
        if (sharedSecret) sharedSecret.fill(0);
        sharedSecret = null;
      },
    };
  }
  async function selfTest() {
    if (!globalThis.crypto?.subtle) {
      throw new Error("Web Crypto недоступен. Откройте эту страницу через localhost или HTTPS.");
    }

    const alice = await crypto.subtle.generateKey(curve, false, ["deriveBits"]);
    const bob = await crypto.subtle.generateKey(curve, false, ["deriveBits"]);
    const aliceSpki = await crypto.subtle.exportKey("spki", alice.publicKey);
    const bobSpki = await crypto.subtle.exportKey("spki", bob.publicKey);
    const aliceImportedBob = await crypto.subtle.importKey("spki", bobSpki, curve, false, []);
    const bobImportedAlice = await crypto.subtle.importKey("spki", aliceSpki, curve, false, []);
    const aliceSecret = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "ECDH", public: aliceImportedBob }, alice.privateKey, 256,
    ));
    const bobSecret = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "ECDH", public: bobImportedAlice }, bob.privateKey, 256,
    ));

    const matches = aliceSecret.length === 32
      && bobSecret.length === 32
      && aliceSecret.every((byte, index) => byte === bobSecret[index]);
    aliceSecret.fill(0);
    bobSecret.fill(0);
    if (!matches) throw new Error("Обе стороны получили разные секреты.");

    return {
      matches,
      aliceFingerprint: await fingerprint(aliceSpki),
      bobFingerprint: await fingerprint(bobSpki),
    };
  }

  window.MessengerCrypto = { createSession, selfTest };
})();