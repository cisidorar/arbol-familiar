import Link from "next/link";

export type ChipPerson = { id: string; label: string; gender: string; birth: number | null; death: number | null; living: boolean };

export const sexColor = (sex?: string | null) => (sex === "F" ? "#b03a62" : sex === "M" ? "#2f66b8" : "#4a4740");

export function yearsText(p: { birth: number | null; death: number | null; living: boolean }) {
  if (p.birth && p.death) return `${p.birth} – ${p.death}`;
  if (p.birth) return p.living ? `n. ${p.birth}` : `n. ${p.birth} – †`;
  if (p.death) return `† ${p.death}`;
  return p.living ? "" : "†";
}

/** Una persona como tarjeta con enlace a su página: inicial de color, nombre y años. */
export default function PersonChipLink({ p, note }: { p: ChipPerson; note?: string }) {
  return (
    <Link
      href={`/persona/${p.id}`}
      className="group flex min-h-16 min-w-0 items-center gap-3 rounded-2xl bg-[#f1efea] px-3.5 py-2.5 transition hover:bg-[#e8e5de]"
    >
      <span
        aria-hidden="true"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[1.25rem] font-bold"
        style={{ backgroundColor: `${sexColor(p.gender)}1a`, color: sexColor(p.gender) }}
      >
        {p.label.trim().charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1.0625rem] font-bold leading-snug">{p.label}</span>
        <span className="zb-apoyo block truncate">{[note, yearsText(p)].filter(Boolean).join(" · ")}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-gris group-hover:text-ink" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
        <path d="m9 5 7 7-7 7" />
      </svg>
    </Link>
  );
}
