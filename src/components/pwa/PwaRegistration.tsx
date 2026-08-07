"use client";

import { useEffect } from "react";

/**
 * Registers the public landing shell only when the Next app is the top-level
 * document. The worker itself explicitly bypasses signed-in product routes.
 */
export default function PwaRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator) ||
      window.top !== window.self
    ) {
      return;
    }

    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        // PWA support is progressive; a blocked registration must never affect
        // the normal online Creator OS experience or surface as an unhandled error.
        .catch(() => undefined);
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
