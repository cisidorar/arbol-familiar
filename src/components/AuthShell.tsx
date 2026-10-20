// Marco de las pantallas sin sesión (entrar, usar una invitación), con la guía
// de estilo: barra de tinta con el logo, fondo blanco, una sola cosa a la vez.

import Logo from "./Logo";

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
    <div className="zb flex min-h-screen flex-col bg-white">
      <header className="bg-ink text-white">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <Logo size={48} variant="oscuro" />
          <p className="font-maquina text-xl uppercase leading-none tracking-[0.06em] sm:text-2xl">
            Archivo Zamora Balcázar
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[34rem] flex-1 px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
        <h1 className="zb-titulo">{title}</h1>
        {intro && <p className="zb-texto mt-3 text-gris">{intro}</p>}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
