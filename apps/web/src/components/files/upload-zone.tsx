"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function UploadZone({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setIsUploading(true);

    const results = await Promise.all(
      Array.from(fileList).map(async (file) => {
        try {
          const formData = new FormData();
          formData.append("workspaceId", workspaceId);
          formData.append("file", file);
          const res = await fetch("/api/files", { method: "POST", body: formData });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.error ?? "Échec de l'envoi.");
          }
          return true;
        } catch (err) {
          toast.error(`${file.name} : ${err instanceof Error ? err.message : "échec de l'envoi."}`);
          return false;
        }
      }),
    );
    const successCount = results.filter(Boolean).length;

    setIsUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    if (successCount > 0) {
      toast.success(successCount === 1 ? "Fichier ajouté." : `${successCount} fichiers ajoutés.`);
      router.refresh();
    }
  }

  return (
    <Card
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        void uploadFiles(e.dataTransfer.files);
      }}
      className={cn(
        "items-center gap-3 border-2 border-dashed p-6 text-center transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <UploadCloud className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">
        Glissez-déposez vos fichiers ici, ou utilisez le bouton ci-dessous.
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(e) => void uploadFiles(e.target.files)}
        disabled={isUploading}
      />
      <Button
        type="button"
        className="h-11"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Ajouter des fichiers
      </Button>
    </Card>
  );
}
