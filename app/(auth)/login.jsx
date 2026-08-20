import { useState } from "react";
import {View,Text,TextInput,TouchableOpacity,StyleSheet,ScrollView,Platform,StatusBar,Alert,Image,KeyboardAvoidingView} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DB } from "../../firebaseConfig";
import { router } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";

const Login = () => {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  //Login function
  const handleLogin = async () => {
    if (!phone || !password.trim()) {
      Alert.alert("خطأ", "يرجى إدخال رقم الدخول وكلمة المرور");
      return;
    }

    try {
      setLoading(true);

      // 🔹 1. Fetch admin by username (docId = username)
      const driverRef = doc(DB, "drivers", phone);
      const driverSnap = await getDoc(driverRef);

      if (!driverSnap.exists()) {
        Alert.alert("فشل الدخول", "اسم المستخدم غير موجود");
        return;
      }

      const driverData = driverSnap.data();

      if (driverData.account_banned === true) {
        Alert.alert("الحساب موقوف", "تم إيقاف هذا الحساب، يرجى التواصل مع الإدارة");
        return;
      }

      // 🔹 2. Compare password
      if (driverData.password !== password) {
        Alert.alert("فشل الدخول", "كلمة المرور غير صحيحة");
        return;
      }

      // 🔹 3. Save common session data
      const sessionData = [
        ["SAFE_DRIVER_USER", phone],
        ["SAFE_DRIVER_NAME", driverData.name],
      ];

      await AsyncStorage.multiSet(sessionData);

      router.replace("/(main)/(tabs)/home");

    } catch (error) {
      console.log("Login error:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "android" ? StatusBar.currentHeight : 0}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.logoContainer}>
          <View style={styles.logoFrame}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>تطبيق السائق</Text>
          <Text style={styles.subtitle}>إدارة رحلاتك اليومية بسهولة</Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Username */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>رقم الدخول</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="XXXXXXXXXX"
                placeholderTextColor="#aaa"
                value={phone}
                onChangeText={setPhone}
                textAlign="right"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>كلمة المرور</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#aaa"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                textAlign="right"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <MaterialIcons 
                  name={showPassword ? "visibility" : "visibility-off"} 
                  size={24} 
                  color="#777" 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? "جاري التحقق..." : "دخول"}
            </Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  logoContainer: {
    alignItems: "center",
  },
  logoFrame: {
    width: 120,
    height: 120,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#D4AF37",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  logoImage: {
    width: 90,
    height: 90,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: "NotoArabicBold",
    color: "#111",
    marginBottom: 3,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "NotoArabicRegular",
    color: "#6b7280",
    marginBottom: 10,
    textAlign: "center",
  },
  fieldContainer: {
    marginBottom: 15,
  },
  label: {
    fontFamily: "NotoArabicBold",
    fontSize: 15,
    color: "#111",
    marginBottom: 8,
    textAlign: "right",
  },
  inputWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    height: 52,
  },
  inputIcon: {
    marginLeft: 8,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 14,
    fontFamily: "NotoArabicRegular",
    color: "#000",
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#D4AF37",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 7,
  },
  primaryButtonText: {
    fontFamily: "NotoArabicBold",
    color: "#fff",
    fontSize: 18,
  },
});

export default Login;
