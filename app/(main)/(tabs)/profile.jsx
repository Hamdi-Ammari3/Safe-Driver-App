import { useEffect, useState } from "react";
import {View,Text,StyleSheet,TouchableOpacity,ScrollView,Alert,Image} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc } from "firebase/firestore";
import { DB } from "../../../firebaseConfig";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Profile() {
  const [userName, setUserName] = useState("");
  const [driverImage, setDriverImage] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      const name = await AsyncStorage.getItem("SAFE_DRIVER_NAME");
      setUserName(name || "السائق");

      const phone = await AsyncStorage.getItem("SAFE_DRIVER_USER");
      if (!phone) return;

      const driverSnap = await getDoc(doc(DB, "drivers", phone));
      if (driverSnap.exists()) {
        setDriverImage(driverSnap.data().personal_image || null);
      }
    };
    loadProfile();
  }, []);

  const handleLogout = async () => {
    Alert.alert(
      "تسجيل الخروج",
      "هل أنت متأكد من تسجيل الخروج؟",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "خروج",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.multiRemove([
              "SAFE_DRIVER_USER",
              "SAFE_DRIVER_NAME"
            ]);

            router.replace("/(auth)/login");
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      label: "سياسة الخصوصية",
      icon: "shield-checkmark-outline",
      onPress: () => Linking.openURL("https://sayartech.com/privacy-policy"),
    },
    {
      label: "شروط الاستخدام",
      icon: "document-text-outline",
      onPress: () => Linking.openURL("https://sayartech.com/terms-of-use"),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>الملف الشخصي</Text>
          <Text style={styles.headerSubtitle}>إدارة حسابك</Text>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar_name_box}>
            <View style={styles.avatar}>
              {driverImage ? (
                <Image source={{ uri: driverImage }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={40} color="#fff" />
              )}
            </View>
            <View style={styles.userName_box}>
              <Text style={styles.userName}>{userName}</Text>
            </View>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menuWrapper}>
          {menuItems.map((item) => (
            <TouchableOpacity key={item.label} style={styles.menuItem} onPress={item.onPress}>
              <Ionicons
                name="chevron-back"
                size={20}
                color="#000"
              />
              <Text style={styles.menuText}>{item.label}</Text>
              <View style={styles.menuIcon}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color="#8a6115"
                />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <View style={styles.logoutWrapper}>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Feather name="log-out" size={18} color="#dc2626" />
            <Text style={styles.logoutText}>تسجيل الخروج</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    padding: 20,
    paddingBottom: 60,
    backgroundColor:'#D4AF37'
  },
  headerTitle: {
    fontSize: 22,
    color: "#fff",
    fontFamily: "NotoArabicBold",
    textAlign: "right",
  },
  headerSubtitle: {
    color: "#e5e7eb",
    fontSize: 14,
    fontFamily: "NotoArabicRegular",
    textAlign: "right",
  },
  profileCard: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginTop: -40,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical:30,
    elevation: 4,
  },
  avatar_name_box:{
    flexDirection:'row-reverse',
    alignItems: "center",
    justifyContent: "flex-start",
    gap:10,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#D4AF37",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  userName_box:{
    alignItems: "center",
    justifyContent: "center", 
  },
  userName: {
    fontSize: 18,
    fontFamily: "NotoArabicBold",
    color: "#111",
    textAlign: "right",
  },
  roleText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "right",
  },
  infoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginTop: 3,
    gap: 6,
  },
  infoText: {
    color: "#6b7280",
    fontSize: 14,
    fontFamily: "NotoArabicRegular",
  },
  menuWrapper: {
    marginTop: 20,
    paddingHorizontal: 20,
    gap: 10,
  },
  menuItem: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    elevation: 2,
  },
  menuText: {
    flex: 1,
    textAlign: "right",
    fontFamily: "NotoArabicRegular",
    color: "#000",
    fontSize: 15,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  logoutWrapper: {
    padding: 20,
    marginTop: 10,
  },
  logoutBtn: {
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  logoutText: {
    color: "#dc2626",
    fontFamily: "NotoArabicBold",
    fontSize: 16,
  },
});

/*
 //Fetch driver doc
  const fetchDriverProfile = async () => {
    try {
      setInitializing(true);

      const driverPhone = await AsyncStorage.getItem("safeTransDriver");
      if (!driverPhone) {
        setDriverProfile(null);
        return;
      }

      const driverRef = doc(DB, "drivers", driverPhone);
      const driverSnap = await getDoc(driverRef);

      if (driverSnap.exists()) {
        setDriverProfile({ id: driverSnap.id, ...driverSnap.data() });
      } else {
        setDriverProfile(null);
      }
    } catch (error) {
      console.log("❌ Error fetching driver profile:", error);
    } finally {
      setInitializing(false);
    }
  }

  //Check notification token update
  const updateUserNotificationToken = async () => {
    try {
      //Get user ID
      const userId = await AsyncStorage.getItem("safeTransDriver");
      if (!userId) return;

      const userRef = doc(DB, "users", userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;

      const savedTokenInDB = userSnap.data().notification_token || null;

      //Ask Expo for a new token
      const newTokenObj = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig.extra.eas.projectId,
      });

      const newToken = newTokenObj.data;

      //Handle denied permission
      if (!newToken) {
        return;
      }

      //If Firestore token is SAME → no update needed
      if (newToken === savedTokenInDB) {
        return;
      }

      //Update Firestore token
      await updateDoc(userRef, {
        notification_token: newToken
      });

      //Update local storage copy (optional)
      await AsyncStorage.setItem("expoPushToken", newToken);

    } catch (err) {
      console.log("❌ Error refreshing notification token:", err);
    }
  }

  //Run notification update check each time the home page loads
  useEffect(() => {
    updateUserNotificationToken();
  }, [])
*/
