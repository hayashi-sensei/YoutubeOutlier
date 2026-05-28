"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

export type ActiveChannelSearchItem = {
  id: string;
  name: string;
  title: string;
  handle: string | null;
  youtubeChannelId: string;
  subscriberLabel: string;
  videoCount: number;
  score: number | null;
};

type ActiveChannelSmartSearchProps = {
  initialQuery: string;
  searchParam: string;
  pageParam: string;
  suggestions: ActiveChannelSearchItem[];
};

const MAX_SUGGESTIONS = 8;

export function ActiveChannelSmartSearch({
  initialQuery,
  searchParam,
  pageParam,
  suggestions,
}: ActiveChannelSmartSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const matches = useMemo(() => rankSuggestions(suggestions, query), [suggestions, query]);
  const visibleMatches = matches.slice(0, MAX_SUGGESTIONS);
  const hasQuery = query.trim().length > 0;

  function submitQuery(nextQuery: string) {
    setQuery(nextQuery);
    setIsOpen(false);
    window.location.href = competitorsHref({
      searchParam,
      pageParam,
      query: nextQuery,
    });
  }

  return (
    <div className="relative">
      <form action="/app/competitors" className="flex flex-col gap-2 sm:flex-row sm:items-center" ref={formRef}>
        <label className="sr-only" htmlFor="active-channel-search">
          Search active channels
        </label>
        <div className="relative min-w-0 flex-1">
          <input name={pageParam} type="hidden" value="1" />
          <input
            aria-activedescendant={isOpen && visibleMatches[activeIndex] ? `active-channel-option-${visibleMatches[activeIndex].id}` : undefined}
            aria-autocomplete="list"
            aria-controls="active-channel-search-results"
            aria-expanded={isOpen}
            autoComplete="off"
            className="w-full rounded-[var(--yt-radius-input)] border border-[var(--yt-border)] bg-white px-3 py-2 text-sm text-[var(--yt-text)]"
            id="active-channel-search"
            name={searchParam}
            onBlur={() => {
              window.setTimeout(() => setIsOpen(false), 120);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIsOpen(true);
                setActiveIndex((index) => Math.min(index + 1, Math.max(visibleMatches.length - 1, 0)));
                return;
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
                return;
              }

              if (event.key === "Enter" && isOpen && visibleMatches[activeIndex]) {
                event.preventDefault();
                submitQuery(visibleMatches[activeIndex].name);
                return;
              }

              if (event.key === "Escape") {
                setIsOpen(false);
              }
            }}
            placeholder="Search active channels"
            role="combobox"
            type="search"
            value={query}
          />
          {isOpen ? (
            <div
              className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white shadow-[var(--yt-shadow-soft)]"
              id="active-channel-search-results"
              role="listbox"
            >
              {visibleMatches.length > 0 ? (
                visibleMatches.map((match, index) => (
                  <button
                    className={`grid w-full gap-1 px-3 py-2 text-left text-sm hover:bg-[var(--yt-surface-muted)] ${
                      index === activeIndex ? "bg-[var(--yt-primary-soft)]" : "bg-white"
                    }`}
                    id={`active-channel-option-${match.id}`}
                    key={match.id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      submitQuery(match.name);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-[var(--yt-text)]">{match.name}</span>
                      {match.score !== null ? (
                        <span className="rounded-[var(--yt-radius-pill)] bg-[var(--yt-success-soft)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--yt-success)]">
                          Score {match.score.toFixed(0)}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[var(--yt-text-muted)]">
                      <span>{match.handle ?? match.youtubeChannelId}</span>
                      <span>{match.subscriberLabel}</span>
                      <span>{match.videoCount} videos cached</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-[var(--yt-text-muted)]">No active channels match that search.</p>
              )}
            </div>
          ) : null}
        </div>
        <button
          className="rounded-[var(--yt-radius-button)] border border-[var(--yt-primary)] bg-white px-3 py-2 text-sm font-bold text-[var(--yt-primary)]"
          type="submit"
        >
          Search
        </button>
        {hasQuery ? (
          <Link
            className="rounded-[var(--yt-radius-button)] border border-[var(--yt-border)] bg-white px-3 py-2 text-center text-sm font-bold text-[var(--yt-text-secondary)]"
            href="/app/competitors"
          >
            Clear
          </Link>
        ) : null}
      </form>
    </div>
  );
}

function rankSuggestions(items: ActiveChannelSearchItem[], query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [...items]
      .sort((left, right) => (right.score ?? -1) - (left.score ?? -1) || left.name.localeCompare(right.name))
      .slice(0, MAX_SUGGESTIONS);
  }

  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  return items
    .map((item) => ({
      item,
      rank: rankItem(item, normalizedQuery, queryTerms),
    }))
    .filter((entry) => entry.rank > 0)
    .sort((left, right) => right.rank - left.rank || left.item.name.localeCompare(right.item.name))
    .map((entry) => entry.item);
}

function rankItem(item: ActiveChannelSearchItem, normalizedQuery: string, queryTerms: string[]) {
  const fields = [
    { value: item.name, weight: 120 },
    { value: item.title, weight: 100 },
    { value: item.handle ?? "", weight: 90 },
    { value: item.youtubeChannelId, weight: 70 },
  ];
  let rank = 0;

  for (const field of fields) {
    const value = normalize(field.value);
    if (!value) {
      continue;
    }

    if (value === normalizedQuery) {
      rank += field.weight + 100;
    } else if (value.startsWith(normalizedQuery)) {
      rank += field.weight + 60;
    } else if (value.includes(normalizedQuery)) {
      rank += field.weight + 25;
    }

    rank += queryTerms.filter((term) => value.includes(term)).length * 8;
  }

  return rank + (item.score ?? 0) / 100;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/^@/u, "").replace(/[^a-z0-9]+/gu, " ").trim();
}

function competitorsHref(input: { searchParam: string; pageParam: string; query: string }) {
  const params = new URLSearchParams();
  const query = input.query.trim();
  if (query) {
    params.set(input.searchParam, query);
    params.set(input.pageParam, "1");
  }

  const search = params.toString();
  return search ? `/app/competitors?${search}` : "/app/competitors";
}
