# Spec 014: Content Workspace

## Goal

Create the workspace where users turn recommendations into content assets.

## Scope

- Selected topic page
- Outline generation
- Hook generation
- Title generation
- Caption generation
- Description generation
- Save/version assets

## Requirements

- Workspace is grounded in one recommendation or manual topic.
- Workspace can also be grounded in a channel-specific topic suggestion from a competitor intelligence page.
- AI outputs are saved as content assets.
- User can regenerate sections.
- Full script generation is separate from outline generation.
- Evidence panel preserves the source workspace, recommendation, channel, outlier, blueprint, and industry-source context used to create the content item.

## Acceptance Criteria

- User can open a recommendation and generate an outline.
- User can open a channel-specific topic suggestion and generate an outline.
- User can save titles, hooks, captions, and descriptions.
- Outputs are associated with calendar item when saved.
