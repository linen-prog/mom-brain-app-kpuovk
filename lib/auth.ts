import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";

const API_URL = "https://b5y3w3kp3t8bp2qnpaqeu7mhk95gwhc2.app.specular.dev";

export const BEARER_TOKEN_KEY = "mombrain_bearer_token";

// Platform-specific storage: localStorage for web, SecureStore for native
const storage = Platform.OS === "web"
  ? {
      getItem: (key: string) => localStorage.getItem(key),
      setItem: (key: string, value: string) => localStorage.setItem(key, value),
      deleteItem: (key: string) => localStorage.removeItem(key),
    }
  : SecureStore;

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "mombrain",
      storagePrefix: "mombrain",
      storage,
      iosClientId: "44493112497-3tlj69jv70jf249gj10c3g9h81f8eelr.apps.googleusercontent.com",
    }),
  ],
  fetchOptions: {
    // Capture the JWT issued by Better Auth's jwt() plugin from the
    // `set-auth-jwt` response header on any session-returning endpoint
    // (sign-in, sign-up, getSession). The api-service verifies this JWT
    // via JWKS — `session.data.session.token` is the session ID, not a
    // JWT, and storing that as the bearer would 401 every api-service call.
    onSuccess: async (ctx: { response: Response }) => {
      const jwt = ctx.response.headers.get("set-auth-jwt");
      if (jwt) {
        await setBearerToken(jwt);
      }
    },
    ...(Platform.OS === "web" && {
      credentials: "include",
      auth: {
        type: "Bearer" as const,
        token: () => localStorage.getItem(BEARER_TOKEN_KEY) || "",
      },
    }),
  },
});

export async function setBearerToken(token: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(BEARER_TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(BEARER_TOKEN_KEY, token);
  }
}

export async function clearAuthTokens() {
  if (Platform.OS === "web") {
    localStorage.removeItem(BEARER_TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(BEARER_TOKEN_KEY);
  }
}

export { API_URL };
