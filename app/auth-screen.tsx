import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Platform,
  ImageSourcePropType,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/contexts/AuthContext";

function resolveImageSource(
  source: string | number | ImageSourcePropType | undefined
): ImageSourcePropType {
  if (!source) return { uri: "" };
  if (typeof source === "string") return { uri: source };
  return source as ImageSourcePropType;
}

const logoImage = require("@/assets/images/ChatGPT Image Jul 1, 2026, 02_52_50 PM.png");

export default function AuthScreen() {
  const { user, loading, signInWithApple, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      console.log("[AuthScreen] User authenticated, navigating to tabs");
      router.replace("/(tabs)/dump" as never);
    }
  }, [user, loading, router]);

  const handleAppleSignIn = async () => {
    console.log("[AuthScreen] Apple Sign-In button pressed");
    setError(null);
    setAuthLoading(true);
    try {
      await signInWithApple();
      console.log("[AuthScreen] Apple Sign-In succeeded");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Apple sign-in failed";
      if (message !== "ERR_CANCELED") {
        console.error("[AuthScreen] Apple Sign-In error:", message);
        setError(message);
      } else {
        console.log("[AuthScreen] Apple Sign-In cancelled by user");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    console.log("[AuthScreen] Google Sign-In button pressed");
    setError(null);
    setAuthLoading(true);
    try {
      await signInWithGoogle();
      console.log("[AuthScreen] Google Sign-In succeeded");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      console.error("[AuthScreen] Google Sign-In error:", message);
      setError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#C98B95" />
      </View>
    );
  }

  const isIOS = Platform.OS === "ios";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={resolveImageSource(logoImage)}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Headline */}
        <Text style={styles.headline}>Welcome to Mom Brain</Text>

        {/* Subtext */}
        <Text style={styles.subtext}>
          Your personal space to offload the mental load.
        </Text>

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          {authLoading ? (
            <View style={styles.loadingButtons}>
              <ActivityIndicator size="large" color="#C98B95" />
            </View>
          ) : (
            <>
              {/* Apple Sign-In — must appear first (App Store requirement) */}
              {isIOS ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  }
                  buttonStyle={
                    AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={12}
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                />
              ) : (
                <TouchableOpacity
                  style={styles.appleButtonFallback}
                  onPress={handleAppleSignIn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.appleButtonText}>Continue with Apple</Text>
                </TouchableOpacity>
              )}

              {/* Google Sign-In */}
              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleSignIn}
                activeOpacity={0.85}
              >
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Error message */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {/* Bottom note */}
        <Text style={styles.privacyNote}>Your data stays private and secure.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAF4EC",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#FAF4EC",
    justifyContent: "center",
    alignItems: "center",
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: 32,
    shadowColor: "#C98B95",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  logo: {
    width: 120,
    height: 120,
  },
  headline: {
    fontFamily: "Nunito_700Bold",
    fontSize: 28,
    color: "#3F312C",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  subtext: {
    fontFamily: "Nunito_400Regular",
    fontSize: 16,
    color: "#7A6560",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 48,
    paddingHorizontal: 8,
  },
  buttonsContainer: {
    width: "100%",
    gap: 14,
    alignItems: "center",
  },
  loadingButtons: {
    height: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  appleButton: {
    width: "100%",
    height: 52,
  },
  appleButtonFallback: {
    width: "100%",
    height: 52,
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  appleButtonText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  googleButton: {
    width: "100%",
    height: 52,
    backgroundColor: "#C98B95",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  googleButtonText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  errorText: {
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    color: "#D94F4F",
    textAlign: "center",
    marginTop: 4,
  },
  privacyNote: {
    fontFamily: "Nunito_400Regular",
    fontSize: 13,
    color: "#B0A09A",
    textAlign: "center",
    marginTop: 48,
  },
});
