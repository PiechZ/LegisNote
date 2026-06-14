"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const res = await signIn("credentials", { email, password, redirect: false });
    setPending(false);

    if (!res || res.error) {
      setError("Neplatné přihlašovací údaje.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main>
      <h1>Přihlášení</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem", maxWidth: "20rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span>E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span>Heslo</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error ? <p style={{ color: "crimson", margin: 0 }}>{error}</p> : null}
        <button type="submit" disabled={pending}>
          {pending ? "Přihlašuji…" : "Přihlásit se"}
        </button>
      </form>
    </main>
  );
}
