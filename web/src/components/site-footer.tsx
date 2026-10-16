import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs md:px-8">
        <p>A proof-of-work prototype. Not affiliated with any marketplace.</p>
        <a
          href={site.repoUrl}
          target="_blank"
          rel="noreferrer"
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
