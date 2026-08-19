/**
 * Cloudflare Worker for sending email notifications
 * when reset probability exceeds threshold
 * 
 * Environment variables required:
 * - RESEND_API_KEY: API key from Resend.com
 * - FROM_EMAIL: Sender email address
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_KEY: Supabase service role key
 */

interface Env {
  RESEND_API_KEY: string;
  FROM_EMAIL: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
}

interface Subscription {
  id: string;
  email: string;
  last_notified_at: string | null;
  is_active: boolean;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Trigger notification check (called by cron or manually)
    if (url.pathname === '/check-and-notify' && request.method === 'POST') {
      try {
        const result = await checkAndNotify(env);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Get notification stats
    if (url.pathname === '/stats' && request.method === 'GET') {
      try {
        const stats = await getStats(env);
        return new Response(JSON.stringify(stats), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },

  // Cron trigger for scheduled notifications
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(checkAndNotify(env));
  },
};

async function checkAndNotify(env: Env): Promise<{ sent: number; skipped: number; error?: string }> {
  // Fetch current prediction from the frontend API or calculate
  const prediction = await fetchCurrentPrediction();
  
  // Only notify if probability exceeds threshold
  const THRESHOLD = 70;
  if (prediction.probability24h < THRESHOLD) {
    return { sent: 0, skipped: 0 };
  }

  // Fetch active subscribers who haven't been notified recently
  const subscribers = await fetchSubscribers(env);
  
  let sent = 0;
  let skipped = 0;

  for (const sub of subscribers) {
    // Skip if notified in the last 24 hours
    if (sub.last_notified_at) {
      const lastNotified = new Date(sub.last_notified_at);
      const hoursSince = (Date.now() - lastNotified.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        skipped++;
        continue;
      }
    }

    // Send email
    const success = await sendEmail(env, sub.email, prediction);
    if (success) {
      await updateLastNotified(env, sub.id);
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped };
}

async function fetchCurrentPrediction() {
  // In production, this would fetch from your prediction API
  // For now, return a mock prediction
  return {
    probability24h: 75,
    probability48h: 85,
    mostLikelyWindow: 'Next 6 hours',
    daysSinceLastReset: 4.2,
    medianInterval: 3.8,
  };
}

async function fetchSubscribers(env: Env): Promise<Subscription[]> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions?is_active=eq.true&select=*`, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch subscribers: ${response.statusText}`);
  }
  
  return response.json();
}

async function sendEmail(env: Env, email: string, prediction: any): Promise<boolean> {
  const subject = `🔔 Codex Reset Alert - ${prediction.probability24h}% probability`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0E0F12; color: #F0F2F5; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1A1B21; border-radius: 12px; padding: 32px; }
        .header { text-align: center; margin-bottom: 24px; }
        .logo { color: #10A37F; font-size: 24px; font-weight: bold; }
        .probability { font-size: 48px; font-weight: bold; color: #10A37F; text-align: center; margin: 24px 0; }
        .stat { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #2A2B31; }
        .stat-label { color: #8B92A0; }
        .stat-value { color: #F0F2F5; font-weight: 500; }
        .cta { display: block; text-align: center; margin-top: 24px; padding: 12px 24px; background: #10A37F; color: white; text-decoration: none; border-radius: 8px; }
        .footer { text-align: center; margin-top: 24px; color: #8B92A0; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Codex Resets</div>
          <p>Reset Probability Alert</p>
        </div>
        
        <div class="probability">${prediction.probability24h}%</div>
        <p style="text-align: center; color: #8B92A0;">24-hour reset probability</p>
        
        <div style="margin-top: 32px;">
          <div class="stat">
            <span class="stat-label">48-hour probability</span>
            <span class="stat-value">${prediction.probability48h}%</span>
          </div>
          <div class="stat">
            <span class="stat-label">Most likely window</span>
            <span class="stat-value">${prediction.mostLikelyWindow}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Days since last reset</span>
            <span class="stat-value">${prediction.daysSinceLastReset.toFixed(1)} days</span>
          </div>
          <div class="stat">
            <span class="stat-label">Median interval</span>
            <span class="stat-value">${prediction.medianInterval} days</span>
          </div>
        </div>
        
        <a href="https://codex-resets.com" class="cta">View Full Dashboard</a>
        
        <div class="footer">
          <p>You received this email because you subscribed to Codex reset notifications.</p>
          <p><a href="https://codex-resets.com/unsubscribe" style="color: #8B92A0;">Unsubscribe</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: email,
        subject,
        html,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

async function updateLastNotified(env: Env, subscriptionId: string): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions?id=eq.${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({
      last_notified_at: new Date().toISOString(),
    }),
  });
}

async function getStats(env: Env): Promise<{ total: number; active: number; notifiedToday: number }> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions?select=*`, {
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }
  
  const subscribers: Subscription[] = await response.json();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const notifiedToday = subscribers.filter(sub => {
    if (!sub.last_notified_at) return false;
    const notified = new Date(sub.last_notified_at);
    return notified >= today;
  }).length;

  return {
    total: subscribers.length,
    active: subscribers.filter(sub => sub.is_active).length,
    notifiedToday,
  };
}
