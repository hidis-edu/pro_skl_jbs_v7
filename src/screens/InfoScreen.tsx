import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, Calendar, Megaphone, FileText, ChevronRight, Plus, X, Loader2, Trash2, ExternalLink, Clock, MapPin, Tag, Play, Video, Search, Filter } from "lucide-react";
import { UserData, NewsItem, AgendaItem, DocumentItem, CalendarEvent, TeacherSchedule, ClassScheduleData } from "@/types";
import { auth } from "@/firebase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface InfoScreenProps {
  user: UserData;
}

interface VideoItem {
  replid: number;
  judul: string;
  keterangan: string;
  tanggal: string;
  filename: string;
  location: string;
  filetype: string;
  filesize: number;
  views: number;
  pengupload: string;
  full_path: string;
}

interface GalleryItem {
  replid: number;
  judul: string;
  tanggal: string;
  departemen: string;
  nama_pengirim: string;
  photo_cover: string;
  tgl_display: string;
}

type InfoTab = "news" | "events" | "docs" | "media" | "gallery" | "calendar" | "schedule" | "classSchedule" | "about";

export default function InfoScreen({ user }: InfoScreenProps) {
  const [activeTab, setActiveTab] = useState<InfoTab>("news");
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data states
  const [news, setNews] = useState<NewsItem[]>([]);
  const [events, setEvents] = useState<AgendaItem[]>([]);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [media, setMedia] = useState<VideoItem[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [schedule, setSchedule] = useState<TeacherSchedule[]>([]);
  const [classSchedule, setClassSchedule] = useState<ClassScheduleData | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>("Semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("Semua");
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [loadingClassSchedule, setLoadingClassSchedule] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay() === 0 ? 7 : new Date().getDay());
  const [authReady, setAuthReady] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileType, setFileType] = useState("PDF");

  const isEmployee = Number(user.level) === 1 || Number(user.level) === 2;

  const getDocumentFilename = (raw: string) => {
    if (!raw) return "";
    let filename = raw.trim();

    // Remove query string / hash if present
    filename = filename.split("?")[0].split("#")[0];

    if (filename.startsWith("/api/download/file/")) {
      filename = filename.split("/").pop() || filename;
    }
    try {
      const url = new URL(filename, window.location.origin);
      filename = url.pathname;
    } catch {
      // not a full URL, use raw string as-is
    }
    const parts = filename.split("/").filter(Boolean);
    return parts[parts.length - 1] || filename;
  };

  const resolveDocumentFilename = (raw: string) => {
    let filename = getDocumentFilename(raw);
    if (!filename) return "";

    if (filename.includes("{nis}") && user.nis) {
      filename = filename.replace(/\{nis\}/gi, user.nis);
    }
    if (filename.includes("{nopendaftaran}") && user.nopendaftaran) {
      filename = filename.replace(/\{nopendaftaran\}/gi, user.nopendaftaran);
    }
    if (filename.includes("{nip}") && user.nip) {
      filename = filename.replace(/\{nip\}/gi, user.nip);
    }

    return filename;
  };

  const getDocumentDownloadUrl = (raw: string) => {
    const filename = resolveDocumentFilename(raw);
    return `/api/download/file/${encodeURIComponent(filename)}`;
  };

  const getDocumentPreviewUrl = (raw: string) => {
    const filename = resolveDocumentFilename(raw);
    return `/api/download/preview/${encodeURIComponent(filename)}`;
  };

  const [previewMode, setPreviewMode] = useState<boolean>(true);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string>("");

  useEffect(() => {
    if (!previewMode) {
      setSelectedPreviewUrl("");
    }
  }, [previewMode]);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((firebaseUser) => {
      setAuthReady(!!firebaseUser);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!authReady) {
      const timer = setTimeout(() => setLoading(false), 3000);
      return () => clearTimeout(timer);
    }

    setLoading(false);
  }, [authReady]);

  useEffect(() => {
    if (activeTab === "media" && media.length === 0) {
      fetchMedia();
    }
    if (activeTab === "gallery" && gallery.length === 0) {
      fetchGallery();
    }
    if (activeTab === "calendar" && calendar.length === 0) {
      fetchCalendar();
    }
    if (activeTab === "schedule" && schedule.length === 0) {
      fetchSchedule();
    }
    if (activeTab === "classSchedule" && !classSchedule) {
      fetchClassSchedule();
    }
  }, [activeTab]);

  const academicYears = ["Semua", ...Array.from(new Set(calendar.map(item => item.nama_kalender)))];
  const filteredCalendar = selectedYear === "Semua" 
    ? calendar 
    : calendar.filter(item => item.nama_kalender === selectedYear);

  const fetchCalendar = async () => {
    setLoadingCalendar(true);
    try {
      const response = await fetch("/api/jbsakad/kalender-akademik");
      const result = await response.json();
      if (result.status === "SUCCESS") {
        setCalendar(result.data);
      }
    } catch (error) {
      console.error("Error fetching calendar:", error);
      toast.error("Gagal memuat kalender akademik");
    } finally {
      setLoadingCalendar(false);
    }
  };

  const fetchSchedule = async () => {
    if (!user.nip) return;
    setLoadingSchedule(true);
    try {
      const response = await fetch(`/api/jbsakad/guru/${user.nip}`);
      const result = await response.json();
      if (result.success) {
        setSchedule(result.data);
      }
    } catch (error) {
      console.error("Error fetching schedule:", error);
      toast.error("Gagal memuat jadwal mengajar");
    } finally {
      setLoadingSchedule(false);
    }
  };

  const fetchClassSchedule = async () => {
    const idkelas = user.idkelas || user.replid_kelas || user.kelas_id || "190"; // Fallback to 190 for demo if not found
    setLoadingClassSchedule(true);
    try {
      const response = await fetch(`/api/jbsakad/kelas/${idkelas}`);
      const result = await response.json();
      if (result.success) {
        setClassSchedule(result.data);
      }
    } catch (error) {
      console.error("Error fetching class schedule:", error);
      toast.error("Gagal memuat jadwal kelas");
    } finally {
      setLoadingClassSchedule(false);
    }
  };

  const fetchMedia = async () => {
    setLoadingMedia(true);
    try {
      const response = await fetch("/api/jbsvcr/video");
      const result = await response.json();
      if (result.status === "sukses") {
        setMedia(result.data);
      }
    } catch (error) {
      console.error("Error fetching media:", error);
      toast.error("Gagal memuat data media");
    } finally {
      setLoadingMedia(false);
    }
  };

  const fetchGallery = async () => {
    setLoadingGallery(true);
    try {
      const response = await fetch("/api/jbsvcr/gallery");
      const result = await response.json();
      if (result.status === "sukses") {
        setGallery(result.data);
      }
    } catch (error) {
      console.error("Error fetching gallery:", error);
      toast.error("Gagal memuat data galeri");
    } finally {
      setLoadingGallery(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      toast.success("Penambahan informasi dinonaktifkan sementara.");
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error("Error handling add:", error);
      toast.error("Gagal menambahkan data");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, collectionName: string) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus data ini?")) return;
    toast.error("Penghapusan data dinonaktifkan sementara.");
  };

  const resetForm = () => {
    setTitle("");
    setContent("");
    setCategory("");
    setDate("");
    setLocation("");
    setFileUrl("");
    setFileType("PDF");
  };

  const filteredGallery = gallery.filter(item => {
    const matchesSearch = item.judul.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         item.nama_pengirim.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = selectedDept === "Semua" || item.departemen === selectedDept;
    return matchesSearch && matchesDept;
  });

  const departments = ["Semua", ...new Set(gallery.map(item => item.departemen))];

  const categories = [
    { id: "news", label: "Berita", icon: Megaphone, color: "bg-orange-500" },
    { id: "events", label: "Agenda", icon: Calendar, color: "bg-blue-500" },
    { id: "docs", label: "Dokumen", icon: FileText, color: "bg-purple-500" },
    { id: "media", label: "Media", icon: Video, color: "bg-rose-500" },
    { id: "gallery", label: "Galeri", icon: Tag, color: "bg-emerald-500" },
    { id: "calendar", label: "Kalender", icon: Calendar, color: "bg-indigo-500" },
    ...(isEmployee ? [{ id: "schedule", label: "Jadwal", icon: Clock, color: "bg-teal-500" }] : []),
    ...(user.level === 3 ? [{ id: "classSchedule", label: "Jadwal Kelas", icon: Clock, color: "bg-cyan-500" }] : []),
    { id: "about", label: "Tentang", icon: Info, color: "bg-slate-500" },
  ];

  return (
    <div className="pb-32 pt-8 px-6 space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-slate-400 text-sm font-medium">Informasi</h2>
          <h1 className="text-2xl font-bold text-slate-900">Pusat Informasi</h1>
        </div>
        {isEmployee && activeTab !== "about" && (
          <button
            onClick={() => setShowAddModal(true)}
            className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Plus size={24} />
          </button>
        )}
      </div>

      {/* Categories / Tabs */}
      <div className="grid grid-cols-2 gap-4">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveTab(cat.id as InfoTab)}
            className={cn(
              "p-4 rounded-3xl border shadow-sm flex items-center gap-3 transition-all active:scale-95",
              activeTab === cat.id 
                ? "bg-white border-blue-200 ring-2 ring-blue-50" 
                : "bg-white border-slate-100 opacity-70"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center text-white",
              cat.color
            )}>
              <cat.icon size={20} />
            </div>
            <span className={cn(
              "text-sm font-bold",
              activeTab === cat.id ? "text-slate-900" : "text-slate-500"
            )}>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Loader2 className="animate-spin" size={32} />
            <p className="text-sm font-medium">Memuat data...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === "news" && (
              <motion.div
                key="news-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-bold text-slate-900">Berita Terbaru</h3>
                {news.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-[32px] border border-dashed border-slate-200 text-slate-400">
                    Belum ada berita.
                  </div>
                ) : (
                  news.map((item) => (
                    <div key={item.id} className="bg-white rounded-[32px] overflow-hidden border border-slate-100 shadow-sm relative group">
                      {isEmployee && (
                        <button
                          onClick={() => handleDelete(item.id, "news")}
                          className="absolute top-4 right-4 z-10 w-8 h-8 bg-red-500 text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <div className="h-40 w-full overflow-hidden">
                        <img src={item.image || "https://picsum.photos/seed/news/800/400"} alt={item.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                            {item.category}
                          </span>
                          <span className="text-slate-400 text-[10px] font-medium">
                            {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('id-ID') : 'Baru saja'}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-slate-900 leading-snug">{item.title}</h4>
                        <p className="text-sm text-slate-500 line-clamp-2">{item.content}</p>
                        <div className="flex items-center text-blue-600 text-xs font-bold gap-1 pt-2">
                          Baca Selengkapnya <ChevronRight size={14} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {activeTab === "events" && (
              <motion.div
                key="events-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-bold text-slate-900">Agenda Sekolah</h3>
                {events.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-[32px] border border-dashed border-slate-200 text-slate-400">
                    Belum ada agenda.
                  </div>
                ) : (
                  events.map((item) => (
                    <div key={item.id} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex gap-4 relative group">
                      {isEmployee && (
                        <button
                          onClick={() => handleDelete(item.id, "events")}
                          className="absolute top-4 right-4 z-10 w-8 h-8 bg-red-500 text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <div className="flex-shrink-0 w-14 h-14 bg-blue-50 rounded-2xl flex flex-col items-center justify-center text-blue-600">
                        <span className="text-[10px] font-bold uppercase tracking-tighter">
                          {new Date(item.date).toLocaleDateString('id-ID', { month: 'short' })}
                        </span>
                        <span className="text-xl font-black leading-none">
                          {new Date(item.date).getDate()}
                        </span>
                      </div>
                      <div className="space-y-1 flex-1">
                        <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium">
                          <span className="flex items-center gap-1"><Clock size={10} /> {new Date(item.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                          {item.location && <span className="flex items-center gap-1"><MapPin size={10} /> {item.location}</span>}
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-1 mt-1">{item.description}</p>
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {activeTab === "docs" && (
              <motion.div
                key="docs-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-slate-900">Dokumen & Unduhan</h3>
                    <p className="text-xs text-slate-400">Gunakan endpoint /api/download/file/:filename untuk download dan /api/download/preview/:filename untuk preview. Untuk siswa gunakan <code>{'{nis}'}</code> seperti <code>{'{nis}'}.pdf</code> atau <code>{'{nis}'}.jpg</code>. Calon siswa dan pegawai dapat menggunakan <code>{'{nopendaftaran}'}</code> dan <code>{'{nip}'}</code>.</p>
                  </div>
                  <div className="relative group flex items-center gap-3">
                    <label className="text-xs text-slate-500">Preview</label>
                    <button
                      onClick={() => setPreviewMode(!previewMode)}
                      className={`w-12 h-7 rounded-full p-0.5 flex items-center transition-all ${previewMode ? 'bg-emerald-500' : 'bg-slate-200'}`}
                      aria-pressed={previewMode}
                      title={previewMode ? 'Mode Preview (inline)' : 'Mode Download (attachment)'}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${previewMode ? 'translate-x-5' : 'translate-x-0'}`}></div>
                    </button>
                    <span className="absolute top-full mt-2 right-0 z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      {previewMode ? 'Preview (inline) — tampilkan PDF/JPG di browser' : 'Download (attachment) — unduh file langsung'}
                    </span>
                  </div>
                </div>
                {previewMode && selectedPreviewUrl && (
                  <div className="bg-slate-50 border border-slate-200 rounded-[32px] p-4 mb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Preview Dokumen</h4>
                        <p className="text-xs text-slate-500">Embed preview ditampilkan langsung di halaman.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedPreviewUrl("")}
                        className="text-xs text-slate-500 hover:text-slate-900 transition"
                      >
                        Tutup preview
                      </button>
                    </div>
                    <div className="mt-4 h-[600px] rounded-[28px] overflow-hidden border border-slate-200 bg-white">
                      <iframe
                        src={selectedPreviewUrl}
                        title="Preview Dokumen"
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                )}
                {docs.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-[32px] border border-dashed border-slate-200 text-slate-400">
                    Belum ada dokumen.
                  </div>
                ) : (
                  docs.map((item) => (
                    <div key={item.id} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between relative group">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
                          <FileText size={24} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{item.fileType} • {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('id-ID') : 'Baru saja'}</p>
                          <p className="text-[10px] text-slate-500 mt-1 break-all">
                            Preview URL:&nbsp;<span className="font-mono text-[10px] text-slate-700">{getDocumentPreviewUrl(item.fileUrl)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {previewMode && (
                          <button
                            type="button"
                            onClick={() => setSelectedPreviewUrl(getDocumentPreviewUrl(item.fileUrl))}
                            className="px-3 py-2 text-xs font-semibold bg-blue-50 text-blue-700 rounded-2xl hover:bg-blue-100 transition"
                          >
                            Preview embed
                          </button>
                        )}
                        {isEmployee && (
                          <button
                            onClick={() => handleDelete(item.id, "documents")}
                            className="w-8 h-8 bg-red-50 text-red-500 rounded-xl flex items-center justify-center active:scale-90 transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        <a
                          href={previewMode ? getDocumentPreviewUrl(item.fileUrl) : getDocumentDownloadUrl(item.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 transition-all"
                        >
                          <ExternalLink size={18} />
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {activeTab === "media" && (
              <motion.div
                key="media-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-bold text-slate-900">Media & Video</h3>
                {loadingMedia ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                    <Loader2 className="animate-spin" size={24} />
                    <p className="text-xs">Memuat video...</p>
                  </div>
                ) : media.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-[32px] border border-dashed border-slate-200 text-slate-400">
                    Belum ada video tersedia.
                  </div>
                ) : (
                  media.map((item) => (
                    <div key={item.replid} className="bg-white rounded-[32px] overflow-hidden border border-slate-100 shadow-sm group">
                      <div className="relative h-48 bg-slate-900 flex items-center justify-center">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
                        <Play size={48} className="text-white/80 z-20 group-hover:scale-110 transition-transform" />
                        <div className="absolute bottom-4 left-5 right-5 z-20 flex items-center justify-between">
                          <span className="px-2 py-1 bg-white/20 backdrop-blur-md rounded-lg text-[10px] font-bold text-white uppercase tracking-wider">
                            {item.filetype.split('/')[1]}
                          </span>
                          <span className="text-[10px] font-bold text-white/80">
                            {(item.filesize / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </div>
                      </div>
                      <div className="p-5 space-y-3">
                        <div className="space-y-1">
                          <h4 className="text-base font-bold text-slate-900 leading-tight">{item.judul}</h4>
                          <p className="text-xs text-slate-500 line-clamp-2">{item.keterangan}</p>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                              <Tag size={12} />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {item.pengupload}
                            </span>
                          </div>
                          <a
                            href={item.full_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                          >
                            Putar Video
                          </a>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {activeTab === "gallery" && (
              <motion.div
                key="gallery-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">Galeri Foto</h3>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-full">
                    {filteredGallery.length} Foto
                  </span>
                </div>

                {/* Search & Filter */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text"
                      placeholder="Cari foto atau pengirim..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white border border-slate-100 rounded-2xl pl-12 pr-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                    <div className="flex-shrink-0 w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                      <Filter size={14} />
                    </div>
                    {departments.map((dept) => (
                      <button
                        key={dept}
                        onClick={() => setSelectedDept(dept)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                          selectedDept === dept 
                            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                            : "bg-white text-slate-400 border border-slate-100"
                        )}
                      >
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>

                {loadingGallery ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                    <Loader2 className="animate-spin" size={24} />
                    <p className="text-xs">Memuat galeri...</p>
                  </div>
                ) : filteredGallery.length === 0 ? (
                  <div className="p-12 text-center bg-white rounded-[32px] border border-dashed border-slate-200 text-slate-400 flex flex-col items-center gap-3">
                    <Search size={32} className="opacity-20" />
                    <p className="text-sm">Tidak ada foto yang cocok.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    {filteredGallery.map((item) => (
                      <motion.div 
                        layoutId={`gallery-${item.replid}`}
                        key={item.replid} 
                        onClick={() => setSelectedImage(item)}
                        className="bg-white rounded-[32px] overflow-hidden border border-slate-100 shadow-sm group relative cursor-pointer active:scale-[0.98] transition-all"
                      >
                        <div className="aspect-video w-full overflow-hidden">
                          <img 
                            src={item.photo_cover} 
                            alt={item.judul} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                              {item.departemen}
                            </span>
                            <span className="text-slate-400 text-[10px] font-medium flex items-center gap-1">
                              <Calendar size={10} /> {item.tgl_display}
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-slate-900 leading-tight">{item.judul}</h4>
                          <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <Tag size={12} />
                              </div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {item.nama_pengirim}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "calendar" && (
              <motion.div
                key="calendar-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="text-lg font-bold text-slate-900">Kalender Akademik</h3>
                  
                  {!loadingCalendar && calendar.length > 0 && (
                    <div className="relative">
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold py-2 pl-4 pr-10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all w-full sm:w-auto"
                      >
                        {academicYears.map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <Filter size={14} />
                      </div>
                    </div>
                  )}
                </div>

                {loadingCalendar ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                    <Loader2 className="animate-spin" size={24} />
                    <p className="text-xs">Memuat kalender...</p>
                  </div>
                ) : filteredCalendar.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-[32px] border border-dashed border-slate-200 text-slate-400">
                    Belum ada data kalender akademik untuk tahun ini.
                  </div>
                ) : (
                  filteredCalendar.map((item) => (
                    <div key={item.id_aktivitas} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex flex-col items-center justify-center text-indigo-600">
                            <span className="text-[10px] font-bold uppercase tracking-tighter">
                              {new Date(item.tanggalawal).toLocaleDateString('id-ID', { month: 'short' })}
                            </span>
                            <span className="text-lg font-black leading-none">
                              {new Date(item.tanggalawal).getDate()}
                            </span>
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 leading-tight">{item.kegiatan}</h4>
                            <p className="text-[10px] text-slate-400 font-medium">{item.nama_kalender} • {item.departemen}</p>
                          </div>
                        </div>
                        <div className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold">
                          {new Date(item.tanggalawal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                      </div>
                      {item.keterangan && (
                        <div 
                          className="text-xs text-slate-500 prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: item.keterangan }}
                        />
                      )}
                      {item.tanggalawal !== item.tanggalakhir && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider pt-1">
                          <Clock size={12} />
                          <span>Sampai: {new Date(item.tanggalakhir).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </motion.div>
            )}

            {activeTab === "schedule" && (
              <motion.div
                key="schedule-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">Jadwal Mengajar</h3>
                  <div className="relative">
                    <select
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(parseInt(e.target.value))}
                      className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold py-2 pl-4 pr-10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all w-full sm:w-auto"
                    >
                      <option value={1}>Senin</option>
                      <option value={2}>Selasa</option>
                      <option value={3}>Rabu</option>
                      <option value={4}>Kamis</option>
                      <option value={5}>Jumat</option>
                      <option value={6}>Sabtu</option>
                      <option value={7}>Minggu</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <Filter size={14} />
                    </div>
                  </div>
                </div>

                {loadingSchedule ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                    <Loader2 className="animate-spin" size={24} />
                    <p className="text-xs">Memuat jadwal...</p>
                  </div>
                ) : schedule.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-[32px] border border-dashed border-slate-200 text-slate-400">
                    Belum ada data jadwal mengajar.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const daySchedule = schedule.filter(s => s.hari === selectedDay);
                      if (daySchedule.length === 0) {
                        return (
                          <div className="p-8 text-center bg-white rounded-[32px] border border-dashed border-slate-200 text-slate-400">
                            Tidak ada jadwal mengajar untuk hari ini.
                          </div>
                        );
                      }
                      
                      return (
                        <div className="grid gap-3">
                          {daySchedule.sort((a, b) => a.jamke - b.jamke).map((item) => (
                            <div key={item.replid} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-teal-50 rounded-2xl flex flex-col items-center justify-center text-teal-600">
                                  <span className="text-[10px] font-bold uppercase tracking-tighter">Jam</span>
                                  <span className="text-lg font-black leading-none">{item.jamke}</span>
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-slate-900 leading-tight">{item.mata_pelajaran}</h4>
                                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Kelas {item.nama_kelas}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-bold text-slate-900">{item.jam_mulai.substring(0, 5)} - {item.jam_selesai.substring(0, 5)}</p>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">WIB</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "classSchedule" && (
              <motion.div
                key="class-schedule-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">Jadwal Kelas</h3>
                  <div className="relative">
                    <select
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(parseInt(e.target.value))}
                      className="appearance-none bg-white border border-slate-200 text-slate-700 text-xs font-bold py-2 pl-4 pr-10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all w-full sm:w-auto"
                    >
                      <option value={1}>Senin</option>
                      <option value={2}>Selasa</option>
                      <option value={3}>Rabu</option>
                      <option value={4}>Kamis</option>
                      <option value={5}>Jumat</option>
                      <option value={6}>Sabtu</option>
                      <option value={7}>Minggu</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <Filter size={14} />
                    </div>
                  </div>
                </div>

                {loadingClassSchedule ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                    <Loader2 className="animate-spin" size={24} />
                    <p className="text-xs">Memuat jadwal kelas...</p>
                  </div>
                ) : !classSchedule ? (
                  <div className="p-8 text-center bg-white rounded-[32px] border border-dashed border-slate-200 text-slate-400">
                    Belum ada data jadwal kelas.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const dayNames = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
                      const currentDayName = dayNames[selectedDay];
                      const daySchedule = classSchedule[currentDayName] || [];
                      
                      if (daySchedule.length === 0) {
                        return (
                          <div className="p-8 text-center bg-white rounded-[32px] border border-dashed border-slate-200 text-slate-400">
                            Tidak ada jadwal pelajaran untuk hari ini.
                          </div>
                        );
                      }
                      
                      return (
                        <div className="grid gap-3">
                          {daySchedule.sort((a, b) => a.jamke - b.jamke).map((item) => (
                            <div key={item.replid} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex flex-col items-center justify-center text-cyan-600">
                                  <span className="text-[10px] font-bold uppercase tracking-tighter">Jam</span>
                                  <span className="text-lg font-black leading-none">{item.jamke}</span>
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-slate-900 leading-tight">{item.mata_pelajaran}</h4>
                                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{item.nama_guru}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-bold text-slate-900">{item.jam_mulai.substring(0, 5)} - {item.jam_selesai.substring(0, 5)}</p>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">WIB</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "about" && (
              <motion.div
                key="about-content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-4 text-center">
                  <div className="w-20 h-20 bg-blue-600 rounded-[32px] flex items-center justify-center text-white mx-auto shadow-xl shadow-blue-500/20">
                    <Info size={40} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-slate-900">JIBAS Mobile</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Versi 2.4.0</p>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Aplikasi JIBAS Mobile adalah solusi terpadu untuk manajemen sekolah, memfasilitasi komunikasi antara sekolah, guru, siswa, dan orang tua secara real-time.
                  </p>
                </div>
                
                <div className="bg-blue-600 p-6 rounded-[32px] text-white space-y-3">
                  <h4 className="font-bold">Hubungi Kami</h4>
                  <p className="text-xs text-blue-100 leading-relaxed">Jika Anda mengalami kendala atau memiliki saran, silakan hubungi tim IT Support kami.</p>
                  <button className="w-full bg-white text-blue-600 font-bold py-3 rounded-2xl text-xs shadow-lg active:scale-95 transition-all">
                    Kirim Pesan Bantuan
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-lg bg-white rounded-t-[40px] sm:rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">
                  Tambah {activeTab === "news" ? "Berita" : activeTab === "events" ? "Agenda" : "Dokumen"}
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-10 h-10 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center active:scale-90 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAdd} className="p-6 pb-12 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Judul</label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Masukkan judul..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>

                {activeTab === "news" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Kategori</label>
                    <input
                      required
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="Contoh: Pengumuman, Prestasi..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                )}

                {activeTab === "events" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Tanggal</label>
                      <input
                        required
                        type="datetime-local"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Lokasi</label>
                      <input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Aula, Lapangan..."
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                )}

                {activeTab === "docs" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Nama File</label>
                      <input
                        required
                        value={fileUrl}
                        onChange={(e) => setFileUrl(e.target.value)}
                        placeholder="contoh: {nis}.pdf atau {nis}.jpg"
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                      <p className="text-[10px] text-slate-400">Gunakan <code>{'{nis}'}</code> untuk siswa, <code>{'{nopendaftaran}'}</code> untuk calon siswa, dan <code>{'{nip}'}</code> untuk pegawai saat membuat dokumen yang bergantung pada peran.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Tipe File</label>
                      <select
                        value={fileType}
                        onChange={(e) => setFileType(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      >
                        <option value="PDF">PDF</option>
                        <option value="DOCX">DOCX</option>
                        <option value="XLSX">XLSX</option>
                        <option value="ZIP">ZIP</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                    {activeTab === "news" ? "Isi Berita" : "Keterangan"}
                  </label>
                  <textarea
                    required
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={4}
                    placeholder="Tuliskan detail di sini..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                  />
                </div>

                <button
                  disabled={isSubmitting}
                  type="submit"
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                  Simpan Data
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Detail Modal */}
      <AnimatePresence>
        {selectedImage && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedImage(null)}
              className="absolute inset-0 bg-slate-900/90 backdrop-blur-md"
            />
            <motion.div
              layoutId={`gallery-${selectedImage.replid}`}
              className="relative w-full max-w-4xl bg-white rounded-[40px] overflow-hidden shadow-2xl"
            >
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-6 right-6 z-20 w-12 h-12 bg-white/10 backdrop-blur-md text-white rounded-2xl flex items-center justify-center active:scale-90 transition-all"
              >
                <X size={24} />
              </button>
              <div className="aspect-video w-full overflow-hidden bg-slate-100">
                <img 
                  src={selectedImage.photo_cover} 
                  alt={selectedImage.judul} 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="p-8 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold uppercase tracking-widest">
                    {selectedImage.departemen}
                  </span>
                  <span className="text-slate-400 text-xs font-medium flex items-center gap-2">
                    <Calendar size={14} /> {selectedImage.tgl_display}
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 leading-tight">{selectedImage.judul}</h3>
                <div className="flex items-center gap-3 pt-4 border-t border-slate-50">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <Tag size={20} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pengirim</p>
                    <p className="text-sm font-bold text-slate-900">{selectedImage.nama_pengirim}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
