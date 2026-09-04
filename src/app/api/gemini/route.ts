import { NextRequest, NextResponse } from 'next/server';
import { getGeminiClient, MODELS } from '@/lib/gemini';

// Request body shape
interface GeminiRequest {
  prompt: string;
  model?: 'pro' | 'flash';
  structured?: boolean; // If true, expect JSON response
}

// Response shape
interface GeminiResponse {
  text: string;
  data?: unknown; // Parsed JSON if structured=true
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: GeminiRequest = await request.json();

    if (!body.prompt || typeof body.prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "prompt" field' },
        { status: 400 }
      );
    }

    // Select model
    const modelName = body.model === 'pro' ? MODELS.PRO : MODELS.FLASH;

    // Get client and generate content
    const client = getGeminiClient();

    console.log(`[Gemini API] Generating content with ${modelName}...`);

    const result = await client.models.generateContent({
      model: modelName,
      contents: body.prompt,
    });

    const text = result.text || '';

    // If structured output requested, try to parse JSON
    let data: unknown = undefined;
    if (body.structured) {
      try {
        // Strip markdown fences if present
        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        data = JSON.parse(cleaned);
      } catch (parseError) {
        console.error('[Gemini API] Failed to parse structured JSON:', parseError);
        return NextResponse.json(
          {
            error: 'Model returned invalid JSON',
            text,
            details: parseError instanceof Error ? parseError.message : String(parseError)
          },
          { status: 500 }
        );
      }
    }

    const response: GeminiResponse = { text };
    if (data !== undefined) {
      response.data = data;
    }

    console.log(`[Gemini API] Success (${text.length} chars)`);
    return NextResponse.json(response);

  } catch (error) {
    // Log error server-side (without leaking API key)
    console.error('[Gemini API] Error:', error instanceof Error ? error.message : String(error));

    // Return sanitized error to client
    const message = error instanceof Error ? error.message : 'Unknown error';
    const sanitized = message.replace(/API[_\s]?KEY[^\s]*/gi, '[REDACTED]');

    return NextResponse.json(
      {
        error: 'Failed to generate content',
        details: sanitized
      },
      { status: 500 }
    );
  }
}
