import { Redirect } from 'expo-router';

export default function Index() {
  console.log('[Index] Cold start, redirecting to /(tabs)/dump');
  return <Redirect href="/(tabs)/dump" />;
}
