# Razorpay

[...existing content...]

## Gemini API Integration

To use the Gemini API, add `GEMINI_API_KEY` to `.env.local` with an **auth key** from Google AI Studio (aistudio.google.com). New keys from AI Studio are "auth" keys bound to a service account — standard "AIza" keys are deprecated and stop working entirely in September 2026. The key must either be an auth key (starting with `AQ.`) or a standard key explicitly restricted to "Gemini API only" in the Google Cloud console. The env var name is `GEMINI_API_KEY`. Do not hardcode the key or expose it to client components — the server-only client in `lib/gemini.ts` reads it at runtime and will fail loudly if missing or set to a placeholder value.