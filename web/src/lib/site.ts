export const site = {
  name: "Drop2List",
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/",
  nav: [
    { href: "/", label: "Create" },
    { href: "/listings", label: "Listings" },
    { href: "/evals", label: "Evals" },
    { href: "/about", label: "About" },
  ],
} as const;
