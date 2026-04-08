import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  UserPlus, 
  Settings, 
  Users, 
  Power, 
  Trash2, 
  Download, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Plus,
  ArrowRight,
  LogOut,
  FileUp,
  GraduationCap,
  Database,
  Search
} from "lucide-react";
import * as XLSX from "xlsx";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { db, auth } from "./firebase";
import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
  onSnapshot, query, writeBatch 
} from "firebase/firestore";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from "firebase/auth";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Student {
  id: string;
  number: string;
  name: string;
  timestamp: string;
}

interface AllowedStudent {
  number: string;
  name: string;
}

interface DB {
  registrationActive: boolean;
  allowedNumbers: { number: string; name: string }[];
  registeredStudents: Student[];
}

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [adminTab, setAdminTab] = useState<"registered" | "allowed">("registered");
  const [searchTerm, setSearchTerm] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: "", onConfirm: () => {} });
  
  const [dbState, setDbState] = useState<DB>({
    registrationActive: false,
    allowedNumbers: [],
    registeredStudents: []
  });
  const [loading, setLoading] = useState(false);
  const [newAllowed, setNewAllowed] = useState({ number: "", name: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });

    // Listen to registration status
    const unsubSettings = onSnapshot(doc(db, "settings", "registration"), (docSnap) => {
      if (docSnap.exists()) {
        setDbState(prev => ({ ...prev, registrationActive: docSnap.data().active }));
      } else {
        // Initialize if not exists
        setDoc(doc(db, "settings", "registration"), { active: false }).catch(console.error);
      }
    }, (error) => {
      console.error("Error fetching settings:", error);
    });

    return () => {
      unsubscribeAuth();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    let unsubAllowed: (() => void) | undefined;
    let unsubRegistered: (() => void) | undefined;

    if (isAdmin) {
      // Listen to allowed students
      unsubAllowed = onSnapshot(collection(db, "allowedStudents"), (snapshot) => {
        const allowed: AllowedStudent[] = [];
        snapshot.forEach(doc => {
          allowed.push(doc.data() as AllowedStudent);
        });
        setDbState(prev => ({ ...prev, allowedNumbers: allowed }));
      }, (error) => {
        console.error("Error fetching allowed students:", error);
      });

      // Listen to registered students
      unsubRegistered = onSnapshot(collection(db, "registeredStudents"), (snapshot) => {
        const registered: Student[] = [];
        snapshot.forEach(doc => {
          registered.push({ id: doc.id, ...doc.data() } as Student);
        });
        // Sort by timestamp descending client-side for simplicity
        registered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setDbState(prev => ({ ...prev, registeredStudents: registered }));
      }, (error) => {
        console.error("Error fetching registered students:", error);
      });
    } else {
      setDbState(prev => ({ ...prev, allowedNumbers: [], registeredStudents: [] }));
    }

    return () => {
      if (unsubAllowed) unsubAllowed();
      if (unsubRegistered) unsubRegistered();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleAdminLogin = async () => {
    if (user) {
      await signOut(auth);
      setIsAdmin(false);
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      setMessage({ type: "error", text: "فشل تسجيل الدخول: " + error.message });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (!dbState.registrationActive) {
        throw new Error("التسجيل مغلق حالياً");
      }

      // Check if student is allowed
      const allowedDoc = await getDoc(doc(db, "allowedStudents", studentNumber));
      if (!allowedDoc.exists()) {
        throw new Error("رقم الطالب غير موجود في قائمة المسموح لهم بالتسجيل");
      }

      const studentName = allowedDoc.data().name;

      // Check if already registered
      const q = query(collection(db, "registeredStudents"));
      const querySnapshot = await getDocs(q);
      const alreadyRegistered = querySnapshot.docs.some(d => d.data().number === studentNumber);
      
      if (alreadyRegistered) {
        throw new Error("لقد قمت بتسجيل حضورك مسبقاً");
      }

      // Register
      const newDocRef = doc(collection(db, "registeredStudents"));
      await setDoc(newDocRef, {
        number: studentNumber,
        name: studentName,
        timestamp: new Date().toISOString()
      });

      setMessage({ type: "success", text: `تم التسجيل بنجاح! أهلاً بك يا ${studentName}` });
      setStudentNumber("");
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "حدث خطأ أثناء التسجيل" });
    } finally {
      setLoading(false);
    }
  };

  const toggleRegistration = async () => {
    try {
      await updateDoc(doc(db, "settings", "registration"), {
        active: !dbState.registrationActive
      });
      setMessage({ 
        type: "success", 
        text: !dbState.registrationActive ? "تم فتح التسجيل بنجاح" : "تم إغلاق التسجيل" 
      });
    } catch (e: any) {
      setMessage({ type: "error", text: "فشل تغيير حالة التسجيل: " + e.message });
    }
  };

  const clearList = () => {
    setConfirmModal({
      isOpen: true,
      title: "هل أنت متأكد من حذف قائمة الطلاب المسجلين بالكامل؟",
      onConfirm: async () => {
        try {
          const snapshot = await getDocs(collection(db, "registeredStudents"));
          const batch = writeBatch(db);
          snapshot.docs.forEach((document) => {
            batch.delete(document.ref);
          });
          await batch.commit();
          setMessage({ type: "success", text: "تم تصفير قائمة الحضور بنجاح" });
        } catch (e: any) {
          setMessage({ type: "error", text: "فشل الحذف: " + e.message });
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const deleteAllowed = (number: string) => {
    setConfirmModal({
      isOpen: true,
      title: "هل أنت متأكد من حذف هذا الطالب من قاعدة البيانات؟",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "allowedStudents", number));
          setMessage({ type: "success", text: "تم حذف الطالب من قاعدة البيانات بنجاح" });
        } catch (e: any) {
          setMessage({ type: "error", text: "فشل الحذف: " + e.message });
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const deleteStudent = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "هل أنت متأكد من حذف هذا التسجيل؟",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "registeredStudents", id));
          setMessage({ type: "success", text: "تم حذف التسجيل بنجاح" });
        } catch (e: any) {
          setMessage({ type: "error", text: "فشل الحذف: " + e.message });
        }
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const addAllowed = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, "allowedStudents", newAllowed.number), {
        number: newAllowed.number,
        name: newAllowed.name
      });
      setMessage({ type: "success", text: `تمت إضافة الطالب ${newAllowed.name} بنجاح` });
      setNewAllowed({ number: "", name: "" });
    } catch (e: any) {
      setMessage({ type: "error", text: `فشل الإضافة: ${e.message}` });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        const students = jsonData.map(row => {
          const number = String(row["id"] || row["الرقم"] || row["number"] || row["رقم الطالب"] || "").trim();
          const firstName = String(row["Name"] || row["الاسم"] || row["name"] || row["اسم الطالب"] || "").trim();
          const lastName = String(row["Surname"] || row["اللقب"] || row["surname"] || "").trim();
          
          const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
          return { number, name: fullName };
        }).filter(s => s.number && s.name);

        if (students.length > 0) {
          const batches = [];
          let currentBatch = writeBatch(db);
          let opCount = 0;

          for (const student of students) {
            const docRef = doc(db, "allowedStudents", student.number);
            currentBatch.set(docRef, student);
            opCount++;

            if (opCount === 490) {
              batches.push(currentBatch.commit());
              currentBatch = writeBatch(db);
              opCount = 0;
            }
          }
          if (opCount > 0) {
            batches.push(currentBatch.commit());
          }

          await Promise.all(batches);
          setMessage({ type: "success", text: `تمت إضافة ${students.length} طالب بنجاح` });
        } else {
          setMessage({ type: "error", text: "لم يتم العثور على بيانات صالحة في الملف. تأكد من وجود أعمدة باسم 'id' و 'Name' و 'Surname'" });
        }
      } catch (err: any) {
        console.error("Excel processing error:", err);
        setMessage({ type: "error", text: "حدث خطأ أثناء معالجة ملف الإكسل. تأكد من أن الملف غير تالف." });
      }
    };
    reader.onerror = () => {
      setMessage({ type: "error", text: "فشل قراءة الملف." });
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(
      dbState.registeredStudents.map(s => ({
        "الاسم": s.name,
        "رقم الطالب": s.number,
        "وقت التسجيل": new Date(s.timestamp).toLocaleString("ar-DZ")
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "الطلاب المسجلين");
    XLSX.writeFile(workbook, "قائمة_الطلاب_المسجلين.xlsx");
  };

  // if (!db) return <div className="flex items-center justify-center h-screen font-sans">جاري التحميل...</div>;

  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-blue-100" dir="rtl">
      {/* Background Image Overlay */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <img 
          src="https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&q=80&w=1986" 
          alt="University Background" 
          className="w-full h-full object-cover opacity-70 scale-105"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/40 via-white/60 to-white/80"></div>
      </div>

      {/* Confirm Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full text-center space-y-6 border border-gray-100"
            >
              <div className="bg-red-50 w-16 h-16 rounded-2xl flex items-center justify-center text-red-600 mx-auto">
                <Trash2 size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-gray-900">تأكيد الحذف</h3>
                <p className="text-gray-500 font-medium leading-relaxed">
                  {confirmModal.title}
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={confirmModal.onConfirm}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black shadow-lg shadow-red-200 hover:bg-red-700 transition-all active:scale-95"
                >
                  تأكيد الحذف
                </button>
                <button 
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-black hover:bg-gray-200 transition-all active:scale-95"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Message Notification */}
      <AnimatePresence>
        {isAdmin && message && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 50, x: "-50%" }}
            className="fixed bottom-8 left-1/2 z-[110] w-full max-w-md px-4"
          >
            <div className={cn(
              "p-4 rounded-2xl shadow-2xl border flex items-center gap-4",
              message.type === "success" 
                ? "bg-green-50 border-green-100 text-green-800" 
                : "bg-red-50 border-red-100 text-red-800"
            )}>
              <div className={cn(
                "p-2 rounded-xl",
                message.type === "success" ? "bg-green-100" : "bg-red-100"
              )}>
                {message.type === "success" ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
              </div>
              <p className="font-bold flex-1">{message.text}</p>
              <button 
                onClick={() => setMessage(null)}
                className="text-current opacity-50 hover:opacity-100"
              >
                <XCircle size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-200">
            <GraduationCap size={28} />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900 leading-tight">جامعة المسيلة</h1>
            <p className="text-xs text-blue-600 font-bold">نظام تسجيل الحضور الرقمي</p>
          </div>
        </div>
        <button 
          onClick={handleAdminLogin}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-gray-200 hover:border-blue-300 hover:text-blue-600 transition-all text-sm font-bold text-gray-700 shadow-sm active:scale-95"
        >
          {isAdmin ? <LogOut size={18} /> : <Settings size={18} />}
          {isAdmin ? "تسجيل الخروج" : "لوحة التحكم"}
        </button>
      </header>

      <main className={cn("relative z-10 max-w-4xl mx-auto p-6", isAdmin ? "" : "flex items-center justify-center min-h-[calc(100vh-80px)]")}>
        <AnimatePresence mode="wait">
          {!isAdmin ? (
            <motion.div 
              key="student"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg"
            >
              <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-10 shadow-2xl border border-white/50 text-center space-y-8">
                <div className="space-y-3">
                  <div className="inline-flex p-3 bg-blue-50 rounded-2xl text-blue-600 mb-2">
                    <UserPlus size={32} />
                  </div>
                  <h2 className="text-4xl font-black text-gray-900 tracking-tight">تسجيل الحضور</h2>
                  <p className="text-gray-500 font-medium">أدخل رقم الطالب الخاص بك (عادةً 12 رقماً)</p>
                </div>

                {!dbState.registrationActive ? (
                  <div className="bg-amber-50/80 border border-amber-200 p-8 rounded-2xl flex flex-col items-center gap-4">
                    <div className="bg-amber-100 p-3 rounded-full">
                      <AlertCircle className="text-amber-600" size={40} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-amber-900 font-black text-xl">التسجيل مغلق حالياً</p>
                      <p className="text-amber-700 font-medium">سيتم تفعيل النظام قريباً من قبل الإدارة</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleRegister} className="space-y-5">
                    <div className="relative group">
                      <input 
                        type="text"
                        value={studentNumber}
                        onChange={(e) => setStudentNumber(e.target.value.replace(/\D/g, ""))}
                        placeholder="رقم الطالب"
                        className="w-full px-6 py-5 text-3xl tracking-[0.1em] text-center border-2 border-gray-100 bg-gray-50/50 rounded-2xl focus:border-blue-500 focus:bg-white focus:ring-8 focus:ring-blue-50 outline-none transition-all font-mono font-bold placeholder:opacity-30"
                        required
                      />
                    </div>
                    <button 
                      disabled={loading || studentNumber.length < 8}
                      className={cn(
                        "w-full py-5 rounded-2xl font-black text-xl transition-all flex items-center justify-center gap-3 shadow-xl",
                        loading || studentNumber.length < 8 
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none" 
                          : "bg-blue-600 text-white hover:bg-blue-700 hover:-translate-y-1 shadow-blue-200 active:translate-y-0"
                      )}
                    >
                      {loading ? "جاري التحقق..." : "تأكيد الحضور"}
                      {!loading && <ArrowRight size={24} />}
                    </button>
                  </form>
                )}

                {message && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "p-5 rounded-2xl flex items-center gap-4 text-right border-2",
                      message.type === "success" 
                        ? "bg-green-50 text-green-800 border-green-100" 
                        : "bg-red-50 text-red-800 border-red-100"
                    )}
                  >
                    <div className={cn("p-2 rounded-full", message.type === "success" ? "bg-green-100" : "bg-red-100")}>
                      {message.type === "success" ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                    </div>
                    <p className="font-bold text-lg leading-relaxed">{message.text}</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Stats & Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-3">
                  <span className="text-gray-400 text-xs font-black uppercase tracking-wider">حالة النظام</span>
                  <div className="flex items-center justify-between">
                    <span className={cn("font-black text-xl", dbState.registrationActive ? "text-green-600" : "text-red-600")}>
                      {dbState.registrationActive ? "التسجيل مفتوح" : "التسجيل مغلق"}
                    </span>
                    <button 
                      onClick={toggleRegistration}
                      className={cn(
                        "p-3 rounded-xl transition-all shadow-sm active:scale-90",
                        dbState.registrationActive ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-green-50 text-green-600 hover:bg-green-100"
                      )}
                    >
                      <Power size={24} />
                    </button>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-3">
                  <span className="text-gray-400 text-xs font-black uppercase tracking-wider">إجمالي الحضور</span>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-3xl text-gray-900">{dbState.registeredStudents.length}</span>
                    <div className="bg-blue-50 p-3 rounded-xl text-blue-600">
                      <Users size={24} />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-3">
                  <span className="text-gray-400 text-xs font-black uppercase tracking-wider">التحكم بالبيانات</span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={exportToExcel}
                      className="flex-1 bg-gray-900 text-white p-3 rounded-xl hover:bg-gray-800 transition-all flex items-center justify-center gap-2 text-sm font-black shadow-lg shadow-gray-200"
                    >
                      <Download size={18} />
                      تصدير Excel
                    </button>
                    <button 
                      onClick={clearList}
                      className="bg-red-50 text-red-600 p-3 rounded-xl hover:bg-red-100 transition-all shadow-sm"
                      title="تصفير القائمة"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Add Allowed Student & Bulk Upload */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-5">
                  <h3 className="font-black text-gray-900 flex items-center gap-2 text-lg">
                    <Plus size={20} className="text-blue-600" />
                    إضافة طالب منفرد
                  </h3>
                  <form onSubmit={addAllowed} className="space-y-3">
                    <input 
                      type="text"
                      placeholder="رقم الطالب (8 أرقام على الأقل)"
                      value={newAllowed.number}
                      onChange={(e) => setNewAllowed({ ...newAllowed, number: e.target.value.replace(/\D/g, "") })}
                      className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-all font-bold"
                      required
                    />
                    <input 
                      type="text"
                      placeholder="اسم الطالب الكامل"
                      value={newAllowed.name}
                      onChange={(e) => setNewAllowed({ ...newAllowed, name: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-100 bg-gray-50 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-all font-bold"
                      required
                    />
                    <button className="w-full bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700 transition-all font-black shadow-lg shadow-blue-100">
                      إضافة للقائمة
                    </button>
                  </form>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between space-y-5">
                  <div className="space-y-2">
                    <h3 className="font-black text-gray-900 flex items-center gap-2 text-lg">
                      <FileUp size={20} className="text-green-600" />
                      رفع قائمة إكسل (Bulk)
                    </h3>
                    <p className="text-sm text-gray-500 font-medium">ارفع ملف Excel يحتوي على أعمدة "id" و "Name" و "Surname" لإضافة مجموعة طلاب دفعة واحدة.</p>
                  </div>
                  
                  <div className="relative">
                    <input 
                      type="file"
                      accept=".xlsx, .xls"
                      onChange={handleFileUpload}
                      ref={fileInputRef}
                      className="hidden"
                      id="excel-upload"
                    />
                    <label 
                      htmlFor="excel-upload"
                      className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-green-400 hover:bg-green-50 transition-all group"
                    >
                      <div className="bg-green-100 p-3 rounded-full text-green-600 group-hover:scale-110 transition-transform">
                        <FileUp size={32} />
                      </div>
                      <span className="font-black text-green-700">اختر ملف الإكسل</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Tabs for Lists */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex bg-gray-200 p-1.5 rounded-2xl w-full md:w-auto shadow-inner">
                    <button 
                      onClick={() => setAdminTab("registered")}
                      className={cn(
                        "flex-1 md:flex-none px-8 py-2.5 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2",
                        adminTab === "registered" ? "bg-white text-blue-600 shadow-md scale-105" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      <Users size={18} />
                      سجل الحضور ({dbState.registeredStudents.length || 0})
                    </button>
                    <button 
                      onClick={() => setAdminTab("allowed")}
                      className={cn(
                        "flex-1 md:flex-none px-8 py-2.5 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2",
                        adminTab === "allowed" ? "bg-white text-blue-600 shadow-md scale-105" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      <Database size={18} />
                      قاعدة البيانات ({dbState.allowedNumbers.length || 0})
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="text"
                        placeholder="بحث عن طالب..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pr-10 pl-4 py-2 bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-500 transition-all text-sm font-bold"
                      />
                    </div>
                    <div className="hidden md:flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
                      <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                      تحديث تلقائي
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {adminTab === "registered" ? (
                    <table className="w-full text-right">
                      <thead>
                        <tr className="text-gray-400 text-xs font-black uppercase tracking-wider border-b border-gray-50">
                          <th className="px-6 py-4 font-black">اسم الطالب</th>
                          <th className="px-6 py-4 font-black">الرقم الجامعي</th>
                          <th className="px-6 py-4 font-black">وقت التسجيل</th>
                          <th className="px-6 py-4 font-black text-center">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {dbState.registeredStudents.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-16 text-center text-gray-400 italic font-medium">
                              لا توجد تسجيلات حتى اللحظة.. بانتظار الطلاب
                            </td>
                          </tr>
                        ) : (
                          dbState.registeredStudents
                            .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.number.includes(searchTerm))
                            .map((student) => (
                            <motion.tr 
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              key={student.id} 
                              className="hover:bg-blue-50/30 transition-colors group"
                            >
                              <td className="px-6 py-4 font-bold text-gray-900">{student.name}</td>
                              <td className="px-6 py-4 text-gray-600 font-mono font-bold">{student.number}</td>
                              <td className="px-6 py-4 text-gray-500 text-sm font-medium">
                                {new Date(student.timestamp).toLocaleTimeString("ar-DZ")}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <button 
                                  onClick={() => deleteStudent(student.id)}
                                  className="text-gray-300 hover:text-red-600 p-2 transition-all hover:bg-red-50 rounded-lg"
                                  title="حذف التسجيل"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </td>
                            </motion.tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-right">
                      <thead>
                        <tr className="text-gray-400 text-xs font-black uppercase tracking-wider border-b border-gray-50">
                          <th className="px-6 py-4 font-black">اسم الطالب</th>
                          <th className="px-6 py-4 font-black">الرقم الجامعي</th>
                          <th className="px-6 py-4 font-black text-center">الحالة</th>
                          <th className="px-6 py-4 font-black text-center">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {dbState.allowedNumbers.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-16 text-center text-gray-400 italic font-medium">
                              قاعدة البيانات فارغة.. أضف طلاباً للبدء
                            </td>
                          </tr>
                        ) : (
                          dbState.allowedNumbers
                            .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.number.includes(searchTerm))
                            .slice(0, 500).map((student, idx) => {
                            const isRegistered = dbState.registeredStudents.some(s => s.number === student.number);
                            return (
                              <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                                <td className="px-6 py-4 font-bold text-gray-900">{student.name}</td>
                                <td className="px-6 py-4 text-gray-600 font-mono font-bold">{student.number}</td>
                                <td className="px-6 py-4 text-center">
                                  {isRegistered ? (
                                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-black">حاضر</span>
                                  ) : (
                                    <span className="bg-gray-100 text-gray-400 px-3 py-1 rounded-full text-xs font-black">غائب</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <button 
                                    onClick={() => deleteAllowed(student.number)}
                                    className="text-gray-200 hover:text-red-600 p-2 transition-all hover:bg-red-50 rounded-lg"
                                    title="حذف من قاعدة البيانات"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                        {dbState.allowedNumbers.length > 500 && (
                          <tr>
                            <td colSpan={4} className="px-6 py-4 text-center text-gray-400 text-sm font-medium bg-gray-50">
                              يتم عرض أول 500 طالب فقط من أصل {dbState.allowedNumbers.length}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

