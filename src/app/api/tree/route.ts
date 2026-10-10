import { NextResponse } from "next/server";
import { apiSession } from "@/lib/auth/session";
import { getFamilyChartData } from "@/lib/data/tree";

export async function GET() {
  const { session, denied } = await apiSession();
  if (denied) return denied;
  const data = await getFamilyChartData(session.treeId);
  return NextResponse.json({ treeId: session.treeId, data });
}
