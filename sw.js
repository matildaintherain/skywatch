// SkyWatch Service Worker — background flight polling + push notifications
const CACHE = 'skywatch-v1';
const POLL_INTERVAL = 30000;

let pollTimer = null;
let config = null; // { lat, lon, radiusKm }

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });

// Receive config from the main page
self.addEventListener('message', e => {
  if (e.data?.type === 'CONFIG') {
    config = e.data.payload;
    if (!pollTimer) startPolling();
  }
  if (e.data?.type === 'STOP') {
    clearInterval(pollTimer);
    pollTimer = null;
    config = null;
  }
});

function startPolling() {
  pollTimer = setInterval(async () => {
    if (!config) return;
    try {
      const nm = Math.ceil(config.radiusKm * 0.54);
      const url = `https://api.airplanes.live/v2/point/${config.lat}/${config.lon}/${nm}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const aircraft = data.ac || [];
      // Check for any new hex codes the page hasn't seen
      // We store seen IDs in the SW itself for background-only checks
      if (!self.bgSeen) self.bgSeen = new Set();
      const newOnes = aircraft.filter(ac => ac.hex && !self.bgSeen.has(ac.hex));
      newOnes.forEach(ac => self.bgSeen.add(ac.hex));
      if (newOnes.length > 0) {
        const first = newOnes[0];
        const cs = (first.flight || first.hex || 'A flight').trim();
        self.registration.showNotification('✈ SkyWatch', {
          body: `${cs} just entered your ${config.radiusKm} km zone!`,
          icon: '/skywatch/icon.png',
          badge: '/skywatch/icon.png',
          tag: 'skywatch-flight',
          renotify: true,
          vibrate: [150, 80, 150],
        });
      }
      // Tell open pages to refresh too
      const allClients = await clients.matchAll({ type: 'window' });
      allClients.forEach(c => c.postMessage({ type: 'BG_FETCH', ac: aircraft }));
    } catch(e) {}
  }, POLL_INTERVAL);
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/skywatch/'));
});
