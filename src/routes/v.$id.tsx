import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { getVideo, trackEvent } from "@/server/videos.functions";

export const Route = createFileRoute("/v/$id")({
  loader: ({ params }) => getVideo({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ? `${loaderData.title} — videy` : "Watch on videy" },
      { name: "description", content: "Watch this video on videy." },
      { property: "og:title", content: loaderData?.title || "Watch on videy" },
      { property: "og:type", content: "video.other" },
      ...(loaderData?.url ? [{ property: "og:video", content: loaderData.url }] : []),
    ],
  }),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-3xl">Video not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-accent"
          >
            Retry
          </button>
          <Link to="/" className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background">
            Home
          </Link>
        </div>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <Link to="/" className="text-sm underline">Go home</Link>
    </div>
  ),
  component: VideoView,
});

function VideoView() {
  const v = Route.useLoaderData();
  useEffect(() => {
    trackEvent({ data: { videoId: v.id, eventType: "view" } }).catch(() => {});
  }, [v.id]);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/" className="text-2xl font-extrabold tracking-tight">videy</Link>
        <Link to="/" className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background">
          Upload
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-12">
        <div className="overflow-hidden rounded-3xl border border-border bg-black shadow-2xl shadow-foreground/10">
          <video
            src={v.url}
            controls
            playsInline
            className="aspect-video w-full bg-black"
          />
        </div>

        {v.title && (
          <h1 className="mt-6 text-2xl break-words md:text-3xl">{v.title}</h1>
        )}
      </main>
    </div>
  );
}
