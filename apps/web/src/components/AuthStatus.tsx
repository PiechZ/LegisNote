import Link from "next/link";

import { auth, signOut } from "~/server/auth";

/**
 * Compact auth strip for the global header: signed-in user + role and a sign-out
 * button, or a sign-in link. Sign-out is a server action calling Auth.js.
 */
export async function AuthStatus() {
  const session = await auth();

  if (!session?.user) {
    return (
      <span className="authstrip">
        <Link href="/login">Přihlásit se</Link>
      </span>
    );
  }

  return (
    <span className="authstrip">
      <span title={session.user.email ?? undefined}>
        <strong style={{ color: "var(--gold)" }}>{session.user.role}</strong>
      </span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit">Odhlásit</button>
      </form>
    </span>
  );
}
