export interface ClassInfo {
  idkelas: number;
  nama_kelas: string;
  wali_kelas: string;
  hp_wali: string;
}

export const CLASSES_DATA: ClassInfo[] = [
  {
    "idkelas": 188,
    "nama_kelas": "1A",
    "wali_kelas": "AMIRUN NISA",
    "hp_wali": "087878562830"
  },
  {
    "idkelas": 189,
    "nama_kelas": "1B",
    "wali_kelas": "IKA RAKHMAWATI",
    "hp_wali": "085817586840"
  },
  {
    "idkelas": 198,
    "nama_kelas": "2A",
    "wali_kelas": "ERNAWATI",
    "hp_wali": "085771619271"
  },
  {
    "idkelas": 199,
    "nama_kelas": "2B",
    "wali_kelas": "MARDIAH",
    "hp_wali": "089685314275"
  },
  {
    "idkelas": 196,
    "nama_kelas": "3A",
    "wali_kelas": "SYARIFAH NURJANAH",
    "hp_wali": "085716432910"
  },
  {
    "idkelas": 197,
    "nama_kelas": "3B",
    "wali_kelas": "ARIYAH",
    "hp_wali": "089650530215"
  },
  {
    "idkelas": 194,
    "nama_kelas": "4A",
    "wali_kelas": "SABA",
    "hp_wali": "08567672837"
  },
  {
    "idkelas": 195,
    "nama_kelas": "4B",
    "wali_kelas": "HERI KISWANTO",
    "hp_wali": "081513864491"
  },
  {
    "idkelas": 192,
    "nama_kelas": "5A",
    "wali_kelas": "SITI JUARIYAH",
    "hp_wali": "085287932381"
  },
  {
    "idkelas": 193,
    "nama_kelas": "5B",
    "wali_kelas": "DESI ARYANI",
    "hp_wali": "085899404504"
  },
  {
    "idkelas": 190,
    "nama_kelas": "6A",
    "wali_kelas": "ERWIN OKI FAUZI",
    "hp_wali": "085959719450"
  },
  {
    "idkelas": 191,
    "nama_kelas": "6B",
    "wali_kelas": "FANNY FAJRIAH",
    "hp_wali": "089627901411"
  },
  {
    "idkelas": 200,
    "nama_kelas": "AMES",
    "wali_kelas": "ERWIN OKI FAUZI",
    "hp_wali": "085959719450"
  }
];

export const getClassById = (id: number | string): ClassInfo | undefined => {
  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
  return CLASSES_DATA.find(c => c.idkelas === numericId);
};
