"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import styles from "./auth-form.module.css";

type AuthMode = "login" | "signup";

const content = {
  login: {
    eyebrow: "Account access",
    title: "Welcome back",
    description: "Sign in to continue designing your PostgreSQL schemas.",
    submitLabel: "Sign in",
    alternatePrompt: "New to Tablo?",
    alternateLabel: "Create an account",
    alternateHref: "/signup",
  },
  signup: {
    eyebrow: "Create account",
    title: "Start with Tablo",
    description: "Create an account with your email and a secure password.",
    submitLabel: "Create account",
    alternatePrompt: "Already have an account?",
    alternateLabel: "Sign in",
    alternateHref: "/login",
  },
} as const;

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [submissionAttempted, setSubmissionAttempted] = useState(false);
  const copy = content[mode];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmissionAttempted(true);
  }

  return (
    <main className={styles.page}>
      <header className={styles.siteHeader}>
        <Link className={styles.brand} href="/" aria-label="Tablo home">
          <span className={styles.brandMark} aria-hidden="true">T</span>
          <span>Tablo</span>
        </Link>
        <span className={styles.productLabel}>PostgreSQL schema design</span>
      </header>

      <div className={styles.content}>
        <section className={styles.authPanel} aria-labelledby="auth-title">
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id="auth-title" className={styles.title}>{copy.title}</h1>
          <p className={styles.description}>{copy.description}</p>

          <form className={styles.form} method="post" onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label htmlFor={`${mode}-email`}>Email</label>
              <input
                id={`${mode}-email`}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor={`${mode}-password`}>Password</label>
              <input
                id={`${mode}-password`}
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                aria-describedby={mode === "signup" ? `${mode}-password-hint` : undefined}
                minLength={mode === "signup" ? 8 : undefined}
                required
              />
              {mode === "signup" ? (
                <p id={`${mode}-password-hint`} className={styles.fieldHint}>
                  Use at least 8 characters.
                </p>
              ) : null}
            </div>

            <button className={styles.submitButton} type="submit">
              {copy.submitLabel}
            </button>

            <p className={styles.formStatus} role="status" aria-live="polite">
              {submissionAttempted
                ? "Authentication is not connected in this frontend preview. Your credentials were not submitted."
                : "Frontend preview — credentials are not sent or stored."}
            </p>
          </form>

          <p className={styles.alternateAction}>
            {copy.alternatePrompt}{" "}
            <Link href={copy.alternateHref}>{copy.alternateLabel}</Link>
          </p>
        </section>
      </div>

      <footer className={styles.footer}>Design the structure. Keep the source.</footer>
    </main>
  );
}
