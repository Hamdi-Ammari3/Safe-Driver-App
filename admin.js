// scripts/admin.js
// Utility script for direct Firestore data access via firebase-admin SDK.
// Usage examples (from project root):
//   node scripts/admin.js list students
//   node scripts/admin.js list classes
//
// Requires the service account key file to exist at the path below.

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");

const serviceAccount = require(
  path.join(__dirname, "..", "sayartech-871ac-firebase-adminsdk-b97uj-263b9b5c31.json")
);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function listCollection(name, limit = 20) {
  const snap = await db.collection(name).limit(limit).get();
  if (snap.empty) {
    console.log(`No documents found in "${name}".`);
    return;
  }
  snap.forEach((doc) => {
    console.log(doc.id, "=>", JSON.stringify(doc.data(), null, 2));
  });
}

async function main() {
  const [, , action, collectionName] = process.argv;

  if (action === "list" && collectionName) {
    await listCollection(collectionName);
  } else {
    console.log("Usage: node scripts/admin.js list <collectionName>");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
