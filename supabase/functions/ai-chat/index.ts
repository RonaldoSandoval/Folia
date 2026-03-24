import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX       = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// Model → provider mapping (API keys read from Supabase secrets at runtime)
// ---------------------------------------------------------------------------

interface ModelConfig {
  baseUrl:    string;
  apiKeyEnv:  string;
  type:       'openai-compat' | 'anthropic';
  maxTokens:  number;
}

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'llama-3.3-70b-versatile':   { baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY',      type: 'openai-compat', maxTokens: 8192 },
  'llama-3.1-8b-instant':      { baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY',      type: 'openai-compat', maxTokens: 8192 },
  'gpt-4o':                    { baseUrl: 'https://api.openai.com/v1',       apiKeyEnv: 'OPENAI_API_KEY',    type: 'openai-compat', maxTokens: 4096 },
  'gpt-4o-mini':               { baseUrl: 'https://api.openai.com/v1',       apiKeyEnv: 'OPENAI_API_KEY',    type: 'openai-compat', maxTokens: 4096 },
  'claude-sonnet-4-6':         { baseUrl: 'https://api.anthropic.com',       apiKeyEnv: 'ANTHROPIC_API_KEY', type: 'anthropic',     maxTokens: 8192 },
  'claude-haiku-4-5-20251001': { baseUrl: 'https://api.anthropic.com',       apiKeyEnv: 'ANTHROPIC_API_KEY', type: 'anthropic',     maxTokens: 4096 },
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  // CORS preflight — must return 200 with no body so the browser proceeds.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    // ── 1. Authenticate user ────────────────────────────────────────────────

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Missing authorization header', 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')      ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonError('Unauthorized', 401);

    // ── 2. Server-side rate limiting ────────────────────────────────────────

    // Use service role to bypass RLS for rate-limit accounting.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')               ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')  ?? '',
    );

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

    const { count } = await admin
      .from('ai_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart);

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      // Calculate when the oldest request in the window expires.
      const { data: oldest } = await admin
        .from('ai_requests')
        .select('created_at')
        .eq('user_id', user.id)
        .gte('created_at', windowStart)
        .order('created_at', { ascending: true })
        .limit(1);

      const retryAfterMs = oldest?.[0]
        ? RATE_LIMIT_WINDOW_MS - (Date.now() - new Date(oldest[0].created_at).getTime())
        : RATE_LIMIT_WINDOW_MS;

      return jsonError('Rate limit exceeded', 429, { retryAfterMs: Math.max(retryAfterMs, 1_000) });
    }

    // ── 3. Validate request body ─────────────────────────────────────────────

    const { messages, modelId, systemPrompt, documentId } = await req.json();

    // ── 4. Role validation (if documentId provided) ──────────────────────────

    if (documentId) {
      // Check if user is the document owner.
      const { data: doc } = await admin
        .from('documents')
        .select('owner_id')
        .eq('id', documentId)
        .single();

      const isOwner = doc?.owner_id === user.id;

      if (!isOwner) {
        // Not the owner — check collaborator role.
        const { data: collab } = await admin
          .from('document_collaborators')
          .select('role')
          .eq('document_id', documentId)
          .eq('user_id', user.id)
          .single();

        const role = collab?.role as string | undefined;

        // Viewers are not allowed to use the AI assistant.
        if (!role || role === 'viewer') {
          return jsonError('Forbidden: viewers cannot use the AI assistant', 403);
        }
      }
    }

    const config = MODEL_CONFIGS[modelId as string];
    if (!config) return jsonError(`Unknown model: ${modelId}`, 400);

    const apiKey = Deno.env.get(config.apiKeyEnv);
    if (!apiKey) return jsonError(`Server: API key for ${config.apiKeyEnv} is not set`, 500);

    // ── 5. Log the request (fire-and-forget) ────────────────────────────────

    admin.from('ai_requests').insert({ user_id: user.id, model_id: modelId }).then(() => {});

    // ── 6. Forward to upstream AI provider ──────────────────────────────────

    let upstream: Response;

    if (config.type === 'anthropic') {
      upstream = await fetch(`${config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      modelId,
          max_tokens: config.maxTokens,
          system:     systemPrompt,
          stream:     true,
          messages,
        }),
      });
    } else {
      upstream = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model:      modelId,
          max_tokens: config.maxTokens,
          stream:     true,
          messages:   [{ role: 'system', content: systemPrompt }, ...messages],
        }),
      });
    }

    if (!upstream.ok) {
      const err = await upstream.text();
      return jsonError(err, upstream.status);
    }

    // Pass the SSE stream straight through — the Angular client parses it.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (err) {
    return jsonError(String(err), 500);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
