import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { App as CapApp } from "@capacitor/app";
import { registerPlugin, Capacitor } from "@capacitor/core";
const Apps = registerPlugin("Apps");

/* ===== YevFiles — leshugan.fm =====  стиль Notenger (шоколад) */

const BG = "var(--bg)", BAR = "var(--bar)", ROW2 = "var(--row2)", ACC = "var(--acc)";
const GOLD = "var(--gold)", RED = "var(--red)", TXT = "var(--txt)", SUB = "var(--sub)", LINE = "var(--line)";
const THEMES = {
  dark:  { "--bg": "#1C140C", "--bar": "#2A2017", "--row2": "#2E251C", "--acc": "#EF6C00", "--accbg": "rgba(239,108,0,.18)", "--gold": "#F5A623", "--red": "#E05252", "--txt": "#F2EAE0", "--sub": "#B0A498", "--line": "#4A3A2A", "--chip": "rgba(255,255,255,.06)", "--hair": "rgba(255,255,255,.08)", "--tgloff": "#4A3A2A" },
  light: { "--bg": "#EEF1F4", "--bar": "#FFFFFF", "--row2": "#E4E8EC", "--acc": "#2F80ED", "--accbg": "rgba(47,128,237,.14)", "--gold": "#2F80ED", "--red": "#D14343", "--txt": "#1E2329", "--sub": "#6B7280", "--line": "#D3D8DE", "--chip": "rgba(0,0,0,.05)", "--hair": "rgba(0,0,0,.08)", "--tgloff": "#C2C8D0" },
};
const DIR = Directory.ExternalStorage;
const APP_VERSION = "fm-2026.06.27-a";
const TKEY = "fm_tabs_v1", SKEY = "fm_startup_v1", METAKEY = "fm_meta_v1", SORTKEY = "fm_sort_v1";
const DEFKEY = "fm_defaults_v1", HIDEKEY = "fm_hideapps_v1", ICONKEY = "fm_foldericons_v1";
const loadMap = (k) => { try { return JSON.parse(ls.get(k)) || {}; } catch { return {}; } };
const saveMap = (k, m) => ls.set(k, JSON.stringify(m));
const OPEN_AS = [["*/*", "Любой тип"], ["text/plain", "Текст"], ["image/*", "Изображение"], ["video/*", "Видео"], ["audio/*", "Аудио"], ["application/pdf", "PDF"]];

let mem = null;
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} } };
function buildInitial() {
  const saved = loadTabs();
  const base = saved && saved.length ? saved : [{ id: 1, path: "" }];
  let active = base.findIndex((t) => t.startup);
  if (active < 0) active = 0;
  return { base, active };
}
const loadTabs = () => { try { return JSON.parse(ls.get(TKEY)); } catch { return mem; } };
const saveTabs = (t) => { const keep = t.filter((x) => x.saved); mem = keep; ls.set(TKEY, JSON.stringify(keep)); };
const loadMeta = () => { try { const m = JSON.parse(ls.get(METAKEY)) || {}; return { hidden: new Set(m.hidden || []), pinTop: new Set(m.pinTop || []), pinBot: new Set(m.pinBot || []) }; } catch { return { hidden: new Set(), pinTop: new Set(), pinBot: new Set() }; } };
const saveMeta = (m) => ls.set(METAKEY, JSON.stringify({ hidden: [...m.hidden], pinTop: [...m.pinTop], pinBot: [...m.pinBot] }));

const join = (a, b) => (a ? a + "/" + b : b);
const parent = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseName = (p) => (p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p);
const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
const splitExt = (name, isDir) => {
  if (isDir) return { base: name, ext: "" };
  const i = name.lastIndexOf(".");
  if (i <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, i), ext: name.slice(i + 1) };
};
const fmtSize = (b) => { if (b == null) return "—"; const u = ["Б", "КБ", "МБ", "ГБ"]; let i = 0, n = b; while (n >= 1024 && i < 3) { n /= 1024; i++; } return (i ? n.toFixed(1) : n) + " " + u[i] + (i ? " (" + b.toLocaleString("ru") + " Б)" : ""); };
const fmtShort = (b) => { if (b == null) return ""; const u = ["Б", "КБ", "МБ", "ГБ"]; let i = 0, n = b; while (n >= 1024 && i < 3) { n /= 1024; i++; } return (i ? n.toFixed(1) : n) + " " + u[i]; };
const fmtSizeShort = (b) => { if (b == null) return ""; const u = ["Б", "КБ", "МБ", "ГБ"]; let i = 0, n = b; while (n >= 1024 && i < 3) { n /= 1024; i++; } return (i ? n.toFixed(1) : n) + " " + u[i]; };
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return b; return c; };
const fmtDate = (ms) => {
  if (!ms) return "";
  const d = new Date(ms), diff = Date.now() - ms;
  if (diff < 60000) return "только что";
  if (diff < 3600000) { const m = Math.floor(diff / 60000); return m + " " + plural(m, "минуту", "минуты", "минут") + " назад"; }
  if (d.toDateString() === new Date().toDateString()) { const h = Math.floor(diff / 3600000); return h + " " + plural(h, "час", "часа", "часов") + " назад"; }
  return d.toLocaleDateString("ru") + " " + d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
};
const ago = (ms) => { if (!ms) return "—"; const d = new Date(ms), diff = (Date.now() - ms) / 60000; const rel = diff < 1 ? "только что" : diff < 60 ? Math.floor(diff) + " мин назад" : diff < 1440 ? Math.floor(diff / 60) + " ч назад" : Math.floor(diff / 1440) + " дн назад"; const p = (n) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}, ${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)} · ${rel}`; };

const MIME = { txt: "text/plain", md: "text/plain", log: "text/plain", ini: "text/plain", cfg: "text/plain", conf: "text/plain", csv: "text/csv", html: "text/html", htm: "text/html", json: "application/json", xml: "text/xml", yml: "text/plain", yaml: "text/plain", java: "text/plain", kt: "text/plain", kts: "text/plain", js: "text/plain", jsx: "text/plain", ts: "text/plain", tsx: "text/plain", py: "text/plain", c: "text/plain", h: "text/plain", cpp: "text/plain", cc: "text/plain", cs: "text/plain", go: "text/plain", rs: "text/plain", rb: "text/plain", php: "text/plain", swift: "text/plain", sh: "text/plain", bat: "text/plain", gradle: "text/plain", properties: "text/plain", css: "text/plain", sql: "text/plain", lua: "text/plain", toml: "text/plain", pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", mp4: "video/mp4", mkv: "video/x-matroska", avi: "video/x-msvideo", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4", aac: "audio/aac", zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed", tar: "application/x-tar", gz: "application/gzip", apk: "application/vnd.android.package-archive" };
const mimeOf = (name) => MIME[(name.split(".").pop() || "").toLowerCase()] || "*/*";
const TEXT_EXT = new Set(["txt", "md", "log", "ini", "cfg", "conf", "yml", "yaml", "java", "kt", "kts", "js", "jsx", "ts", "tsx", "py", "c", "h", "cpp", "cc", "cs", "go", "rs", "rb", "php", "swift", "sh", "bat", "gradle", "properties", "css", "sql", "lua", "toml", "xml", "json", "html", "htm", "csv"]);
const defaultOpenAs = (name) => { const e = (name.split(".").pop() || "").toLowerCase(); const m = mimeOf(name); if (TEXT_EXT.has(e)) return "text/plain"; if (m.startsWith("image/")) return "image/*"; if (m.startsWith("video/")) return "video/*"; if (m.startsWith("audio/")) return "audio/*"; if (m === "application/pdf") return "application/pdf"; return "*/*"; };

const I = {
  back: <path d="M15 18l-6-6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
  check: <path d="M5 12l4 4 10-11" />,
  dl: <><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M5 21h14" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  ring: <><path d="M8 14a4 4 0 0 1 8 0" /><path d="M12 3v3M5.6 6.6l2 2M18.4 6.6l-2 2" /><rect x="4" y="14" width="16" height="6" rx="2" /><path d="M10 17h4" /></>,
  alarm: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M5 3L2 6M19 3l3 3" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /></>,
  cam: <><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="12.5" r="3.5" /></>,
  android: <><path d="M7 9a5 5 0 0 1 10 0v1H7z" /><path d="M8.5 6.5L7 4M15.5 6.5L17 4" /><rect x="7" y="11" width="10" height="8" rx="2" /></>,
  doc2: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 16h6" /></>,
  gamepad: <><path d="M7.5 7h9a4.5 4.5 0 0 1 4.4 3.6l1 5A2.6 2.6 0 0 1 18.4 18l-2-2.2a2 2 0 0 0-1.5-.7H9.1a2 2 0 0 0-1.5.7L5.6 18A2.6 2.6 0 0 1 2.1 15.6l1-5A4.5 4.5 0 0 1 7.5 7z" /><path d="M6.2 10.4v2.4M5 11.6h2.4" /><circle cx="15.4" cy="10.8" r=".8" fill="currentColor" /><circle cx="17.6" cy="12.6" r=".8" fill="currentColor" /></>,
  emuPad: <><rect x="3" y="8" width="18" height="9" rx="4.5" /><path d="M7 10.5v4M5 12.5h4" /><circle cx="16" cy="11" r=".8" fill="currentColor" /><circle cx="18.2" cy="13" r=".8" fill="currentColor" /><circle cx="13.8" cy="13" r=".8" fill="currentColor" /><circle cx="16" cy="15" r=".8" fill="currentColor" /></>,
  switchCon: <><path stroke="#5AA9E6" d="M9 5.5H6.5A2.5 2.5 0 0 0 4 8v8a2.5 2.5 0 0 0 2.5 2.5H9z" /><circle cx="6.4" cy="8.6" r="1" stroke="#5AA9E6" /><path stroke="#5AA9E6" d="M5.6 14.2h1.6" /><rect x="9" y="5.5" width="6" height="13" rx="0.6" stroke="#CFC6BA" /><path stroke="#E60012" d="M15 5.5h2.5A2.5 2.5 0 0 1 20 8v8a2.5 2.5 0 0 1-2.5 2.5H15z" /><circle cx="17.6" cy="14.4" r="1" stroke="#E60012" /><circle cx="17.6" cy="7.9" r=".55" fill="#E60012" stroke="#E60012" /><circle cx="18.8" cy="9.1" r=".55" fill="#E60012" stroke="#E60012" /><circle cx="16.4" cy="9.1" r=".55" fill="#E60012" stroke="#E60012" /><circle cx="17.6" cy="10.3" r=".55" fill="#E60012" stroke="#E60012" /></>,
  media: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M10 9l5 3-5 3z" fill="currentColor" /></>,
  win: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18M3 12h18" /></>,
  fontA: <><path d="M5 19l5-13 5 13M7 14h6" /><path d="M17 19V9M17 9c2 0 3 1 3 2s-1 2-3 2" /></>,
  launcher: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  book: <><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3z" /><path d="M4 4v16" /></>,
  bookOpen: <><path d="M12 6.8c-1.7-1.1-4.3-1.6-8-1.4v11.2c3.7-.2 6.3.3 8 1.4 1.7-1.1 4.3-1.6 8-1.4V5.4c-3.7-.2-6.3.3-8 1.4z" /><path d="M12 6.8v11.2" /></>,
  tool: <><path d="M14 7a4 4 0 0 1-5 5l-5 5 2 2 5-5a4 4 0 0 0 5-5z" /><path d="M14 7l3-3 3 3-3 3z" /></>,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /><path d="M10 20v-6h4v6" /></>,
  selectAll: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  chev: <path d="M6 9l6 6 6-6" />,
  refresh: <><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  x: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  cut: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.5 15.5" /><path d="M20 20L8.5 8.5" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></>,
  rename: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  paste: <><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 4h6v3H9z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>,
  openext: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" /></>,
  dots: <><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></>,
  sun: <><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></>,
  moon: <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></>,
  sort: <><path d="M7 4v16M7 20l-3-3M7 4l3 3" /><path d="M17 20V4M17 4l3 3M17 20l-3-3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" /><path d="M9.9 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.2 3.9M6.2 6.2A16 16 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 3.1-.5" /></>,
  pinT: <><path d="M12 3v8M8 7l4-4 4 4" /><path d="M5 14h14M5 14v6h14v-6" /></>,
  pinB: <><path d="M12 21v-8M8 17l4 4 4-4" /><path d="M5 10h14M5 10V4h14v6" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  file: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></>,
  txt: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 16h6M9 10h3" /></>,
  pdf: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 12h6M9 15h6M9 18h3" /></>,
  apk: <><path d="M7 9a5 5 0 0 1 10 0v1H7z" /><path d="M8.5 6.5L7 4M15.5 6.5L17 4" /><circle cx="10" cy="7.4" r=".6" fill="currentColor" stroke="none" /><circle cx="14" cy="7.4" r=".6" fill="currentColor" stroke="none" /><rect x="7" y="11" width="10" height="9" rx="2" /></>,
  lnk: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 15l6-6M10.5 9H15v4.5" /></>,
  img: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
  video: <><rect x="2" y="5" width="14" height="14" rx="2" /><path d="M16 10l6-3v10l-6-3z" /></>,
  audio: <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
  archive: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18M9 7h6M9 11h6" /></>,
  code: <><path d="M8 9l-4 3 4 3" /><path d="M16 9l4 3-4 3" /></>,
  star: <path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.8 6.2 21.8l1.1-6.5L2.6 10.7l6.5-.9z" />,
  pin: <><path d="M9 4h6l-1 7 4 3v2H6v-2l4-3z" /><path d="M12 16v4" /></>,
};
const Svg = ({ d, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const ArcBadge = ({ name }) => {
  const ext = (name.split(".").pop() || "").toUpperCase();
  const c = ARCH_COLORS[ext.toLowerCase()] || "#E3B14F";
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="4" stroke={c} strokeWidth="2" fill="none" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill={c} fontFamily="system-ui,sans-serif">{ext}</text>
    </svg>
  );
};
const ThumbIcon = ({ uri, cached, request, release, fallback }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (cached) return;
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => { if (en.isIntersecting) request(uri); else release(uri); });
    }, { rootMargin: "800px 0px" }); // грузим заранее, ~11 строк за пределами экрана
    io.observe(el);
    return () => { io.disconnect(); release(uri); };
  }, [uri, cached]);
  if (cached) return <img src={cached} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 13, animation: "fS .18s ease" }} />;
  return <span ref={ref} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>{fallback}</span>;
};
const EXT = {
  img: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic"],
  video: ["mp4", "mkv", "avi", "mov", "webm", "3gp", "flv"],
  audio: ["mp3", "wav", "ogg", "flac", "m4a", "aac"],
  archive: ["zip", "rar", "7z", "tar", "gz", "apk", "obb"],
  code: ["js", "jsx", "ts", "json", "html", "css", "xml", "py", "java", "kt", "c", "cpp", "sh"],
};
const SYS_FOLDERS = {
  download: { d: I.dl, c: "#5AA9E6" }, downloads: { d: I.dl, c: "#5AA9E6" },
  music: { d: I.audio, c: "#E36FB0" }, ringtones: { d: I.ring, c: "#E3B14F" }, notifications: { d: I.bell, c: "#E3B14F" }, alarms: { d: I.alarm, c: "#E36F6F" },
  pictures: { d: I.img, c: "#6FD3A8" }, dcim: { d: I.cam, c: "#6FD3A8" }, screenshots: { d: I.img, c: "#6FD3A8" },
  movies: { d: I.video, c: "#A98BE0" }, video: { d: I.video, c: "#A98BE0" }, videos: { d: I.video, c: "#A98BE0" },
  podcasts: { d: I.mic, c: "#E3B14F" }, recordings: { d: I.mic, c: "#E3B14F" },
  documents: { d: I.doc2, c: "#5AA9E6" },
  android: { d: I.android, c: "#A4C639" }, data: { d: I.android, c: "#A4C639" }, obb: { d: I.android, c: "#A4C639" },
  apk: { d: I.apk, c: "#A4C639" },
  bannerhub: { d: I.img, c: "#E36FB0" }, fonts: { d: I.fontA, c: "#C9A227" }, books: { d: I.bookOpen, c: "#C98A4B" },
  games: { d: I.gamepad, c: "#A4C639" }, gamehub: { d: I.gamepad, c: "#A4C639" }, emu: { d: I.emuPad, c: "#A4C639" }, arcade: { d: I.emuPad, c: "#A4C639" }, mame: { d: I.emuPad, c: "#A4C639" },
  retroarch: { d: I.gamepad, c: "#7C5CFF" }, winlator: { d: I.win, c: "#5AA9E6" }, windows: { d: I.win, c: "#5AA9E6" },
  switch: { d: I.switchCon, c: "#5AA9E6" }, "nintendo switch": { d: I.switchCon, c: "#5AA9E6" }, nes: { d: I.gamepad, c: "#E05252" }, dandy: { d: I.gamepad, c: "#E05252" },
  media: { d: I.media, c: "#E0709A" },
  sega: { d: I.gamepad, c: "#3A7BD5" }, ps1: { d: I.gamepad, c: "#5AA9E6" }, ps2: { d: I.gamepad, c: "#5AA9E6" }, ps3: { d: I.gamepad, c: "#5AA9E6" }, psp: { d: I.gamepad, c: "#5AA9E6" }, vita3k: { d: I.gamepad, c: "#5AA9E6" },
  mt2: { d: I.tool, c: "#E3B14F" }, "mt manager": { d: I.tool, c: "#E3B14F" }, apkeditor: { d: I.tool, c: "#6FD3A8" },
  "smart launcher": { d: I.launcher, c: "#5AA9E6" }, smartlauncher: { d: I.launcher, c: "#5AA9E6" }, "mx player": { d: I.video, c: "#3A7BD5" }, mxplayer: { d: I.video, c: "#3A7BD5" },
};
// Настоящие системные папки — ТОЛЬКО для сортировки «сверху» (НЕ приложения)
const REAL_SYS = new Set(["android","alarms","audiobooks","dcim","documents","download","downloads","movies","music","notifications","pictures","podcasts","recordings","ringtones","screenshots","screenrecord","screenrecords","bluetooth","fonts","camera","data","media","obb","coloros","oppo","oneplus","heytap","realme","samsung","smartswitch","miui","xiaomi","huawei","vivo"]);
const ARCH_COLORS = { zip: "#E3B14F", rar: "#9B59B6", "7z": "#5AA9E6", tar: "#6FD3A8", gz: "#6FD3A8", xz: "#6FD3A8", bz2: "#6FD3A8", jar: "#E0574F" };
const fileIcon = (name) => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return { d: I.pdf, c: "#E0574F" };
  if (ext === "apk") return { d: I.apk, c: "#6FD3A8" };
  if (ext === "lnk") return { d: I.lnk, c: GOLD };
  if (["txt", "md", "log", "ini", "cfg"].includes(ext)) return { d: I.txt, c: "#9FD0FF" };
  if (EXT.img.includes(ext)) return { d: I.img, c: "#7FB3FF" };
  if (EXT.video.includes(ext)) return { d: I.video, c: "#C98BFF" };
  if (EXT.audio.includes(ext)) return { d: I.audio, c: "#FF9D6B" };
  if (EXT.archive.includes(ext)) return { d: I.archive, c: ARCH_COLORS[ext] || GOLD };
  if (EXT.code.includes(ext)) return { d: I.code, c: "#6FD3A8" };
  return { d: I.file, c: SUB };
};
const SORTS = [
  ["az", "Имя: А-Я / A-Z"], ["za", "Имя: Я-А / Z-A"],
  ["sizeD", "Размер: больше → меньше"], ["sizeA", "Размер: меньше → больше"],
  ["dateN", "Дата: новые сверху"], ["dateO", "Дата: старые сверху"],
];

export default function App() {
  const init0 = useRef(buildInitial());
  const [tabs, setTabs] = useState(init0.current.base);
  const [active, setActive] = useState(init0.current.active);
  const [entries, setEntries] = useState([]);
  const [curUri, setCurUri] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [selMode, setSelMode] = useState(false);
  const [clip, setClip] = useState(null);
  const [pasteMenu, setPasteMenu] = useState(false);
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef(false);
  const [query, setQuery] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [slide, setSlide] = useState(0);
  const [meta, setMeta] = useState(loadMeta);
  const [showHidden, setShowHidden] = useState(false);
  const [sortMode, setSortMode] = useState(() => ls.get(SORTKEY) || "az");
  const [sysTop, setSysTop] = useState(() => ls.get("fm_systop_v2") === "1");
  const [theme, setTheme] = useState(() => ls.get("fm_theme_v1") || "dark");
  const [themeBtn, setThemeBtn] = useState(() => ls.get("fm_themebtn_v1") !== "0");
  const FONT_KEY = "fm_fonts_v1";
  const BUILTIN_FONTS = [
    { id: "sys", name: "По умолчанию", css: "'Noto Sans',sans-serif" },
    { id: "comfortaa", name: "Comfortaa", css: "'Comfortaa',cursive" },
    { id: "roboto", name: "Roboto", css: "'Roboto',sans-serif" },
    { id: "verdana", name: "Verdana", css: "Verdana,Geneva,sans-serif" },
  ];
  const loadFonts = () => { try { const r = ls.get(FONT_KEY); return r ? JSON.parse(r) : { sel: "sys", custom: [] }; } catch { return { sel: "sys", custom: [] }; } };
  const [fonts, setFonts] = useState(loadFonts);
  const saveFonts = (f) => { try { ls.set(FONT_KEY, JSON.stringify(f)); } catch {} setFonts(f); };
  const allFonts = [...BUILTIN_FONTS, ...(fonts.custom || [])];
  const fontCss = (() => { const f = allFonts.find((x) => x.id === fonts.sel); return f ? f.css : "'Noto Sans',sans-serif"; })();
  useEffect(() => {
    let css = "";
    (fonts.custom || []).forEach((f) => { if (f.dataUrl) css += `@font-face{font-family:'${f.id}';src:url('${f.dataUrl}');}`; });
    let st = document.getElementById("fm-custom-fonts"); if (!st) { st = document.createElement("style"); st.id = "fm-custom-fonts"; document.head.appendChild(st); } st.textContent = css;
  }, [fonts.custom]);
  const fontFileRef = useRef(null);
  const onFontFile = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      const id = "cf_" + Date.now().toString(36);
      const name = f.name.replace(/\.(ttf|otf|woff2?)$/i, "");
      const nf = { id, name, css: `'${id}',sans-serif`, dataUrl: ev.target.result };
      saveFonts({ ...fonts, custom: [...(fonts.custom || []), nf], sel: id });
      showToast("Шрифт добавлен: " + name);
    };
    r.readAsDataURL(f); e.target.value = "";
  };
  const removeFont = (id) => {
    if (id === "sys") return;
    const isCustom = (fonts.custom || []).some((f) => f.id === id);
    const next = { ...fonts, sel: fonts.sel === id ? "sys" : fonts.sel };
    if (isCustom) next.custom = (fonts.custom || []).filter((f) => f.id !== id);
    saveFonts(next); showToast("Шрифт удалён");
  };
  const toggleTheme = () => { const t = theme === "dark" ? "light" : "dark"; setTheme(t); ls.set("fm_theme_v1", t); };
  const [headMenu, setHeadMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [settingsPage, setSettingsPage] = useState(null); // null=список, "theme"/"fonts"/"sort"/"icons"
  const [iconDB, setIconDB] = useState(() => loadMap(ICONKEY));
  const saveIconDB = (db) => { setIconDB(db); saveMap(ICONKEY, db); };
  const [thumbs, setThumbs] = useState({});
  const isImg = (n) => /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(n);
  const isPdf = (n) => /\.pdf$/i.test(n);
  const cfs = (u) => { try { return Capacitor.convertFileSrc(u); } catch { return u; } };
  const [tabsMenu, setTabsMenu] = useState(false);
  const [selMenu, setSelMenu] = useState(false);
  const [props, setProps] = useState(null);
  const [viewer, setViewer] = useState(null);       // { items:[entry], idx }
  const [viewerBar, setViewerBar] = useState(false); // видна ли панель
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [viewerDel, setViewerDel] = useState(false);
  const vTouch = useRef(null);
  const openViewer = (entry) => {
    const items = entries.filter((e) => e.type !== "directory" && isImg(e.name));
    const idx = items.findIndex((e) => e.name === entry.name);
    setViewer({ items, idx: idx < 0 ? 0 : idx }); setViewerBar(true); setDragX(0); setViewerDel(false);
  };
  const viewerGo = (d) => { setViewer((v) => { if (!v) return v; const ni = v.idx + d; if (ni < 0 || ni >= v.items.length) return v; return { ...v, idx: ni }; }); };
  const viewerCur = viewer && viewer.items[viewer.idx];
  const viewerDelete = async () => {
    if (!viewerCur) return; setViewerDel(false);
    try { await delTree(viewerCur); } catch {}
    setViewer((v) => { if (!v) return v; const items = v.items.filter((_, i) => i !== v.idx); if (items.length === 0) return null; return { items, idx: Math.min(v.idx, items.length - 1) }; });
    await refresh(); showToast("Удалено");
  };
  const [propCount, setPropCount] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [arcView, setArcView] = useState(null);
  const [pendingExtract, setPendingExtract] = useState(null); // { uri, names|null, label }
  const [menuArmed, setMenuArmed] = useState(false);
  useEffect(() => { if (openMenu) { setMenuArmed(false); const t = setTimeout(() => setMenuArmed(true), 320); return () => clearTimeout(t); } setMenuArmed(false); }, [openMenu && openMenu.file]);
  const [arcSel, setArcSel] = useState(new Set());
  const arcLp = useRef(false), arcLpT = useRef(null), arcPX = useRef(0), arcPY = useRef(0);
  const arcListRef = useRef(null), arcSpacerRef = useRef(null);
  useLayoutEffect(() => {
    const el = arcListRef.current, sp = arcSpacerRef.current;
    if (!el || !sp || !arcView || !arcView.entries) return;
    const ch = el.clientHeight, rowH = 72, n = arcView.entries.length;
    const pt = Math.max(0, ch - Math.min(4, n) * rowH);
    sp.style.height = pt + "px";
    const contentH = el.scrollHeight - pt;
    el.scrollTop = contentH >= ch ? pt : el.scrollHeight - ch;
  }, [arcView && arcView.entries]);
  const [shared, setShared] = useState([]);
  const checkShared = async () => {
    try {
      const r = await Apps.getShared();
      const files = r.files || [];
      setShared(files);
    } catch {}
  };
  const openSharedHere = async () => {
    try {
      const t = await Apps.saveSharedTemp();
      setShared([]);
      if (t && t.uri) await showOpenMenu({ name: t.name, uri: t.uri, type: "file" }, mimeOf(t.name));
    } catch (e) { showToast("Не удалось открыть: " + (e?.message || "")); }
  };
  useEffect(() => { checkShared(); const h = CapApp.addListener("resume", checkShared); return () => { h.then((x) => x.remove()).catch(() => {}); }; }, []);
  const saveSharedHere = async () => {
    try { const u = await Filesystem.getUri({ path, directory: DIR }); const r = await Apps.saveShared({ dir: u.uri }); showToast("Сохранено: " + (r.saved || 0) + " в " + (baseName(path) || "Storage")); setShared([]); refresh(); }
    catch (e) { showToast("Ошибка сохранения: " + (e?.message || "")); }
  };
  const dismissShared = async () => { try { await Apps.clearShared(); } catch {} setShared([]); };
  const extractSelected = () => { if (!arcSel.size) return; startExtract(arcView.uri, [...arcSel], arcView.name); };
  const [allFiles, setAllFiles] = useState(true); // {file, mime, apps, useDefault, editHide}

  const cur = tabs[active], path = cur?.path || "";
  const persist = (t) => { setTabs(t); saveTabs(t); };
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 1900); };
  const byName = (n) => entries.find((x) => x.name === n);
  const keyOf = (name) => join(path, name);
  const isHidden = (e) => meta.hidden.has(keyOf(e.name)) || e.name.startsWith(".");

  const applyMeta = (m) => { setMeta({ ...m }); saveMeta(m); };

  const list = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const u = await Filesystem.getUri({ path, directory: DIR });
      setCurUri(u.uri);
      let files;
      try { const r = await Apps.list({ uri: u.uri }); files = r.files; }
      catch (er) { showToast("Системное чтение недоступно: " + (er?.message || "ошибка плагина")); const r = await Filesystem.readdir({ path, directory: DIR }); files = r.files; }
      setEntries(files || []);
      if ((files || []).some((f) => f.name === ".icon" && f.type === "directory")) scanIconFolder(path);
    } catch (e) { setError(e.message || "Нет доступа к хранилищу"); setEntries([]); }
    setLoading(false);
  }, [path]);
  const scanIconFolder = async (folderPath) => {
    try {
      const fu = await Filesystem.getUri({ path: join(folderPath, ".icon"), directory: DIR });
      const r = await Apps.list({ uri: fu.uri });
      const pic = (r.files || []).find((f) => f.type !== "directory" && /\.(png|ico|jpg|jpeg|webp)$/i.test(f.name));
      if (!pic) return;
      const data = await Filesystem.readFile({ path: pic.uri });
      const ext = (pic.name.split(".").pop() || "png").toLowerCase();
      const mime = ext === "ico" ? "image/x-icon" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/" + ext;
      const db = loadMap(ICONKEY); db[folderPath] = "data:" + mime + ";base64," + data.data; saveIconDB(db);
      try { await Apps.delete({ uri: fu.uri }); } catch { try { await Filesystem.rmdir({ path: join(folderPath, ".icon"), directory: DIR, recursive: true }); } catch {} }
      showToast("Иконка папки сохранена: " + (baseName(folderPath) || "Storage"));
      refresh();
    } catch (e) { showToast("Иконка: " + (e?.message || "ошибка")); }
  };

  useEffect(() => { const t = THEMES[theme] || THEMES.dark; Apps.setBars({ color: t["--bg"], light: theme === "light" }).catch(() => {}); }, [theme]);
  useEffect(() => { Filesystem.rmdir({ path: "Download/.yevtmp", directory: DIR, recursive: true }).catch(() => {}); }, []);
  useEffect(() => { Filesystem.requestPermissions().catch(() => {}); checkAccess(); }, []);
  const checkAccess = async () => { try { const r = await Apps.hasAllFiles(); setAllFiles(!!r.granted); } catch { setAllFiles(true); } };
  const listRef = useRef(null);
  const spacerRef = useRef(null);
  const visLen = useRef(0);
  const scrollPos = useRef({});
  const pathKeyRef = useRef("");
  const restoring = useRef(false);
  const navRef = useRef(null);
  pathKeyRef.current = active + "|" + path;
  useLayoutEffect(() => {
    const el = listRef.current, sp = spacerRef.current; if (!el || !sp) return;
    const rowH = 72, n = visLen.current;
    // высота, перекрытая плавающей панелью снизу — контент уходит под неё
    let navH = 72;
    if (navRef.current) { const nr = navRef.current.getBoundingClientRect(), lr = el.getBoundingClientRect(); navH = Math.max(0, lr.bottom - nr.top); }
    el.style.paddingBottom = navH + "px";
    const ch = el.clientHeight; // включает paddingBottom
    const usable = ch - navH;   // видимая зона над панелью
    const pt = Math.max(0, usable - Math.min(4, n) * rowH);
    sp.style.height = pt + "px";
    const key = active + "|" + path;
    const saved = scrollPos.current[key];
    restoring.current = true;
    if (saved != null) el.scrollTop = saved;
    else {
      const rowsRegion = el.scrollHeight - pt - navH; // высота строк
      el.scrollTop = rowsRegion >= usable ? pt : Math.max(0, el.scrollHeight - ch);
    }
    requestAnimationFrame(() => { requestAnimationFrame(() => { restoring.current = false; }); });
  }, [path, active, entries, selMode, query, clip]);
  const onListScroll = (e) => { if (restoring.current) return; scrollPos.current[pathKeyRef.current] = e.currentTarget.scrollTop; };
  // Фоновая подгрузка превью: только видимые на экране строки, ограниченная нагрузка
  const thumbQueue = useRef([]);
  const thumbRunning = useRef(0);
  const thumbWanted = useRef(new Set());
  const THUMB_CONCURRENCY = 3;
  const pumpThumbs = useCallback(() => {
    while (thumbRunning.current < THUMB_CONCURRENCY && thumbQueue.current.length) {
      const uri = thumbQueue.current.shift();
      if (thumbs[uri] || !thumbWanted.current.has(uri)) continue;
      thumbRunning.current++;
      Apps.thumb({ uri })
        .then((r) => { if (r && r.thumb) setThumbs((m) => ({ ...m, [uri]: r.thumb })); })
        .catch(() => {})
        .finally(() => { thumbRunning.current--; setTimeout(pumpThumbs, 30); });
    }
  }, [thumbs]);
  const requestThumb = useCallback((uri) => {
    if (!uri || thumbs[uri] || thumbWanted.current.has(uri)) return;
    thumbWanted.current.add(uri);
    thumbQueue.current.push(uri);
    pumpThumbs();
  }, [thumbs, pumpThumbs]);
  const releaseThumb = useCallback((uri) => { thumbWanted.current.delete(uri); }, []);
  // очистка кэша превью раз за сессию
  useEffect(() => { Apps.thumbSweep && Apps.thumbSweep().catch(() => {}); }, []);
  // при смене папки сбрасываем очередь желаемых (новые строки сами запросят)
  useEffect(() => { thumbQueue.current = []; thumbWanted.current = new Set(); }, [path, active]);
  const silentRefresh = useCallback(async () => {
    try {
      const u = await Filesystem.getUri({ path, directory: DIR });
      let files;
      try { const r = await Apps.list({ uri: u.uri }); files = r.files; } catch { return; }
      setEntries((prev) => { const a = JSON.stringify((prev || []).map((x) => x.name + x.size + x.mtime)); const b = JSON.stringify((files || []).map((x) => x.name + x.size + x.mtime)); return a === b ? prev : (files || []); });
    } catch {}
  }, [path]);
  useEffect(() => {
    let h, t;
    const onChange = () => { clearTimeout(t); t = setTimeout(silentRefresh, 250); };
    Apps.addListener("fschange", onChange).then((l) => (h = l));
    return () => { clearTimeout(t); h && h.remove(); };
  }, [silentRefresh]);
  useEffect(() => { if (curUri) Apps.watch({ uri: curUri }).catch(() => {}); }, [curUri]);
  useEffect(() => { list(); exitSel(); setQuery(null); /* eslint-disable-next-line */ }, [active, path]);
  useEffect(() => { let h; CapApp.addListener("resume", () => list()).then((l) => (h = l)); return () => h && h.remove(); }, [list]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") { checkAccess(); list(); } };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [list]);
  useEffect(() => { ls.set(SORTKEY, sortMode); }, [sortMode]);
  useEffect(() => {
    if (!props || props.type !== "directory") { setPropCount(null); return; }
    (async () => { try { const { files } = await Filesystem.readdir({ path: props.uri }); setPropCount({ d: files.filter((f) => f.type === "directory").length, f: files.filter((f) => f.type !== "directory").length }); } catch { setPropCount(null); } })();
  }, [props]);

  const exitSel = () => { setSel(new Set()); setSelMode(false); setConfirmDel(null); setSelMenu(false); };
  const setTabPath = (p) => setTabs((ts) => ts.map((x, i) => (i === active ? { ...x, path: p } : x)));
  const goUp = () => { if (path) { setSlide(-1); setTimeout(() => setSlide(0), 300); setTabPath(parent(path)); } };
  const closeTab = (i) => { if (tabs.length === 1) return; const t = tabs.filter((_, idx) => idx !== i); persist(t); setActive(Math.max(0, Math.min(active, t.length - 1))); };

  const backRef = useRef(() => {});
  const backExit = useRef(0);
  backRef.current = () => {
    if (settings) { if (settingsPage) { setSettingsPage(null); return; } setSettings(false); return; }
    if (arcView && arcSel.size > 0) { setArcSel(new Set()); return; }
    if (arcView) { setArcView(null); return; }
    if (pasteMenu) { setPasteMenu(false); return; }
    if (openMenu) { setOpenMenu(null); return; }
    if (props) { setProps(null); return; }
    if (viewerDel) { setViewerDel(false); return; }
    if (viewer) { setViewer(null); return; }
    if (sheet) { setSheet(null); return; }
    if (tabsMenu) { setTabsMenu(false); return; }
    if (selMenu) { setSelMenu(false); return; }
    if (headMenu) { setHeadMenu(false); return; }
    if (confirmDel) { setConfirmDel(null); return; }
    if (createOpen) { setCreateOpen(false); return; }
    if (query !== null) { setQuery(null); return; }
    if (selMode) { exitSel(); return; }
    { const t = tabs[active]; const atStart = t && t.startup && (t.startupPath || "") === path; if (path && !atStart) { goUp(); return; } }
    const now = Date.now();
    if (now - backExit.current < 2000) { CapApp.exitApp(); }
    else { backExit.current = now; showToast("Нажмите «Назад» ещё раз для выхода"); }
  };
  useEffect(() => {
    let h;
    CapApp.addListener("backButton", () => backRef.current()).then((l) => (h = l));
    return () => { h && h.remove(); };
  }, []);

  const toggle = (name) => { const n = new Set(sel); n.has(name) ? n.delete(name) : n.add(name); setSel(n); setSelMode(n.size > 0); };
  const selectAll = () => {
    if (arcView && arcView.entries) { setArcSel(new Set(arcView.entries.map((e) => e.name))); return; }
    if (!visible.length) { showToast("Папка пуста"); return; }
    setSelMode(true); setSel(new Set(visible.map((e) => e.name)));
  };

  const openExternal = async (e) => {
    const mime = mimeOf(e.name);
    const ext = (e.name.split(".").pop() || "").toLowerCase();
    // apk и архивы — всегда меню выбора (там есть «Открыть как архив»), без авто-привязки
    if (EXT.archive.includes(ext)) { await showOpenMenu(e, mime); return; }
    const cat = defaultOpenAs(e.name);
    const defs = loadMap(DEFKEY);
    const d = defs[cat] || defs[mime];
    if (d) { try { const [pkg, act] = d.split("|"); await Apps.open({ uri: e.uri, mime, packageName: pkg, activityName: act }); return; } catch {} }
    await showOpenMenu(e, mime);
  };
  const showOpenMenu = async (e, mime, opts) => {
    const edit = !!(opts && opts.edit);
    const cat = OPEN_AS.some(([m]) => m === mime) ? mime : defaultOpenAs(e.name);
    setOpenMenu({ file: e, mime: cat, apps: null, useDefault: false, editHide: false, edit });
    if (/\.apk$/i.test(e.name)) { Apps.apkInfo({ uri: e.uri }).then((info) => setOpenMenu((m) => (m && m.file === e ? { ...m, apkInfo: info } : m))).catch(() => {}); }
    try {
      const { apps } = await Apps.query({ uri: e.uri, mime, action: edit ? "edit" : "view" });
      setOpenMenu((m) => (m && m.file === e ? { ...m, apps: apps || [] } : m));
    } catch (err) { setOpenMenu((m) => (m && m.file === e ? { ...m, apps: [] } : m)); showToast("Ошибка: " + (err?.message || "")); }
  };
  const pickApp = async (app) => {
    const om = openMenu;
    if (om.editHide) {
      const hm = loadMap(HIDEKEY); const arr = new Set(hm[om.mime] || []);
      const id = app.packageName + "|" + app.activityName;
      arr.has(id) ? arr.delete(id) : arr.add(id);
      hm[om.mime] = [...arr]; saveMap(HIDEKEY, hm); setOpenMenu({ ...om }); return;
    }
    const defs = loadMap(DEFKEY);
    if (om.edit) { setOpenMenu(null); try { await Apps.open({ uri: om.file.uri, mime: mimeOf(om.file.name), packageName: app.packageName, activityName: app.activityName, action: "edit" }); } catch (err) { showToast("Не удалось открыть: " + (err?.message || "")); } return; }
    const dkey = defaultOpenAs(om.file.name);
    if (om.useDefault) { defs[dkey] = app.packageName + "|" + app.activityName; saveMap(DEFKEY, defs); }
    else if (defs[dkey]) { delete defs[dkey]; saveMap(DEFKEY, defs); } // разовый выбор — сбросить прежнюю привязку
    setOpenMenu(null);
    try { await Apps.open({ uri: om.file.uri, mime: mimeOf(om.file.name), packageName: app.packageName, activityName: app.activityName }); }
    catch (err) { showToast("Не удалось открыть: " + (err?.message || "")); }
  };
  const arcAnchor = useRef(null);
  const absPath = async (rel) => { const u = await Filesystem.getUri({ path: rel, directory: DIR }); let p = u.uri; if (p.startsWith("file://")) p = p.slice(7); try { p = decodeURIComponent(p); } catch {} return p; };
  const extractAllTo = async (uri, destRel, names) => {
    const destDir = await absPath(destRel);
    let sub = null;
    try { sub = await Apps.addListener("opProgress", (ev) => setProgress({ current: ev.done, total: ev.total, name: ev.name, mode: "ext" })); } catch {}
    setProgress({ current: 0, total: (names ? names.length : 1), name: "", mode: "ext" });
    try {
      await Apps.zipExtractAll({ uri, dest: destDir, entries: names || undefined });
      showToast("Извлечено в " + (baseName(destRel) || "Storage"));
    } catch (e) { showToast("Ошибка: " + (e?.message || "")); }
    if (sub) try { sub.remove(); } catch {}
    setProgress(null); await refresh();
  };
  const startExtract = (uri, names, label) => { setOpenMenu(null); setArcView(null); setArcSel(new Set()); setPendingExtract({ uri, names: names || null, label: label || "архив" }); };
  const doExtractHere = async () => { const pe = pendingExtract; setPendingExtract(null); if (pe) await extractAllTo(pe.uri, path, pe.names); };
  const arcBase = (n) => n.replace(/\.[^.]+$/, "");
  const openArchive = async (e) => {
    setOpenMenu(null);
    setArcView({ name: e.name, uri: e.uri, entries: null });
    try {
      const r = await Apps.zipList({ uri: e.uri });
      const entries = (r.entries || []).filter((x) => !x.dir).map((x) => ({ name: x.name, size: x.size || 0 })).sort((a, b) => a.name.localeCompare(b.name));
      setArcView({ name: e.name, uri: e.uri, entries });
    } catch (err) { setArcView(null); showToast("Не удалось открыть архив: " + (err?.message || "")); }
  };
  const extractOpen = async (entry) => {
    setArcView((m) => (m ? { ...m, busy: "Извлекаю…" } : m));
    try {
      const fname = entry.name.split("/").pop();
      const destDir = await absPath("Download/.yevtmp");
      await Apps.zipExtract({ uri: arcView.uri, entry: entry.name, dest: destDir + "/" + fname });
      const u = await Filesystem.getUri({ path: "Download/.yevtmp/" + fname, directory: DIR });
      setArcView(null);
      const fe = { name: fname, uri: u.uri, type: "file" };
      if (/\.apk$/i.test(fname)) await showOpenMenu(fe, mimeOf(fname)); // меню с вариантами (Установить / Открыть с помощью)
      else await Apps.open({ uri: u.uri, mime: mimeOf(fname) });
    } catch (err) { setArcView((m) => (m ? { ...m, busy: null } : m)); showToast("Не удалось открыть: " + (err?.message || "")); }
  };
  const resetDefault = () => { const defs = loadMap(DEFKEY); const f = openMenu.file; delete defs[openMenu.mime]; delete defs[mimeOf(f.name)]; delete defs[defaultOpenAs(f.name)]; saveMap(DEFKEY, defs); showToast("Привязка сброшена"); };
  const open = (e, ev) => {
    if (selMode) { toggle(e.name); return; }
    if (e.type === "directory") { setSlide(1); setTimeout(() => setSlide(0), 300); setTabPath(join(path, e.name)); return; }
    arcAnchor.current = ev && ev.currentTarget ? ev.currentTarget.getBoundingClientRect().top : null;
    const ext = (e.name.split(".").pop() || "").toLowerCase();
    if (isImg(e.name)) {
      const mime = mimeOf(e.name), cat = defaultOpenAs(e.name), defs = loadMap(DEFKEY), d = defs[cat] || defs[mime];
      if (d === "__viewer__") { openViewer(e); return; }
      if (d) { const [pkg, act] = d.split("|"); Apps.open({ uri: e.uri, mime, packageName: pkg, activityName: act }).catch(() => showOpenMenu(e, mime)); return; }
      showOpenMenu(e, mime); return;
    }
    if (EXT.archive.includes(ext)) { showOpenMenu(e, mimeOf(e.name)); return; }
    openExternal(e);
  };

  const addTab = () => { const id = Date.now(); const t = [...tabs, { id, path: "" }]; persist(t); setActive(t.length - 1); };
  const switchTab = (dir) => { const ni = active + dir; if (ni < 0 || ni >= tabs.length) return; setSlide(dir); setActive(ni); setTimeout(() => setSlide(0), 300); };
  const sx = useRef(0), sy = useRef(0), swiped = useRef(false);
  const onTS = (e) => { sx.current = e.touches[0].clientX; sy.current = e.touches[0].clientY; swiped.current = false; };
  const onTM = (e) => { const dx = e.touches[0].clientX - sx.current, dy = e.touches[0].clientY - sy.current; if (!swiped.current && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) { swiped.current = true; switchTab(dx > 0 ? -1 : 1); } };
  const tabRefs = useRef([]);
  const tabDrag = useRef({ from: -1, x0: 0, active: false });
  const moveTab = (from, to) => { setTabs((arr) => { const a = [...arr]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a; }); setActive(to); };
  const persistCurrent = () => setTabs((cur) => { saveTabs(cur); return cur; });
  const onTabDown = (ev, i) => { const d = tabDrag.current; d.from = i; d.x0 = ev.clientX; d.active = false; };
  const onTabMove = (ev) => {
    const d = tabDrag.current; if (d.from < 0) return;
    if (!d.active && Math.abs(ev.clientX - d.x0) > 12) d.active = true;
    if (d.active) {
      let target = d.from;
      for (let j = 0; j < tabRefs.current.length; j++) { const el = tabRefs.current[j]; if (!el) continue; const r = el.getBoundingClientRect(); if (ev.clientX >= r.left && ev.clientX <= r.right) { target = j; break; } }
      if (target !== d.from && target >= 0) { moveTab(d.from, target); d.from = target; }
    }
  };
  const onTabUp = (i) => { const d = tabDrag.current; if (d.active) { d.active = false; persistCurrent(); } else { const dir = i > active ? 1 : i < active ? -1 : 0; if (dir) { setSlide(dir); setTimeout(() => setSlide(0), 300); } setActive(i); } d.from = -1; };

  const saveAllTabs = () => { setTabsMenu(false); const t = tabs.map((x) => ({ ...x, saved: true })); persist(t); showToast("Вкладки сохранены"); };
  const startupHere = () => { setTabsMenu(false); const t = tabs.map((x, i) => ({ ...x, startup: i === active, startupPath: i === active ? path : x.startupPath, saved: i === active ? true : x.saved })); persist(t); showToast("Запуск при открытии: " + (path ? baseName(path) : "Storage")); };
  const resetTabs = () => { setTabsMenu(false); setTabs((arr) => { const t = arr.map((x) => ({ ...x, saved: false, startup: false })); saveTabs(t); return t; }); showToast("Вкладки сброшены"); };

  /* операции через .uri */
  const refresh = () => list();
  const targetUri = (name) => (curUri ? curUri + "/" + name : null);
  const doCreateFolder = async (name) => { setSheet(null); if (!name) return; try { await Filesystem.mkdir({ path: targetUri(name) }); refresh(); } catch (e) { showToast("Ошибка: " + e.message); } };
  const doCreateTxt = async (name) => { setSheet(null); if (!name) return; if (!/\.txt$/i.test(name)) name += ".txt"; try { await Filesystem.writeFile({ path: targetUri(name), data: "", encoding: Encoding.UTF8 }); refresh(); } catch (e) { showToast("Ошибка: " + e.message); } };
  const doCreateNomedia = async () => { try { await Filesystem.writeFile({ path: targetUri(".nomedia"), data: "", encoding: Encoding.UTF8 }); refresh(); showToast("Создан .nomedia"); } catch (e) { showToast("Ошибка: " + e.message); } };
  const doRename = async (oldName, newName) => { setSheet(null); if (!newName || newName === oldName) return; const e = byName(oldName); if (!e) return; try { await Filesystem.rename({ from: e.uri, to: targetUri(newName) }); exitSel(); refresh(); } catch (er) { showToast("Ошибка: " + er.message); } };
  const delTree = async (e) => {
    try { const r = await Apps.delete({ uri: e.uri }); if (r && r.deleted) return; } catch {}
    // фолбэк
    if (e.type === "directory") {
      try { const { files } = await Apps.list({ uri: e.uri }); for (const f of files) await delTree(f); } catch {}
      await Filesystem.rmdir({ path: e.uri, recursive: true });
    } else await Filesystem.deleteFile({ path: e.uri });
  };
  const doDelete = async () => {
    const items = [...sel].map(byName).filter(Boolean); setConfirmDel(null);
    cancelRef.current = false; let ok = 0, fail = 0;
    setProgress({ current: 0, total: items.length, name: "", mode: "del" });
    for (let i = 0; i < items.length; i++) {
      if (cancelRef.current) break;
      const e = items[i];
      setProgress((p) => ({ ...(p || {}), current: i, total: items.length, name: e.name, mode: "del" }));
      Apps.notifyProgress({ title: "Удаление", text: e.name, progress: i, max: items.length }).catch(() => {});
      try { await delTree(e); ok++; } catch { fail++; }
      setProgress((p) => ({ ...(p || {}), current: i + 1, total: items.length, mode: "del" }));
    }
    setProgress(null); Apps.cancelNotify().catch(() => {});
    exitSel(); await refresh();
    showToast(cancelRef.current ? "Отменено" : fail ? "Не удалено: " + fail + (ok ? ", удалено: " + ok : "") : "Удалено: " + ok);
  };
  const grab = (mode) => {
    const items = [...sel].map((n) => { const e = byName(n); return e ? { name: n, uri: e.uri, type: e.type } : null; }).filter(Boolean);
    if (!items.length) return;
    setClip((q) => [...(q || []), { id: Date.now() + Math.random(), mode, items, srcPath: path }]);
    exitSel();
    showToast((mode === "copy" ? "Копировать: " : "Вырезать: ") + items.length + " об.");
  };
  const runTask = async (task) => {
    for (const it of task.items) {
      const to = targetUri(it.name);
      if (!to || it.uri === to) continue;
      if (it.type === "directory" && curUri && curUri === it.uri) continue;
      try {
        if (task.mode === "copy") {
          if (it.type === "directory") await Apps.copyTree({ from: it.uri, to });
          else await Filesystem.copy({ from: it.uri, to });
        } else await Filesystem.rename({ from: it.uri, to });
      } catch (e) { showToast(it.name + ": " + e.message); }
    }
  };
  const runQueue = async (queue) => {
    const all = [];
    for (const t of queue) for (const it of t.items) all.push({ it, mode: t.mode });
    const total = all.length; cancelRef.current = false;
    setProgress({ current: 0, total, name: "", unit: "items" });
    // подписка на по-файловый прогресс из нативного copyTree
    let sub = null;
    try { sub = await Apps.addListener("opProgress", (ev) => { setProgress((p) => (p ? { ...p, sub: { done: ev.done, total: ev.total, name: ev.name } } : p)); }); } catch {}
    for (let i = 0; i < all.length; i++) {
      if (cancelRef.current) break;
      const { it, mode } = all[i];
      setProgress((p) => ({ ...(p || {}), current: i, total, name: it.name, mode, sub: null }));
      const to = targetUri(it.name);
      if (it.type === "directory" && curUri && curUri === it.uri) { continue; }
      if (to && it.uri !== to) {
        try {
          if (mode === "copy") {
            if (it.type === "directory") await Apps.copyTree({ from: it.uri, to });
            else { await Filesystem.copy({ from: it.uri, to }); Apps.notifyProgress({ title: "Копирование", text: it.name, progress: i + 1, max: total }).catch(() => {}); }
          } else { await Filesystem.rename({ from: it.uri, to }); Apps.notifyProgress({ title: "Перемещение", text: it.name, progress: i + 1, max: total }).catch(() => {}); }
        } catch (e) { showToast(it.name + ": " + e.message); }
      }
      setProgress((p) => ({ ...(p || {}), current: i + 1, total, sub: null }));
    }
    if (sub && sub.remove) sub.remove();
    setProgress(null); Apps.cancelNotify().catch(() => {});
    await refresh(); showToast(cancelRef.current ? "Отменено" : "Готово");
  };
  const pasteAll = async () => { const q = clip || []; setPasteMenu(false); setClip(null); await runQueue(q); };
  const pasteOne = async (task) => { setPasteMenu(false); setClip((q) => (q || []).filter((t) => t.id !== task.id)); await runQueue([task]); };
  const dropTask = (id) => setClip((q) => { const n = (q || []).filter((t) => t.id !== id); return n.length ? n : null; });

  /* три точки тулбара: скрыть / закрепить */
  const metaToggle = (which) => {
    const m = loadMeta();
    for (const n of sel) { const k = keyOf(n);
      if (which === "hidden") { m.hidden.has(k) ? m.hidden.delete(k) : m.hidden.add(k); }
      if (which === "top") { m.pinBot.delete(k); m.pinTop.has(k) ? m.pinTop.delete(k) : m.pinTop.add(k); }
      if (which === "bot") { m.pinTop.delete(k); m.pinBot.has(k) ? m.pinBot.delete(k) : m.pinBot.add(k); }
      if (which === "unpin") { m.pinTop.delete(k); m.pinBot.delete(k); }
    }
    applyMeta(m); setSelMenu(false); exitSel();
    showToast(which === "hidden" ? "Готово" : which === "unpin" ? "Откреплено" : "Закреплено");
  };

  const copyPath = async (p) => { try { await navigator.clipboard.writeText(p); showToast("Путь скопирован"); } catch { showToast("Не удалось скопировать"); } };

  /* отображаемый список: фильтр скрытых -> поиск -> сортировка -> папки сверху -> пины */
  const cmp = (a, b) => {
    if (sortMode === "az") return a.name.localeCompare(b.name, "ru");
    if (sortMode === "za") return b.name.localeCompare(a.name, "ru");
    if (sortMode === "sizeA") return (a.size || 0) - (b.size || 0);
    if (sortMode === "sizeD") return (b.size || 0) - (a.size || 0);
    if (sortMode === "dateN") return (b.mtime || 0) - (a.mtime || 0);
    if (sortMode === "dateO") return (a.mtime || 0) - (b.mtime || 0);
    return 0;
  };
  let visible = entries.filter((e) => showHidden || !isHidden(e));
  if (query) visible = visible.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
  const isSysFolder = (e) => e.type === "directory" && REAL_SYS.has(e.name.toLowerCase());
  const rank = (e) => (meta.pinTop.has(keyOf(e.name)) ? -1 : meta.pinBot.has(keyOf(e.name)) ? 1 : 0);
  visible = [...visible].sort((a, b) => {
    // 1) закреплённые сверху/снизу
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    // 2) системные папки сверху (если включено)
    if (sysTop) {
      const sa = isSysFolder(a) ? 0 : 1, sb = isSysFolder(b) ? 0 : 1;
      if (sa !== sb) return sa - sb;
    }
    // 3) папки выше файлов
    const ad = a.type === "directory", bd = b.type === "directory";
    if (ad !== bd) return ad ? -1 : 1;
    // 4) обычная сортировка
    return cmp(a, b);
  });

  const lpTimer = useRef(), lpFired = useRef(false), moved = useRef(false), pX = useRef(0), pY = useRef(0);
  const rDown = (ev, e) => { lpFired.current = false; moved.current = false; pX.current = ev.clientX; pY.current = ev.clientY; lpTimer.current = setTimeout(() => { lpFired.current = true; buzz(15); toggle(e.name); }, 450); };
  const rMove = (ev) => { if (Math.abs(ev.clientX - pX.current) > 10 || Math.abs(ev.clientY - pY.current) > 10) { moved.current = true; clearTimeout(lpTimer.current); } };
  const rUp = (e, ev) => { clearTimeout(lpTimer.current); if (lpFired.current || moved.current) return; open(e, ev); };

  const one = sel.size === 1 ? byName([...sel][0]) : null;

  return (
    <div style={{ ...S.app, ...(THEMES[theme] || THEMES.dark), fontFamily: fontCss }}>
      <style>{`html,body{background:${(THEMES[theme] || THEMES.dark)["--bg"]}}@import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;600;700&family=Roboto:wght@400;500;700&display=swap');`}</style>
      {/* ВКЛАДКИ + действия шапки */}
      <div style={S.tabsbar}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 6px" }}>
          <button style={{ ...S.hbtn, width: 28, height: 28 }} onClick={() => setTabsMenu((v) => !v)}><Svg d={I.chev} size={18} /></button>
          {tabsMenu && (
            <>
              <div style={S.overlay} onClick={() => setTabsMenu(false)} />
              <div style={{ ...S.menu, position: "fixed", top: 46, left: 4, zIndex: 1200, transformOrigin: "top left" }}>
                <div style={S.menuItem} onClick={saveAllTabs}><span style={{ color: ACC, display: "flex" }}><Svg d={I.pin} size={20} /></span>Сохранить вкладки</div>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={startupHere}><span style={{ color: GOLD, display: "flex" }}><Svg d={I.home} size={20} /></span>Запуск при открытии</div>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={resetTabs}><span style={{ color: SUB, display: "flex" }}><Svg d={I.x} size={20} /></span>Сбросить вкладки</div>
                {tabs.length > 1 && <>
                  <div style={{ height: 1, background: LINE }} />
                  <div style={S.menuItem} onClick={() => { setTabsMenu(false); closeTab(active); }}><span style={{ color: RED, display: "flex" }}><Svg d={I.x} size={20} /></span>Закрыть вкладку</div>
                </>}
              </div>
            </>
          )}
        </div>
        <div style={S.tabs}>
          {tabs.map((t, i) => (
            <div key={t.id} ref={(el) => (tabRefs.current[i] = el)}
              onPointerDown={(ev) => onTabDown(ev, i)} onPointerMove={onTabMove} onPointerUp={() => onTabUp(i)} onPointerCancel={() => onTabUp(i)}
              style={{ ...S.tab, ...(i === active ? S.tabActive : {}) }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>{t.path ? baseName(t.path) : "Storage"}</span>
            </div>
          ))}
        </div>
        <div style={{ position: "relative" }}>
          <button style={S.hbtn} onClick={() => setHeadMenu((v) => !v)}><Svg d={I.dots} size={22} /></button>
          {headMenu && (
            <>
              <div style={S.overlay} onClick={() => setHeadMenu(false)} />
              <div style={{ ...S.menu, top: 46, right: 4, transformOrigin: "top right" }}>
                <div style={S.menuItem} onClick={() => { setHeadMenu(false); addTab(); }}>
                  <span style={{ color: ACC, display: "flex" }}><Svg d={I.plus} size={20} /></span>Новая вкладка
                </div>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={() => { setHeadMenu(false); setSheet({ kind: "sort" }); }}>
                  <span style={{ color: ACC, display: "flex" }}><Svg d={I.sort} size={20} /></span>Сортировка
                </div>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={() => { setShowHidden((v) => !v); setHeadMenu(false); refresh(); }}>
                  <span style={{ color: showHidden ? ACC : SUB, display: "flex" }}><Svg d={showHidden ? I.eye : I.eyeOff} size={20} /></span>
                  Скрытые объекты
                  <span style={{ marginLeft: "auto", ...S.tgl, ...(showHidden ? S.tglOn : {}) }}><span style={{ ...S.knob, ...(showHidden ? S.knobOn : {}) }} /></span>
                </div>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={() => { setHeadMenu(false); setSettings(true); setSettingsPage(null); }}>
                  <span style={{ color: ACC, display: "flex" }}><Svg d={I.gear} size={20} /></span>Настройки
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ПУТЬ */}
      <div style={S.crumb}>
        <span style={{ flex: 1, display: "flex", alignItems: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {path ? <span onClick={goUp} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: ACC }}><Svg d={I.back} size={18} /> {path}</span>
            : <span style={{ color: SUB }}>/storage</span>}
        </span>
        {themeBtn && (
          <button onClick={toggleTheme} aria-label="Тема"
            style={{ position: "absolute", right: 12, top: "calc(100% + 4px)", zIndex: 7, width: 34, height: 34, borderRadius: 17, border: "none", background: BAR, color: ACC, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, margin: 0, lineHeight: 0, boxShadow: "0 1px 0 rgba(255,255,255,.05) inset, 0 3px 10px rgba(0,0,0,.20)" }}>
            <Svg d={theme === "light" ? I.sun : I.moon} size={18} />
          </button>
        )}
      </div>

      {!allFiles && (
        <div style={S.accessBar}>
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>Нет доступа ко всем файлам — архивы, PDF и APK не видны.</div>
          <button style={S.accessBtn} onClick={() => Apps.requestAllFiles().catch(() => {})}>Дать доступ</button>
        </div>
      )}
      {shared.length > 0 && (
        <>
          <div style={S.savePop}>
            <Svg d={I.dl} size={20} />
            <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.35 }}>{shared.length === 1 ? "«" + shared[0].name + "»" : shared.length + " файл(ов)"} — открыть или сохранить сюда?</span>
          </div>
          <div style={S.saveBar}>
            <button style={S.saveBtnOpen} onClick={openSharedHere}><Svg d={I.folder} size={16} /> Открыть</button>
            <button style={S.saveBtnSave} onClick={saveSharedHere}><Svg d={I.check} size={16} /> Сохранить</button>
            <button style={S.saveBtnCancel} onClick={dismissShared}>Отмена</button>
          </div>
        </>
      )}
      {pendingExtract && (
        <>
          <div style={S.savePop}>
            <Svg d={I.dl} size={20} />
            <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.35 }}>Из «{pendingExtract.label}»{pendingExtract.names ? " (" + pendingExtract.names.length + ")" : ""} — перейдите в папку и нажмите «Извлечь сюда»</span>
          </div>
          <div style={S.saveBar}>
            <button style={S.saveBtnCancel} onClick={() => setPendingExtract(null)}>Отмена</button>
            <button style={S.saveBtnSave} onClick={doExtractHere}><Svg d={I.dl} size={16} /> Извлечь сюда</button>
          </div>
        </>
      )}
      {/* СПИСОК */}
      <main ref={listRef} style={S.list} onScroll={onListScroll} onTouchStart={onTS} onTouchMove={onTM}>
        {false && (
          <div style={S.accessBar}>
            <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>Нет доступа ко всем файлам — архивы, PDF и APK не видны.</div>
            <button style={S.accessBtn} onClick={() => Apps.requestAllFiles().catch(() => {})}>Дать доступ</button>
          </div>
        )}
        <div key={active + "|" + path} style={{ ...S.slideWrap, marginTop: 0, willChange: "transform", animation: slide ? `fm-in-${slide > 0 ? "r" : "l"} .28s cubic-bezier(.22,.61,.36,1)` : "none" }}>
          {loading && null}
          {error && <div style={{ ...S.note, color: RED }}>{error}<br /><span style={{ fontSize: 12 }}>Разрешите «Доступ ко всем файлам» в настройках приложения.</span></div>}
          {!loading && !error && visible.length === 0 && <div style={S.note}>Пусто</div>}
          <div ref={spacerRef} style={{ height: 0 }} />
          {(() => {
            const renderRow = (e) => {
              const isSel = sel.has(e.name), hid = isHidden(e);
              const isDir = e.type === "directory";
              const sf = isDir ? SYS_FOLDERS[e.name.toLowerCase()] : null;
              const ic = isDir ? { d: (sf && sf.d) || I.folder, c: (sf && sf.c) || ACC } : fileIcon(e.name);
              const pinned = meta.pinTop.has(keyOf(e.name)) || meta.pinBot.has(keyOf(e.name));
              return (
                <div key={e.name} style={{ ...S.row, ...(isDir ? S.rowDir : {}), ...(isSel ? S.rowSel : {}), opacity: hid ? 0.5 : 1 }}
                  onPointerDown={(ev) => rDown(ev, e)} onPointerMove={rMove} onPointerUp={(ev) => rUp(e, ev)} onPointerCancel={() => clearTimeout(lpTimer.current)}>
                  <span style={{ ...S.iconWrap, color: ic.c, background: isSel ? "transparent" : "var(--chip)", overflow: "hidden", position: "relative" }}
                    onPointerDown={(ev) => ev.stopPropagation()} onPointerUp={(ev) => { ev.stopPropagation(); clearTimeout(lpTimer.current); toggle(e.name); }}>
                    {(isDir && iconDB[keyOf(e.name)]) ? <img src={iconDB[keyOf(e.name)]} alt="" style={S.iconImg} />
                      : (!isDir && (isImg(e.name) || isPdf(e.name) || /\.apk$/i.test(e.name))) ?
                          <ThumbIcon uri={e.uri} cached={thumbs[e.uri]} request={requestThumb} release={releaseThumb}
                            fallback={/\.apk$/i.test(e.name) ? <Svg d={ic.d} size={24} /> : isPdf(e.name) ? <Svg d={ic.d} size={24} /> : <Svg d={ic.d} size={24} />} />
                      : (!isDir && EXT.archive.includes((e.name.split(".").pop() || "").toLowerCase())) ? <ArcBadge name={e.name} />
                      : <Svg d={ic.d} size={24} />}
                    {isDir && !iconDB[keyOf(e.name)] && e.thumb ? <img src={cfs(e.thumb)} alt="" loading="lazy" style={S.folderThumb} /> : null}
                  </span>
                  <span style={S.rowMid}>
                    <span style={{ ...S.name, fontWeight: isDir ? 600 : 400, display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                      {isDir && startupPath != null && join(path, e.name) === startupPath && <span style={{ color: GOLD, display: "flex", flexShrink: 0 }}><Svg d={I.home} size={15} /></span>}
                    </span>
                    {!isDir && e.mtime ? <span style={S.rowDate}>{fmtDate(e.mtime)}</span> : null}
                  </span>
                  {pinned && <span style={{ color: SUB, display: "flex" }}><Svg d={meta.pinTop.has(keyOf(e.name)) ? I.pinT : I.pinB} size={14} /></span>}
                  <span style={S.rowSize}>{isDir ? (e.count != null ? "(" + e.count + ")" : "") : fmtSizeShort(e.size)}</span>
                  {!isDir && <div style={S.rowLine} />}
                </div>
              );
            };
            const firstFile = visible.findIndex((e) => e.type !== "directory");
            const startupPath = (tabs.find((t) => t.startup) || {}).startupPath;
            visLen.current = visible.length;
            return visible.map((e, i) => (
              <React.Fragment key={e.name}>
                {renderRow(e)}
              </React.Fragment>
            ));
          })()}
        </div>
      </main>

      {/* ПОИСК */}
      {query !== null && (
        <div style={S.searchBar}>
          <input autoFocus value={query} placeholder="Поиск в папке…" onChange={(e) => setQuery(e.target.value)} style={S.searchInput} />
          <button style={S.searchClose} onClick={() => setQuery(null)}>×</button>
        </div>
      )}

      {/* НИЖНЯЯ ПАНЕЛЬ (плавает над списком — контент уходит под неё) */}
      <div ref={navRef} style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 60, pointerEvents: "none" }}>
       <div style={{ pointerEvents: "auto" }}>
      {selMode ? (
        <nav style={{ ...S.bottom, justifyContent: "flex-start" }}>
          <div style={S.selCount}>
            <span key={sel.size} style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1, display: "block", textAlign: "center", animation: "pulse .3s cubic-bezier(.2,.9,.3,1.3)" }}>{sel.size}</span>
          </div>
          <div style={{ display: "flex", overflowX: "auto", flex: 1, justifyContent: "flex-start" }}>
            <Btn onClick={exitSel} icon={I.x} label="Отмена" flexNone />
            <Btn onClick={() => setProps(one)} icon={I.info} label="Свойства" flexNone disabled={sel.size !== 1} />
            <Btn onClick={() => grab("cut")} icon={I.cut} label="Вырезать" flexNone />
            <Btn onClick={() => grab("copy")} icon={I.copy} label="Копир." flexNone />
            <Btn onClick={(ev) => { const t = ev.currentTarget; const r = t.getBoundingClientRect(); const p = t.previousElementSibling; const cr = p ? p.getBoundingClientRect() : r; setConfirmDel({ cx: cr.left + cr.width / 2, top: r.top }); }} icon={I.trash} label="Удалить" red flexNone />
            <Btn onClick={() => { const e = one; const sp = splitExt(e.name, e.type === "directory"); setSheet({ kind: "rename", old: e.name, base: sp.base, ext: sp.ext, editExt: false }); }} icon={I.rename} label="Имя" flexNone disabled={sel.size !== 1} />
            <Btn onClick={() => setSelMenu((v) => !v)} icon={I.dots} label="Ещё" flexNone />
          </div>
        </nav>
      ) : (
        <nav style={S.bottom}>
          <Zone><Btn onClick={() => setQuery(query === null ? "" : null)} icon={I.search} label="Поиск" /></Zone>
          <Zone>{clip && clip.length > 0 ? <Btn onClick={() => setClip(null)} icon={I.x} label="Отмена" red /> : null}</Zone>
          <Zone><Btn onClick={selectAll} icon={I.selectAll} label="Все" /></Zone>
          <Zone>{clip && clip.length > 0 ? <Btn onClick={() => (clip.length === 1 ? pasteAll() : setPasteMenu((v) => !v))} icon={I.paste} label={"Вставить (" + clip.length + ")"} /> : null}</Zone>
          <Zone><Btn onClick={() => setCreateOpen((v) => !v)} icon={I.plus} label="Создать" /></Zone>
        </nav>
      )}
       </div>
      </div>

      {/* МЕНЮ «СОЗДАТЬ» (поверх тулбара) */}
      {createOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 1190 }} onClick={() => setCreateOpen(false)} />
          <div style={{ ...S.menu, position: "fixed", right: 8, bottom: "calc(62px + env(safe-area-inset-bottom))", zIndex: 1200, minWidth: 150, transformOrigin: "bottom right" }}>
            <div style={S.createItem} onClick={() => { setCreateOpen(false); doCreateNomedia(); }}>.nomedia</div>
            <div style={{ height: 1, background: LINE }} />
            <div style={S.createItem} onClick={() => { setCreateOpen(false); setSheet({ kind: "folder", val: "" }); }}>Папка</div>
            <div style={{ height: 1, background: LINE }} />
            <div style={S.createItem} onClick={() => { setCreateOpen(false); setSheet({ kind: "txt", val: "" }); }}>TXT</div>
          </div>
        </>
      )}

      {/* МЕНЮ «ЕЩЁ» выделения (поверх тулбара) */}
      {selMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 1190 }} onClick={() => setSelMenu(false)} />
          <div style={{ ...S.menu, position: "fixed", right: 8, bottom: "calc(56px + env(safe-area-inset-bottom))", zIndex: 1200, transformOrigin: "bottom right" }}>
            {one && one.type === "directory" && (
              <>
                <div style={S.menuItem} onClick={() => { const t = [...tabs, { id: Date.now(), path: keyOf(one.name) }]; persist(t); setSelMenu(false); exitSel(); setActive(t.length - 1); }}>
                  <span style={{ color: ACC, display: "flex" }}><Svg d={I.folder} size={20} /></span>Открыть во вкладке
                </div>
                <div style={{ height: 1, background: LINE }} />
              </>
            )}
            {(() => { const allHid = [...sel].every((n) => meta.hidden.has(keyOf(n))); return (
              <div style={S.menuItem} onClick={() => metaToggle("hidden")}>
                <span style={{ color: SUB, display: "flex" }}><Svg d={allHid ? I.eye : I.eyeOff} size={20} /></span>{allHid ? "Показать" : "Скрыть"}
              </div>
            ); })()}
            <div style={{ height: 1, background: LINE }} />
            {(() => {
              const pinnedNow = [...sel].every((n) => meta.pinTop.has(keyOf(n)) || meta.pinBot.has(keyOf(n)));
              if (pinnedNow) return <div style={S.menuItem} onClick={() => metaToggle("unpin")}><span style={{ color: ACC, display: "flex" }}><Svg d={I.x} size={20} /></span>Открепить</div>;
              return (<>
                <div style={S.menuItem} onClick={() => metaToggle("top")}><span style={{ color: ACC, display: "flex" }}><Svg d={I.pinT} size={20} /></span>Закрепить сверху</div>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={() => metaToggle("bot")}><span style={{ color: ACC, display: "flex" }}><Svg d={I.pinB} size={20} /></span>Закрепить снизу</div>
              </>);
            })()}
            {one && one.type !== "directory" && (
              <>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={() => { setSelMenu(false); const e = one; exitSel(); showOpenMenu(e, mimeOf(e.name)); }}><span style={{ color: TXT, display: "flex" }}><Svg d={I.dots} size={20} /></span>Открыть с помощью</div>
              </>
            )}
            {one && /\.apk$/i.test(one.name) && (
              <>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={() => { setSelMenu(false); Apps.installApk({ uri: one.uri }).catch((er) => showToast("Ошибка: " + (er?.message || ""))); }}><span style={{ color: "#6FD3A8", display: "flex" }}><Svg d={I.plus} size={20} /></span>Установить</div>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={() => { setSelMenu(false); Apps.uninstall({ uri: one.uri }).catch((er) => showToast("Ошибка: " + (er?.message || ""))); }}><span style={{ color: RED, display: "flex" }}><Svg d={I.trash} size={20} /></span>Деинсталлировать</div>
              </>
            )}
          </div>
        </>
      )}

      {/* НИЖНИЕ ПОПАПЫ */}
      {sheet && (
        <div style={S.backdrop} onClick={() => setSheet(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            {sheet.kind === "folder" && <SheetInput title="Новая папка" value={sheet.val} placeholder="Имя папки" onChange={(v) => setSheet({ ...sheet, val: v })} onCancel={() => setSheet(null)} onOk={() => doCreateFolder(sheet.val.trim())} okText="Создать" />}
            {sheet.kind === "txt" && <SheetInput title="Новый TXT-файл" value={sheet.val} placeholder="Имя файла" onChange={(v) => setSheet({ ...sheet, val: v })} onCancel={() => setSheet(null)} onOk={() => doCreateTxt(sheet.val.trim())} okText="Создать" />}
            {sheet.kind === "rename" && (
              <>
                <div style={S.sheetTitle}>Переименовать</div>
                <input autoFocus value={sheet.editExt ? sheet.ext : sheet.base} placeholder={sheet.editExt ? "расширение" : "имя"}
                  onChange={(e) => setSheet({ ...sheet, [sheet.editExt ? "ext" : "base"]: e.target.value })} style={S.sheetField} />
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={S.sheetGhost} onClick={() => setSheet({ ...sheet, editExt: !sheet.editExt })}>{sheet.editExt ? "Имя" : "Расширение"}</button>
                  <button style={S.sheetGhost} onClick={() => setSheet(null)}>Отмена</button>
                  <button style={S.sheetOk} onClick={() => { const nn = sheet.base.trim() + (sheet.ext.trim() ? "." + sheet.ext.trim() : ""); doRename(sheet.old, nn); }}>ОК</button>
                </div>
              </>
            )}
            {sheet.kind === "sort" && (
              <>
                <div style={S.sheetTitle}>Сортировка</div>
                {SORTS.map(([k, lbl]) => (
                  <div key={k} style={{ ...S.sortRow, ...(sortMode === k ? { color: ACC } : {}) }} onClick={() => { setSortMode(k); setSheet(null); }}>
                    {lbl}{sortMode === k && <span style={{ marginLeft: "auto" }}>✓</span>}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* СВОЙСТВА */}
      {/* ПРОСМОТРЩИК ИЗОБРАЖЕНИЙ */}
      {viewer && viewerCur && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1300, background: "#000", display: "flex", flexDirection: "column", touchAction: "none", overflow: "hidden" }}>
          <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}
            onTouchStart={(e) => { const t = e.touches[0]; vTouch.current = { x: t.clientX, y: t.clientY, t: Date.now() }; setDragging(true); }}
            onTouchMove={(e) => { if (!vTouch.current) return; const t = e.touches[0]; const dx = t.clientX - vTouch.current.x; const dy = t.clientY - vTouch.current.y; if (Math.abs(dx) > Math.abs(dy)) setDragX(dx); }}
            onTouchEnd={(e) => {
              setDragging(false);
              const v = vTouch.current; vTouch.current = null; if (!v) { setDragX(0); return; }
              const t = e.changedTouches[0]; const dx = t.clientX - v.x; const dy = t.clientY - v.y; const dt = Date.now() - v.t;
              if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 300) { setViewerBar((b) => !b); setDragX(0); return; }
              const TH = Math.min(45, window.innerWidth * 0.10);
              const flick = dt < 260 && Math.abs(dx) > 28;
              if ((dx < -TH || (flick && dx < 0)) && viewer.idx < viewer.items.length - 1) viewerGo(1);
              else if ((dx > TH || (flick && dx > 0)) && viewer.idx > 0) viewerGo(-1);
              setDragX(0);
            }}>
            <img key={viewerCur.uri} src={cfs(viewerCur.uri)} alt={viewerCur.name}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", transform: "translateX(" + dragX + "px)", transition: dragging ? "none" : "transform .2s ease", userSelect: "none", pointerEvents: "none" }} />
          </div>

          {/* заголовок сверху: имя + счётчик + крестик справа */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: "env(safe-area-inset-top)", background: "linear-gradient(to bottom, rgba(0,0,0,.75), transparent)", transform: viewerBar ? "translateY(0)" : "translateY(-110%)", transition: "transform .2s ease", pointerEvents: viewerBar ? "auto" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px 16px" }}>
              <span style={{ flex: 1, minWidth: 0, color: "#fff", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewerCur.name}</span>
              <span style={{ color: "rgba(255,255,255,.7)", fontSize: 13, flexShrink: 0 }}>{viewer.idx + 1}/{viewer.items.length}</span>
            </div>
          </div>

          {/* тулбар снизу: справа-налево — удалить, свойства, поделиться, редактировать */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: "env(safe-area-inset-bottom)", background: "linear-gradient(to top, rgba(0,0,0,.8), transparent)", transform: viewerBar ? "translateY(0)" : "translateY(110%)", transition: "transform .2s ease", pointerEvents: viewerBar ? "auto" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-end", padding: "16px 76px 14px 8px" }}>
              {[
                [I.share, "Поделиться", () => Apps.share({ uri: viewerCur.uri, mime: mimeOf(viewerCur.name) }).catch(() => {}), false],
                [I.rename, "Изменить", () => showOpenMenu(viewerCur, mimeOf(viewerCur.name), { edit: true }), false],
                [I.info, "Свойства", () => setProps(viewerCur), false],
                [I.trash, "Удалить", () => setViewerDel(true), true],
              ].map(([ic, lbl, fn, red], i) => (
                <span key={i} onClick={fn} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, color: red ? "#FF6B6B" : "#fff", minWidth: 60, padding: "4px 2px" }}>
                  <Svg d={ic} size={23} /><span style={{ fontSize: 11 }}>{lbl}</span>
                </span>
              ))}
            </div>
          </div>

          {/* крестик закрытия — правый нижний угол */}
          <div style={{ position: "absolute", right: 14, bottom: 0, paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)", transform: viewerBar ? "translateY(0)" : "translateY(110%)", transition: "transform .2s ease", pointerEvents: viewerBar ? "auto" : "none", zIndex: 2 }}>
            <span onClick={() => setViewer(null)} style={{ display: "flex", width: 44, height: 44, borderRadius: 22, background: "rgba(0,0,0,.5)", border: "1px solid rgba(255,255,255,.25)", color: "#fff", alignItems: "center", justifyContent: "center" }}><Svg d={I.x} size={24} /></span>
          </div>

          {/* подтверждение удаления в просмотрщике */}
          {viewerDel && (
            <div style={{ position: "fixed", inset: 0, zIndex: 1360, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setViewerDel(false)}>
              <div onClick={(e) => e.stopPropagation()} style={{ background: BAR, borderRadius: 16, padding: 18, width: "78%", maxWidth: 320, boxShadow: "0 18px 48px rgba(0,0,0,.6)" }}>
                <div style={{ color: TXT, fontSize: 15, marginBottom: 4 }}>Удалить файл?</div>
                <div style={{ color: SUB, fontSize: 13, marginBottom: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewerCur.name}</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => setViewerDel(false)} style={{ background: ROW2, border: "1px solid " + LINE, borderRadius: 10, color: SUB, fontSize: 14, padding: "9px 20px" }}>Нет</button>
                  <button onClick={viewerDelete} style={{ background: RED, border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, padding: "9px 20px" }}>Да</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {props && (
        <div style={S.backdrop} onClick={() => setProps(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={S.sheetTitle}>{props.name}</div>
            <Prop k="Путь (нажмите, чтобы скопировать)" v={path ? "/" + keyOf(props.name) : "/" + props.name} onClick={() => copyPath(props.uri)} link />
            {props.type === "directory" && <Prop k="Содержимое" v={propCount ? propCount.d + " папок, " + propCount.f + " файлов" : "…"} />}
            <Prop k="Вес" v={props.type === "directory" ? "—" : fmtSize(props.size)} />
            <Prop k="Изменено" v={ago(props.mtime)} />
            <Prop k="Тип" v={props.type === "directory" ? "Папка" : (props.name.includes(".") ? props.name.split(".").pop().toUpperCase() : "Файл")} />
            <Prop k="Скрытый" v={isHidden(props) ? "Да" : "Нет"} />
            <button style={{ ...S.sheetGhost, width: "100%", marginTop: 14 }} onClick={() => setProps(null)}>Закрыть</button>
          </div>
        </div>
      )}

      {/* ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ — над кнопкой «Удалить» */}
      {confirmDel && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 1290 }} onClick={() => setConfirmDel(null)} />
          <div style={{ position: "fixed", zIndex: 1300, left: Math.max(80, Math.min(confirmDel.cx, window.innerWidth - 80)), transform: "translateX(-50%)", top: confirmDel.top - 56, display: "flex", gap: 8, background: BAR, border: "1px solid " + LINE, borderRadius: 14, padding: 8, boxShadow: "0 1px 0 rgba(255,255,255,.07) inset, 0 4px 12px rgba(0,0,0,.4), 0 18px 48px rgba(0,0,0,.62)", animation: "popCenter .15s ease" }}>
            <button onClick={doDelete} style={{ background: RED, border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, padding: "8px 18px" }}>Да</button>
            <button onClick={() => setConfirmDel(null)} style={{ background: ROW2, border: "1px solid " + LINE, borderRadius: 8, color: SUB, fontSize: 14, padding: "8px 18px" }}>Нет</button>
          </div>
        </>
      )}

      {/* ПРОСМОТР АРХИВА — как папка */}
      {arcView && (
        <div style={S.arcScreen}>
          <div style={{ ...S.crumb, borderBottom: "none" }}>
            <span onClick={() => setArcView(null)} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: ACC }}><Svg d={I.back} size={18} /> {arcView.name}</span>
          </div>
          {arcView.busy && <div style={{ position: "absolute", top: 50, left: 0, right: 0, zIndex: 5, padding: "8px 16px", color: GOLD, fontSize: 13, textAlign: "center", pointerEvents: "none", textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>{arcView.busy}</div>}
          {arcView.entries == null ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: SUB }}>Открываю архив…</div>
          ) : (
          <div ref={arcListRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            <div ref={arcSpacerRef} style={{ height: 0 }} />
            <div>
              {arcView.entries.map((it, i) => {
                const ic = fileIcon(it.name);
                const asel = arcSel.has(it.name);
                const tog = () => { const n = new Set(arcSel); n.has(it.name) ? n.delete(it.name) : n.add(it.name); setArcSel(n); };
                return (
                  <div key={i}
                    onClick={() => { if (arcSel.size > 0) tog(); else if (!arcLp.current) extractOpen(it); }}
                    onPointerDown={(ev) => { arcLp.current = false; arcPX.current = ev.clientX; arcPY.current = ev.clientY; clearTimeout(arcLpT.current); arcLpT.current = setTimeout(() => { arcLp.current = true; tog(); }, 400); }}
                    onPointerUp={() => clearTimeout(arcLpT.current)}
                    onPointerMove={(ev) => { if (Math.abs(ev.clientX - arcPX.current) > 10 || Math.abs(ev.clientY - arcPY.current) > 10) clearTimeout(arcLpT.current); }}
                    onPointerCancel={() => clearTimeout(arcLpT.current)}
                    style={{ ...S.row, ...(asel ? { background: "var(--accbg)" } : {}) }}>
                    <span style={{ ...S.iconWrap, color: ic.c, background: asel ? "transparent" : "var(--chip)" }}
                      onClick={(ev) => { ev.stopPropagation(); tog(); }}>
                      {asel ? <span style={S.cbk}><Svg d={I.check} size={14} /></span>
                        : /\.apk$/i.test(it.name) ? <Svg d={ic.d} size={24} />
                        : (EXT.archive.includes((it.name.split(".").pop() || "").toLowerCase())) ? <ArcBadge name={it.name} />
                        : <Svg d={ic.d} size={24} />}
                    </span>
                    <span style={S.rowMid}>
                      <span style={S.name}>{it.name}</span>
                      <span style={S.rowDate}>в архиве</span>
                    </span>
                    <span style={S.rowSize}>{fmtSizeShort(it.size)}</span>
                    <div style={S.rowLine} />
                  </div>
                );
              })}
            </div>
          </div>
          )}
          {arcSel.size > 0 && (
            <div style={S.arcSelBar}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{arcSel.size}</span>
              <button onClick={() => setArcSel(new Set())} style={S.arcSelCancel}>Отмена</button>
              <button onClick={extractSelected} style={S.arcSelGo}><Svg d={I.dl} size={16} /> Извлечь</button>
            </div>
          )}
        </div>
      )}

      {/* МЕНЮ ОТКРЫТИЯ ФАЙЛА */}
      {openMenu && (() => {
        const hidden = new Set(loadMap(HIDEKEY)[openMenu.mime] || []);
        const apps = openMenu.apps || [];
        const shown = openMenu.editHide ? apps : apps.filter((a) => !hidden.has(a.packageName + "|" + a.activityName));
        return (
          <div style={{ ...S.backdrop, pointerEvents: menuArmed ? "auto" : "none" }} onClick={() => setOpenMenu(null)}>
            <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
              {/\.apk$/i.test(openMenu.file.name) && openMenu.apkInfo && (
                <div style={{ padding: "10px 12px", margin: "0 0 12px", background: ROW2, borderRadius: 12, fontSize: 13, lineHeight: 1.7, color: SUB }}>
                  {openMenu.apkInfo.label && <div style={{ color: TXT, fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{openMenu.apkInfo.label}</div>}
                  {openMenu.apkInfo.package && <div style={{ color: "#7FB4E6", wordBreak: "break-all" }}>{openMenu.apkInfo.package}</div>}
                  {openMenu.apkInfo.versionName && <div>Версия: <span style={{ color: TXT }}>{openMenu.apkInfo.versionName} ({openMenu.apkInfo.versionCode})</span></div>}
                  {openMenu.apkInfo.installed && <div>Установлено: <span style={{ color: GOLD }}>{openMenu.apkInfo.installedVersionName || "—"}</span></div>}
                  <div>Целевая ОС: <span style={{ color: TXT }}>SDK {openMenu.apkInfo.targetSdk}</span></div>
                  {openMenu.apkInfo.minSdk != null && <div>Минимальная ОС: <span style={{ color: TXT }}>SDK {openMenu.apkInfo.minSdk}</span></div>}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
                <div style={{ ...S.sheetTitle, marginBottom: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{openMenu.file.name}</div>
                <button style={{ ...S.iconBtn, color: openMenu.editHide ? ACC : SUB }} onClick={() => setOpenMenu({ ...openMenu, editHide: !openMenu.editHide })}><Svg d={I.rename} size={20} /></button>
              </div>
              {(() => { const isArc = EXT.archive.includes((openMenu.file.name.split(".").pop() || "").toLowerCase()) && !/\.apk$/i.test(openMenu.file.name); return (isArc || isImg(openMenu.file.name) || openMenu.edit) ? null : (<>
              <div style={{ fontSize: 12, color: SUB, marginBottom: 6 }}>Открыть как:</div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, paddingBottom: 2 }}>
                {OPEN_AS.map(([m, lbl]) => (
                  <button key={m} onClick={() => showOpenMenu(openMenu.file, m)}
                    style={{ ...S.chip, ...(openMenu.mime === m ? S.chipOn : {}) }}>{lbl}</button>
                ))}
              </div>
              </>); })()}
              {openMenu.editHide && <div style={{ fontSize: 12, color: GOLD, marginBottom: 10 }}>Нажмите на приложение, чтобы скрыть/показать его</div>}
              <div style={{ maxHeight: "42vh", overflowY: "auto" }}>
                {openMenu.apps == null && <div style={{ color: SUB, padding: 20, textAlign: "center" }}>Загрузка приложений…</div>}
                {openMenu.apps && shown.length === 0 && <div style={{ color: SUB, padding: 16, textAlign: "center" }}>Нет приложений</div>}
                {shown.map((a) => {
                  const id = a.packageName + "|" + a.activityName;
                  const isHid = hidden.has(id);
                  return (
                    <div key={id} onClick={() => pickApp(a)} style={{ ...S.appRow, opacity: isHid ? 0.45 : 1 }}>
                      {a.icon ? <img src={a.icon} alt="" style={{ width: 38, height: 38, borderRadius: 9 }} />
                        : <span style={{ color: SUB, display: "flex" }}><Svg d={I.file} size={32} /></span>}
                      <span style={{ flex: 1, fontSize: 15 }}>{a.label}</span>
                      {openMenu.editHide && <span style={{ color: isHid ? SUB : ACC, display: "flex" }}><Svg d={isHid ? I.eyeOff : I.eye} size={20} /></span>}
                    </div>
                  );
                })}
              </div>
              {!openMenu.editHide && !openMenu.edit && isImg(openMenu.file.name) && (
                <div onClick={() => { const f = openMenu.file; if (openMenu.useDefault) { const defs = loadMap(DEFKEY); defs[defaultOpenAs(f.name)] = "__viewer__"; saveMap(DEFKEY, defs); } else { const defs = loadMap(DEFKEY); if (defs[defaultOpenAs(f.name)]) { delete defs[defaultOpenAs(f.name)]; saveMap(DEFKEY, defs); } } setOpenMenu(null); openViewer(f); }} style={{ ...S.appRow, color: GOLD }}>
                  <span style={{ width: 38, display: "flex", justifyContent: "center" }}><Svg d={I.img} size={26} /></span>
                  <span style={{ flex: 1, fontSize: 15 }}>Открыть</span>
                </div>
              )}
              {!openMenu.editHide && EXT.archive.includes((openMenu.file.name.split(".").pop() || "").toLowerCase()) && !/\.apk$/i.test(openMenu.file.name) && (
                <>
                  <div onClick={() => openArchive(openMenu.file)} style={{ ...S.appRow, color: GOLD }}>
                    <span style={{ width: 38, display: "flex", justifyContent: "center" }}><Svg d={I.folder} size={26} /></span>
                    <span style={{ flex: 1, fontSize: 15 }}>Открыть</span>
                  </div>
                  <div onClick={() => startExtract(openMenu.file.uri, null, openMenu.file.name)} style={{ ...S.appRow, color: TXT }}>
                    <span style={{ width: 38, display: "flex", justifyContent: "center" }}><Svg d={I.dl} size={22} /></span>
                    <span style={{ flex: 1, fontSize: 15 }}>Распаковать в…</span>
                  </div>
                  <div onClick={() => { const f = openMenu.file; setOpenMenu(null); extractAllTo(f.uri, join(path, arcBase(f.name)), null); }} style={{ ...S.appRow, color: TXT }}>
                    <span style={{ width: 38, display: "flex", justifyContent: "center" }}><Svg d={I.folder} size={22} /></span>
                    <span style={{ flex: 1, fontSize: 15 }}>Распаковать в папку «{arcBase(openMenu.file.name)}»</span>
                  </div>
                  <div onClick={() => { const f = openMenu.file; setOpenMenu(null); extractAllTo(f.uri, path, null); }} style={{ ...S.appRow, color: TXT }}>
                    <span style={{ width: 38, display: "flex", justifyContent: "center" }}><Svg d={I.dl} size={22} /></span>
                    <span style={{ flex: 1, fontSize: 15 }}>Распаковать здесь</span>
                  </div>
                </>
              )}
              {!openMenu.editHide && /\.apk$/i.test(openMenu.file.name) && (
                <div onClick={() => { setOpenMenu(null); Apps.installApk({ uri: openMenu.file.uri }).catch((er) => showToast("Ошибка: " + (er?.message || ""))); }}
                  style={{ ...S.appRow, color: "#6FD3A8" }}>
                  <span style={{ width: 38, display: "flex", justifyContent: "center" }}><Svg d={I.plus} size={28} /></span>
                  <span style={{ flex: 1, fontSize: 15 }}>Установить / Обновить</span>
                </div>
              )}
              {!openMenu.editHide && !openMenu.edit && (
                <>
                  <div onClick={() => setOpenMenu({ ...openMenu, useDefault: !openMenu.useDefault })}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 2px", cursor: "pointer" }}>
                    <span style={{ ...S.cbox, ...(openMenu.useDefault ? S.cboxOn : {}) }}>{openMenu.useDefault ? "✓" : ""}</span>
                    <span style={{ fontSize: 14 }}>Использовать по умолчанию</span>
                  </div>
                  <button style={{ ...S.sheetGhost, width: "100%", color: RED, borderColor: LINE }} onClick={resetDefault}>Сбросить привязку</button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* НАСТРОЙКИ */}
      {settings && (
        <div style={S.settingsScreen}>
          <div style={S.crumb}>
            <span onClick={() => { if (settingsPage) setSettingsPage(null); else setSettings(false); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: ACC }}>
              <Svg d={I.back} size={18} /> {settingsPage === "theme" ? "Тема" : settingsPage === "fonts" ? "Шрифты" : settingsPage === "sort" ? "Сортировка" : settingsPage === "icons" ? "Иконки папок" : "Настройки"}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px calc(20px + env(safe-area-inset-bottom))" }}>
            {settingsPage === null && (
              <>
                {[["theme", I.sun, "Тема"], ["fonts", I.rename, "Шрифты"], ["sort", I.sort, "Сортировка"], ["icons", I.folder, "Иконки папок"]].map(([pg, ic, lbl]) => (
                  <div key={pg} style={S.menuItem} onClick={() => setSettingsPage(pg)}>
                    <span style={{ color: ACC, display: "flex" }}><Svg d={ic} size={20} /></span>
                    <span style={{ flex: 1 }}>{lbl}</span>
                    <span style={{ color: SUB, display: "flex", transform: "rotate(180deg)" }}><Svg d={I.back} size={18} /></span>
                  </div>
                ))}
                <div style={{ color: SUB, fontSize: 11, textAlign: "center", marginTop: 18 }}>Версия {APP_VERSION}</div>
              </>
            )}
            {settingsPage === "theme" && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  {[["dark", "Тёмная"], ["light", "Светлая"]].map(([t, lbl]) => (
                    <button key={t} onClick={() => { setTheme(t); ls.set("fm_theme_v1", t); }}
                      style={{ flex: 1, height: 44, borderRadius: 14, fontSize: 14, fontWeight: 600, background: theme === t ? "var(--accbg)" : "transparent", border: "1px solid " + (theme === t ? ACC : LINE), color: theme === t ? ACC : TXT }}>{lbl}</button>
                  ))}
                </div>
                <div style={S.menuItem} onClick={() => { const v = !themeBtn; setThemeBtn(v); ls.set("fm_themebtn_v1", v ? "1" : "0"); }}>
                  <span style={{ color: themeBtn ? ACC : SUB, display: "flex" }}><Svg d={theme === "dark" ? I.sun : I.moon} size={20} /></span>
                  Кнопка темы в шапке
                  <span style={{ marginLeft: "auto", ...S.tgl, ...(themeBtn ? S.tglOn : {}) }}><span style={{ ...S.knob, ...(themeBtn ? S.knobOn : {}) }} /></span>
                </div>
              </>
            )}
            {settingsPage === "fonts" && (
              <>
                {allFonts.map((f) => (
                  <div key={f.id} style={{ ...S.menuItem, justifyContent: "flex-start" }}>
                    <span onClick={() => saveFonts({ ...fonts, sel: f.id })} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 22, color: fonts.sel === f.id ? ACC : "transparent", display: "flex" }}><Svg d={I.check} size={18} /></span>
                      <span style={{ fontFamily: f.css, fontSize: 15 }}>{f.name}</span>
                    </span>
                    {f.id !== "sys" && <span onClick={() => removeFont(f.id)} style={{ color: RED, display: "flex", padding: 4 }}><Svg d={I.trash} size={18} /></span>}
                  </div>
                ))}
                <input ref={fontFileRef} type="file" accept=".ttf,.otf,.woff,.woff2" onChange={onFontFile} style={{ display: "none" }} />
                <div style={S.menuItem} onClick={() => fontFileRef.current && fontFileRef.current.click()}>
                  <span style={{ color: ACC, display: "flex" }}><Svg d={I.plus} size={20} /></span>
                  Добавить шрифт (TTF/OTF)
                </div>
              </>
            )}
            {settingsPage === "sort" && (
              <div style={S.menuItem} onClick={() => { const v = !sysTop; setSysTop(v); ls.set("fm_systop_v2", v ? "1" : "0"); }}>
                <span style={{ color: sysTop ? ACC : SUB, display: "flex" }}><Svg d={I.folder} size={20} /></span>
                Системные папки всегда сверху
                <span style={{ marginLeft: "auto", ...S.tgl, ...(sysTop ? S.tglOn : {}) }}><span style={{ ...S.knob, ...(sysTop ? S.knobOn : {}) }} /></span>
              </div>
            )}
            {settingsPage === "icons" && (
              <>
                <div style={{ color: SUB, fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
                  Чтобы задать иконку папке — создайте в ней папку <span style={{ color: GOLD }}>.icon</span> и положите туда PNG/ICO. Иконка сохранится сюда, а файл удалится.
                </div>
                {Object.keys(iconDB).length === 0 && <div style={{ color: SUB, padding: 16, textAlign: "center" }}>Пока нет изменённых иконок</div>}
                {Object.keys(iconDB).map((k) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 2px", borderBottom: "1px solid " + LINE }}>
                    <img src={iconDB[k]} alt="" style={{ width: 40, height: 40, borderRadius: 11, objectFit: "cover", flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{baseName(k) || "Storage"}</span>
                      <span style={{ fontSize: 11, color: SUB, wordBreak: "break-all", display: "block" }}>{"Internal/" + (k || "")}</span>
                    </span>
                    <span onClick={() => { const db = { ...iconDB }; delete db[k]; saveIconDB(db); }} style={{ color: RED, display: "flex", padding: 6 }}><Svg d={I.trash} size={18} /></span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* МЕНЮ ЗАДАЧ БУФЕРА */}
      {pasteMenu && clip && clip.length > 0 && (
        <div style={S.backdrop} onClick={() => setPasteMenu(false)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...S.sheetTitle }}>Буфер ({clip.length})</div>
            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {clip.slice().reverse().map((t, idx) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 2px", borderBottom: "1px solid " + LINE }}>
                  <span style={{ color: t.mode === "cut" ? GOLD : "#6FD3A8", display: "flex" }}><Svg d={t.mode === "cut" ? I.cut : I.copy} size={20} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, display: "block" }}>{clip.length - idx}. {t.items.length === 1 ? t.items[0].name : t.items.length + " объектов"}</span>
                    <span style={{ fontSize: 12, color: SUB }}>{t.mode === "cut" ? "переместить" : "копировать"}{t.srcPath ? " · из " + (baseName(t.srcPath) || "Storage") : ""}</span>
                  </span>
                  <span onClick={() => dropTask(t.id)} style={{ color: SUB, display: "flex", padding: 4 }}><Svg d={I.x} size={18} /></span>
                </div>
              ))}
            </div>
            <button style={{ ...S.accessBtn, width: "100%", marginTop: 14, padding: "12px" }} onClick={pasteAll}>Всё сюда</button>
          </div>
        </div>
      )}

      {/* МЕНЮ ЗАДАЧ — конец */}
      {/* ПРОГРЕСС КОПИРОВАНИЯ */}
      {progress && !progress.bg && (() => {
        // процент: если есть по-файловый прогресс внутри элемента — учитываем его
        const sub = progress.sub;
        const pct = progress.total ? Math.round(((progress.current + (sub && sub.total ? sub.done / sub.total : 0)) / progress.total) * 100) : 0;
        const label = progress.mode === "del" ? "Удаление" : progress.mode === "cut" ? "Перемещение" : "Копирование";
        return (
        <div style={S.backdrop}>
          <div style={{ ...S.sheet, paddingBottom: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.sheetTitle}>{label} {Math.min(progress.current + (sub ? 1 : 0), progress.total)}/{progress.total}{pct >= 100 && <span style={{ display: "inline-block", marginLeft: 8, color: ACC, verticalAlign: "middle", animation: "pulse .4s cubic-bezier(.2,.9,.3,1.4)" }}><Svg d={I.check} size={18} /></span>}</div>
            <div style={{ height: 8, background: ROW2, borderRadius: 4, overflow: "hidden", margin: "6px 0 12px" }}>
              <div style={{ height: "100%", width: pct + "%", background: ACC, transition: "width .2s", boxShadow: pct >= 100 ? "0 0 12px " + ACC : "none" }} />
            </div>
            <div style={{ fontSize: 13, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 16 }}>{sub && sub.name ? sub.name : progress.name}{sub && sub.total ? "  (" + sub.done + "/" + sub.total + ")" : ""}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.sheetGhost, flex: 1, borderColor: LINE }} onClick={() => setProgress((p) => ({ ...p, bg: true }))}>Свернуть в уведомления</button>
              <button style={{ ...S.sheetGhost, flex: 1, color: RED, borderColor: LINE }} onClick={() => { cancelRef.current = true; }}>Отменить</button>
            </div>
          </div>
        </div>
        );
      })()}
      {progress && progress.bg && (() => {
        const sub = progress.sub;
        const pct = progress.total ? Math.round(((progress.current + (sub && sub.total ? sub.done / sub.total : 0)) / progress.total) * 100) : 0;
        const label = progress.mode === "del" ? "Удаление" : progress.mode === "cut" ? "Перемещение" : "Копирование";
        return (
        <div onClick={() => setProgress((p) => ({ ...p, bg: false }))} style={{ position: "fixed", left: 12, right: 12, bottom: "calc(78px + env(safe-area-inset-bottom))", zIndex: 1400, background: BAR, border: "1px solid " + LINE, borderRadius: 16, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 0 rgba(255,255,255,.06) inset, 0 2px 6px rgba(0,0,0,.35), 0 12px 32px rgba(0,0,0,.55)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: TXT }}>{label} {Math.min(progress.current + (sub ? 1 : 0), progress.total)}/{progress.total}</div>
            <div style={{ height: 4, background: ROW2, borderRadius: 2, overflow: "hidden", marginTop: 5 }}>
              <div style={{ height: "100%", width: pct + "%", background: ACC, transition: "width .2s" }} />
            </div>
          </div>
          <span onClick={(e) => { e.stopPropagation(); cancelRef.current = true; }} style={{ color: RED, display: "flex", padding: 4 }}><Svg d={I.x} size={18} /></span>
        </div>
        );
      })()}

      {toast && <div style={S.toast}>{toast}</div>}

      <style>{`
        @keyframes fm-in-r{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @keyframes fm-in-l{from{transform:translateX(-100%)}to{transform:translateX(0)}}
        @keyframes dropGrow{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
        @keyframes sUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fS{from{opacity:0}to{opacity:1}}
        @keyframes cbPop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.25)}100%{transform:scale(1);opacity:1}}
        @keyframes pulse{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
        @keyframes toastUp{0%{transform:translateX(-50%) translateY(40px);opacity:0}65%{transform:translateX(-50%) translateY(-6px);opacity:1}100%{transform:translateX(-50%) translateY(0)}}
        @keyframes popCenter{from{opacity:0;transform:translateX(-50%) scale(.9)}to{opacity:1;transform:translateX(-50%) scale(1)}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
        input{-webkit-user-select:text;user-select:text}
        body{margin:0}::-webkit-scrollbar{width:0}
      `}</style>
    </div>
  );
}

const Zone = ({ children }) => <div style={{ flex: 1, display: "flex" }}>{children}</div>;
const Prop = ({ k, v, onClick, link }) => (
  <div onClick={onClick} style={{ padding: "10px 0", borderBottom: "1px solid " + LINE }}>
    <div style={{ fontSize: 12, color: SUB, marginBottom: 3 }}>{k}</div>
    <div style={{ fontSize: 14, color: link ? ACC : TXT, wordBreak: "break-all" }}>{v}</div>
  </div>
);
function SheetInput({ title, value, placeholder, onChange, onCancel, onOk, okText }) {
  return (
    <>
      <div style={S.sheetTitle}>{title}</div>
      <input autoFocus value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onOk()} style={S.sheetField} />
      <div style={{ display: "flex", gap: 10 }}>
        <button style={S.sheetGhost} onClick={onCancel}>Отмена</button>
        <button style={S.sheetOk} onClick={onOk}>{okText}</button>
      </div>
    </>
  );
}
function Btn({ onClick, icon, text, label, accent, red, flexNone, disabled }) {
  const color = disabled ? "#5c4d3e" : red ? RED : accent ? ACC : TXT;
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...S.btn, flex: flexNone ? "none" : 1, minWidth: flexNone ? 52 : undefined, color }}>
      <span style={{ display: "flex", height: 30, alignItems: "center", fontSize: 26, fontWeight: 700 }}>{icon ? <Svg d={icon} size={28} /> : text}</span>
      {label ? <span style={S.btnLabel}>{label}</span> : null}
    </button>
  );
}

const S = {
  app: { position: "relative", display: "flex", flexDirection: "column", height: "100vh", background: BG, color: TXT, fontFamily: "system-ui,-apple-system,Roboto,sans-serif", overflow: "hidden" },
  tabsbar: { display: "flex", alignItems: "center", background: BAR, flexShrink: 0, height: 50, margin: "8px 8px 6px", borderRadius: 24, boxShadow: "0 1px 0 rgba(255,255,255,.05) inset, 0 6px 14px -4px rgba(0,0,0,.35)" },
  tabs: { display: "flex", overflowX: "auto", flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: "0 4px", height: "100%" },
  tab: { display: "flex", alignItems: "center", gap: 6, padding: "0 12px", height: 34, borderRadius: 17, fontSize: 13.5, color: SUB, whiteSpace: "nowrap", background: "var(--chip)", flexShrink: 0, border: "1px solid transparent" },
  tabActive: { color: ACC, background: "var(--accbg)", border: "1px solid " + ACC, fontWeight: 600, boxShadow: "0 0 0 1px var(--accbg), 0 2px 8px var(--accbg)" },
  tabX: { fontSize: 17, color: SUB, padding: "0 2px" },
  hbtn: { border: "none", background: "transparent", color: TXT, width: 40, height: 48, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  crumb: { position: "relative", zIndex: 6, height: 30, display: "flex", alignItems: "center", padding: "0 16px", fontSize: 12.5, background: "transparent", flexShrink: 0, overflow: "visible", whiteSpace: "nowrap" },
  list: { flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" },
  slideWrap: { display: "flex", flexDirection: "column" },
  note: { color: SUB, textAlign: "center", padding: "60px 24px", lineHeight: 1.6 },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", touchAction: "pan-y", position: "relative" },
  rowLine: { position: "absolute", left: 72, right: 0, bottom: 0, height: 1, background: "var(--hair)" },
  sep: { height: 1, background: "var(--hair)", margin: "4px 0" },
  iconWrap: { width: 44, height: 44, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  iconImg: { width: "100%", height: "100%", objectFit: "cover", borderRadius: 13 },
  folderThumb: { position: "absolute", right: 1, bottom: 1, width: 26, height: 26, borderRadius: 7, objectFit: "cover", border: "2px solid " + BG },
  cbk: { width: 22, height: 22, borderRadius: 6, background: ACC, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", animation: "cbPop .26s cubic-bezier(.2,.9,.3,1.3)" },
  cbkOff: { width: 22, height: 22, borderRadius: 6, border: "2px solid " + ACC, background: "transparent" },
  rowMid: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 },
  rowDate: { fontSize: 12, color: SUB },
  rowSize: { fontSize: 11.5, color: "rgba(176,164,152,.5)", flexShrink: 0, marginLeft: 6 },
  rowDir: { background: "var(--chip)", borderRadius: 14, marginBottom: 6, boxShadow: "0 1px 3px rgba(0,0,0,.12)" },
  arcSelBar: { position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 10, display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 14px", background: BAR, borderRadius: 22, boxShadow: "0 1px 0 rgba(255,255,255,.07) inset, 0 4px 12px rgba(0,0,0,.4), 0 18px 48px rgba(0,0,0,.62)", animation: "popCenter .2s cubic-bezier(.2,.9,.3,1.1)" },
  arcSelCancel: { background: "transparent", border: "none", borderRadius: 14, color: SUB, fontSize: 13, padding: "7px 12px" },
  arcSelGo: { display: "inline-flex", alignItems: "center", gap: 5, background: ACC, border: "none", borderRadius: 14, color: "#fff", fontWeight: 700, fontSize: 13, padding: "7px 14px" },
  arcScreen: { position: "fixed", top: 62, left: 0, right: 0, bottom: "calc(70px + env(safe-area-inset-bottom))", zIndex: 1250, background: BG, display: "flex", flexDirection: "column" },
  settingsScreen: { position: "fixed", inset: 0, zIndex: 1600, background: BG, display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top)" },
  cnt: { background: "var(--accbg)", color: GOLD, fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 10, flexShrink: 0 },
  rowSel: { background: "var(--accbg)", borderRadius: 12 },
  name: { flex: 1, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  checkOn: { width: 26, height: 26, borderRadius: 13, background: ACC, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 },
  searchBar: { display: "flex", alignItems: "center", background: ROW2, padding: 8, gap: 8, flexShrink: 0 },
  searchInput: { flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid " + LINE, background: BAR, color: TXT, fontSize: 15, outline: "none" },
  searchClose: { border: "none", background: "transparent", color: SUB, fontSize: 24, width: 40 },
  bottom: { display: "flex", alignItems: "center", background: BAR, flexShrink: 0, borderRadius: 26, margin: "4px 8px calc(8px + env(safe-area-inset-bottom))", boxShadow: "0 1px 0 rgba(255,255,255,.06) inset, 0 2px 6px rgba(0,0,0,.35), 0 12px 32px rgba(0,0,0,.55)" },
  btn: { border: "none", background: "transparent", padding: "6px 6px 7px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  selCount: { padding: "2px 6px", marginLeft: 10, marginRight: 16, borderRadius: 10, background: ACC, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, lineHeight: 0 },
  btnLabel: { fontSize: 10, color: SUB, whiteSpace: "nowrap" },
  overlay: { position: "fixed", inset: 0, zIndex: 8 },
  menu: { position: "absolute", zIndex: 9, background: BAR, borderRadius: 12, overflow: "hidden", border: "1px solid " + LINE, boxShadow: "0 1px 0 rgba(255,255,255,.07) inset, 0 4px 12px rgba(0,0,0,.4), 0 18px 48px rgba(0,0,0,.62)", minWidth: 200, animation: "dropGrow .2s cubic-bezier(.2,.9,.3,1.2)" },
  menuItem: { display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", fontSize: 14, color: TXT, whiteSpace: "nowrap" },
  createItem: { padding: "14px 22px", fontSize: 15, color: TXT },
  ctxTitle: { padding: "10px 14px", fontSize: 12, color: SUB, borderBottom: "1px solid " + LINE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 210 },
  tgl: { width: 38, height: 22, borderRadius: 11, background: "var(--tgloff)", position: "relative", flexShrink: 0, transition: "background .15s" },
  tglOn: { background: ACC },
  knob: { position: "absolute", top: 2, left: 2, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" },
  knobOn: { left: 18 },
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", display: "flex", alignItems: "flex-end", zIndex: 1400, backdropFilter: "blur(5px)", animation: "fS .2s ease" },
  sheet: { width: "100%", maxWidth: 420, margin: "0 auto", background: BAR, borderRadius: "22px 22px 0 0", padding: "20px 20px 36px", animation: "sUp .34s cubic-bezier(.2,.9,.3,1)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 -1px 0 rgba(255,255,255,.06) inset, 0 -8px 40px rgba(0,0,0,.6)" },
  sheetTitle: { fontWeight: 700, fontSize: 17, marginBottom: 16 },
  sheetField: { width: "100%", background: ROW2, border: "1px solid " + LINE, borderRadius: 12, padding: "12px 14px", color: TXT, fontSize: 15, marginBottom: 16, outline: "none" },
  sheetGhost: { flex: 1, background: ROW2, border: "1px solid " + LINE, borderRadius: 12, padding: 13, color: SUB, fontSize: 14, cursor: "pointer" },
  sheetOk: { flex: 1, background: ACC, border: "none", borderRadius: 12, padding: 13, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  savePop: { position: "fixed", top: "calc(68px + env(safe-area-inset-top))", left: 10, right: 10, zIndex: 1260, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: BAR, color: TXT, borderRadius: 18, boxShadow: "0 0 0 1px var(--accbg), 0 1px 0 rgba(255,255,255,.07) inset, 0 8px 24px rgba(0,0,0,.5), 0 16px 44px var(--accbg)", animation: "dropGrow .22s cubic-bezier(.2,.9,.3,1.1)" },
  saveBar: { position: "fixed", left: 8, right: 8, bottom: "calc(8px + env(safe-area-inset-bottom))", zIndex: 1260, display: "flex", alignItems: "center", gap: 8, height: 56, padding: "0 10px", background: BAR, borderRadius: 26, boxShadow: "0 1px 0 rgba(255,255,255,.07) inset, 0 4px 12px rgba(0,0,0,.4), 0 18px 48px rgba(0,0,0,.62)", animation: "sUp .28s cubic-bezier(.2,.9,.3,1)" },
  saveBtnOpen: { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 42, background: "transparent", border: "1px solid " + LINE, borderRadius: 16, color: TXT, fontWeight: 600, fontSize: 14 },
  saveBtnSave: { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 42, background: "var(--accbg)", border: "1px solid " + ACC, borderRadius: 16, color: ACC, fontWeight: 600, fontSize: 14 },
  saveBtnCancel: { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 42, background: "transparent", border: "1px solid " + LINE, borderRadius: 16, color: SUB, fontWeight: 600, fontSize: 14 },
  accessBar: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--accbg)", borderBottom: "1px solid " + LINE },
  accessBtn: { flexShrink: 0, background: ACC, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 14px" },
  sortRow: { padding: "13px 4px", fontSize: 15, color: TXT, borderBottom: "1px solid " + LINE, display: "flex", alignItems: "center" },
  iconBtn: { border: "1px solid " + LINE, background: ROW2, borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" },
  chip: { flexShrink: 0, background: ROW2, border: "1px solid " + LINE, borderRadius: 16, padding: "7px 14px", color: SUB, fontSize: 13, whiteSpace: "nowrap" },
  chipOn: { background: ACC, borderColor: ACC, color: "#fff" },
  appRow: { display: "flex", alignItems: "center", gap: 14, padding: "10px 2px", borderBottom: "1px solid " + LINE },
  cbox: { width: 22, height: 22, borderRadius: 6, border: "2px solid " + SUB, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", flexShrink: 0 },
  cboxOn: { background: ACC, borderColor: ACC },
  toast: { position: "fixed", left: "50%", bottom: 90, transform: "translateX(-50%)", background: ROW2, color: TXT, padding: "10px 18px", borderRadius: 20, fontSize: 13, border: "1px solid " + LINE, boxShadow: "0 1px 0 rgba(255,255,255,.05) inset, 0 4px 14px rgba(0,0,0,.28)", zIndex: 1500, animation: "toastUp .34s cubic-bezier(.2,.9,.3,1)", maxWidth: "80%", textAlign: "center" },
};
