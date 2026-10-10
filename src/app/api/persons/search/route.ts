import { NextResponse } from "next/server";
import { apiSession } from "@/lib/auth/session";
import { searchPersons } from "@/lib/data/tree";

export async function GET(request: Request) {
  const { session, denied } = await apiSession();
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  const results = await searchPersons(session.treeId, q);
  return NextResponse.json({ results });
}
