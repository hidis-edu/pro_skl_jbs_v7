import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Settings, LogOut, Shield, HelpCircle, ChevronRight, Mail, CheckCircle2, Loader2, MessageSquare, RefreshCw, AlertCircle } from "lucide-react";
import axios from "axios";
import { UserData } from "@/types";
import { cn } from "@/lib/utils";
import { auth, googleProvider, linkWithPopup, signInWithPopup, onAuthStateChanged, db, doc } from "@/firebase";
import { toast } from "sonner";

interface ProfileScreenProps {
  user: UserData;
  onLogout: () => void;
  onNavigate?: (id: string, params?: any) => void;
}

export default function ProfileScreen({ user, onLogout, onNavigate }: ProfileScreenProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const isGoogleConnected = currentUser?.providerData.some(
    (provider) => provider.providerId === "google.com"
  );

  const isLandlord = 
    Number(user.level) === 1 || 
    user.nama?.toLowerCase() === "jibas" || 
    user.nis?.toLowerCase() === "jibas" || 
    user.nip?.toLowerCase() === "jibas" ||
    user.role === "admin" ||
    currentUser?.email === "wahab@alislam.sch.id";

  const handleConnectGoogle = async () => {
    if (isConnecting || isGoogleConnected) return;

    setIsConnecting(true);
    try {
      let result;
      if (currentUser?.isAnonymous) {
        result = await linkWithPopup(currentUser, googleProvider);
      } else {
        result = await signInWithPopup(auth, googleProvider);
      }

      const email = result.user.email?.toLowerCase();
      if (email && (Number(user.level) === 2 || Number(user.level) === 3)) {
        const allowedDomains = ["guru.hidis.id", "siswa.hidis.id", "sdihidayatulislamiyah.sch.id", "sdi.hidis.id"];
        const isAllowedDomain = allowedDomains.some(domain => email.endsWith(`@${domain}`));
        
        if (!isAllowedDomain) {
          toast.error("Gagal: Guru & Siswa wajib menggunakan akun Workspace resmi (@guru.hidis.id, @siswa.hidis.id, @sdi.hidis.id, atau @sdihidayatulislamiyah.sch.id)");
          // If it was a new sign in (not linking), we might want to sign out
          if (!currentUser?.isAnonymous) {
            await auth.signOut();
          }
          return;
        }
      }

      toast.success(currentUser?.isAnonymous ? "Akun Google berhasil dihubungkan" : "Berhasil masuk dengan Google");
    } catch (error: any) {
      console.error("Google connection error:", error);
      if (error.code === "auth/credential-already-in-use") {
        toast.error("Email Google ini sudah terhubung dengan akun lain. Silakan Keluar Aplikasi dan masuk langsung menggunakan tombol 'Masuk dengan Google'.");
      } else {
        toast.error("Gagal menghubungkan akun Google.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleResetMapping = async () => {
    if (!currentUser) return;
    setIsResetting(true);
    try {
      // Delete user document in Firestore
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "users", currentUser.uid));
      
      toast.success("Pemetaan akun berhasil dihapus. Silakan masuk kembali.");
      
      // Logout
      onLogout();
    } catch (error) {
      console.error("Failed to reset mapping:", error);
      toast.error("Gagal menghapus pemetaan akun");
    } finally {
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

  const menuItems = [
    { id: "security", label: "Keamanan & PIN", icon: Shield, color: "text-blue-600" },
    { id: "help", label: "Pusat Bantuan", icon: HelpCircle, color: "text-emerald-600" },
  ];

  return (
    <div className="pb-32 pt-8 px-6 space-y-8">
      <div className="space-y-1">
        <h2 className="text-slate-400 text-sm font-medium">Profil</h2>
        <h1 className="text-2xl font-bold text-slate-900">Akun Saya</h1>
      </div>

      {/* Profile Header */}
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-[32px] bg-blue-100 flex items-center justify-center overflow-hidden border-4 border-white shadow-xl">
            {user.foto ? (
              <img src={user.foto} alt={user.nama} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User size={48} className="text-blue-600" />
            )}
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-blue-600 rounded-2xl flex items-center justify-center text-white border-4 border-white shadow-lg">
            <Settings size={14} />
          </div>
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-slate-900">{user.nama}</h2>
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-medium text-slate-400 uppercase tracking-widest">
              {user.nis || user.nip || user.nopendaftaran}
            </p>
            {user.nama_kelas && (
              <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold uppercase tracking-widest border border-blue-100">
                Kelas {user.nama_kelas}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Account Settings Section */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4">Pengaturan Akun</h3>
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-600">
                <Mail size={20} />
              </div>
              <div className="space-y-0.5">
                <span className="text-sm font-bold text-slate-700 block">Hubungkan Google</span>
                <p className="text-[10px] text-slate-400 font-medium">
                  {isGoogleConnected ? "Akun Anda sudah terhubung" : "Wajib untuk verifikasi pembayaran"}
                </p>
              </div>
            </div>
            <button
              onClick={handleConnectGoogle}
              disabled={isConnecting || isGoogleConnected}
              className={cn(
                "px-4 py-2 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2",
                isGoogleConnected 
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                  : "bg-blue-600 text-white shadow-lg shadow-blue-200"
              )}
            >
              {isConnecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isGoogleConnected ? (
                <>
                  <CheckCircle2 size={14} />
                  Terhubung
                </>
              ) : (
                "Hubungkan"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Security & Help Sections */}

      {/* Other Menu Items */}
      <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
        {menuItems.map((item, idx) => (
          <button
            key={item.id}
            className={`w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors ${
              idx !== menuItems.length - 1 ? "border-b border-slate-50" : ""
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center ${item.color}`}>
                <item.icon size={20} />
              </div>
              <span className="text-sm font-bold text-slate-700">{item.label}</span>
            </div>
            <ChevronRight size={18} className="text-slate-300" />
          </button>
        ))}
      </div>

      {/* Logout Button */}
      <div className="space-y-4">
        <button
          onClick={() => setShowResetConfirm(true)}
          className="w-full flex items-center justify-center gap-3 p-6 bg-slate-100 text-slate-600 rounded-[32px] font-bold text-sm uppercase tracking-widest active:scale-95 transition-all"
        >
          <RefreshCw size={20} />
          Reset Pemetaan Akun
        </button>

        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-3 p-6 bg-red-50 text-red-600 rounded-[32px] font-bold text-sm uppercase tracking-widest active:scale-95 transition-all"
        >
          <LogOut size={20} />
          Keluar Aplikasi
        </button>
      </div>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResetConfirm(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[40px] shadow-2xl overflow-hidden p-8 space-y-6"
            >
              <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center text-red-600 mx-auto">
                <AlertCircle size={32} />
              </div>
              
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-slate-900">Reset Pemetaan?</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Tindakan ini akan menghapus hubungan antara akun Google Anda dengan data JIBAS di aplikasi ini. Anda harus masuk kembali untuk memetakan ulang.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleResetMapping}
                  disabled={isResetting}
                  className="w-full py-4 bg-red-600 text-white rounded-2xl font-bold text-sm uppercase tracking-widest shadow-lg shadow-red-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isResetting ? <Loader2 size={18} className="animate-spin" /> : "Ya, Hapus Pemetaan"}
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm uppercase tracking-widest active:scale-95 transition-all"
                >
                  Batal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="text-center space-y-1">
        <p className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">Versi Aplikasi 2.4.0</p>
        <p className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">JIBAS Education System</p>
      </div>
    </div>
  );
}
