/**
 * Public API Worker
 * Exposes prediction data as a public API for other tools to consume.
 * Deploy to Cloudflare Workers.
 * 
 * Endpoints:
 * GET /api/prediction - Current prediction state
 * GET /api/history - Reset history
 * GET /api/signals - Current signal states
 */

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === '/api/health') {
        return new Response(JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          uptime: Date.now(),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else if (path === '/api/prediction') {
        return await handlePrediction(env);
      } else if (path === '/api/history') {
        return await handleHistory(env);
      } else if (path === '/api/signals') {
        return await handleSignals(env);
      } else {
        return new Response(JSON.stringify({
          endpoints: [
            { path: '/api/prediction', description: 'Current prediction state' },
            { path: '/api/history', description: 'Reset history (last 20 records)' },
            { path: '/api/signals', description: 'Current signal states' },
            { path: '/api/health', description: 'Health check' },
          ],
          version: '1.0.0',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

async function handlePrediction(env: Env): Promise<Response> {
  // Fetch latest reset records from Supabase
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/reset_records?select=date&order=date.desc&limit=20`,
    {
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
    }
  );

  if (!response.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch data' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const records = await response.json();
  const now = Date.now();

  // Calculate prediction
  const lastReset = records.length > 0 ? new Date(records[0].date).getTime() : now;
  const daysSince = (now - lastReset) / (1000 * 60 * 60 * 24);

  // Simple probability model
  const baseProbability = Math.min(0.5, daysSince * 0.08);
  const probability24h = Math.round(baseProbability * 100) / 100;
  const probability48h = Math.round(Math.min(0.9, baseProbability * 1.5) * 100) / 100;

  return new Response(JSON.stringify({
    probability24h,
    probability48h,
    daysSinceLastReset: Math.round(daysSince * 10) / 10,
    lastResetDate: records.length > 0 ? records[0].date : null,
    generatedAt: new Date().toISOString(),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleHistory(env: Env): Promise<Response> {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/reset_records?select=date,reason,source&order=date.desc&limit=20`,
    {
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
      },
    }
  );

  if (!response.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch data' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const records = await response.json();

  return new Response(JSON.stringify({
    records,
    count: records.length,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleSignals(): Promise<Response> {
  // Return current signal states (simplified)
  return new Response(JSON.stringify({
    signals: [
      { label: 'OpenAI Status Page', status: 'active', description: 'No active incidents' },
      { label: 'Tibo X Posts', status: 'active', description: 'Monitoring for reset hints' },
      { label: 'Product Launch Noise', status: 'active', description: 'No significant signals' },
      { label: 'Cooldown Timer', status: 'active', description: 'Tracking time since last reset' },
    ],
    updatedAt: new Date().toISOString(),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
