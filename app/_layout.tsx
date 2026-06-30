import "react-native-reanimated";
import React, { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColorScheme } from "react-native";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { WidgetProvider } from "@/contexts/WidgetContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from "@expo-google-fonts/nunito";
import { getOnboardingDone } from "@/utils/storage";

const DevErrorBoundary = __DEV__
  ? ErrorBoundary
  : ({ children }: { children: React.ReactNode }) => <>{children}</>;

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    if (!fontsLoaded) return;

    SplashScreen.hideAsync();

    getOnboardingDone().then((done) => {
      console.log('[Layout] onboarding done:', done);
      if (!done) {
        router.replace("/onboarding");
      }
      setOnboardingChecked(true);
    });
  }, [fontsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const CustomDefaultTheme: Theme = {
    ...DefaultTheme,
    dark: false,
    colors: {
      primary: '#E8B7A8',
      background: '#FAF4EC',
      card: '#FFFDFC',
      text: '#3F312C',
      border: '#E8DDD5',
      notification: '#C98B95',
    },
  };

  const CustomDarkTheme: Theme = {
    ...DarkTheme,
    colors: {
      primary: '#E8B7A8',
      background: '#2A1F1B',
      card: '#3A2B26',
      text: '#F5EDE8',
      border: '#4A3830',
      notification: '#C98B95',
    },
  };

  return (
    <DevErrorBoundary>
      <StatusBar style="dark" animated />
      <ThemeProvider
        value={colorScheme === "dark" ? CustomDarkTheme : CustomDefaultTheme}
      >
        <SafeAreaProvider>
          <WidgetProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                <Stack.Screen name="email-draft" options={{ headerShown: false }} />
              </Stack>
              <SystemBars style="dark" />
            </GestureHandlerRootView>
          </WidgetProvider>
        </SafeAreaProvider>
      </ThemeProvider>
    </DevErrorBoundary>
  );
}
