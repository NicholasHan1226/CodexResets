export type SubscribeStatus = 'pending' | 'invalid';

const PIPELINE_URL = import.meta.env.VITE_PIPELINE_API_URL || 'https://api.codexresets.cc';

/**
 * Start a double opt-in email subscription. The Worker sends the confirmation
 * email and activates the address only after the recipient follows its link.
 */
export async function subscribeEmail(email: string, turnstileToken: string): Promise<SubscribeStatus> {
  const response = await fetch(`${PIPELINE_URL.replace(/\/+$/, '')}/api/subscribe/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), turnstileToken }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => null) as { status?: string; error?: string } | null;
  if (!response.ok) {
    if (response.status === 400) return 'invalid';
    throw new Error(data?.error || `subscription request failed: ${response.status}`);
  }
  if (data?.status === 'pending') return 'pending';
  throw new Error('unexpected subscription response');
}
