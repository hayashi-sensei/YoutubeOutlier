import { addCompetitorChannel } from "@/actions/competitors";

type CompetitorChannelFormProps = {
  activeCount: number;
  maxTrackedChannels: number;
};

const inputClass =
  "yt-input w-full disabled:bg-[var(--yt-surface-soft)] disabled:text-[var(--yt-text-faint)]";

export function CompetitorChannelForm({ activeCount, maxTrackedChannels }: CompetitorChannelFormProps) {
  const isAtLimit = activeCount >= maxTrackedChannels;
  const availableSlots = Math.max(maxTrackedChannels - activeCount, 0);

  return (
    <section className="yt-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="yt-panel-title">Add Competitor</h2>
          <p className="yt-panel-note">
            Tracking {activeCount} of {maxTrackedChannels} channels
          </p>
        </div>
        <span className="yt-badge">
          {availableSlots} slots open
        </span>
      </div>

      <form action={addCompetitorChannel} className="mt-4 grid gap-3" aria-describedby="competitor-limit-note">
        <fieldset className="grid gap-3" disabled={isAtLimit}>
          <label className="grid gap-1.5 text-sm font-semibold text-[var(--yt-text-secondary)]">
            YouTube channel URL
            <input
              className={inputClass}
              name="channelUrl"
              placeholder="https://www.youtube.com/@channel"
              required
              type="url"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-[var(--yt-text-secondary)]">
            Nickname
            <input className={inputClass} name="nickname" placeholder="Optional internal label" type="text" />
          </label>
          <button
            className="yt-btn yt-btn-primary disabled:border-[var(--yt-border)] disabled:bg-[var(--yt-surface-soft)] disabled:text-[var(--yt-text-faint)]"
            disabled={isAtLimit}
            type="submit"
          >
            Add channel
          </button>
        </fieldset>
      </form>

      <p className="mt-3 text-xs text-[var(--yt-text-muted)]" id="competitor-limit-note">
        {isAtLimit
          ? "Your current plan has reached its active competitor channel limit."
          : "Add handles, channel IDs, custom URLs, or legacy user URLs."}
      </p>
    </section>
  );
}
