import type { PoolConfig } from "pg";

/**
 * Configuración de conexión a Postgres. En local (localhost) va sin SSL; en
 * Supabase y otros servicios en la nube exige SSL. El certificado de Supabase
 * no está en el almacén de confianza de Node, por eso no se verifica la cadena
 * (la conexión sigue cifrada).
 */
export function pgConfig(url: string | undefined = process.env.DATABASE_URL): PoolConfig {
  const local = !url || /\/\/(?:[^@/]*@)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);
  if (local) return { connectionString: url };
  // sslmode en la URL haría que pg verifique el certificado: lo quitamos y fijamos ssl aquí.
  const connectionString = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  return { connectionString, ssl: { rejectUnauthorized: false } };
}
