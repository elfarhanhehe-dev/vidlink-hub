import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, type ChangeEvent } from "react";
import {
  listVideos,
  createUploadUrl,
  finalizeUpload,
  deleteVideo,
  trackEvent,
  getVideoAnalytics,
} from "@/server/videos.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — videy" }] }),
  component: Dashboard,
  ssr: false,
});

type Video = {
  id: string;
  title: string | null;
  storage_path: string;
  size_bytes: number | null;
  content_type: string | null;
  created_at: string;
  url: string;
  views: number;
  shares: number;
};

type Analytics = {
  totals: { views: number; shares: number };
  countries: { country: string; code: string | null; views: number }[];
  cities: { city: string; country: string; views: number }[];
  referrers: { host: string; count: number }[];
  timeline: { date: string; views: number; shares: number }[];
};

function Dashboard() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [openAnalytics, setOpenAnalytics] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = sessionStorage.getItem("admin_token");
    if (!t) {
      navigate({ to: "/admin", replace: true });
      return;
    }
    setToken(t);
    refresh(t);
  }, [navigate]);

  const refresh = async (t: string) => {
    setLoading(true);
    try {
      const list = await listVideos({ data: { token: t } });
      setVideos(list as Video[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load videos");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_token");
    navigate({ to: "/admin", replace: true });
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setError(null);
    setUploading(true);
    setProgress(0);
    try {
      const { path, uploadToken } = await createUploadUrl({
        data: {
          token,
          filename: file.name,
          contentType: file.type || "video/mp4",
          sizeBytes: file.size,
        },
      });
      const { error: upErr } = await supabase.storage
        .from("videos")
        .uploadToSignedUrl(path, uploadToken, file, {
          contentType: file.type || "video/mp4",
        });
      if (upErr) throw upErr;
      setProgress(100);
      await finalizeUpload({
        data: {
          token,
          path,
          title: file.name,
          contentType: file.type || "video/mp4",
          sizeBytes: file.size,
        },
      });
      if (fileInput.current) fileInput.current.value = "";
      await refresh(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !confirm("Delete this video?")) return;
    try {
      await deleteVideo({ data: { token, id } });
      setVideos((v) => v.filter((x) => x.id !== id));
      if (openAnalytics === id) setOpenAnalytics(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const shareLink = (id: string) => `${window.location.origin}/v/${id}`;

  const copy = async (id: string) => {
    await navigator.clipboard.writeText(shareLink(id));
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
    // Track share event (fire & forget)
    trackEvent({ data: { videoId: id, eventType: "share" } }).catch(() => {});
  };

  const toggleAnalytics = async (id: string) => {
    if (openAnalytics === id) {
      setOpenAnalytics(null);
      setAnalytics(null);
      return;
    }
    if (!token) return;
    setOpenAnalytics(id);
    setAnalytics(null);
    setAnalyticsLoading(true);
    try {
      const a = await getVideoAnalytics({ data: { token, id } });
      setAnalytics(a as Analytics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/" className="text-2xl font-extrabold tracking-tight">videy</Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">Admin</span>
          <button
            onClick={handleLogout}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 pb-20">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-xl shadow-foreground/5">
          <h1 className="text-3xl">Upload a video</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Up to 500MB. Supported: mp4, webm, mov, mkv, ogg.
          </p>
          <label
            className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-background py-12 text-center transition-colors hover:border-foreground/40 ${uploading ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              ref={fileInput}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFile}
              disabled={uploading}
            />
            <div className="text-base font-semibold">
              {uploading ? `Uploading… ${progress}%` : "Click to choose a video"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">or drag a file here</div>
          </label>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </div>

        <div className="mt-10">
          <h2 className="mb-4 text-2xl">Your videos</h2>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : videos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No videos yet. Upload one above.
            </div>
          ) : (
            <ul className="space-y-3">
              {videos.map((v) => (
                <li key={v.id} className="rounded-2xl border border-border bg-card">
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{v.title || "Untitled"}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>👁 {v.views} views</span>
                        <span>🔗 {v.shares} shares</span>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {shareLink(v.id)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        onClick={() => toggleAnalytics(v.id)}
                        className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-accent"
                      >
                        {openAnalytics === v.id ? "Hide stats" : "Stats"}
                      </button>
                      <button
                        onClick={() => copy(v.id)}
                        className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background hover:opacity-90"
                      >
                        {copied === v.id ? "Copied!" : "Copy link"}
                      </button>
                      <a
                        href={shareLink(v.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-accent"
                      >
                        Open
                      </a>
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {openAnalytics === v.id && (
                    <AnalyticsPanel loading={analyticsLoading} data={analytics} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function AnalyticsPanel({ loading, data }: { loading: boolean; data: Analytics | null }) {
  if (loading) {
    return <div className="border-t border-border p-6 text-sm text-muted-foreground">Loading analytics…</div>;
  }
  if (!data) return null;

  const maxDay = Math.max(1, ...data.timeline.map((d) => d.views + d.shares));
  const maxCountry = Math.max(1, ...data.countries.map((c) => c.views));

  return (
    <div className="space-y-6 border-t border-border p-6">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total views" value={data.totals.views} />
        <Stat label="Total shares" value={data.totals.shares} />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Last 14 days
        </h3>
        <div className="flex h-32 items-end gap-1">
          {data.timeline.map((d) => {
            const total = d.views + d.shares;
            const h = (total / maxDay) * 100;
            return (
              <div key={d.date} className="group flex flex-1 flex-col items-center justify-end">
                <div
                  className="w-full rounded-t bg-foreground transition-opacity group-hover:opacity-70"
                  style={{ height: `${h}%`, minHeight: total > 0 ? "2px" : "0" }}
                  title={`${d.date}: ${d.views} views, ${d.shares} shares`}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{data.timeline[0]?.date}</span>
          <span>{data.timeline[data.timeline.length - 1]?.date}</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Top countries
          </h3>
          {data.countries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No views yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.countries.map((c) => (
                <li key={c.country + (c.code || "")} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {c.code && <CountryFlag code={c.code} />}
                      <span>{c.country}</span>
                    </span>
                    <span className="font-semibold">{c.views}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-foreground"
                      style={{ width: `${(c.views / maxCountry) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Top cities
          </h3>
          {data.cities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No city data yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.cities.map((c) => (
                <li key={c.city + c.country} className="flex items-center justify-between">
                  <span className="truncate">
                    {c.city}, <span className="text-muted-foreground">{c.country}</span>
                  </span>
                  <span className="font-semibold">{c.views}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Share sources
        </h3>
        {data.referrers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No share traffic recorded yet — links shared via copy will appear here when opened.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.referrers.map((r) => (
              <li key={r.host} className="flex items-center justify-between">
                <span className="truncate">{r.host}</span>
                <span className="font-semibold">{r.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-extrabold">{value.toLocaleString()}</div>
    </div>
  );
}

function CountryFlag({ code }: { code: string }) {
  const cc = code.toUpperCase();
  if (cc.length !== 2) return null;
  const flag = String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  return <span aria-hidden>{flag}</span>;
}
