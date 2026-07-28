"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { NewAgentForm } from "@/components/agents/new-agent-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CreateAgentDialog({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus />
          Créer un agent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[45rem]">
        <DialogHeader>
          <DialogTitle>Créer un agent</DialogTitle>
          <DialogDescription>
            Définissez sa mission. Les modèles, skills et intégrations se règlent
            ensuite dans ses capacités.
          </DialogDescription>
        </DialogHeader>
        <NewAgentForm
          endpoint={endpoint}
          onSuccess={(redirectTo) => {
            setOpen(false);
            router.push(redirectTo);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
