import { Suspense } from "react";
import AcceptInviteClient from "./AcceptInviteClient";

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-4">
          <p className="text-[13px] text-muted">Loading invite…</p>
        </main>
      }
    >
      <AcceptInviteClient />
    </Suspense>
  );
}
