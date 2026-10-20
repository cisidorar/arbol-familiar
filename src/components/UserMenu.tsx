"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";

export type CurrentUser = { name: string; role: Role };

const ITEM = "flex min-h-12 items-center px-4 py-2 hover:bg-paper";

/** Botón con la inicial de quien entró: su nombre, su rol, la administración y cerrar sesión. */
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
    <div ref={ref} className="zb relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mi cuenta, ${user.name}`}
        className="flex min-h-12 items-center gap-2.5 rounded-xl border-2 border-white/80 py-1 pl-1.5 pr-3 font-bold text-white hover:bg-white hover:text-ink sm:pr-4"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper text-lg font-bold uppercase text-ink"
        >
          {user.name.trim().charAt(0) || "?"}
        </span>
        <span className="hidden sm:inline">Mi cuenta</span>
        <span aria-hidden="true" className="hidden text-sm sm:inline">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-14 z-40 w-72 overflow-hidden rounded-2xl border-2 border-line bg-white py-1 text-[1.125rem] text-ink shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate font-bold">{user.name}</p>
            <p className="text-base text-gris">{ROLE_LABELS[user.role]}</p>
          </div>
          <Link href="/" role="menuitem" className={ITEM}>
            Árbol
          </Link>
          <Link href="/mapa" role="menuitem" className={ITEM}>
            Mapa de orígenes
          </Link>
          {user.role === "admin" && (
            <Link href="/pendientes" role="menuitem" className={ITEM}>
              Pendientes
            </Link>
          )}
          <Link href="/cementerios" role="menuitem" className={ITEM}>
            Cementerios
          </Link>
          {user.role === "admin" && (
            <Link href="/admin" role="menuitem" className={ITEM}>
              Usuarios e historial
            </Link>
          )}
          <form action={logout} className="border-t border-line">
            <button type="submit" role="menuitem" className={`${ITEM} w-full text-left`}>
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
