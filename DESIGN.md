# DESIGN.md: Drop2List UI

The source of truth for every UI decision. Stack: **Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui**. If something isn't specified here, choose the simplest option that matches these principles, then add it to this file.

---

## 1. Design principles

1. **One motion.** The main path is paste → watch it build → tweak → book. Every screen has one obvious primary action.
2. **Show the machine thinking.** Stream progress, transcript, and confidence. The AI's work is visible and checkable, never a black box.
3. **Trust is a feature.** Safety flags, confidence, and "suggested" labels are first-class UI, not footnotes.
4. **Dark, calm, content-first.** The video and the listing are the heroes. The chrome stays quiet.
5. **Mobile-honest.** The booking preview is phone-sized because that's where it would live. The editor is desktop-first but works down to 375px.

---

## 2. Setup

```bash
npx create-next-app@latest web --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
cd web
npx shadcn@latest init        # style: new-york, base color: zinc, CSS variables: yes
npx shadcn@latest add button input textarea label card badge tabs separator \
  form select slider toggle-group switch tooltip dialog sheet drawer alert \
  progress skeleton sonner table scroll-area popover calendar command \
  dropdown-menu avatar hover-card accordion chart breadcrumb
npm i @tanstack/react-query react-hook-form zod @hookform/resolvers \
  lucide-react framer-motion clsx tailwind-merge date-fns
```

- **Icons:** `lucide-react` only.
- **Animation:** `framer-motion` only for the swipe card and stage transitions. Everything else uses Tailwind transitions.
- **Toasts:** `sonner` (shadcn wrapper). Mount `<Toaster richColors position="bottom-right" />` once in the root layout.

---

## 3. Design tokens

Dark is the default theme. Use `next-themes` with `defaultTheme="dark"`; light mode is supported but secondary. All colors are CSS variables in `globals.css` (shadcn convention). **Never use raw hex values or Tailwind palette colors in components**, only the semantic tokens.

### 3.1 Color (HSL, shadcn variable format)

```css
:root {                      /* light */
  --background: 0 0% 100%;
  --foreground: 240 10% 4%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 4%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 4%;
  --primary: 262 83% 58%;          /* violet — brand */
  --primary-foreground: 0 0% 100%;
  --secondary: 240 5% 96%;
  --secondary-foreground: 240 6% 10%;
  --muted: 240 5% 96%;
  --muted-foreground: 240 4% 46%;
  --accent: 240 5% 96%;
  --accent-foreground: 240 6% 10%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 100%;
  --border: 240 6% 90%;
  --input: 240 6% 90%;
  --ring: 262 83% 58%;
  --radius: 0.75rem;

  /* custom semantic tokens */
  --success: 152 60% 40%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 50%;
  --warning-foreground: 240 10% 4%;
  --info: 199 89% 48%;
  --brand-gradient: linear-gradient(135deg, hsl(262 83% 58%), hsl(316 72% 56%));
}

.dark {
  --background: 240 10% 4%;        /* near-black */
  --foreground: 0 0% 98%;
  --card: 240 8% 7%;
  --card-foreground: 0 0% 98%;
  --popover: 240 8% 7%;
  --popover-foreground: 0 0% 98%;
  --primary: 262 83% 66%;
  --primary-foreground: 240 10% 4%;
  --secondary: 240 5% 14%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 5% 14%;
  --muted-foreground: 240 5% 65%;
  --accent: 240 5% 16%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 63% 50%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 5% 16%;
  --input: 240 5% 18%;
  --ring: 262 83% 66%;

  --success: 152 55% 45%;
  --warning: 38 92% 55%;
  --info: 199 89% 55%;
}
```

Register `success`, `warning`, and `info` in `tailwind.config.ts` under `theme.extend.colors` so `bg-success`, `text-warning`, and similar classes work.

**Usage rules**
- `primary` violet: primary buttons, focus rings, active tab, the progress fill. Nothing decorative.
- `--brand-gradient`: only on the logo mark, the "Book" swipe track, and the hero headline accent word. Never more than two places per screen.
- Confidence colors: ≥ 0.8 `success`, 0.5–0.79 `warning`, < 0.5 `destructive`.
- Guardrail status: `pass` → success, `warn` → warning, `block` → destructive.

### 3.2 Typography
- **Sans:** `Geist Sans` (via `geist/font`). **Mono:** `Geist Mono` for timestamps, JSON, and metrics.
- Scale (Tailwind):

| Role | Class |
|---|---|
| Display (hero) | `text-4xl md:text-6xl font-semibold tracking-tight` |
| H1 page title | `text-2xl md:text-3xl font-semibold tracking-tight` |
| H2 section | `text-lg font-semibold` |
| Body | `text-sm md:text-base` |
| Label / meta | `text-xs font-medium text-muted-foreground uppercase tracking-wide` |
| Metric number | `text-3xl font-semibold tabular-nums font-mono` |

Line length for prose is at most `max-w-prose`.

### 3.3 Spacing, radius, elevation
- 4px grid. Page padding is `px-4 md:px-8`, section gap `space-y-8`, card padding `p-4 md:p-6`.
- Radius: `--radius` 0.75rem. Cards `rounded-xl`, inputs and buttons `rounded-lg`, badges `rounded-full`, the phone frame `rounded-[2.5rem]`.
- Elevation: dark mode relies on **borders, not shadows**. Use `border bg-card`. The only shadow is `shadow-2xl shadow-primary/10` on the phone preview and the swipe card.

### 3.4 Motion
- Default transitions: `transition-colors duration-150` / `transition-all duration-200 ease-out`.
- Stage changes: fade + 4px rise (`framer-motion`, 200ms).
- Swipe card: spring `{ stiffness: 400, damping: 30 }`.
- Respect `prefers-reduced-motion`. Disable springs and use opacity only.

---

## 4. Layout and navigation

### 4.1 App shell (`src/app/layout.tsx`)
- A top bar, `h-14 border-b bg-background/80 backdrop-blur sticky top-0 z-40`:
  - Left: logo mark (gradient rounded square with a play-to-card glyph) + "Drop2List" wordmark.
  - Center (md+): nav links **Create**, **Listings**, **Evals**, **About**. The active link uses `text-foreground` with a 2px `primary` underline; inactive links use `text-muted-foreground`.
  - Right: a theme toggle (`DropdownMenu`), plus a GitHub icon button linking to the repo.
  - Mobile: nav collapses into a `Sheet` (left side) behind a `Menu` icon button.
- The main content is `container max-w-7xl mx-auto`.
- A footer with one muted line: "A proof-of-work prototype. Not affiliated with any marketplace." plus the GitHub link.

### 4.2 Routes

| Route | Purpose |
|---|---|
| `/` | Hero + input (Create) |
| `/drops/[id]` | Live processing view, which turns into the editor when done |
| `/listings` | Grid of generated listings |
| `/listings/[id]` | Editor + preview (same as finished `/drops/[id]`) |
| `/evals` | Eval dashboard |
| `/about` | What, why, how it works, architecture diagram |

---

## 5. Component inventory

Built components live in `src/components/`. Each one names the shadcn primitives it is composed from.

| Component | Built from | Notes |
|---|---|---|
| `DropInput` | `Tabs`, `Input`, `Button`, custom dropzone | Link / Upload tabs |
| `SourceBadge` | `Badge` + lucide icon | Instagram / TikTok / YouTube / Upload |
| `PipelineStepper` | `Progress`, custom list | Stages with icon, label, elapsed time |
| `VideoPanel` | native `<video>`, `Card` | Sticky; clicking a transcript line seeks the video |
| `TranscriptList` | `ScrollArea` | Timestamped lines; highlights the active line; highlights evidence quotes |
| `FrameStrip` | `ToggleGroup` | Horizontal thumbnails; select one as the listing thumbnail |
| `ListingForm` | `Form`, `Input`, `Textarea`, `Select`, `Slider`, `ToggleGroup`, `Switch` | The editable listing |
| `ConfidenceDot` | `Tooltip` | 8px dot next to each field label; tooltip shows "AI confidence 72%" |
| `MissingFieldsAlert` | `Alert` | Lists what the Guide must add, with each item a link that focuses its field |
| `SafetyPanel` | `Card`, `Accordion`, `Badge` | Guardrail status + flags with evidence |
| `PricePill` | `Badge` (outline) | Shows "Suggested $25–40 / 60 min" |
| `BookingPreview` | custom phone frame + `SwipeCard` | Mobile mock |
| `SwipeCard` | `framer-motion` | Swipe right to book, left to skip |
| `BookDialog` | `Drawer` (mobile) / `Dialog` (desktop), `Calendar`, `ToggleGroup` | Pick a slot and confirm |
| `JsonViewer` | `Sheet`, `ScrollArea`, mono `pre` | "View JSON" with a copy button |
| `MetricCard` | `Card` | Big number + label + delta/subtext |
| `EvalTable` | `Table`, `Badge`, `HoverCard` | Per-row results |
| `EmptyState` | `Card` | Icon, one sentence, one action |
| `ErrorState` | `Alert` (destructive) | Friendly copy mapped from the error code + retry |

---

## 6. Screens

### 6.1 Home / Create (`/`)

**Layout:** a single centered column, `max-w-2xl mx-auto pt-16 md:pt-24 text-center`.

1. **Eyebrow:** `Badge variant="secondary"` reading "✦ Content → bookable service".
2. **Headline (Display):** "Turn any video into a **bookable** listing." The word "bookable" uses the brand gradient as text (`bg-clip-text text-transparent`).
3. **Subhead (muted, body):** "Paste a Reel, TikTok or YouTube link. We transcribe it, understand the service, check it for youth-safety risks, and hand you a listing ready to book."
4. **`DropInput` card** (`mt-10 text-left`):
   - `Tabs` with **Paste link** (default) and **Upload video**.
   - Link tab: a large `Input` (`h-12 text-base`) with placeholder "https://www.instagram.com/reel/…", a leading `Link` icon, and a trailing detected `SourceBadge` once a valid URL is typed. Validate on change with zod; unsupported domains show inline helper text in `text-destructive`.
   - Upload tab: a dashed dropzone (`border-2 border-dashed rounded-xl h-40`) with an `Upload` icon and the text "Drop an mp4 or mov · max 3 min". On drag-over it switches to `border-primary bg-primary/5`.
   - Primary `Button size="lg" className="w-full mt-4"` reading **"Generate listing"** with a trailing `ArrowRight`. It's disabled until the input is valid.
   - Below the button, a muted `text-xs` line: "Public videos only. Nothing is posted anywhere."
5. **"Try an example" row:** three `Button variant="outline" size="sm"` chips (e.g. "Math tutor · YouTube", "Guitar coach · Reel", "Robotics club · TikTok"). Each one prefills and submits.
6. **How it works:** three small cards in a `grid md:grid-cols-3 gap-4 mt-20`, each with an icon, a title, and one line:
   - `AudioLines` **Understands** — "Transcript + key frames, not just the caption."
   - `ShieldCheck` **Checks** — "Flags off-platform contact and other youth-safety risks."
   - `CalendarCheck` **Books** — "Preview it as a swipe-to-book card."

On submit, POST, then `router.push('/drops/' + id)`.

### 6.2 Processing (`/drops/[id]` while running)

**Layout:** `grid lg:grid-cols-[1fr_420px] gap-8`.

- **Left:** `VideoPanel` showing a `Skeleton` (aspect 9:16 or 16:9 to match the source) until the video is fetched, then the video. The `FrameStrip` skeleton sits below it.
- **Right:** a `Card` containing the `PipelineStepper`:
  - Overall `Progress` at the top (6 stages, equal weight).
  - A vertical list of stages: **Fetching video → Transcribing → Picking key frames → Understanding the service → Safety check → Done**.
  - Each row: a 24px status icon (pending `Circle text-muted-foreground`, active `Loader2 animate-spin text-primary`, done `CheckCircle2 text-success`, error `XCircle text-destructive`), the label, and right-aligned mono elapsed time ("2.4s").
  - The active stage shows a muted sub-line with live detail streamed from SSE, e.g. "Heard: 'today we're going to solve quadratics…'". This is the "show the machine thinking" moment.
- When the transcript arrives, `TranscriptList` streams in under the video, line by line.
- On `done`, cross-fade (200ms) into the editor (§6.3) on the same URL. Fire a sonner toast "Listing ready ✓".
- On `error`, replace the stepper with `ErrorState`. Map each code to copy:
  - `VIDEO_PRIVATE`: "That video isn't public. Try another link or upload the file."
  - `VIDEO_TOO_LONG`: "Videos up to 3 minutes for now."
  - `LLM_SCHEMA_FAIL`: "The model's answer didn't fit our listing format. Retry?"
  
  Each error offers a **Retry** button and a **Start over** button.

### 6.3 Listing editor (`/drops/[id]` done, `/listings/[id]`)

**Header row:** a `Breadcrumb` (Listings / {title}), the H1 title (editable inline on click), then on the right:
- A guardrail status `Badge`: "Ready to publish" (success), "Needs review" (warning), or "Blocked" (destructive).
- `Button variant="outline"` **View JSON** (opens the `JsonViewer` sheet from the right).
- `Button` **Save** (primary, disabled when the form is clean; ⌘S shortcut).

**Body:** a three-column grid on xl (`xl:grid-cols-[320px_1fr_380px]`), two columns on lg (the preview moves below), stacked on mobile.

**Column A: Source (sticky, `top-20`)**
- `VideoPanel` with the source badge and duration.
- `FrameStrip`: the selected frame is ringed with `ring-2 ring-primary` and labeled "Thumbnail".
- `TranscriptList` in a `ScrollArea h-[320px]`. Lines are mono timestamps + text. Clicking a line seeks the video. Evidence lines referenced by safety flags get a `bg-warning/10 border-l-2 border-warning` highlight.

**Column B: Listing form** (`ListingForm`, react-hook-form + zod), grouped into `Card`s with H2 headers:

1. **Missing info** (only if `missing_fields` is non-empty): a `MissingFieldsAlert` at the top in an info style, "We couldn't infer 2 things from the video:", with each item linking to its field.
2. **Basics**
   - Title: `Input`, with a character counter at 60.
   - Summary: `Textarea` (rows 2), counter at 280.
   - Description: `Textarea` (rows 6), markdown allowed, plus a small "Preview" toggle.
3. **Classification**
   - Category: a `Select` with the 9 categories (human labels, e.g. "STEM, coding & robotics").
   - Age range: a dual-thumb `Slider` from 3 to 18 with a live label "Ages 8–12".
   - Format: a `ToggleGroup` (1:1 | Small group). When "Small group" is selected, a "Max group size" number `Input` appears.
   - Mode: a `ToggleGroup` (Virtual | In person | Hybrid) with icons `Video`, `MapPin`, `Shuffle`.
4. **Session & price**
   - Duration: a `Select` (30 / 45 / 60 / 90 min).
   - Price band: two number inputs (min, max) + currency, with a `PricePill` above reading "Suggested from category + format". Add a `Tooltip` on an info icon: "Static heuristic, not market data."
   - Availability: a `Popover` + `Calendar` for picking weekly slots. It's required and starts empty (this is always a missing field).
5. **Discovery**
   - Skills and tags: an editable chip input (type + Enter; chips are `Badge variant="secondary"` with an `X`).
   - Social caption: `Textarea`, a 150-char counter, and a **Regenerate** ghost button with a `Sparkles` icon.

Every AI-filled field label carries a `ConfidenceDot`. Once a user edits a field, its dot becomes a muted "edited" pencil icon, because confidence no longer applies.

**Column C: Preview & safety (sticky)**
- `Tabs` with **Preview** | **Safety ({flagCount})**.
- **Preview tab:** the `BookingPreview` (§7). It live-updates from the form state via `watch()`.
- **Safety tab:** the `SafetyPanel`:
  - Top: a large status row with an icon (`ShieldCheck` / `ShieldAlert` / `ShieldX`), the status text, and one line explaining what it means.
  - An `Accordion` with one item per flag. The header shows a severity `Badge`, the human-readable flag name, and a timestamp chip. The body holds the explanation, the evidence quote (mono, with a "Jump to 0:42" link that seeks the video), and a suggested fix ("Remove the phone number from your caption and description").
  - If any flag is `high`, the **Save** button still works but **Publish** is disabled in the preview, with a tooltip: "Resolve high-severity flags to publish."
  - The footer note is muted: "Automated checks flag content for review. They don't certify safety."

### 6.4 Booking preview + flow (inside column C, §7 for details)

### 6.5 Listings (`/listings`)
- H1 "Listings" + a primary **New listing** button.
- Filter row: search `Input`, a category `Select`, and a status `ToggleGroup` (All | Ready | Needs review | Blocked).
- A grid (`sm:grid-cols-2 lg:grid-cols-3 gap-4`) of `Card`s. Each has a 4:5 thumbnail, a `SourceBadge` overlaid top-left, a status dot top-right, the title (2-line clamp), a muted "Category · Ages 8–12 · 1:1 · Virtual" line, and a `PricePill`. The whole card is a link.
- Empty state: `Clapperboard` icon, "No listings yet. Turn your first video into one.", and a **Create** button.
- Loading: 6 skeleton cards.

### 6.6 Evals (`/evals`)
This page proves the work. It must be scannable in 10 seconds.

1. **Header:** H1 "Evaluation", plus a muted subline: "{n} hand-labeled public videos · run {relative date} · model {LLM_MODEL}".
2. **Metric cards:** `grid grid-cols-2 lg:grid-cols-4 gap-4` of `MetricCard`s:
   - Category accuracy (e.g. "84%")
   - Age-range accuracy (IoU ≥ 0.5) with the mean IoU as subtext
   - Format accuracy (group / mode as subtext)
   - Guardrail recall with precision as subtext
   
   A fifth row of smaller cards shows latency p50/p95 and cost per listing (if available).
3. **Charts** (shadcn `chart` with Recharts), two side by side on lg:
   - Per-category accuracy: a horizontal bar chart using `--primary`.
   - Guardrail precision/recall per flag: a grouped bar chart (primary vs `--info`).
4. **Per-row table** (`EvalTable`): columns are #, source thumbnail (32px), expected category, predicted category (a ✓/✗ icon in success/destructive), age IoU (mono), format ✓/✗, flags expected vs found, latency. Hovering a row opens a `HoverCard` with the transcript excerpt. Sortable headers; a filter toggle "Only failures".
5. **"What fails and why"** card: 3–5 bullets written by hand after each eval run, kept in `evals/notes.md` and rendered here. This shows judgment.

All numbers come from `/api/evals`. If the request fails, show `ErrorState`. Never show placeholder numbers.

### 6.7 About (`/about`)
- A short prose section (`max-w-prose`) covering what this is, why it was built, and the problem in marketplaces: supply onboarding friction.
- A "How it works" pipeline diagram: a horizontal row of 6 stage cards connected by arrows (stacked on mobile), each with its tech in mono under the label (e.g. "Transcribe · Gemini / faster-whisper").
- A stack list with small badges.
- A "What I'd do with real marketplace data" list (4–5 bullets).
- Links: GitHub, a demo video, contact.

---

## 7. Booking preview spec

The `BookingPreview` is the emotional payoff of the main path, so build it carefully.

**Phone frame:** `w-[320px] h-[640px] rounded-[2.5rem] border-[10px] border-secondary bg-background shadow-2xl shadow-primary/10 overflow-hidden mx-auto`, with a notch (`w-24 h-6 rounded-b-2xl bg-secondary` centered at the top). Draw the frame in CSS, with no device images.

**Inside, top to bottom:**
1. A fake status bar (mono `text-[10px]`, time + icons) and a mini header: "Discover" with a filter icon.
2. **The `SwipeCard`** (`absolute inset-x-3 top-16 bottom-24 rounded-3xl overflow-hidden`):
   - Full-bleed thumbnail frame with a bottom gradient overlay (`bg-gradient-to-t from-black/90 via-black/40 to-transparent`).
   - Top-left: a `SourceBadge`. Top-right: a play-icon button that plays the source video muted, inline in the card.
   - Bottom overlay text (white): the title (`text-lg font-semibold`, 2-line clamp), the summary (`text-xs text-white/80`, 2-line clamp), and a chip row with category, "Ages 8–12", 1:1 or Group, and a mode icon. Price sits right-aligned in bold ("$25–40").
   - **Drag behavior (framer-motion):** horizontal drag with rotation of ±8° proportional to x. Past +120px, a "BOOK" stamp fades in (success border, rotated -12°). Past -120px, a "SKIP" stamp fades in (muted). Releasing past the threshold on the right opens the `BookDialog`; on the left the card animates off and springs back after 400ms (it's a demo).
3. **Bottom action bar:** two circular buttons. Skip is an `X` icon (`variant="outline"`); Book is a `Calendar` icon (`h-14 w-14`, brand gradient background). They do the same thing as swiping, for accessibility.

**`BookDialog`** (a `Drawer` inside mobile widths, a `Dialog` otherwise):
- Header: "Book {title}" + the Guide's avatar and name ("Demo Guide").
- A `Calendar` showing the next 14 days. Days with availability are enabled; others are disabled.
- A time-slot `ToggleGroup` (chips) for the selected day.
- A format reminder line and the price.
- A primary **Confirm booking** button.
- **Confirmation state:** an animated `CheckCircle2` (scale-in), "You're booked", the date and time, an **Add to calendar** outline button (downloads an .ics file), and **Done**.
- If availability is empty, the dialog shows `EmptyState`: "This Guide hasn't set availability yet," with a button (desktop editor only) that focuses the Availability field. This visibly connects missing info to the booking flow.
- If guardrail status is `block`, the Book button and swipe-right are disabled. The card shows a small destructive banner: "Not publishable: safety review needed."

---

## 8. States checklist (every data view)

| State | Treatment |
|---|---|
| Loading | `Skeleton` that matches the final layout's shape. Never use a lone centered spinner except inside buttons |
| Empty | `EmptyState`: icon, one sentence, one action |
| Error | `ErrorState`: friendly mapped copy, Retry, and secondary "Start over" |
| Partial (streaming) | Show what's known and skeleton the rest |
| Success feedback | Sonner toast, short past tense ("Saved", "Listing ready") |
| Destructive actions | `Dialog` confirmation (delete listing) |

Button loading pattern: replace the leading icon with `Loader2 animate-spin`, keep the label, and set it disabled.

---

## 9. Responsiveness

| Breakpoint | Editor layout |
|---|---|
| `< md` (mobile) | Stacked: video → tabs (Form / Preview / Safety) as full-width `Tabs` |
| `md–lg` | Two columns: source + form; the preview opens in a `Sheet` from a floating "Preview" button |
| `lg–xl` | Two columns: form + preview/safety; the source collapses into a top `Accordion` |
| `≥ xl` | Full three columns |

Minimum supported width is 360px. Touch targets are at least 40px. The phone preview scales with `scale-90` below 380px.

---

## 10. Accessibility

- Every interactive element is reachable by keyboard. The swipe card has equivalent buttons, and the ← / → keys trigger skip/book when the card is focused.
- Focus: rely on shadcn's `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background`; never remove it.
- Status is never conveyed by color alone. Confidence dots have tooltips plus `sr-only` text; guardrail badges carry icons and text.
- The video has captions generated from the transcript as a `<track>` (WebVTT served by the API).
- `aria-live="polite"` on the `PipelineStepper` so screen readers hear stage changes.
- Contrast: body text meets WCAG AA on `--background` and `--card` in both themes.
- `prefers-reduced-motion`: no springs, no rotation, opacity transitions only.

---

## 11. Copy and voice

- Plain, confident, short. Second person to the Guide ("your listing").
- Use "Suggested" for AI price/format guesses and "Flagged for review" for guardrails. Never say "verified", "safe", or "guaranteed".
- Buttons are verbs: "Generate listing", "Confirm booking", "Regenerate caption".
- Numbers: tabular mono, `%` with no decimals unless under 10%.

---

## 12. File structure (web)

```
src/
  app/
    layout.tsx            shell, providers (theme, react-query, toaster)
    page.tsx              Home / Create
    drops/[id]/page.tsx   processing → editor
    listings/page.tsx
    listings/[id]/page.tsx
    evals/page.tsx
    about/page.tsx
  components/
    ui/                   shadcn generated — do not edit by hand except tokens
    drop-input.tsx  pipeline-stepper.tsx  video-panel.tsx  transcript-list.tsx
    frame-strip.tsx  listing-form.tsx  confidence-dot.tsx  missing-fields-alert.tsx
    safety-panel.tsx  booking-preview.tsx  swipe-card.tsx  book-dialog.tsx
    json-viewer.tsx  metric-card.tsx  eval-table.tsx  empty-state.tsx  error-state.tsx
    source-badge.tsx  price-pill.tsx  site-header.tsx  site-footer.tsx
  hooks/
    use-drop-events.ts    SSE subscription → stage state
    use-listing.ts        react-query get/patch
  lib/
    api.ts                typed fetch client
    schema.ts             generated zod + TS types (do not edit)
    categories.ts         enum → human label + icon
    errors.ts             error code → copy
    utils.ts              cn()
```

---

## 13. Pre-demo polish checklist

- [ ] The main path (paste example → editor → swipe → booked) works start to finish with no console errors.
- [ ] Every screen has loading, empty, and error states.
- [ ] Dark mode looks deliberate, with no washed-out greys or pure-white borders.
- [ ] Nothing overflows horizontally at 360px.
- [ ] Every number on Evals traces back to `results.json`.
- [ ] Safety flags jump to the right timestamp.
- [ ] Lighthouse a11y ≥ 95 on Home and Editor.
- [ ] Favicon, OG image (hero headline + phone preview), and page titles are set.
- [ ] The README GIF shows the 30-second main path.
