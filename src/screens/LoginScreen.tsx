import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, School, ShieldCheck, Lock, UserCircle, Loader2, Settings, X, Globe, MessageSquare, Key, Save, Activity, CheckCircle2, AlertCircle } from "lucide-react";
import axios from "axios";
import { cn } from "@/lib/utils";
import { LoginStatus, LoginResponse, UserData, SystemSettings } from "@/types";
import { getClassById } from "@/constants/classes";
import { auth, signInWithPopup, googleProvider } from "@/firebase";
import { toast } from "sonner";

interface LoginScreenProps {
  onLoginSuccess: (user: UserData) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [status, setStatus] = useState<LoginStatus>("siswa");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [masterKey, setMasterKey] = useState("");
  const [isSetupAuthorized, setIsSetupAuthorized] = useState(false);
  const [setupTab, setSetupTab] = useState<"config" | "test">("config");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingWA, setIsTestingWA] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [isRequestingPin, setIsRequestingPin] = useState(false);
  const [testResults, setTestResults] = useState<{
    jibas?: { status: string; message: string };
    whatsapp?: { status: string; message: string };
  } | null>(null);

  const [config, setConfig] = useState<SystemSettings>({
    jibasApiUrl: "https://api.hidis.id",
    whatsappGatewayUrl: "https://nganjuk.net/send-message",
    whatsappApiKey: "d66384969ff961bbf4117f6186339a6b",
    adminWhatsApp: "",
    googleWorkspaceDomain: "",
    updatedAt: null,
    updatedBy: "system"
  });

  useEffect(() => {
    const checkExistingAuth = async () => {
      const currentUser = auth.currentUser;
      if (currentUser && !currentUser.isAnonymous) {
        setLoading(true);
        try {
          // Existing auth session detected, but we no longer rely on Firestore user documents.
          // The app will require fresh login or mapping via JIBAS API if needed.
        } catch (err) {
          console.error("Error checking existing auth:", err);
        } finally {
          setLoading(false);
        }
      }
    };
    checkExistingAuth();
  }, [onLoginSuccess]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await axios.get('/api/system-settings');
        if (response.data?.current) {
          setConfig(response.data.current as SystemSettings);
        }
      } catch (error) {
        console.error("Error fetching system config:", error);
      }
    };
    fetchConfig();
  }, []);

  const handleVerifyMasterKey = () => {
    // Default master key is 'jibas123' or from env if we had it
    if (masterKey === "jibas123") {
      setIsSetupAuthorized(true);
      toast.success("Akses Konfigurasi Terbuka");
    } else {
      toast.error("Master Key Salah");
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      toast.success("Konfigurasi sistem diperbarui secara lokal");
    } catch (error) {
      console.error("Failed to save system config:", error);
      toast.error("Gagal menyimpan konfigurasi sistem");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResults(null);
    try {
      const response = await axios.post("/api/test-connection", config);
      setTestResults(response.data);
      if (response.data.jibas.status === "success" && response.data.whatsapp.status === "success") {
        toast.success("Semua koneksi API berhasil terhubung!");
      } else {
        toast.error("Ada masalah pada koneksi API");
      }
    } catch (error) {
      console.error("Test connection failed:", error);
      toast.error("Gagal melakukan tes koneksi");
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestWhatsAppMessage = async () => {
    if (!testPhone) {
      toast.error("Masukkan nomor WhatsApp tujuan");
      return;
    }
    setIsTestingWA(true);
    try {
      const response = await axios.post("/api/whatsapp/send", {
        api_key: config.whatsappApiKey,
        numbers: testPhone,
        message: "Tes koneksi WhatsApp Gateway dari JIBAS Mobile. Jika Anda menerima pesan ini, konfigurasi sudah benar."
      });
      
      if (response.data.status === "success" || 
          response.data.success || 
          response.data.message?.toLowerCase().includes("terkirim") ||
          response.data.message?.toLowerCase().includes("success") ||
          response.status === 200) {
        toast.success("Pesan tes berhasil dikirim!");
      } else {
        toast.error(`Gagal: ${response.data.message || "Respon tidak diketahui"}`);
      }
    } catch (error: any) {
      console.error("WA Test failed:", error);
      toast.error(`Gagal mengirim pesan: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsTestingWA(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("Initiating Google Login popup...");
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      const email = firebaseUser.email?.toLowerCase();
      console.log("Google Login successful:", email);
      
      if (email) {
        const [localPart, domain] = email.split('@');
        const allowedDomain = config.googleWorkspaceDomain || "";
        
        if (allowedDomain && (Number(user.level) === 2 || Number(user.level) === 3) && domain !== allowedDomain) {
          setError(`Gagal: Guru & Siswa wajib menggunakan akun Workspace resmi (@${allowedDomain})`);
          await auth.signOut();
          return;
        }

        const tryMapping = async (isPegawai: boolean) => {
          const endpoint = isPegawai ? `/api/jbsakad/pegawai/${localPart}` : `/api/jbsakad/siswa/${localPart}`;
          try {
            const response = await axios.get(endpoint);
            if (response.data.status === "sukses" || response.data.success) {
              return response.data.data || response.data.user;
            }
          } catch (e) {
            return null;
          }
          return null;
        };

        try {
          let userData = await tryMapping(true);
          let isPegawai = true;
          if (!userData) {
            userData = await tryMapping(false);
            isPegawai = false;
          }

          if (userData) {
            if (!isPegawai && userData.idkelas) {
              const classInfo = getClassById(userData.idkelas);
              if (classInfo) {
                userData = {
                  ...userData,
                  nama_kelas: classInfo.nama_kelas,
                  wali_kelas: classInfo.wali_kelas,
                  hp_wali: classInfo.hp_wali
                };
              }
            }
            onLoginSuccess(userData);
            return;
          }
        } catch (apiErr) {
          console.error("Auto-mapping API error:", apiErr);
        }
      }
      setError("Akun Google Anda belum terhubung dengan data JIBAS. Silakan login menggunakan NIS/NIP terlebih dahulu untuk menghubungkan akun.");
    } catch (err: any) {
      console.error("Google login error:", err);
      if (err.code === 'auth/popup-blocked') {
        setError("Popup diblokir oleh browser. Silakan izinkan popup untuk login Google.");
      } else if (err.code === 'auth/cancelled-popup-request') {
        // User closed the popup, don't show error
      } else {
        setError(`Gagal login dengan Google: ${err.message || "Terjadi kesalahan"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPin = async () => {
    if (!forgotIdentifier) {
      toast.error("Masukkan Nomor WhatsApp Anda");
      return;
    }

    setIsRequestingPin(true);
    try {
      let endpoint = "";
      let typeLabel = "";
      
      // We assume there is a search endpoint that accepts hportu or handphone
      if (status === "siswa") {
        endpoint = `/api/jbsakad/siswa/search?hportu=${forgotIdentifier}`;
        typeLabel = "Siswa";
      } else if (status === "calonsiswa") {
        endpoint = `/api/jbsakad/calonsiswa/search?hportu=${forgotIdentifier}`;
        typeLabel = "Calon Siswa";
      } else {
        endpoint = `/api/jbssdm/pegawai/search?handphone=${forgotIdentifier}`;
        typeLabel = "Pegawai";
      }

      const response = await axios.get(endpoint);
      
      // JIBAS search results are often an array or a single object inside data
      const resultData = response.data.data;
      const userData = Array.isArray(resultData) ? resultData[0] : resultData;

      if (!userData) {
        toast.error(`Nomor HP tidak ditemukan di data ${typeLabel}`);
        return;
      }

      // Map fields based on the provided JSON examples
      const phone = userData.hportu || userData.handphone || userData.hpmobile || userData.hp || userData.telpon || userData.telepon || forgotIdentifier;
      const pin = userData.pinsiswa || userData.password || userData.pin || userData.info3;
      const id = userData.nis || userData.nip || userData.nopendaftaran;
      const name = userData.nama;

      if (!pin || !id) {
        toast.error("Data ditemukan, tetapi detail login tidak lengkap. Hubungi Admin.");
        return;
      }

      // Send WA
      const message = `Halo *${name}*,\n\nBerikut adalah detail login JIBAS Mobile Anda:\n\n` +
                      `ID: *${id}*\n` +
                      `PIN/Password: *${pin}*\n\n` +
                      `Silakan simpan data ini dengan baik.`;

      const waResponse = await axios.post("/api/whatsapp/send", {
        numbers: phone,
        message: message
      });

      const isSuccess = waResponse.data.status === "success" || 
                        waResponse.data.success || 
                        waResponse.status === 200 ||
                        waResponse.data.message?.toLowerCase().includes("terkirim") ||
                        waResponse.data.message?.toLowerCase().includes("success");

      if (isSuccess) {
        toast.success(`Detail login telah dikirim ke WhatsApp Anda`);
        setShowForgotModal(false);
        setForgotIdentifier("");
      } else {
        toast.error(`Gagal mengirim WA: ${waResponse.data.message || "Respon tidak diketahui"}`);
      }
    } catch (error: any) {
      console.error("Request PIN error:", error);
      const msg = error.response?.data?.message || "Gagal memproses permintaan. Pastikan nomor HP benar dan terdaftar.";
      toast.error(msg);
    } finally {
      setIsRequestingPin(false);
    }
  };

  // Form states
  const [nis, setNis] = useState("");
  const [pin, setPin] = useState("");
  const [nopendaftaran, setNopendaftaran] = useState("");
  const [pinsiswa, setPinsiswa] = useState("");
  const [nip, setNip] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: any = { status };
    if (status === "siswa") {
      payload.nis = nis;
      payload.pin = pin;
    } else if (status === "calonsiswa") {
      payload.nopendaftaran = nopendaftaran;
      payload.pinsiswa = pinsiswa;
    } else {
      payload.nip = nip;
      payload.password = password;
    }

    try {
      // Use local proxy /api/jbsuser/login which uses dynamic JIBAS URL from server.ts
      const response = await axios.post<LoginResponse>(
        "/api/jbsuser/login",
        payload
      );

      if (response.data.status === "sukses" || response.data.success) {
        let userData = response.data.data || response.data.user;
        if (userData) {
          // Enrich with class data if it's a student or teacher and has idkelas
          if ((status === "siswa" || status === "pegawai") && userData.idkelas) {
            const classInfo = getClassById(userData.idkelas);
            if (classInfo) {
              userData = {
                ...userData,
                nama_kelas: classInfo.nama_kelas,
                wali_kelas: classInfo.wali_kelas,
                hp_wali: classInfo.hp_wali
              };
            }
          }
          onLoginSuccess(userData);
        } else {
          setError("Data user tidak ditemukan.");
        }
      } else {
        setError(response.data.message || "Login gagal.");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Terjadi kesalahan pada server.");
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: "siswa", label: "Siswa", icon: User },
    { id: "calonsiswa", label: "Calon", icon: School },
    { id: "pegawai", label: "Pegawai", icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans relative">
      {/* Setup Button */}
      <button
        onClick={() => setShowSetup(true)}
        className="absolute top-6 right-6 w-10 h-10 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all active:scale-95"
      >
        <Settings size={20} />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100"
      >
        <div className="p-8 bg-blue-600 text-white text-center">
          <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
            <School size={40} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">JIBAS Mobile</h1>
          <p className="text-blue-100 text-sm mt-1">Sistem Informasi Sekolah Terpadu</p>
        </div>

        <div className="p-6">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setStatus(tab.id as LoginStatus);
                  setError(null);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  status === tab.id
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={status}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {status === "siswa" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">NIS</label>
                      <div className="relative">
                        <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                          type="text"
                          value={nis}
                          onChange={(e) => setNis(e.target.value)}
                          placeholder="Masukkan NIS"
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">PIN</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                          type="password"
                          value={pin}
                          onChange={(e) => setPin(e.target.value)}
                          placeholder="Masukkan PIN"
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                {status === "calonsiswa" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">No. Pendaftaran</label>
                      <div className="relative">
                        <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                          type="text"
                          value={nopendaftaran}
                          onChange={(e) => setNopendaftaran(e.target.value)}
                          placeholder="Masukkan No. Pendaftaran"
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">PIN</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                          type="password"
                          value={pinsiswa}
                          onChange={(e) => setPinsiswa(e.target.value)}
                          placeholder="Masukkan PIN"
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                {status === "pegawai" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">NIP</label>
                      <div className="relative">
                        <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                          type="text"
                          value={nip}
                          onChange={(e) => setNip(e.target.value)}
                          placeholder="Masukkan NIP"
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Masukkan Password"
                          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          required
                        />
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="text-red-500 text-xs font-medium text-center bg-red-50 py-2 rounded-lg"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : "Masuk Sekarang"}
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400 font-medium">Atau</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold py-4 rounded-2xl border border-slate-200 shadow-sm transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-70 disabled:active:scale-100"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              Masuk dengan Google
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-slate-400 text-xs">
              Lupa PIN atau Password? <span 
                onClick={() => setShowForgotModal(true)}
                className="text-blue-600 font-semibold cursor-pointer hover:underline"
              >
                Hubungi Admin
              </span>
            </p>
          </div>
        </div>
      </motion.div>
      <p className="mt-8 text-slate-400 text-xs font-medium uppercase tracking-widest">© 2026 JIBAS Education</p>

      {/* Forgot PIN Modal */}
      <AnimatePresence>
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForgotModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-slate-900">Lupa PIN/Password</h3>
                    <p className="text-xs text-slate-400 font-medium">Kirim detail login via WhatsApp</p>
                  </div>
                  <button 
                    onClick={() => setShowForgotModal(false)}
                    className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100">
                    <p className="text-[10px] text-blue-600 font-medium leading-relaxed">
                      Sistem akan mengirimkan PIN/Password ke nomor WhatsApp yang terdaftar di database JIBAS untuk kategori <span className="font-bold uppercase">{status}</span>.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">
                      Nomor WhatsApp Terdaftar
                    </label>
                    <div className="relative">
                      <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                      <input
                        type="text"
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        placeholder="Contoh: 08123456789"
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleRequestPin}
                    disabled={isRequestingPin || !forgotIdentifier}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                  >
                    {isRequestingPin ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <MessageSquare size={20} />
                        Kirim via WA
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* System Setup Modal */}
      <AnimatePresence>
        {showSetup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowSetup(false);
                setIsSetupAuthorized(false);
                setMasterKey("");
              }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col"
            >
              {!isSetupAuthorized ? (
                <div className="p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-slate-900">System Setup</h3>
                      <p className="text-xs text-slate-400 font-medium">Masukkan Master Key untuk akses</p>
                    </div>
                    <button 
                      onClick={() => setShowSetup(false)}
                      className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                      <input
                        type="password"
                        value={masterKey}
                        onChange={(e) => setMasterKey(e.target.value)}
                        placeholder="Master Key"
                        className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <button
                      onClick={handleVerifyMasterKey}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm uppercase tracking-widest active:scale-95 transition-all"
                    >
                      Verifikasi
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-8 pb-4 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold text-slate-900">Konfigurasi Sistem</h3>
                        <p className="text-xs text-slate-400 font-medium">Pengaturan Server & Gateway</p>
                      </div>
                      <button 
                        onClick={() => {
                          setShowSetup(false);
                          setIsSetupAuthorized(false);
                          setMasterKey("");
                          setSetupTab("config");
                        }}
                        className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    {/* Setup Tabs */}
                    <div className="flex bg-slate-100 p-1 rounded-2xl">
                      <button
                        onClick={() => setSetupTab("config")}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                          setupTab === "config" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
                        )}
                      >
                        Konfigurasi
                      </button>
                      <button
                        onClick={() => setSetupTab("test")}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                          setupTab === "test" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
                        )}
                      >
                        Uji Koneksi
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 pt-0 space-y-6 custom-scrollbar">
                    {setupTab === "config" ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                            <Globe size={12} /> JIBAS API URL
                          </label>
                          <input
                            type="text"
                            value={config.jibasApiUrl}
                            onChange={(e) => setConfig({ ...config, jibasApiUrl: e.target.value })}
                            placeholder="https://api.hidis.id"
                            className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                            <MessageSquare size={12} /> WhatsApp Gateway URL
                          </label>
                          <input
                            type="text"
                            value={config.whatsappGatewayUrl}
                            onChange={(e) => setConfig({ ...config, whatsappGatewayUrl: e.target.value })}
                            placeholder="https://nganjuk.net/send-message"
                            className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                            <Key size={12} /> WhatsApp API Key
                          </label>
                          <input
                            type="text"
                            value={config.whatsappApiKey}
                            onChange={(e) => setConfig({ ...config, whatsappApiKey: e.target.value })}
                            placeholder="API Key"
                            className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                            <User size={12} /> Nomor WhatsApp Admin
                          </label>
                          <input
                            type="text"
                            value={config.adminWhatsApp || ""}
                            onChange={(e) => setConfig({ ...config, adminWhatsApp: e.target.value })}
                            placeholder="Contoh: 628123456789"
                            className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2">
                            <Globe size={12} /> Domain Google Workspace
                          </label>
                          <input
                            type="text"
                            value={config.googleWorkspaceDomain || ""}
                            onChange={(e) => setConfig({ ...config, googleWorkspaceDomain: e.target.value })}
                            placeholder="Contoh: hidis.id"
                            className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                          <p className="text-[9px] text-slate-400 ml-2 italic">
                            * Membatasi login Google hanya untuk domain ini (misal: hidis.id)
                          </p>
                        </div>

                        <button
                          onClick={handleSaveConfig}
                          disabled={isSaving}
                          className="w-full py-4 mt-4 bg-blue-600 text-white rounded-[24px] font-bold text-sm uppercase tracking-widest shadow-xl shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                        >
                          {isSaving ? (
                            <Loader2 size={20} className="animate-spin" />
                          ) : (
                            <>
                              <Save size={20} />
                              Simpan Konfigurasi
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <button
                          onClick={handleTestConnection}
                          disabled={isTesting}
                          className="w-full py-4 bg-slate-100 text-slate-700 rounded-[24px] font-bold text-sm uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                        >
                          {isTesting ? (
                            <Loader2 size={20} className="animate-spin" />
                          ) : (
                            <>
                              <Activity size={20} />
                              Cek Koneksi API
                            </>
                          )}
                        </button>

                        {testResults && (
                          <div className="p-4 bg-slate-50 rounded-2xl space-y-3 border border-slate-100">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">JIBAS API</span>
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                                  testResults.jibas?.status === "success" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                                )}>
                                  {testResults.jibas?.status === "success" ? "Online" : "Offline"}
                                </span>
                                {testResults.jibas?.status === "success" ? (
                                  <CheckCircle2 size={14} className="text-green-500" />
                                ) : (
                                  <AlertCircle size={14} className="text-red-500" />
                                )}
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-500 font-medium truncate">{testResults.jibas?.message}</p>

                            <div className="h-px bg-slate-200" />

                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">WhatsApp Gateway</span>
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                                  testResults.whatsapp?.status === "success" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                                )}>
                                  {testResults.whatsapp?.status === "success" ? "Online" : "Offline"}
                                </span>
                                {testResults.whatsapp?.status === "success" ? (
                                  <CheckCircle2 size={14} className="text-green-500" />
                                ) : (
                                  <AlertCircle size={14} className="text-red-500" />
                                )}
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-500 font-medium truncate">{testResults.whatsapp?.message}</p>
                          </div>
                        )}

                        <div className="pt-4 border-t border-slate-100 space-y-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">Uji Kirim WhatsApp</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={testPhone}
                              onChange={(e) => setTestPhone(e.target.value)}
                              placeholder="Nomor WA (contoh: 08123456789)"
                              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                            <button
                              onClick={handleTestWhatsAppMessage}
                              disabled={isTestingWA || !testPhone}
                              className="px-4 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                            >
                              {isTestingWA ? <Loader2 size={14} className="animate-spin" /> : "Kirim"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
