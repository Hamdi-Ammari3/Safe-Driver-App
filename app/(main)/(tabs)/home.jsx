import { useEffect, useRef, useState } from "react";
import {View,Text,StyleSheet,ScrollView,TouchableOpacity,ActivityIndicator,Image,Animated} from "react-native";
import { doc, getDoc,collection,query,where,getDocs } from "firebase/firestore";
import { DB } from "../../../firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import male from "../../../assets/images/man.png";
import female from "../../../assets/images/woman.png";
import lineCardImage from "../../../assets/images/line_card.jpg";

//Limit a student's name to two words for the compact chip label
const limitNameToTwoWords = (name = "") => {
  return name.trim().split(" ").filter(Boolean).slice(0, 2).join(" ");
};

const LineCard = ({ line, students, schoolLogo }) => {
  const goToLineDetails = () =>
    router.push({
      pathname: "/(main)/lineDetails/[lineID]",
      params: { lineID: line.id }
    });

  //Pulsing tap-hint animation to draw the driver's eye to the banner
  const tapScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(tapScale, { toValue: 1.25, duration: 550, useNativeDriver: true }),
        Animated.timing(tapScale, { toValue: 1,    duration: 550, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.9} onPress={goToLineDetails}>
        <Image source={lineCardImage} style={styles.cardBanner} resizeMode="cover" />
        <View style={styles.bannerOverlay}>
          <Animated.View style={{ transform: [{ scale: tapScale }] }}>
            <Ionicons name="hand-left" size={26} color="#fff" />
          </Animated.View>
          <Text style={styles.bannerOverlayText}>اضغط هنا لبدء التتبع</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cardHeader}
        activeOpacity={0.85}
        onPress={goToLineDetails}
      >
        <View style={styles.iconBox}>
          {schoolLogo ? (
            <Image source={{ uri: schoolLogo }} style={styles.schoolLogo} resizeMode="cover" />
          ) : (
            <Ionicons name="location-sharp" size={22} color="#fff" />
          )}
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>
            {line.destination || "خط"}
          </Text>
          <Text style={styles.cardDesc}>
            {line.line_number}
          </Text>
        </View>

        {/* Riders Badge */}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {line.riders?.length || 0}
          </Text>
        </View>
      </TouchableOpacity>

      {students?.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.studentsRow}
        >
          {students.map((student) => {
            const defaultIcon = student.sex === "female" ? female : male;

            return (
              <View key={student.id} style={styles.studentChip}>
                <Image
                  source={student.photo_url ? { uri: student.photo_url } : defaultIcon}
                  style={styles.studentAvatar}
                  resizeMode="cover"
                />
                <Text style={styles.studentName} numberOfLines={1}>
                  {limitNameToTwoWords(student.name)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

export default function DriverHome() {
  const insets = useSafeAreaInsets();

  const [driver, setDriver] = useState(null);
  const [lines, setLines] = useState([]);
  const [lineStudents, setLineStudents] = useState({});
  const [schoolLogos, setSchoolLogos] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  //Fetch driver profile and lines
  const loadData = async () => {
    try {
      setLoading(true);

      const stored = await AsyncStorage.getItem("SAFE_DRIVER_USER");

      if (!stored) {
        router.replace("/(auth)/login");
        return;
      }

      // ✅ fetch driver
      const driverRef = doc(DB, "drivers", stored);
      const driverSnap = await getDoc(driverRef);

      if (!driverSnap.exists()) {
        router.replace("/(auth)/login");
        return;
      }

      const driverData = driverSnap.data();
      setDriver(driverData);

      const lineIds = driverData.lines || [];

      if (lineIds.length === 0) {
        setLines([]);
        return;
      }

      // ✅ fetch lines (NO realtime)
      const linesQuery = query(
        collection(DB, "lines"),
        where("__name__", "in", lineIds.slice(0, 10))
      );

      const snap = await getDocs(linesQuery);

      const fetchedLines = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setLines(fetchedLines);

      // ✅ fetch each line's riders so their names/photos can show under the line card
      const studentsByLine = {};

      await Promise.all(
        fetchedLines.map(async (line) => {
          const riderIds = line.riders || [];

          if (riderIds.length === 0) {
            studentsByLine[line.id] = [];
            return;
          }

          const studentSnaps = await Promise.all(
            riderIds.map((id) => getDoc(doc(DB, "students", id)))
          );

          studentsByLine[line.id] = studentSnaps
            .filter((s) => s.exists())
            .map((s) => ({ id: s.id, ...s.data() }));
        })
      );

      setLineStudents(studentsByLine);

      // ✅ fetch each line's school logo (via school_id) to show on the line card
      const schoolIds = [...new Set(fetchedLines.map((l) => l.school_id).filter(Boolean))];

      if (schoolIds.length > 0) {
        const schoolSnaps = await Promise.all(
          schoolIds.map((id) => getDoc(doc(DB, "schools", id)))
        );

        const logosBySchool = {};
        schoolSnaps.forEach((s) => {
          if (s.exists()) logosBySchool[s.id] = s.data().logo_url || null;
        });

        setSchoolLogos(logosBySchool);
      }

    } catch (error) {
      console.log("Driver home error:", error);
    } finally {
      setLoading(false);
    }
  };

  //Limit name to three name
  const limitNameToThreeWords = (name = "") => {
    return name
      .trim()
      .split(" ")
      .filter(Boolean)     
      .slice(0, 3)      
      .join(" ");
  };

  const HEADER_HEIGHT = 120 + insets.top;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top, height: HEADER_HEIGHT }
        ]}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>
            {limitNameToThreeWords(driver?.name)} - {driver?.car_type}
          </Text>
          <Text style={styles.headerSubtitle}>
            اختر الخط لبدء الرحلة
          </Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={{
          paddingTop: HEADER_HEIGHT + 40,
          paddingBottom: 80
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionWrapper}>
          {loading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : lines.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                لا يوجد خطوط في حسابك حالياً
              </Text>
            </View>
          ) : (
            lines.map((line) => (
              <LineCard
                key={line.id}
                line={line}
                students={lineStudents[line.id]}
                schoolLogo={schoolLogos[line.school_id]}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 20,
    justifyContent: "center",
    backgroundColor:'#D4AF37'
  },
  headerContent: {
    flex:1,
    alignItems: "center",
    justifyContent:'center',
  },
  headerTitle: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "NotoArabicBold",
  },
  headerSubtitle: {
    color: "#e5e7eb",
    fontSize: 13,
    fontFamily: "NotoArabicRegular",
  },
  sectionWrapper: {
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 12,
    elevation: 3,
    overflow: "hidden",
  },
  cardBanner: {
    width: "100%",
    height: 130,
  },
  bannerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 130,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  bannerOverlayText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "NotoArabicBold",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    padding: 14,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:'#D4AF37',
    overflow: "hidden",
  },
  schoolLogo: {
    width: "100%",
    height: "100%",
  },
  cardContent: {
    flex: 1,
    marginHorizontal: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "NotoArabicBold",
    color: "#111",
    textAlign: "right",
  },
  cardDesc: {
    fontSize: 13,
    fontFamily: "NotoArabicRegular",
    color: "#6b7280",
    textAlign: "right",
    marginTop: 2,
  },
  badge: {
    backgroundColor: "#f59e0b",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "NotoArabicBold",
  },
  studentsRow: {
    flexDirection: "row-reverse",
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 12,
  },
  studentChip: {
    alignItems: "center",
    width: 60,
  },
  studentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#eee",
  },
  studentName: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: "NotoArabicRegular",
    color: "#374151",
    textAlign: "center",
  },
  emptyBox: {
    marginTop: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#6b7280",
    fontFamily: "NotoArabicRegular",
  },
});