import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, getApiErrorMessage, readApiResponseData } from "../lib/api.js";
import { LOGOUT_FLAG_KEY } from "../lib/auth-flags.js";
import { normalizeProfile } from "../lib/formatters.js";
import { loadProfilePage } from "../lib/load-profile-page.js";
import { fetchPublicSiteContent } from "../lib/site-content.js";
import "../css/layout/profile-layout.css";
import ProfileSideMenu from "./profile/ProfileSideMenu.jsx";
import { useProfileAccess } from "./profile/useProfileAccess.js";

const HOME_LANGUAGE_KEY = "aaron_home_language";
const TEAM_ITEMS_PER_PAGE = 4;

const HOME_I18N = {
  uz: {
    brandSubtitle: "Korreksion rivojlantirish markazi",
    seo: {
      title: "Aaron Academy Kids | Autism terapiya va korreksion markaz Toshkent",
      description: "Aaron Academy Kids - Toshkentdagi autism spektrli bolalar uchun korreksion rivojlantirish markazi. ABA terapiya, logoped, sensor integratsiya va individual dasturlar.",
      keywords: "autism, autizm, autizm terapiya Toshkent, ABA terapiya, logoped Toshkent, sensor integratsiya, Aaron Academy Kids, korreksion markaz"
    },
    navLinks: [
      { href: "#about", label: "Biz haqimizda" },
      { href: "#services", label: "Xizmatlar" },
      { href: "#kids", label: "Bolalar ijodi" },
      { href: "#signup", label: "Online yozilish" },
      { href: "#partners", label: "Hamkorlar" },
      { href: "#contact", label: "Aloqa" }
    ],
    actions: {
      login: "Kirish",
      onlineSignup: "Online yozilish",
      details: "Batafsil ma'lumot",
      submit: "Yozilish",
      openMap: "Xaritada ochish",
      nextLanguage: "RU"
    },
    hero: {
      badge: "Autizm spektrli bolalar uchun",
      title: "Har bir bolaning imkoniyati cheksiz",
      text: "Aaron Academy Kids - autizmga chalingan bolalarga individual terapiya, tarbiya va rivojlanish dasturlari orqali yordam beradigan zamonaviy markaz.",
      chips: ["ABA terapiya", "Sensor integratsiya", "Logoped"],
      consultTitle: "Bepul konsultatsiya",
      consultText: "Birinchi uchrashuv har bir oila uchun bepul. Mutaxassislarimiz bilan tanishib chiqing."
    },
    stats: [
      { value: "5+", label: "Yillik tajriba" },
      { value: "200+", label: "Bolalar yordam oldi" },
      { value: "12+", label: "Malakali mutaxassis" },
      { value: "12", label: "Terapiya turlari" }
    ],
    about: {
      title: "Biz haqimizda",
      text: "Aaron Academy Kids - Toshkent shahridagi zamonaviy korreksion markaz. Biz autizm spektrli va rivojlanish xususiyatlariga ega bolalar bilan ishlaydigan malakali mutaxassislar jamoasimiz.",
      quote: "\"Har bir bola - alohida olam. Bizning vazifamiz - bu olamga yo'l topish.\"",
      cards: [
        { key: "heart", icon: "heart", title: "Individual yondashuv", text: "Har bir bola uchun shaxsiy dastur tuzamiz." },
        { key: "team", icon: "users", title: "Malakali mutaxassislar", text: "Defektolog, psixolog, logoped va nevrolog." },
        { key: "modern", icon: "sparkles", title: "Zamonaviy uslublar", text: "ABA, sensor integratsiya va o'yin terapiyasi." },
        { key: "support", icon: "check", title: "Ota-onalarga yordam", text: "Maslahat va tarbiya bo'yicha qo'llanmalar." }
      ]
    },
    services: {
      kicker: "Xizmatlar",
      title: "Xizmatlarimiz",
      text: "Markazimizda autizm spektrli bolalar uchun zamonaviy terapiya va rivojlantirish dasturlari",
      items: [
        { key: "logoped", icon: "message", title: "Logoped", text: "Nutq nuqsonlarini bartaraf etish va nutqni rivojlantirish mashg'ulotlari." },
        { key: "clay", icon: "layers", title: "Sopolchilik (loy) terapiyasi", text: "Loy bilan ishlash orqali mayda motorika va ijodkorlikni rivojlantirish." },
        { key: "logoritmika", icon: "note", title: "Logoritmika", text: "Nutq, musiqa va harakatni birlashtirgan kompleks mashg'ulotlar." },
        { key: "music", icon: "music", title: "Musiqa terapiyasi", text: "Musiqa orqali emotsional muvozanat va kommunikatsiyani rivojlantirish." },
        { key: "art", icon: "brush", title: "ART terapiya", text: "San'at va ijod orqali emotsional rivojlanishni qo'llab-quvvatlash." },
        { key: "aba", icon: "check", title: "ABA terapiya", text: "Xulq-atvor, muloqot va kundalik ko'nikmalarni bosqichma-bosqich shakllantirish." },
        { key: "neuropsychology", icon: "sparkles", title: "Neyropsixologiya", text: "Diqqat, xotira, tafakkur va o'zini boshqarish ko'nikmalarini rivojlantirish." },
        { key: "sbo", icon: "users", title: "Ijtimoiy-maishiy moslashuv", text: "Bolani kundalik hayot, muloqot va mustaqillik ko'nikmalariga o'rgatish." },
        { key: "barocamera", icon: "check", title: "Barokamera", text: "Mutaxassis nazoratida kislorod bilan qo'llab-quvvatlovchi sog'lomlashtirish seanslari." },
        { key: "massage", icon: "heart", title: "Massaj", text: "Mushak tonusi, harakat faolligi va umumiy holatni qo'llab-quvvatlash." },
        { key: "hydrotherapy", icon: "layers", title: "Gidroterapiya", text: "Suv muhitida harakat, koordinatsiya va sezgi integratsiyasini rivojlantirish." },
        { key: "hippotherapy", icon: "sparkles", title: "Ippoterapiya", text: "Ot bilan terapiya orqali muvozanat, ishonch va harakat ko'nikmalarini rivojlantirish." }
      ]
    },
    gallery: {
      kicker: "Galereya",
      title: "Bolalarimiz ijodi",
      text: "Har bir asar - bolaning ichki dunyosining ifodasi",
      empty: "Hozircha asarlar yo'q",
      errors: {
        image: "Rasm tanlang.",
        author: "Muallif ismini kiriting.",
        description: "Qisqa ta'rif kiriting."
      }
    },
    team: {
      kicker: "Jamoa",
      title: "Bizning mutaxassislar",
      text: "Tajribali va malakali jamoa",
      empty: "Hozircha mutaxassislar ro'yxati yo'q"
    },
    cta: {
      kicker: "Birinchi qadam",
      title: "Bolangizning rivojlanishi - bizning eng muhim vazifamiz",
      text: "Bepul konsultatsiyaga yoziling. Mutaxassislarimiz har bir bola uchun individual dasturni tuzib beradi."
    },
    signup: {
      kicker: "Yozilish",
      title: "Online yozilish",
      text: "Formani to'ldiring, biz siz bilan bog'lanamiz",
      fullName: "F.I.SH.",
      phone: "Telefon raqam",
      phonePlaceholder: "+998...",
      errors: {
        fullName: "F.I.SH. kamida 3 ta belgidan iborat bo'lishi kerak.",
        phone: "Telefon raqamni to'liq kiriting."
      }
    },
    partners: {
      kicker: "Hamkorlar",
      title: "Hamkorlarimiz",
      text: "Birgalikda yaxshiroq natijalar uchun",
      empty: "Hozircha hamkorlar yo'q"
    },
    contact: {
      kicker: "Aloqa",
      title: "Biz bilan bog'laning",
      footerTitle: "Biz bilan bog'laning",
      items: [
        { key: "address", icon: "pin", label: "Manzil", value: "Toshkent sh., Mirzo Ulug'bek tumani, Buyuk Ipak Yo'li 5A" },
        { key: "phone", icon: "phone", label: "Telefon", value: "+998 95 455 00 33", href: "tel:+998954550033" },
        { key: "email", icon: "mail", label: "Email", value: "AARON.AAK.012@gmail.com", href: "mailto:AARON.AAK.012@gmail.com" },
        { key: "hours", icon: "clock", label: "Ish vaqti", value: "Dushanba - Juma: 09:00 - 18:00" }
      ]
    },
    footer: {
      text: "Toshkentdagi zamonaviy korreksion rivojlantirish markazi. Autizm spektrli bolalarga individual yondashuv asosida malakali yordam beramiz.",
      follow: "Bizni kuzatib boring",
      home: "Bosh sahifa",
      services: "Xizmatlar"
    }
  },
  ru: {
    brandSubtitle: "КОРРЕКЦИОННЫЙ ЦЕНТР ДЛЯ ДЕТЕЙ",
    seo: {
      title: "Aaron Academy Kids | Центр терапии аутизма в Ташкенте",
      description: "Aaron Academy Kids - коррекционный центр для детей с аутизмом в Ташкенте. ABA терапия, логопед, сенсорная интеграция и индивидуальные программы развития.",
      keywords: "autism, аутизм, терапия аутизма Ташкент, ABA терапия, логопед Ташкент, сенсорная интеграция, Aaron Academy Kids, коррекционный центр"
    },
    navLinks: [
      { href: "#about", label: "О нас" },
      { href: "#services", label: "Услуги" },
      { href: "#kids", label: "Творчество детей" },
      { href: "#signup", label: "Онлайн запись" },
      { href: "#partners", label: "Партнеры" },
      { href: "#contact", label: "Контакты" }
    ],
    actions: {
      login: "Войти",
      onlineSignup: "Онлайн запись",
      details: "Подробнее",
      submit: "Записаться",
      openMap: "Открыть карту",
      nextLanguage: "UZ"
    },
    hero: {
      badge: "Для детей с расстройствами аутистического спектра",
      title: "Возможности каждого ребенка безграничны",
      text: "Aaron Academy Kids - современный центр, где детям с аутизмом помогают через индивидуальную терапию, воспитание и развивающие программы.",
      chips: ["ABA терапия", "Сенсорная интеграция", "Логопед"],
      consultTitle: "Бесплатная консультация",
      consultText: "Первая встреча бесплатна для каждой семьи. Познакомьтесь с нашими специалистами."
    },
    stats: [
      { value: "5+", label: "Лет опыта" },
      { value: "200+", label: "Детей получили помощь" },
      { value: "12+", label: "Квалифицированных специалистов" },
      { value: "12", label: "Видов терапии" }
    ],
    about: {
      title: "О нас",
      text: "Aaron Academy Kids - современный коррекционный центр в Ташкенте. Мы команда квалифицированных специалистов, работающих с детьми с РАС и особенностями развития.",
      quote: "\"Каждый ребенок - отдельный мир. Наша задача - найти путь к этому миру.\"",
      cards: [
        { key: "heart", icon: "heart", title: "Индивидуальный подход", text: "Составляем личную программу для каждого ребенка." },
        { key: "team", icon: "users", title: "Опытные специалисты", text: "Дефектолог, психолог, логопед и невролог." },
        { key: "modern", icon: "sparkles", title: "Современные методы", text: "ABA, сенсорная интеграция и игровая терапия." },
        { key: "support", icon: "check", title: "Помощь родителям", text: "Консультации и рекомендации по воспитанию." }
      ]
    },
    services: {
      kicker: "Услуги",
      title: "Наши услуги",
      text: "Современные терапевтические и развивающие программы для детей с расстройствами аутистического спектра",
      items: [
        { key: "logoped", icon: "message", title: "Логопед", text: "Занятия по коррекции речевых нарушений и развитию речи." },
        { key: "clay", icon: "layers", title: "Глинотерапия", text: "Работа с глиной для развития мелкой моторики и творчества." },
        { key: "logoritmika", icon: "note", title: "Логоритмика", text: "Комплекс занятий, объединяющий речь, музыку и движение." },
        { key: "music", icon: "music", title: "Музыкальная терапия", text: "Развитие эмоционального баланса и коммуникации через музыку." },
        { key: "art", icon: "brush", title: "ART терапия", text: "Поддержка эмоционального развития через искусство и творчество." },
        { key: "aba", icon: "check", title: "ABA терапия", text: "Постепенное формирование поведения, общения и бытовых навыков." },
        { key: "neuropsychology", icon: "sparkles", title: "Нейропсихология", text: "Развитие внимания, памяти, мышления и навыков саморегуляции." },
        { key: "sbo", icon: "users", title: "СБО", text: "Формирование социально-бытовых навыков, самостоятельности и общения." },
        { key: "barocamera", icon: "check", title: "Барокамера", text: "Оздоровительные кислородные сеансы под наблюдением специалиста." },
        { key: "massage", icon: "heart", title: "Массаж", text: "Поддержка мышечного тонуса, двигательной активности и общего состояния." },
        { key: "hydrotherapy", icon: "layers", title: "Гидротерапия", text: "Развитие движений, координации и сенсорной интеграции в водной среде." },
        { key: "hippotherapy", icon: "sparkles", title: "Иппотерапия", text: "Терапия с лошадьми для развития равновесия, уверенности и моторики." }
      ]
    },
    gallery: {
      kicker: "Галерея",
      title: "Творчество детей",
      text: "Каждая работа - выражение внутреннего мира ребенка",
      empty: "Пока работ нет",
      errors: {
        image: "Выберите изображение.",
        author: "Введите имя автора.",
        description: "Введите краткое описание."
      }
    },
    team: {
      kicker: "Команда",
      title: "Наши специалисты",
      text: "Опытная и квалифицированная команда",
      empty: "Пока список специалистов пуст"
    },
    cta: {
      kicker: "Первый шаг",
      title: "Развитие вашего ребенка - наша главная задача",
      text: "Запишитесь на бесплатную консультацию. Наши специалисты составят индивидуальную программу для каждого ребенка."
    },
    signup: {
      kicker: "Запись",
      title: "Онлайн запись",
      text: "Заполните форму, и мы свяжемся с вами",
      fullName: "Ф.И.О.",
      phone: "Телефон",
      phonePlaceholder: "+998...",
      errors: {
        fullName: "Ф.И.О. должно содержать минимум 3 символа.",
        phone: "Введите полный номер телефона."
      }
    },
    partners: {
      kicker: "Партнеры",
      title: "Наши партнеры",
      text: "Вместе ради лучших результатов",
      empty: "Пока партнеров нет"
    },
    contact: {
      kicker: "Контакты",
      title: "Свяжитесь с нами",
      footerTitle: "Свяжитесь с нами",
      items: [
        { key: "address", icon: "pin", label: "Адрес", value: "г. Ташкент, Мирзо-Улугбекский район, массив Буюк Ипак Йули, 5А" },
        { key: "phone", icon: "phone", label: "Телефон", value: "+998 95 455 00 33", href: "tel:+998954550033" },
        { key: "email", icon: "mail", label: "Email", value: "AARON.AAK.012@gmail.com", href: "mailto:AARON.AAK.012@gmail.com" },
        { key: "hours", icon: "clock", label: "Время работы", value: "Понедельник - Пятница: 09:00 - 18:00" }
      ]
    },
    footer: {
      text: "Современный коррекционно-развивающий центр в Ташкенте. Мы оказываем квалифицированную помощь детям с РАС на основе индивидуального подхода.",
      follow: "Следите за нами",
      home: "Главная",
      services: "Услуги"
    }
  }
};

function SiteIcon({ name }) {
  const commonProps = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  switch (name) {
    case "heart":
      return (
        <svg {...commonProps}>
          <path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 0 1 12 6a5 5 0 0 1 7.5 6.6Z" />
        </svg>
      );
    case "users":
      return (
        <svg {...commonProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...commonProps}>
          <path d="m12 3-1.8 5.2L5 10l5.2 1.8L12 17l1.8-5.2L19 10l-5.2-1.8L12 3Z" />
          <path d="M5 3v4" />
          <path d="M3 5h4" />
          <path d="M19 17v4" />
          <path d="M17 19h4" />
        </svg>
      );
    case "check":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "message":
      return (
        <svg {...commonProps}>
          <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5A8.5 8.5 0 0 1 21 11v.5Z" />
        </svg>
      );
    case "layers":
      return (
        <svg {...commonProps}>
          <path d="m12 2 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 17 9 5 9-5" />
        </svg>
      );
    case "note":
      return (
        <svg {...commonProps}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case "music":
      return (
        <svg {...commonProps}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
          <path d="M9 9 21 7" />
        </svg>
      );
    case "brush":
      return (
        <svg {...commonProps}>
          <path d="m9.1 14.9 8.5-8.5a2.1 2.1 0 0 1 3 3l-8.5 8.5" />
          <path d="M7.4 16.6c-1.2 0-3.4.7-4.4 3.4 2.7-1 3.4-3.2 3.4-4.4" />
          <path d="m6.4 15.6 2 2" />
        </svg>
      );
    case "pin":
      return (
        <svg {...commonProps}>
          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case "phone":
      return (
        <svg {...commonProps}>
          <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.7 19.7 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
        </svg>
      );
    case "mail":
      return (
        <svg {...commonProps}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case "clock":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    default:
      return null;
  }
}

function localizeSiteContentItem(item, language) {
  if (!item || typeof item !== "object") {
    return item;
  }
  const suffix = language === "ru" ? "Ru" : "Uz";
  return {
    ...item,
    author: item[`author${suffix}`] || item.author || "",
    name: item[`name${suffix}`] || item.name || "",
    role: item[`role${suffix}`] || item.role || "",
    description: item[`description${suffix}`] || item.description || ""
  };
}

function localizeSiteContentGroups(items, language) {
  return {
    kids: (items.kids || []).map((item) => localizeSiteContentItem(item, language)),
    team: (items.team || []).map((item) => localizeSiteContentItem(item, language)),
    partners: (items.partners || []).map((item) => localizeSiteContentItem(item, language))
  };
}

function getUniquePartners(items, language) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const partnerName = getLocalizedSiteContentName(item, language).trim().toLowerCase();
    const partnerImage = String(item?.image || "").trim().toLowerCase();
    const key = partnerImage || partnerName;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getLocalizedSiteContentName(item, language) {
  if (!item || typeof item !== "object") {
    return "";
  }
  if (language === "ru") {
    return item.nameRu || item.name_ru || item.name || "";
  }
  return item.nameUz || item.name_uz || item.name || "";
}

function HomePage() {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const sideMenuRef = useRef(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState({ username: "", password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupForm, setSignupForm] = useState({ fullName: "", phone: "" });
  const [signupErrors, setSignupErrors] = useState({ fullName: "", phone: "" });
  const [kidsArtItems, setKidsArtItems] = useState([]);
  const [teamItems, setTeamItems] = useState([]);
  const [teamPage, setTeamPage] = useState(1);
  const [partnerItems, setPartnerItems] = useState([]);
  const [language, setLanguage] = useState(() => (
    localStorage.getItem(HOME_LANGUAGE_KEY) === "ru" ? "ru" : "uz"
  ));
  const homeText = HOME_I18N[language];

  const {
    hasClientsMenuAccess,
    canReadClients,
    hasAppointmentsMenuAccess,
    canOpenAppointmentSchedule,
    canOpenAppointmentStatistics,
    canOpenDashboard,
    canOpenStatisticsPlannerReport,
    canOpenAppointmentSettings,
    canOpenSettingsOrganizations,
    canOpenSettingsRoles,
    canOpenSettingsPositions,
    hasUsersMenuAccess,
    canReadUsers,
    hasSettingsMenuAccess,
    hasAdminSettingsAccess,
    canOpenSiteContent
  } = useProfileAccess(profile, "none");

  const canSubmit = useMemo(() => (
    form.username.trim().length > 0
    && form.password.length > 0
    && !isSubmitting
  ), [form.password.length, form.username, isSubmitting]);

  const canSubmitSignup = useMemo(() => (
    signupForm.fullName.trim().length > 2
    && signupForm.phone.trim().length > 8
  ), [signupForm.fullName, signupForm.phone]);

  const teamTotalPages = Math.max(1, Math.ceil(teamItems.length / TEAM_ITEMS_PER_PAGE));
  const visibleTeamItems = useMemo(() => {
    const startIndex = (teamPage - 1) * TEAM_ITEMS_PER_PAGE;
    return teamItems.slice(startIndex, startIndex + TEAM_ITEMS_PER_PAGE);
  }, [teamItems, teamPage]);

  const visiblePartnerItems = useMemo(
    () => getUniquePartners(partnerItems, language),
    [language, partnerItems]
  );

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      const justLoggedOut = sessionStorage.getItem(LOGOUT_FLAG_KEY) === "1";
      if (justLoggedOut) {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
        if (active) {
          setIsAuthenticated(false);
          setProfile(null);
        }
        return;
      }

      try {
        const response = await apiFetch("/api/profile", {
          method: "GET",
          cache: "no-store"
        });
        const data = await response.json().catch(() => null);

        if (!active) {
          return;
        }

        if (!response.ok || !data?.username) {
          setIsAuthenticated(false);
          setProfile(null);
          return;
        }

        setIsAuthenticated(true);
        setProfile(normalizeProfile(data));
      } catch {
        if (active) {
          setIsAuthenticated(false);
          setProfile(null);
        }
      }
    }

    void loadCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setTeamPage((currentPage) => Math.min(currentPage, teamTotalPages));
  }, [teamTotalPages]);

  useEffect(() => {
    let active = true;

    async function loadSiteContent() {
      try {
        const items = await fetchPublicSiteContent();
        if (!active) {
          return;
        }
        const localizedItems = localizeSiteContentGroups(items, language);
        setKidsArtItems(localizedItems.kids);
        setTeamItems(localizedItems.team);
        setPartnerItems(localizedItems.partners);
      } catch {
        if (!active) {
          return;
        }
        setKidsArtItems([]);
        setTeamItems([]);
        setPartnerItems([]);
      }
    }

    void loadSiteContent();
    return () => {
      active = false;
    };
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = language === "ru" ? "ru" : "uz";
    document.title = homeText.seo.title;

    const upsertMeta = (selector, attributes) => {
      let element = document.head.querySelector(selector);
      if (!element) {
        element = document.createElement("meta");
        document.head.appendChild(element);
      }

      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    };

    upsertMeta('meta[name="description"]', {
      name: "description",
      content: homeText.seo.description
    });
    upsertMeta('meta[name="keywords"]', {
      name: "keywords",
      content: homeText.seo.keywords
    });
    upsertMeta('meta[property="og:title"]', {
      property: "og:title",
      content: homeText.seo.title
    });
    upsertMeta('meta[property="og:description"]', {
      property: "og:description",
      content: homeText.seo.description
    });
    upsertMeta('meta[property="og:type"]', {
      property: "og:type",
      content: "website"
    });
    upsertMeta('meta[property="og:locale"]', {
      property: "og:locale",
      content: language === "ru" ? "ru_RU" : "uz_UZ"
    });

    let structuredData = document.getElementById("home-local-business-jsonld");
    if (!structuredData) {
      structuredData = document.createElement("script");
      structuredData.id = "home-local-business-jsonld";
      structuredData.type = "application/ld+json";
      document.head.appendChild(structuredData);
    }

    structuredData.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "MedicalBusiness",
      name: "Aaron Academy Kids",
      description: homeText.seo.description,
      url: window.location.origin,
      logo: `${window.location.origin}/crm.svg`,
      telephone: "+998954550033",
      email: "AARON.AAK.012@gmail.com",
      medicalSpecialty: "Autism",
      address: {
        "@type": "PostalAddress",
        streetAddress: language === "ru" ? "массив Буюк Ипак Йули, 5А" : "Buyuk Ipak Yo'li 5A",
        addressLocality: "Tashkent",
        addressRegion: "Tashkent",
        addressCountry: "UZ"
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: 41.31237285796189,
        longitude: 69.28887661172668
      },
      openingHours: "Mo-Fr 09:00-18:00",
      sameAs: [
        "https://www.instagram.com/aaron_uzb",
        "https://t.me/aaron_uz"
      ]
    });
  }, [homeText.seo.description, homeText.seo.keywords, homeText.seo.title, language]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsLoginOpen(false);
        setErrors({ username: "", password: "" });
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const resetFormErrors = useCallback(() => {
    setErrors({ username: "", password: "" });
  }, []);

  const closeLogin = useCallback(() => {
    setIsLoginOpen(false);
    setForm({ username: "", password: "" });
    resetFormErrors();
  }, [resetFormErrors]);

  const prefetchProfilePage = useCallback(() => {
    void loadProfilePage();
  }, []);

  const preloadSideMenu = useCallback(() => {
    if (!isAuthenticated) {
      return;
    }
  }, [isAuthenticated]);

  const bindSideMenuRef = useCallback((instance) => {
    sideMenuRef.current = instance;
  }, []);

  const closeMenu = useCallback(() => {
    setIsSideMenuOpen(false);
    sideMenuRef.current?.close();
  }, []);

  const navigateFromMenu = useCallback((path) => {
    closeMenu();
    navigate(path);
  }, [closeMenu, navigate]);

  const openSideMenu = useCallback(() => {
    if (!isAuthenticated) {
      return;
    }

    setIsSideMenuOpen(true);
    sideMenuRef.current?.open();
  }, [isAuthenticated]);

  const openHeaderMenu = useCallback(() => {
    if (!isAuthenticated) {
      prefetchProfilePage();
      setIsLoginOpen(true);
      return;
    }

    if (isSideMenuOpen) {
      closeMenu();
      return;
    }

    openSideMenu();
  }, [closeMenu, isAuthenticated, isSideMenuOpen, openSideMenu, prefetchProfilePage]);

  const handlePageAnchorClick = useCallback((event) => {
    const href = event.currentTarget.getAttribute("href");
    if (!href?.startsWith("#")) {
      return;
    }

    const target = document.querySelector(href);
    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", href);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage((currentLanguage) => {
      const nextLanguage = currentLanguage === "uz" ? "ru" : "uz";
      localStorage.setItem(HOME_LANGUAGE_KEY, nextLanguage);
      return nextLanguage;
    });
  }, []);

  const updateSignupField = useCallback((field, value) => {
    setSignupForm((prev) => ({ ...prev, [field]: value }));
    if (signupErrors[field]) {
      setSignupErrors((prev) => ({ ...prev, [field]: "" }));
    }
  }, [signupErrors]);

  const handleSignupSubmit = useCallback((event) => {
    event.preventDefault();
    const payload = {
      fullName: signupForm.fullName.trim(),
      phone: signupForm.phone.trim()
    };

    const nextErrors = { fullName: "", phone: "" };
    if (payload.fullName.length < 3) {
      nextErrors.fullName = homeText.signup.errors.fullName;
    }
    if (payload.phone.replace(/\D/g, "").length < 9) {
      nextErrors.phone = homeText.signup.errors.phone;
    }

    if (nextErrors.fullName || nextErrors.phone) {
      setSignupErrors(nextErrors);
      return;
    }

    const lead = {
      ...payload,
      createdAt: new Date().toISOString()
    };
    const savedLeads = JSON.parse(localStorage.getItem("aaron_public_leads") || "[]");
    localStorage.setItem("aaron_public_leads", JSON.stringify([lead, ...savedLeads].slice(0, 50)));
    setSignupForm({ fullName: "", phone: "" });
    setSignupErrors({ fullName: "", phone: "" });
  }, [homeText.signup.errors.fullName, homeText.signup.errors.phone, signupForm.fullName, signupForm.phone]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    const payload = {
      username: form.username.trim(),
      password: form.password
    };

    const nextErrors = { username: "", password: "" };
    if (!payload.username) {
      nextErrors.username = "Username is required.";
    }
    if (!payload.password) {
      nextErrors.password = "Password is required.";
    }

    if (nextErrors.username || nextErrors.password) {
      setErrors(nextErrors);
      return;
    }

    try {
      setIsSubmitting(true);
      resetFormErrors();
      const profilePagePromise = loadProfilePage();

      const response = await apiFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponseData(response);

      if (!response.ok) {
        if (data?.field === "username" || data?.field === "password") {
          setErrors((prev) => ({ ...prev, [data.field]: data.message || "Invalid value." }));
          return;
        }

        setErrors({
          username: "Username is incorrect.",
          password: getApiErrorMessage(response, data, "Invalid username or password.")
        });
        return;
      }

      await profilePagePromise;
      navigate("/profile", { replace: true });
    } catch {
      setErrors((prev) => ({ ...prev, password: "Unexpected error. Please try again." }));
    } finally {
      setIsSubmitting(false);
    }
  }, [form.password, form.username, navigate, resetFormErrors]);

  return (
    <>
      <div className="home-layout home-site-layout">
        <header className="home-header">
          <div className="home-header-inner">
            <div className="brand-wrap">
              <button
                type="button"
                className="menu-toggle"
                aria-label={isAuthenticated ? "Open workspace" : "Open login"}
                aria-controls="mainMenu"
                aria-expanded={isSideMenuOpen ? "true" : "false"}
                onMouseEnter={isAuthenticated ? preloadSideMenu : prefetchProfilePage}
                onFocus={isAuthenticated ? preloadSideMenu : prefetchProfilePage}
                onClick={openHeaderMenu}
              >
                <span />
                <span />
                <span />
              </button>
              <Link className="brand" to="/" aria-label="AARON CRM home">
                <img src="/crm.svg" alt="AARON CRM logo" className="brand-logo" />
                <span className="brand-copy">
                  <span className="brand-text">AARON ACADEMY KIDS</span>
                  <span className="brand-subtitle">{homeText.brandSubtitle}</span>
                </span>
              </Link>
            </div>

            <nav className="home-nav-links" aria-label="Main site sections">
              {homeText.navLinks.map((item) => (
                <a key={item.href} href={item.href} onClick={handlePageAnchorClick}>{item.label}</a>
              ))}
            </nav>

            <nav className="header-actions" aria-label="Header actions">
              <button
                type="button"
                className="header-btn home-language-btn"
                aria-label="Switch language"
                onClick={toggleLanguage}
              >
                {homeText.actions.nextLanguage}
              </button>
              {!isAuthenticated ? (
                <button
                  type="button"
                  className="header-btn profile-link"
                  onMouseEnter={prefetchProfilePage}
                  onFocus={prefetchProfilePage}
                  onClick={() => {
                    prefetchProfilePage();
                    setIsLoginOpen(true);
                  }}
                >
                  {homeText.actions.login}
                </button>
              ) : (
                <button
                  type="button"
                  className="header-btn profile-link"
                  onMouseEnter={prefetchProfilePage}
                  onFocus={prefetchProfilePage}
                  onClick={() => {
                    prefetchProfilePage();
                    navigate("/profile");
                  }}
                >
                  {homeText.actions.login}
                </button>
              )}
            </nav>
          </div>
        </header>

        <main className="home-main" aria-label="Main content">
          <section className="home-hero" aria-labelledby="homeHeroTitle">
            <div className="home-hero-bg" aria-hidden="true" />
            <div className="home-hero-copy">
              <p className="home-hero-badge">{homeText.hero.badge}</p>
              <h1 id="homeHeroTitle" className="home-hero-title">
                {homeText.hero.title}
              </h1>
              <p className="home-hero-text">
                {homeText.hero.text}
              </p>

              <div className="home-hero-actions">
                <a
                  className="btn home-hero-primary"
                  href="#signup"
                  onClick={handlePageAnchorClick}
                >
                  <span className="home-btn-icon" aria-hidden="true">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4" />
                      <path d="M8 2v4" />
                      <path d="M3 10h18" />
                    </svg>
                  </span>
                  {homeText.actions.onlineSignup}
                </a>
                <a className="home-hero-secondary" href="#about" onClick={handlePageAnchorClick}>
                  {homeText.actions.details}
                  <span aria-hidden="true">→</span>
                </a>
              </div>

              <div className="home-hero-chips" aria-label="Services">
                {homeText.hero.chips.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>

            <aside className="home-consult-card" aria-label="Free consultation">
              <span className="home-consult-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21s-7-4.35-9.33-9.08C.9 8.31 2.9 4 6.75 4A5.1 5.1 0 0 1 12 7.15 5.1 5.1 0 0 1 17.25 4c3.85 0 5.85 4.31 4.08 7.92C19 16.65 12 21 12 21Z" />
                </svg>
              </span>
              <div>
                <strong>{homeText.hero.consultTitle}</strong>
                <p>{homeText.hero.consultText}</p>
              </div>
            </aside>
          </section>

          <section className="home-stats-band" aria-label="Center statistics">
            {homeText.stats.map((stat) => (
              <div key={stat.label} className="home-stat-item">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </section>

          <section id="about" className="home-about" aria-labelledby="aboutTitle">
            <div className="home-section-head">
              <h2 id="aboutTitle">{homeText.about.title}</h2>
              <p>{homeText.about.text}</p>
            </div>

            <div className="home-about-grid">
              {homeText.about.cards.map((card) => (
                <article key={card.key} className="home-about-card">
                  <span className="home-soft-icon" aria-hidden="true">
                    <SiteIcon name={card.icon} />
                  </span>
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </article>
              ))}
            </div>

            <blockquote className="home-about-quote">
              {homeText.about.quote}
            </blockquote>
          </section>

          <section id="services" className="home-services" aria-labelledby="servicesTitle">
            <div className="home-section-head">
              <p className="home-section-kicker">{homeText.services.kicker}</p>
              <h2 id="servicesTitle">{homeText.services.title}</h2>
              <p>{homeText.services.text}</p>
            </div>

            <div className="home-service-strip" aria-label="Therapy services">
              <div className="home-service-track">
                {homeText.services.items.map((service) => (
                  <article key={service.key} className="home-service-card">
                    <span className="home-service-icon" aria-hidden="true">
                      <SiteIcon name={service.icon} />
                    </span>
                    <h3>{service.title}</h3>
                    <p>{service.text}</p>
                  </article>
                ))}
                {homeText.services.items.map((service) => (
                  <article key={`${service.key}-loop`} className="home-service-card" aria-hidden="true">
                    <span className="home-service-icon" aria-hidden="true">
                      <SiteIcon name={service.icon} />
                    </span>
                    <h3>{service.title}</h3>
                    <p>{service.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="kids" className="home-empty-section home-gallery-section" aria-labelledby="kidsTitle">
            <div className="home-section-head">
              <p className="home-section-kicker">{homeText.gallery.kicker}</p>
              <h2 id="kidsTitle">{homeText.gallery.title}</h2>
              <p>{homeText.gallery.text}</p>
            </div>

            {kidsArtItems.length > 0 ? (
              <div className="home-kids-art-grid">
                {kidsArtItems.map((item) => (
                  <article
                    key={item.id}
                    className="home-kids-art-card"
                    tabIndex={0}
                    aria-label={language === "ru" ? `Работа: ${item.author}` : `${item.author} ijodi`}
                  >
                    <img
                      src={item.image}
                      alt={language === "ru" ? `Работа: ${item.author}` : `${item.author} ijodi`}
                    />
                    <div className="home-kids-art-overlay">
                      <h3>{item.author}</h3>
                      {item.description ? <p>{item.description}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="home-empty-message">{homeText.gallery.empty}</p>
            )}
          </section>

          <section id="team" className="home-empty-section home-team-section" aria-labelledby="teamTitle">
            <div className="home-section-head">
              <p className="home-section-kicker">{homeText.team.kicker}</p>
              <h2 id="teamTitle">{homeText.team.title}</h2>
              <p>{homeText.team.text}</p>
            </div>
            {teamItems.length > 0 ? (
              <div className="home-team-paginated">
                <div className="home-content-card-grid home-team-grid">
                  {visibleTeamItems.map((item) => (
                    <article key={item.id} className="home-content-card home-team-card">
                      {item.image ? <img src={item.image} alt={item.name || homeText.team.title} /> : null}
                      <div>
                        <h3>{item.name}</h3>
                        <span>{item.role}</span>
                        <p>{item.description}</p>
                      </div>
                    </article>
                  ))}
                </div>
                {teamTotalPages > 1 ? (
                  <nav
                    className="home-team-pagination"
                    aria-label={language === "ru" ? "Страницы специалистов" : "Mutaxassislar sahifalari"}
                  >
                    <button
                      type="button"
                      className="home-team-page-arrow"
                      onClick={() => setTeamPage((currentPage) => Math.max(1, currentPage - 1))}
                      disabled={teamPage === 1}
                      aria-label={language === "ru" ? "Предыдущая страница" : "Oldingi sahifa"}
                    >
                      <span aria-hidden="true">‹</span>
                    </button>
                    {Array.from({ length: teamTotalPages }, (_, index) => {
                      const page = index + 1;
                      return (
                        <button
                          key={page}
                          type="button"
                          className={`home-team-page-dot${teamPage === page ? " is-active" : ""}`}
                          onClick={() => setTeamPage(page)}
                          aria-label={language === "ru" ? `Страница ${page}` : `${page}-sahifa`}
                          aria-current={teamPage === page ? "page" : undefined}
                        >
                          {page}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="home-team-page-arrow"
                      onClick={() => setTeamPage((currentPage) => Math.min(teamTotalPages, currentPage + 1))}
                      disabled={teamPage === teamTotalPages}
                      aria-label={language === "ru" ? "Следующая страница" : "Keyingi sahifa"}
                    >
                      <span aria-hidden="true">›</span>
                    </button>
                  </nav>
                ) : null}
              </div>
            ) : (
              <p className="home-empty-message">{homeText.team.empty}</p>
            )}
          </section>

          <section className="home-cta-band" aria-labelledby="ctaTitle">
            <p className="home-section-kicker">{homeText.cta.kicker}</p>
            <h2 id="ctaTitle">{homeText.cta.title}</h2>
            <p>{homeText.cta.text}</p>
            <a className="btn home-cta-button" href="#signup" onClick={handlePageAnchorClick}>
              <span className="home-btn-icon" aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4" />
                  <path d="M8 2v4" />
                  <path d="M3 10h18" />
                </svg>
              </span>
              {homeText.actions.onlineSignup}
              <span aria-hidden="true">→</span>
            </a>
          </section>

          <section id="signup" className="home-signup-section" aria-labelledby="signupTitle">
            <div className="home-section-head">
              <p className="home-section-kicker">{homeText.signup.kicker}</p>
              <h2 id="signupTitle">{homeText.signup.title}</h2>
              <p>{homeText.signup.text}</p>
            </div>

            <form className="home-signup-form" onSubmit={handleSignupSubmit} noValidate>
              <div className="home-signup-field">
                <label htmlFor="signupFullName">{homeText.signup.fullName}</label>
                <input
                  id="signupFullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  value={signupForm.fullName}
                  className={signupErrors.fullName ? "input-error" : ""}
                  onInput={(event) => updateSignupField("fullName", event.currentTarget.value)}
                />
              </div>

              <div className="home-signup-field">
                <label htmlFor="signupPhone">{homeText.signup.phone}</label>
                <input
                  id="signupPhone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder={homeText.signup.phonePlaceholder}
                  autoComplete="tel"
                  value={signupForm.phone}
                  className={signupErrors.phone ? "input-error" : ""}
                  onInput={(event) => updateSignupField("phone", event.currentTarget.value)}
                />
              </div>

              <button type="submit" className="home-signup-submit" disabled={!canSubmitSignup}>
                {homeText.actions.submit}
              </button>
            </form>
          </section>

          <section id="partners" className="home-empty-section home-partners-section" aria-labelledby="partnersTitle">
            <div className="home-section-head">
              <p className="home-section-kicker">{homeText.partners.kicker}</p>
              <h2 id="partnersTitle">{homeText.partners.title}</h2>
              <p>{homeText.partners.text}</p>
            </div>
            {visiblePartnerItems.length > 0 ? (
              <div className="home-partner-strip" aria-label={homeText.partners.title}>
                <div className={`home-partner-track${visiblePartnerItems.length > 1 ? "" : " is-static"}`}>
                  {visiblePartnerItems.map((item) => {
                    const partnerName = getLocalizedSiteContentName(item, language);
                    return (
                      <article key={item.id} className="home-partner-item">
                        {item.image ? <img src={item.image} alt={partnerName || homeText.partners.title} /> : null}
                        <h3>{partnerName}</h3>
                      </article>
                    );
                  })}
                  {visiblePartnerItems.length > 1 ? visiblePartnerItems.map((item) => {
                    const partnerName = getLocalizedSiteContentName(item, language);
                    return (
                      <article key={`${item.id}-loop`} className="home-partner-item" aria-hidden="true">
                        {item.image ? <img src={item.image} alt={partnerName || homeText.partners.title} /> : null}
                        <h3>{partnerName}</h3>
                      </article>
                    );
                  }) : null}
                </div>
              </div>
            ) : (
              <p className="home-empty-message">{homeText.partners.empty}</p>
            )}
          </section>

          <section id="contact" className="home-contact-section" aria-labelledby="contactTitle">
            <div className="home-contact-copy">
              <p className="home-section-kicker">{homeText.contact.kicker}</p>
              <h2 id="contactTitle">{homeText.contact.title}</h2>

              <div className="home-contact-list">
                {homeText.contact.items.map((item) => {
                  const value = item.href ? (
                    <a href={item.href}>{item.value}</a>
                  ) : (
                    <span>{item.value}</span>
                  );

                  return (
                    <div key={item.key} className="home-contact-item">
                      <span className="home-soft-icon" aria-hidden="true">
                        <SiteIcon name={item.icon} />
                      </span>
                      <div>
                        <strong>{item.label}</strong>
                        {value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="home-map-card">
              <iframe
                className="home-map-frame"
                title="Aaron Academy Kids xaritasi"
                src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d2996.8386761936986!2d69.288877!3d41.312373!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x38aef58d35ec6269%3A0x61dd4dc6dcfc9ddc!2sAaron%20Akademiya!5e0!3m2!1suz!2sus!4v1777715208254!5m2!1suz!2sus"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <a
                className="home-map-open-link"
                href="https://www.google.com/maps/search/?api=1&query=Aaron%20Akademiya%4041.312373%2C69.288877"
                target="_blank"
                rel="noreferrer"
              >
                {homeText.actions.openMap}
              </a>
            </div>
          </section>
        </main>

        <footer className="home-footer">
          <div className="home-footer-brand">
            <Link className="brand" to="/" aria-label="AARON CRM home">
              <img src="/crm.svg" alt="AARON CRM logo" className="brand-logo" />
              <span className="brand-copy">
                <span className="brand-text">AARON ACADEMY KIDS</span>
                <span className="brand-subtitle">{homeText.brandSubtitle}</span>
              </span>
            </Link>
            <p>{homeText.footer.text}</p>
            <strong>{homeText.footer.follow}</strong>
            <div className="home-social-links">
              <a href="https://www.instagram.com/aaron_uzb?igsh=MWxod2Q1eDV6NGowZw==" target="_blank" rel="noreferrer" aria-label="Instagram">
                <img src="/icon/instagram.svg" alt="" aria-hidden="true" />
              </a>
              <a href="https://t.me/aaron_uz" target="_blank" rel="noreferrer" aria-label="Telegram">
                <img src="/icon/telegram.svg" alt="" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="home-footer-column">
            <h3>{homeText.footer.home}</h3>
            {homeText.navLinks.slice(0, 5).map((item) => (
              <a key={item.href} href={item.href} onClick={handlePageAnchorClick}>{item.label}</a>
            ))}
          </div>

          <div className="home-footer-column">
            <h3>{homeText.footer.services}</h3>
            {homeText.services.items.slice(0, 6).map((service) => (
              <a key={service.key} href="#services" onClick={handlePageAnchorClick}>{service.title}</a>
            ))}
          </div>

          <div className="home-footer-column home-footer-contact">
            <h3>{homeText.contact.footerTitle}</h3>
            {homeText.contact.items.map((item) => (
              <div key={item.key}>
                <SiteIcon name={item.icon} />
                {item.href ? <a href={item.href}>{item.value}</a> : <span>{item.value}</span>}
              </div>
            ))}
          </div>
        </footer>
      </div>

      {isAuthenticated ? (
        <ProfileSideMenu
          ref={bindSideMenuRef}
          menuRef={menuRef}
          hasClientsMenuAccess={hasClientsMenuAccess}
          canReadClients={canReadClients}
          openAllClientsPanel={() => navigateFromMenu("/clients/allclients")}
          canOpenDashboard={canOpenDashboard}
          openDashboardPanel={() => navigateFromMenu("/dashboard")}
          hasAppointmentsMenuAccess={hasAppointmentsMenuAccess}
          canOpenAppointmentSchedule={canOpenAppointmentSchedule}
          canOpenAppointmentStatistics={canOpenAppointmentStatistics}
          canOpenStatisticsPlannerReport={canOpenStatisticsPlannerReport}
          canOpenAppointmentSettings={canOpenAppointmentSettings}
          openAppointmentPanel={() => navigateFromMenu("/appointments/planner")}
          openAppointmentSettingsPanel={() => navigateFromMenu("/settings/appointments")}
          openStatisticsPlannerReportPanel={() => navigateFromMenu("/statistics/planner-report")}
          hasUsersMenuAccess={hasUsersMenuAccess}
          canReadUsers={canReadUsers}
          closeMenu={closeMenu}
          navigate={navigate}
          hasSettingsMenuAccess={hasSettingsMenuAccess}
          hasAdminSettingsAccess={hasAdminSettingsAccess}
          canOpenSettingsOrganizations={canOpenSettingsOrganizations}
          canOpenSettingsRoles={canOpenSettingsRoles}
          canOpenSettingsPositions={canOpenSettingsPositions}
          openOrganizationsPanel={() => navigateFromMenu("/admin-settings/organizations")}
          openRolesPanel={() => navigateFromMenu("/settings/roles")}
          openPositionsPanel={() => navigateFromMenu("/settings/positions")}
          openMonitoringPanel={() => navigateFromMenu("/admin-settings/monitoring")}
          canOpenSiteContent={canOpenSiteContent}
          openSiteContentPanel={(sectionKey = "kids") => navigateFromMenu(`/site/content?section=${sectionKey}`)}
        />
      ) : null}

      <section className="home-login-panel" hidden={!isLoginOpen}>
        <div className="home-login-head">
          <h2>Welcome Back</h2>
        </div>

        <form className="home-login-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="homeUsername">Username</label>
            <input
              id="homeUsername"
              name="username"
              type="text"
              placeholder="Username"
              autoComplete="username"
              required
              className={errors.username ? "input-error" : ""}
              value={form.username}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setForm((prev) => ({ ...prev, username: nextValue }));
                if (errors.username) {
                  setErrors((prev) => ({ ...prev, username: "" }));
                }
              }}
            />
            <small className="field-error">{errors.username}</small>
          </div>

          <div className="field">
            <label htmlFor="homePassword">Password</label>
            <input
              id="homePassword"
              name="password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              required
              className={errors.password ? "input-error" : ""}
              value={form.password}
              onInput={(event) => {
                const nextValue = event.currentTarget.value;
                setForm((prev) => ({ ...prev, password: nextValue }));
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: "" }));
                }
              }}
            />
            <small className="field-error">{errors.password}</small>
          </div>

          <button className="btn" type="submit" disabled={!canSubmit}>
            Login
          </button>
        </form>
      </section>

      <div className="login-overlay" hidden={!isLoginOpen} onClick={closeLogin} />
    </>
  );
}

export default HomePage;
