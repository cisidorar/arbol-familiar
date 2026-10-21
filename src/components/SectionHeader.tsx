import AppHeader, { type Section } from "./AppHeader";
import { requireSession } from "@/lib/auth/session";
import { getPool } from "@/lib/db/pool";

export type { Section };

/** El encabezado del archivo para las páginas que no son el árbol (lee la sesión y cuenta las personas). */
export default async function SectionHeader({ current }: { current: Section }) {
  const session = await requireSession();
  const { rows } = await getPool().query(`select count(*)::int as n from persons where tree_id = $1`, [session.treeId]);
  return <AppHeader current={current} user={{ name: session.user.name, role: session.role }} count={rows[0]?.n ?? 0} />;
}
