import {
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  const cls = cn("size-4", className);

  if (mimeType.startsWith("image/")) return <FileImage className={cls} aria-hidden />;
  if (mimeType.startsWith("video/")) return <FileVideo className={cls} aria-hidden />;
  if (mimeType.startsWith("audio/")) return <FileAudio className={cls} aria-hidden />;
  if (mimeType === "application/pdf" || mimeType.startsWith("text/")) {
    return <FileText className={cls} aria-hidden />;
  }
  if (mimeType.includes("spreadsheet") || mimeType === "text/csv" || mimeType.includes("excel")) {
    return <FileSpreadsheet className={cls} aria-hidden />;
  }
  if (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("archive")) {
    return <FileArchive className={cls} aria-hidden />;
  }
  return <File className={cls} aria-hidden />;
}
