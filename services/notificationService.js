import axios from "axios";

const API_BASE = "https://us-central1-sayartech-871ac.cloudfunctions.net/api";

export async function notifyEvent({
  target,
  schoolId,
  classId,
  studentId,
  type,
  pushTitle,
  pushBody,
  title,
  details,
  saveNotification = true
}) {
  try {
    await axios.post(`${API_BASE}/notify/event`, {
      target,
      schoolId,
      classId,
      studentId,
      type,
      pushTitle,
      pushBody,
      title,
      details,
      saveNotification
    });
  } catch (err) {
    console.log("notifyEvent error:", err.response?.data || err.message);
  }
}
