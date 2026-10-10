import type { Metadata } from "next";
import MapPersonPicker from "@/components/MapPersonPicker";
import OriginsMap from "@/components/OriginsMap";
import SectionHeader from "@/components/SectionHeader";
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // Colores propios y esquema claro fijo: con el Mac en modo oscuro el texto heredado quedaría casi blanco.
    <div className="min-h-screen bg-[#f6f3ec] text-[#1f1d1a] [color-scheme:light]">
      <SectionHeader current="mapa" />
      <main className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:py-8">{children}</main>
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
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)" }}>
          Mapa de orígenes
        </h1>
        <p className="mt-1 max-w-xl text-sm text-[#4f4a3f]">
          Tu usuario todavía no está vinculado a una persona del árbol, así que no sé de quién son los antepasados
          que quieres ver. Elige a alguien:
        </p>
        <div className="mt-4 max-w-sm">
          <MapPersonPicker autoFocus />
        </div>
        <p className="mt-6 max-w-xl text-xs text-[#6b6558]">
          Para que se abra siempre con tus antepasados, vincula tu usuario con{" "}
          <code className="rounded bg-[#ece7da] px-1.5 py-0.5">npm run usuario -- vincular …</code>.
        </p>
      </Shell>
    );
  }

  const [people, facts] = await Promise.all([getFamilyChartData(session.treeId), getPersonFacts(session.treeId)]);
  const root = people.find((p) => p.id === rootId);
  if (!root) {
    return (
      <Shell>
        <p className="text-sm text-[#4f4a3f]">No encuentro a esa persona en el árbol. Elige a otra:</p>
        <div className="mt-4 max-w-sm">
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
    <Shell>
      <OriginsMap
        rootId={rootId}
        rootName={root.data.label}
        isSelf={rootId === selfId}
        hasSelf={selfId != null}
        ancestors={ancestors}
        regions={REGIONES}
        zone={zone}
        canEdit={canEdit(session.role)}
      />
    </Shell>
  );
}
