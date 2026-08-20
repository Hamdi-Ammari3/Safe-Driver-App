import { Stack } from "expo-router";

export default function MainLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#f8f9fa" } }}>
      <Stack.Screen name="(tabs)"/>
      <Stack.Screen name="lineDetails/[lineID]"/>    
    </Stack>
  );
}
