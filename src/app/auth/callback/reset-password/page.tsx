import { Suspense } from "react";

import { AuthCallbackContent } from "../auth-callback-content";

export default function PasswordResetCallbackPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[var(--hewie-bg,#999b96)]" />}>
      <AuthCallbackContent forcePasswordRecovery />
    </Suspense>
  );
}
