import { YggdrasilLogo } from "@/components/brand/yggdrasil-logo";

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <YggdrasilLogo />
          <div>
            <h1 className="font-display text-2xl font-semibold text-frost">{title}</h1>
            {description ? (
              <p className="mt-2 text-sm text-mist">{description}</p>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
