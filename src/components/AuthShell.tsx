// Marco de las pantallas sin sesión (entrar, usar una invitación): una hoja de
// archivo, tipo ficha mecanografiada, sobre fondo oscuro.

export const typewriter = { fontFamily: "'Courier Prime', 'Courier New', Courier, monospace" } as const;

export default function AuthShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#2a2925] px-4 py-8 sm:py-12"
      style={typewriter}
    >
      <div className="w-full max-w-[640px] bg-[#f5f2ea] px-6 py-8 text-[#1f1d1a] shadow-[0_30px_80px_rgba(0,0,0,0.55)] sm:px-12 sm:py-12">
        <div className="flex justify-end text-[11px] uppercase tracking-[0.22em] text-[#7a756a]">
          <span>Hoja 1/1</span>
        </div>

        <p
          className="mt-4 text-[2rem] uppercase leading-[1.1] tracking-[0.04em] sm:text-[2.75rem]"
          style={{ fontFamily: "var(--font-special-elite), 'Courier New', monospace" }}
        >
          Archivo
          <br />
          Zamora Balcázar
        </p>

        <div className="mt-6 text-[15px] leading-relaxed">
          <h1 className="inline font-bold">{title}.</h1>
          {intro && <span> {intro}</span>}
        </div>

        <hr className="mt-6 border-0 border-t-[3px] border-[#1f1d1a]" />
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
