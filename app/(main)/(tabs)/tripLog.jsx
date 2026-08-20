import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { DB } from "../../../firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const DIRECTION_LABELS = {
  to_school: "من البيت إلى المدرسة",
  to_home: "من المدرسة إلى البيت",
};

const STATUS_LABELS = {
  picked_up: "ركب",
  dropped_off: "وصل",
  absent: "لم يركب",
  waiting: "بانتظار",
};

//Group trips by the calendar day they started on ("2026-08-19"), newest first
const groupTripsByDay = (trips) => {
  const groups = {};

  trips.forEach((trip) => {
    if (!trip.started_at?.toDate) return;

    const date = trip.started_at.toDate();
    const key = date.toISOString().slice(0, 10);

    if (!groups[key]) groups[key] = { date, trips: [] };
    groups[key].trips.push(trip);
  });

  return Object.values(groups).sort((a, b) => b.date - a.date);
};

const DayCard = ({ group, studentsById, driverName, exportingKey, onExport }) => {
  const dayLabel = group.date.toLocaleDateString("ar-IQ", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const dayKey = group.date.toISOString().slice(0, 10);
  const isExporting = exportingKey === dayKey;

  const tripsByDirection = {
    to_school: group.trips.find((t) => t.direction === "to_school"),
    to_home: group.trips.find((t) => t.direction === "to_home"),
  };

  return (
    <View style={styles.dayCard}>
      <View style={styles.dayHeader}>
        <Text style={styles.dayTitle}>{dayLabel}</Text>

        <TouchableOpacity
          style={styles.exportBtn}
          disabled={isExporting}
          onPress={() => onExport(group)}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text style={styles.exportBtnText}>PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {["to_school", "to_home"].map((direction) => {
        const trip = tripsByDirection[direction];

        return (
          <View key={direction} style={styles.directionSection}>
            <Text style={styles.directionTitle}>{DIRECTION_LABELS[direction]}</Text>

            {!trip ? (
              <Text style={styles.emptyText}>لا توجد رحلة مسجلة</Text>
            ) : (
              <TripSummary trip={trip} studentsById={studentsById} />
            )}
          </View>
        );
      })}
    </View>
  );
};

const TripSummary = ({ trip, studentsById }) => {
  const entries = Object.entries(trip.students || {});
  const boardedCount = entries.filter(([, s]) => s === "picked_up" || s === "dropped_off").length;
  const absentCount = entries.filter(([, s]) => s === "absent").length;
  const subscriptionTotal = entries.reduce(
    (sum, [studentId]) => sum + (Number(studentsById[studentId]?.subscription_amount) || 0),
    0
  );

  return (
    <View>
      <View style={styles.countsRow}>
        <Text style={styles.countChip}>✅ ركب: {boardedCount}</Text>
        <Text style={[styles.countChip, styles.countChipRed]}>❌ لم يركب: {absentCount}</Text>
      </View>

      <Text style={styles.subscriptionTotal}>
        💰 إجمالي اشتراكات الخط: {subscriptionTotal.toLocaleString("ar-IQ")} د.ع
      </Text>

      {entries.map(([studentId, status]) => (
        <View key={studentId} style={styles.studentRow}>
          <Text style={styles.studentName}>
            {studentsById[studentId]?.name || "طالب"}
          </Text>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
            <Text style={styles.studentSubscription}>
              {Number(studentsById[studentId]?.subscription_amount) > 0
                ? `${Number(studentsById[studentId].subscription_amount).toLocaleString("ar-IQ")} د.ع`
                : "—"}
            </Text>
            <Text
              style={[
                styles.studentStatus,
                status === "absent" && styles.studentStatusRed,
                (status === "picked_up" || status === "dropped_off") && styles.studentStatusGreen,
              ]}
            >
              {STATUS_LABELS[status] || status}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
};

export default function TripLog() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [dayGroups, setDayGroups] = useState([]);
  const [studentsById, setStudentsById] = useState({});
  const [driverName, setDriverName] = useState("");
  const [exportingKey, setExportingKey] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadTripLog();
    }, [])
  );

  //Fetch all trips for this driver's lines and the students referenced in them
  const loadTripLog = async () => {
    try {
      setLoading(true);

      const stored = await AsyncStorage.getItem("SAFE_DRIVER_USER");
      if (!stored) return;

      const driverSnap = await getDoc(doc(DB, "drivers", stored));
      if (!driverSnap.exists()) return;

      const driverData = driverSnap.data();
      setDriverName(driverData.name || "السائق");

      const lineIds = driverData.lines || [];
      if (lineIds.length === 0) {
        setDayGroups([]);
        return;
      }

      const tripsSnap = await getDocs(
        query(collection(DB, "trips"), where("line_id", "in", lineIds.slice(0, 10)))
      );

      const trips = tripsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // ✅ fetch every student referenced across all trips, once each
      const studentIds = [...new Set(trips.flatMap((t) => Object.keys(t.students || {})))];

      const studentSnaps = await Promise.all(
        studentIds.map((id) => getDoc(doc(DB, "students", id)))
      );

      const byId = {};
      studentSnaps.forEach((s) => {
        if (s.exists()) byId[s.id] = { id: s.id, ...s.data() };
      });

      setStudentsById(byId);
      setDayGroups(groupTripsByDay(trips));
    } catch (error) {
      console.log("Trip log error:", error);
    } finally {
      setLoading(false);
    }
  };

  //Build a printable HTML report for a day's trips and share it as a PDF
  const exportDayToPDF = async (group) => {
    const dayKey = group.date.toISOString().slice(0, 10);

    try {
      setExportingKey(dayKey);

      const dayLabel = group.date.toLocaleDateString("ar-IQ", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

      const directionSectionHtml = (direction) => {
        const trip = group.trips.find((t) => t.direction === direction);

        if (!trip) {
          return `<h3>${DIRECTION_LABELS[direction]}</h3><p class="empty">لا توجد رحلة مسجلة</p>`;
        }

        const entries = Object.entries(trip.students || {});
        const boardedCount = entries.filter(([, s]) => s === "picked_up" || s === "dropped_off").length;
        const absentCount = entries.filter(([, s]) => s === "absent").length;
        const subscriptionTotal = entries.reduce(
          (sum, [studentId]) => sum + (Number(studentsById[studentId]?.subscription_amount) || 0),
          0
        );

        const rows = entries
          .map(([studentId, status]) => {
            const name = studentsById[studentId]?.name || "طالب";
            const subscription = Number(studentsById[studentId]?.subscription_amount) || 0;
            const statusClass = status === "absent" ? "red" : "green";
            return `<tr><td>${name}</td><td>${subscription ? subscription.toLocaleString("ar-IQ") + " د.ع" : "—"}</td><td class="${statusClass}">${STATUS_LABELS[status] || status}</td></tr>`;
          })
          .join("");

        return `
          <h3>${DIRECTION_LABELS[direction]}</h3>
          <p class="counts">✅ ركب: ${boardedCount} &nbsp;&nbsp; ❌ لم يركب: ${absentCount} &nbsp;&nbsp; 💰 إجمالي الاشتراكات: ${subscriptionTotal.toLocaleString("ar-IQ")} د.ع</p>
          <table>
            <thead><tr><th>الطالب</th><th>الاشتراك</th><th>الحالة</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        `;
      };

      const html = `
        <html lang="ar" dir="rtl">
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
              h1 { font-size: 20px; margin-bottom: 4px; }
              h2 { font-size: 14px; color: #6b7280; font-weight: normal; margin-top: 0; }
              h3 { font-size: 16px; margin-bottom: 4px; background: #D4AF37; color: #fff; padding: 8px 12px; border-radius: 8px; }
              .counts { margin: 8px 0; font-weight: bold; }
              .empty { color: #9ca3af; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
              th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: right; }
              th { background: #f8f9fa; }
              td.red { color: #dc2626; font-weight: bold; }
              td.green { color: #16a34a; font-weight: bold; }
            </style>
          </head>
          <body>
            <h1>سجل رحلات ${dayLabel}</h1>
            <h2>السائق: ${driverName}</h2>
            ${directionSectionHtml("to_school")}
            ${directionSectionHtml("to_home")}
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html, base64: false });

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "تصدير سجل الرحلات",
      });
    } catch (error) {
      console.log("Trip log PDF error:", error);
    } finally {
      setExportingKey(null);
    }
  };

  const HEADER_HEIGHT = 100 + insets.top;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top, height: HEADER_HEIGHT }]}>
        <Text style={styles.headerTitle}>سجل الرحلات</Text>
        <Text style={styles.headerSubtitle}>تقرير يومي لركوب الطلاب ذهاباً وإياباً</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: HEADER_HEIGHT + 20, paddingBottom: 80, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#000" />
        ) : dayGroups.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyBoxText}>لا يوجد سجل رحلات حتى الآن</Text>
          </View>
        ) : (
          dayGroups.map((group) => (
            <DayCard
              key={group.date.toISOString()}
              group={group}
              studentsById={studentsById}
              driverName={driverName}
              exportingKey={exportingKey}
              onExport={exportDayToPDF}
            />
          ))
        )}
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
    backgroundColor: "#D4AF37",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "NotoArabicBold",
    textAlign: "center",
  },
  headerSubtitle: {
    color: "#fef3c7",
    fontSize: 12,
    fontFamily: "NotoArabicRegular",
    textAlign: "center",
    marginTop: 2,
  },
  dayCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    elevation: 3,
  },
  dayHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  dayTitle: {
    fontSize: 15,
    fontFamily: "NotoArabicBold",
    color: "#111",
  },
  exportBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D4AF37",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 56,
    justifyContent: "center",
  },
  exportBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "NotoArabicBold",
  },
  directionSection: {
    marginBottom: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 10,
  },
  directionTitle: {
    fontSize: 13,
    fontFamily: "NotoArabicBold",
    color: "#374151",
    textAlign: "right",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: "NotoArabicRegular",
    color: "#9ca3af",
    textAlign: "right",
  },
  countsRow: {
    flexDirection: "row-reverse",
    gap: 10,
    marginBottom: 6,
  },
  countChip: {
    fontSize: 12,
    fontFamily: "NotoArabicBold",
    color: "#16a34a",
  },
  countChipRed: {
    color: "#dc2626",
  },
  subscriptionTotal: {
    fontSize: 12,
    fontFamily: "NotoArabicBold",
    color: "#B8860B",
    textAlign: "right",
    marginBottom: 6,
  },
  studentSubscription: {
    fontSize: 11,
    fontFamily: "NotoArabicRegular",
    color: "#9ca3af",
  },
  studentRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  studentName: {
    fontSize: 13,
    fontFamily: "NotoArabicRegular",
    color: "#111",
  },
  studentStatus: {
    fontSize: 12,
    fontFamily: "NotoArabicBold",
    color: "#6b7280",
  },
  studentStatusRed: {
    color: "#dc2626",
  },
  studentStatusGreen: {
    color: "#16a34a",
  },
  emptyBox: {
    marginTop: 40,
    alignItems: "center",
  },
  emptyBoxText: {
    color: "#6b7280",
    fontFamily: "NotoArabicRegular",
  },
});
