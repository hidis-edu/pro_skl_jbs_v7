import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { MapPin, Clock, User, CheckCircle2, AlertCircle, Loader2, Camera, Upload, ShieldCheck, X } from "lucide-react";
import { UserData } from "@/types";
import { cn } from "@/lib/utils";
import { db, auth, collection, addDoc, onSnapshot, query, where, orderBy, doc, updateDoc, getDocFromServer, Timestamp, signInAnonymously, serverTimestamp, signInWithPopup, googleProvider, handleFirestoreError, OperationType } from "@/firebase";

interface PickupStatusProps {
  user: UserData;
}

export default function PickupStatus({ user }: PickupStatusProps) {
  const [isRequestingGuardian, setIsRequestingGuardian] = useState(false);
  const [guardianPhoto, setGuardianPhoto] = useState<string | null>(null);
  const [guardianName, setGuardianName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [registeredGuardians, setRegisteredGuardians] = useState<any[]>([]);
  const [loadingGuardians, setLoadingGuardians] = useState(true);
  const [isProfileReady, setIsProfileReady] = useState(false);
  const [savedProfile, setSavedProfile] = useState<{ name: string; relationship: string; photo: string } | null>(null);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged(async (currentUser) => {
      setIsAuthReady(true);
      
      // Cleanup previous snapshot listener
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (currentUser) {
        // Load saved profile from Firestore and confirm user doc exists
        let retryCount = 0;
        const fetchProfile = async () => {
          try {
            const userDoc = await getDocFromServer(doc(db, 'users', currentUser.uid));
            if (userDoc.exists()) {
              setIsProfileReady(true);
              if (userDoc.data().lastGuardian) {
                setSavedProfile(userDoc.data().lastGuardian);
              }
            } else if (retryCount < 3) {
              // If user doc doesn't exist yet, retry a few times (it might be being created by App.tsx)
              retryCount++;
              setTimeout(fetchProfile, 1000);
            } else {
              // Still not found, but we'll allow it and hope for the best (or App.tsx will eventually create it)
              setIsProfileReady(true);
            }
          } catch (err) {
            console.error("Failed to load user profile:", err);
            handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
            if (retryCount < 3) {
              retryCount++;
              setTimeout(fetchProfile, 1000);
            } else {
              setIsProfileReady(true);
            }
          }
        };
        fetchProfile();

        const path = 'pickups';
        let studentId = String(user.nis || user.nopendaftaran || "");
        
        // If employee, use the same placeholder logic to see their own test requests
        if (!studentId && (user.level === 1 || user.level === 2)) {
          studentId = `EMP-${user.nip || currentUser.uid.substring(0, 8)}`;
        }

        // Filter by studentNis to ensure privacy between different students
        const q = query(
          collection(db, path),
          where("studentNis", "==", studentId),
          orderBy("createdAt", "desc")
        );

        unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setRegisteredGuardians(data);
          setLoadingGuardians(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, path);
          setLoadingGuardians(false);
        });
      } else {
        setRegisteredGuardians([]);
        setLoadingGuardians(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setLoadingGuardians(true);
    setError(null);
    try {
      console.log("Initiating Google Sign-In popup from PickupStatus...");
      const result = await signInWithPopup(auth, googleProvider);
      console.log("Google sign-in successful:", result.user.email);
      toast.success("Berhasil terhubung dengan Google");
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      if (err.code === 'auth/popup-blocked') {
        setError("Popup diblokir oleh browser. Silakan izinkan popup untuk menghubungkan akun Google.");
        toast.error("Popup diblokir. Harap izinkan popup di browser Anda.");
      } else if (err.code === 'auth/cancelled-popup-request') {
        // User closed the popup, no error needed
      } else {
        setError(`Gagal menghubungkan dengan Google: ${err.message || "Terjadi kesalahan"}`);
        toast.error("Gagal menghubungkan dengan Google");
      }
    } finally {
      setLoadingGuardians(false);
    }
  };

  const steps = [
    { 
      id: 1, 
      label: "Registrasi Penjemput", 
      time: registeredGuardians[0] ? new Date(registeredGuardians[0].createdAt?.toDate?.() || Date.now()).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : "--:--", 
      status: registeredGuardians[0] ? "completed" : "pending" 
    },
    { 
      id: 2, 
      label: "Verifikasi Keamanan", 
      time: registeredGuardians[0]?.status === "verified" ? 
        new Date(registeredGuardians[0].verifiedAt?.toDate?.() || registeredGuardians[0].verifiedAt || Date.now()).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 
        "--:--", 
      status: registeredGuardians[0]?.status === "verified" ? "completed" : (registeredGuardians[0] ? "active" : "pending") 
    },
    { id: 3, label: "Penjemput Tiba di Sekolah", time: "--:--", status: registeredGuardians[0]?.status === "verified" ? "active" : "pending" },
    { id: 4, label: "Siswa Diserahkan", time: "--:--", status: "pending" },
  ];

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.7 quality
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressedBase64);
      };
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setError(null);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        
        // If file is large, compress it
        if (file.size > 200000) { // Compress if > 200KB to be safe
          try {
            const compressed = await compressImage(base64);
            setGuardianPhoto(compressed);
          } catch (err) {
            console.error("Compression failed:", err);
            setGuardianPhoto(base64);
          }
        } else {
          setGuardianPhoto(base64);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    console.log("Submitting guardian registration...");

    if (!guardianName) {
      setError("Nama penjemput wajib diisi.");
      return;
    }
    if (!relationship) {
      setError("Hubungan keluarga wajib dipilih.");
      return;
    }
    if (!guardianPhoto) {
      setError("Foto penjemput wajib diunggah.");
      return;
    }
    
    let currentUser = auth.currentUser;
    console.log("Current user:", currentUser?.uid);
    
    // If not signed in yet, try to sign in anonymously
    if (!currentUser) {
      try {
        console.log("Attempting anonymous sign-in in handleSubmitGuardian...");
        const result = await signInAnonymously(auth);
        currentUser = result.user;
        console.log("Anonymous sign-in successful:", currentUser.uid);
      } catch (err: any) {
        console.error("Failed to sign in anonymously:", err);
        if (err.code === 'auth/operation-not-allowed') {
          setError("Fitur keamanan anonim belum diaktifkan. Silakan hubungkan dengan Google di atas untuk melanjutkan.");
        } else {
          setError(`Gagal menghubungkan ke server keamanan: ${err.message || 'Unknown error'}.`);
        }
        return;
      }
    }

    if (!currentUser) {
      setError("Sesi tidak valid. Silakan coba lagi.");
      return;
    }

    setIsSubmitting(true);
    const path = 'pickups';
    
    try {
      // Ensure studentNis is a string and not empty
      let studentId = String(user.nis || user.nopendaftaran || "");
      
      // If employee is testing, use a placeholder if NIS is missing
      if (!studentId && (user.level === 1 || user.level === 2)) {
        studentId = `EMP-${user.nip || currentUser.uid.substring(0, 8)}`;
      }

      if (!studentId) {
        setError("NIS atau No. Pendaftaran tidak ditemukan. Silakan hubungi admin.");
        setIsSubmitting(false);
        return;
      }

      const newPickup = {
        studentNis: studentId,
        studentName: user.nama,
        studentClass: user.nama_kelas || user.kelas || user.studentClass || "7-A", // Use nama_kelas if available
        guardianName: guardianName,
        relationship: relationship,
        photo: guardianPhoto,
        status: "waiting",
        time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      };

      console.log("Sending to Firestore:", newPickup);
      const docRef = await addDoc(collection(db, path), newPickup);
      console.log("Document written with ID:", docRef.id);
      
      // Save/Update guardian profile in user's document
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          lastGuardian: {
            name: guardianName,
            relationship: relationship,
            photo: guardianPhoto
          }
        });
        setSavedProfile({ name: guardianName, relationship: relationship, photo: guardianPhoto || "" });
      } catch (err) {
        console.error("Failed to save guardian profile:", err);
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
      }
      
      setIsSubmitting(false);
      setIsSuccess(true);
      
      setTimeout(() => {
        setIsRequestingGuardian(false);
        setIsSuccess(false);
        setGuardianName("");
        setRelationship("");
        setGuardianPhoto(null);
        setError(null);
      }, 2000);
    } catch (err: any) {
      setIsSubmitting(false);
      console.error("Submit error details:", err);
      handleFirestoreError(err, OperationType.WRITE, path);
      if (err.message?.includes("insufficient permissions") || err.code === "permission-denied") {
        setError("Izin ditolak. Silakan hubungi admin.");
      } else {
        setError(`Gagal mengirim data: ${err.message || "Periksa koneksi Anda."}`);
      }
    }
  };

  return (
    <div className="pb-32 pt-8 px-6 space-y-8">
      <div className="space-y-1">
        <h2 className="text-slate-400 text-sm font-medium">Status</h2>
        <h1 className="text-2xl font-bold text-slate-900">Penjemputan Wali</h1>
      </div>

      {/* Security Connection Status */}
      {!auth.currentUser && isAuthReady && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 bg-amber-50 border border-amber-100 rounded-[32px] flex flex-col gap-3 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
              <ShieldCheck size={20} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900 leading-tight">Keamanan Belum Terhubung</p>
              <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Hubungkan akun Google untuk fitur keamanan</p>
            </div>
          </div>
          <button
            onClick={handleGoogleSignIn}
            disabled={loadingGuardians}
            className="w-full bg-white text-amber-700 font-bold py-3 rounded-2xl border border-amber-200 shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 text-xs"
          >
            {loadingGuardians ? <Loader2 className="animate-spin" size={16} /> : (
              <>
                <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
                Hubungkan dengan Google
              </>
            )}
          </button>
        </motion.div>
      )}

      {/* Security Validation Card */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-emerald-50 border border-emerald-100 p-5 rounded-[32px] flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Validasi Keamanan</h3>
            <p className="text-[10px] text-slate-500 font-medium leading-tight">Daftarkan wali yang sah untuk menjemput siswa.</p>
          </div>
        </div>
        <button 
          onClick={() => {
            if (!isProfileReady) {
              toast.error("Profil belum siap. Silakan tunggu sebentar.");
              return;
            }
            setIsRequestingGuardian(true);
          }}
          className="bg-white text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider shadow-sm border border-emerald-100 active:scale-95 transition-all flex items-center gap-2"
        >
          {!isProfileReady ? <Loader2 className="animate-spin" size={12} /> : null}
          Daftar Wali
        </button>
      </motion.div>

      {/* Registered Guardians List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900">Wali Terdaftar</h3>
        <div className="grid grid-cols-1 gap-3">
          {registeredGuardians.map((guardian) => (
            <motion.div 
              key={guardian.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-100">
                  <img src={guardian.photo} alt={guardian.guardianName} className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{guardian.guardianName}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{guardian.relationship}</p>
                    <span className="w-1 h-1 bg-slate-200 rounded-full" />
                    <p className="text-[10px] text-slate-400 font-medium">{guardian.time || '--:--'}</p>
                  </div>
                </div>
              </div>
              <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold border border-emerald-100">
                {guardian.status}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900">Status Penjemputan</h3>
        <div className="bg-white p-6 rounded-[40px] border border-slate-100 shadow-sm">
          <div className="space-y-6 relative ml-4">
            <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-slate-100" />
            {steps.map((step) => (
              <div key={step.id} className="relative pl-8 flex items-center justify-between">
                <div className={cn(
                  "absolute left-[-5px] w-3 h-3 rounded-full border-2 border-white shadow-sm transition-all duration-500",
                  step.status === "completed" ? "bg-emerald-500" : 
                  step.status === "active" ? "bg-emerald-400 scale-125 ring-4 ring-emerald-100" : 
                  "bg-slate-200"
                )} />
                <div className="flex flex-col">
                  <p className={cn(
                    "text-sm font-bold",
                    step.status === "pending" ? "text-slate-400" : "text-slate-900"
                  )}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">{step.time}</p>
                </div>
                {step.status === "completed" && <CheckCircle2 size={16} className="text-emerald-500" />}
                {step.status === "active" && <Loader2 size={16} className="text-emerald-400 animate-spin" />}
                {step.status === "pending" && <AlertCircle size={16} className="text-slate-200" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Guardian Pickup Modal */}
      <AnimatePresence>
        {isRequestingGuardian && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSubmitting && setIsRequestingGuardian(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90]"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-[48px] p-8 pb-12 z-[100] shadow-2xl border-t border-slate-100"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-slate-900">Registrasi Penjemput</h2>
                <button 
                  onClick={() => setIsRequestingGuardian(false)}
                  className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {isSuccess ? (
                <div className="py-12 flex flex-col items-center text-center space-y-4">
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                    <CheckCircle2 size={48} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Berhasil Terdaftar!</h3>
                  <p className="text-slate-500 text-sm">Data penjemput telah diverifikasi oleh sistem keamanan sekolah.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {savedProfile && (
                    <motion.button
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      type="button"
                      onClick={() => {
                        setGuardianName(savedProfile.name);
                        setRelationship(savedProfile.relationship);
                        setGuardianPhoto(savedProfile.photo);
                      }}
                      className="w-full p-4 bg-emerald-50 border border-emerald-100 rounded-3xl flex items-center gap-4 hover:bg-emerald-100 transition-colors group"
                    >
                      <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white shadow-sm">
                        <img src={savedProfile.photo} alt="Saved" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Profil Tersimpan</p>
                        <p className="text-sm font-bold text-slate-900">{savedProfile.name}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{savedProfile.relationship}</p>
                      </div>
                      <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-sm group-hover:scale-110 transition-transform">
                        <CheckCircle2 size={16} />
                      </div>
                    </motion.button>
                  )}

                  <form onSubmit={handleSubmitGuardian} className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Nama Penjemput</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                        <input 
                          type="text" 
                          value={guardianName}
                          onChange={(e) => setGuardianName(e.target.value)}
                          placeholder="Masukkan nama lengkap"
                          className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Hubungan Keluarga</label>
                      <select 
                        value={relationship}
                        onChange={(e) => setRelationship(e.target.value)}
                        className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none"
                        required
                      >
                        <option value="">Pilih Hubungan</option>
                        <option value="Ayah">Ayah</option>
                        <option value="Ibu">Ibu</option>
                        <option value="Kakak">Kakak</option>
                        <option value="Paman/Bibi">Paman/Bibi</option>
                        <option value="Kakek/Nenek">Kakek/Nenek</option>
                        <option value="Lainnya">Lainnya</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Foto Penjemput (Validasi)</label>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                          "relative w-full h-40 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all overflow-hidden",
                          guardianPhoto ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                        )}
                      >
                        {guardianPhoto ? (
                          <img src={guardianPhoto} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <>
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm">
                              <Camera size={24} />
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ambil Foto / Upload</p>
                          </>
                        )}
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handlePhotoUpload}
                          accept="image/*"
                          capture="user"
                          className="hidden"
                        />
                      </div>
                    </div>
                  </div>

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold flex items-center gap-2 border border-red-100"
                    >
                      <AlertCircle size={16} />
                      {error}
                    </motion.div>
                  )}

                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-5 rounded-3xl shadow-xl shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : (
                      <>
                        <Upload size={20} />
                        Kirim Validasi
                      </>
                    )}
                  </button>
                </form>
              </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Debug Info (Only in dev) */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="mt-8 p-4 bg-gray-100 rounded-lg text-[10px] font-mono overflow-auto max-h-40">
          <p className="font-bold mb-1 text-gray-500">DEBUG INFO:</p>
          <p>Auth UID: {auth.currentUser?.uid || 'Not signed in'}</p>
          <p>User Role: {user.role}</p>
          <p>User Kelas: {user.kelas || 'N/A'}</p>
          <p>Last Error: {error || 'None'}</p>
          <p>Is Submitting: {isSubmitting ? 'Yes' : 'No'}</p>
        </div>
      )}
    </div>
  );
}
