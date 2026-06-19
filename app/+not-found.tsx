import { Redirect } from 'expo-router';

export default function NotFoundScreen() {
  console.log('[NotFound] Stale route detected, redirecting to /(tabs)/dump');
  return <Redirect href="/(tabs)/dump" />;
}
