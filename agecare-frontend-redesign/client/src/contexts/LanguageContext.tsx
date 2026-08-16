import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "en" | "ar" | "es";

export const supportedLanguages: readonly Language[] = ["en", "ar", "es"];

export function resolveInitialLanguage(search: string, stored: string | null): Language {
  const requested = new URLSearchParams(search).get("lang");
  if (supportedLanguages.includes(requested as Language)) return requested as Language;
  return supportedLanguages.includes(stored as Language) ? stored as Language : "en";
}

type TranslationKey = keyof typeof translations.en;

const translations = {
  en: {
    language: "Language",
    english: "English",
    arabic: "Arabic",
    spanish: "Spanish",
    today: "Today",
    myCare: "My care",
    together: "Together",
    dayAtAGlance: "Day at a glance",
    dailyCheckin: "Daily check-in",
    medications: "Medications",
    appointments: "Appointments",
    vitalSigns: "Vital signs",
    careChat: "Care chat",
    familyCircle: "Family circle",
    linkPatient: "Link a patient",
    careHistory: "Care history",
    primaryNavigation: "Primary navigation",
    dailyCompanion: "Your daily companion",
    yourCareSpace: "Your care space",
    connected: "AgeCare connected",
    privateAndPersonal: "Private and personal",
    accountConnection: "Account connection",
    connectAgeCare: "Connect AgeCare",
    disconnect: "Disconnect",
    signIn: "Sign in",
    createAccount: "Create account",
    existingAccount: "Existing account",
    newAccount: "New account",
    connectTitle: "Connect to AgeCare.",
    registerTitle: "Create your AgeCare account.",
    signInCopy: "Use the email and password from your original AgeCare app. We use this only to load your own services.",
    registerCopy: "Create an account to begin keeping your own private care records.",
    fullName: "Full name",
    email: "Email",
    password: "Password",
    confirmPassword: "Confirm password",
    connectMyAccount: "Connect my account",
    creatingAccount: "Creating account",
    connecting: "Connecting",
    alreadyHaveAccount: "Already have an account? Sign in",
    newToAgeCare: "New to AgeCare? Create an account",
    passwordTooShort: "Use a password with at least 6 characters.",
    passwordsDoNotMatch: "The passwords do not match.",
    closeAccountAccess: "Close account access",
  },
  ar: {
    language: "اللغة",
    english: "English",
    arabic: "العربية",
    spanish: "Español",
    today: "اليوم",
    myCare: "رعايتي",
    together: "معاً",
    dayAtAGlance: "نظرة على اليوم",
    dailyCheckin: "متابعة يومية",
    medications: "الأدوية",
    appointments: "المواعيد",
    vitalSigns: "العلامات الحيوية",
    careChat: "محادثة الرعاية",
    familyCircle: "دائرة العائلة",
    linkPatient: "ربط مريض",
    careHistory: "سجل الرعاية",
    primaryNavigation: "التنقل الرئيسي",
    dailyCompanion: "رفيقك اليومي",
    yourCareSpace: "مساحة رعايتك",
    connected: "تم الاتصال بـ AgeCare",
    privateAndPersonal: "خاص وشخصي",
    accountConnection: "اتصال الحساب",
    connectAgeCare: "الاتصال بـ AgeCare",
    disconnect: "قطع الاتصال",
    signIn: "تسجيل الدخول",
    createAccount: "إنشاء حساب",
    existingAccount: "حساب موجود",
    newAccount: "حساب جديد",
    connectTitle: "الاتصال بـ AgeCare.",
    registerTitle: "أنشئ حساب AgeCare الخاص بك.",
    signInCopy: "استخدم البريد الإلكتروني وكلمة المرور من تطبيق AgeCare الأصلي. نستخدمهما فقط لتحميل خدماتك الخاصة.",
    registerCopy: "أنشئ حساباً لبدء الاحتفاظ بسجلات رعايتك الخاصة.",
    fullName: "الاسم الكامل",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    confirmPassword: "تأكيد كلمة المرور",
    connectMyAccount: "اتصال بحسابي",
    creatingAccount: "جارٍ إنشاء الحساب",
    connecting: "جارٍ الاتصال",
    alreadyHaveAccount: "لديك حساب بالفعل؟ سجّل الدخول",
    newToAgeCare: "جديد في AgeCare؟ أنشئ حساباً",
    passwordTooShort: "استخدم كلمة مرور من 6 أحرف على الأقل.",
    passwordsDoNotMatch: "كلمتا المرور غير متطابقتين.",
    closeAccountAccess: "إغلاق الوصول إلى الحساب",
  },
  es: {
    language: "Idioma",
    english: "English",
    arabic: "العربية",
    spanish: "Español",
    today: "Hoy",
    myCare: "Mi cuidado",
    together: "Juntos",
    dayAtAGlance: "Resumen del día",
    dailyCheckin: "Registro diario",
    medications: "Medicamentos",
    appointments: "Citas",
    vitalSigns: "Signos vitales",
    careChat: "Chat de cuidado",
    familyCircle: "Círculo familiar",
    linkPatient: "Vincular a un paciente",
    careHistory: "Historial de cuidado",
    primaryNavigation: "Navegación principal",
    dailyCompanion: "Tu acompañante diario",
    yourCareSpace: "Tu espacio de cuidado",
    connected: "AgeCare conectado",
    privateAndPersonal: "Privado y personal",
    accountConnection: "Conexión de cuenta",
    connectAgeCare: "Conectar AgeCare",
    disconnect: "Desconectar",
    signIn: "Iniciar sesión",
    createAccount: "Crear cuenta",
    existingAccount: "Cuenta existente",
    newAccount: "Cuenta nueva",
    connectTitle: "Conéctate a AgeCare.",
    registerTitle: "Crea tu cuenta de AgeCare.",
    signInCopy: "Usa el correo y la contraseña de tu aplicación AgeCare original. Solo los usamos para cargar tus propios servicios.",
    registerCopy: "Crea una cuenta para comenzar a guardar tus propios registros privados de cuidado.",
    fullName: "Nombre completo",
    email: "Correo electrónico",
    password: "Contraseña",
    confirmPassword: "Confirmar contraseña",
    connectMyAccount: "Conectar mi cuenta",
    creatingAccount: "Creando cuenta",
    connecting: "Conectando",
    alreadyHaveAccount: "¿Ya tienes una cuenta? Inicia sesión",
    newToAgeCare: "¿Eres nuevo en AgeCare? Crea una cuenta",
    passwordTooShort: "Usa una contraseña de al menos 6 caracteres.",
    passwordsDoNotMatch: "Las contraseñas no coinciden.",
    closeAccountAccess: "Cerrar acceso a la cuenta",
  },
} as const;

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  direction: "ltr" | "rtl";
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    return resolveInitialLanguage(window.location.search, window.localStorage.getItem("agecare-language"));
  });
  const direction: "ltr" | "rtl" = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    window.localStorage.setItem("agecare-language", language);
  }, [direction, language]);

  const value = useMemo(() => ({ language, setLanguage, direction, t: (key: TranslationKey) => translations[language][key] }), [direction, language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
