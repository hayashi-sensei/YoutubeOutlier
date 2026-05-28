# Spec 013A: UX Consolidation Before Content Production

## Goal

Clean up the product UX and account model before implementing Spec 014 onwards, so the app feels like a coherent research operating system rather than separate feature pages.

## Product Model

- One email account can own multiple research workspaces.
- Workspaces are separate research accounts with their own niche, audience, settings, competitors, industry sources, reports, topic ideas, outliers, and competitor blueprints.
- Calendar and credits are shared within the email account.
- Pro users can create up to 5 total workspaces by default.
- Maximum workspace count must be configurable from Admin plan limits.
- Changing workspace in the app shell changes the active research context everywhere except account-level billing/credits and the shared calendar view.

## Scope

- Workspace switcher and workspace creation UX.
- Admin plan limit support for maximum workspaces.
- Settings UX for workspace-specific market profile and account-level billing/credits clarity.
- Competitors dashboard upgrade from channel list to per-channel intelligence workspace.
- Per-channel competitor detail view.
- Topic Ideas "Try New Things" section for more experimental topic generation.
- Documentation alignment for account-level credits, workspace-scoped research, and lightweight recommendation evidence.

## Requirements

### Workspaces

- Users can see and switch between their workspaces from the app shell.
- Users can create a workspace until their plan's `maxWorkspaces` limit is reached.
- Workspace creation collects at minimum name, primary niche, and target audience.
- Workspace-specific pages must use the selected workspace context.
- Settings must make clear which fields are workspace-specific.
- Billing and credit indicators must make clear that credits are account-level, not workspace-specific.

### Competitor Intelligence

- The Competitors page should remain the place to add, archive, restore, and refresh tracked channels.
- Each active competitor channel should also open into a channel intelligence view.
- The channel intelligence view should show:
  - channel identity and cached metadata;
  - baseline channel views and core stats;
  - ingestion and analysis freshness;
  - top outlier videos for that channel;
  - the current competitor blueprint;
  - previous blueprint/report generation state where available;
  - a button to regenerate that channel's blueprint/report;
  - a button to suggest topics for that specific channel.
- Per-channel reports and blueprints should update on regeneration rather than replacing the user's ability to inspect the current result.

### Topic Ideas

- The main Topic Ideas dashboard continues to generate evidence-backed recommendations from all active competitor outliers, industry source items, workspace settings, blueprint signals, calendar history, and prior recommendation history.
- Channel-specific suggestions generated from a competitor intelligence page should stay attached to that tracked channel and should not appear in the global Topic Ideas dashboard.
- Add a "Try New Things" section that generates 5 more experimental ideas on button click.
- "Try New Things" ideas should still use evidence, but the prompt should favor novel formats, contrarian angles, emerging patterns, and content experiments over safe repeats.
- Experimental ideas should be visibly distinct from standard recommendations.

### Lightweight Recommendation Evidence

- Topic recommendation prompts should use lightweight research signals by default:
  - video titles;
  - channel titles;
  - opportunity and outlier scores;
  - multipliers;
  - compact video analysis fields;
  - competitor blueprint summaries;
  - source item headlines and short summaries;
  - recent calendar and recommendation history.
- Full transcripts and long video descriptions should not be sent to the topic recommendation prompt unless a future deep-research action explicitly requests that behavior.
- YouTube Data API does not provide a clean topic summary field, so YTResearch owns the video understanding layer through metadata analysis, transcript analysis when available, and blueprint aggregation.

## Acceptance Criteria

- A user can create and switch between up to the plan-configured number of workspaces.
- Pro defaults to 5 total workspaces.
- Research data remains scoped to the selected workspace.
- Credits and billing are presented as shared account-level resources.
- Competitors dashboard gives users a clear path from tracked channel to per-channel outlier report, blueprint, stats, and channel-specific topic suggestions.
- Topic Ideas includes a "Try New Things" action that creates 5 experimental recommendations distinct from standard recommendations.
- Specs and schema notes reflect the workspace/credit split before Spec 014 implementation begins.
