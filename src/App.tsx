import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { School } from "lucide-react";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import PickupStatus from "./screens/PickupStatus";
import InfoScreen from "./screens/InfoScreen";
import ProfileScreen from "./screens/ProfileScreen";
import FinanceScreen from "./screens/FinanceScreen";
import PresenceScreen from "./screens/PresenceScreen";
import LibraryScreen from "./screens/LibraryScreen";
import GradesScreen from "./screens/GradesScreen";
import ChatScreen from "./screens/ChatScreen";
import ChatListScreen from "./screens/ChatListScreen";
import ClassroomScreen from "./screens/ClassroomScreen";
import BottomDock, { TabId } from "./components/BottomDock";
import { UserData, ChatGroup, SystemSettings } from "./types";
import { cn } from "./lib/utils";
import { auth, signInAnonymously, db, doc, setDoc, getDoc, serverTimestamp, signOut, handleFirestoreError, OperationType } from "./firebase";
import { Toaster, toast } from "sonner";

export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [subScreen, setSubScreen] = useState<string | null>(null);
  const [subScreenParams, setSubScreenParams] = useState<any>(null);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    // Fetch system settings for Google Workspace domain validation
    const fetchSettings = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, "settings", "global"));
        if (settingsDoc.exists()) {
          setSystemSettings(settingsDoc.data() as SystemSettings);
        }
      } catch (err) {
        console.error("Failed to fetch system settings:", err);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    // Check local storage for existing session
    const storedUser = localStorage.getItem("jibas_user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse stored user:", e);
        localStorage.removeItem("jibas_user");
      }
    }

    // Simulate splash screen
    const timer = setTimeout(() => {
      setIsSplashVisible(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Sync with Firebase Auth and save user profile
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (user && !firebaseUser) {
        console.log("No firebase user, signing in anonymously...");
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error("Anonymous sign-in failed:", err);
        }
      } else if (user && firebaseUser) {
        console.log("Syncing user profile to Firestore:", firebaseUser.uid);
        
        // Update local user state with Firebase UID if missing
        if (user.uid !== firebaseUser.uid) {
          const updatedUser = { ...user, uid: firebaseUser.uid };
          setUser(updatedUser);
          localStorage.setItem("jibas_user", JSON.stringify(updatedUser));
        }

        try {
          const userDataToSave: any = {
            level: Number(user.level),
            is_finance: Number(user.is_finance) || 0,
            nama: user.nama,
            updatedAt: serverTimestamp()
          };

          if (user.nis) userDataToSave.nis = user.nis;
          if (user.nip) userDataToSave.nip = user.nip;
          if (user.nopendaftaran) userDataToSave.nopendaftaran = user.nopendaftaran;
          if (user.idkelas) userDataToSave.idkelas = Number(user.idkelas);
          if (user.nama_kelas) userDataToSave.nama_kelas = user.nama_kelas;
          if (user.whatsapp_api_key) userDataToSave.whatsapp_api_key = user.whatsapp_api_key;

          await setDoc(doc(db, 'users', firebaseUser.uid), userDataToSave, { merge: true });
          console.log("User profile synced successfully");
        } catch (err) {
          console.error("Failed to sync user profile:", err);
          handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
        }
      }
    });

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      // Allow messages from the same origin, Cloud Run, Vercel, nganjuk.net, or localhost
      const isAllowedOrigin = 
        origin === window.location.origin || 
        origin.endsWith('.run.app') || 
        origin.endsWith('.vercel.app') || 
        origin.endsWith('.nganjuk.net') || 
        origin.includes('localhost');

      if (!isAllowedOrigin) {
        return;
      }
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        const { tokens, email } = event.data;
        
        // Security Check
        if (user) {
          const userEmail = email.toLowerCase();
          const workspaceDomain = systemSettings?.googleWorkspaceDomain?.toLowerCase();
          
          if (Number(user.level) === 2 || Number(user.level) === 3) {
            // Guru (2) & Siswa (3): Must use school domains
            if (workspaceDomain) {
              const isAllowedDomain = userEmail.endsWith(`@${workspaceDomain}`);
              if (!isAllowedDomain) {
                toast.error(`Gagal: Guru & Siswa wajib menggunakan akun Workspace resmi (@${workspaceDomain})`);
                return;
              }
            }
          } else if (Number(user.level) === 4) {
            // Calon Siswa (4): Must match email in JIBAS
            if (user.email && email.toLowerCase() !== user.email.toLowerCase()) {
              toast.error(`Gagal: Akun Google tidak sesuai dengan yang terdaftar di JIBAS (${user.email})`);
              return;
            }
          }
        }

        localStorage.setItem('google_tokens', JSON.stringify(tokens));
        localStorage.setItem('google_email', email);
        toast.success("Berhasil terhubung dengan Google Workspace");
        // Refresh classroom if currently on that screen
        if (subScreen === "classroom") {
          setSubScreenParams({ ...subScreenParams, refresh: Date.now() });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      unsubscribe();
      window.removeEventListener('message', handleMessage);
    };
  }, [user, subScreen, subScreenParams]);

  const handleLoginSuccess = (userData: UserData) => {
    setUser(userData);
    localStorage.setItem("jibas_user", JSON.stringify(userData));
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      localStorage.removeItem("jibas_user");
      setActiveTab("home");
      setSubScreen(null);
      toast.success("Berhasil keluar dari sesi");
    } catch (err) {
      console.error("Logout failed:", err);
      toast.error("Gagal keluar dari sesi");
    }
  };

  useEffect(() => {
    console.log("App state - subScreen:", subScreen, "activeTab:", activeTab);
  }, [subScreen, activeTab]);

  const renderScreen = () => {
    if (!user) return null;

    let content;
    if (subScreen === "finance") {
      content = <FinanceScreen user={user} onBack={() => { setSubScreen(null); setSubScreenParams(null); }} />;
    } else if (subScreen === "presence") {
      content = <PresenceScreen 
        user={user} 
        onBack={() => { setSubScreen(null); setSubScreenParams(null); }} 
        initialTab={subScreenParams?.initialTab} 
      />;
    } else if (subScreen === "library") {
      content = <LibraryScreen user={user} onBack={() => { setSubScreen(null); setSubScreenParams(null); }} />;
    } else if (subScreen === "grades") {
      content = <GradesScreen user={user} onBack={() => { setSubScreen(null); setSubScreenParams(null); }} />;
    } else if (subScreen === "chat") {
      if (subScreenParams?.group) {
        content = <ChatScreen user={user} group={subScreenParams.group} onBack={() => { setSubScreen("chat"); setSubScreenParams(null); }} />;
      } else {
        content = <ChatListScreen user={user} onBack={() => { setSubScreen(null); setSubScreenParams(null); }} onChatClick={(group) => { setSubScreen("chat"); setSubScreenParams({ group }); }} />;
      }
    } else if (subScreen === "classroom") {
      content = <ClassroomScreen user={user} onBack={() => { setSubScreen(null); setSubScreenParams(null); }} refresh={subScreenParams?.refresh} />;
    } else {
      switch (activeTab) {
        case "home":
          content = <HomeScreen user={user} onFeatureClick={(id, params) => { setSubScreen(id); setSubScreenParams(params); }} />;
          break;
        case "pickup":
          content = <PickupStatus user={user} />;
          break;
        case "info":
          content = <InfoScreen user={user} />;
          break;
        case "profile":
          content = <ProfileScreen user={user} onLogout={handleLogout} />;
          break;
        default:
          content = <HomeScreen user={user} onFeatureClick={(id, params) => { setSubScreen(id); setSubScreenParams(params); }} />;
      }
    }

    return content;
  };

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSubScreen(null); // Clear subscreen when changing main tabs
    setSubScreenParams(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-600">
      <Toaster position="top-center" richColors />
      <AnimatePresence mode="wait">
        {isSplashVisible ? (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-blue-600 flex flex-col items-center justify-center text-white"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-24 h-24 bg-white/20 rounded-[32px] flex items-center justify-center backdrop-blur-md mb-6"
            >
              <School size={48} className="text-white" />
            </motion.div>
            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-3xl font-bold tracking-tight"
            >
              JIBAS Mobile
            </motion.h1>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-blue-100 text-sm mt-2 font-medium uppercase tracking-widest"
            >
              Education System
            </motion.p>
          </motion.div>
        ) : !user ? (
          <motion.div
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <LoginScreen onLoginSuccess={handleLoginSuccess} />
          </motion.div>
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative min-h-screen"
          >
            {/* Main Content Area */}
            <main className="max-w-md mx-auto bg-white shadow-2xl shadow-slate-200/50 min-h-screen relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={subScreen ? `sub-${subScreen}-${subScreenParams?.group?.idkelas || subScreenParams?.group?.nama_grup_chat || 'none'}` : activeTab}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="w-full"
                >
                  {renderScreen()}
                </motion.div>
              </AnimatePresence>
            </main>

            {/* Bottom Navigation */}
            {!subScreen && <BottomDock activeTab={activeTab} onTabChange={handleTabChange} user={user} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
