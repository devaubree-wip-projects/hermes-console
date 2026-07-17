"use client";

import { useState } from "react";
import { NetworkIcon, PlusIcon, RadioTowerIcon } from "lucide-react";
import { ConnectInstallationForm } from "@/components/installations/connect-installation-form";
import { EnrollInstallationForm } from "@/components/installations/enroll-installation-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Trigger + modal that hosts the Connecter/Enrôler flows. The dialog stays
 * open after a submit so the two-step preflight and the one-time enrollment
 * token stay readable; the underlying list refreshes behind it.
 */
export function AddInstallationDialog({
  endpoint,
  agents,
}: {
  endpoint: string;
  agents: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <PlusIcon />
          Ajouter une installation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[38rem]">
        <DialogHeader>
          <DialogTitle>Ajouter une installation</DialogTitle>
          <DialogDescription>
            Reliez un Hermes déjà en ligne ou générez un jeton pour un VPS sans
            port entrant.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="connect">
          <TabsList className="w-full">
            <TabsTrigger value="connect">
              <NetworkIcon />
              Connecter
            </TabsTrigger>
            <TabsTrigger value="enroll">
              <RadioTowerIcon />
              Enrôler
            </TabsTrigger>
          </TabsList>
          <TabsContent value="connect" className="pt-4">
            <ConnectInstallationForm agents={agents} endpoint={endpoint} />
          </TabsContent>
          <TabsContent value="enroll" className="pt-4">
            <EnrollInstallationForm endpoint={endpoint} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
