"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LockKeyhole, Mail, ArrowRight, Loader2 } from "lucide-react";
import { BrandLockup } from "@/components/brand/brand-lockup";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[auth] password sign-in failed", {
            code: error.code ?? null,
            status: error.status ?? null,
          });
        }
        throw error;
      }

      const { data: persisted, error: sessionError } = await supabase.auth.getSession();
      const sessionExists = Boolean(data.session);
      const browserSessionExists = Boolean(persisted.session);
      const sessionMatches = Boolean(
        data.session && persisted.session && data.session.user.id === persisted.session.user.id
      );

      if (process.env.NODE_ENV === "development") {
        console.info("[auth] sign-in session check", {
          sessionExists,
          browserSessionExists,
          sessionMatches,
          sessionReadErrorCode: sessionError?.code ?? null,
        });
      }

      if (sessionError) throw sessionError;
      if (!sessionExists || !browserSessionExists || !sessionMatches) {
        throw new Error("Sign-in succeeded, but the browser session could not be confirmed. Please try again.");
      }

      if (process.env.NODE_ENV === "development") {
        console.info("[auth] navigating after sign-in", { destination: "/dashboard" });
      }
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-panel">
        <div className="login-brand"><BrandLockup /><p className="login-workspace-label">GROUP CRM · SECURE WORKSPACE</p></div>

        <div className="login-heading">
          <h1>Welcome back</h1>
          <p>Sign in to your WeLanterns workspace</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div>
            <label className="login-label" htmlFor="login-email">Email address</label>
            <div className="login-field">
              <Mail size={18} aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your company email"
                className="login-input"
              />
            </div>
          </div>

          <div>
            <label className="login-label" htmlFor="login-password">Password</label>
            <div className="login-field">
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="login-input"
              />
            </div>
          </div>

          {error && <p role="alert" className="login-error">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="login-submit"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <>Sign In <ArrowRight size={18} /></>}
          </button>
        </form>

        <p className="login-copyright">
          © 2026 WeLanterns Capital Advisory Pvt. Ltd. All rights reserved.
        </p>
      </div>
    </main>
  );
}
