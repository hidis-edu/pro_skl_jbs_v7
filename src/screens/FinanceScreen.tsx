import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CreditCard, Wallet, Receipt, ChevronLeft, Loader2, AlertCircle, CheckCircle2, ArrowRight, X, ShieldCheck, Camera, Upload } from "lucide-react";
import axios from "axios";
import { UserData, FinanceInfo, BillItem } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { db, auth, collection, addDoc, serverTimestamp, signInAnonymously, query, where, orderBy, onSnapshot, handleFirestoreError, OperationType } from "@/firebase";
import { PaymentRequest } from "@/types";

interface FinanceScreenProps {
  user: UserData;
  onBack: () => void;
}

export default function FinanceScreen({ user, onBack }: FinanceScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [financeInfo, setFinanceInfo] = useState<FinanceInfo | null>(null);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [selectedBill, setSelectedBill] = useState<BillItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [proofPhoto, setProofPhoto] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const isPayingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSiswa = Number(user.level) === 3;
  const isCalon = Number(user.level) === 4;
  const identifier = user.nis || user.nip || user.nopendaftaran || "";

  useEffect(() => {
    isPayingRef.current = isPaying;
  }, [isPaying]);

  useEffect(() => {
    if (!auth.currentUser) {
      signInAnonymously(auth).catch(err => console.error("Proactive sign-in failed:", err));
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!identifier) {
        setError("Identitas tidak ditemukan.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const baseUrl = "/api/jbsfina";
        const infoUrl = isSiswa ? `${baseUrl}/${user.nis}` : `${baseUrl}/${user.nopendaftaran}`;
        const billsUrl = isSiswa ? `${baseUrl}/tagihan/${user.nis}` : `${baseUrl}/tagihan-calon/${user.nopendaftaran}`;

        // Fetch both info and bills
        const [infoRes, billsRes] = await Promise.all([
          axios.get(infoUrl).catch(() => ({ data: { data: { saldo: 0, tabungan: 0 } } })),
          axios.get(billsUrl).catch(() => ({ data: { data: [] } }))
        ]);

        setFinanceInfo(infoRes.data.data || { saldo: 0, tabungan: 0 });
        
        const rawBills = billsRes.data.data || [];
        const mappedBills: BillItem[] = rawBills.map((b: any) => {
          const sisa = parseFloat(b.sisa_sebenarnya || b.sisa || 0);
          let cicilan = parseFloat(b.rencana_cicilan || 0);
          
          // Set default installment for prospective students if it's 0 or not set
          if (isCalon && cicilan === 0 && sisa > 0) {
            cicilan = Math.min(500000, sisa);
          }

          return {
            id: b.id_tagihan?.toString() || b.id?.toString() || Math.random().toString(),
            nama: b.nama_tagihan || b.nama || "Tagihan",
            nominal: parseFloat(b.total_kewajiban || b.nominal || 0),
            terbayar: parseFloat(b.sudah_dibayar || b.terbayar || 0),
            sisa: sisa,
            rencana_cicilan: cicilan,
            jatuh_tempo: b.jatuh_tempo || "-",
            kategori: b.kategori || "Tagihan"
          };
        });
        
        setBills(mappedBills);
      } catch (err: any) {
        // Fallback for demo if API fails
        console.error("API Error:", err);
        setFinanceInfo({ saldo: 250000, tabungan: 1200000, total_tagihan: 850000 });
        setBills([
          { id: "1", nama: "SPP Maret 2026", nominal: 500000, terbayar: 0, sisa: 500000, rencana_cicilan: 250000, jatuh_tempo: "2026-03-10", kategori: "Wajib" },
          { id: "2", nama: "Uang Kegiatan", nominal: 350000, terbayar: 100000, sisa: 250000, rencana_cicilan: 100000, jatuh_tempo: "2026-03-25", kategori: "Lainnya" },
          { id: "3", nama: "Buku Paket", nominal: 100000, terbayar: 100000, sisa: 0, rencana_cicilan: 0, jatuh_tempo: "2026-02-15", kategori: "Wajib" },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [identifier, isSiswa, user.nis, user.nopendaftaran]);

  useEffect(() => {
    if (!identifier) return;

    const q = query(
      collection(db, "payments"),
      where("studentNis", "==", identifier),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PaymentRequest[];
      setPaymentHistory(history);
      setLoadingHistory(false);
    }, (err) => {
      console.error("History fetch error:", err);
      handleFirestoreError(err, OperationType.GET, "payments");
      setLoadingHistory(false);
    });

    return () => unsubscribe();
  }, [identifier]);

  const handlePayNow = (bill: BillItem) => {
    setSelectedBill(bill);
    setPaymentAmount(bill.rencana_cicilan || bill.sisa);
    setProofPhoto(null);
  };

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 600; // Reduced for faster upload
          const MAX_HEIGHT = 600;
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
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5); // Lower quality for smaller size
          resolve(compressedBase64);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = (err) => reject(err);
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        if (file.size > 200000) {
          try {
            const compressed = await compressImage(base64);
            setProofPhoto(compressed);
          } catch (err) {
            setProofPhoto(base64);
          }
        } else {
          setProofPhoto(base64);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const confirmPayment = async () => {
    if (!selectedBill) return;
    
    if (paymentAmount <= 0) {
      toast.error("Nominal pembayaran harus lebih dari 0");
      return;
    }

    if (paymentAmount > selectedBill.sisa) {
      toast.error("Nominal pembayaran melebihi sisa tagihan");
      return;
    }

    if (!proofPhoto) {
      toast.error("Harap unggah bukti pembayaran");
      return;
    }

    let completed = false;
    setIsPaying(true);
    const loadingToast = toast.loading("Mengirim konfirmasi pembayaran...");
    console.log("FinanceScreen: Starting payment confirmation for bill:", selectedBill.id);
    
    // Safety timeout to prevent infinite spinner
    const timeoutId = setTimeout(() => {
      if (!completed && isPayingRef.current) {
        setIsPaying(false);
        toast.dismiss(loadingToast);
        toast.error("Waktu habis", {
          description: "Proses pengiriman terlalu lama, namun data mungkin sudah terkirim. Silakan cek riwayat pembayaran Anda."
        });
      }
    }, 45000); // 45 seconds timeout

    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        console.log("FinanceScreen: No user found, signing in anonymously...");
        try {
          const result = await signInAnonymously(auth);
          currentUser = result.user;
        } catch (err: any) {
          console.error("FinanceScreen: Anonymous sign-in failed:", err);
          toast.dismiss(loadingToast);
          toast.error("Sesi tidak valid", {
            description: "Gagal menghubungkan ke server keamanan. Silakan coba lagi."
          });
          clearTimeout(timeoutId);
          setIsPaying(false);
          return;
        }
      }

      if (!identifier) {
        toast.dismiss(loadingToast);
        toast.error("Identitas tidak ditemukan");
        clearTimeout(timeoutId);
        setIsPaying(false);
        return;
      }

      const paymentRequest = {
        billId: selectedBill.id,
        billName: selectedBill.nama,
        studentNis: identifier,
        studentName: user.nama,
        amount: paymentAmount,
        proofPhoto: proofPhoto,
        status: "waiting",
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      };

      console.log("FinanceScreen: Saving payment request to Firestore...");
      await addDoc(collection(db, "payments"), paymentRequest);
      completed = true;
      console.log("FinanceScreen: Payment request saved successfully.");
      
      clearTimeout(timeoutId);
      toast.dismiss(loadingToast);

      // Capture values for background notification before clearing state
      const billName = selectedBill.nama;
      const amount = paymentAmount;

      // Close modal and show success immediately to avoid "stuck" feeling
      setSelectedBill(null);
      setIsPaying(false);
      
      toast.success("Konfirmasi Terkirim", {
        description: "Pembayaran Anda sedang menunggu verifikasi oleh bagian keuangan."
      });

      // Notify Admin via WhatsApp in background (don't await)
      console.log("FinanceScreen: Sending background admin notification...");
      axios.post("/api/notify-admin-payment", {
        studentName: user.nama,
        amount: amount,
        billName: billName
      }).then(res => {
        console.log("FinanceScreen: Admin notification sent successfully:", res.data);
      }).catch(notifyErr => {
        console.error("FinanceScreen: Background notification failed:", notifyErr);
      });

      return; // Exit early since we already handled success
    } catch (err) {
      completed = true;
      clearTimeout(timeoutId);
      toast.dismiss(loadingToast);
      console.error("FinanceScreen: Payment error:", err);
      toast.error("Gagal mengirim konfirmasi pembayaran");
      if (err && typeof err === 'object' && 'code' in err) {
        handleFirestoreError(err, OperationType.WRITE, "payments");
      }
    } finally {
      setIsPaying(false);
    }
  };

  const formatCurrency = (amount: any) => {
    const num = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(num);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-600" size={40} />
          <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Memuat Data Keuangan...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32 pt-8 px-6 space-y-8 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 bg-white rounded-2xl shadow-sm border border-slate-100 text-slate-600 active:scale-90 transition-all"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Keuangan</h1>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3"
        >
          <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
            <Wallet size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Saldo Kantin</p>
            <p className="text-sm font-bold text-slate-900">{formatCurrency(financeInfo?.saldo || 0)}</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3"
        >
          <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
            <CreditCard size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tabungan</p>
            <p className="text-sm font-bold text-slate-900">{formatCurrency(financeInfo?.tabungan || 0)}</p>
          </div>
        </motion.div>
      </div>

      {/* Total Bill Summary */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-blue-600 p-6 rounded-[40px] text-white shadow-xl shadow-blue-500/20 flex items-center justify-between"
      >
        <div className="space-y-1">
          <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest">Total Sisa Tagihan</p>
          <p className="text-2xl font-bold">{formatCurrency(bills.reduce((acc, b) => acc + b.sisa, 0))}</p>
        </div>
        <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
          <Receipt size={24} />
        </div>
      </motion.div>

      {/* Bills List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Daftar Tagihan</h3>
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{bills.length} Item</span>
        </div>

        <div className="space-y-4">
          {bills.length === 0 ? (
            <div className="bg-white p-12 rounded-[40px] border border-slate-100 text-center space-y-3">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto">
                <CheckCircle2 size={32} />
              </div>
              <p className="text-slate-900 font-bold">Semua Tagihan Lunas!</p>
              <p className="text-slate-400 text-xs">Terima kasih telah melakukan pembayaran tepat waktu.</p>
            </div>
          ) : (
            bills.map((bill) => {
              const nominal = Number(bill.nominal) || 0;
              const terbayar = Number(bill.terbayar) || 0;
              const sisa = Number(bill.sisa) || 0;
              const progress = nominal > 0 ? (terbayar / nominal) * 100 : 0;

              return (
                <motion.div 
                  key={bill.id}
                  layout
                  className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-2xl flex items-center justify-center",
                        sisa === 0 ? "bg-emerald-50 text-emerald-500" : "bg-red-50 text-red-500"
                      )}>
                        {sisa === 0 ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{bill.nama}</h4>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{bill.kategori}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-900">{formatCurrency(nominal)}</p>
                      <p className="text-[10px] text-slate-400 font-medium">Jatuh Tempo: {bill.jatuh_tempo || "-"}</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                      <span className="text-emerald-500">Terbayar: {formatCurrency(terbayar)}</span>
                      <span className="text-red-500">Sisa: {formatCurrency(sisa)}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-emerald-500 rounded-full"
                      />
                    </div>
                  </div>

                  {sisa > 0 && (
                    <button 
                      onClick={() => handlePayNow(bill)}
                      className="w-full py-3 bg-slate-50 hover:bg-blue-50 text-blue-600 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 group"
                    >
                      Bayar Sekarang <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Payment History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Riwayat Pembayaran</h3>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{paymentHistory.length} Transaksi</span>
        </div>

        <div className="space-y-3">
          {loadingHistory ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-slate-300" size={24} />
            </div>
          ) : paymentHistory.length === 0 ? (
            <div className="bg-white p-8 rounded-[32px] border border-slate-100 text-center">
              <p className="text-slate-400 text-xs font-medium italic">Belum ada riwayat pembayaran.</p>
            </div>
          ) : (
            paymentHistory.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center",
                    item.status === "verified" ? "bg-emerald-50 text-emerald-600" :
                    item.status === "rejected" ? "bg-red-50 text-red-600" :
                    "bg-amber-50 text-amber-600"
                  )}>
                    <Receipt size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{item.billName}</h4>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : "-"}
                    </p>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs font-bold text-slate-900">{formatCurrency(item.amount)}</p>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border",
                    item.status === "verified" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                    item.status === "rejected" ? "bg-red-50 text-red-600 border-red-100" :
                    "bg-amber-50 text-amber-600 border-amber-100"
                  )}>
                    {item.status === "verified" ? "Berhasil" :
                     item.status === "rejected" ? "Ditolak" :
                     "Proses"}
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {selectedBill && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isPaying && setSelectedBill(null)}
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
                <h2 className="text-xl font-bold text-slate-900">Pembayaran Tagihan</h2>
                <button
                  onClick={() => setSelectedBill(null)}
                  disabled={isPaying}
                  className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 space-y-1">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Tagihan</p>
                  <h3 className="text-lg font-bold text-slate-900">{selectedBill.nama}</h3>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-slate-500">Sisa Tagihan:</p>
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(selectedBill.sisa)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Nominal Pembayaran</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">Rp</div>
                    <input 
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(Number(e.target.value))}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold text-slate-900"
                      placeholder="Masukkan nominal..."
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button 
                      onClick={() => setPaymentAmount(selectedBill.rencana_cicilan || 0)}
                      className="px-3 py-1.5 bg-slate-100 text-[10px] font-bold text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      Cicilan: {formatCurrency(selectedBill.rencana_cicilan)}
                    </button>
                    <button 
                      onClick={() => setPaymentAmount(selectedBill.sisa)}
                      className="px-3 py-1.5 bg-slate-100 text-[10px] font-bold text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      Bayar Lunas
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Unggah Bukti Pembayaran</label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "relative w-full h-32 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all overflow-hidden",
                      proofPhoto ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                    )}
                  >
                    {proofPhoto ? (
                      <img src={proofPhoto} alt="Bukti" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm">
                          <Camera size={20} />
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ambil Foto / Upload</p>
                      </>
                    )}
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handlePhotoUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3">
                  <AlertCircle size={18} className="text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-700 leading-relaxed">
                    Pembayaran Anda akan diverifikasi oleh bagian keuangan dalam waktu 1x24 jam.
                  </p>
                </div>

                <button
                  onClick={confirmPayment}
                  disabled={isPaying}
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isPaying ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                  Kirim Konfirmasi
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="bg-amber-50 p-5 rounded-[32px] border border-amber-100 flex gap-4">
        <div className="w-10 h-10 bg-amber-500 rounded-2xl flex items-center justify-center text-white shrink-0">
          <AlertCircle size={20} />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Informasi Pembayaran</h4>
          <p className="text-[10px] text-amber-700 leading-relaxed">
            Pembayaran dapat dilakukan melalui Virtual Account atau Kasir Sekolah. Harap simpan bukti pembayaran Anda.
          </p>
        </div>
      </div>
    </div>
  );
}
