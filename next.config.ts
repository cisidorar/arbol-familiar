import type { NextConfig } from "next";

// Cabeceras de seguridad para todas las páginas. La política de contenido es
// a propósito corta: impide que otro sitio meta el archivo en un marco
// (clickjacking), que se cambie el destino de un formulario o la base de la
// página, y que se carguen plugins. No restringe scripts ni estilos porque
// Next.js inserta los suyos dentro de la página.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
