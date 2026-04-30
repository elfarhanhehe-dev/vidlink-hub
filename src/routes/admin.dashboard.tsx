import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { listVideos, createUploadUrl, finalizeUpload, deleteVideo } from "@/server/videos.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — videy" }] }),
  component: Dashboard,
});

type Video = {
  id: string;
  title: string | null;
  storage_path: string;
  size_bytes: number | null;
  content_type: string | null;
  created_at: string;
  url: string;
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
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = typeof window !== "undefined" ? sessionStorage.getItem("admin_token") : null;
    if (!t) {
      navigate({ to: "/admin" });
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
    navigate({ to: "/admin" });
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

      // Upload directly to storage using the signed token (avoids server body limits)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const shareLink = (id: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/v/${id}` : `/v/${id}`;

  const copy = async (id: string) => {
    await navigator.clipboard.writeText(shareLink(id));
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
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
            <div className="mt-1 text-xs text-muted-foreground">
              or drag a file here
            </div>
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
                <li
                  key={v.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{v.title || "Untitled"}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {shareLink(v.id)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
