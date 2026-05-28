import { redirect } from "next/navigation";
import { generateVisualImage, generateVisualStrategy } from "@/actions/visual-studio";
import { getAiTaskConfig } from "@/lib/ai/task-config";
import { bootstrapUserWorkspace } from "@/lib/auth/bootstrap";
import { getPrismaClient } from "@/lib/db/prisma";
import { AiOperationSubmit } from "@/components/shared/ai-operation-submit";
import { createClient } from "@/lib/supabase/server";
import { visualStrategySchema, type VisualOverlay, type VisualStrategy } from "@/schemas/visual-generation";
import { AI_TASK_TYPES, type AiQualityTier } from "@/types/ai";

const ASSET_TYPES = [
  { value: "YOUTUBE_THUMBNAIL", label: "YouTube thumbnail", ratio: "16:9" },
  { value: "LINKEDIN_IMAGE", label: "LinkedIn post image", ratio: "4:5" },
  { value: "LINKEDIN_CAROUSEL_COVER", label: "LinkedIn carousel cover", ratio: "1:1" },
  { value: "QUOTE_CARD", label: "Branded quote card", ratio: "1:1" },
  { value: "DIAGRAM", label: "Diagram image", ratio: "16:9" },
] as const;

const QUALITY_ROUTES: Array<{ value: AiQualityTier; label: string; note: string }> = [
  { value: "standard", label: "OpenAI", note: "Default production route" },
  { value: "bulk", label: "Google Imagen", note: "Lower-cost draft route" },
  { value: "premium", label: "Flux / PiAPI", note: "Premium visual route" },
];

function redirectTo(url: string): never {
  redirect(url as never);
}

export default async function VisualStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ contentItemId?: string; strategy?: string; error?: string; generated?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) {
    redirectTo("/sign-in");
  }

  const { workspaceId } = await bootstrapUserWorkspace(supabaseUser);
  const prisma = getPrismaClient();
  const [contentItems, assets, selectedContentItem] = await Promise.all([
    prisma.contentItem.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 24,
      select: { id: true, title: true, status: true, sourceType: true },
    }),
    prisma.visualAsset.findMany({
      where: { workspaceId, ...(query.contentItemId ? { contentItemId: query.contentItemId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 18,
      select: {
        id: true,
        contentItemId: true,
        assetType: true,
        provider: true,
        model: true,
        aspectRatio: true,
        prompt: true,
        visualStrategy: true,
        editableOverlays: true,
        imageUrl: true,
        storagePath: true,
        width: true,
        height: true,
        costUsd: true,
        createdAt: true,
        contentItem: { select: { title: true } },
      },
    }),
    query.contentItemId
      ? prisma.contentItem.findFirst({
          where: { id: query.contentItemId, workspaceId },
          select: { id: true, title: true, status: true, sourceType: true },
        })
      : Promise.resolve(null),
  ]);
  const selectedStrategy = assets.find((asset) => asset.id === query.strategy && !asset.imageUrl) ?? assets.find((asset) => !asset.imageUrl) ?? null;
  const imageAssets = assets.filter((asset) => asset.imageUrl);
  const strategyAssets = assets.filter((asset) => !asset.imageUrl);

  return (
    <main className="yt-page yt-visual-studio grid gap-5 xl:grid-cols-[0.8fr_1.2fr_0.85fr]">
      <section className="space-y-5">
        <div>
          <h1 className="yt-page-title">Visual Studio</h1>
          <p className="yt-page-subtitle">
            Generate visual strategy first, keep overlay text editable, then create image variants tied to content items.
          </p>
        </div>

        <StatusNotice error={query.error} generated={query.generated} />

        <section className="yt-panel p-4">
          <h2 className="yt-panel-title">Visual Brief</h2>
          <form action={generateVisualStrategy} className="mt-4 space-y-4">
            <label className="block text-sm font-bold">
              Content item
              <select
                className="yt-input mt-1 w-full"
                defaultValue={selectedContentItem?.id ?? ""}
                name="contentItemId"
              >
                <option value="">Standalone visual</option>
                {selectedContentItem && !contentItems.some((item) => item.id === selectedContentItem.id) ? (
                  <option value={selectedContentItem.id}>{selectedContentItem.title}</option>
                ) : null}
                {contentItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-bold">
              Asset type
              <select
                className="yt-input mt-1 w-full"
                name="assetType"
              >
                {ASSET_TYPES.map((assetType) => (
                  <option key={assetType.value} value={assetType.value}>
                    {assetType.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-bold">
              Aspect ratio
              <select
                className="yt-input mt-1 w-full"
                name="aspectRatio"
              >
                <option value="16:9">16:9 thumbnail</option>
                <option value="4:5">4:5 LinkedIn feed</option>
                <option value="1:1">1:1 square</option>
              </select>
            </label>

            <label className="block text-sm font-bold">
              Creative direction
              <textarea
                className="yt-input mt-1 min-h-28 w-full font-normal leading-6"
                name="brief"
                placeholder="Optional: describe the visual angle, proof point, diagram structure, or quote focus."
              />
            </label>

            <AiOperationSubmit
              className="yt-btn yt-btn-primary w-full"
              label="Generate Strategy"
              overlayLabel="Generating visual strategy..."
            />
          </form>
        </section>

        {selectedContentItem ? (
          <a
            className="yt-panel block p-3 text-sm font-bold text-[var(--yt-primary)]"
            href={`/app/content-studio/${selectedContentItem.id}`}
          >
            Back to {selectedContentItem.title}
          </a>
        ) : null}
      </section>

      <section className="space-y-5">
        <section className="yt-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="yt-panel-title">Strategy And Prompt</h2>
              <p className="yt-panel-note">
                Image generation uses this strategy and excludes baked-in text.
              </p>
            </div>
            {selectedStrategy ? (
              <span className="yt-badge">
                {selectedStrategy.assetType.replaceAll("_", " ")}
              </span>
            ) : null}
          </div>

          {selectedStrategy ? (
            <StrategyPanel asset={selectedStrategy} />
          ) : (
            <p className="yt-empty-state mt-4 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)]">
              No visual strategy yet. Generate one from a content item or standalone brief to unlock image generation.
            </p>
          )}
        </section>

        {selectedStrategy ? (
          <section className="yt-panel p-4">
            <h2 className="yt-panel-title">Generate Image Variant</h2>
            <form action={generateVisualImage} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <input name="strategyAssetId" type="hidden" value={selectedStrategy.id} />
              <label className="block text-sm font-bold">
                Provider route
                <select
                  className="yt-input mt-1 w-full"
                  name="qualityTier"
                >
                  {QUALITY_ROUTES.map((route) => {
                    const config = getAiTaskConfig(AI_TASK_TYPES.imageGeneration, route.value);
                    return (
                      <option key={route.value} value={route.value}>
                        {route.label} · {config.credits} credits
                      </option>
                    );
                  })}
                </select>
              </label>
              <AiOperationSubmit
                className="yt-btn yt-btn-primary"
                label="Generate Image"
                overlayLabel="Generating image variant..."
              />
            </form>
            <div className="mt-3 grid gap-2 text-xs text-[var(--yt-text-muted)] md:grid-cols-3">
              {QUALITY_ROUTES.map((route) => (
                <p className="rounded-[var(--yt-radius-card)] bg-[var(--yt-surface-muted)] p-2" key={route.value}>
                  <span className="font-bold text-[var(--yt-text-secondary)]">{route.label}</span>
                  <br />
                  {route.note}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        <section className="yt-panel p-4">
          <h2 className="yt-panel-title">Preview</h2>
          {imageAssets[0]?.imageUrl ? (
            <VisualPreview asset={imageAssets[0]} />
          ) : (
            <div className="mt-4 grid min-h-[320px] place-items-center rounded-[var(--yt-radius-card)] border border-dashed border-[var(--yt-border)] bg-[var(--yt-surface-muted)] text-sm font-semibold text-[var(--yt-text-muted)]">
              Generated image preview appears here.
            </div>
          )}
        </section>
      </section>

      <section className="space-y-5">
        <section className="yt-panel p-4">
          <h2 className="yt-panel-title">Saved Variants</h2>
          {imageAssets.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--yt-text-muted)]">No image variants saved yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {imageAssets.map((asset) => (
                <article className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 text-sm" key={asset.id}>
                  {asset.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" className="aspect-video w-full rounded-[var(--yt-radius-card)] object-cover" src={asset.imageUrl} />
                  ) : null}
                  <p className="mt-2 font-bold">{asset.contentItem?.title ?? asset.assetType.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                    {asset.provider} · {asset.model ?? "default"} · {asset.aspectRatio} · {formatDateTime(asset.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--yt-text-muted)]">{asset.storagePath ?? "Stored in database preview"}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="yt-panel p-4">
          <h2 className="yt-panel-title">Strategy History</h2>
          {strategyAssets.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--yt-text-muted)]">No concepts generated yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {strategyAssets.map((asset) => (
                <a
                  className="block rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3 text-sm hover:border-[var(--yt-border-strong)]"
                  href={`/app/visual-studio?strategy=${asset.id}${asset.contentItemId ? `&contentItemId=${asset.contentItemId}` : ""}`}
                  key={asset.id}
                >
                  <p className="font-bold">{strategyTitle(asset.visualStrategy) ?? asset.assetType.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--yt-text-muted)]">{formatDateTime(asset.createdAt)}</p>
                </a>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function StrategyPanel({
  asset,
}: {
  asset: {
    prompt: string;
    visualStrategy: unknown;
    editableOverlays: unknown;
    aspectRatio: string;
    width: number | null;
    height: number | null;
  };
}) {
  const parsed = visualStrategySchema.safeParse(asset.visualStrategy);
  if (!parsed.success) {
    return (
      <p className="mt-4 rounded-[var(--yt-radius-card)] border border-[var(--yt-danger-soft)] bg-[var(--yt-danger-soft)] p-3 text-sm font-semibold text-[var(--yt-danger)]">
        This strategy could not be parsed. Generate a new strategy before creating an image.
      </p>
    );
  }
  const strategy = parsed.data;

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3">
        <h3 className="text-sm font-bold">{strategy.conceptTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--yt-text-secondary)]">{strategy.objective}</p>
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <Meta label="Aspect" value={`${asset.aspectRatio} · ${asset.width ?? "?"}x${asset.height ?? "?"}`} />
          <Meta label="Focal point" value={strategy.focalPoint} />
          <Meta label="Composition" value={strategy.composition} />
          <Meta label="Style" value={strategy.styleDirection} />
        </dl>
      </div>

      <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3">
        <h3 className="text-sm font-bold">Editable Overlays</h3>
        <div className="mt-3 grid gap-2">
          {strategy.editableOverlays.map((overlay) => (
            <OverlayRow key={overlay.id} overlay={overlay} />
          ))}
        </div>
      </div>

      <div className="rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] p-3">
        <h3 className="text-sm font-bold">Image Prompt</h3>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--yt-text-secondary)]">{asset.prompt}</p>
        <p className="mt-3 text-xs font-semibold text-[var(--yt-text-muted)]">{strategy.providerNotes}</p>
      </div>
    </div>
  );
}

function VisualPreview({
  asset,
}: {
  asset: {
    imageUrl: string | null;
    aspectRatio: string;
    editableOverlays: unknown;
    provider: string;
    model: string | null;
    costUsd: unknown;
  };
}) {
  const overlays = Array.isArray(asset.editableOverlays)
    ? asset.editableOverlays.filter((item): item is VisualOverlay => Boolean(item) && typeof item === "object" && "text" in item)
    : [];
  const aspectClass = asset.aspectRatio === "4:5" ? "aspect-[4/5]" : asset.aspectRatio === "1:1" ? "aspect-square" : "aspect-video";

  return (
    <div className="mt-4">
      <div className={`relative overflow-hidden rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-[var(--yt-surface-muted)] ${aspectClass}`}>
        {asset.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="absolute inset-0 h-full w-full object-cover" src={asset.imageUrl} />
        ) : null}
        {overlays.map((overlay) => (
          <div
            className="absolute rounded-[var(--yt-radius-button)] bg-black/45 px-2 py-1 text-xs font-black leading-tight text-white shadow-[var(--yt-shadow-soft)]"
            key={overlay.id}
            style={{
              left: `${overlay.x}%`,
              top: `${overlay.y}%`,
              width: `${overlay.width}%`,
              minHeight: `${overlay.height}%`,
              color: overlay.color,
            }}
          >
            {overlay.text}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold text-[var(--yt-text-muted)]">
        {asset.provider} · {asset.model ?? "default"} · {asset.costUsd ? `$${Number(asset.costUsd).toFixed(4)}` : "$0.0000"}
      </p>
    </div>
  );
}

function OverlayRow({ overlay }: { overlay: VisualOverlay }) {
  return (
    <div className="grid gap-2 rounded-[var(--yt-radius-card)] bg-white p-2 text-xs md:grid-cols-[1fr_auto]">
      <div>
        <p className="font-bold text-[var(--yt-text)]">{overlay.text}</p>
        <p className="mt-1 text-[var(--yt-text-muted)]">{overlay.role}</p>
      </div>
      <p className="font-semibold text-[var(--yt-text-muted)]">
        x{overlay.x} y{overlay.y} · {overlay.width}x{overlay.height}
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.04em] text-[var(--yt-text-muted)]">{label}</dt>
      <dd className="mt-1 leading-5 text-[var(--yt-text-secondary)]">{value}</dd>
    </div>
  );
}

function StatusNotice({ error, generated }: { error?: string; generated?: string }) {
  if (error) {
    return (
      <p className="rounded-[var(--yt-radius-card)] border border-[var(--yt-danger-soft)] bg-[var(--yt-danger-soft)] p-3 text-sm font-semibold text-[var(--yt-danger)]">
        {error.replaceAll("_", " ")}
      </p>
    );
  }
  if (generated) {
    return (
      <p className="rounded-[var(--yt-radius-card)] border border-[var(--yt-success-soft)] bg-[var(--yt-success-soft)] p-3 text-sm font-semibold text-[var(--yt-success)]">
        {generated.replaceAll("_", " ")} saved.
      </p>
    );
  }
  return null;
}

function strategyTitle(value: unknown): string | null {
  const parsed = visualStrategySchema.safeParse(value);
  return parsed.success ? parsed.data.conceptTitle : null;
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
