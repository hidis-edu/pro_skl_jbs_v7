import { db, auth, doc, setDoc, serverTimestamp } from "@/firebase";

export async function syncBiometricsToFirestore(biometrics: any[], userId: string) {
  if (!biometrics.length) return;

  // Use the provided userId (which should be the student's UID)
  // Fallback to current user if not provided
  const targetUid = userId || auth.currentUser?.uid;

  if (!targetUid) {
    console.warn("BiometricSync: No userId available for sync");
    return;
  }

  console.log(`BiometricSync: Syncing ${biometrics.length} records for target UID: ${targetUid}`);

  const promises = biometrics.map(async (record) => {
    // Create a unique ID for the record to avoid duplicates
    const statusSuffix = record.status ? `_${record.status}` : '';
    const datePart = record.tanggal && typeof record.tanggal === 'string' && record.tanggal.includes('T') 
      ? record.tanggal.split('T')[0] 
      : String(record.tanggal || new Date().toISOString().split('T')[0]);
    
    const jamPart = record.jam && typeof record.jam === 'string' 
      ? record.jam.replace(/:/g, '-') 
      : '00-00-00';
      
    const biometricId = `${record.nomor_induk}_${datePart}_${jamPart}_${record.type}${statusSuffix}`;
    
    const docRef = doc(db, "biometrics", biometricId);
    
    try {
      const dataToSave: any = {
        nomor_induk: String(record.nomor_induk),
        nama: String(record.nama || "Unknown"),
        tanggal: String(datePart),
        jam: String(record.jam || "00:00:00"),
        type: record.type === 'FaceID' || record.type === 'Fingerprint' ? record.type : 'Fingerprint',
        userId: targetUid,
        createdAt: serverTimestamp()
      };

      if (record.id) dataToSave.id = String(record.id);
      if (record.status) dataToSave.status = String(record.status);
      if (record.keterangan) dataToSave.keterangan = String(record.keterangan);
      if (record.machine_id) dataToSave.machine_id = String(record.machine_id);
      if (record.face_token) dataToSave.face_token = String(record.face_token);

      await setDoc(docRef, dataToSave, { merge: true });
    } catch (error) {
      console.error(`BiometricSync: Failed to sync record ${biometricId}:`, error);
      // If it's a permission error, it's likely the UID mismatch or rule validation
    }
  });

  try {
    await Promise.all(promises);
    console.log("Biometric sync completed successfully");
  } catch (error) {
    console.error("Error during biometric sync batch:", error);
  }
}
