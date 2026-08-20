import { useEffect, useState, useRef } from "react";
import { View,StyleSheet,Text,TouchableOpacity,ActivityIndicator,Image,Alert } from "react-native";
import MapView, { Marker, MarkerAnimated, AnimatedRegion, Polyline } from "react-native-maps";
import { useLocalSearchParams } from "expo-router";
import { doc, getDoc,updateDoc, collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { DB } from "../../../firebaseConfig";
import { notifyEvent } from "../../../services/notificationService";
import * as Location from "expo-location";
import { Linking } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import school from '../../../assets/images/school.png';
import male from '../../../assets/images/man.png';
import female from '../../../assets/images/woman.png';
import car from '../../../assets/images/car.png';

const STATUS_COLORS = {
    picked_up: "#16a34a",
    absent: "#dc2626",
    dropped_off: "#2563eb",
};

export default function LineDetails() {
    const { lineID } = useLocalSearchParams();
    const mapRef = useRef(null);
    const lastSavedLocation = useRef(null);
    const lastUpdateTime = useRef(0);
    const headingRef = useRef(0);
    const animatedCoordinate = useRef(null);
    const hasAutoFitted = useRef(false);

    const [line, setLine] = useState(null);
    const [students, setStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [driverLocation, setDriverLocation] = useState(null);
    const [driverHeading, setDriverHeading] = useState(0);
    const [loading, setLoading] = useState(true);
    const [trip, setTrip] = useState(null);
    const [tripActionLoading, setTripActionLoading] = useState(false);
    const [routeCoordinates, setRouteCoordinates] = useState([]);
    const [carIconReady, setCarIconReady] = useState(false);
    const [schoolIconReady, setSchoolIconReady] = useState(false);
    const [readyStudentIcons, setReadyStudentIcons] = useState({});
    const lastRouteFetchLocation = useRef(null);
    const lastRouteTargetKey = useRef(null);

    //Where the driver should be routed to right now: for a to_home (return) trip, that's
    //the school until every student has boarded, then each student's home in turn as they
    //get dropped off; for a to_school trip, it's each waiting student's home in turn until
    //everyone has boarded, then the school
    const getRouteTarget = () => {
        if (!line?.destination_location) return null;
        if (!trip) return line.destination_location;

        if (trip.direction === "to_home") {
            const next = getNextPendingStudent();
            if (!next) return line.destination_location;

            return next.phase === "pickup" ? line.destination_location : next.student.home_location;
        }

        const nextWaitingStudent = students.find((s) => trip.students?.[s.id] === "waiting");
        return nextWaitingStudent ? nextWaitingStudent.home_location : line.destination_location;
    };

    //Fetch the road route from OpenStreetMap (OSRM) and draw it on top of the Google map,
    //refetching whenever the driver moves far enough to have likely changed streets, or the
    //target itself changes (e.g. switching from "drive to school" to "drop student at home").
    useEffect(() => {
        if (!driverLocation) return;

        const target = getRouteTarget();
        if (!target) return;

        const targetKey = `${target.latitude},${target.longitude}`;
        const targetChanged = lastRouteTargetKey.current !== targetKey;

        const last = lastRouteFetchLocation.current;
        if (!targetChanged && last && getDistance(last, driverLocation) < 50) return;

        fetchRoute(driverLocation, target);
        lastRouteTargetKey.current = targetKey;
    }, [driverLocation, line, trip]);

    const fetchRoute = async (origin, destination) => {
        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.code !== "Ok" || !data.routes?.length) {
                // Don't mark this location as "fetched" on failure, so the next location
                // update retries instead of leaving the route permanently empty
                console.log("OSRM route fetch error:", data.code);
                return;
            }

            const rawCoords = data.routes[0].geometry.coordinates.map(([lng, lat]) => ({
                latitude: lat,
                longitude: lng,
            }));

            // OSRM's full geometry packs points only a meter or two apart, which makes the
            // bearing between consecutive points noisy (tiny coordinate rounding looks like a
            // sharp turn) and causes the simulated driver to twist/wobble instead of walking
            // smoothly. Thin the points out so each is a meaningful distance from the last.
            const coords = [rawCoords[0]];
            for (let i = 1; i < rawCoords.length; i++) {
                if (getDistance(coords[coords.length - 1], rawCoords[i]) >= 15) {
                    coords.push(rawCoords[i]);
                }
            }
            const lastPoint = rawCoords[rawCoords.length - 1];
            if (coords[coords.length - 1] !== lastPoint) coords.push(lastPoint);

            setRouteCoordinates(coords);
            lastRouteFetchLocation.current = origin;
        } catch (error) {
            console.log("OSRM route fetch error:", error);
        }
    };

    // Drop the part of the polyline the driver already passed so the drawn path shrinks as they move
    useEffect(() => {
        if (!driverLocation) return;
        setRouteCoordinates((prev) => trimRouteToLocation(prev, driverLocation));
    }, [driverLocation]);

    const trimRouteToLocation = (route, location) => {
        if (!route?.length) return route;

        let closestIndex = 0;
        let closestDistance = Infinity;
        for (let i = 0; i < route.length; i++) {
            const distance = getDistance(route[i], location);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = i;
            }
        }

        let startIndex = closestIndex;
        while (startIndex < route.length - 1) {
            const toCurrent = getDistance(route[startIndex], location);
            const toNext = getDistance(route[startIndex + 1], location);
            if (toNext < toCurrent || toCurrent < 12) {
                startIndex += 1;
            } else {
                break;
            }
        }

        const remaining = route.slice(startIndex);
        if (!remaining.length) return [{ ...location }];

        const head = remaining[0];
        if (getDistance(head, location) < 3) {
            return remaining;
        }
        return [{ latitude: location.latitude, longitude: location.longitude }, ...remaining];
    };

    //Smoothly slide the car marker to its new position instead of snapping instantly
    useEffect(() => {
        if (!driverLocation) return;

        if (!animatedCoordinate.current) {
            animatedCoordinate.current = new AnimatedRegion({
                latitude: driverLocation.latitude,
                longitude: driverLocation.longitude,
                latitudeDelta: 0,
                longitudeDelta: 0,
            });
            return;
        }

        animatedCoordinate.current.timing({
            latitude: driverLocation.latitude,
            longitude: driverLocation.longitude,
            duration: 1000,
            useNativeDriver: false,
        }).start();
    }, [driverLocation]);

    //Fetch line + students
    useEffect(() => {
        let studentUnsubscribes = [];

        const fetchData = async () => {
            try {
                // ✅ 1. Get line
                const lineRef = doc(DB, "lines", lineID);
                const lineSnap = await getDoc(lineRef);

                if (!lineSnap.exists()) return;

                const lineData = lineSnap.data();
                setLine(lineData);

                const riderIds = lineData.riders || [];

                if (riderIds.length === 0) {
                    setStudents([]);
                    return;
                }

                // ✅ 2. Listen live to each student so home/school location edits
                // made from the student app show up on the map immediately
                studentUnsubscribes = riderIds.map((id) =>
                    onSnapshot(doc(DB, "students", id), (studentSnap) => {
                        if (!studentSnap.exists()) return;
                        const studentData = { id, ...studentSnap.data() };

                        setStudents((prev) => {
                            const exists = prev.some((s) => s.id === id);
                            return exists
                                ? prev.map((s) => (s.id === id ? studentData : s))
                                : [...prev, studentData];
                        });
                    })
                );

            } catch (error) {
                console.log("Line details error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        return () => {
            studentUnsubscribes.forEach((unsub) => unsub());
        };
    }, [lineID]);

    //Fetch today's active trip for this line (if driver already started one)
    useEffect(() => {
        const fetchActiveTrip = async () => {
            try {
                const tripsQuery = query(
                    collection(DB, "trips"),
                    where("line_id", "==", lineID),
                    where("status", "==", "in_progress")
                );
                const snap = await getDocs(tripsQuery);

                if (!snap.empty) {
                    const tripDoc = snap.docs[0];
                    setTrip({ id: tripDoc.id, ...tripDoc.data() });
                }
            } catch (error) {
                console.log("Fetch active trip error:", error);
            }
        };

        if (lineID) fetchActiveTrip();
    }, [lineID]);

    //Limit a student's name to two words for the marker label
    const limitNameToTwoWords = (name = "") => {
        return name.trim().split(" ").filter(Boolean).slice(0, 2).join(" ");
    };

    //Start a new trip for this line
    const startTrip = (direction) => {
        if (!direction) {
            // Ask the driver which leg of the day this is, so the trip log can
            // report the morning (home→school) and afternoon (school→home) runs separately
            Alert.alert(
                "اتجاه الرحلة",
                "ما هو اتجاه هذه الرحلة؟",
                [
                    { text: "من البيت إلى المدرسة", onPress: () => startTrip("to_school") },
                    { text: "من المدرسة إلى البيت", onPress: () => startTrip("to_home") },
                    { text: "إلغاء", style: "cancel" },
                ]
            );
            return;
        }

        createTrip(direction);
    };

    const createTrip = async (direction) => {
        if (!students.length) {
            Alert.alert("تنبيه", "لا يوجد طلاب في هذا الخط");
            return;
        }

        try {
            setTripActionLoading(true);

            const studentsStatus = {};
            students.forEach((s) => {
                studentsStatus[s.id] = "waiting";
            });

            const tripRef = await addDoc(collection(DB, "trips"), {
                line_id: lineID,
                driver_id: line.driver_id,
                direction,
                status: "in_progress",
                students: studentsStatus,
                started_at: serverTimestamp(),
                ended_at: null,
            });

            setTrip({
                id: tripRef.id,
                line_id: lineID,
                driver_id: line.driver_id,
                direction,
                status: "in_progress",
                students: studentsStatus,
            });

            // 🔔 Notify each student's parent that the trip has started
            students.forEach((s) => {
                notifyEvent({
                    target: "student",
                    studentId: s.id,
                    type: "trip_started",
                    pushTitle: "بدأت الرحلة",
                    pushBody: `انطلق السائق في طريقه لاصطحاب ${s.name}`,
                    title: "بدأت الرحلة",
                });
            });

        } catch (error) {
            console.log("Start trip error:", error);
            Alert.alert("خطأ", "حدث خطأ أثناء بدء الرحلة");
        } finally {
            setTripActionLoading(false);
        }
    };

    //Update a single student's status within the active trip
    const updateStudentStatus = async (student, status) => {
        if (!trip) return;

        try {
            await updateDoc(doc(DB, "trips", trip.id), {
                [`students.${student.id}`]: status,
            });

            setTrip((prev) => ({
                ...prev,
                students: { ...prev.students, [student.id]: status },
            }));

            const messages = {
                picked_up: { type: "student_picked_up", pushTitle: "تم الصعود", pushBody: `صعد ${student.name} إلى الباص` },
                absent: { type: "student_absent", pushTitle: "غياب", pushBody: `${student.name} لم يصعد إلى الباص` },
                dropped_off: { type: "student_dropped_off", pushTitle: "تم التوصيل", pushBody: `تم توصيل ${student.name} إلى المدرسة بأمان` },
            };

            const msg = messages[status];
            if (msg) {
                notifyEvent({
                    target: "student",
                    studentId: student.id,
                    type: msg.type,
                    pushTitle: msg.pushTitle,
                    pushBody: msg.pushBody,
                    title: msg.pushTitle,
                });
            }

            setSelectedStudent(null);
        } catch (error) {
            console.log("Update student status error:", error);
            Alert.alert("خطأ", "حدث خطأ أثناء تحديث حالة الطالب");
        }
    };

    //End the active trip
    const endTrip = async () => {
        if (!trip) return;

        try {
            setTripActionLoading(true);

            await updateDoc(doc(DB, "trips", trip.id), {
                status: "completed",
                ended_at: serverTimestamp(),
            });

            setTrip(null);
        } catch (error) {
            console.log("End trip error:", error);
            Alert.alert("خطأ", "حدث خطأ أثناء إنهاء الرحلة، لكن سيتم إخراجك من الشاشة");
        } finally {
            setTripActionLoading(false);
            // ✅ Always leave the tracking screen once the driver ends the trip,
            // even if the Firestore update above failed
            router.replace("/(main)/(tabs)/home");
        }
    };

    //Find the next student pending an action (pickup phase, then dropoff phase)
    const getNextPendingStudent = () => {
        if (!trip) return null;

        const nextWaiting = students.find((s) => trip.students?.[s.id] === "waiting");
        if (nextWaiting) return { student: nextWaiting, phase: "pickup" };

        const nextPickedUp = students.find((s) => trip.students?.[s.id] === "picked_up");
        if (nextPickedUp) return { student: nextPickedUp, phase: "dropoff" };

        return null;
    };

    //Main trip-status button: starts the trip, then advances student by student
    const handleTripStatusPress = () => {
        if (!trip) {
            startTrip();
            return;
        }

        const next = getNextPendingStudent();

        if (!next) {
            endTrip();
            return;
        }

        updateStudentStatus(next.student, next.phase === "pickup" ? "picked_up" : "dropped_off");
    };

    const getTripStatusLabel = () => {
        if (!trip) return "بدء الرحلة";

        const next = getNextPendingStudent();

        if (!next) return "إنهاء الرحلة";

        const index = students.findIndex((s) => s.id === next.student.id) + 1;

        return next.phase === "pickup"
            ? `ركب الطالب ${index}: ${next.student.name}`
            : `وصل الطالب ${index}: ${next.student.name}`;
    };

    //Get driver real location
    useEffect(() => {
        let subscription;

        const getLocation = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();

            if (status !== "granted") {
                console.log("Location permission denied");
                return;
            }

            //Get initial position
            const location = await Location.getCurrentPositionAsync({});
            setDriverLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            });

            // Watch position (REAL-TIME)
            subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    distanceInterval: 30,
                },
                (loc) => {
                    const newLoc = {
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                    };

                    updateHeading(loc, newLoc);

                    //Save location locally
                    setDriverLocation(newLoc);

                    // 🔥 SAVE TO DB
                    saveDriverLocation(newLoc, headingRef.current);
                }
            );
        };

        getLocation();

        return () => {
            if (subscription) {
                subscription.remove();
            }
        };
    }, []);

    //Update heading using the geometric bearing between real GPS points as the primary
    //source (always correct for the actual turn made), falling back to the device's raw
    //GPS course only when movement is too small to compute a reliable bearing — the raw
    //course lags/misreports during sharp turns (90°/180°/270°), which caused wrong "sideways" angles
    const updateHeading = (loc, newLoc) => {
        const MIN_DISTANCE = 8; // meters - below this, bearing between points is too noisy to trust
        const MIN_SPEED = 1; // m/s (~3.6 km/h)
        let rawHeading = null;

        const prevLoc = lastSavedLocation.current;
        if (prevLoc) {
            const distance = getDistance(prevLoc, newLoc);
            if (distance > MIN_DISTANCE) {
                rawHeading = getBearing(prevLoc, newLoc);
            }
        }

        if (rawHeading == null && loc.coords.heading != null && loc.coords.heading >= 0 && (loc.coords.speed || 0) > MIN_SPEED) {
            rawHeading = loc.coords.heading;
        }

        if (rawHeading == null) return; // keep previous heading, avoid noisy rotation

        // Ignore tiny direction changes and snap to 5° steps for a stable rotation
        const prevHeading = headingRef.current;
        const diff = Math.abs(((rawHeading - prevHeading + 540) % 360) - 180);

        if (diff < 10) return;

        const heading = Math.round(rawHeading / 5) * 5;

        headingRef.current = heading;
        setDriverHeading(heading);
    };

    //Compute compass bearing (0-360°) between two coordinates
    const getBearing = (start, end) => {
        const toRad = (value) => (value * Math.PI) / 180;
        const toDeg = (value) => (value * 180) / Math.PI;

        const startLat = toRad(start.latitude);
        const startLng = toRad(start.longitude);
        const endLat = toRad(end.latitude);
        const endLng = toRad(end.longitude);

        const y = Math.sin(endLng - startLng) * Math.cos(endLat);
        const x =
            Math.cos(startLat) * Math.sin(endLat) -
            Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);

        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    };

    const getDistance = (loc1, loc2) => {
        const toRad = (value) => (value * Math.PI) / 180;

        const R = 6371e3; // meters
        const φ1 = toRad(loc1.latitude);
        const φ2 = toRad(loc2.latitude);
        const Δφ = toRad(loc2.latitude - loc1.latitude);
        const Δλ = toRad(loc2.longitude - loc1.longitude);

        const a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) *
                Math.cos(φ2) *
                Math.sin(Δλ / 2) *
                Math.sin(Δλ / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    };

    //Save driver location update
    const saveDriverLocation = async (newLocation, heading = 0) => {
        try {
            if (!line?.driver_id) return;

            const now = Date.now();

            const MIN_DISTANCE = 100; // meters
            const MIN_TIME = 60000; // 60 sec

            const lastLoc = lastSavedLocation.current;

            let shouldUpdate = false;

            if (!lastLoc) {
                shouldUpdate = true;
            } else {
                const distance = getDistance(lastLoc, newLocation);
                const timeDiff = now - lastUpdateTime.current;

                if (distance > MIN_DISTANCE || timeDiff > MIN_TIME) {
                    shouldUpdate = true;
                }
            }

            if (!shouldUpdate) return;

            // 🔥 update Firestore
            const driverRef = doc(DB, "drivers", line.driver_id);

            await updateDoc(driverRef, {
                location: newLocation,
                heading,
            });

            // ✅ update refs
            lastSavedLocation.current = newLocation;
            lastUpdateTime.current = now;

        } catch (error) {
            console.log("Location save error:", error);
        }
    };

    //Center map
    const fitMap = (driverLocation = null) => {
        if (!mapRef.current) return;

        const coords = [];

        // ✅ school
        if (destination) {
            coords.push({
                latitude: destination.latitude,
                longitude: destination.longitude,
            });
        }

        // ✅ students
        students.forEach((s) => {
            if (s.home_location) {
                coords.push({
                    latitude: s.home_location.latitude,
                    longitude: s.home_location.longitude,
                });
            }
        });

        // ✅ driver
        if (driverLocation) {
            coords.push({
                latitude: driverLocation.latitude,
                longitude: driverLocation.longitude,
            });
        }

        if (coords.length === 0) return;

        mapRef.current.fitToCoordinates(coords, {
            edgePadding: {
                top: 100,
                right: 50,
                bottom: 200,
                left: 50,
            },
            animated: true,
        });
    };

    useEffect(() => {
        if (!loading && line && driverLocation && !hasAutoFitted.current) {
            hasAutoFitted.current = true;
            setTimeout(() => {
                fitMap();
            }, 500);
        }
    }, [loading, students, driverLocation]);

    //make a call
    const handleCall = (phone) => {
        if (!phone) return;
        Linking.openURL(`tel:${phone}`);
    };

    if (loading || !line) {
        return (
            <View style={styles.loader}>
                <ActivityIndicator size="large" color="#D4AF37" />
                <Text style={styles.loaderText}>جاري تحميل الخط...</Text>
            </View>
        );
    }

    const destination = line.destination_location;
    const schoolName = line.destination;

    return (
        <View style={styles.container}>
            <MapView
                ref={mapRef}
                provider="google" 
                initialRegion={{
                    latitude: destination.latitude,
                    longitude: destination.longitude,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                }}
                showsUserLocation={false}
                showsMyLocationButton={true}
                style={StyleSheet.absoluteFillObject}
            >
                {/* Road route (fetched from OpenStreetMap/OSRM), drawn on top of the Google map */}
                {routeCoordinates.length > 0 && (
                    <Polyline
                        coordinates={routeCoordinates}
                        strokeWidth={4}
                        strokeColor="#2563eb"
                    />
                )}

                {driverLocation && animatedCoordinate.current && (
                    <MarkerAnimated
                        coordinate={animatedCoordinate.current}
                        anchor={{ x: 0.5, y: 0.5 }}
                        flat
                        rotation={driverHeading}
                        tracksViewChanges={!carIconReady}
                        zIndex={999}
                    >
                        <Image
                            source={car}
                            style={styles.carMarker}
                            resizeMode="contain"
                            onLoad={() => setCarIconReady(true)}
                        />
                    </MarkerAnimated>
                )}

                <Marker
                    coordinate={destination}
                    tracksViewChanges={!schoolIconReady}
                    zIndex={1}
                >
                    <View style={styles.markerContainer}>
                        <Image
                            source={school}                 
                            style={{width: 35,height: 35}}
                            resizeMode="contain"
                            onLoad={() => setSchoolIconReady(true)}
                        />
                        <View style={styles.labelContainer}>
                            <Text style={styles.schoolLabelText}>
                                {schoolName}
                            </Text>
                        </View>
                    </View>
                </Marker>

                {students.map((student) => {
                    if (!student.home_location) return null;
                    const isFemale = student.sex === "female";
                    const defaultIcon = isFemale ? female : male;
                    const studentStatus = trip?.students?.[student.id];

                    return (
                        <Marker
                            key={student.id}
                            identifier={student.id}
                            coordinate={student.home_location}
                            tracksViewChanges={!readyStudentIcons[student.id]}
                            zIndex={1}
                            onPress={() => {
                                setSelectedStudent(student);
                            }}
                        >
                            <View style={styles.markerContainer}>
                                <View style={[styles.labelContainer, STATUS_COLORS[studentStatus] && { backgroundColor: STATUS_COLORS[studentStatus] }]}>
                                    <Text style={styles.labelText} numberOfLines={1}>
                                        {limitNameToTwoWords(student.name)}
                                    </Text>
                                </View>
                                {student.photo_url ? (
                                    <Image
                                        source={{ uri: student.photo_url }}
                                        style={styles.studentPhoto}
                                        resizeMode="cover"
                                        onLoad={() => setReadyStudentIcons((prev) => ({ ...prev, [student.id]: true }))}
                                    />
                                ) : (
                                    <Image
                                        source={defaultIcon}
                                        style={styles.markerImage}
                                        resizeMode="contain"
                                        onLoad={() => setReadyStudentIcons((prev) => ({ ...prev, [student.id]: true }))}
                                    />
                                )}
                            </View>
                        </Marker>
                    );
                })}

            </MapView>

            <View style={styles.mapControls}>
                <TouchableOpacity
                    style={styles.controlBtn}
                    onPress={() => router.replace("/(main)/(tabs)/home")}
                >
                    <Ionicons name="arrow-back" size={22} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.controlBtn}
                    onPress={() => fitMap()}
                >
                    <Ionicons name="locate" size={22} color="#fff" />
                </TouchableOpacity>
            </View>

            <View style={styles.tripStatusWrapper}>
                <TouchableOpacity
                    style={styles.tripStatusBtn}
                    onPress={handleTripStatusPress}
                    disabled={tripActionLoading}
                >
                    {tripActionLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.tripStatusBtnText}>{getTripStatusLabel()}</Text>
                    )}
                </TouchableOpacity>
            </View>

            {selectedStudent && (
                <View style={styles.popupContainer}>

                    <View style={styles.popupHeader}>
                        <Text style={styles.popupTitle}>معلومات الطالب</Text>
                        <TouchableOpacity onPress={() => setSelectedStudent(null)}>
                            <Ionicons name="close-circle-outline" size={24} color="black" />
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.studentName}>
                        {selectedStudent.name} {selectedStudent.parent_name}
                    </Text>

                    <View style={styles.row}>
                        <Text style={styles.label}>رقم الهاتف:</Text>
                        <Text style={styles.value}>
                            {selectedStudent.phone_number || "غير متوفر"}
                        </Text>
                    </View>

                    {trip && (
                        <View style={styles.statusButtonsRow}>
                            {trip.students?.[selectedStudent.id] === "waiting" && (
                                <>
                                    <TouchableOpacity
                                        style={[styles.statusButton, styles.pickedUpButton]}
                                        onPress={() => updateStudentStatus(selectedStudent, "picked_up")}
                                    >
                                        <Text style={styles.statusButtonText}>تم الصعود</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.statusButton, styles.absentButton]}
                                        onPress={() => updateStudentStatus(selectedStudent, "absent")}
                                    >
                                        <Text style={styles.statusButtonText}>غياب</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                            {trip.students?.[selectedStudent.id] === "picked_up" && (
                                <TouchableOpacity
                                    style={[styles.statusButton, styles.droppedOffButton]}
                                    onPress={() => updateStudentStatus(selectedStudent, "dropped_off")}
                                >
                                    <Text style={styles.statusButtonText}>تم التوصيل</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.callButton}
                        onPress={() => handleCall(selectedStudent.phone_number)}
                    >
                        <Text style={styles.callText}>اتصال</Text>
                        <Ionicons name="call-outline" size={22} color="#fff" />
                    </TouchableOpacity>
                </View>
            )}

        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f8f9fa",
    },
    loader: {
        flex: 1,
        backgroundColor: "#f8f9fa",
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
    },
    loaderText: {
        fontFamily: "NotoArabicRegular",
        color: "#6b7280",
        fontSize: 13,
    },
    markerContainer: {
        alignItems: 'center',
    },
    markerImage: {
        width: 35,
        height: 35,
    },
    studentPhoto: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: "#fff",
    },
    carMarker: {
        width: 70,
        height: 70,
    },
    labelContainer: {
        marginBottom: 2,
        backgroundColor: "#f59e0b",
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 6,
        elevation: 2,
    },
    labelText: {
        fontSize: 10,
        fontFamily: "NotoArabicBold",
        color: "#fff",
        textAlign: "center",
        maxWidth: 70,
    },
    schoolLabelText: {
        fontSize: 10,
        fontFamily: "NotoArabicBold",
        color: "#fff",
        textAlign: "center",
        maxWidth: 140,
    },
    mapControls: {
        position: "absolute",
        bottom: 120,
        left: 0,
        right: 0,
        flexDirection: "row",
        justifyContent: "center",
        gap: 20,
    },
    controlBtn: {
        width: 45,
        height: 45,
        borderRadius: 25,
        backgroundColor: "#2563eb",
        justifyContent: "center",
        alignItems: "center",
        elevation: 5,
    },
    tripStatusWrapper: {
        position: "absolute",
        bottom: 55,
        left: 20,
        right: 20,
    },
    tripStatusBtn: {
        backgroundColor: "#D4AF37",
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
        elevation: 6,
    },
    tripStatusBtnText: {
        color: "#fff",
        fontFamily: "NotoArabicBold",
        fontSize: 15,
        textAlign: "center",
    },
    statusButtonsRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 10,
    },
    statusButton: {
        flex: 1,
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: "center",
    },
    pickedUpButton: {
        backgroundColor: "#16a34a",
    },
    absentButton: {
        backgroundColor: "#dc2626",
    },
    droppedOffButton: {
        backgroundColor: "#2563eb",
    },
    statusButtonText: {
        color: "#fff",
        fontFamily: "NotoArabicBold",
        fontSize: 13,
    },
    popupContainer: {
        position: "absolute",
        bottom: 45,
        left: 0,
        right: 0,
        backgroundColor: "#fff",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 16,
        elevation: 10,
    },
    popupHeader: {
        flexDirection: "row-reverse",
        alignItems: "center",
        marginBottom: 10,
    },
    popupTitle: {
        flex:1,
        textAlign:'center',
        fontFamily: "NotoArabicBold",
        fontSize: 14,
        color: "#111",
    },
    closeBtn: {
        fontSize: 18,
        color: "#777",
    },
    studentName: {
        fontFamily: "NotoArabicBold",
        fontSize: 14,
        color:'#000',
        marginBottom: 10,
        textAlign: "right",
    },
    row: {
        flexDirection: "row-reverse",
        marginBottom: 6,
    },
    label: {
        fontFamily: "NotoArabicBold",
        fontSize: 14,
        color: "#000",
        marginLeft: 5,
    },
    value: {
        fontFamily: "NotoArabicRegular",
        fontSize: 14,
        color: "#000",
    },
    callButton: {
        flexDirection:'row-reverse',
        justifyContent:'center',
        alignItems:'center',
        gap:20,
        backgroundColor: "#10b981",
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: "center",
        marginVertical: 10,
    },
    callText: {
        color: "#fff",
        fontFamily: "NotoArabicBold",
    },
});