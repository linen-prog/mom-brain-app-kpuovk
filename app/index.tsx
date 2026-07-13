import { Redirect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { user, loading } = useAuth();

  console.log("[Index] Auth state — loading:", loading, "user:", user?.id ?? null);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#FAF4EC",
        }}
      >
        <ActivityIndicator color="#C98B95" />
      </View>
    );
  }

  if (!user) {
    console.log("[Index] No user, redirecting to /auth-screen");
    return <Redirect href="/auth-screen" />;
  }

  console.log("[Index] User found, redirecting to /(tabs)");
  return <Redirect href={"/(tabs)/dump" as never} />;
}
