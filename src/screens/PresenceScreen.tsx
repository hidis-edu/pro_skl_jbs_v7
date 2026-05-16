import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Calendar, Clock, CheckCircle2, AlertCircle, Loader2, MapPin, UserCheck, BookOpen, Fingerprint } from "lucide-react";
import { UserData } from "@/types";
import { cn } from "@/lib/utils";
import { syncBiometricsToFirestore } from "@/lib/biometricSync";
import { db, collection, query, where, orderBy, onSnapshot, handleFirestoreError, OperationType } from "@/firebase";

interface PresenceScreenProps {
  user: UserData;
  onBack: () => void;
  initialTab?: AttendanceTab;
}

type AttendanceTab = "harian" | "pelajaran" | "biometric";

export default function PresenceScreen({ user, onBack, initialTab }: PresenceScreenProps) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AttendanceTab>(
    initialTab || (Number(user.level) === 2 ? "pelajaran" : "harian")
  );
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [subjectAttendance, setSubjectAttendance] = useState<any[]>([]);
  const [employeeAttendance, setEmployeeAttendance] = useState<any[]>([]);
  const [biometricData, setBiometricData] = useState<any[]>([]);
  const [firestoreBiometrics, setFirestoreBiometrics] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'));
  const [stats, setStats] = useState({ hadir: 0, izin: 0, alpa: 0 });

  const months = [
    { value: "01", label: "Januari" },
    { value: "02", label: "Februari" },
    { value: "03", label: "Maret" },
    { value: "04", label: "April" },
    { value: "05", label: "Mei" },
    { value: "06", label: "Juni" },
    { value: "07", label: "Juli" },
    { value: "08", label: "Agustus" },
    { value: "09", label: "September" },
    { value: "10", label: "Oktober" },
    { value: "11", label: "November" },
    { value: "12", label: "Desember" }
  ];

  const years = ["2024", "2025", "2026", "2027"];

  useEffect(() => {
    const fetchData = async () => {
      const identifier = user.nis || user.nip || user.nopendaftaran || user.nama || user.id;
      if (!identifier) return;

      setLoading(true);
      try {
        // Fetch Daily Attendance (Students)
        if (user.nis || user.nopendaftaran) {
          const harianRes = await fetch(`/api/jbsakad/presensiharian/${user.nis || user.nopendaftaran}`);
          const harianData = await harianRes.json();
          
          if (harianData.status === "sukses" || harianData.status === "success" || harianData.data) {
            const data = Array.isArray(harianData.data) ? harianData.data : [harianData.data];
            const sortedHarian = [...data].sort((a, b) => 
              new Date(b.tanggal1 || b.ts).getTime() - new Date(a.tanggal1 || a.ts).getTime()
            );
            setAttendanceHistory(sortedHarian);
            
            const totalHadir = sortedHarian.reduce((acc, curr) => acc + (Number(curr.hariaktif) || 0), 0);
            setStats({ hadir: totalHadir, izin: 0, alpa: 0 });
          }

          // Fetch Subject Attendance (Students)
          const pelajaranRes = await fetch(`/api/jbsakad/presensi-pelajaran/${user.nis || user.nopendaftaran}`);
          const pelajaranData = await pelajaranRes.json();

          if (pelajaranData.status === "sukses" || pelajaranData.status === "success" || pelajaranData.data) {
            const data = Array.isArray(pelajaranData.data) ? pelajaranData.data : [pelajaranData.data];
            const sortedPelajaran = [...data].sort((a, b) => 
              new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime()
            );
            setSubjectAttendance(sortedPelajaran);
          }
        }

        // Fetch Employee Attendance (JIBAS)
        if (user.nip) {
          const response = await fetch(`/api/jbssdm/presensi/${user.nip}`);
          const result = await response.json();
          if (result.status === "sukses" && Array.isArray(result.data)) {
            const sortedPegawai = [...result.data].sort((a: any, b: any) => 
              new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime()
            );
            setEmployeeAttendance(sortedPegawai);
          }
        }

        // Fetch Biometric Data (FaceID)
        const faceidRes = await fetch(`/api/jbssat/faceid/${identifier}`);
        const faceidJson = await faceidRes.json();
        
        // Fetch Biometric Data (Fingerprint)
        const fingerprintRes = await fetch(`/api/jbssat/fingerprint/${identifier}`);
        const fingerprintJson = await fingerprintRes.json();
        
        console.log("PresenceScreen - User Identifier:", identifier);
        console.log("PresenceScreen - FaceID:", faceidJson);
        console.log("PresenceScreen - Fingerprint:", fingerprintJson);
        
        let faceIdRecords: any[] = [];
        let fingerprintRecords: any[] = [];
        let combinedBiometric: any[] = [];

        // Process FaceID
        if (faceidJson.data && Array.isArray(faceidJson.data)) {
          faceIdRecords = faceidJson.data.flatMap((f: any) => {
            const records = [];
            // If machine_id is present, it's definitely a Fingerprint record
            const actualType = f.machine_id ? 'Fingerprint' : 'FaceID';
            
            if (f.jam_datang || f.jam_pulang) {
              if (f.jam_datang && f.jam_datang !== "00:00:00") {
                records.push({
                  ...f,
                  nama: f.nama || user.nama,
                  tanggal: f.tanggal || (f.timestamp ? f.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]),
                  jam: f.jam_datang,
                  type: actualType,
                  status: "Masuk"
                });
              }
              if (f.jam_pulang && f.jam_pulang !== "00:00:00") {
                records.push({
                  ...f,
                  nama: f.nama || user.nama,
                  tanggal: f.tanggal || (f.timestamp ? f.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]),
                  jam: f.jam_pulang,
                  type: actualType,
                  status: "Pulang"
                });
              }
            } else {
              records.push({
                ...f,
                nama: f.nama || user.nama,
                tanggal: f.tanggal || (f.timestamp ? f.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]),
                jam: f.jam || (f.timestamp ? f.timestamp.split('T')[1].substring(0, 8) : "00:00:00"),
                type: actualType,
                status: "Hadir"
              });
            }
            return records;
          });
        }

        // Process Fingerprint
        if (fingerprintJson.data && Array.isArray(fingerprintJson.data)) {
          fingerprintRecords = fingerprintJson.data.flatMap((f: any) => {
            const records = [];
            if (f.jam_datang || f.jam_pulang) {
              if (f.jam_datang && f.jam_datang !== "00:00:00") {
                records.push({
                  ...f,
                  nama: f.nama || user.nama,
                  tanggal: f.tanggal || (f.timestamp ? f.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]),
                  jam: f.jam_datang,
                  type: 'Fingerprint',
                  status: "Masuk"
                });
              }
              if (f.jam_pulang && f.jam_pulang !== "00:00:00") {
                records.push({
                  ...f,
                  nama: f.nama || user.nama,
                  tanggal: f.tanggal || (f.timestamp ? f.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]),
                  jam: f.jam_pulang,
                  type: 'Fingerprint',
                  status: "Pulang"
                });
              }
            } else {
              records.push({
                ...f,
                nama: f.nama || user.nama,
                tanggal: f.tanggal || (f.timestamp ? f.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]),
                jam: f.jam || (f.timestamp ? f.timestamp.split('T')[1].substring(0, 8) : "00:00:00"),
                type: 'Fingerprint',
                status: "Hadir"
              });
            }
            return records;
          });
        }

        // Logic: If fingerprint is detected (either from endpoint or by machine_id),
        // show ONLY fingerprint data. Do not mix with FaceID.
        const allBiometric = [...faceIdRecords, ...fingerprintRecords];
        const hasFingerprint = allBiometric.some(r => r.machine_id || r.type === 'Fingerprint');
        
        if (hasFingerprint) {
          // Only show fingerprint records if machine_id is detected
          combinedBiometric = allBiometric.filter(r => r.machine_id || r.type === 'Fingerprint');
          // Ensure they are labeled correctly
          combinedBiometric = combinedBiometric.map(r => ({ ...r, type: 'Fingerprint' }));
        } else {
          combinedBiometric = faceIdRecords;
        }

        // Sort by date and time descending
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
        setBiometricData(uniqueBiometric);

        // Sync all fetched biometrics to Firestore
        if (user.uid) {
          syncBiometricsToFirestore(uniqueBiometric, user.uid);
        }
      } catch (error) {
        console.error("Error fetching attendance data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user.nis, user.nip, user.nopendaftaran, user.nama, user.replid, user.pin, user.id_fingerprint, user.id]);

  useEffect(() => {
    if (!user.uid) return;

    const q = query(
      collection(db, "biometrics"),
      where("userId", "==", user.uid),
      orderBy("tanggal", "desc"),
      orderBy("jam", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setFirestoreBiometrics(data);
    }, (error) => {
      console.error("Error fetching biometrics from Firestore:", error);
      handleFirestoreError(error, OperationType.GET, "biometrics");
    });

    return () => unsubscribe();
  }, [user.uid]);

  // Merge API and Firestore data for Biometric tab
  const displayBiometricData = React.useMemo(() => {
    // Combine all sources
    const allRecords = [...biometricData, ...firestoreBiometrics];
    
    // Aggressive deduplication using a Map
    const uniqueMap = new Map();
    allRecords.forEach(record => {
      const date = String(record.tanggal || '').split('T')[0].trim();
      const time = String(record.jam || '').substring(0, 8).trim();
      const type = String(record.type || '').trim().toLowerCase();
      const status = String(record.status || '').trim().toLowerCase();
      const token = String(record.face_token || record.machine_id || '').trim();
      
      // Use a robust key for deduplication
      const key = `${date}_${time}_${type}_${status}_${token}`;
      
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, record);
      }
    });

    const uniqueRecords = Array.from(uniqueMap.values());

    // Filter by selected year and month
    const filtered = uniqueRecords.filter(item => {
      if (!item.tanggal) return false;
      const [year, month] = item.tanggal.split('-');
      return year === selectedYear && month === selectedMonth;
    });

    // Sort and limit to 5
    return filtered.sort((a: any, b: any) => {
      const parseDate = (item: any) => {
        const d = new Date(item.tanggal);
        const [h, m, s] = item.jam.split(':').map(Number);
        d.setHours(h, m, s);
        return d.getTime();
      };
      return parseDate(b) - parseDate(a);
    }).slice(0, 5);
  }, [biometricData, firestoreBiometrics, selectedYear, selectedMonth]);

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
          <h1 className="text-xl font-bold text-slate-900">
            {user.level === 2 ? "Presensi Pegawai" : "Presensi Siswa"}
          </h1>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-100 rounded-2xl">
          {user.level !== 2 && (
            <button
              onClick={() => setActiveTab("harian")}
              className={cn(
                "flex-1 py-2.5 text-[10px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5",
                activeTab === "harian" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
              )}
            >
              <Calendar size={12} />
              Harian
            </button>
          )}
          <button
            onClick={() => setActiveTab("pelajaran")}
            className={cn(
              "flex-1 py-2.5 text-[10px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5",
              activeTab === "pelajaran" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
            )}
          >
            <BookOpen size={12} />
            {user.level === 2 ? "Pegawai" : "Pelajaran"}
          </button>
          <button
            onClick={() => setActiveTab("biometric")}
            className={cn(
              "flex-1 py-2.5 text-[10px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5",
              activeTab === "biometric" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
            )}
          >
            <Fingerprint size={12} />
            Biometrik
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats Summary (Only for Harian) */}
        {activeTab === "harian" && (
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-emerald-50 p-6 rounded-[32px] border border-emerald-100 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Total Hari Hadir</p>
                <p className="text-3xl font-bold text-emerald-700">{stats.hadir}</p>
              </div>
              <div className="w-14 h-14 bg-white/50 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm">
                <UserCheck size={32} />
              </div>
            </div>
          </div>
        )}

        {/* History List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              {activeTab === "harian" ? (
                <Calendar size={20} className="text-blue-600" />
              ) : activeTab === "pelajaran" ? (
                <BookOpen size={20} className="text-purple-600" />
              ) : (
                <Fingerprint size={20} className="text-indigo-600" />
              )}
              {activeTab === "harian" ? "Riwayat Presensi Harian" : activeTab === "pelajaran" ? (user.level === 2 ? "Riwayat Presensi Pegawai" : "Riwayat Presensi Pelajaran") : "Riwayat Biometrik"}
            </h3>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 size={32} className="text-blue-600 animate-spin" />
              <p className="text-sm font-medium text-slate-400">Memuat data presensi...</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === "harian" ? (
                <motion.div
                  key="harian"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-3"
                >
                  {attendanceHistory.length > 0 ? (
                    attendanceHistory.map((record, index) => (
                      <div key={index} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600">
                              <UserCheck size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                {record.hariaktif === 1 ? "Hadir" : `Hadir (${record.hariaktif} Hari)`}
                              </p>
                              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                {record.tanggal1 ? new Date(record.tanggal1).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : "-"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-900">
                              {record.ts ? new Date(record.ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : "--:--"}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Waktu</p>
                          </div>
                        </div>
                        {record.tanggal1 !== record.tanggal2 && (
                          <div className="mt-3 p-3 bg-slate-50 rounded-2xl flex items-center gap-2">
                            <Clock size={14} className="text-slate-400" />
                            <p className="text-[10px] text-slate-600 font-medium">
                              Periode: {new Date(record.tanggal1).toLocaleDateString('id-ID')} - {new Date(record.tanggal2).toLocaleDateString('id-ID')}
                            </p>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <EmptyState />
                  )}
                </motion.div>
              ) : activeTab === "pelajaran" ? (
                <motion.div
                  key="pelajaran"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-3"
                >
                  {user.level === 2 ? (
                    // Employee Attendance List
                    employeeAttendance.length > 0 ? (
                      employeeAttendance.map((record, index) => (
                        <div key={index} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600">
                                <UserCheck size={20} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900">{record.status_teks}</p>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                  {new Date(record.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                              </div>
                            </div>
                            <span className={cn(
                              "text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                              record.status_teks === "Hadir" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                            )}>
                              {record.status_teks}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-50">
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-slate-400" />
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jam Masuk</p>
                                <p className="text-xs font-bold text-slate-700">{record.jammasuk || "-"}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-slate-400" />
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jam Pulang</p>
                                <p className="text-xs font-bold text-slate-700">{record.jampulang || "-"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState />
                    )
                  ) : (
                    // Subject Attendance List (Students)
                    subjectAttendance.length > 0 ? (
                      subjectAttendance.map((record, index) => (
                        <div key={index} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-50 text-purple-600">
                                <BookOpen size={20} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-900">{record.mapel}</p>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                  {new Date(record.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                              </div>
                            </div>
                            <span className={cn(
                              "text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                              record.status_absen === "Hadir" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                            )}>
                              {record.status_absen}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-50">
                            <div className="flex items-center gap-2">
                              <Clock size={14} className="text-slate-400" />
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jam Pelajaran</p>
                                <p className="text-xs font-bold text-slate-700">{record.jam}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin size={14} className="text-slate-400" />
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kelas</p>
                                <p className="text-xs font-bold text-slate-700">{record.nama_kelas}</p>
                              </div>
                            </div>
                          </div>
                          {record.catatan && (
                            <div className="mt-3 p-3 bg-slate-50 rounded-2xl flex items-start gap-2">
                              <AlertCircle size={14} className="text-slate-400 mt-0.5" />
                              <p className="text-[11px] text-slate-600 leading-relaxed italic">
                                "{record.catatan}"
                              </p>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <EmptyState />
                    )
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="biometric"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {/* Filters */}
                  <div className="flex gap-3 bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block px-1">Tahun</label>
                      <select 
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                      >
                        {years.map(year => (
                          <option key={year} value={year}>{year}/{parseInt(year) + 1}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block px-1">Bulan</label>
                      <select 
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                      >
                        {months.map(month => (
                          <option key={month.value} value={month.value}>{month.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold text-slate-900">Riwayat Biometrik</h3>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                      {displayBiometricData.length} Record
                    </span>
                  </div>

                  {displayBiometricData.length > 0 ? (
                    displayBiometricData.map((record, index) => (
                      <div key={index} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center",
                              record.type === 'FaceID' ? "bg-purple-50 text-purple-600" : "bg-indigo-50 text-indigo-600"
                            )}>
                              {record.type === 'FaceID' ? <UserCheck size={20} /> : <Fingerprint size={20} />}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">{record.nama}</p>
                              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                {new Date(record.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                              record.type === 'FaceID' ? "bg-purple-100 text-purple-600" : "bg-indigo-100 text-indigo-600"
                            )}>
                              {record.type}
                            </span>
                            {record.status && (
                              <span className={cn(
                                "text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                                record.status === 'Masuk' ? "bg-emerald-100 text-emerald-600" : "bg-orange-100 text-orange-600"
                              )}>
                                {record.status}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-50">
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-slate-400" />
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jam</p>
                              <p className="text-xs font-bold text-slate-700">{record.jam}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <AlertCircle size={14} className="text-slate-400" />
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {record.type === 'FaceID' ? 'Face Token' : 'Machine ID'}
                              </p>
                              <p className="text-xs font-bold text-slate-700">
                                {record.type === 'FaceID' ? record.face_token : record.machine_id}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState message={`Tidak ada riwayat biometrik pada ${months.find(m => m.value === selectedMonth)?.label} ${selectedYear}`} />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Info Card */}
        <div className="bg-blue-600 p-6 rounded-[32px] text-white relative overflow-hidden shadow-xl shadow-blue-500/20">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="relative flex items-start gap-4">
            <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/20">
              <MapPin size={24} />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold">Informasi Presensi</h4>
              <p className="text-xs text-blue-100 leading-relaxed">
                Data presensi diambil secara otomatis dari sistem JIBAS. Jika terdapat ketidaksesuaian, silakan hubungi bagian kesiswaan.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <div className="bg-white p-12 rounded-[40px] border border-slate-100 shadow-sm flex flex-col items-center text-center space-y-4">
      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
        <Calendar size={40} />
      </div>
      <div className="space-y-1">
        <h4 className="text-lg font-bold text-slate-900">Belum Ada Riwayat</h4>
        <p className="text-sm text-slate-500">{message || "Data presensi Anda belum tercatat di sistem."}</p>
      </div>
    </div>
  );
}
