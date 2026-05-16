import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Send, User, Loader2, CheckCheck, MoreVertical, Phone, Info, Image as ImageIcon, Trash2, X, Smile, Mic, Square, Play as PlayIcon, Pause, Video, Users, Search, RefreshCw } from "lucide-react";
import { UserData, ChatMessage, ChatGroup } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { io, Socket } from "socket.io-client";
import { db, doc, setDoc, onSnapshot, collection, query, where, serverTimestamp, deleteDoc, Timestamp, handleFirestoreError, OperationType } from "@/firebase";

interface ChatScreenProps {
  user: UserData;
  group: ChatGroup;
  onBack: () => void;
}

export default function ChatScreen({ user, group, onBack }: ChatScreenProps) {
  console.log("ChatScreen rendering for group:", group?.nama_grup_chat || "unknown");
  if (!group) {
    return (
      <div className="flex flex-col h-full bg-slate-50 items-center justify-center p-6 text-center">
        <p className="text-slate-500 mb-4">Grup tidak ditemukan</p>
        <button onClick={onBack} className="text-blue-600 font-bold">Kembali</button>
      </div>
    );
  }

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showOnlineUsers, setShowOnlineUsers] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [participantSearch, setParticipantSearch] = useState("");
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  const socketRef = useRef<Socket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (showParticipants && participants.length === 0 && group.idkelas) {
      fetchParticipants();
    }
  }, [showParticipants, group.idkelas]);

  const fetchParticipants = async () => {
    if (!group.idkelas) return;
    setLoadingParticipants(true);
    try {
      // Try to fetch students from JIBAS
      const response = await fetch(`/api/jbsakad/siswa/kelas/${group.idkelas}`);
      const result = await response.json();
      if (result.success || result.status === "sukses") {
        setParticipants(result.data || []);
      } else {
        // Fallback or empty
        setParticipants([]);
      }
    } catch (error) {
      console.error("Error fetching participants:", error);
      setParticipants([]);
    } finally {
      setLoadingParticipants(false);
    }
  };

  const groupId = group?.idgroup || group?.nama_grup_chat || String(group?.idkelas || "") || "6A";

  useEffect(() => {
    console.log("ChatScreen mounted for group:", groupId);
    fetchMessages();
    
    // Initialize Socket.io
    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to socket server");
      socket.emit("join_room", { room: groupId, user });
    });

    socket.on("online_users", (users: string[]) => {
      console.log("Online users updated:", users);
      setOnlineUsers(users);
    });

    socket.on("receive_message", (message: ChatMessage) => {
      console.log("Received message via socket:", message);
      setMessages(prev => {
        // Avoid duplicates
        if (prev.some(m => m.replid === message.replid)) return prev;
        return [...prev, message];
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [groupId]);

  // Firestore Presence Logic (for Serverless/Vercel compatibility)
  useEffect(() => {
    if (!user?.uid || !groupId) return;

    const presenceDocRef = doc(db, "presence", user.uid);
    
    // 1. Set initial presence
    const updatePresence = async () => {
      try {
        await setDoc(presenceDocRef, {
          uid: user.uid,
          nama: user.nama,
          room: groupId,
          lastSeen: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error("Error updating presence:", err);
        handleFirestoreError(err, OperationType.WRITE, `presence/${user.uid}`);
      }
    };

    updatePresence();

    // 2. Heartbeat every 30 seconds
    const heartbeatInterval = setInterval(updatePresence, 30000);

    // 3. Listen for other users in the same room
    const q = query(collection(db, "presence"), where("room", "==", groupId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const activeUsers: string[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const lastSeen = data.lastSeen as Timestamp;
        
        if (lastSeen) {
          const lastSeenMs = lastSeen.toMillis();
          // Consider user online if seen in the last 2 minutes
          if (now - lastSeenMs < 120000) {
            activeUsers.push(data.nama || "Unknown");
          }
        }
      });
      
      // Merge with socket-based online users if any, and remove duplicates
      setOnlineUsers(prev => {
        const combined = Array.from(new Set([...activeUsers]));
        return combined;
      });
    }, (err) => {
      console.error("Presence snapshot error:", err);
      handleFirestoreError(err, OperationType.GET, "presence");
    });

    // 4. Cleanup on unmount
    return () => {
      clearInterval(heartbeatInterval);
      unsubscribe();
      // Try to delete presence doc or set room to null
      deleteDoc(presenceDocRef).catch(e => console.error("Error removing presence:", e));
    };
  }, [user?.uid, groupId, user?.nama]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle Visual Viewport for smooth keyboard interaction
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const handleViewportChange = () => {
      if (window.visualViewport) {
        const heightDiff = window.innerHeight - window.visualViewport.height;
        setKeyboardHeight(heightDiff > 0 ? heightDiff : 0);
        
        // Scroll to bottom when keyboard opens
        if (heightDiff > 0) {
          setTimeout(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }, 100);
        }
      }
    };

    window.visualViewport.addEventListener("resize", handleViewportChange);
    window.visualViewport.addEventListener("scroll", handleViewportChange);
    
    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, []);

  const fetchMessages = async () => {
    if (!groupId || groupId === "undefined") return;
    try {
      const response = await fetch(`/api/jbsvcr/chat/${groupId}`);
      const json = await response.json();
      if (json.status === "sukses" || json.success) {
        setMessages(json.data || []);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, voiceData?: string) => {
    if (e) e.preventDefault();
    if ((!newMessage.trim() && !selectedImage && !voiceData) || isSending) return;

    setIsSending(true);
    const messagePayload = {
      chatgroup: groupId,
      id_pengirim: user.nip || user.nis || user.nama,
      nama_pengirim: user.nama,
      pesan: voiceData ? "[Pesan Suara]" : newMessage.trim(),
      gambar: selectedImage,
      suara: voiceData,
      waktu_kirim_asli: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).replace(" ", "T")
    };

    try {
      // Emit via socket for real-time update
      if (socketRef.current) {
        socketRef.current.emit("send_message", messagePayload);
      }

      const response = await fetch(`/api/vcr-send/${groupId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messagePayload),
      });

      const result = await response.json();
      // Even if API response is not "sukses", we trust the VCR proxy and socket broadcast
      setNewMessage("");
      setSelectedImage(null);
      setAudioBlob(null);
    } catch (error) {
      console.error("Error sending message:", error);
      // Still clear inputs on error to allow user to continue, as socket likely broadcasted it
      setNewMessage("");
      setSelectedImage(null);
      setAudioBlob(null);
    } finally {
      setIsSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        
        // Convert to base64 and send
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          handleSendMessage(undefined, base64Audio);
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      toast.error("Gagal mengakses mikrofon");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      
      // Stop all tracks in the stream
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setNewMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const playAudio = (suara: string, id: number) => {
    if (playingAudioId === id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(suara);
    audioRef.current = audio;
    setPlayingAudioId(id);
    
    audio.onended = () => {
      setPlayingAudioId(null);
    };
    
    audio.play();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getMeetNickname = () => {
    const baseName = group?.nama_grup_chat || groupId || "General";
    const cleanName = baseName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return `hidis-${cleanName}`;
  };

  const handleJoinMeet = () => {
    const nickname = getMeetNickname();
    window.open(`https://meet.google.com/lookup/${nickname}`, "_blank");
  };

  const handleDeleteMessage = async (replid: number) => {
    if (!window.confirm("Hapus pesan ini?")) return;

    try {
      const response = await fetch(`/api/jbsvcr/chat/${replid}`, {
        method: "DELETE"
      });
      const result = await response.json();
      if (result.status === "sukses" || result.success) {
        toast.success("Pesan dihapus");
        fetchMessages();
      } else {
        toast.error("Gagal menghapus pesan");
      }
    } catch (error) {
      console.error("Error deleting message:", error);
      toast.error("Terjadi kesalahan saat menghapus pesan");
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran gambar terlalu besar (maks 2MB)");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const formatTime = (ts: string) => {
    if (!ts) return "";
    try {
      let date: Date;
      
      // Force Jakarta time interpretation (+07:00)
      // Many backends in this context use 'Z' or no offset to mean Jakarta time
      if (ts.includes('Z')) {
        date = new Date(ts.replace('Z', '+07:00'));
      } else if (ts.includes('+')) {
        date = new Date(ts);
      } else {
        // Simple string "2026-04-03 11:29:14" or "2026-04-03T11:29:14"
        date = new Date(ts.replace(' ', 'T') + "+07:00");
      }

      if (isNaN(date.getTime())) return "";
      
      return date.toLocaleTimeString("id-ID", { 
        hour: "2-digit", 
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
        hour12: false
      });
    } catch (e) {
      return "";
    }
  };

  return (
    <div 
      style={{ paddingBottom: keyboardHeight }}
      className="flex flex-col h-full w-full bg-slate-50 overflow-hidden relative border-x border-slate-200 overscroll-none"
    >
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 shrink-0 z-30 shadow-sm">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        
        <div className="flex-1 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 font-bold">
            {(groupId || "").substring(0, 2)}
          </div>
          <div className="relative">
            <h2 className="text-sm font-bold text-slate-900 leading-tight">{group?.display_nama || group?.nama_grup_chat || "Chat Group"}</h2>
            <button 
              onClick={() => setShowOnlineUsers(!showOnlineUsers)}
              className="flex items-center gap-1.5 hover:bg-slate-50 px-1 rounded transition-colors"
            >
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                {onlineUsers.length} Online
              </p>
            </button>

            <AnimatePresence>
              {showOnlineUsers && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-50"
                >
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1 border-b border-slate-50 mb-1">
                    User Online
                  </h3>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {onlineUsers.map((name, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg transition-colors">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                        <span className="text-xs font-medium text-slate-700 truncate">{name}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={() => setShowParticipants(true)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
            title="Lihat Anggota Grup"
          >
            <Users size={20} />
          </button>
          <button 
            onClick={handleJoinMeet}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
            title={`Buka Google Meet (Nickname: ${getMeetNickname()})`}
          >
            <Video size={20} />
          </button>
          {group.hp_wali && (
            <a href={`tel:${group.hp_wali}`} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
              <Phone size={20} />
            </a>
          )}
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <MoreVertical size={20} />
          </button>
        </div>
      </header>

      {/* Participants Modal */}
      <AnimatePresence>
        {showParticipants && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowParticipants(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-xs bg-white z-[110] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Anggota Grup</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {group.display_nama || group.nama_grup_chat}
                  </p>
                </div>
                <button 
                  onClick={() => setShowParticipants(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Wali Kelas Section */}
                {group.wali_kelas && (
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Wali Kelas</h3>
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold">
                        {group.wali_kelas.substring(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{group.wali_kelas}</p>
                        <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Guru / Wali Kelas</p>
                      </div>
                      {group.hp_wali && (
                        <a href={`tel:${group.hp_wali}`} className="p-2 bg-white text-blue-600 rounded-lg shadow-sm">
                          <Phone size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Online Users Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Online Sekarang</h3>
                    <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      {onlineUsers.length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {onlineUsers.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic px-2">Tidak ada user online</p>
                    ) : (
                      onlineUsers.map((name, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors">
                          <div className="relative">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs font-bold">
                              {name.substring(0, 1)}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />
                          </div>
                          <span className="text-xs font-medium text-slate-700 truncate">{name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* All Members Section (Class Students) */}
                {group.idkelas && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Daftar Siswa</h3>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={fetchParticipants}
                          disabled={loadingParticipants}
                          className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors"
                          title="Refresh daftar siswa"
                        >
                          <RefreshCw size={12} className={loadingParticipants ? "animate-spin" : ""} />
                        </button>
                        {loadingParticipants ? (
                          <Loader2 size={12} className="animate-spin text-slate-400" />
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                            {participants.length} Siswa
                          </span>
                        )}
                      </div>
                    </div>

                    {participants.length > 5 && (
                      <div className="px-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                          <input 
                            type="text"
                            placeholder="Cari siswa..."
                            value={participantSearch}
                            onChange={(e) => setParticipantSearch(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 pl-8 pr-3 text-[10px] focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all"
                          />
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-1">
                      {loadingParticipants ? (
                        <div className="py-4 flex justify-center">
                          <Loader2 size={20} className="animate-spin text-blue-600 opacity-20" />
                        </div>
                      ) : participants.length === 0 ? (
                        <div className="p-4 text-center border border-dashed border-slate-200 rounded-2xl">
                          <p className="text-[10px] text-slate-400">Data siswa tidak tersedia</p>
                        </div>
                      ) : (
                        participants
                          .filter(s => s.nama?.toLowerCase().includes(participantSearch.toLowerCase()) || s.nis?.includes(participantSearch))
                          .map((student, i) => (
                          <div key={i} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs font-bold">
                              {student.nama?.substring(0, 1) || "S"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-700 truncate">{student.nama}</p>
                              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{student.nis}</p>
                            </div>
                            {onlineUsers.includes(student.nama) && (
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50">
                <button 
                  onClick={handleJoinMeet}
                  className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 text-xs uppercase tracking-widest active:scale-95 transition-all"
                >
                  <Video size={16} />
                  Mulai Video Call
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 pb-6 space-y-4 scroll-smooth relative overscroll-contain"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <Loader2 className="animate-spin" size={24} />
            <p className="text-xs font-medium">Memuat percakapan...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 opacity-50">
            <Info size={24} />
            <p className="text-xs font-medium">Belum ada pesan di grup ini</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const myId = user.nip || user.nis || user.nama;
            const isMe = String(msg.id_pengirim) === String(myId);
            const showSender = idx === 0 || messages[idx - 1].id_pengirim !== msg.id_pengirim;

            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.replid || idx}
                className={cn(
                  "flex flex-col max-w-[85%]",
                  isMe ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                {showSender && (
                  <span className={cn(
                    "text-[10px] mb-1 ml-1 uppercase tracking-wider",
                    isMe ? "text-blue-400 font-bold mr-1" : "text-black font-bold"
                  )}>
                    {isMe ? user.nama : (msg.nama_pengirim || msg.id_pengirim)}
                  </span>
                )}
                
                <div className={cn(
                  "px-4 py-2.5 rounded-3xl text-sm shadow-sm relative group/msg",
                  isMe 
                    ? "bg-blue-600 text-white rounded-tr-none" 
                    : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"
                )}>
                  {msg.gambar && (
                    <div className="mb-2 rounded-2xl overflow-hidden bg-slate-100 max-w-full">
                      <img 
                        src={msg.gambar} 
                        alt="Shared" 
                        className="w-full h-auto max-h-60 object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}
                  {msg.suara && (
                    <div className="mb-2 flex items-center gap-3 bg-black/5 p-2 rounded-2xl">
                      <button 
                        onClick={() => playAudio(msg.suara!, msg.replid)}
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                          isMe ? "bg-white text-blue-600" : "bg-blue-600 text-white"
                        )}
                      >
                        {playingAudioId === msg.replid ? <Pause size={14} /> : <PlayIcon size={14} className="ml-0.5" />}
                      </button>
                      <div className="flex-1 h-1 bg-current/20 rounded-full relative">
                        <div className="absolute inset-0 bg-current/40 rounded-full w-1/3" />
                      </div>
                      <span className="text-[10px] font-mono opacity-60">Voice</span>
                    </div>
                  )}
                  <p className="leading-relaxed">{msg.pesan}</p>
                  <div className={cn(
                    "flex items-center gap-1 mt-1 text-[9px]",
                    isMe ? "text-blue-100 justify-end" : "text-slate-400 justify-start"
                  )}>
                    <CheckCheck size={12} className={isMe ? "text-blue-200" : "text-blue-500"} />
                    {formatTime(msg.waktu_kirim_asli || msg.ts || "")}
                  </div>

                  {isMe && (
                    <button 
                      onClick={() => handleDeleteMessage(msg.replid)}
                      className="absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover/msg:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div 
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        className="p-4 bg-white border-t border-slate-200 shrink-0 z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] touch-manipulation"
      >
          <AnimatePresence>
            {showEmojiPicker && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-4 mb-4 z-50"
              >
                <EmojiPicker onEmojiClick={onEmojiClick} width={300} height={400} />
              </motion.div>
            )}
            
            {selectedImage && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-3 relative inline-block"
              >
                <img 
                  src={selectedImage} 
                  alt="Preview" 
                  className="w-20 h-20 object-cover rounded-2xl border-2 border-blue-100"
                />
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg"
                >
                  <X size={12} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <form 
            onSubmit={(e) => handleSendMessage(e)}
            className="flex items-center gap-2"
          >
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />
            
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={cn(
                  "p-2.5 rounded-full transition-colors",
                  showEmojiPicker ? "text-blue-600 bg-blue-50" : "text-slate-400 hover:bg-slate-100"
                )}
              >
                <Smile size={20} />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
              >
                <ImageIcon size={20} />
              </button>
            </div>

            <div className="flex-1 flex items-center gap-2 bg-slate-50 p-1.5 rounded-[24px] border border-slate-200 focus-within:border-blue-400 transition-all">
              {isRecording ? (
                <div className="flex-1 flex items-center gap-3 px-4 py-2 text-red-500 font-bold text-sm">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span>Recording... {formatDuration(recordingDuration)}</span>
                </div>
              ) : (
                <input
                  type="text"
                  ref={inputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onFocus={() => setShowEmojiPicker(false)}
                  placeholder="Ketik pesan..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-4 py-2"
                  autoFocus
                />
              )}
              
              {newMessage.trim() || selectedImage ? (
                <button
                  type="submit"
                  disabled={isSending}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-blue-600 text-white shadow-lg shadow-blue-200"
                >
                  {isSending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                    isRecording 
                      ? "bg-red-500 text-white animate-pulse" 
                      : "bg-slate-200 text-slate-400 hover:bg-slate-300"
                  )}
                >
                  {isRecording ? <Square size={18} /> : <Mic size={18} />}
                </button>
              )}
            </div>
          </form>
        </div>
    </div>
  );
}
