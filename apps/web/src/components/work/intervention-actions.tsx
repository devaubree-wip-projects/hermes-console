"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InterventionActions({ endpoint, type }: { endpoint: string; type: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [answer, setAnswer] = useState("");
  async function decide(decision: "approved" | "rejected" | "answered") {
    setPending(true);
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, ...(answer ? { answer } : {}) }) });
      const data = await response.json();
      if (!response.ok) return toast.error(data.error ?? "Décision impossible.");
      router.refresh();
    } catch { toast.error("La Console est momentanément inaccessible."); }
    finally { setPending(false); }
  }
  if (type === "secret" || type === "sudo") return <div className="space-y-2"><div className="flex flex-col gap-2 sm:flex-row"><Input type="password" autoComplete="off" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={type === "sudo" ? "Mot de passe sudo" : "Valeur du secret"} disabled={pending} /><Button type="button" disabled={pending || !answer} onClick={() => decide("answered")}>{pending ? <Loader2Icon className="animate-spin" /> : null}Transmettre</Button></div><p className="text-xs text-muted-foreground">La valeur reste uniquement en mémoire le temps que l’Edge la récupère. Elle n’est ni écrite en base ni ajoutée à la timeline.</p></div>;
  if (type === "clarification") return <div className="flex flex-col gap-2 sm:flex-row"><Input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Votre réponse" maxLength={10_000} disabled={pending} /><Button type="button" disabled={pending || !answer.trim()} onClick={() => decide("answered")}>{pending ? <Loader2Icon className="animate-spin" /> : null}Répondre</Button></div>;
  return <div className="flex gap-2"><Button type="button" disabled={pending} onClick={() => decide("approved")}>{pending ? <Loader2Icon className="animate-spin" /> : null}Approuver</Button><Button type="button" variant="outline" disabled={pending} onClick={() => decide("rejected")}>Refuser</Button></div>;
}
