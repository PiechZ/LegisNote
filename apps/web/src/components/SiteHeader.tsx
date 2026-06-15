import Link from "next/link";

import { AuthStatus } from "./AuthStatus";

/** Global brand header: logo + wordmark, primary nav, and the auth strip. */
export function SiteHeader() {
  return (
    <header className="siteheader">
      <Link href="/" className="siteheader__brand" aria-label="LegisNote — domů">
        <span className="siteheader__logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={28} height={28} />
        </span>
        LegisNote
      </Link>

      <nav className="siteheader__nav">
        <Link href="/">Zákony</Link>
        <Link href="/exams">Zkoušky</Link>
        <Link href="/search">Hledat</Link>
        <AuthStatus />
      </nav>
    </header>
  );
}
