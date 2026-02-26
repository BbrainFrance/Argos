"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[ARGOS] Service Worker enregistre, scope:", reg.scope);

        setInterval(() => {
          reg.update();
          navigator.serviceWorker.controller?.postMessage("TRIM_CACHES");
        }, 60 * 60 * 1000);
      })
      .catch((err) => {
        console.warn("[ARGOS] Service Worker echec:", err);
      });
  }, []);

  return null;
}
