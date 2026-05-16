import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, School, Loader2, ExternalLink, RefreshCw, AlertCircle, LogIn } from "lucide-react";
import { UserData } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ClassroomScreenProps {
  user: UserData;
  onBack: () => void;
  refresh?: number;
}

interface Course {
  id: string;
  name: string;
  section?: string;
  descriptionHeading?: string;
  alternateLink: string;
  courseState: string;
}

export default function ClassroomScreen({ user, onBack, refresh }: ClassroomScreenProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    checkConnection();
  }, [refresh]);

  const checkConnection = () => {
    const tokens = localStorage.getItem('google_tokens');
    if (tokens) {
      setIsConnected(true);
      fetchCourses(JSON.parse(tokens).access_token);
    } else {
      setIsConnected(false);
    }
  };

  const handleConnect = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      if (!response.ok) throw new Error('Gagal mendapatkan URL autentikasi');
      const { url } = await response.json();
      
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      
      window.open(
        url,
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghubungkan ke Google");
    }
  };

  const fetchCourses = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('https://classroom.googleapis.com/v1/courses', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 401) {
        // Token expired
        localStorage.removeItem('google_tokens');
        setIsConnected(false);
        return;
      }

      if (response.status === 403) {
        setError("Akses ditolak (403). Pastikan 'Google Classroom API' sudah diaktifkan di Google Cloud Console dan akun Anda memiliki izin.");
        return;
      }

      if (!response.ok) throw new Error('Gagal memuat Classroom');
      
      const data = await response.json();
      setCourses(data.courses || []);
    } catch (err) {
      console.error(err);
      setError("Gagal memuat data Google Classroom");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-4 py-4 flex items-center gap-3 shrink-0 z-10">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ChevronLeft size={24} className="text-slate-600" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-900 leading-tight">Google Classroom</h2>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
            Workspace for Education
          </p>
        </div>
        {isConnected && (
          <button 
            onClick={() => {
              const tokens = localStorage.getItem('google_tokens');
              if (tokens) fetchCourses(JSON.parse(tokens).access_token);
            }}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
            disabled={loading}
          >
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 px-6">
            <div className="w-20 h-20 bg-green-50 rounded-[32px] flex items-center justify-center text-green-600 shadow-inner">
              <School size={40} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Hubungkan Classroom</h3>
              <p className="text-sm text-slate-500 mt-2">
                Masuk dengan akun Google Workspace sekolah untuk melihat kelas dan tugas Anda.
              </p>
            </div>
            <button 
              onClick={handleConnect}
              className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 flex items-center justify-center gap-3 hover:bg-blue-700 transition-all active:scale-95"
            >
              <LogIn size={20} />
              Hubungkan Akun Google
            </button>
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
              Wajib menggunakan akun resmi:<br/>
              @guru.hidis.id, @siswa.hidis.id, @sdi.hidis.id, atau @sdihidayatulislamiyah.sch.id
            </p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-full py-12">
            <Loader2 size={32} className="text-blue-600 animate-spin mb-4" />
            <p className="text-sm text-slate-500 font-medium">Memuat kelas...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto">
              <AlertCircle size={24} />
            </div>
            <p className="text-sm text-red-600 font-medium">{error}</p>
            <button 
              onClick={() => {
                const tokens = localStorage.getItem('google_tokens');
                if (tokens) fetchCourses(JSON.parse(tokens).access_token);
              }}
              className="text-sm font-bold text-red-700 underline"
            >
              Coba Lagi
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto">
              <School size={32} />
            </div>
            <p className="text-slate-500 font-medium">Tidak ada kelas yang ditemukan</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {courses.map((course) => (
              <motion.a
                key={course.id}
                href={course.alternateLink}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {course.name}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium">
                      {course.section || "No Section"}
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-xl text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                    <ExternalLink size={16} />
                  </div>
                </div>
                {course.descriptionHeading && (
                  <p className="text-[10px] text-slate-400 mt-3 line-clamp-2">
                    {course.descriptionHeading}
                  </p>
                )}
                <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                  <span className={cn(
                    "text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md",
                    course.courseState === "ACTIVE" ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-500"
                  )}>
                    {course.courseState}
                  </span>
                  <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1">
                    Buka di Classroom <ChevronLeft size={12} className="rotate-180" />
                  </span>
                </div>
              </motion.a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
