import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { verifyAdminToken } from "@/server/videos.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — videy" }] }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("admin_token")) {
      navigate({ to: "/admin/dashboard" });
    }
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await verifyAdminToken({ data: { token } });
      sessionStorage.setItem("admin_token", token);
      navigate({ to: "/admin/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/" className="text-2xl font-extrabold tracking-tight">videy</Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 shadow-xl shadow-foreground/5"
        >
          <h1 className="text-3xl">Admin login</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your admin token to manage uploads.
          </p>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Admin token"
            className="mt-6 w-full rounded-full border border-border bg-background px-5 py-3 text-sm outline-none transition-colors focus:border-foreground"
            autoFocus
          />
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading || !token}
            className="mt-5 w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
