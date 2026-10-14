/**
 * ASApp Atratizzi - Service Worker minimo.
 *
 * Objetivos:
 * 1. Permitir "Adicionar a tela inicial" no Chrome/Edge (precisa SW
 *    registrado + manifest valido).
 * 2. Cache de assets estaticos (icones, manifest) pra carga mais rapida.
 *
 * O que NAO faz (intencional - evita bug em prod):
 * - Cache de paginas HTML (sempre busca fresh)
 * - Cache de respostas /api/* (sempre busca fresh - dados de prod)
 * - Offline fallback (Fase D futura - precisa IndexedDB e merge logic)
 *
 * Estrategia: cache-first apenas pra assets em /icon-* /favicon /manifest,
 * network-first pro resto. Versao incrementada ao mudar SW.
 */

const CACHE_VERSION = "asapp-v1";
const STATIC_ASSETS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  // Ativa imediatamente, sem esperar fechamento de tab antiga
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Apaga caches de versoes antigas
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_VERSION)
            .map((k) => caches.delete(k)),
        ),
      ),
      // Toma controle das tabs ja abertas
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // So GET, mesmo origin
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Cache-first pros assets estaticos PWA
  const isStatic = STATIC_ASSETS.includes(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req)),
    );
    return;
  }

  // Network-first pro resto. Sem fallback offline por enquanto.
  // (Browser ja faz cache padrao via headers Cache-Control de cada
  // resposta - nao precisa custom aqui.)
});
