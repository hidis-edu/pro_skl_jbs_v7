import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";
import axios from "axios";
import dotenv from "dotenv";
import { initializeApp as initializeClientApp } from "firebase/app";
import { 
  getFirestore as getClientFirestore, 
  doc as clientDoc, 
  onSnapshot as clientOnSnapshot, 
  getDoc as clientGetDoc,
  collection as clientCollection,
  query as clientQuery,
  orderBy as clientOrderBy,
  limit as clientLimit,
  getDocs as clientGetDocs,
  addDoc as clientAddDoc,
  serverTimestamp as clientServerTimestamp,
  setDoc as clientSetDoc
} from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };

dotenv.config();

// Initialize Firebase Client (Primary for all Firestore operations on server)
const clientApp = initializeClientApp(firebaseConfig);
const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

process.env.TZ = "Asia/Jakarta";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());

const parseCookies = (cookieHeader?: string) => {
  if (!cookieHeader) return {};
  return cookieHeader.split("; ").reduce((acc, cookie) => {
    const [name, ...rest] = cookie.split("=");
    acc[name] = rest.join("=");
    return acc;
  }, {} as Record<string, string>);
};

const createLoginSessionCookie = (userData: any) => {
  const sessionPayload = {
    nis: userData.nis || null,
    nopendaftaran: userData.nopendaftaran || null,
    nip: userData.nip || null,
    level: userData.level || null,
    nama: userData.nama || null,
  };
  const encoded = Buffer.from(JSON.stringify(sessionPayload)).toString("base64");
  return `jibas_session=${encodeURIComponent(encoded)}; Path=/; HttpOnly; SameSite=Lax`;
};

const getUserSessionFromRequest = (req: any) => {
  const cookies = parseCookies(req.headers?.cookie);
  if (!cookies.jibas_session) return null;
  try {
    const decoded = Buffer.from(decodeURIComponent(cookies.jibas_session), "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (error) {
    console.error("Failed to parse jibas_session cookie:", error);
    return null;
  }
};

const resolveFilenameFromSession = (filename: string, sessionUser: any) => {
  if (!sessionUser) return filename;
  if (!filename) return filename;

  let resolved = filename;
  if (resolved.includes("{nis}") && sessionUser.nis) {
    resolved = resolved.replace(/\{nis\}/gi, sessionUser.nis);
  }
  if (resolved.includes("{nopendaftaran}") && sessionUser.nopendaftaran) {
    resolved = resolved.replace(/\{nopendaftaran\}/gi, sessionUser.nopendaftaran);
  }
  if (resolved.includes("{nip}") && sessionUser.nip) {
    resolved = resolved.replace(/\{nip\}/gi, sessionUser.nip);
  }
  return resolved;
};

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Ensure APP_URL has a protocol
let appUrl = process.env.APP_URL || 'http://localhost:3000';
if (appUrl !== 'http://localhost:3000' && !appUrl.startsWith('http')) {
  appUrl = `https://${appUrl}`;
}
const REDIRECT_URI = `${appUrl}/auth/google/callback`;

console.log('OAuth Configuration:');
console.log('- REDIRECT_URI:', REDIRECT_URI);
console.log('- GOOGLE_CLIENT_ID:', GOOGLE_CLIENT_ID ? 'Configured' : 'MISSING');

// Google OAuth URL Endpoint
app.get('/api/auth/google/url', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_ID is not configured' });
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly https://www.googleapis.com/auth/classroom.announcements.readonly https://www.googleapis.com/auth/meetings.space.readonly',
    access_type: 'offline',
    prompt: 'consent'
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.json({ url: authUrl });
});

// Google OAuth Callback Handler
app.get(['/auth/google/callback', '/auth/google/callback/'], async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const { access_token, refresh_token, id_token } = response.data;
    
    // Fetch user info to get the email
    const googleUser = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const email = googleUser.data.email;

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'GOOGLE_AUTH_SUCCESS',
                tokens: ${JSON.stringify({ access_token, refresh_token, id_token })},
                email: "${email}"
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Google OAuth Error:', error);
    res.status(500).send('Authentication failed');
  }
});

// Helper to get current time in Asia/Jakarta
const getJakartaTime = () => {
  return new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
};

// Socket.io connection handling
const onlineUsers = new Map<string, Map<string, string>>(); // room -> Map<userId, userName>

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join_room", ({ room, user }) => {
    socket.join(room);
    const userId = user.nip || user.nis || user.nopendaftaran || user.replid || socket.id;
    const userName = user.nama || "Unknown User";
    // Store user info on socket for disconnect handling
    (socket as any).userId = userId;
    (socket as any).roomName = room;

    if (!onlineUsers.has(room)) {
      onlineUsers.set(room, new Map());
    }
    onlineUsers.get(room)!.set(userId, userName);

    console.log(`User ${userName} (${userId}) joined room: ${room}`);
    io.to(room).emit("online_users", Array.from(onlineUsers.get(room)!.values()));
  });

  socket.on("send_message", (data) => {
    // Broadcast to others in the same room for instant UI update
    io.to(data.chatgroup).emit("receive_message", {
      ...data,
      waktu_kirim_asli: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T"),
      replid: Math.floor(Math.random() * 1000000)
    });
  });

  socket.on("disconnect", () => {
    const userId = (socket as any).userId;
    const roomName = (socket as any).roomName;

    if (userId && roomName) {
      const users = onlineUsers.get(roomName);
      if (users) {
        users.delete(userId);
        console.log(`User ${userId} left room: ${roomName}`);
        io.to(roomName).emit("online_users", Array.from(users.values()));
      }
    }
    console.log("User disconnected:", socket.id);
  });
});

// Helper to sync data to Firestore
const syncToFirestore = async (collectionName: string, docId: string, data: any) => {
  try {
    const docRef = clientDoc(clientDb, collectionName, docId);
    await clientSetDoc(docRef, {
      ...data,
      lastSynced: clientServerTimestamp()
    }, { merge: true });
    console.log(`Synced ${collectionName}/${docId} to Firestore`);
  } catch (error) {
    console.error(`Error syncing to Firestore:`, error);
  }
};

// Global Chat (Umum) Endpoint
app.get("/api/jbsvcr/chat/Umum", async (req, res) => {
  try {
    const q = clientQuery(
      clientCollection(clientDb, "chat_umum"),
      clientOrderBy("waktu_kirim_asli", "desc"),
      clientLimit(50)
    );
    const snapshot = await clientGetDocs(q);
    
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })).reverse();
    
    res.json({ status: "sukses", data: messages });
  } catch (error) {
    console.error("Error fetching global chat:", error);
    res.json({ status: "sukses", data: [] }); // Return empty list on error to keep app running
  }
});

// Global settings cache with environment variable fallbacks
let systemSettings = {
  jibasApiUrl: process.env.VITE_JIBAS_API_URL || "https://api.hidis.id",
  whatsappGatewayUrl: process.env.VITE_WHATSAPP_GATEWAY_URL || "https://nganjuk.net/send-message",
  whatsappApiKey: process.env.VITE_WHATSAPP_API_KEY || "d66384969ff961bbf4117f6186339a6b",
  adminWhatsApp: process.env.ADMIN_WHATSAPP || ""
};

// Debug endpoint to verify current server settings
app.get("/api/system-settings", (req, res) => {
  res.json({
    current: systemSettings,
    env: {
      VITE_JIBAS_API_URL: process.env.VITE_JIBAS_API_URL,
      VITE_WHATSAPP_GATEWAY_URL: process.env.VITE_WHATSAPP_GATEWAY_URL
    }
  });
});

// Download file endpoint proxy for binary content
app.get("/api/download/file/:filename", async (req, res) => {
  const { filename: rawFilename } = req.params;
  const sessionUser = getUserSessionFromRequest(req);
  const filename = resolveFilenameFromSession(rawFilename, sessionUser);
  const queryString = req.url.includes("?") ? req.url.split("?")[1] : "";
  const targetBaseUrl = systemSettings.jibasApiUrl.replace(/\/$/, "");
  const targetUrl = `${targetBaseUrl}/api/download/file/${encodeURIComponent(filename)}${queryString ? `?${queryString}` : ""}`;

  console.log(`[DOWNLOAD] rawFilename=${rawFilename} resolvedFilename=${filename} sessionUser=${JSON.stringify(sessionUser)}`);
  console.log(`[DOWNLOAD] targetUrl=${targetUrl}`);

  try {
    const response = await axios.get(targetUrl, {
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      },
      timeout: 20000
    });

    // Forward relevant headers so browser can handle file download
    const contentType = response.headers["content-type"];
    const contentDisposition = response.headers["content-disposition"];
    if (contentType) res.setHeader("Content-Type", contentType);
    if (contentDisposition) res.setHeader("Content-Disposition", contentDisposition);
    if (response.headers["content-length"]) {
      res.setHeader("Content-Length", response.headers["content-length"]);
    }

    response.data.pipe(res);
  } catch (error: any) {
    console.error("Error proxying download file:", error?.message || error);
    const status = error?.response?.status || 500;
    const message = error?.response?.data || error?.message || "Failed to download file";
    res.status(status).json({ status: "error", message });
  }
});

// Preview file endpoint proxy - forces inline disposition for browser preview
app.get("/api/preview/file/:filename", async (req, res) => {
  const { filename: rawFilename } = req.params;
  const sessionUser = getUserSessionFromRequest(req);
  const filename = resolveFilenameFromSession(rawFilename, sessionUser);
  const queryString = req.url.includes("?") ? req.url.split("?")[1] : "";
  const targetBaseUrl = systemSettings.jibasApiUrl.replace(/\/$/, "");
  const targetUrl = `${targetBaseUrl}/api/download/file/${encodeURIComponent(filename)}${queryString ? `?${queryString}` : ""}`;

  console.log(`[PREVIEW] rawFilename=${rawFilename} resolvedFilename=${filename} sessionUser=${JSON.stringify(sessionUser)}`);
  console.log(`[PREVIEW] targetUrl=${targetUrl}`);

  try {
    const response = await axios.get(targetUrl, {
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      },
      timeout: 20000
    });

    // Force inline so browser attempts to preview (useful for PDF / images)
    const contentType = response.headers["content-type"];
    if (contentType) res.setHeader("Content-Type", contentType);
    // Use inline disposition but keep filename
    const suggestedName = filename;
    res.setHeader("Content-Disposition", `inline; filename="${suggestedName}"`);
    if (response.headers["content-length"]) {
      res.setHeader("Content-Length", response.headers["content-length"]);
    }

    response.data.pipe(res);
  } catch (error: any) {
    console.error("Error proxying preview file:", error?.message || error);
    const status = error?.response?.status || 500;
    const message = error?.response?.data || error?.message || "Failed to preview file";
    res.status(status).json({ status: "error", message });
  }
});

// Endpoint to test connection to JIBAS and WhatsApp APIs
app.post("/api/test-connection", async (req, res) => {
  const { jibasApiUrl, whatsappGatewayUrl, whatsappApiKey } = req.body;
  
  const results = {
    jibas: { status: "pending", message: "" },
    whatsapp: { status: "pending", message: "" }
  };

  const axiosInstance = axios.create({
    timeout: 10000,
    validateStatus: () => true, // Accept any status code
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });

  // Test JIBAS API
  try {
    let baseUrl = jibasApiUrl.trim().replace(/\/$/, "");
    if (!baseUrl.startsWith("http")) {
      baseUrl = "https://" + baseUrl;
    }
    console.log(`[TEST] Testing JIBAS API Base: ${baseUrl}`);
    
    // Try a simple GET to the base URL first
    const response = await axiosInstance.get(baseUrl);
    
    if (response.status >= 200 && response.status < 500) {
      results.jibas = { status: "success", message: `Terhubung (${response.status})` };
    } else {
      results.jibas = { status: "error", message: `Server merespon dengan status ${response.status}` };
    }
  } catch (error: any) {
    console.error("[TEST] JIBAS Error:", error.message);
    results.jibas = { 
      status: "error", 
      message: error.code === 'ECONNABORTED' ? "Timeout (10s)" : 
               error.code === 'ENOTFOUND' ? "Domain tidak ditemukan" :
               error.code === 'ECONNREFUSED' ? "Koneksi ditolak" :
               error.message 
    };
  }

  // Test WhatsApp Gateway
  try {
    let waUrl = whatsappGatewayUrl.trim();
    if (!waUrl.startsWith("http")) {
      waUrl = "https://" + waUrl;
    }
    console.log(`[TEST] Testing WhatsApp Gateway: ${waUrl}`);
    
    // Try a GET request
    const response = await axiosInstance.get(waUrl);

    if (response.status >= 200 && response.status < 500) {
      results.whatsapp = { status: "success", message: `Terhubung (${response.status})` };
    } else {
      results.whatsapp = { status: "error", message: `Server merespon dengan status ${response.status}` };
    }
  } catch (error: any) {
    console.error("[TEST] WhatsApp Error:", error.message);
    results.whatsapp = { 
      status: "error", 
      message: error.code === 'ECONNABORTED' ? "Timeout (10s)" : 
               error.code === 'ENOTFOUND' ? "Domain tidak ditemukan" :
               error.code === 'ECONNREFUSED' ? "Koneksi ditolak" :
               error.message 
    };
  }

  res.json(results);
});

// Initialize settings listener to sync with Firestore in real-time
const initSettingsListener = async () => {
  console.log("🚀 Initializing System Settings Listener (Client SDK)...");
  try {
    // Use client SDK for settings sync to bypass admin permission issues
    const docRef = clientDoc(clientDb, "settings", "global");
    
    // Initial fetch
    try {
      const initialDoc = await clientGetDoc(docRef);
      if (initialDoc.exists()) {
        const data = initialDoc.data();
        systemSettings = {
          jibasApiUrl: data?.jibasApiUrl || systemSettings.jibasApiUrl,
          whatsappGatewayUrl: data?.whatsappGatewayUrl || systemSettings.whatsappGatewayUrl,
          whatsappApiKey: data?.whatsappApiKey || systemSettings.whatsappApiKey,
          adminWhatsApp: data?.adminWhatsApp || systemSettings.adminWhatsApp
        };
        console.log("✅ Initial settings loaded (Client SDK):", systemSettings);
      }
    } catch (err) {
      console.error("❌ Error during initial settings fetch (Client SDK):", err);
    }
    
    // Listen for real-time updates
    const unsubscribe = clientOnSnapshot(docRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        console.log("📥 Received settings update from Firestore (Client SDK):", data);
        
        systemSettings = {
          jibasApiUrl: data?.jibasApiUrl || systemSettings.jibasApiUrl,
          whatsappGatewayUrl: data?.whatsappGatewayUrl || systemSettings.whatsappGatewayUrl,
          whatsappApiKey: data?.whatsappApiKey || systemSettings.whatsappApiKey,
          adminWhatsApp: data?.adminWhatsApp || systemSettings.adminWhatsApp
        };
        
        console.log("✅ System settings updated in memory (Client SDK):", systemSettings);
      } else {
        console.log("⚠️ No global settings found in Firestore (Client SDK)");
      }
    }, (error) => {
      console.error("❌ Firestore Settings Listener Error (Client SDK):", error);
    });

    return unsubscribe;
  } catch (error) {
    console.error("❌ Failed to initialize settings listener (Client SDK):", error);
  }
};

initSettingsListener();

// WhatsApp Gateway Proxy
// Helper to send WhatsApp message via the gateway
const sendWhatsAppMessage = async (targetNumber: string, message: string) => {
  const apiKey = systemSettings.whatsappApiKey;
  const targetUrl = systemSettings.whatsappGatewayUrl;

  if (!targetUrl || !apiKey || !targetNumber) {
    console.error("[WA] Missing configuration for sending message");
    return { status: "error", message: "Missing configuration" };
  }

  try {
    const response = await axios.post(targetUrl, {
      api_key: apiKey,
      numbers: targetNumber,
      message
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000
    });
    return response.data;
  } catch (error: any) {
    console.error("[WA] Send Error:", error.response?.data || error.message);
    throw error;
  }
};

// API to notify admin about payment
app.post("/api/notify-admin-payment", async (req, res) => {
  const { studentName, amount, billName } = req.body;
  
  if (!systemSettings.adminWhatsApp) {
    return res.json({ status: "skipped", message: "Admin WhatsApp not configured" });
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(val);
  };

  const message = `🔔 *NOTIFIKASI PEMBAYARAN*\n\n` +
                  `Wali Murid/Siswa *${studentName}* baru saja melakukan konfirmasi pembayaran.\n\n` +
                  `📌 *Tagihan:* ${billName}\n` +
                  `💰 *Nominal:* ${formatCurrency(amount)}\n\n` +
                  `Mohon segera cek menu Verifikasi Pembayaran di aplikasi JIBAS Mobile.`;

  try {
    const result = await sendWhatsAppMessage(systemSettings.adminWhatsApp, message);
    res.json({ status: "success", result });
  } catch (error: any) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.post("/api/whatsapp/send", async (req, res) => {
  const { api_key, numbers, number, message } = req.body;
  const targetNumber = numbers || number;
  
  if (!targetNumber || !message) {
    return res.status(400).json({ status: "error", message: "Numbers and message are required" });
  }

  // Use provided api_key (from request) or dynamic setting or fallback
  const apiKey = api_key || systemSettings.whatsappApiKey;
  const targetUrl = systemSettings.whatsappGatewayUrl;

  console.log(`[WA] Sending to ${targetNumber} via ${targetUrl}`);

  try {
    // Using POST with JSON body as per user's Postman example
    const response = await axios.post(targetUrl, {
      api_key: apiKey,
      numbers: targetNumber,
      message
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000 // 15 seconds timeout
    });
    
    console.log(`[WA] Response:`, JSON.stringify(response.data));
    res.json(response.data);
  } catch (error: any) {
    console.error("WhatsApp Gateway Error:", error.response?.data || error.message);
    
    // Extract meaningful error message
    let errorMessage = "Failed to send WhatsApp message";
    if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = "Gateway timeout (15s)";
    } else {
      errorMessage = error.message;
    }

    res.status(error.response?.status || 500).json({ 
      status: "error", 
      message: errorMessage,
      details: error.response?.data || error.message
    });
  }
});

// Generic API Proxy for JIBAS
app.all("/api/*", async (req, res, next) => {
  // Skip health check
  if (req.path === "/api/health") return next();

  const targetPath = req.params[0];
  
  // Ensure we prefix with /api/ if not already present
  let finalPath = targetPath;
  if (!targetPath.startsWith("api/")) {
    finalPath = `api/${targetPath}`;
  }

    // Use dynamic JIBAS API URL
    const targetBaseUrl = systemSettings.jibasApiUrl.replace(/\/$/, "");
    const queryString = req.url.includes("?") ? req.url.split("?")[1] : "";
    let targetUrl = `${targetBaseUrl}/${finalPath}${queryString ? `?${queryString}` : ""}`;
    
    console.log(`[PROXY] Request: ${req.method} ${req.path}`);
    console.log(`[PROXY] Target URL: ${targetUrl}`);
    console.log(`[PROXY] Final Path: ${finalPath}`);
    
    // Redirect VCR send requests to the correct host for reliable MySQL storage
    if (targetPath.startsWith("vcr-send/")) {
      const chatgroup = targetPath.split("/")[1];
      
      // Handle Global Chat (Umum) specifically
      if (chatgroup === "Umum") {
        try {
          await clientAddDoc(clientCollection(clientDb, "chat_umum"), {
            ...req.body,
            waktu_kirim_asli: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T"),
            server_timestamp: clientServerTimestamp()
          });
          return res.json({ status: "sukses", message: "Pesan global terkirim" });
        } catch (error) {
          console.error("Error saving global message:", error);
          return res.status(500).json({ status: "error", message: "Gagal mengirim pesan global" });
        }
      }
      
      // Note: vcr.nganjuk.net might also need to be dynamic, but user didn't specify it yet.
      // Keeping it as is for now unless requested.
      targetUrl = `https://vcr.nganjuk.net/proxy/send/${chatgroup}`;
    }

    console.log(`Proxying ${req.method} request to: ${targetUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

    try {
      const fetchOptions: RequestInit = {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      };

      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      // AUTO-SYNC LOGIC: Sync successful login data to Firestore
      if (targetPath.includes("jbsuser/login") && (data.status === "sukses" || data.success)) {
        const userData = data.data || data.user;
        if (userData) {
          const userId = userData.nis || userData.nip || userData.nopendaftaran || userData.replid?.toString();
          if (userId) {
            syncToFirestore("users_sync", userId, userData);
          }
          try {
            const cookieValue = createLoginSessionCookie(userData);
            res.setHeader("Set-Cookie", cookieValue);
          } catch (cookieError) {
            console.error("Failed to set login session cookie:", cookieError);
          }
        }
      }

      // AUTO-SYNC LOGIC: Sync presence data
      if ((targetPath.includes("jbsvcr/fingerprint") || targetPath.includes("jbssat/fingerprint")) && (data.status === "sukses" || data.success)) {
        const presenceData = data.data;
        if (presenceData && (presenceData.nis || presenceData.nip || presenceData.nomor_induk)) {
          const identifier = presenceData.nis || presenceData.nip || presenceData.nomor_induk;
          syncToFirestore("presence_sync", identifier, presenceData);
        }
      }

      res.status(response.status).json(data);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`Error proxying to ${targetUrl}:`, error);
      res.status(500).json({ 
        status: "error", 
        message: error instanceof Error && error.name === 'AbortError' ? "Request timeout" : "Failed to fetch from external API",
        details: error instanceof Error ? error.message : String(error)
      });
    }
});

async function setupServer() {
  console.log("Setting up server...");
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Loading Vite middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite middleware loaded.");
  } else {
    // Serve static files in production
    console.log("Serving static files from dist...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    
    // SPA fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

// Start the server
const PORT = process.env.PORT || 3000;
setupServer().then(() => {
  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error("Failed to start server:", err);
});

export default app;
