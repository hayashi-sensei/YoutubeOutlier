# Spec 019: Daily And Manual Reports

## Goal

Generate research reports from competitor, news, and recommendation data.

## Scope

- Manual report generation
- Optional daily reports
- Report storage
- Report dashboard
- Report sections
- Per-channel competitor intelligence reports

## Requirements

- Daily reports run only for users with daily reports enabled.
- Manual generation is available with credit charge.
- Reports summarize fresh competitor uploads and industry source items from the last 24 hours.
- Reports cite competitor and news evidence where present.
- Topic recommendations are generated separately from Topic Ideas and are not required in daily/manual report output.
- Reports can be exported.
- A tracked competitor channel can have its own inspectable report/blueprint summary that can be regenerated from the competitor intelligence page.
- Workspace reports aggregate across the selected workspace's competitors and industry sources.

## Acceptance Criteria

- User can click Generate Report.
- User can enable/disable daily reports.
- Report is stored and visible in dashboard.
- User can inspect channel-specific intelligence from the Competitors dashboard.
