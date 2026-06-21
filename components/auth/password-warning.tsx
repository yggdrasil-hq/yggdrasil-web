export function PasswordRecoveryWarning({ className }: { className?: string }) {
  return (
    <p
      className={`rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100/90 ${className ?? ""}`}
    >
      We do not use email. If you forget your password, you will not be able to recover
      this account.
    </p>
  );
}
