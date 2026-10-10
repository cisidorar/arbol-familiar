"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";

export type CurrentUser = { name: string; role: Role };

/** Botón con la inicial de quien entró: su nombre, su rol, la administración y salir. */
export default function UserMenu({ user }: { user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Cuenta de ${user.name}`}
        className="flex h-10 w-12 items-center justify-center border-2 border-[#f5f2ea] text-sm font-bold uppercase text-[#f5f2ea] hover:bg-[#f5f2ea] hover:text-[#1a1917] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5f2ea]"
        style={{ fontFamily: "'Courier New', Courier, monospace" }}
      >
        [ {user.name.trim().charAt(0) || "?"} ]
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-56 overflow-hidden border-2 border-[#1a1917] bg-[#f5f2ea] py-1 text-sm text-[#1f1d1a] shadow-[0_12px_30px_rgba(0,0,0,0.4)]"
        >
          <div className="border-b border-[#c9c3b4] px-3.5 py-2.5">
            <p className="truncate font-bold">{user.name}</p>
            <p className="text-xs text-[#7a756a]">{ROLE_LABELS[user.role]}</p>
          </div>
          <Link href="/" role="menuitem" className="block px-3.5 py-2 hover:bg-[#e9e4d6]">
            Árbol
          </Link>
          <Link href="/pendientes" role="menuitem" className="block px-3.5 py-2 hover:bg-[#e9e4d6]">
            Pendientes de investigación
          </Link>
          <Link href="/mapa" role="menuitem" className="block px-3.5 py-2 hover:bg-[#e9e4d6]">
            Mapa de orígenes
          </Link>
          <Link href="/cementerios" role="menuitem" className="block px-3.5 py-2 hover:bg-[#e9e4d6]">
            Cementerios
          </Link>
          {user.role === "admin" && (
            <Link href="/admin" role="menuitem" className="block px-3.5 py-2 hover:bg-[#e9e4d6]">
              Usuarios e historial
            </Link>
          )}
          <form action={logout}>
            <button type="submit" role="menuitem" className="block w-full px-3.5 py-2 text-left hover:bg-[#e9e4d6]">
              Salir
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
