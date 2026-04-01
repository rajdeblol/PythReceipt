import { NextRequest, NextResponse } from "next/server";
import { getReceipt } from "@/lib/solana";

export async function GET(req: NextRequest) {
  const sig = req.nextUrl.searchParams.get("sig");
  if (!sig) return NextResponse.json({ error: "sig required" }, { status: 400 });
  try {
    const receipt = await getReceipt(sig);
    return NextResponse.json(receipt);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
