# Design System — YTResearch Intelligence UI

> All YTResearch UI must follow this design system. The main dashboard mockup is the canonical reference: a serious, dense, light-mode SaaS interface for YouTube competitor intelligence, topic recommendations, reports, content production, and visual generation.
>
> Future pages should reuse these primitives (`.yt-*`, `.yt-kpi`, `.yt-panel`, `.yt-rec-row`, `.yt-outlier-card`, `.yt-table`, etc.) instead of creating one-off card styles.

## Overview

YTResearch sits at the intersection of analytics dashboard, content strategy workspace, and AI-assisted production tool. The interface should feel like a professional SaaS product for creators, agencies, and B2B marketers who need evidence-backed YouTube research without the visual noise of consumer AI apps.

The design language is intentionally restrained: light-mode canvas, navy app shell, teal primary actions, compact panels, dense rows, clear badges, and practical workflow controls. It should communicate research-grade clarity and operational maturity rather than hype. The product’s personality comes from fast scanning, visible evidence, and confident hierarchy — not from oversized hero sections, decorative gradients, playful blobs, or cartoon imagery.

The dashboard is the anchor surface. It combines KPI cards, recommendation rows, outlier cards, momentum charts, competitor pattern chips, and report controls into a serious intelligence cockpit. Secondary surfaces — competitors, reports, content studio, calendar, admin, and visual studio — should reuse the same compact primitives so the app feels like one system.

**Key Characteristics:**
- Dense light-mode SaaS dashboard with a dark navy sidebar and white topbar
- Teal primary action color (`--yt-primary`) used for core workflow actions and active navigation accents
- Compact 8px-radius cards and panels; no oversized playful rounding
- Inter/system sans typography with 14px body text, strong 700–800 weights for labels, panel titles, KPIs, and scores
- Evidence-forward recommendation rows: opportunity score, suggested angle, and visible reason badges must stay readable at a glance
- Flat, professional surfaces with subtle shadows; no decorative blobs, bokeh, heavy purple gradients, or cartoon treatments
- Utility-first app shell: sidebar, topbar filters, KPI row, panel grid, tables, charts, and production workspaces

## Colors

> Token names use CSS variables. Components should reference tokens directly instead of scattered hex literals.

### Brand & Accent
- **YTResearch Teal** (`--yt-primary`): Primary brand/action anchor. Used for Generate Report, Create Outline, Generate Script, Generate Image, Save to Calendar, focus states, active sidebar border, selected badges, and primary links when appropriate.
- **YTResearch Teal Hover** (`--yt-primary-hover`): Pressed/active state for primary buttons and high-emphasis teal controls.
- **Soft Teal** (`--yt-primary-soft`): Light teal support color for selected states, high-fit evidence, and low-emphasis teal backgrounds.
- **Action Blue** (`--yt-blue`): Secondary action color for links, chart secondary series, source/news badges, and active filters.
- **Soft Blue** (`--yt-blue-soft`): Low-emphasis blue background for informational badges and secondary chart surfaces.
- **App Navy** (`--yt-navy`): Sidebar background and strongest app-shell anchor.
- **Rare Purple** (`--yt-purple`): Rare accent only. Use sparingly for special categorization or advanced AI metadata; never let it become the main brand color.
- **Soft Purple** (`--yt-purple-soft`): Background tint for rare purple states.

### Semantic
- **Success** (`--yt-success`): Completed jobs, high opportunity scores, available status, positive outlier indicators.
- **Success Soft** (`--yt-success-soft`): Success badge backgrounds and positive state surfaces.
- **Warning** (`--yt-warning`): Pending jobs, quota pressure, partial data, medium opportunity scores.
- **Warning Soft** (`--yt-warning-soft`): Warning badge backgrounds and non-blocking alert surfaces.
- **Danger** (`--yt-danger`): Failed jobs, overdue reports, billing issues, unavailable data, destructive messaging.
- **Danger Soft** (`--yt-danger-soft`): Error badge backgrounds and recoverable failure surfaces.

### Surface
- **Page Background** (`--yt-bg`): Main app canvas. A very light blue-gray that keeps white panels readable.
- **Surface** (`--yt-surface`): Primary panels, cards, inputs, topbar, table bodies.
- **Surface Soft** (`--yt-surface-soft`): Secondary surfaces, thumbnail placeholders, empty state blocks.
- **Surface Muted** (`--yt-surface-muted`): Table rows, small internal panels, low-emphasis containers.
- **Border** (`--yt-border`): Default hairline border for panels, rows, inputs, and badges.
- **Border Strong** (`--yt-border-strong`): Active/hover border and stronger separators.

### Text
- **Text** (`--yt-text`): Primary body, KPI values, page headers.
- **Text Secondary** (`--yt-text-secondary`): Panel titles, row titles, card headings.
- **Text Muted** (`--yt-text-muted`): Helper text, descriptions, metadata, notes.
- **Text Faint** (`--yt-text-faint`): Tertiary metadata and disabled-looking labels.
- **Text Inverse** (`--yt-text-inverse`): Text on navy, teal, dark table headers, and other dark surfaces.

### CSS Token Source

```css
:root {
  --yt-bg: #F8FAFC;
  --yt-surface: #FFFFFF;
  --yt-surface-soft: #F2F4F7;
  --yt-surface-muted: #FCFCFD;
  --yt-border: #D0D5DD;
  --yt-border-strong: #98A2B3;

  --yt-primary: #0F766E;
  --yt-primary-hover: #115E59;
  --yt-primary-soft: #CCFBF1;
  --yt-blue: #2563EB;
  --yt-blue-soft: #DBEAFE;
  --yt-navy: #111827;
  --yt-success: #047857;
  --yt-success-soft: #D1FAE5;
  --yt-warning: #B45309;
  --yt-warning-soft: #FEF3C7;
  --yt-danger: #B42318;
  --yt-danger-soft: #FEE4E2;
  --yt-purple: #6941C6;
  --yt-purple-soft: #EDE9FE;

  --yt-text: #101828;
  --yt-text-secondary: #344054;
  --yt-text-muted: #667085;
  --yt-text-faint: #98A2B3;
  --yt-text-inverse: #FFFFFF;

  --yt-shadow: 0 8px 24px rgba(16, 24, 40, 0.08);
  --yt-shadow-soft: 0 4px 14px rgba(16, 24, 40, 0.06);
}
```

## Typography

### Font Family

**Inter / system sans** is the single UI type family. It should be used across body text, headings, navigation, controls, tables, badges, KPI labels, and generated content containers.

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

A separate monospace face is optional only for code-like values, logs, IDs, or technical metadata. The product should not look like a developer-docs site; the main personality is analytics SaaS.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---:|---:|---:|---:|---|
| `yt-page-title` | 24–28px | 700 | 1.20 | 0 | Page title, dashboard title |
| `yt-section-title` | 16–18px | 700 | 1.30 | 0 | Major section header |
| `yt-panel-title` | 15–17px | 700 | 1.30 | 0 | Panel/module title |
| `yt-card-title` | 14–15px | 700 | 1.35 | 0 | Card title, row title |
| `yt-body` | 14px | 400 | 1.45 | 0 | Default dashboard body text |
| `yt-body-medium` | 14px | 600 | 1.45 | 0 | Row emphasis, secondary labels |
| `yt-body-small` | 13px | 400 | 1.45 | 0 | Compact descriptions, table rows |
| `yt-meta` | 12px | 400 | 1.40 | 0 | Metadata, helper text |
| `yt-kpi-label` | 11px | 700 | 1.40 | 0.04em | Uppercase KPI labels |
| `yt-kpi-value` | 28–30px | 800 | 1.10 | 0 | KPI values |
| `yt-score` | 12px | 800 | 1.00 | 0 | Opportunity score badges |
| `yt-table-header` | 12px | 700 | 1.30 | 0 | Table header cells |
| `yt-button` | 13–14px | 700 | 1.20 | 0 | Button labels |

### Principles
- **Compact by default** — dashboard and workspace body text should usually sit at 13–14px.
- **Strong labels, restrained sizes** — use 700–800 weight for KPI labels, scores, table headers, and panel titles instead of increasing size.
- **No viewport-scaled typography** — app UI should not resize like a marketing landing page.
- **Uppercase only for tiny operational labels** — KPI labels and status labels may use uppercase; normal headings should not.
- **Tabular numerals recommended** — use for KPI values, costs, usage, scores, dates, and analytics.

## Layout

### App Shell

The app shell defines the product. Every main page should feel like it belongs inside the same operating system.

**Sidebar (`.yt-sidebar`)**
- Width: 240px on desktop
- Background: `--yt-navy`
- Text: white / muted gray
- Position: sticky or fixed depending on app shell implementation
- Active state: subtle white overlay plus 3px teal left border
- Inactive state: muted gray text

Primary nav items:
- Dashboard
- Competitors
- Outliers
- Topic Ideas
- Reports
- Content Studio
- Calendar
- Visual Studio
- Settings
- Admin

**Topbar (`.yt-topbar`)**
- Height: 64px
- Background: `--yt-surface`
- Bottom border: `1px solid var(--yt-border)`
- Contents: niche selector, date filter, Generate Report button, credits indicator, optional user avatar

### Page Wrapper

```css
.yt-page {
  background: var(--yt-bg);
  color: var(--yt-text);
  padding: 24px 32px 40px;
}
```

Dashboard pages can use the full available app-shell width. Use max-width only for narrow editor or settings pages where very long line lengths would hurt readability.

### Spacing System

| Token | Value | Use |
|---|---:|---|
| `yt-space-1` | 4px | Tight icon/text gaps |
| `yt-space-2` | 8px | Badge gaps, compact row gaps |
| `yt-space-3` | 12px | Subpanel padding, compact controls |
| `yt-space-4` | 16px | Standard panel padding, grid gap |
| `yt-space-5` | 20px | Larger inner spacing |
| `yt-space-6` | 24px | Page section spacing |
| `yt-space-8` | 32px | Page horizontal padding, major separation |
| `yt-space-10` | 40px | Bottom page padding / large page breaks |

**Standard values:**
- Page padding: 24–32px
- Grid gap: 16–18px
- Panel padding: 16px
- Panel header: 16px 16px 12px
- Table row padding: 10px 12px

### Standard Dashboard Grid

Desktop composition:

```text
KPI row:                 4 columns
Main intelligence row:   2fr / 1fr
Middle row:              1.4fr / 1fr
Lower row:               1.4fr / 1fr
```

Canonical dashboard modules:
1. Sidebar navigation
2. Topbar with niche selector, date filter, Generate Report button, user avatar
3. KPI row: Tracked Channels, New Uploads, Outliers Found, Credits Remaining
4. Recommended Topics Today
5. Top Recent Outliers
6. Topic Momentum chart
7. Competitor Blueprint Signals
8. Report Status

## Elevation & Depth

YTResearch should feel flat, serious, and fast. Shadows support panel separation; they should not create glossy marketing-card depth.

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No shadow; `1px solid var(--yt-border)` | Table rows, inputs, badges, internal dividers |
| 1 (soft) | `var(--yt-shadow-soft)` | KPI cards, compact cards |
| 2 (panel) | `var(--yt-shadow)` | Main dashboard panels |
| 3 (overlay) | Panel shadow plus stronger border | Drawers, dropdowns, command menus |

### Decorative Depth
- Avoid decorative blobs, bokeh, heavy gradients, glassmorphism, or floating illustrated cards.
- Product energy should come from dense structure, visible evidence, and responsive controls.
- Charts should be quiet and legible: teal primary series, blue secondary series, soft gridlines, no 3D effects.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---:|---|
| `--yt-radius-card` | 8px | KPI cards, outlier cards, compact cards |
| `--yt-radius-panel` | 8px | Dashboard panels, major modules |
| `--yt-radius-button` | 6px | Primary, secondary, icon buttons |
| `--yt-radius-input` | 6px | Inputs, selects, textareas |
| `--yt-radius-row` | 6px | Recommendation rows, table row affordances |
| `--yt-radius-pill` | 999px | Badges, score chips, signal chips, status pills |

```css
:root {
  --yt-radius-card: 8px;
  --yt-radius-panel: 8px;
  --yt-radius-button: 6px;
  --yt-radius-input: 6px;
  --yt-radius-row: 6px;
  --yt-radius-pill: 999px;
}
```

### Shape Principles
- Cards and panels stay restrained at 8px.
- Buttons and inputs use 6px for utilitarian SaaS sharpness.
- Pills are reserved for badges, chips, scores, and compact filters.
- Avoid 16–24px playful rounding unless a future surface has a clear reason.

## Components

> Use these component names and class prefixes directly. Do not create one-off panel/card/button styles when a primitive already exists.

### App Shell

**`.yt-sidebar`** — Persistent navigation rail.
- Background `--yt-navy`; width 240px desktop.
- Active nav item uses `rgba(255,255,255,0.10)`, white text, and `3px solid var(--yt-primary)` left border.
- Inactive nav item uses `#D1D5DB` text.

**`.yt-topbar`** — App-level controls bar.
- Height 64px; white surface; bottom hairline border.
- Contains niche selector, date filter, report generation action, credits indicator, and user avatar.

### Panels & Containers

**`.yt-panel`** — Default dashboard module.

```css
.yt-panel {
  background: var(--yt-surface);
  border: 1px solid var(--yt-border);
  border-radius: var(--yt-radius-panel);
  box-shadow: var(--yt-shadow);
}
```

Use for Recommended Topics Today, Top Recent Outliers, Topic Momentum, Competitor Blueprint Signals, Report Status, calendar summaries, admin tables, and report lists.

**`.yt-panel-head`** — Header row inside `.yt-panel`.

```css
.yt-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--yt-border);
}
```

**`.yt-subpanel`** — Small internal block inside a panel.
- Background `--yt-surface-muted`; border `1px solid var(--yt-border)`; radius `--yt-radius-card`; padding 12px.
- Use instead of nesting `.yt-panel` inside another `.yt-panel`.

### KPI Cards

**`.yt-kpi`** — Top-row KPI card.
- Used for Tracked Channels, New Uploads, Outliers Found, Credits Remaining.
- Minimum height 108px; padding 16px; white surface; border; 8px radius; soft shadow.
- No large illustrations or decorative icons. Small lucide icons are allowed when useful.

```html
<div className="yt-kpi">
  <div className="yt-kpi-label">Tracked Channels</div>
  <div className="yt-kpi-value">18/25</div>
  <div className="yt-kpi-note">7 slots available</div>
</div>
```

### Recommended Topics

**`.yt-rec-panel`** — Primary intelligence panel. This is the most important dashboard module.

**`.yt-rec-row`** — Recommendation row.
- Includes rank, opportunity score, topic title, suggested angle, evidence badges, and primary action.
- Must stay scan-friendly; do not turn rows into long essays.
- Evidence must be visible, not hidden behind a tooltip only.

```html
<div className="yt-rec-row">
  <div className="yt-rec-rank">01</div>
  <div className="yt-score">92</div>
  <div className="yt-rec-body">
    <h3>AI agents are moving from demos to daily business workflows</h3>
    <p>Show the exact 5-agent stack a solo creator can build this week.</p>
    <div className="yt-evidence-row">
      <span className="yt-badge">3 competitor outliers</span>
      <span className="yt-badge blue">news trend</span>
      <span className="yt-badge success">high brand fit</span>
    </div>
  </div>
  <button className="yt-btn yt-btn-primary">Create Outline</button>
</div>
```

**Score color rules:**
- 85–100: success
- 70–84: teal/blue
- 50–69: warning
- Below 50: muted

### Outlier Cards

**`.yt-outlier-card`** — Compact video intelligence card.
- Includes thumbnail, title, channel name, publish date/age, multiplier badge such as `6.4x`, and optional outlier score.
- Thumbnail ratio: `16 / 9`; radius 6px; neutral placeholder when no image exists.
- Use real thumbnails when available. Avoid real brand logos or real people in generated mockups.

**`.yt-multiplier-badge`** — Outlier multiplier indicator.
- Background `--yt-success-soft`; text `--yt-success`; subtle green border; pill radius; 12px / 800.

### Topic Momentum Charts

**`.yt-chart-panel`** — Quiet chart module.
- Use teal for primary series and blue for secondary series.
- Use soft gray gridlines.
- Avoid 3D effects, saturated rainbow palettes, and animated gimmicks.
- Axis labels should be readable at 12px.
- Tooltips should show topic, value, and date range.

Suggested topic categories:
- AI Agents
- No-code Automation
- LinkedIn AI
- AI Video
- Marketing Funnels

### Blueprint Signals

**`.yt-signal-chip`** — Compact competitor pattern chip.

```css
.yt-signal-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--yt-border);
  border-radius: var(--yt-radius-pill);
  background: var(--yt-surface-muted);
  color: var(--yt-text-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 9px;
}
```

Use chips for pattern recognition, not full explanations. Examples: Contrarian hooks, tutorial format, 3-step frameworks, face + bold text thumbnails, tool comparison videos, before/after transformation, founder story angle.

### Report Status

**`.yt-report-status`** — Operational report panel.
- Includes daily report enabled toggle, last run time, next run time, Generate Now, Export PDF, Export DOCX, and failure state if applicable.
- Daily jobs should not run by default without user intent.
- Export buttons use secondary button styling with icon + text.

### Buttons

**`.yt-btn-primary`** — Main action button.
- Background `--yt-primary`; text `--yt-text-inverse`; border `1px solid var(--yt-primary)`; radius `--yt-radius-button`; minimum height 38px; padding 8px 12px; font-weight 700.
- Use for Generate Report, Create Outline, Generate Script, Generate Image, Save to Calendar.

**`.yt-btn-primary-pressed`** — Active/pressed primary state.
- Background `--yt-primary-hover`; border-color `--yt-primary-hover`.

**`.yt-btn-secondary`** — Secondary action button.
- Background `--yt-surface`; text `--yt-primary`; border `1px solid var(--yt-primary)`.
- Use for Export PDF, Export DOCX, View Details, Add Source.

**`.yt-icon-btn`** — Square icon utility button.
- 36px × 36px; radius `--yt-radius-button`; white surface; `1px solid var(--yt-border)`.
- Use lucide icons where available.
- Icon-only buttons require accessible labels and tooltips.

### Inputs & Forms

**`.yt-input`** — Standard text input / select / textarea base.
- White background; border `1px solid var(--yt-border)`; radius `--yt-radius-input`; text `--yt-text`; min-height 38px; padding 9px 11px; font-size 14px.

**`.yt-input-focused`** — Focus state.
- Border color `--yt-primary`; focus ring `0 0 0 3px rgba(15, 118, 110, 0.12)`.

Use inputs for niche/date filters, brand voice, writing samples, competitor URLs, industry sources, report settings, segmented format controls, and numeric creative settings.

### Tables

**`.yt-table`** — Dense operational table.
- Used for competitors, videos, reports, admin jobs, AI usage, and credit transactions.
- Sticky header for long tables.
- Header text: 12px / 700.
- Row text: 13px.
- Row height: usually 44–52px.
- Numeric columns right-aligned; titles and names left-aligned.

**`.yt-table-head`**
- Background `#1F2937`; text white.

**`.yt-table-row-hover`**
- Background `#F9FAFB`.

### Badges & Statuses

**`.yt-badge`** — Default status/evidence badge.
- Background `--yt-surface-soft`; text `--yt-text-secondary`; border `1px solid var(--yt-border)`; pill radius; 11px / 700; padding 3px 7px.

Variants:
- `.success`: completed, high score, available
- `.warning`: pending, quota pressure, partial
- `.danger`: failed, overdue, billing issue
- `.blue`: news/source, active filter
- `.primary`: selected, brand accent
- `.muted`: archived, unavailable

### Content Calendar

**`.yt-calendar`** — Lightweight content planning surface.
- Statuses: Idea, Outline, Script, Thumbnail, Scheduled, Published, Archived.
- Calendar cards show content title, platform/type, status, scheduled date, and linked recommendation if available.
- Avoid turning v1 into a heavy project-management interface.

### Content Workspace

**`.yt-workspace`** — Two-column content production layout.

```text
Left: topic evidence, competitor signals, source links
Right: generated assets and editor
```

Tabs:
- Outline
- Hook
- Titles
- Caption
- Script
- Thumbnail
- LinkedIn

Rules:
- Outline generation appears before full script generation.
- Full script button must show credit cost.
- Evidence remains visible while generating.
- Generated content should be versioned.

### Visual Generation Studio

**`.yt-visual-studio`** — Asset generation workspace.

```text
Left: prompt, provider, aspect ratio, brand settings
Center: generated image preview
Right: saved variants and metadata
```

Asset types:
- YouTube thumbnail
- LinkedIn image
- LinkedIn carousel cover
- Quote card
- Diagram

Rules:
- Always generate visual strategy before image generation.
- Text overlays should be editable where possible.
- Store prompt, provider, model, cost, and image URL.
- YouTube thumbnail defaults to 16:9.
- LinkedIn image defaults should support square and 4:5.

### Empty, Loading, and Error States

**`.yt-empty-state`** — Concise operational empty state.
- Use short copy and one primary action.

Example:

```text
No competitors tracked yet.
Add your first YouTube channel to start finding outliers.
```

**`.yt-skeleton`** — Loading state.
- Use for KPI cards, recommendation rows, outlier cards, and tables.
- Avoid full-page spinners except during app bootstrap.

**`.yt-error-state`** — Recoverable error state.
- Errors must be specific and action-oriented.
- Examples: YouTube quota temporarily exhausted, transcript unavailable, report generation failed, image provider timeout, Stripe subscription inactive.

### AI Output Rendering

**`.yt-ai-output`** — Bounded generated content surface.
- AI-generated text may contain markdown.
- Use markdown-safe rendering for reports, scripts, outlines, and recommendations.
- Preserve headings, lists, code blocks, and links.
- Keep long generated content inside bounded panels with scroll.

## Do's and Don'ts

### Do
- Use `--yt-primary` as the main workflow action color and active navigation accent.
- Keep app surfaces compact, dense, and evidence-forward.
- Use `.yt-panel`, `.yt-kpi`, `.yt-rec-row`, `.yt-outlier-card`, `.yt-badge`, `.yt-btn`, and `.yt-table` before inventing new styles.
- Make recommendation evidence visible in the row itself.
- Use teal and blue as the primary chart palette, with soft gray gridlines.
- Use subtle shadows only to separate panels from the page canvas.
- Keep controls practical: clear labels, visible focus states, explicit actions.
- Use horizontal scroll or card-row conversions for dense tables on mobile.

### Don't
- Don't build marketing landing-page layouts inside the app.
- Don't use oversized hero sections, decorative blobs, or bokeh.
- Don't introduce heavy purple gradients or make purple a main brand color.
- Don't use cartoon imagery or playful illustration styles.
- Don't over-round cards; stay at 8px for panels/cards and 6px for inputs/buttons.
- Don't hide recommendation rationale only inside a tooltip.
- Don't use random stock images or generated people for video thumbnails.
- Don't render AI markdown as a raw paragraph when structure is expected.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---:|---|
| Mobile | `< 700px` | Sidebar becomes drawer; compact topbar; one-column panels; recommendation actions move below text |
| Small Tablet | `700–899px` | One-column content; KPI cards can stay 2-up if space allows; tables use horizontal scroll/card rows |
| Tablet | `900–1199px` | Two-column layout; KPI row usually 2-up; workspace columns may stack depending content density |
| Desktop | `≥ 1200px` | Full dashboard layout; 4-up KPI row; 2-column intelligence rows; fixed/sticky 240px sidebar |

### Touch Targets
- Buttons should reach at least 38px height on desktop and 44px on mobile.
- Icon buttons: 36×36px desktop → 44×44px mobile.
- Inputs: 38px desktop → 44px mobile.
- Recommendation row actions can move below the row body on mobile.

### Collapsing Strategy
- Sidebar: persistent desktop → drawer below 700px.
- Topbar: filters can collapse into compact controls below 700px.
- KPI row: 4-up desktop → 2-up tablet → 1-up or 2-up mobile depending available width.
- Dashboard panels: full composition desktop → two-column tablet → one-column mobile.
- Tables: never squeeze; use horizontal scroll or card-row transformation.
- Content workspace: two columns desktop → stacked sections on smaller screens.
- Visual studio: left/center/right desktop → stacked prompt, preview, variants on mobile.

## Accessibility

Minimum requirements:
- All buttons have accessible labels.
- Icon-only buttons require tooltips and `aria-label`.
- Color must not be the only status indicator.
- Focus states must be visible.
- Tables need clear headers.
- Charts need text summaries or accessible labels.
- Inputs need labels, not placeholders only.
- Report failures and quota issues must include recoverable next steps.

## Implementation Notes

Recommended file structure:

```text
app/globals.css
components/app-shell/
components/dashboard/
components/recommendations/
components/outliers/
components/reports/
components/content-workspace/
components/visual-studio/
components/ui/
```

Recommended class prefixes:

```text
yt-page
yt-sidebar
yt-topbar
yt-panel
yt-kpi
yt-rec-row
yt-outlier-card
yt-score
yt-badge
yt-btn
yt-table
yt-calendar
yt-workspace
yt-visual-studio
```

When using Tailwind, map these primitives into reusable components. Do not repeatedly hand-code arbitrary card styles per page.

## Iteration Guide

1. Start from the canonical dashboard composition before designing a new surface.
2. Reuse component names and tokens directly (`--yt-primary`, `.yt-panel`, `.yt-rec-row`, `.yt-btn-primary`) instead of paraphrasing.
3. Add variants as explicit component states (`-pressed`, `-focused`, `.success`, `.warning`, `.danger`, `.blue`, `.primary`, `.muted`).
4. Keep recommendation rows compact: title, angle, evidence, action.
5. Use subpanels inside panels instead of nesting panels.
6. Keep charts quiet: teal/blue series, gray gridlines, readable 12px labels.
7. Test mobile tables early; never compress operational data until it becomes unreadable.
8. Confirm AI output uses markdown-safe rendering before shipping reports, scripts, or outlines.

## Known Gaps

- Dark mode is not defined yet; current system is explicitly light-mode with a navy sidebar.
- Animation timing exists as tokens, but full interaction specs are not yet documented beyond subtle transitions.
- Detailed chart component specs need to be formalized once the analytics library is chosen.
- Thumbnail generation rules need stronger governance if real thumbnails, AI-generated placeholders, and saved variants coexist.
- Admin, billing, and account settings pages may need additional table/status variants after implementation.
- A full component inventory should be added once the first dashboard build is complete.
