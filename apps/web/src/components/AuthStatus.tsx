import Link from "next/link";

import { auth, signOut } from "~/server/auth";

/**
 * Server component header strip: shows the signed-in user + role and a sign-out
 * button, or a sign-in link. Sign-out is a server action calling Auth.js.
 */
export async function AuthStatus() {
  const session = await auth();

  if (!session?.user) {
    return (
      <p style={{ fontSize: "0.9rem", opacity: 0.8 }}>
        <Link href="/login">Přihlásit se</Link>
      </p>
    );
  }

  return (
    <p style={{ fontSize: "0.9rem", opacity: 0.8, display: "flex", gap: "0.75rem", alignItems: "center" }}>
      <span>
        {session.user.email} · <strong>{session.user.role}</strong>
      </span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button type="submit">Odhlásit se</button>
      </form>
    </p>
  );
}
