import axios from "axios";
import { Express } from "express";
import FormData from "form-data";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  doc, 
  updateDoc, 
  getDoc,
  query,
  where,
  getDocs,
  limit
} from "firebase/firestore";

const EXTERNAL_API_BASE = "https://api.hidis.id/api/custom";

const syncKonfirmasiToMySQL = async (identifier: string, type: 'siswa' | 'psb', data: any) => {
  try {
    console.log(`Finance API: Sending Konfirmasi to MySQL for ${type} ${identifier}...`);
    
    const form = new FormData();
    form.append('id_tagihan', data.id_tagihan);
    form.append('nominal', data.nominal);
    form.append('bank', data.bank);
    form.append('pengirim', data.pengirim);
    form.append('catatan', data.catatan || "");

    // Handle base64 photo
    if (data.foto && data.foto.includes('base64,')) {
      const base64Data = data.foto.split('base64,')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      form.append('foto', buffer, {
        filename: `bukti_${Date.now()}.jpg`,
        contentType: 'image/jpeg',
      });
    }

    const endpoint = type === 'psb' ? `/konfirmasi/psb/${identifier}` : `/konfirmasi/siswa/${identifier}`;
    const response = await axios.post(`${EXTERNAL_API_BASE}${endpoint}`, form, {
      headers: {
        ...form.getHeaders()
      }
    });

    console.log("Finance API: MySQL Konfirmasi successful:", response.data);
    return response.data; // Returns { status, pesan, replid }
  } catch (error: any) {
    console.error("Finance API: MySQL Konfirmasi failed:", error.response?.data || error.message);
    return null;
  }
};

const syncRekapToMySQL = async (identifier: string) => {
  try {
    console.log(`Finance API: Sending Rekap to MySQL for NIS ${identifier}...`);
    const response = await axios.get(`${EXTERNAL_API_BASE}/rekap/${identifier}`);
    console.log("Finance API: MySQL Rekap successful:", response.data);
    return response.data;
  } catch (error: any) {
    console.error("Finance API: MySQL Rekap failed:", error.response?.data || error.message);
    return null;
  }
};

const syncVerifikasiToMySQL = async (type: 'siswa' | 'psb', idKonfirmasi: string | number, data: any) => {
  try {
    console.log(`Finance API: Sending Verifikasi to MySQL for ${type} ID ${idKonfirmasi}...`);
    const endpoint = `/verifikasi/${type}/${idKonfirmasi}`;
    const response = await axios.post(`${EXTERNAL_API_BASE}${endpoint}`, data);
    console.log("Finance API: MySQL Verifikasi successful:", response.data);
    
    // After verification, trigger rekap if it's a student
    if (data.status_admin === 1 && type === 'siswa') {
      const identifier = data.nis || data.studentNis;
      if (identifier) {
        await syncRekapToMySQL(identifier);
      }
    }
    
    return response.data;
  } catch (error: any) {
    console.error("Finance API: MySQL Verifikasi failed:", error.response?.data || error.message);
    return null;
  }
};

export const setupFinanceRoutes = (app: Express, db: any) => {
  console.log("Finance API: Setting up routes...");
  
  // Endpoint Konfirmasi Pembayaran
  app.post("/api/custom/konfirmasi/:identifier", async (req, res) => {
    const { identifier } = req.params;
    const { id_tagihan, nominal, bank, pengirim, foto, catatan, type } = req.body;
    
    // Default to 'siswa' if type not provided
    const userType = type === 'psb' ? 'psb' : 'siswa';

    console.log(`Finance API: Received konfirmasi for ${userType} ${identifier}`, { id_tagihan, nominal, pengirim });

    if (!id_tagihan || !nominal || !pengirim) {
      return res.status(400).json({ 
        status: "error", 
        message: "id_tagihan, nominal, and pengirim are required" 
      });
    }

    try {
      // 1. Sync to MySQL first to get the replid
      const mysqlResult = await syncKonfirmasiToMySQL(identifier, userType, {
        id_tagihan,
        nominal,
        bank,
        pengirim,
        foto,
        catatan
      });

      if (!mysqlResult || mysqlResult.status !== 'sukses') {
        return res.status(500).json({
          status: "error",
          message: mysqlResult?.pesan || "Gagal sinkronisasi ke server MySQL utama."
        });
      }

      const mysqlId = mysqlResult.replid; // User's API returns 'replid'

      // 2. Save to Firestore for internal tracking
      const paymentData = {
        billId: id_tagihan.toString(),
        billName: catatan || "Konfirmasi Pembayaran",
        studentNis: identifier,
        studentName: pengirim,
        amount: Number(nominal),
        proofPhoto: foto || "",
        bank: bank || "",
        notes: catatan || "",
        status: "waiting",
        type: userType, // Store type for verification
        mysqlId: mysqlId,
        createdAt: new Date().toISOString(),
        createdBy: "system",
        server_timestamp: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, "payments"), paymentData);
      
      res.json({ 
        status: "sukses", 
        message: mysqlResult?.pesan || "Konfirmasi pembayaran berhasil dikirim",
        data: { 
          id: docRef.id,
          mysqlId: mysqlId
        }
      });
    } catch (error: any) {
      console.error("Finance API Error (konfirmasi):", error);
      res.status(500).json({ 
        status: "error", 
        message: error.message || "Gagal mengirim konfirmasi pembayaran"
      });
    }
  });

  // Endpoint Verifikasi Pembayaran
  app.post("/api/custom/verifikasi/:id_identifier", async (req, res) => {
    const { id_identifier } = req.params;
    const { status_admin, admin_name, admin_nip, pesan } = req.body;

    try {
      // Find the document in Firestore
      const paymentRef = doc(db, "payments", id_identifier);
      let paymentSnap = await getDoc(paymentRef);
      let docId = id_identifier;
      let docData: any = null;

      if (paymentSnap.exists()) {
        docData = paymentSnap.data();
      } else {
        // Try searching by mysqlId
        const q = query(
          collection(db, "payments"), 
          where("mysqlId", "==", id_identifier),
          limit(1)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          docId = querySnapshot.docs[0].id;
          docData = querySnapshot.docs[0].data();
          paymentSnap = querySnapshot.docs[0] as any;
        }
      }

      if (!docData) {
        return res.status(404).json({ 
          status: "error", 
          message: "Data pembayaran tidak ditemukan" 
        });
      }

      const mysqlId = docData.mysqlId;
      const userType = docData.type || 'siswa';

      // 1. Sync to MySQL Verifikasi
      const mysqlResult = await syncVerifikasiToMySQL(userType, mysqlId, {
        status_admin,
        admin_name,
        admin_nip,
        pesan,
        nis: docData.studentNis
      });

      if (!mysqlResult || mysqlResult.status !== 'sukses') {
        return res.status(500).json({
          status: "error",
          message: mysqlResult?.pesan || "Gagal sinkronisasi verifikasi ke server MySQL utama."
        });
      }

      // 2. Update Firestore
      const finalDocRef = doc(db, "payments", docId);
      await updateDoc(finalDocRef, {
        status: status_admin === 1 ? "verified" : "rejected",
        verifiedAt: new Date().toISOString(),
        verifiedBy: admin_name,
        adminNip: admin_nip || "",
        adminMessage: pesan || "",
        updatedAt: serverTimestamp()
      });

      res.json({ 
        status: "sukses", 
        message: "Verifikasi pembayaran berhasil diperbarui" 
      });
    } catch (error: any) {
      console.error("Error in verifikasi pembayaran:", error);
      res.status(500).json({ 
        status: "error", 
        message: "Gagal memproses verifikasi pembayaran",
        details: error.message 
      });
    }
  });
  // Endpoint Rekap (Manual trigger)
  app.get("/api/custom/rekap/:nis", async (req, res) => {
    const { nis } = req.params;
    try {
      const result = await syncRekapToMySQL(nis);
      res.json(result || { status: 'error', pesan: 'Gagal sinkronisasi rekap' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', pesan: error.message });
    }
  });

  // Proxy JIBAS Finance Info
  app.get("/api/jbsfina/:identifier", async (req, res) => {
    const { identifier } = req.params;
    try {
      const configDoc = await getDoc(doc(db, "settings", "global"));
      const config = configDoc.exists() ? configDoc.data() : { jibasApiUrl: "https://api.hidis.id" };
      const baseUrl = config.jibasApiUrl || "https://api.hidis.id";
      
      const response = await axios.get(`${baseUrl}/api/jbsfina/${identifier}`);
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // Proxy JIBAS Finance Bills (Siswa)
  app.get("/api/jbsfina/tagihan/:nis", async (req, res) => {
    const { nis } = req.params;
    try {
      const configDoc = await getDoc(doc(db, "settings", "global"));
      const config = configDoc.exists() ? configDoc.data() : { jibasApiUrl: "https://api.hidis.id" };
      const baseUrl = config.jibasApiUrl || "https://api.hidis.id";
      
      const response = await axios.get(`${baseUrl}/api/jbsfina/tagihan/${nis}`);
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // Proxy JIBAS Finance Bills (PSB)
  app.get("/api/jbsfina/tagihan-calon/:nopendaftaran", async (req, res) => {
    const { nopendaftaran } = req.params;
    try {
      const configDoc = await getDoc(doc(db, "settings", "global"));
      const config = configDoc.exists() ? configDoc.data() : { jibasApiUrl: "https://api.hidis.id" };
      const baseUrl = config.jibasApiUrl || "https://api.hidis.id";
      
      const response = await axios.get(`${baseUrl}/api/jbsfina/tagihan-calon/${nopendaftaran}`);
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // Endpoint Riwayat Pembayaran dari MySQL
  app.get("/api/custom/history/:identifier", async (req, res) => {
    const { identifier } = req.params;
    const { type } = req.query;
    const userType = type === 'psb' ? 'psb' : 'siswa';

    try {
      console.log(`Finance API: Fetching history from MySQL for ${userType} ${identifier}...`);
      const endpoint = userType === 'psb' ? `/history/psb/${identifier}` : `/history/siswa/${identifier}`;
      const response = await axios.get(`${EXTERNAL_API_BASE}${endpoint}`);
      
      // Map MySQL results to PaymentRequest format if needed, or just return as is
      // Assuming the external API returns a list of payments
      res.json(response.data);
    } catch (error: any) {
      console.error("Finance API: MySQL History failed:", error.response?.data || error.message);
      // Return empty list instead of error to prevent UI stuck
      res.json({ status: "sukses", data: [] });
    }
  });
};
