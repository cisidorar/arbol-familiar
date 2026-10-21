"use client";

import { useState } from "react";

/** Comparte el enlace de la página (menú de compartir del teléfono) o, si no existe, lo copia. */
export default function ShareButton({ title, text, className }: { title: string; text?: string; className?: string }) {
  const [msg, setMsg] = useState<string | null>(null);

  const say = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(null), 2500);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // la persona cerró el menú
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    say("Enlace copiado");
  };

  return (
    <button type="button" onClick={share} className={className} aria-live="polite">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      </svg>
      {msg ?? "Compartir"}
    </button>
  );
}
