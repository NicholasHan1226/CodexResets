import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { pushCloudData } from '@/lib/user-sync';

/**
 * Returns a push function that mirrors local data to the cloud when signed in.
 * No-op for anonymous users — localStorage remains the source of truth.
 */
export function useCloudSync() {
  const { user } = useAuth();

  const pushUsage = useCallback(
    (usageData: Record<string, unknown>) => {
      if (user) void pushCloudData(user.id, { usage_data: usageData });
    },
    [user]
  );

  const pushBanked = useCallback(
    (bankedResets: unknown[]) => {
      if (user) void pushCloudData(user.id, { banked_resets: bankedResets });
    },
    [user]
  );

  return { pushUsage, pushBanked, isSignedIn: !!user };
}
