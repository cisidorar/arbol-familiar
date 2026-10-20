import { NextResponse } from "next/server";
import { apiSession } from "@/lib/auth/session";
import { listCemeteryOptions } from "@/lib/data/cemeteries";
import { COMUNAS } from "@/lib/geo/places";
import { REGION_NAMES } from "@/lib/geo/regions-light";

/** Regiones, comunas y todos los cementerios, para elegir dónde está sepultada una persona. */
export async function GET() {
  const { session, denied } = await apiSession();
  if (denied) return denied;
  const options = await listCemeteryOptions(session.treeId);
  return NextResponse.json({ regions: REGION_NAMES, comunas: COMUNAS, options });
}
