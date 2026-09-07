// Service worker для платформи адаптації Carlsberg.
// Кешує весь застосунок при першому відкритті, тож платформа далі
// відкривається офлайн — важливо для торгових представників у маршруті,
// де інтернет буває нестабільним. Google Fonts (крос-домен) свідомо не
// кешуються тут — при їх відсутності сторінка й так падає на системний шрифт.
const CACHE_NAME = 'telesale-course-v8';
const APP_SHELL = [
  './',
  './index.html',
  './course-assortment.html',
  './manifest.json',
  './assets/favicon-32.png',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/carlsberg-logo.png',
  './assets/monolit-code-hint.png',
  './assets/assortment-intro.jpg',
  './assets/assortment-production.jpg',
  './assets/assortment-leadership.jpg',
  './assets/assortment-portfolio.jpg',
  './assets/assortment-packaging-types.jpg',
  './assets/assortment-pack-glass.png',
  './assets/assortment-pack-can.png',
  './assets/assortment-pack-pet.png',
  './assets/assortment-pack-keg.png',
  './css/base.css',
  './css/registration.css',
  './css/hub.css',
  './js/main.js',
  './js/helpers.js',
  './js/settings.js',
  './js/registration.js',
  './js/cabinet.js'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){ return cache.addAll(APP_SHELL); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;
  var url = event.request.url;
  // Тільки свій origin кешуємо/перехоплюємо; зовнішні запити (шрифти, вебхук
  // Google Таблиць) йдуть у мережу як є — офлайн вони й так не критичні.
  if(url.indexOf(self.location.origin) !== 0) return;

  event.respondWith(
    caches.match(event.request).then(function(cached){
      var network = fetch(event.request).then(function(resp){
        if(resp && resp.ok){
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return resp;
      }).catch(function(){ return cached; });
      // Cache-first для швидкого офлайн-старту, з тихим оновленням кешу у фоні.
      return cached || network;
    })
  );
});
