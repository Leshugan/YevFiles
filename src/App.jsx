import React, { useState, useEffect, useRef, useCallback } from "react";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { App as CapApp } from "@capacitor/app";

/* ===== Files — leshugan.fm =====
   Файловый менеджер реальной ФС телефона (Directory.ExternalStorage). */

const BG = "#0e1621";
const BAR = "#17212b";
const ROW2 = "#1c2733";
const ACC = "#5fa8ff";
const RED = "#e06b6b";
const TXT = "#e9eef3";
const SUB = "#7d8e9e";
const DIR = Directory.ExternalStorage;
const TKEY = "fm_tabs_v1";

let mem = null;
const loadTabs = () => { try { return JSON.parse(localStorage.getItem(TKEY)); } catch { return mem; } };
const saveTabs = (t) => { mem = t; try { localStorage.setItem(TKEY, JSON.stringify(t)); } catch {} };

const join = (a, b) => (a ? a + "/" + b : b);
const parent = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseName = (p) => (p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p);

const I = {
  back: <path d="M15 18l-6-6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
  selectAll: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 12l3 3 5-6" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  cut: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.5 15.5" /><path d="M20 20L8.5 8.5" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></>,
  paste: <><rect x="6" y="4" width="12" height="16" rx="2" /><path d="M9 4h6v3H9z" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  file: <><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /></>,
};
const Svg = ({ d, size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

export default function App() {
  const [tabs, setTabs] = useState(() => loadTabs() || [{ id: 1, path: "" }]);
  const [active, setActive] = useState(0);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [selMode, setSelMode] = useState(false);
  const [clip, setClip] = useState(null);
  const [query, setQuery] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [slide, setSlide] = useState(0);

  const cur = tabs[active];
  const path = cur?.path || "";
  const persist = (t) => { setTabs(t); saveTabs(t); };

  const list = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { files } = await Filesystem.readdir({ path, directory: DIR });
      files.sort((a, b) => {
        const ad = a.type === "directory", bd = b.type === "directory";
        if (ad !== bd) return ad ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(files);
    } catch (e) { setError(e.message || "Нет доступа к хранилищу"); setEntries([]); }
    setLoading(false);
  }, [path]);

  useEffect(() => { Filesystem.requestPermissions().catch(() => {}); }, []);
  useEffect(() => { list(); exitSel(); setQuery(null); /* eslint-disable-next-line */ }, [active, path]);

  const exitSel = () => { setSel(new Set()); setSelMode(false); setConfirmDel(false); };

  const setTabPath = (p) => persist(tabs.map((x, i) => (i === active ? { ...x, path: p } : x)));
  const goUp = () => { if (path) setTabPath(parent(path)); };
  const closeTab = (i) => {
    if (tabs.length === 1) return;
    const t = tabs.filter((_, idx) => idx !== i);
    persist(t); setActive(Math.max(0, Math.min(active, t.length - 1)));
  };

  /* ---- аппаратная кнопка Назад ---- */
  useEffect(() => {
    let h;
    CapApp.addListener("backButton", () => {
      if (confirmDel) { setConfirmDel(false); return; }
      if (createOpen) { setCreateOpen(false); return; }
      if (query !== null) { setQuery(null); return; }
      if (selMode) { exitSel(); return; }
      if (path) { goUp(); return; }
      if (tabs.length > 1) { closeTab(active); return; }
      CapApp.exitApp();
    }).then((l) => (h = l));
    return () => { h && h.remove(); };
    // eslint-disable-next-line
  }, [confirmDel, createOpen, query, selMode, path, tabs, active]);

  /* ---- выделение (тоггл) ---- */
  const toggle = (name) => {
    const n = new Set(sel);
    n.has(name) ? n.delete(name) : n.add(name);
    setSel(n);
    setSelMode(n.size > 0);
  };
  const selectAll = () => { setSelMode(true); setSel(new Set(visible.map((e) => e.name))); };

  const open = (e) => {
    if (selMode) { toggle(e.name); return; }
    if (e.type === "directory") setTabPath(join(path, e.name));
    else toggle(e.name);
  };
  const longPress = (e) => toggle(e.name);

  /* вкладки */
  const addTab = () => {
    const id = Date.now();
    const t = [...tabs, { id, path: "" }];
    persist(t); setActive(t.length - 1);
  };
  const switchTab = (dir) => {
    const ni = active + dir;
    if (ni < 0 || ni >= tabs.length) return;
    setSlide(dir); setActive(ni);
    setTimeout(() => setSlide(0), 220);
  };

  /* свайп по контенту */
  const sx = useRef(0); const sy = useRef(0); const swiped = useRef(false);
  const onTS = (e) => { sx.current = e.touches[0].clientX; sy.current = e.touches[0].clientY; swiped.current = false; };
  const onTM = (e) => {
    const dx = e.touches[0].clientX - sx.current;
    const dy = e.touches[0].clientY - sy.current;
    if (!swiped.current && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped.current = true; switchTab(dx > 0 ? -1 : 1);
    }
  };

  /* файловые операции */
  const rel = (name) => join(path, name);
  const refresh = () => list();

  const doCreateFolder = async () => {
    setCreateOpen(false);
    const name = prompt("Имя папки"); if (!name) return;
    try { await Filesystem.mkdir({ path: rel(name), directory: DIR }); refresh(); }
    catch (e) { alert("Ошибка: " + e.message); }
  };
  const doCreateTxt = async () => {
    setCreateOpen(false);
    let name = prompt("Имя файла (.txt)"); if (!name) return;
    if (!/\.txt$/i.test(name)) name += ".txt";
    try { await Filesystem.writeFile({ path: rel(name), directory: DIR, data: "", encoding: Encoding.UTF8 }); refresh(); }
    catch (e) { alert("Ошибка: " + e.message); }
  };
  const doDelete = async () => {
    for (const name of sel) {
      const e = entries.find((x) => x.name === name);
      try {
        if (e?.type === "directory") await Filesystem.rmdir({ path: rel(name), directory: DIR, recursive: true });
        else await Filesystem.deleteFile({ path: rel(name), directory: DIR });
      } catch (er) { alert(name + ": " + er.message); }
    }
    exitSel(); refresh();
  };
  const doRename = async () => {
    const name = [...sel][0];
    const nn = prompt("Новое имя", name); if (!nn || nn === name) return;
    try { await Filesystem.rename({ from: rel(name), to: rel(nn), directory: DIR, toDirectory: DIR }); exitSel(); refresh(); }
    catch (e) { alert("Ошибка: " + e.message); }
  };
  const grab = (mode) => { setClip({ mode, dir: path, items: [...sel] }); exitSel(); };
  const paste = async () => {
    if (!clip) return;
    for (const name of clip.items) {
      const from = join(clip.dir, name), to = rel(name);
      if (from === to) continue;
      try {
        if (clip.mode === "copy") await Filesystem.copy({ from, to, directory: DIR, toDirectory: DIR });
        else await Filesystem.rename({ from, to, directory: DIR, toDirectory: DIR });
      } catch (e) { alert(name + ": " + e.message); }
    }
    setClip(null); refresh();
  };

  const visible = query
    ? entries.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
    : entries;

  /* tap / long-press через pointer (без двойного срабатывания) */
  const lpTimer = useRef(); const lpFired = useRef(false); const moved = useRef(false);
  const pX = useRef(0); const pY = useRef(0);
  const rDown = (ev, e) => {
    lpFired.current = false; moved.current = false;
    pX.current = ev.clientX; pY.current = ev.clientY;
    lpTimer.current = setTimeout(() => { lpFired.current = true; longPress(e); }, 450);
  };
  const rMove = (ev) => {
    if (Math.abs(ev.clientX - pX.current) > 10 || Math.abs(ev.clientY - pY.current) > 10) {
      moved.current = true; clearTimeout(lpTimer.current);
    }
  };
  const rUp = (e) => { clearTimeout(lpTimer.current); if (lpFired.current || moved.current) return; open(e); };

  return (
    <div style={S.app}>
      {/* ВКЛАДКИ */}
      <div style={S.tabsbar}>
        <div style={S.tabs}>
          {tabs.map((t, i) => (
            <div key={t.id} onClick={() => setActive(i)}
              style={{ ...S.tab, ...(i === active ? S.tabActive : {}) }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>
                {t.path ? baseName(t.path) : "Storage"}
              </span>
              {tabs.length > 1 && (
                <span style={S.tabX} onClick={(e) => { e.stopPropagation(); closeTab(i); }}>×</span>
              )}
            </div>
          ))}
        </div>
        <button style={S.tabAdd} onClick={addTab}>＋</button>
      </div>

      {/* ПУТЬ */}
      <div style={S.crumb}>
        {path ? (
          <span onClick={goUp} style={{ display: "flex", alignItems: "center", gap: 6, color: ACC }}>
            <Svg d={I.back} size={18} /> {path}
          </span>
        ) : <span style={{ color: SUB }}>/storage</span>}
      </div>

      {/* СПИСОК */}
      <main style={S.list} onTouchStart={onTS} onTouchMove={onTM}>
        <div key={active} style={{ ...S.slideWrap, animation: slide ? `fm-in-${slide > 0 ? "r" : "l"} .22s ease` : "none" }}>
          {loading && <div style={S.note}>Загрузка…</div>}
          {error && <div style={{ ...S.note, color: RED }}>{error}<br />
            <span style={{ fontSize: 12 }}>Разрешите «Доступ ко всем файлам» в настройках приложения.</span></div>}
          {!loading && !error && visible.length === 0 && <div style={S.note}>Пусто</div>}
          {visible.map((e) => {
            const isSel = sel.has(e.name);
            return (
              <div key={e.name} style={{ ...S.row, ...(isSel ? S.rowSel : {}) }}
                onPointerDown={(ev) => rDown(ev, e)} onPointerMove={rMove}
                onPointerUp={() => rUp(e)} onPointerCancel={() => clearTimeout(lpTimer.current)}>
                <span style={{ color: e.type === "directory" ? ACC : SUB, display: "flex" }}>
                  <Svg d={e.type === "directory" ? I.folder : I.file} size={26} />
                </span>
                <span style={S.name}>{e.name}</span>
                {selMode && <span style={{ ...S.check, ...(isSel ? S.checkOn : {}) }}>{isSel ? "✓" : ""}</span>}
              </div>
            );
          })}
        </div>
      </main>

      {/* ПОИСК */}
      {query !== null && (
        <div style={S.searchBar}>
          <input autoFocus value={query} placeholder="Поиск в папке…"
            onChange={(e) => setQuery(e.target.value)} style={S.searchInput} />
          <button style={S.searchClose} onClick={() => setQuery(null)}>×</button>
        </div>
      )}

      {/* НИЖНЯЯ ПАНЕЛЬ — три зоны, центр всегда совпадает */}
      <nav style={S.bottom}>
        {!selMode ? (
          <>
            <Zone><Btn onClick={() => setQuery(query === null ? "" : null)} icon={I.search} label="Поиск" /></Zone>
            <Zone><Btn onClick={selectAll} icon={I.selectAll} label="Все" /></Zone>
            <Zone>
              {clip
                ? <Btn onClick={paste} icon={I.paste} label={"Вставить (" + clip.items.length + ")"} accent />
                : <div style={{ position: "relative", flex: 1, display: "flex" }}>
                    <Btn onClick={() => setCreateOpen((v) => !v)} icon={I.plus} label="Создать" accent />
                    {createOpen && (
                      <>
                        <div style={S.menuOverlay} onClick={() => setCreateOpen(false)} />
                        <div style={S.createMenu}>
                          <div style={S.createItem} onClick={doCreateFolder}>Папка</div>
                          <div style={S.createItem} onClick={doCreateTxt}>TXT</div>
                        </div>
                      </>
                    )}
                  </div>}
            </Zone>
          </>
        ) : confirmDel ? (
          <>
            <Zone />
            <Zone><Btn onClick={doDelete} text="Да" label="Удалить" red /></Zone>
            <Zone><Btn onClick={() => setConfirmDel(false)} text="Нет" label="Отмена" /></Zone>
          </>
        ) : (
          <>
            <Zone>
              <Btn onClick={() => grab("cut")} icon={I.cut} label="Вырезать" />
              <Btn onClick={() => grab("copy")} icon={I.copy} label="Копир." />
            </Zone>
            <Zone><Btn onClick={() => setConfirmDel(true)} icon={I.trash} label="Удалить" red /></Zone>
            <Zone><Btn onClick={doRename} text="A" label="Имя" underline disabled={sel.size !== 1} /></Zone>
          </>
        )}
      </nav>

      <style>{`
        @keyframes fm-in-r{from{transform:translateX(-14%);opacity:.4}to{transform:none;opacity:1}}
        @keyframes fm-in-l{from{transform:translateX(14%);opacity:.4}to{transform:none;opacity:1}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
        input{-webkit-user-select:text;user-select:text}
        body{margin:0}
        ::-webkit-scrollbar{width:0}
      `}</style>
    </div>
  );
}

const Zone = ({ children }) => <div style={{ flex: 1, display: "flex" }}>{children}</div>;

function Btn({ onClick, icon, text, label, accent, red, underline, disabled }) {
  const color = disabled ? "#445" : red ? RED : accent ? ACC : TXT;
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...S.btn, color }}>
      <span style={{ display: "flex", height: 26, alignItems: "center",
        fontSize: 22, fontWeight: 700, textDecoration: underline ? "underline" : "none" }}>
        {icon ? <Svg d={icon} size={26} /> : text}
      </span>
      <span style={S.btnLabel}>{label}</span>
    </button>
  );
}

const S = {
  app: { display: "flex", flexDirection: "column", height: "100vh", background: BG,
    color: TXT, fontFamily: "system-ui,-apple-system,Roboto,sans-serif", overflow: "hidden" },
  tabsbar: { display: "flex", alignItems: "center", background: BAR, borderBottom: "1px solid #0a0f15", flexShrink: 0 },
  tabs: { display: "flex", overflowX: "auto", flex: 1 },
  tab: { display: "flex", alignItems: "center", gap: 6, padding: "12px 14px", fontSize: 14,
    color: SUB, whiteSpace: "nowrap", borderBottom: "2px solid transparent" },
  tabActive: { color: TXT, borderBottom: "2px solid " + ACC },
  tabX: { fontSize: 17, color: SUB, padding: "0 2px" },
  tabAdd: { border: "none", background: "transparent", color: ACC, fontSize: 22, width: 46, height: 46, flexShrink: 0 },
  crumb: { padding: "8px 16px", fontSize: 13, background: BG, flexShrink: 0,
    borderBottom: "1px solid #11202c", overflow: "hidden", whiteSpace: "nowrap" },
  list: { flex: 1, overflowY: "auto", overflowX: "hidden" },
  slideWrap: { minHeight: "100%" },
  note: { color: SUB, textAlign: "center", padding: "60px 24px", lineHeight: 1.6 },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "13px 16px",
    borderBottom: "1px solid #131e28", touchAction: "pan-y" },
  rowSel: { background: "#1d3650" },
  name: { flex: 1, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  check: { width: 24, height: 24, borderRadius: 12, border: "2px solid " + SUB,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 },
  checkOn: { background: ACC, borderColor: ACC, color: "#fff" },
  searchBar: { display: "flex", alignItems: "center", background: ROW2, padding: 8, gap: 8, flexShrink: 0 },
  searchInput: { flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #2a3a47",
    background: BAR, color: TXT, fontSize: 15, outline: "none" },
  searchClose: { border: "none", background: "transparent", color: SUB, fontSize: 24, width: 40 },
  bottom: { display: "flex", background: BAR, borderTop: "1px solid #0a0f15",
    paddingBottom: "env(safe-area-inset-bottom)", flexShrink: 0 },
  btn: { flex: 1, border: "none", background: "transparent", padding: "10px 4px 12px",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  btnLabel: { fontSize: 11, color: SUB },
  menuOverlay: { position: "fixed", inset: 0, zIndex: 8 },
  createMenu: { position: "absolute", bottom: 60, right: 0, zIndex: 9, background: ROW2,
    borderRadius: 10, overflow: "hidden", border: "1px solid #2a3a47", boxShadow: "0 6px 24px #0009", minWidth: 130 },
  createItem: { padding: "14px 22px", fontSize: 15, color: TXT },
};
