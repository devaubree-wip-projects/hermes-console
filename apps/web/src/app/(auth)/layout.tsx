export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-xl font-semibold md:text-2xl">Hermes Client Console</h1>
        <p className="text-sm text-muted-foreground">Pilotez votre assistant métier en toute confiance.</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
