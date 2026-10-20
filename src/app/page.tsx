import TreeApp from "@/components/TreeApp";
import Landing from "@/components/Landing";
import { getSession, requireSession } from "@/lib/auth/session";
import { getPublicStats } from "@/lib/data/public-stats";
import { getLinkedPersonId } from "@/lib/data/users";
import { getDefaultTreeId, getFamilyChartData } from "@/lib/data/tree";

// Los datos viven en Postgres y cambian con cada importación/edición:
// nunca se deben servir desde una página prerenderizada en build time.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Home({ searchParams }: { searchParams: Promise<{ persona?: string }> }) {
  const treeId = await getDefaultTreeId();
  if (!treeId) {
    return (
      <main className="flex h-screen items-center justify-center bg-gray-50 px-4 text-center text-gray-500">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-lg uppercase tracking-wide text-gray-800" style={{ fontFamily: "var(--font-special-elite)" }}>Archivo Zamora Balcázar</h1>
          <p className="text-sm text-gray-500">
            Todavía no hay ningún árbol importado. Corre{" "}
            <code className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs">npx tsx scripts/import-gedcom.ts</code>
            primero.
          </p>
        </div>
      </main>
    );
  }
  // El archivo es privado: sin sesión (o sin acceso a este árbol) se ve la portada
  // pública, que solo tiene cifras generales, y de ahí se pasa al login.
  if (!(await getSession())) return <Landing stats={await getPublicStats(treeId)} />;
  const session = await requireSession();
  const data = await getFamilyChartData(session.treeId);
  // ?persona=<id> (viene del buscador de las otras vistas): el árbol se abre centrado en esa persona.
  const { persona } = await searchParams;
  const requested = persona && UUID.test(persona) && data.some((d) => d.id === persona) ? persona : null;
  const selfId = await getLinkedPersonId(session.user.id);
  const homeId = requested ?? selfId;
  return <TreeApp data={data} homeId={homeId} selfId={selfId} user={{ name: session.user.name, role: session.role }} />;
}
