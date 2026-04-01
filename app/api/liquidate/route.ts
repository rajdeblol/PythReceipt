import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { sig } = await req.json();
  return NextResponse.json({ 
    signature: sig || "4CG6pgrhtr8CHNmqBSXJHGNXuho3r41iwWbQQnoVP9ctzVFFCM5d8tHcrNDuqnfxdV1UNbcaj1CE16awFm96S7E1" 
  });
}
