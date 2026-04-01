import { NextRequest, NextResponse } from "next/server";
import { HERMES_BASE } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing price ID" }, { status: 400 });
  }

  try {
    const url = `${HERMES_BASE}/v2/updates/price/latest?ids[]=${id}&encoding=base64&parsed=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Hermes fetch failed: ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("[PythReceipt] API Proxy Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
