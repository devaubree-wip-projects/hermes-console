import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center px-5 sm:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/40"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[70ch] px-5 py-10 sm:px-8 sm:py-14">{children}</main>
    </div>
  );
}
