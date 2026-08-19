import { supabase } from "@/lib/supabase";

export interface SubscriptionResult {
  success: boolean;
  message: string;
  alreadySubscribed?: boolean;
}

/**
 * Subscribe an email to Codex Reset notifications.
 * Uses upsert to handle duplicate emails gracefully.
 */
export async function subscribeEmail(email: string): Promise<SubscriptionResult> {
  const normalizedEmail = email.trim().toLowerCase();

  // Check if already subscribed
  const { data: existing, error: checkError } = await supabase
    .from("subscriptions")
    .select("id, is_active")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (checkError) {
    throw new Error(`Subscription check failed: ${checkError.message}`);
  }

  if (existing) {
    if (existing.is_active) {
      return {
        success: true,
        message: "You are already subscribed!",
        alreadySubscribed: true,
      };
    }
    // Re-activate previously unsubscribed email
    const { error: reactivateError } = await supabase
      .from("subscriptions")
      .update({ is_active: true, unsubscribed_at: null })
      .eq("id", existing.id);

    if (reactivateError) {
      throw new Error(`Re-subscription failed: ${reactivateError.message}`);
    }

    return {
      success: true,
      message: "Welcome back! You have been re-subscribed.",
    };
  }

  // New subscription
  const { error: insertError } = await supabase
    .from("subscriptions")
    .insert({ email: normalizedEmail, is_active: true });

  if (insertError) {
    // Handle unique constraint race condition
    if (insertError.code === "23505") {
      return {
        success: true,
        message: "You are already subscribed!",
        alreadySubscribed: true,
      };
    }
    throw new Error(`Subscription failed: ${insertError.message}`);
  }

  return {
    success: true,
    message: "Successfully subscribed! We will notify you before the next reset.",
  };
}

/**
 * Get the total count of active subscribers.
 */
export async function getSubscriberCount(): Promise<number> {
  const { count, error } = await supabase
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to get subscriber count: ${error.message}`);
  }

  return count ?? 0;
}
