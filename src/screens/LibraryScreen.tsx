import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Book, History, Search, BookOpen, Clock, CheckCircle2, AlertCircle, Loader2, Info, RotateCcw, Calendar } from "lucide-react";
import { UserData } from "@/types";
import { cn } from "@/lib/utils";

interface LibraryScreenProps {
  user: UserData;
  onBack: () => void;
}

type LibraryTab = "katalog" | "riwayat";

interface BookItem {
  replid?: number;
  kodepustaka?: string;
  judul: string;
  penulis?: string;
  pengarang?: string;
  penerbit: string;
  tahun?: number;
  thnterbit?: string;
  isbn?: string;
  kategori: string;
  stok?: number;
  tersedia?: number;
  status_buku?: string;
  foto?: string;
  cover?: string;
}

interface BorrowHistory {
  kodepustaka: string;
  judul: string;
  cover?: string;
  tglpinjam: string;
  tgl_harus_kembali: string;
  tgl_dikembalikan: string | null;
  status_pinjam: string;
  keterangan: string;
}

export default function LibraryScreen({ user, onBack }: LibraryScreenProps) {
  const [activeTab, setActiveTab] = useState<LibraryTab>("katalog");
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [history, setHistory] = useState<BorrowHistory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchCatalog = async () => {
    try {
      const catalogRes = await fetch("/api/jbsperpus/katalog-buku");
      const catalogData = await catalogRes.json();
      if (catalogData.status === "sukses" || catalogData.data) {
        setBooks(Array.isArray(catalogData.data) ? catalogData.data : []);
      }
    } catch (error) {
      console.error("Error fetching catalog:", error);
    }
  };

  const fetchHistory = async () => {
    const nis = user.nis || user.nopendaftaran;
    if (!nis) {
      console.warn("NIS not found for user:", user.nama);
      return;
    }

    try {
      const historyRes = await fetch(`/api/jbsperpus/riwayat-pinjam/${nis}`);
      const historyData = await historyRes.json();
      
      console.log("Library History Response:", historyData);

      let finalData: BorrowHistory[] = [];
      
      if (Array.isArray(historyData)) {
        finalData = historyData;
      } else if (historyData && typeof historyData === 'object') {
        const rawData = historyData.data;
        if (Array.isArray(rawData)) {
          finalData = rawData;
        } else if (rawData && typeof rawData === 'object') {
          // Check if it's a single record object or just an empty object
          if (rawData.judul || rawData.kodepustaka) {
            finalData = [rawData];
          }
        } else if (historyData.status === "sukses" && !rawData) {
          finalData = [];
        } else if (!rawData && (historyData.judul || historyData.kodepustaka)) {
          // The root object might be the record
          finalData = [historyData as unknown as BorrowHistory];
        }
      }
      
      setHistory(finalData);
      if (finalData.length === 0 && historyData.status && historyData.status !== "sukses") {
        setErrorMsg(historyData.message || "Gagal mengambil data riwayat");
      }
    } catch (error) {
      console.error("Error fetching borrow history:", error);
      setErrorMsg("Terjadi kesalahan saat menghubungi server");
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await Promise.allSettled([fetchCatalog(), fetchHistory()]);
    } catch (err) {
      console.error("Error in loadAllData:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [user.nis, user.nopendaftaran]);

  const filteredBooks = books.filter(book => {
    const title = book.judul || "";
    const author = book.penulis || book.pengarang || "";
    return title.toLowerCase().includes(searchQuery.toLowerCase()) ||
           author.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr || dateStr === "0000-00-00" || dateStr === "-") return "-";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-6 shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={onBack}
            className="p-2 bg-slate-100 rounded-xl text-slate-600 active:scale-90 transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-slate-900">Perpustakaan</h1>
          <button 
            onClick={loadAllData}
            disabled={loading}
            className="ml-auto p-2 bg-slate-100 rounded-xl text-slate-600 active:scale-90 transition-all disabled:opacity-50"
          >
            <RotateCcw size={18} className={cn(loading && "animate-spin")} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-100 rounded-2xl">
          <button
            onClick={() => setActiveTab("katalog")}
            className={cn(
              "flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2",
              activeTab === "katalog" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
            )}
          >
            <Book size={14} />
            Katalog
          </button>
          <button
            onClick={() => setActiveTab("riwayat")}
            className={cn(
              "flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2",
              activeTab === "riwayat" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
            )}
          >
            <History size={14} />
            Riwayat
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {activeTab === "katalog" && (
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Cari judul buku atau pengarang..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-100 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 size={32} className="text-blue-600 animate-spin" />
            <p className="text-sm font-medium text-slate-400">Memuat data perpustakaan...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === "katalog" ? (
              <motion.div
                key="katalog"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {filteredBooks.length > 0 ? (
                  filteredBooks.map((book, idx) => (
                    <div key={book.replid || book.kodepustaka || idx} className="bg-white p-4 rounded-[32px] border border-slate-100 shadow-sm flex gap-4">
                      <div className="w-24 h-32 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-300 overflow-hidden shrink-0 border border-slate-50">
                        {(book.cover || book.foto) ? (
                          <img src={book.cover || book.foto} alt={book.judul} className="w-full h-full object-cover" />
                        ) : (
                          <BookOpen size={32} />
                        )}
                      </div>
                      <div className="flex flex-col justify-between py-1 flex-1">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 line-clamp-2">{book.judul}</h3>
                          <p className="text-xs text-slate-500 mt-1">{book.penulis || book.pengarang}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full uppercase tracking-wider">
                              {book.kategori}
                            </span>
                            {book.tahun && (
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full uppercase tracking-wider">
                                {book.tahun}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              (book.status_buku?.toLowerCase().includes("tersedia") || (book.tersedia && book.tersedia > 0)) ? "bg-emerald-500" : "bg-red-500"
                            )} />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {book.status_buku || `Tersedia: ${book.tersedia}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState message="Buku tidak ditemukan" onRetry={loadAllData} />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="riwayat"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900">Riwayat Peminjaman</h3>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NIS: {user.nis || user.nopendaftaran}</span>
                </div>

                {errorMsg && (
                  <div className="bg-red-50 p-4 rounded-2xl flex items-center gap-3 text-red-600">
                    <AlertCircle size={18} />
                    <p className="text-xs font-medium">{errorMsg}</p>
                  </div>
                )}

                {!(user.nis || user.nopendaftaran) && (
                  <div className="bg-amber-50 p-4 rounded-2xl flex items-center gap-3 text-amber-600">
                    <AlertCircle size={18} />
                    <p className="text-xs font-medium">Data NIS tidak ditemukan. Silakan login ulang.</p>
                  </div>
                )}
                
                {history.length > 0 ? (
                  history.map((item, index) => (
                    <div key={index} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-16 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center overflow-hidden shrink-0 border border-slate-50">
                            {item.cover ? (
                              <img src={item.cover} alt={item.judul} className="w-full h-full object-cover" />
                            ) : (
                              <BookOpen size={20} />
                            )}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 line-clamp-2">{item.judul}</h3>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Kode: {item.kodepustaka}</p>
                          </div>
                        </div>
                        <span className={cn(
                          "text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                          item.status_pinjam === "Sudah Dikembalikan" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                        )}>
                          {item.status_pinjam}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-slate-400" />
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tgl Pinjam</p>
                            <p className="text-xs font-bold text-slate-700">{formatDate(item.tglpinjam)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-slate-400" />
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tgl Kembali</p>
                            <p className="text-xs font-bold text-slate-700">{formatDate(item.tgl_dikembalikan)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-400" />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Batas Kembali</span>
                        </div>
                        <span className="text-xs font-bold text-slate-700">{formatDate(item.tgl_harus_kembali)}</span>
                      </div>

                      {item.keterangan && (
                        <div className="p-3 bg-blue-50 rounded-2xl flex items-start gap-2">
                          <AlertCircle size={14} className="text-blue-500 mt-0.5" />
                          <p className="text-[11px] text-blue-600 leading-relaxed italic">
                            "{item.keterangan}"
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <EmptyState message="Belum ada riwayat peminjaman" onRetry={loadAllData} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}


        {/* Info Card */}
        <div className="bg-emerald-600 p-6 rounded-[32px] text-white relative overflow-hidden shadow-xl shadow-emerald-500/20">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="relative flex items-start gap-4">
            <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/20">
              <Info size={24} />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold">Informasi Perpustakaan</h4>
              <p className="text-xs text-emerald-100 leading-relaxed">
                Peminjaman buku maksimal 3 hari. Harap kembalikan tepat waktu untuk menghindari denda keterlambatan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-white p-12 rounded-[40px] border border-slate-100 shadow-sm flex flex-col items-center text-center space-y-4">
      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
        <Book size={40} />
      </div>
      <div className="space-y-1">
        <h4 className="text-lg font-bold text-slate-900">{message}</h4>
        <p className="text-sm text-slate-500">Silakan hubungi petugas perpustakaan untuk informasi lebih lanjut.</p>
      </div>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="px-6 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl active:scale-95 transition-all"
        >
          Coba Lagi
        </button>
      )}
    </div>
  );
}
