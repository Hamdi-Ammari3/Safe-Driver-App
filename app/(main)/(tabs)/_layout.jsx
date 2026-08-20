import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  
  const getTabBarHeight = () => {
    const baseHeight = 60;
    if (Platform.OS === "ios") {
      return baseHeight + Math.max(insets.bottom, 8);
    }
    return baseHeight + Math.max(insets.bottom, 10);
  };

  const tabBarHeight = getTabBarHeight();

  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel:true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'NotoArabicRegular',
          height: 20,
          lineHeight: 20,
        },
        tabBarStyle: [
          styles.tabBar,
          {
            height: tabBarHeight,
            paddingBottom: Platform.OS === "ios" 
              ? Math.max(insets.bottom, 8) 
              : Math.max(insets.bottom, 10),
            paddingTop: 8,
          },
        ],
        tabBarActiveTintColor: "#007AFF",
        tabBarInactiveTintColor: "#888",
      }}
    >

      <Tabs.Screen 
        name='profile' 
        options={{
          headerShown:false,
          title: 'حسابي',
          tabBarIcon:({color}) => (<Ionicons name="person" size={22} color={color}/>)
        }}
      />

      <Tabs.Screen 
        name='home'
        options={{
          headerShown:false,
          title: 'الرئيسية',
          tabBarIcon:({color}) => (<Ionicons name='home'size={24} color={color} />)
        }}
      />

      <Tabs.Screen 
        name='tripLog'
        options={{
          headerShown:false,
          title: 'سجل الرحلات',
          tabBarIcon:({color}) => (<Ionicons name='document-text' size={22} color={color}/>)
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 0.5,
    borderTopColor: "#E5E5EA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
});
