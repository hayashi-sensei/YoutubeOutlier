# Spec 013: AI Model Router

## Goal

Centralize all LLM and image model selection, execution, logging, and cost attribution.

## Scope

- Vercel AI SDK integration
- AI Gateway model calls
- Structured output with schemas
- Provider routing
- Image provider routing
- AI generation logging
- Credit deduction integration

## Text Providers

- OpenAI primary
- Claude Sonnet for premium writing
- Gemini Flash/Flash-Lite class model for bulk analysis

## Image Providers

- fal.ai/Flux
- OpenAI image generation
- Nano Banana
- Gemini image model

## Requirements

- Every AI task uses a task type.
- Every AI generation logs provider, model, input size, output size, cost estimate, user ID, workspace ID, and credit charge.
- Provider can be swapped without changing product features.
- Structured outputs use schemas.

## Acceptance Criteria

- Topic recommendation, outline, and script tasks run through router.
- Image generation runs through image router.
- Costs and credits are recorded.

