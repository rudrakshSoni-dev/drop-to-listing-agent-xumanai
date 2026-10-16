"use client";

import { FolderGit2, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/drops");
  return pathname.startsWith(href);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-background/80 sticky top-0 z-40 h-14 border-b backdrop-blur">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-2 px-4 md:px-8">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <LogoMark /> {site.name}
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {site.nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm transition-colors duration-150",
                    isActive(pathname, item.href)
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <LogoMark />
          <span>{site.name}</span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-6 md:flex">
          {site.nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 items-center text-sm transition-colors duration-150",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                {active && <span className="bg-primary absolute inset-x-0 bottom-0 h-0.5" />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <ThemeToggle />
          <Button variant="ghost" size="icon" asChild>
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Source code on GitHub"
            >
              <FolderGit2 className="size-4" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
