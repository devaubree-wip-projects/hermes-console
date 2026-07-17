import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  return NextResponse.json(
    {
      error: "Les workspaces ont été remplacés par l’organisation unique.",
      redirectTo: "/",
    },
    { status: 410 },
  );
}
