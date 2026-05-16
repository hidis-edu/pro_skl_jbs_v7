export type UserLevel = 1 | 2 | 3 | 4; // 1: Landlord, 2: Pegawai, 3: Siswa, 4: Calon Siswa

export interface UserData {
  uid?: string;
  replid?: number;
  nis?: string;
  nip?: string;
  nopendaftaran?: string;
  nama: string;
  foto?: string | null;
  level: UserLevel;
  is_finance?: number;
  whatsapp_api_key?: string;
  [key: string]: any;
}

export interface SystemSettings {
  jibasApiUrl: string;
  whatsappGatewayUrl: string;
  whatsappApiKey: string;
  adminWhatsApp?: string;
  googleWorkspaceDomain?: string;
  updatedAt: any;
  updatedBy: string;
}

export interface LoginResponse {
  status?: string;
  success?: boolean;
  source?: string;
  data?: UserData;
  user?: UserData;
  message?: string;
}

export type LoginStatus = "siswa" | "calonsiswa" | "pegawai";

export interface FinanceInfo {
  saldo?: number;
  tabungan?: number;
  total_tagihan?: number;
  [key: string]: any;
}

export interface BillItem {
  id: string;
  nama: string;
  nominal: number;
  terbayar: number;
  sisa: number;
  rencana_cicilan?: number;
  jatuh_tempo?: string;
  kategori?: string;
  status?: "pending" | "waiting" | "verified";
}

export interface PaymentRequest {
  id: string;
  billId: string;
  billName: string;
  studentNis: string;
  studentName: string;
  amount: number;
  proofPhoto: string;
  status: "waiting" | "verified" | "rejected";
  createdAt: any;
  verifiedAt?: any;
  verifiedBy?: string;
}

export interface FinanceResponse {
  status: string;
  data: {
    info: FinanceInfo;
    tagihan: BillItem[];
  };
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  category: string;
  image?: string;
  createdAt: any;
  createdBy: string;
  authorName: string;
}

export interface AgendaItem {
  id: string;
  title: string;
  description: string;
  date: string; // ISO format
  location?: string;
  createdAt: any;
  createdBy: string;
  authorName: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  description?: string;
  fileUrl: string;
  fileType: string;
  createdAt: any;
  createdBy: string;
  authorName: string;
}

export interface CalendarEvent {
  id_kalender: number;
  nama_kalender: string;
  status_aktif: number;
  status_terlihat: number;
  idtahunajaran: number;
  departemen: string;
  id_aktivitas: number;
  tanggalawal: string;
  tanggalakhir: string;
  kegiatan: string;
  keterangan: string;
}

export interface TeacherSchedule {
  replid: number;
  hari: number;
  jamke: number;
  jam_mulai: string;
  jam_selesai: string;
  mata_pelajaran: string;
  nama_kelas: string;
  keterangan: string;
}

export interface ClassScheduleItem {
  replid: number;
  hari: number;
  jamke: number;
  jam_mulai: string;
  jam_selesai: string;
  mata_pelajaran: string;
  kode_pelajaran: string;
  nama_guru: string;
  keterangan: string;
}

export interface ClassScheduleData {
  [dayName: string]: ClassScheduleItem[];
}

export interface ChatMessage {
  replid: number;
  chatgroup: string;
  id_pengirim: string;
  pengirim?: string; // Keep for compatibility if needed
  pesan: string;
  waktu_kirim_asli: string;
  ts?: string; // Keep for compatibility
  gambar?: string;
  suara?: string;
  nama_pengirim?: string;
  foto_pengirim?: string;
}

export interface ChatGroup {
  idkelas: number;
  idgroup?: string; // For "Umum" or other custom groups
  nama_grup_chat: string;
  display_nama?: string;
  wali_kelas?: string;
  hp_wali?: string;
  tahunajaran?: string;
  pesan_terakhir?: string;
  waktu_pesan_terakhir?: string;
  total_pesan?: number;
}
