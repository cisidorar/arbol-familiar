import type { Metadata } from "next";
import MapPersonPicker from "@/components/MapPersonPicker";
import OriginsMap from "@/components/OriginsMap";
import SectionHeader from "@/components/SectionHeader";
import { PageTitle } from "@/components/ui";
import { canEdit } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { getPersonFacts } from "@/lib/data/origins";
import { getFamilyChartData } from "@/lib/data/tree";
import { getLinkedPersonId } from "@/lib/data/users";
import { REGIONES, zoneComunas } from "@/lib/geo";
import { collectAncestors } from "@/lib/origins";

export const metadata: Metadata = { title: "Mapa de orígenes · Archivo Zamora Balcázar" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Shell({ children, bleed = false }: { children: React.ReactNode; bleed?: boolean }) {
  return (
    // Fondo blanco y esquema claro fijo: con el Mac en modo oscuro el texto heredado quedaría casi blanco.
    <div className="zb album min-h-screen text-ink [color-scheme:light]">
      <SectionHeader current="mapa" />
      {bleed ? (
        <main>{children}</main>
      ) : (
        <main className="mx-auto max-w-[120rem] px-4 py-8 sm:px-6 lg:px-10 lg:py-10 2xl:px-14">{children}</main>
      )}
    </div>
  );
}

export default async function MapaPage({ searchParams }: { searchParams: Promise<{ persona?: string }> }) {
  const session = await requireSession();
  const { persona } = await searchParams;

  const selfId = await getLinkedPersonId(session.user.id);
  const rootId = persona && UUID.test(persona) ? persona : selfId;
  if (!rootId) {
    return (
      <Shell>
        <PageTitle intro="Tu usuario todavía no está vinculado a una persona del árbol, así que no sé de quién son los antepasados que quieres ver. Elige a alguien.">
          Mapa de orígenes
        </PageTitle>
        <div className="mt-6 max-w-md">
          <MapPersonPicker autoFocus />
        </div>
        <p className="zb-apoyo mt-8 max-w-xl">
          Para que se abra siempre con tus antepasados, pídele a quien administra el archivo que vincule tu usuario con tu
          nombre en el árbol.
        </p>
      </Shell>
    );
  }

  const [people, facts] = await Promise.all([getFamilyChartData(session.treeId), getPersonFacts(session.treeId)]);
  const root = people.find((p) => p.id === rootId);
  if (!root) {
    return (
      <Shell>
        <PageTitle intro="No encuentro a esa persona en el árbol. Elige a otra.">Mapa de orígenes</PageTitle>
        <div className="mt-6 max-w-md">
          <MapPersonPicker autoFocus />
        </div>
      </Shell>
    );
  }

  const ancestors = collectAncestors(rootId, people, facts);
  const regionsWithData = [
    ...new Set(
      ancestors.flatMap((a) => (a.origin.kind === "comuna" ? [a.origin.regionCode] : [])),
    ),
  ];
  // El mapa ampliado solo lleva las comunas de la zona donde hay datos.
  const zone = zoneComunas(regionsWithData).map((c) => ({
    code: c.code, name: c.name, province: c.province, d: c.d, bbox: c.bbox, island: c.island ?? false,
  }));

  return (
    <Shell bleed>
      <OriginsMap
        rootId={rootId}
        rootName={root.data.label}
        isSelf={rootId === selfId}
        hasSelf={selfId != null}
        ancestors={ancestors}
        regions={REGIONES}
        zone={zone}
        canEdit={canEdit(session.role)}
        sexById={Object.fromEntries(people.map((p) => [p.id, p.data.gender]))}
        birthYearById={Object.fromEntries(people.map((p) => [p.id, p.data.birth_year]))}
      />
    </Shell>
  );
}
