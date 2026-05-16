import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };

async function checkSettings() {
  try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    const docRef = doc(db, "settings", "global");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      console.log("FIRESTORE_DATA:", JSON.stringify(snap.data()));
    } else {
      console.log("FIRESTORE_DATA: NOT_FOUND");
    }
  } catch (err) {
    console.error("FIRESTORE_ERROR:", err);
  }
  process.exit(0);
}

checkSettings();
