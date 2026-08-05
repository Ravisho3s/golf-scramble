// Minimal service worker: enables "Add to Home Screen" install prompts
// and receives push notifications sent via Firebase Cloud Messaging
// even when the app isn't open in a tab.

importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");
importScripts("firebase-config.js");

firebase.initializeApp(firebaseConfig);

let messaging;
try {
  messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification || {};
    self.registration.showNotification(title || "Scramble Leaderboard", {
      body: body || "",
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png"
    });
  });
} catch (e) {
  // Messaging config not filled in yet — install still works fine without it.
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
