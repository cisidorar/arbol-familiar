import type { Metadata } from "next";
import { Special_Elite, Playfair_Display } from "next/font/google";
import "./globals.css";

// Fuente tipo máquina de escribir para el título del archivo (look "archivo
// familiar antiguo"). Next.js la descarga una vez en el dev server y la
// sirve localmente, no hay llamadas a Google en tiempo de ejecución.
const specialElite = Special_Elite({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-special-elite",
});

// Serif elegante para los nombres en las tarjetas del árbol, look "registro
// de archivo" en vez de una fuente genérica de interfaz.
const playfair = Playfair_Display({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "Archivo Zamora Balcázar",
  description: "Archivo genealógico de la familia Zamora Balcázar",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`h-full antialiased ${specialElite.variable} ${playfair.variable}`}>
      <body suppressHydrationWarning className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
