import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, MessageSquare, Loader2, Search, Send, Users, RefreshCw, AlertCircle } from "lucide-react";
import { UserData, ChatGroup } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatListScreenProps {
  user: UserData;
  onBack: () => void;
  onChatClick: (group: ChatGroup) => void;
}

export default function ChatListScreen({ user, onBack, onChatClick }: ChatListScreenProps) {
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchChatGroups();
  }, []);

  const fetchChatGroups = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/jbsvcr/chat-groups");
      const json = await response.json();
      if ((json.status === "sukses" || json.success) && Array.isArray(json.data)) {
        setChatGroups(json.data);
      } else if (Array.isArray(json)) {
        setChatGroups(json);
      }
    } catch (error) {
      console.error("Error fetching chat groups:", error);
      toast.error("Gagal memuat daftar chat");
    } finally {
      setLoading(false);
    }
  };

  const filteredChatGroups = chatGroups.filter(group => {
    // Apply the same filtering logic as HomeScreen
    if (Number(user.level) === 1) return true; // Landlord (JIBAS) sees all
    
    const groupName = (group.nama_grup_chat || group.nama_grup || group.nama || "").toLowerCase();
    
    // Always allow "Umum" chat
    if (groupName === "umum") return true;

    const userClass = (user.nama_kelas || "").toLowerCase();
    
    let isAuthorized = false;
    if (Number(user.level) === 3) {
      isAuthorized = userClass && (groupName.includes(userClass) || userClass.includes(groupName));
    } else if (Number(user.level) === 2) {
      const isClassMatch = userClass && (groupName.includes(userClass) || userClass.includes(groupName));
      const isNameMatch = group.wali_kelas && group.wali_kelas.toLowerCase() === user.nama.toLowerCase();
      const isNipMatch = user.nip && group.wali_kelas_nip === user.nip;
      isAuthorized = isClassMatch || isNameMatch || isNipMatch;
    }

    if (!isAuthorized) return false;

    // Apply search filter
    if (!searchQuery.trim()) return true;
    return groupName.includes(searchQuery.toLowerCase());
  });

  // Ensure "Umum" is always at the top if it exists, or add it if it doesn't
  const finalGroups = [...filteredChatGroups];
  const hasUmum = finalGroups.some(g => (g.nama_grup_chat || g.nama_grup || g.nama || "").toLowerCase() === "umum");
  
  if (!hasUmum && !searchQuery.trim()) {
    finalGroups.unshift({
      id: "Umum",
      idgroup: "Umum",
      nama_grup_chat: "Umum",
      display_nama: "Global Chat (Umum)",
      pesan_terakhir: "Ruang obrolan seluruh sekolah",
      total_pesan: 0
    } as any);
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-4 py-4 flex flex-col gap-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ChevronLeft size={24} className="text-slate-600" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 leading-tight">Pesan & Grup</h2>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
              Komunikasi Sekolah
            </p>
          </div>
          <button 
            onClick={fetchChatGroups}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
            disabled={loading}
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text"
            placeholder="Cari grup atau kelas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-100 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={32} className="text-blue-600 animate-spin mb-4" />
            <p className="text-sm text-slate-500 font-medium">Memuat daftar chat...</p>
          </div>
        ) : finalGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
              <MessageSquare size={32} />
            </div>
            <h3 className="text-slate-900 font-bold">Tidak ada grup ditemukan</h3>
            <p className="text-xs text-slate-500 mt-1">
              {searchQuery ? "Coba kata kunci pencarian lain" : "Anda belum terdaftar di grup manapun"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {finalGroups.map((group) => (
              <motion.button
                key={group.idkelas || group.idgroup || group.id}
                onClick={() => onChatClick(group)}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-blue-200 hover:shadow-md transition-all group"
              >
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 font-bold group-hover:bg-blue-600 group-hover:text-white transition-all">
                  {(group.display_nama || group.nama_grup_chat || group.nama_grup || group.nama || "").substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 truncate pr-2">
                      {group.display_nama || group.nama_grup_chat || group.nama_grup || group.nama}
                    </h4>
                    {(group.total_pesan || 0) > 0 && (
                      <span className="bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                        {group.total_pesan}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                    {group.pesan_terakhir || "Belum ada pesan"}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                      {group.wali_kelas ? `Wali: ${group.wali_kelas}` : "Grup Sekolah"}
                    </span>
                  </div>
                </div>
                <div className="p-2 text-slate-300 group-hover:text-blue-600 transition-colors">
                  <ChevronLeft size={20} className="rotate-180" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
