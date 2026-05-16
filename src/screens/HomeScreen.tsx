import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Calendar, BookOpen, CreditCard, User, ChevronRight, GraduationCap, MapPin, X, ShieldCheck, Clock, CheckCircle2, AlertCircle, Loader2, BellRing, BellOff, Receipt, Video, Users, Plus, Send, Maximize2, RefreshCw, School, MessageSquare, Settings } from "lucide-react";
import { UserData, PaymentRequest } from "@/types";
import { cn } from "@/lib/utils";
import { db, auth, collection, onSnapshot, query, orderBy, limit, doc, updateDoc, serverTimestamp, where, signInAnonymously, Timestamp } from "@/firebase";
import { toast } from "sonner";
import { syncBiometricsToFirestore } from "@/lib/biometricSync";

interface HomeScreenProps {
  user: UserData;
  onFeatureClick: (featureId: string, params?: any) => void;
}

interface PickupNotification {
  id: string;
  studentNis: string;
  studentName: string;
  studentClass: string;
  guardianName: string;
  relationship: string;
  time: string;
  photo: string;
  status: "waiting" | "verified";
  createdAt?: any;
  verifiedAt?: any;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function HomeScreen({ user, onFeatureClick }: HomeScreenProps) {
  const [selectedPickup, setSelectedPickup] = useState<PickupNotification | null>(null);
  const [pickupNotifications, setPickupNotifications] = useState<PickupNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(Number(user.level) === 2 || Number(user.level) === 1);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem("pickup_notifications") === "true";
  });
  const [lastNotifiedId, setLastNotifiedId] = useState<string | null>(null);

  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRequest | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [biometricData, setBiometricData] = useState<any>(null);
  const [loadingBiometric, setLoadingBiometric] = useState(false);

  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [hasNewBiometric, setHasNewBiometric] = useState(false);
  const [lastBiometricId, setLastBiometricId] = useState(() => {
    return localStorage.getItem(`last_biometric_${user.nis || user.nip || user.nopendaftaran}`) || "";
  });
  const notifiedRef = React.useRef<string>(lastBiometricId);

  const getMeetNickname = () => {
    const baseName = user.nama_kelas || "General";
    const cleanName = baseName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return `hidis-${cleanName}`;
  };

  const handleJoinMeet = () => {
    const nickname = getMeetNickname();
    window.open(`https://meet.google.com/lookup/${nickname}`, "_blank");
  };

  const features = [
    { id: "presence", label: "Presensi", icon: Calendar, color: "bg-blue-500" },
    { id: "grades", label: "Nilai", icon: GraduationCap, color: "bg-purple-500" },
    { id: "finance", label: "Keuangan", icon: CreditCard, color: "bg-emerald-500" },
    { id: "library", label: "Perpustakaan", icon: BookOpen, color: "bg-amber-500" },
    { id: "classroom", label: "Classroom", icon: School, color: "bg-green-600" },
    { id: "chat", label: "Chat", icon: MessageSquare, color: "bg-indigo-500" },
  ];

  const isLandlord = 
    Number(user.level) === 1 || 
    user.nama?.toLowerCase() === "jibas" || 
    user.nis?.toLowerCase() === "jibas" || 
    user.nip?.toLowerCase() === "jibas" ||
    user.role === "admin" ||
    (auth.currentUser?.email === "wahab@alislam.sch.id");

  const isEmployee = Number(user.level) === 2 || Number(user.level) === 1;
  const isFinance = Number(user.level) === 1 || (Number(user.level) === 2 && Number(user.is_finance) === 1);

  useEffect(() => {
    console.log("HomeScreen - User State:", {
      nama: user.nama,
      level: user.level,
      is_finance: user.is_finance,
      isEmployee,
      isFinance
    });
  }, [user, isEmployee, isFinance]);

  useEffect(() => {
    let unsubscribePickups: (() => void) | null = null;
    let unsubscribePayments: (() => void) | null = null;

    const unsubscribeAuth = auth.onAuthStateChanged((firebaseUser) => {
      console.log("HomeScreen - Auth State Changed:", firebaseUser?.uid);
      
      // Cleanup previous listeners if auth state changes
      if (unsubscribePickups) unsubscribePickups();
      if (unsubscribePayments) unsubscribePayments();
      
      if (!firebaseUser) {
        setPickupNotifications([]);
        setPaymentRequests([]);
        setLoadingNotifications(false);
        return;
      }

      // Setup Pickup Notifications Listener
      if (isEmployee) {
        console.log("HomeScreen - Setting up Pickup listener...");
        const path = 'pickups';
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        const q = query(
          collection(db, path), 
          where("createdAt", ">=", Timestamp.fromDate(twelveHoursAgo)),
          orderBy("createdAt", "desc")
        );
        
        unsubscribePickups = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as PickupNotification[];
          
          console.log("HomeScreen - Pickups received:", data.length);
          
          if (notificationsEnabled) {
            const currentWaiting = data.filter(n => n.status === "waiting");
            if (currentWaiting.length > 0) {
              const newestWaiting = currentWaiting[0];
              if (!loadingNotifications && newestWaiting.id !== lastNotifiedId) {
                toast.info("Penjemput Tiba!", {
                  description: `${newestWaiting.guardianName} telah tiba untuk menjemput ${newestWaiting.studentName}`,
                  duration: 5000,
                  action: {
                    label: "Lihat",
                    onClick: () => setSelectedPickup(newestWaiting)
                  }
                });
                setLastNotifiedId(newestWaiting.id);
              }
            }
          }
          setPickupNotifications(data);
          setLoadingNotifications(false);
        }, (error) => {
          console.error("HomeScreen - Pickup listener error:", error);
          handleFirestoreError(error, OperationType.GET, path);
        });
      }

      // Setup Payment Requests Listener
      if (isFinance) {
        console.log("HomeScreen - Setting up Payment listener...");
        const path = 'payments';
        const q = query(collection(db, path), where("status", "==", "waiting"));
        
        unsubscribePayments = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as PaymentRequest[];
          
          console.log("HomeScreen - Payment Requests received:", data.length);
          
          // Sort manually since we removed orderBy to avoid index issues
          data.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return dateB - dateA;
          });

          setPaymentRequests(data);
        }, (error) => {
          console.error("HomeScreen - Payment listener error:", error);
          toast.error("Gagal memuat verifikasi pembayaran", {
            description: "Mungkin ada masalah koneksi atau izin akses."
          });
          handleFirestoreError(error, OperationType.GET, path);
        });
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribePickups) unsubscribePickups();
      if (unsubscribePayments) unsubscribePayments();
    };
  }, [isEmployee, isFinance, notificationsEnabled, loadingNotifications, lastNotifiedId]);

  useEffect(() => {
    const fetchBiometric = async () => {
      const identifier = user.nis || user.nip || user.nopendaftaran || user.nama || user.id;
      if (!identifier) return;

      if (!biometricData) setLoadingBiometric(true);
      try {
        console.log("Fetching biometric data for identifier:", identifier);
        
        // Fetch FaceID
        const faceidRes = await fetch(`/api/jbssat/faceid/${identifier}`);
        const faceidJson = await faceidRes.json();
        
        // Fetch Fingerprint
        const fingerprintRes = await fetch(`/api/jbssat/fingerprint/${identifier}`);
        const fingerprintJson = await fingerprintRes.json();
        
        console.log("Current User:", user);
        console.log("FaceID API Response:", faceidJson);
        console.log("Fingerprint API Response:", fingerprintJson);
        
        let combinedBiometric: any[] = [];

        const filterBiometric = (data: any[], type: 'FaceID' | 'Fingerprint') => {
          if (!data || !Array.isArray(data)) return [];
          
          return data
            .filter((f: any) => {
              const ni = String(f.nomor_induk || '').trim();
              const fnama = String(f.nama || '').toLowerCase().trim();
              const unama = String(user.nama || '').toLowerCase().trim();
              
              const possibleIds = [
                user.nis, user.nip, user.nopendaftaran, 
                user.replid, user.pin, user.id_fingerprint, user.id,
                (user as any).nomor_induk,
                (user as any).nis, (user as any).nip
              ].filter(Boolean).map(id => String(id).trim());
              
              const isMatch = possibleIds.some(id => 
                ni === id || 
                ni.replace(/^0+/, '') === id.replace(/^0+/, '') ||
                String(f.id) === id
              ) || fnama === unama || (ni.length > 4 && unama.includes(ni)) || (unama.length > 4 && ni.includes(unama));
              
              return isMatch;
            })
            .flatMap((f: any) => {
              const records = [];
              // If machine_id is present, it's definitely a Fingerprint record
              const actualType = f.machine_id ? 'Fingerprint' : type;
              
              if (f.jam_datang && f.jam_datang !== "00:00:00") {
                records.push({ ...f, jam: f.jam_datang, status: "Masuk", type: actualType });
              }
              if (f.jam_pulang && f.jam_pulang !== "00:00:00") {
                records.push({ ...f, jam: f.jam_pulang, status: "Pulang", type: actualType });
              }
              if (!f.jam_datang && !f.jam_pulang && f.jam && f.jam !== "00:00:00") {
                records.push({ ...f, jam: f.jam, type: actualType, status: f.status || "Presensi" });
              }
              return records;
            });
        };

        const faceIdRecords = filterBiometric(faceidJson.data, 'FaceID');
        const fingerprintRecords = filterBiometric(fingerprintJson.data, 'Fingerprint');
        
        // Logic: If fingerprint is detected (either from endpoint or by machine_id),
        // show ONLY fingerprint data. Do not mix with FaceID.
        const allRecords = [...faceIdRecords, ...fingerprintRecords];
        const hasFingerprint = allRecords.some(r => r.machine_id || r.type === 'Fingerprint');
        
        if (hasFingerprint) {
          // Only show fingerprint records if machine_id is detected
          combinedBiometric = allRecords.filter(r => r.machine_id || r.type === 'Fingerprint');
          // Ensure they are labeled correctly
          combinedBiometric = combinedBiometric.map(r => ({ ...r, type: 'Fingerprint' }));
        } else {
          combinedBiometric = faceIdRecords;
        }

        if (combinedBiometric.length > 0) {
          combinedBiometric.sort((a: any, b: any) => {
            const parseDate = (item: any) => {
              const d = new Date(item.tanggal);
              const [h, m, s] = item.jam.split(':').map(Number);
              d.setHours(h, m, s);
              return d.getTime();
            };
            return parseDate(b) - parseDate(a);
          });
          
          // Deduplicate records aggressively using a Map
          const uniqueMap = new Map();
          combinedBiometric.forEach(record => {
            const date = String(record.tanggal || '').split('T')[0].trim();
            const time = String(record.jam || '').substring(0, 8).trim();
            const type = String(record.type || '').trim().toLowerCase();
            const status = String(record.status || '').trim().toLowerCase();
            const token = String(record.face_token || record.machine_id || '').trim();
            
            const key = `${date}_${time}_${type}_${status}_${token}`;
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, record);
            }
          });

          const uniqueBiometric = Array.from(uniqueMap.values());

          if (uniqueBiometric.length > 0) {
            const latest = uniqueBiometric[0];
            const datePart = latest.tanggal.includes('T') ? latest.tanggal.split('T')[0] : latest.tanggal;
            const biometricId = `${datePart}_${latest.jam}_${latest.type}${latest.status ? `_${latest.status}` : ''}`;
            
            // Only notify if:
            // 1. It's a new ID (different from lastBiometricId and notifiedRef)
            // 2. It's from today
            const today = new Date().toISOString().split('T')[0];
            const isToday = datePart === today;

            if (biometricId !== lastBiometricId && biometricId !== notifiedRef.current && isToday) {
              setHasNewBiometric(true);
              setLastBiometricId(biometricId);
              notifiedRef.current = biometricId;
              localStorage.setItem(`last_biometric_${user.nis || user.nip || user.nopendaftaran}`, biometricId);
              
              toast.success(`Presensi ${latest.type} Berhasil!`, {
                description: `${latest.status} tercatat pada ${latest.jam} WIB`,
                duration: 5000,
              });
            }
            
            setBiometricData(latest);

            // Sync all fetched biometrics to Firestore
            if (user.uid) {
              syncBiometricsToFirestore(uniqueBiometric, user.uid);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching biometric data:", error);
      } finally {
        setLoadingBiometric(false);
      }
    };

    fetchBiometric();
    const interval = setInterval(fetchBiometric, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [user.nis, user.nip, user.nopendaftaran, user.nama, user.replid, user.pin, user.id_fingerprint, user.id, lastBiometricId]);

  useEffect(() => {
    if (!user.uid) return;

    const q = query(
      collection(db, "biometrics"),
      where("userId", "==", user.uid),
      orderBy("tanggal", "desc"),
      orderBy("jam", "desc"),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const latest = snapshot.docs[0].data();
        setBiometricData((prev: any) => {
          if (!prev) return latest;
          const apiDate = new Date(`${prev.tanggal}T${prev.jam}`);
          const firestoreDate = new Date(`${latest.tanggal}T${latest.jam}`);
          return firestoreDate > apiDate ? latest : prev;
        });
      }
    }, (error) => {
      console.error("Error fetching latest biometric from Firestore:", error);
    });

    return () => unsubscribe();
  }, [user.uid]);

  const handleVerifyPayment = async (paymentId: string, status: "verified" | "rejected") => {
    const path = `payments/${paymentId}`;
    setIsVerifying(true);
    console.log(`HomeScreen: Verifying payment ${paymentId} with status ${status}`);
    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        console.log("HomeScreen: No user found, signing in anonymously...");
        try {
          const result = await signInAnonymously(auth);
          currentUser = result.user;
        } catch (err) {
          console.error("HomeScreen: Anonymous sign-in failed:", err);
          toast.error("Sesi tidak valid. Silakan login ulang.");
          setIsVerifying(false);
          return;
        }
      }

      console.log("HomeScreen: Updating document in Firestore...");
      await updateDoc(doc(db, 'payments', paymentId), {
        status,
        verifiedAt: serverTimestamp(),
        verifiedBy: currentUser.uid
      });
      console.log("HomeScreen: Document updated successfully.");
      
      toast.success(status === "verified" ? "Pembayaran Diverifikasi" : "Pembayaran Ditolak");
      setSelectedPayment(null);
    } catch (error) {
      console.error("HomeScreen: Verification error:", error);
      toast.error("Gagal memproses verifikasi");
      if (error && typeof error === 'object' && 'code' in error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleVerifyPickup = async (pickupId: string) => {
    const path = `pickups/${pickupId}`;
    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        try {
          const result = await signInAnonymously(auth);
          currentUser = result.user;
        } catch (err) {
          toast.error("Sesi tidak valid. Silakan login ulang.");
          return;
        }
      }

      await updateDoc(doc(db, 'pickups', pickupId), {
        status: 'verified',
        verifiedAt: serverTimestamp()
      });
      toast.success("Penjemput Terverifikasi", {
        description: "Status penjemputan telah diperbarui."
      });
      setSelectedPickup(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const toggleNotifications = () => {
    const newValue = !notificationsEnabled;
    setNotificationsEnabled(newValue);
    localStorage.setItem("pickup_notifications", String(newValue));
    toast.success(newValue ? "Notifikasi Diaktifkan" : "Notifikasi Dimatikan", {
      description: newValue ? "Anda akan menerima notifikasi saat penjemput tiba." : "Anda tidak akan menerima notifikasi otomatis."
    });
  };

  const waitingPickupsCount = isEmployee ? pickupNotifications.filter(n => n.status === "waiting").length : 0;
  const waitingPaymentsCount = isFinance ? paymentRequests.length : 0;
  const biometricCount = hasNewBiometric ? 1 : 0;

  const totalNotifications = waitingPickupsCount + waitingPaymentsCount + biometricCount;

  if (totalNotifications > 0) {
    console.log("HomeScreen - Notification Counts:", {
      waitingPickupsCount,
      waitingPaymentsCount,
      biometricCount,
      totalNotifications
    });
  }

  const formatCurrency = (amount: any) => {
    const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(num);
  };

  return (
    <div className="pb-32 pt-8 px-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-slate-400 text-sm font-medium">Selamat Datang,</h2>
          <h1 className="text-2xl font-bold text-slate-900">{user.nama}</h1>
        </div>
        <button 
          onClick={() => setIsNotificationDrawerOpen(true)}
          className="relative p-2.5 bg-white rounded-2xl shadow-sm border border-slate-100 active:scale-95 transition-all"
        >
          <Bell size={20} className="text-slate-600" />
          {totalNotifications > 0 && (
            <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full" />
          )}
        </button>
      </div>

      {/* Profile Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative overflow-hidden bg-blue-600 rounded-[32px] p-6 text-white shadow-xl shadow-blue-500/20"
      >
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-blue-400/20 rounded-full blur-3xl" />

        <div className="relative flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center overflow-hidden border border-white/20">
            {user.foto ? (
              <img src={user.foto} alt={user.nama} className="w-full h-full object-cover" />
            ) : (
              <User size={32} className="text-white" />
            )}
          </div>
          <div>
            <p className="text-blue-100 text-xs font-semibold uppercase tracking-widest">
              {Number(user.level) === 3 ? "Siswa Aktif" : Number(user.level) === 4 ? "Calon Siswa" : "Pegawai"}
            </p>
            <p className="text-lg font-bold mt-0.5">{user.nis || user.nip || user.nopendaftaran}</p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-blue-100 text-[10px] font-bold uppercase tracking-wider">Status Akademik</p>
            <p className="text-sm font-semibold">Semester Genap 2025/2026</p>
          </div>
          <button className="p-2 bg-white/20 backdrop-blur-md rounded-xl border border-white/20">
            <ChevronRight size={18} />
          </button>
        </div>
      </motion.div>

      {/* Attendance Status */}
      <div className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck size={18} className="text-blue-600" />
            {Number(user.level) === 2 ? "Presensi Pegawai" : "Presensi Siswa"} (Biometrik)
          </h3>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => onFeatureClick("presence", { initialTab: "biometric" })}
              className="px-3 py-1 text-[10px] font-bold rounded-lg bg-white text-blue-600 shadow-sm transition-all"
            >
              Detail
            </button>
          </div>
        </div>
        
        {loadingBiometric ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={24} className="text-blue-600 animate-spin" />
          </div>
        ) : biometricData ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                biometricData.type === 'FaceID' ? "bg-purple-50 text-purple-600" : "bg-indigo-50 text-indigo-600"
              )}>
                <Clock size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-900">
                    {biometricData.type} Berhasil
                  </p>
                  {biometricData.status && (
                    <span className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                      biometricData.status === 'Masuk' ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600"
                    )}>
                      {biometricData.status}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                  {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(biometricData.tanggal))}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-900">
                {biometricData.jam}
              </p>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                {biometricData.type === 'FaceID' ? 'Face ID' : 'Fingerprint'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
              <AlertCircle size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Belum Ada Data Biometrik</p>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Silakan lakukan presensi di mesin</p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        {features.map((feature) => (
          <button 
            key={feature.id} 
            onClick={() => onFeatureClick(feature.id)}
            className="flex flex-col items-center gap-2 group"
          >
            <div className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center text-white shadow-lg shadow-${feature.color.split("-")[1]}-500/20 transition-all group-active:scale-90`}>
              <feature.icon size={24} />
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{feature.label}</span>
          </button>
        ))}
      </div>

      {/* Google Meet Shortcut */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Video size={18} className="text-blue-600" />
            Google Meet
          </h3>
        </div>

        <button 
          onClick={handleJoinMeet}
          className="w-full bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[28px] p-6 shadow-lg shadow-blue-200 group relative overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all" />
          <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-blue-400/20 rounded-full blur-xl" />
          
          <div className="relative flex items-center gap-5">
            <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white shadow-inner">
              <Video size={28} />
            </div>
            <div className="flex-1 text-left">
              <h4 className="text-white font-bold text-lg leading-tight">Google Meet</h4>
              <p className="text-blue-100 text-[11px] font-medium uppercase tracking-wider mt-1 opacity-80">
                Nickname: {getMeetNickname()}
              </p>
            </div>
            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white group-hover:bg-white/20 transition-all">
              <Maximize2 size={20} />
            </div>
          </div>
        </button>
      </div>

      {/* Notification Drawer */}
      <AnimatePresence>
        {isNotificationDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNotificationDrawerOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90]"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-full max-w-md bg-slate-50 z-[100] shadow-2xl flex flex-col"
            >
              <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                    <Bell size={20} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Notifikasi</h2>
                </div>
                <div className="flex items-center gap-2">
                  {hasNewBiometric && (
                    <button 
                      onClick={() => {
                        if (biometricData) {
                          const datePart = biometricData.tanggal.includes('T') ? biometricData.tanggal.split('T')[0] : biometricData.tanggal;
                          const biometricId = `${datePart}_${biometricData.jam}_${biometricData.type}${biometricData.status ? `_${biometricData.status}` : ''}`;
                          setLastBiometricId(biometricId);
                          setHasNewBiometric(false);
                          localStorage.setItem(`last_biometric_${user.nis || user.nip || user.nopendaftaran}`, biometricId);
                        }
                      }}
                      className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                    >
                      Tandai Dibaca
                    </button>
                  )}
                  <button
                    onClick={() => setIsNotificationDrawerOpen(false)}
                    className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Biometric Notification Section */}
                {hasNewBiometric && biometricData && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <ShieldCheck size={16} /> Presensi Baru
                    </h3>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-blue-600 p-5 rounded-3xl text-white shadow-lg shadow-blue-500/20 relative overflow-hidden"
                    >
                      <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />
                      <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                            <Clock size={24} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold">{biometricData.type} Sukses</h4>
                              {biometricData.status && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-white/20 rounded text-white uppercase">
                                  {biometricData.status}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-blue-100">{biometricData.jam} WIB</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                            {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(biometricData.tanggal))}
                          </p>
                          <CheckCircle2 size={16} className="ml-auto mt-1" />
                        </div>
                      </div>
                    </motion.div>
                  </div>
                )}
                {/* Pickup Notifications Section */}
                {isEmployee && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <MapPin size={16} /> Penjemputan
                      </h3>
                      <button 
                        onClick={toggleNotifications}
                        className={cn(
                          "p-1.5 rounded-lg transition-all active:scale-90",
                          notificationsEnabled ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"
                        )}
                      >
                        {notificationsEnabled ? <BellRing size={14} /> : <BellOff size={14} />}
                      </button>
                    </div>
                    <div className="space-y-3">
                      {pickupNotifications.length > 0 ? (
                        pickupNotifications.map((notif) => (
                          <motion.button
                            key={notif.id}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              setSelectedPickup(notif);
                              // Keep drawer open or close? Usually keep open for context
                            }}
                            className="w-full bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                                <User size={20} />
                              </div>
                              <div className="text-left">
                                <h4 className="text-sm font-bold text-slate-900">{notif.studentName}</h4>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                  Oleh {notif.guardianName}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] font-bold text-slate-400">
                                {notif.createdAt?.toDate ? 
                                  notif.createdAt.toDate().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 
                                  notif.time}
                              </span>
                              {notif.status === "waiting" ? (
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                              ) : (
                                <ShieldCheck size={14} className="text-emerald-500" />
                              )}
                            </div>
                          </motion.button>
                        ))
                      ) : (
                        <p className="text-center py-8 text-slate-400 text-sm italic">Tidak ada data penjemputan</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment Verification Section */}
                {isFinance && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <CreditCard size={16} /> Pembayaran
                    </h3>
                    <div className="space-y-3">
                      {paymentRequests.length > 0 ? (
                        paymentRequests.map((req) => (
                          <motion.button
                            key={req.id}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSelectedPayment(req)}
                            className="w-full bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                                <Receipt size={20} />
                              </div>
                              <div className="text-left">
                                <h4 className="text-sm font-bold text-slate-900">{req.studentName}</h4>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                  {req.billName} • {formatCurrency(req.amount)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] font-bold text-slate-400">
                                {req.createdAt?.toDate ? 
                                  req.createdAt.toDate().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 
                                  "Baru saja"}
                              </span>
                              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            </div>
                          </motion.button>
                        ))
                      ) : (
                        <p className="text-center py-8 text-slate-400 text-sm italic">Tidak ada verifikasi pembayaran</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Empty State for non-staff or no data */}
                {!isEmployee && !isFinance && (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                      <BellOff size={40} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-bold text-slate-900">Belum Ada Notifikasi</p>
                      <p className="text-sm text-slate-500">Notifikasi penting akan muncul di sini.</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Pickup Detail Modal */}
      <AnimatePresence>
        {selectedPickup && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPickup(null)}
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
                <h2 className="text-xl font-bold text-slate-900">Detail Penjemputan</h2>
                <button
                  onClick={() => setSelectedPickup(null)}
                  className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Student Info */}
                <div className="bg-blue-50 p-6 rounded-3xl flex items-center gap-4 border border-blue-100">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm">
                    <GraduationCap size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{selectedPickup.studentName}</h3>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-blue-600 uppercase tracking-widest">Kelas {selectedPickup.studentClass}</p>
                      <span className="w-1 h-1 bg-slate-300 rounded-full" />
                      <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">NIS {selectedPickup.studentNis}</p>
                    </div>
                  </div>
                </div>

                {/* Guardian Info */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Informasi Penjemput</h4>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-3xl overflow-hidden border-4 border-slate-50 shadow-lg">
                      <img src={selectedPickup.photo} alt="Guardian" className="w-full h-full object-cover" />
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nama Wali</p>
                        <p className="text-base font-bold text-slate-900">{selectedPickup.guardianName}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hubungan</p>
                        <p className="text-sm font-semibold text-slate-600">{selectedPickup.relationship}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Clock size={12} /> Waktu
                    </p>
                    <p className="text-sm font-bold text-slate-900">
                      {selectedPickup.createdAt?.toDate ? 
                        selectedPickup.createdAt.toDate().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 
                        selectedPickup.time}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck size={12} /> Status
                    </p>
                    <p className={cn(
                      "text-sm font-bold",
                      selectedPickup.status === "waiting" ? "text-red-500" : "text-emerald-500"
                    )}>
                      {selectedPickup.status === "waiting" ? "Menunggu" : "Terverifikasi"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedPickup(null)}
                    className="flex-1 bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl active:scale-95 transition-all"
                  >
                    Tutup
                  </button>
                  {selectedPickup.status === "waiting" && (
                    <button
                      onClick={() => handleVerifyPickup(selectedPickup.id)}
                      className="flex-[2] bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <ShieldCheck size={20} />
                      Verifikasi
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Payment Verification Modal */}
      <AnimatePresence>
        {selectedPayment && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isVerifying && setSelectedPayment(null)}
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
                <h2 className="text-xl font-bold text-slate-900">Verifikasi Pembayaran</h2>
                <button
                  onClick={() => setSelectedPayment(null)}
                  disabled={isVerifying}
                  className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 space-y-1">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Siswa</p>
                  <h3 className="text-lg font-bold text-slate-900">{selectedPayment.studentName}</h3>
                  <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">NIS {selectedPayment.studentNis}</p>
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Bukti Pembayaran</h4>
                  <div className="w-full h-64 rounded-3xl overflow-hidden border-4 border-slate-50 shadow-lg bg-slate-100 flex items-center justify-center">
                    {selectedPayment.proofPhoto ? (
                      <img src={selectedPayment.proofPhoto} alt="Bukti" className="w-full h-full object-contain" />
                    ) : (
                      <AlertCircle size={48} className="text-slate-300" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tagihan</p>
                      <p className="text-sm font-bold text-slate-900">{selectedPayment.billName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nominal</p>
                      <p className="text-sm font-bold text-emerald-600">{formatCurrency(selectedPayment.amount)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleVerifyPayment(selectedPayment.id, "rejected")}
                    disabled={isVerifying}
                    className="flex-1 bg-red-50 text-red-600 font-bold py-4 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {isVerifying ? <Loader2 className="animate-spin" size={20} /> : <X size={20} />}
                    Tolak
                  </button>
                  <button
                    onClick={() => handleVerifyPayment(selectedPayment.id, "verified")}
                    disabled={isVerifying}
                    className="flex-[2] bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {isVerifying ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
                    Verifikasi
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
