import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, GraduationCap, Calendar, Star, MessageSquare, User, Loader2, AlertCircle, RotateCcw, TrendingUp, TrendingDown, Plus, X, Save } from "lucide-react";
import { UserData } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface GradesScreenProps {
  user: UserData;
  onBack: () => void;
}

interface CharacterHistory {
  id: number;
  tanggal: string;
  jenis_karakter: string;
  poin: number;
  catatan: string;
  nama_siswa: string;
  nama_guru_pencatat: string;
}

type GradesTab = "karakter" | "akademik";

interface AcademicGrade {
  replid: number;
  idujian: number;
  nis: string;
  nilaiujian: string;
  ket_nilai: string;
  waktu_input: string;
  kode_pelajaran: string;
  mata_pelajaran: string;
}

export default function GradesScreen({ user, onBack }: GradesScreenProps) {
  const [activeTab, setActiveTab] = useState<GradesTab>("karakter");
  const [loading, setLoading] = useState(true);
  const [characterData, setCharacterData] = useState<CharacterHistory[]>([]);
  const [academicData, setAcademicData] = useState<AcademicGrade[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showInputModal, setShowInputModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    nis: "",
    jenis: "Kedisiplinan",
    poin: 0,
    catatan: ""
  });

  const jenisKarakterOptions = [
    'Religius', 'Nasionalis', 'Mandiri', 'Gotong Royong', 'Integritas', 
    'Kedisiplinan', 'Sopan Santun', 'Kejujuran', 'Tanggung Jawab'
  ];

  const fetchCharacterHistory = async () => {
    // For teachers, we might not have a specific NIS to fetch unless they search
    const nis = user.nis || user.nopendaftaran;
    if (!nis && user.level >= 3) {
      setErrorMsg("Data NIS tidak ditemukan. Silakan login ulang.");
      return;
    }

    if (!nis) {
      // If teacher, maybe show empty or all? For now, let's just not error
      setCharacterData([]);
      return;
    }

    try {
      const response = await fetch(`/api/jbskarakter/riwayat/${nis}`);
      const result = await response.json();
      
      if (result.status === "sukses" || result.data) {
        const data = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []);
        setCharacterData(data);
      } else {
        setErrorMsg(result.message || "Gagal mengambil data karakter");
      }
    } catch (error) {
      console.error("Error fetching character history:", error);
      setErrorMsg("Terjadi kesalahan saat menghubungi server");
    }
  };

  const fetchAcademicGrades = async () => {
    const nis = user.nis || user.nopendaftaran;
    if (!nis) return;

    try {
      const response = await fetch(`/api/jbsakad/nilaiujian/${nis}`);
      const result = await response.json();
      
      if (result.success || result.data) {
        setAcademicData(result.data || []);
      } else {
        console.error("Failed to fetch academic grades:", result.message);
      }
    } catch (error) {
      console.error("Error fetching academic grades:", error);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    setErrorMsg(null);
    await Promise.all([
      fetchCharacterHistory(),
      fetchAcademicGrades()
    ]);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nis || !formData.catatan) {
      toast.error("Harap isi semua field");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        nis: formData.nis,
        idguru: user.nip || user.replid?.toString() || "0",
        jenis: formData.jenis,
        poin: Number(formData.poin),
        catatan: formData.catatan
      };
      
      console.log("Submitting character data:", payload);

      const response = await fetch(`/api/jbskarakter/input`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      console.log("Submit result:", result);

      if (result.status === "sukses") {
        toast.success("Data karakter berhasil disimpan");
        setShowInputModal(false);
        setFormData({
          nis: "",
          jenis: "Kedisiplinan",
          poin: 0,
          catatan: ""
        });
        loadAllData();
      } else {
        toast.error(result.message || "Gagal menyimpan data");
        console.error("API Error:", result);
      }
    } catch (error) {
      console.error("Error submitting character data:", error);
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [user.nis, user.nopendaftaran]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateStr;
    }
  };

  const totalPoin = characterData.reduce((acc, curr) => acc + curr.poin, 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-6 sticky top-0 z-30 border-b border-slate-100">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={onBack}
            className="p-2 bg-slate-100 rounded-xl text-slate-600 active:scale-90 transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-slate-900">Nilai & Karakter</h1>
          <div className="ml-auto flex items-center gap-2">
            {(user.level === 1 || user.level === 2) && (
              <button 
                onClick={() => setShowInputModal(true)}
                className="p-2 bg-purple-600 text-white rounded-xl active:scale-90 transition-all shadow-lg shadow-purple-500/20"
              >
                <Plus size={18} />
              </button>
            )}
            <button 
              onClick={loadAllData}
              disabled={loading}
              className="p-2 bg-slate-100 rounded-xl text-slate-600 active:scale-90 transition-all disabled:opacity-50"
            >
              <RotateCcw size={18} className={cn(loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-100 rounded-2xl">
          <button
            onClick={() => setActiveTab("karakter")}
            className={cn(
              "flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2",
              activeTab === "karakter" ? "bg-white text-purple-600 shadow-sm" : "text-slate-500"
            )}
          >
            <Star size={14} />
            Karakter
          </button>
          <button
            onClick={() => setActiveTab("akademik")}
            className={cn(
              "flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2",
              activeTab === "akademik" ? "bg-white text-purple-600 shadow-sm" : "text-slate-500"
            )}
          >
            <GraduationCap size={14} />
            Akademik
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 size={32} className="text-purple-600 animate-spin" />
            <p className="text-sm font-medium text-slate-400">Memuat data nilai...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === "karakter" ? (
              <motion.div
                key="karakter"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Summary Card */}
                <div className="bg-purple-600 p-6 rounded-[32px] text-white relative overflow-hidden shadow-xl shadow-purple-500/20">
                  <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                  <div className="relative flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-purple-100 text-[10px] font-bold uppercase tracking-wider">Total Poin Karakter</p>
                      <h2 className="text-3xl font-bold">{totalPoin}</h2>
                    </div>
                    <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/20">
                      <Star size={24} fill="currentColor" />
                    </div>
                  </div>
                </div>

                {errorMsg && (
                  <div className="bg-red-50 p-4 rounded-2xl flex items-center gap-3 text-red-600">
                    <AlertCircle size={18} />
                    <p className="text-xs font-medium">{errorMsg}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 px-1">Riwayat Karakter</h3>
                  {characterData.length > 0 ? (
                    characterData.map((item) => (
                      <div key={item.id} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center",
                              item.poin > 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                            )}>
                              {item.poin > 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-900">{item.jenis_karakter}</h4>
                              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Poin: {item.poin > 0 ? `+${item.poin}` : item.poin}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tanggal</p>
                            <p className="text-[10px] font-bold text-slate-700">{formatDate(item.tanggal)}</p>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-2xl space-y-2">
                          <div className="flex items-start gap-2">
                            <MessageSquare size={14} className="text-slate-400 mt-0.5" />
                            <p className="text-xs text-slate-600 leading-relaxed italic">
                              "{item.catatan}"
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                          <User size={12} className="text-slate-400" />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Dicatat oleh: <span className="text-slate-600">{item.nama_guru_pencatat}</span>
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-white p-12 rounded-[40px] border border-slate-100 shadow-sm flex flex-col items-center text-center space-y-4">
                      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                        <Star size={40} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-lg font-bold text-slate-900">Belum ada riwayat</h4>
                        <p className="text-sm text-slate-500">Data karakter Anda akan muncul di sini jika sudah dicatat oleh guru.</p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="akademik"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {academicData.length > 0 ? (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 px-1">Riwayat Nilai Ujian</h3>
                    {academicData.map((item) => (
                      <div key={item.replid} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                              <GraduationCap size={20} />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-900">{item.mata_pelajaran}</h4>
                              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{item.kode_pelajaran}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-purple-600">{item.nilaiujian}</p>
                            <span className={cn(
                              "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                              parseFloat(item.nilaiujian) >= 75 ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600"
                            )}>
                              {item.ket_nilai}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                          <Calendar size={12} className="text-slate-400" />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Input pada: <span className="text-slate-600">{formatDate(item.waktu_input)}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white p-12 rounded-[40px] border border-slate-100 shadow-sm flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                      <GraduationCap size={40} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-lg font-bold text-slate-900">Nilai Akademik</h4>
                      <p className="text-sm text-slate-500">Belum ada data nilai akademik untuk saat ini.</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Input Modal */}
      <AnimatePresence>
        {showInputModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSubmitting && setShowInputModal(false)}
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
                <h2 className="text-xl font-bold text-slate-900">Input Karakter Siswa</h2>
                <button
                  onClick={() => setShowInputModal(false)}
                  disabled={isSubmitting}
                  className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">NIS Siswa</label>
                    <input
                      type="text"
                      required
                      value={formData.nis}
                      onChange={(e) => setFormData({ ...formData, nis: e.target.value })}
                      placeholder="Masukkan NIS..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Jenis Karakter</label>
                    <div className="relative">
                      <select
                        value={formData.jenis}
                        onChange={(e) => setFormData({ ...formData, jenis: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all appearance-none"
                      >
                        {jenisKarakterOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronLeft size={16} className="-rotate-90" />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Poin</label>
                    <input
                      type="number"
                      required
                      value={formData.poin}
                      onChange={(e) => setFormData({ ...formData, poin: parseInt(e.target.value) || 0 })}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Catatan</label>
                    <textarea
                      required
                      value={formData.catatan}
                      onChange={(e) => setFormData({ ...formData, catatan: e.target.value })}
                      placeholder="Tulis catatan perkembangan karakter..."
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all resize-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-purple-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-purple-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>
                      <Save size={20} />
                      Simpan Data
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
