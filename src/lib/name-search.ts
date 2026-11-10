/**
 * Un texto de búsqueda en patrones LIKE: una palabra por patrón, sin tildes ni mayúsculas.
 * «daniel zamora» encuentra «Daniel Enrique Zamora»: cada palabra debe estar, en cualquier orden.
 */
export function nameSearchPatterns(query: string): string[] {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((w) => `%${w.replace(/[\\%_]/g, "\\$&")}%`);
}
