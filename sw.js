// Service Worker para Visita Técnica Solar - Ecowatt E.S.P
const CACHE_NAME = 'visita-solar-v16';
const urlsToCache = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/xlsx.full.min.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/logo-solix.png',
    '/icons/logo-ecowatt.png'
];

// Instalar Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Activar Service Worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Interceptar peticiones
self.addEventListener('fetch', event => {
    // Ignorar peticiones que no sean http/https (como chrome-extension)
    if (!event.request.url.startsWith('http')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(response => {
                    // No cachear respuestas inválidas o de otros orígenes
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    }).catch(() => {});
                    return response;
                }).catch(() => {
                    // Si falla la red, intentar desde caché
                    return caches.match(event.request);
                });
            })
    );
});
