import React, { useState, useEffect, useRef, useCallback } from "react";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { App as CapApp } from "@capacitor/app";
import { registerPlugin } from "@capacitor/core";
import JSZip from "jszip";
const Apps = registerPlugin("Apps");

/* ===== YevFiles — leshugan.fm =====  стиль Notenger (шоколад) */

const BG = "#1C140C", BAR = "#2A2017", ROW2 = "#2E251C", ACC = "#EF6C00";
const GOLD = "#F5A623", RED = "#E05252", TXT = "#F2EAE0", SUB = "#B0A498", LINE = "#4A3A2A";
const DIR = Directory.ExternalStorage;
const TKEY = "fm_tabs_v1", SKEY = "fm_startup_v1", METAKEY = "fm_meta_v1", SORTKEY = "fm_sort_v1";
const DEFKEY = "fm_defaults_v1", HIDEKEY = "fm_hideapps_v1";
const loadMap = (k) => { try { return JSON.parse(ls.get(k)) || {}; } catch { return {}; } };
const saveMap = (k, m) => ls.set(k, JSON.stringify(m));
const OPEN_AS = [["*/*", "Любой тип"], ["text/plain", "Текст"], ["image/*", "Изображение"], ["video/*", "Видео"], ["audio/*", "Аудио"], ["application/pdf", "PDF"]];

let mem = null;
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} } };
function buildInitial() {
  const saved = loadTabs();
  let base = saved && saved.length ? saved : [{ id: 1, path: "" }];
  const start = ls.get(SKEY);
  if (start != null && !base.some((t) => t.path === start)) base = [...base, { id: Date.now(), path: start }];
  const active = start != null ? Math.max(0, base.findIndex((t) => t.path === start)) : 0;
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
const ago = (ms) => { if (!ms) return "—"; const d = new Date(ms), diff = (Date.now() - ms) / 60000; const rel = diff < 1 ? "только что" : diff < 60 ? Math.floor(diff) + " мин назад" : diff < 1440 ? Math.floor(diff / 60) + " ч назад" : Math.floor(diff / 1440) + " дн назад"; const p = (n) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}, ${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)} · ${rel}`; };

const MIME = { txt: "text/plain", md: "text/plain", log: "text/plain", csv: "text/csv", html: "text/html", json: "application/json", xml: "text/xml", pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", mp4: "video/mp4", mkv: "video/x-matroska", avi: "video/x-msvideo", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4", aac: "audio/aac", zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed", apk: "application/vnd.android.package-archive" };
const mimeOf = (name) => MIME[(name.split(".").pop() || "").toLowerCase()] || "*/*";

const I = {
  back: <path d="M15 18l-6-6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
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
  dots: <><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></>,
  sort: <><path d="M7 4v16M7 20l-3-3M7 4l3 3" /><path d="M17 20V4M17 4l3 3M17 20l-3-3" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" /><path d="M9.9 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.2 3.9M6.2 6.2A16 16 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 3.1-.5" /></>,
  pinT: <><path d="M12 3v8M8 7l4-4 4 4" /><path d="M5 14h14M5 14v6h14v-6" /></>,
  pinB: <><path d="M12 21v-8M8 17l4 4 4-4" /><path d="M5 10h14M5 10V4h14v6" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  file: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></>,
  txt: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 16h6M9 10h3" /></>,
  pdf: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><rect x="7.5" y="13.5" width="9" height="5.5" rx="1" fill="currentColor" stroke="none" /></>,
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
const EXT = {
  img: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic"],
  video: ["mp4", "mkv", "avi", "mov", "webm", "3gp", "flv"],
  audio: ["mp3", "wav", "ogg", "flac", "m4a", "aac"],
  archive: ["zip", "rar", "7z", "tar", "gz", "apk", "obb"],
  code: ["js", "jsx", "ts", "json", "html", "css", "xml", "py", "java", "kt", "c", "cpp", "sh"],
};
const fileIcon = (name) => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return { d: I.pdf, c: "#E0574F" };
  if (ext === "apk") return { d: I.apk, c: "#6FD3A8" };
  if (ext === "lnk") return { d: I.lnk, c: GOLD };
  if (["txt", "md", "log", "ini", "cfg"].includes(ext)) return { d: I.txt, c: "#9FD0FF" };
  if (EXT.img.includes(ext)) return { d: I.img, c: "#7FB3FF" };
  if (EXT.video.includes(ext)) return { d: I.video, c: "#C98BFF" };
  if (EXT.audio.includes(ext)) return { d: I.audio, c: "#FF9D6B" };
  if (EXT.archive.includes(ext)) return { d: I.archive, c: GOLD };
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
  const [query, setQuery] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [slide, setSlide] = useState(0);
  const [meta, setMeta] = useState(loadMeta);
  const [showHidden, setShowHidden] = useState(false);
  const [sortMode, setSortMode] = useState(() => ls.get(SORTKEY) || "az");
  const [headMenu, setHeadMenu] = useState(false);
  const [tabsMenu, setTabsMenu] = useState(false);
  const [selMenu, setSelMenu] = useState(false);
  const [props, setProps] = useState(null);
  const [propCount, setPropCount] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [arcView, setArcView] = useState(null);
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
    } catch (e) { setError(e.message || "Нет доступа к хранилищу"); setEntries([]); }
    setLoading(false);
  }, [path]);

  useEffect(() => { Filesystem.requestPermissions().catch(() => {}); checkAccess(); }, []);
  const checkAccess = async () => { try { const r = await Apps.hasAllFiles(); setAllFiles(!!r.granted); } catch { setAllFiles(true); } };
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
  const setTabPath = (p) => persist(tabs.map((x, i) => (i === active ? { ...x, path: p } : x)));
  const goUp = () => { if (path) setTabPath(parent(path)); };
  const closeTab = (i) => { if (tabs.length === 1) return; const t = tabs.filter((_, idx) => idx !== i); persist(t); setActive(Math.max(0, Math.min(active, t.length - 1))); };

  const backRef = useRef(() => {});
  backRef.current = () => {
    if (arcView) { setArcView(null); return; }
    if (openMenu) { setOpenMenu(null); return; }
    if (props) { setProps(null); return; }
    if (sheet) { setSheet(null); return; }
    if (tabsMenu) { setTabsMenu(false); return; }
    if (selMenu) { setSelMenu(false); return; }
    if (headMenu) { setHeadMenu(false); return; }
    if (confirmDel) { setConfirmDel(null); return; }
    if (createOpen) { setCreateOpen(false); return; }
    if (query !== null) { setQuery(null); return; }
    if (selMode) { exitSel(); return; }
    if (path) { goUp(); return; }
    if (tabs.length > 1) { closeTab(active); return; }
    CapApp.exitApp();
  };
  useEffect(() => {
    let h;
    CapApp.addListener("backButton", () => backRef.current()).then((l) => (h = l));
    return () => { h && h.remove(); };
  }, []);

  const toggle = (name) => { const n = new Set(sel); n.has(name) ? n.delete(name) : n.add(name); setSel(n); setSelMode(n.size > 0); };
  const selectAll = () => { setSelMode(true); setSel(new Set(visible.map((e) => e.name))); };

  const openExternal = async (e) => {
    const mime = mimeOf(e.name);
    const defs = loadMap(DEFKEY);
    const d = defs[mime];
    if (d) { try { const [pkg, act] = d.split("|"); await Apps.open({ uri: e.uri, mime, packageName: pkg, activityName: act }); return; } catch {} }
    await showOpenMenu(e, mime);
  };
  const showOpenMenu = async (e, mime) => {
    try {
      const { apps } = await Apps.query({ uri: e.uri, mime });
      if (!apps || !apps.length) { showToast("Нет приложений для этого типа"); return; }
      setOpenMenu({ file: e, mime, apps, useDefault: false, editHide: false });
    } catch (err) { showToast("Не удалось получить список: " + (err?.message || "")); }
  };
  const pickApp = async (app) => {
    const om = openMenu;
    if (om.editHide) {
      const hm = loadMap(HIDEKEY); const arr = new Set(hm[om.mime] || []);
      const id = app.packageName + "|" + app.activityName;
      arr.has(id) ? arr.delete(id) : arr.add(id);
      hm[om.mime] = [...arr]; saveMap(HIDEKEY, hm); setOpenMenu({ ...om }); return;
    }
    if (om.useDefault) { const defs = loadMap(DEFKEY); defs[om.mime] = app.packageName + "|" + app.activityName; saveMap(DEFKEY, defs); }
    setOpenMenu(null);
    try { await Apps.open({ uri: om.file.uri, mime: om.mime, packageName: app.packageName, activityName: app.activityName }); }
    catch (err) { showToast("Не удалось открыть: " + (err?.message || "")); }
  };
  const openArchive = async (e) => {
    setOpenMenu(null); showToast("Открываю архив…");
    try {
      const r = await Filesystem.readFile({ path: e.uri });
      const zip = await JSZip.loadAsync(r.data, { base64: true });
      const entries = [];
      zip.forEach((rel, f) => { if (!f.dir) entries.push({ name: rel, size: (f._data && f._data.uncompressedSize) || 0 }); });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      setArcView({ name: e.name, entries });
    } catch (err) { showToast("Не удалось открыть архив: " + (err?.message || "")); }
  };
  const resetDefault = () => { const defs = loadMap(DEFKEY); delete defs[openMenu.mime]; saveMap(DEFKEY, defs); showToast("Привязка сброшена"); };
  const open = (e) => {
    if (selMode) { toggle(e.name); return; }
    if (e.type === "directory") setTabPath(join(path, e.name));
    else openExternal(e);
  };

  const addTab = () => { const id = Date.now(); const t = [...tabs, { id, path: "" }]; persist(t); setActive(t.length - 1); };
  const switchTab = (dir) => { const ni = active + dir; if (ni < 0 || ni >= tabs.length) return; setSlide(dir); setActive(ni); setTimeout(() => setSlide(0), 220); };
  const sx = useRef(0), sy = useRef(0), swiped = useRef(false);
  const onTS = (e) => { sx.current = e.touches[0].clientX; sy.current = e.touches[0].clientY; swiped.current = false; };
  const onTM = (e) => { const dx = e.touches[0].clientX - sx.current, dy = e.touches[0].clientY - sy.current; if (!swiped.current && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped.current = true; switchTab(dx > 0 ? -1 : 1); } };
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
  const onTabUp = (i) => { const d = tabDrag.current; if (d.active) { d.active = false; persistCurrent(); } else setActive(i); d.from = -1; };

  const saveAllTabs = () => { setTabsMenu(false); const t = tabs.map((x) => ({ ...x, saved: true })); persist(t); showToast("Вкладки сохранены"); };
  const startupHere = () => { setTabsMenu(false); ls.set(SKEY, path); showToast("Запуск при открытии: " + (path ? baseName(path) : "Storage")); };
  const resetTabs = () => { setTabsMenu(false); ls.del(SKEY); setTabs((arr) => { const t = arr.map((x) => ({ ...x, saved: false })); saveTabs(t); return t; }); showToast("Вкладки сброшены"); };

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
    const names = [...sel]; setConfirmDel(null); let ok = 0, fail = 0;
    for (const name of names) { const e = byName(name); if (!e) { fail++; continue; } try { await delTree(e); ok++; } catch { fail++; } }
    exitSel(); await refresh();
    showToast(fail ? "Не удалено: " + fail + (ok ? ", удалено: " + ok : "") : "Удалено: " + ok);
  };
  const grab = (mode) => { const items = [...sel].map((n) => { const e = byName(n); return e ? { name: n, uri: e.uri, type: e.type } : null; }).filter(Boolean); setClip({ mode, items }); exitSel(); };
  const paste = async () => { if (!clip) return; for (const it of clip.items) { const to = targetUri(it.name); if (!to || it.uri === to) continue; try { if (clip.mode === "copy") await Filesystem.copy({ from: it.uri, to }); else await Filesystem.rename({ from: it.uri, to }); } catch (e) { showToast(it.name + ": " + e.message); } } setClip(null); await refresh(); };

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
  visible = [...visible].sort((a, b) => {
    const ad = a.type === "directory", bd = b.type === "directory";
    if (ad !== bd) return ad ? -1 : 1;
    return cmp(a, b);
  });
  const rank = (e) => (meta.pinTop.has(keyOf(e.name)) ? -1 : meta.pinBot.has(keyOf(e.name)) ? 1 : 0);
  visible = [...visible].sort((a, b) => rank(a) - rank(b));

  const lpTimer = useRef(), lpFired = useRef(false), moved = useRef(false), pX = useRef(0), pY = useRef(0);
  const rDown = (ev, e) => { lpFired.current = false; moved.current = false; pX.current = ev.clientX; pY.current = ev.clientY; lpTimer.current = setTimeout(() => { lpFired.current = true; buzz(15); toggle(e.name); }, 450); };
  const rMove = (ev) => { if (Math.abs(ev.clientX - pX.current) > 10 || Math.abs(ev.clientY - pY.current) > 10) { moved.current = true; clearTimeout(lpTimer.current); } };
  const rUp = (e) => { clearTimeout(lpTimer.current); if (lpFired.current || moved.current) return; open(e); };

  const one = sel.size === 1 ? byName([...sel][0]) : null;

  return (
    <div style={S.app}>
      {/* ВКЛАДКИ + действия шапки */}
      <div style={S.tabsbar}>
        <div style={{ position: "relative" }}>
          <button style={S.hbtn} onClick={() => setTabsMenu((v) => !v)}><Svg d={I.chev} size={20} /></button>
          {tabsMenu && (
            <>
              <div style={S.overlay} onClick={() => setTabsMenu(false)} />
              <div style={{ ...S.menu, position: "fixed", top: 46, left: 4, zIndex: 1200 }}>
                <div style={S.menuItem} onClick={saveAllTabs}><span style={{ color: ACC, display: "flex" }}><Svg d={I.pin} size={20} /></span>Сохранить вкладки</div>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={startupHere}><span style={{ color: GOLD, display: "flex" }}><Svg d={I.star} size={20} /></span>Запуск при открытии</div>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={resetTabs}><span style={{ color: SUB, display: "flex" }}><Svg d={I.x} size={20} /></span>Сбросить вкладки</div>
              </div>
            </>
          )}
        </div>
        <div style={S.tabs}>
          {tabs.map((t, i) => (
            <div key={t.id} ref={(el) => (tabRefs.current[i] = el)}
              onPointerDown={(ev) => onTabDown(ev, i)} onPointerMove={onTabMove} onPointerUp={() => onTabUp(i)} onPointerCancel={() => onTabUp(i)}
              style={{ ...S.tab, ...(i === active ? S.tabActive : {}) }}>
              {t.saved && <span style={{ color: ACC, display: "flex" }}><Svg d={I.pin} size={13} /></span>}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 110 }}>{t.path ? baseName(t.path) : "Storage"}</span>
              {tabs.length > 1 && <span style={S.tabX} onClick={(e) => { e.stopPropagation(); closeTab(i); }}>×</span>}
            </div>
          ))}
        </div>
        <button style={S.hbtn} onClick={addTab}><Svg d={I.plus} size={22} /></button>
        <div style={{ position: "relative" }}>
          <button style={S.hbtn} onClick={() => setHeadMenu((v) => !v)}><Svg d={I.dots} size={22} /></button>
          {headMenu && (
            <>
              <div style={S.overlay} onClick={() => setHeadMenu(false)} />
              <div style={{ ...S.menu, top: 46, right: 4 }}>
                <div style={S.menuItem} onClick={() => { setHeadMenu(false); setSheet({ kind: "sort" }); }}>
                  <span style={{ color: ACC, display: "flex" }}><Svg d={I.sort} size={20} /></span>Сортировка
                </div>
                <div style={{ height: 1, background: LINE }} />
                <div style={S.menuItem} onClick={() => { setShowHidden((v) => !v); setHeadMenu(false); }}>
                  <span style={{ color: showHidden ? ACC : SUB, display: "flex" }}><Svg d={showHidden ? I.eye : I.eyeOff} size={20} /></span>
                  Скрытые объекты
                  <span style={{ marginLeft: "auto", ...S.tgl, ...(showHidden ? S.tglOn : {}) }}><span style={{ ...S.knob, ...(showHidden ? S.knobOn : {}) }} /></span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ПУТЬ */}
      <div style={S.crumb}>
        {path ? <span onClick={goUp} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: ACC }}><Svg d={I.back} size={18} /> {path}</span>
          : <span style={{ color: SUB }}>/storage</span>}
      </div>

      {/* СПИСОК */}
      <main style={S.list} onTouchStart={onTS} onTouchMove={onTM}>
        {!allFiles && (
          <div style={S.accessBar}>
            <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>Нет доступа ко всем файлам — архивы, PDF и APK не видны.</div>
            <button style={S.accessBtn} onClick={() => Apps.requestAllFiles().catch(() => {})}>Дать доступ</button>
          </div>
        )}
        <div key={active} style={{ ...S.slideWrap, animation: slide ? `fm-in-${slide > 0 ? "r" : "l"} .22s ease` : "none" }}>
          {loading && null}
          {error && <div style={{ ...S.note, color: RED }}>{error}<br /><span style={{ fontSize: 12 }}>Разрешите «Доступ ко всем файлам» в настройках приложения.</span></div>}
          {!loading && !error && visible.length === 0 && <div style={S.note}>Пусто</div>}
          {visible.map((e) => {
            const isSel = sel.has(e.name), hid = isHidden(e);
            const ic = e.type === "directory" ? { d: I.folder, c: ACC } : fileIcon(e.name);
            const isDir = e.type === "directory";
            const pinned = meta.pinTop.has(keyOf(e.name)) || meta.pinBot.has(keyOf(e.name));
            return (
              <div key={e.name} style={{ ...S.row, ...(isDir ? S.rowDir : {}), ...(isSel ? S.rowSel : {}), opacity: hid ? 0.5 : 1 }}
                onPointerDown={(ev) => rDown(ev, e)} onPointerMove={rMove} onPointerUp={() => rUp(e)} onPointerCancel={() => clearTimeout(lpTimer.current)}>
                <span style={{ color: isSel ? ACC : ic.c, display: "flex" }}
                  onPointerDown={(ev) => ev.stopPropagation()} onPointerUp={(ev) => { ev.stopPropagation(); clearTimeout(lpTimer.current); toggle(e.name); }}>
                  {isSel ? <span style={S.checkOn}>✓</span> : <Svg d={ic.d} size={25} />}
                </span>
                <span style={{ ...S.name, fontWeight: isDir ? 600 : 400 }}>{e.name}{isDir && e.count != null ? <span style={S.cnt}>{e.count}</span> : null}</span>
                {pinned && <span style={{ color: SUB, display: "flex" }}><Svg d={meta.pinTop.has(keyOf(e.name)) ? I.pinT : I.pinB} size={15} /></span>}
              </div>
            );
          })}
        </div>
      </main>

      {/* ПОИСК */}
      {query !== null && (
        <div style={S.searchBar}>
          <input autoFocus value={query} placeholder="Поиск в папке…" onChange={(e) => setQuery(e.target.value)} style={S.searchInput} />
          <button style={S.searchClose} onClick={() => setQuery(null)}>×</button>
        </div>
      )}

      {/* НИЖНЯЯ ПАНЕЛЬ */}
      {selMode ? (
        <nav style={{ ...S.bottom, justifyContent: "flex-start" }}>
          <div style={{ ...S.selCount }}>{sel.size}</div>
          <div style={{ display: "flex", overflowX: "auto", flex: 1, justifyContent: "flex-end" }}>
            <Btn onClick={exitSel} icon={I.x} label="Отмена" flexNone />
            <Btn onClick={() => setProps(one)} icon={I.info} label="Свойства" flexNone disabled={sel.size !== 1} />
            <Btn onClick={() => grab("cut")} icon={I.cut} label="Вырезать" flexNone />
            <Btn onClick={() => grab("copy")} icon={I.copy} label="Копир." flexNone />
            <Btn onClick={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); setConfirmDel({ left: r.left, top: r.top }); }} icon={I.trash} label="Удалить" red flexNone />
            <Btn onClick={() => { const e = one; const sp = splitExt(e.name, e.type === "directory"); setSheet({ kind: "rename", old: e.name, base: sp.base, ext: sp.ext, editExt: false }); }} icon={I.rename} label="Имя" flexNone disabled={sel.size !== 1} />
            <Btn onClick={() => setSelMenu((v) => !v)} icon={I.dots} label="Ещё" flexNone />
          </div>
        </nav>
      ) : (
        <nav style={S.bottom}>
          <Zone><Btn onClick={() => setQuery(query === null ? "" : null)} icon={I.search} label="Поиск" /></Zone>
          <Zone><Btn onClick={selectAll} icon={I.selectAll} label="Все" /></Zone>
          <Zone>
            {clip ? (
              <div style={{ display: "flex", flex: 1 }}>
                <Btn onClick={paste} icon={I.paste} label={"Вставить (" + clip.items.length + ")"} />
                <Btn onClick={() => setClip(null)} icon={I.x} label="Отмена" flexNone />
              </div>
            ) : (
              <Btn onClick={() => setCreateOpen((v) => !v)} icon={I.plus} label="Создать" />
            )}
          </Zone>
        </nav>
      )}

      {/* МЕНЮ «СОЗДАТЬ» (поверх тулбара) */}
      {createOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 1190 }} onClick={() => setCreateOpen(false)} />
          <div style={{ ...S.menu, position: "fixed", right: 8, bottom: "calc(62px + env(safe-area-inset-bottom))", zIndex: 1200, minWidth: 150 }}>
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
          <div style={{ ...S.menu, position: "fixed", right: 8, bottom: "calc(56px + env(safe-area-inset-bottom))", zIndex: 1200 }}>
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
          <div style={{ position: "fixed", zIndex: 1300, left: Math.max(8, Math.min(confirmDel.left - 6, window.innerWidth - 150)), top: confirmDel.top - 56,
            display: "flex", gap: 8, background: BAR, border: "1px solid " + LINE, borderRadius: 12, padding: 8, boxShadow: "0 8px 28px rgba(0,0,0,.6)", animation: "dropGrow .15s ease" }}>
            <button onClick={doDelete} style={{ background: RED, border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, padding: "8px 18px" }}>Да</button>
            <button onClick={() => setConfirmDel(null)} style={{ background: ROW2, border: "1px solid " + LINE, borderRadius: 8, color: SUB, fontSize: 14, padding: "8px 18px" }}>Нет</button>
          </div>
        </>
      )}

      {/* ПРОСМОТР АРХИВА */}
      {arcView && (
        <div style={S.backdrop} onClick={() => setArcView(null)}>
          <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ color: GOLD, display: "flex" }}><Svg d={I.archive} size={22} /></span>
              <div style={{ ...S.sheetTitle, marginBottom: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{arcView.name}</div>
              <span style={{ color: SUB, fontSize: 13 }}>{arcView.entries.length} эл.</span>
            </div>
            <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
              {arcView.entries.map((it, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 2px", borderBottom: "1px solid " + LINE }}>
                  <span style={{ color: SUB, display: "flex" }}><Svg d={I.file} size={18} /></span>
                  <span style={{ flex: 1, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                  <span style={{ color: SUB, fontSize: 12 }}>{fmtSize(it.size)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* МЕНЮ ОТКРЫТИЯ ФАЙЛА */}
      {openMenu && (() => {
        const hidden = new Set(loadMap(HIDEKEY)[openMenu.mime] || []);
        const shown = openMenu.editHide ? openMenu.apps : openMenu.apps.filter((a) => !hidden.has(a.packageName + "|" + a.activityName));
        return (
          <div style={S.backdrop} onClick={() => setOpenMenu(null)}>
            <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
                <div style={{ ...S.sheetTitle, marginBottom: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{openMenu.file.name}</div>
                <button style={{ ...S.iconBtn, color: openMenu.editHide ? ACC : SUB }} onClick={() => setOpenMenu({ ...openMenu, editHide: !openMenu.editHide })}><Svg d={I.rename} size={20} /></button>
              </div>
              <div style={{ fontSize: 12, color: SUB, marginBottom: 6 }}>Открыть как:</div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, paddingBottom: 2 }}>
                {OPEN_AS.map(([m, lbl]) => (
                  <button key={m} onClick={() => showOpenMenu(openMenu.file, m)}
                    style={{ ...S.chip, ...(openMenu.mime === m ? S.chipOn : {}) }}>{lbl}</button>
                ))}
              </div>
              {openMenu.editHide && <div style={{ fontSize: 12, color: GOLD, marginBottom: 10 }}>Нажмите на приложение, чтобы скрыть/показать его</div>}
              <div style={{ maxHeight: "42vh", overflowY: "auto" }}>
                {shown.length === 0 && <div style={{ color: SUB, padding: 16, textAlign: "center" }}>Нет приложений</div>}
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
              {!openMenu.editHide && /\.(zip|apk|jar)$/i.test(openMenu.file.name) && (
                <div onClick={() => openArchive(openMenu.file)} style={{ ...S.appRow, color: GOLD }}>
                  <span style={{ width: 38, display: "flex", justifyContent: "center" }}><Svg d={I.folder} size={28} /></span>
                  <span style={{ flex: 1, fontSize: 15 }}>Открыть как папку</span>
                </div>
              )}
              {!openMenu.editHide && /\.apk$/i.test(openMenu.file.name) && (
                <div onClick={() => { setOpenMenu(null); Apps.installApk({ uri: openMenu.file.uri }).catch((er) => showToast("Ошибка: " + (er?.message || ""))); }}
                  style={{ ...S.appRow, color: "#6FD3A8" }}>
                  <span style={{ width: 38, display: "flex", justifyContent: "center" }}><Svg d={I.plus} size={28} /></span>
                  <span style={{ flex: 1, fontSize: 15 }}>Установить</span>
                </div>
              )}
              {!openMenu.editHide && (
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

      {toast && <div style={S.toast}>{toast}</div>}

      <style>{`
        @keyframes fm-in-r{from{transform:translateX(-14%);opacity:.4}to{transform:none;opacity:1}}
        @keyframes fm-in-l{from{transform:translateX(14%);opacity:.4}to{transform:none;opacity:1}}
        @keyframes dropGrow{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
        @keyframes sUp{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fS{from{opacity:0}to{opacity:1}}
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
  app: { display: "flex", flexDirection: "column", height: "100vh", background: BG, color: TXT, fontFamily: "system-ui,-apple-system,Roboto,sans-serif", overflow: "hidden" },
  tabsbar: { display: "flex", alignItems: "center", background: BAR, borderBottom: "1px solid #16100A", flexShrink: 0, height: 48 },
  tabs: { display: "flex", overflowX: "auto", flex: 1, alignItems: "center", gap: 6, padding: "0 4px", height: "100%" },
  tab: { display: "flex", alignItems: "center", gap: 6, padding: "0 12px", height: 34, borderRadius: 17, fontSize: 13.5, color: SUB, whiteSpace: "nowrap", background: "#241A11", flexShrink: 0 },
  tabActive: { color: "#fff", background: ACC },
  tabX: { fontSize: 17, color: SUB, padding: "0 2px" },
  hbtn: { border: "none", background: "transparent", color: TXT, width: 40, height: 48, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  crumb: { padding: "8px 16px", fontSize: 13, background: BG, flexShrink: 0, borderBottom: "1px solid #241A11", overflow: "hidden", whiteSpace: "nowrap" },
  list: { flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" },
  slideWrap: { paddingTop: 6, paddingBottom: "55vh" },
  note: { color: SUB, textAlign: "center", padding: "60px 24px", lineHeight: 1.6 },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", margin: "3px 8px", borderRadius: 12, background: ROW2, touchAction: "pan-y" },
  rowDir: { background: "#33271A", borderLeft: "3px solid " + ACC },
  cnt: { marginLeft: 8, background: "#43331F", color: GOLD, fontSize: 12, fontWeight: 700, padding: "1px 8px", borderRadius: 10, verticalAlign: "middle" },
  rowSel: { background: "#3A2A18", outline: "1px solid " + ACC },
  name: { flex: 1, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  checkOn: { width: 26, height: 26, borderRadius: 13, background: ACC, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 },
  searchBar: { display: "flex", alignItems: "center", background: ROW2, padding: 8, gap: 8, flexShrink: 0 },
  searchInput: { flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid " + LINE, background: BAR, color: TXT, fontSize: 15, outline: "none" },
  searchClose: { border: "none", background: "transparent", color: SUB, fontSize: 24, width: 40 },
  bottom: { display: "flex", alignItems: "center", background: BAR, borderTop: "1px solid #16100A", paddingBottom: "env(safe-area-inset-bottom)", flexShrink: 0 },
  btn: { border: "none", background: "transparent", padding: "6px 6px 7px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  selCount: { minWidth: 26, height: 26, padding: "0 8px", margin: "0 8px", background: ACC, color: "#fff", borderRadius: 13, fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  btnLabel: { fontSize: 10, color: SUB, whiteSpace: "nowrap" },
  overlay: { position: "fixed", inset: 0, zIndex: 8 },
  menu: { position: "absolute", zIndex: 9, background: BAR, borderRadius: 12, overflow: "hidden", border: "1px solid " + LINE, boxShadow: "0 8px 32px rgba(0,0,0,.6)", minWidth: 200, animation: "dropGrow .2s cubic-bezier(.2,.9,.3,1.2)" },
  menuItem: { display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", fontSize: 14, color: TXT, whiteSpace: "nowrap" },
  createItem: { padding: "14px 22px", fontSize: 15, color: TXT },
  ctxTitle: { padding: "10px 14px", fontSize: 12, color: SUB, borderBottom: "1px solid " + LINE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 210 },
  tgl: { width: 38, height: 22, borderRadius: 11, background: LINE, position: "relative", flexShrink: 0, transition: "background .15s" },
  tglOn: { background: ACC },
  knob: { position: "absolute", top: 2, left: 2, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" },
  knobOn: { left: 18 },
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", zIndex: 1400, backdropFilter: "blur(3px)" },
  sheet: { width: "100%", maxWidth: 420, margin: "0 auto", background: BAR, borderRadius: "20px 20px 0 0", padding: "20px 20px 36px", animation: "sUp .34s cubic-bezier(.2,.9,.3,1)", maxHeight: "88vh", overflowY: "auto" },
  sheetTitle: { fontWeight: 700, fontSize: 17, marginBottom: 16 },
  sheetField: { width: "100%", background: ROW2, border: "1px solid " + LINE, borderRadius: 12, padding: "12px 14px", color: TXT, fontSize: 15, marginBottom: 16, outline: "none" },
  sheetGhost: { flex: 1, background: ROW2, border: "1px solid " + LINE, borderRadius: 12, padding: 13, color: SUB, fontSize: 14, cursor: "pointer" },
  sheetOk: { flex: 1, background: ACC, border: "none", borderRadius: 12, padding: 13, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  accessBar: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#3A2A14", borderBottom: "1px solid " + LINE },
  accessBtn: { flexShrink: 0, background: ACC, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 14px" },
  sortRow: { padding: "13px 4px", fontSize: 15, color: TXT, borderBottom: "1px solid " + LINE, display: "flex", alignItems: "center" },
  iconBtn: { border: "1px solid " + LINE, background: ROW2, borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" },
  chip: { flexShrink: 0, background: ROW2, border: "1px solid " + LINE, borderRadius: 16, padding: "7px 14px", color: SUB, fontSize: 13, whiteSpace: "nowrap" },
  chipOn: { background: ACC, borderColor: ACC, color: "#fff" },
  appRow: { display: "flex", alignItems: "center", gap: 14, padding: "10px 2px", borderBottom: "1px solid " + LINE },
  cbox: { width: 22, height: 22, borderRadius: 6, border: "2px solid " + SUB, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", flexShrink: 0 },
  cboxOn: { background: ACC, borderColor: ACC },
  toast: { position: "fixed", left: "50%", bottom: 90, transform: "translateX(-50%)", background: ROW2, color: TXT, padding: "10px 18px", borderRadius: 20, fontSize: 13, border: "1px solid " + LINE, boxShadow: "0 6px 24px rgba(0,0,0,.5)", zIndex: 1500, animation: "fS .2s ease", maxWidth: "80%", textAlign: "center" },
};
