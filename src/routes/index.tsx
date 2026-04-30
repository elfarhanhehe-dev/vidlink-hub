import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "videy — Upload your videos and share" },
      { name: "description", content: "Free and simple video hosting. Upload your videos and share them with anyone." },
      { property: "og:title", content: "videy — Upload your videos and share" },
      { property: "og:description", content: "Free and simple video hosting." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/" className="text-2xl font-extrabold tracking-tight text-foreground">
          videy
        </Link>
        <Link
          to="/admin"
          className="rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          Admin
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-5xl leading-[1.05] md:text-7xl">
          <span className="text-foreground">Upload your videos</span>
          <br />
          <span className="bg-gradient-to-r from-muted-foreground to-foreground bg-clip-text text-transparent">
            and share
          </span>
        </h1>
        <p className="mt-6 text-base text-muted-foreground md:text-lg">
          Free and simple video hosting.
        </p>
        <Link
          to="/admin"
          className="mt-10 inline-flex items-center justify-center rounded-full bg-foreground px-8 py-4 text-base font-semibold text-background shadow-lg shadow-foreground/10 transition-transform hover:-translate-y-0.5"
        >
          Upload Video
        </Link>
      </main>

      <footer className="flex items-center justify-center gap-8 py-8 text-xs text-muted-foreground">
        <span>Terms of Service</span>
        <span>Report Abuse</span>
      </footer>
    </div>
  );
}
