import { useSubscription } from '@/contexts/SubscriptionContext';

export function useIsPremium(): boolean {
  const { isSubscribed } = useSubscription();
  return isSubscribed === true;
}
