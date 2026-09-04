// SERVER-ONLY: Do not import this file from client components
import 'server-only';

import { GoogleGenAI } from '@google/genai';

// Validate API key on module load
if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    'GEMINI_API_KEY is not set. ' +
    'Get an auth key from https://aistudio.google.com/app/apikey ' +
    'and add it to .env.local'
  );
}

if (process.env.GEMINI_API_KEY === 'REPLACE_ME' || process.env.GEMINI_API_KEY === 'YOUR_NEW_API_KEY_HERE') {
  throw new Error(
    'GEMINI_API_KEY is set to a placeholder value. ' +
    'Replace it with a real auth key from https://aistudio.google.com/app/apikey'
  );
}

// Singleton client instance
let client: GoogleGenAI | null = null;

/**
 * Get the singleton GoogleGenAI client.
 * Uses the GEMINI_API_KEY environment variable.
 *
 * Auth keys (AQ.* prefix) are the current standard from Google AI Studio.
 * Standard keys (AIza* prefix) are deprecated and stop working September 2026.
 */
export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
    });
  }
  return client;
}

/**
 * Model names for different use cases (September 2026):
 * - gemini-3.6-pro: Best quality, higher latency
 * - gemini-3.6-flash: Faster, lower cost, good quality
 */
export const MODELS = {
  PRO: 'gemini-3.6-pro',
  FLASH: 'gemini-3.6-flash',
} as const;
