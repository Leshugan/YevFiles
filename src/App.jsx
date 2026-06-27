import React, { useState, useEffect, useRef, useCallback } from "react";

/* ===== Update Checker — leshugan.uc =====
   Single-file React app для Capacitor WebView APK.
   GitHub API (releases) -> бейдж новых релизов, как непрочитанные в мессенджере. */

const ACC = "#EF6C00";
const GOLD = "#F5A623";
const BG = "#1C140C";
const CARD = "#2A2017";
const CARD2 = "#2E251C";
const TXT = "#F2EAE0";
const SUB = "#B0A498";
const LINE = "#4A3A2A";
const KEY = "uc_sources_v1";

/* ---- безопасное хранилище (работает в WebView; не падает в песочнице) ---- */
const store = {
  read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY)) || [];
      // миграция: старые записи без iconCands — сбросить кэш иконок, чтобы пересобрать новым алгоритмом
      return v.map((s) => (s && s.iconResolved && !s.iconCands)
        ? { ...s, iconResolved: false, resolvedIcon: undefined, iconUrl: undefined, readmeIcon: undefined }
        : s);
    } catch { return mem; }
  },
  write(v) {
    mem = v;
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {}
  },
};
let mem = [];

/* ---- разбор ссылки github.com/owner/repo/... ---- */
function parseRepo(url) {
  const m = String(url).trim().match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

/* ---- получить список релизов ---- */
async function fetchReleases(owner, repo) {
  const r = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`,
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (r.status === 403) throw new Error("Лимит GitHub API (60/час). Подождите.");
  if (r.status === 404) throw new Error("Репозиторий или релизы не найдены.");
  if (!r.ok) throw new Error("Ошибка сети " + r.status);
  return r.json();
}

/* ---- открыть системный браузер Android ---- */
function openExternal(url) {
  try { window.open(url, "_system"); } catch {}
  // fallback
  try { window.open(url, "_blank"); } catch {}
}

/* ---- уведомление (Web Notification; в WebView может требовать нативной настройки) ---- */
function notify(title, body) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") new Notification(title, { body });
    else if (Notification.permission !== "denied")
      Notification.requestPermission();
  } catch {}
}

function Avatar({ owner, repo, cands, resolved, onResolved }) {
  // cands — уже упорядоченный по «иконочности» список (строится при проверке).
  const list = [];
  if (resolved) list.push(resolved);          // найденная ранее — первой, без перебора
  if (Array.isArray(cands)) for (const u of cands) if (u && u !== resolved) list.push(u);
  const [i, setI] = useState(0);
  if (i < list.length)
    return (
      <img
        src={list[i]}
        alt=""
        loading="lazy"
        onLoad={(e) => {
          // отбраковка неквадратного: баннеры/бейджи/скрины — не иконки
          const w = e.target.naturalWidth, h = e.target.naturalHeight;
          if (w && h && Math.min(w, h) / Math.max(w, h) < 0.7) { setI(i + 1); return; }
          if (onResolved && list[i] !== resolved) onResolved(list[i]);
        }}
        onError={() => setI(i + 1)}
        style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, objectFit: "cover", background: CARD2 }}
      />
    );
  return <div style={S.avatar}>{repo[0]?.toUpperCase()}</div>;
}

/* ---- оценка «иконочности» пути файла в репозитории ---- */
function iconScore(path) {
  const p = path.toLowerCase();
  const base = p.split("/").pop();
  if (/\.(svg|gif)$/.test(base)) return 0;
  if (!/\.(png|webp|jpg|jpeg)$/.test(base)) return 0;
  // явно не иконка
  if (/banner|feature|screenshot|screen_?shot|header|cover|promo|graphic|preview|demo|hero/.test(p)) return 0;
  if (base === "ic_launcher-playstore.png") return 100;
  if (/fastlane\/.*images\/icon\.(png|webp)/.test(p)) return 96;
  if (/metadata\/.*images\/icon\.(png|webp)/.test(p)) return 94;
  if (base === "icon.png" || base === "icon.webp") return 90 - p.split("/").length; // ближе к корню — выше
  // mipmap по плотности
  const dpi = { "xxxhdpi": 86, "xxhdpi": 82, "xhdpi": 78, "hdpi": 74, "mdpi": 70 };
  for (const k in dpi) if (p.includes("mipmap-" + k) && /ic_launcher/.test(base))
    return dpi[k] - (/round/.test(base) ? 3 : 0) - (/foreground/.test(base) ? 8 : 0);
  if (/ic_launcher/.test(base)) return 60;
  if (/app_?icon|ic_app|launcher/.test(base)) return 55;
  if (base === "logo.png" || base === "logo.webp") return 40;
  return 0;
}

export default function App() {
  const [sources, setSources] = useState(() => store.read());
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const longRef = useRef(false);

  const save = useCallback((next) => {
    setSources(next);
    store.write(next);
  }, []);

  /* проверка одного источника: вернуть обновлённый объект */
  const checkOne = useCallback(async (s) => {
    try {
      const rels = await fetchReleases(s.owner, s.repo);
      let iconCands = s.iconCands || null;
      let branch = s.branch || "HEAD";
      let iconResolved = s.iconResolved;
      // иконку резолвим ОДИН раз и кэшируем упорядоченным списком
      if (!s.iconResolved) {
        let orgAvatar = null;
        try {
          const ri = await fetch(`https://api.github.com/repos/${s.owner}/${s.repo}`,
            { headers: { Accept: "application/vnd.github+json" } });
          if (ri.ok) {
            const info = await ri.json();
            branch = info.default_branch || "HEAD";
            // только организация: её аватар = логотип проекта. У юзера — нет, оставим букву.
            orgAvatar = info.owner && info.owner.type === "Organization" ? info.owner.avatar_url : null;
          }
        } catch {}
        const raw = (p) => `https://raw.githubusercontent.com/${s.owner}/${s.repo}/${branch}/${p}`;
        const scored = [];
        let treeOk = false;
        // 1) реальный обход файлов репозитория
        try {
          const tr = await fetch(`https://api.github.com/repos/${s.owner}/${s.repo}/git/trees/${branch}?recursive=1`,
            { headers: { Accept: "application/vnd.github+json" } });
          if (tr.ok) {
            treeOk = true;
            const tj = await tr.json();
            for (const node of (tj.tree || [])) {
              if (node.type !== "blob") continue;
              const sc = iconScore(node.path);
              if (sc > 0) scored.push({ url: raw(node.path), sc });
            }
            scored.sort((a, b) => b.sc - a.sc);
          }
        } catch {}
        let cands = scored.map((x) => x.url);
        // 2) README — только если дерево не дало иконок (экономим запрос → меньше шансов словить лимит)
        if (!cands.length) try {
          const rr = await fetch(`https://api.github.com/repos/${s.owner}/${s.repo}/readme`,
            { headers: { Accept: "application/vnd.github+json" } });
          if (rr.ok) {
            const rj = await rr.json();
            const md = rj.content ? decodeURIComponent(escape(atob(rj.content.replace(/\n/g, "")))) : "";
            const base = (rj.download_url || raw("README.md")).replace(/\/[^/]*$/, "/");
            const re = /!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img[^>]+src=["']([^"']+)["']/gi;
            let m;
            while ((m = re.exec(md))) {
              let u = (m[1] || m[2] || "").trim();
              if (!u) continue;
              if (/shields\.io|badge|\.svg|\.gif|img\.shields/i.test(u)) continue; // бейджи/анимации мимо
              if (!/^https?:\/\//i.test(u)) u = base + u.replace(/^\.?\//, "");
              u = u.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
              cands.push(u);
              break;
            }
          }
        } catch {}
        // 3) аватар организации — крайний запас. У юзерских репо без растра остаётся буква.
        if (orgAvatar) cands.push(orgAvatar);
        iconCands = cands;
        // помечаем resolved только если дерево реально прочиталось; иначе (лимит/сеть) — ретрай позже
        iconResolved = treeOk;
      }
      const meta = { branch, iconCands, iconResolved };
      if (!rels.length) return { ...s, ...meta, error: "Нет релизов", busy: false };
      const latest = rels[0];
      let newCount;
      if (!s.lastSeenTag) newCount = 0;
      else {
        const i = rels.findIndex((r) => r.tag_name === s.lastSeenTag);
        newCount = i === -1 ? rels.length : i; // сколько релизов вышло поверх виденного
      }
      return {
        ...s,
        ...meta,
        name: s.repo,
        latestTag: latest.tag_name,
        latestName: latest.name || latest.tag_name,
        latestUrl: latest.html_url,
        publishedAt: latest.published_at,
        newCount,
        error: null,
        busy: false,
      };
    } catch (e) {
      return { ...s, error: e.message, busy: false };
    }
  }, []);

  /* проверить все */
  const refreshAll = useCallback(async () => {
    setBusy(true);
    try {
      const cur = store.read();
      const out = [];
      for (const s of cur) {
        const u = await checkOne(s);
        if (u.newCount > 0 && (s.newCount || 0) < u.newCount)
          notify("Update Checker", `${u.repo}: новый релиз ${u.latestTag}`);
        out.push(u);
      }
      save(out);
    } finally {
      setBusy(false);
    }
  }, [checkOne, save]);

  /* автопроверка при заходе */
  useEffect(() => {
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch {}
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* добавить источник */
  const addSource = async () => {
    const p = parseRepo(input);
    if (!p) { alert("Вставьте ссылку вида github.com/owner/repo"); return; }
    if (sources.some((s) => s.owner === p.owner && s.repo === p.repo)) {
      alert("Источник уже добавлен"); setAdding(false); setInput(""); return;
    }
    setAdding(false);
    const base = {
      id: p.owner + "/" + p.repo,
      owner: p.owner, repo: p.repo, name: p.repo,
      lastSeenTag: null, newCount: 0, error: null,
    };
    const next = [...sources, base];
    save(next);
    setInput("");
    // первый запрос: фиксируем текущий релиз как "виденный" (без бейджа)
    const u = await checkOne(base);
    save([...next.filter((x) => x.id !== u.id),
      { ...u, lastSeenTag: u.latestTag, newCount: 0 }]
      .sort((a, b) => a.id.localeCompare(b.id)));
  };

  /* тап по источнику: открыть + пометить прочитанным */
  const openSource = (s) => {
    if (longRef.current) { longRef.current = false; return; }
    if (s.latestUrl) openExternal(s.latestUrl);
    else openExternal(`https://github.com/${s.owner}/${s.repo}/releases`);
    if (s.newCount) save(sources.map((x) =>
      x.id === s.id ? { ...x, lastSeenTag: x.latestTag, newCount: 0 } : x));
  };

  const removeSource = (s) => {
    if (confirm(`Удалить ${s.repo}?`))
      save(sources.filter((x) => x.id !== s.id));
  };

  /* long-press для удаления */
  const press = useRef();
  const onDown = (s) => {
    longRef.current = false;
    press.current = setTimeout(() => { longRef.current = true; removeSource(s); }, 600);
  };
  const onUp = () => clearTimeout(press.current);

  return (
    <div style={S.app}>
      {/* ===== ХЕДЕР ===== */}
      <header style={S.header}>
        <span style={S.title}>Update Checker</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={S.iconBtn} onClick={refreshAll} title="Обновить">
            <span style={{ display: "inline-block",
              animation: busy ? "ucspin 0.8s linear infinite" : "none" }}>↻</span>
          </button>
          <button style={S.iconBtn} onClick={() => setMenu((v) => !v)}>⋮</button>
        </div>
        {menu && (
          <>
            <div style={S.menuOverlay} onClick={() => setMenu(false)} />
            <div style={S.menu}>
              <div style={S.menuItem}
                onClick={() => { setMenu(false); setAdding(true); }}>
                + Добавить источник
              </div>
            </div>
          </>
        )}
      </header>

      {/* ===== СПИСОК ===== */}
      <main style={S.list}>
        {sources.length === 0 && (
          <div style={S.empty}>
            Нет источников.<br />
            Откройте ⋮ → «Добавить источник» и вставьте ссылку на релизы GitHub.
          </div>
        )}
        {sources.map((s) => (
          <div key={s.id} style={S.row}
            onClick={() => openSource(s)}
            onTouchStart={() => onDown(s)}
            onTouchEnd={onUp} onTouchMove={onUp}
            onContextMenu={(e) => { e.preventDefault(); removeSource(s); }}>
            <Avatar
              key={s.id + "@" + (s.branch || "HEAD")}
              owner={s.owner} repo={s.repo}
              cands={s.iconCands} resolved={s.resolvedIcon}
              onResolved={(url) => {
                const cur = store.read();
                save(cur.map((x) => (x.id === s.id ? { ...x, resolvedIcon: url } : x)));
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.repoName}>{s.repo}</div>
              <div style={S.repoSub}>
                {s.error ? <span style={{ color: "#e06b6b" }}>{s.error}</span>
                  : s.latestTag
                    ? `${s.owner} · ${s.latestTag}`
                    : `${s.owner} · …`}
              </div>
            </div>
            {s.newCount > 0 && (
              <div style={S.badge}>+{s.newCount}</div>
            )}
          </div>
        ))}
      </main>

      {/* ===== МОДАЛКА ДОБАВЛЕНИЯ ===== */}
      {adding && (
        <div style={S.modalOverlay} onClick={() => setAdding(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalTitle}>Добавить источник</div>
            <input style={S.input} value={input} autoFocus
              placeholder="https://github.com/owner/repo/releases"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSource()} />
            <div style={S.modalBtns}>
              <button style={S.btnGhost} onClick={() => { setAdding(false); setInput(""); }}>
                Отмена
              </button>
              <button style={S.btnAcc} onClick={addSource}>Добавить</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes ucspin{to{transform:rotate(360deg)}}
        @keyframes dropGrow{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
        @keyframes fS{from{opacity:0}to{opacity:1}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        body{margin:0;background:#1C140C}
        html{background:#1C140C}`}</style>
    </div>
  );
}

const S = {
  app: { minHeight: "100vh", background: BG, color: TXT,
    paddingTop: "env(safe-area-inset-top)",
    fontFamily: "system-ui,-apple-system,Roboto,sans-serif", userSelect: "none" },
  header: { position: "sticky", top: "env(safe-area-inset-top)", zIndex: 50, height: 52, background: CARD,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 6px 0 16px", borderRadius: 24, margin: "8px 8px 10px",
    boxShadow: "0 1px 0 rgba(255,255,255,.06) inset, 0 4px 10px rgba(0,0,0,.4), 0 14px 36px rgba(0,0,0,.6)" },
  title: { fontSize: 17, fontWeight: 600 },
  iconBtn: { width: 42, height: 42, border: "none", background: "transparent",
    color: TXT, fontSize: 21, cursor: "pointer", borderRadius: 21 },
  menuOverlay: { position: "fixed", inset: 0, zIndex: 8 },
  menu: { position: "absolute", top: 50, right: 8, zIndex: 9, background: CARD,
    borderRadius: 14, overflow: "hidden", border: "1px solid " + LINE,
    boxShadow: "0 1px 0 rgba(255,255,255,.07) inset, 0 4px 12px rgba(0,0,0,.4), 0 18px 48px rgba(0,0,0,.62)",
    animation: "dropGrow .2s cubic-bezier(.2,.9,.3,1.2)", transformOrigin: "top right" },
  menuItem: { padding: "14px 20px", fontSize: 15, cursor: "pointer", whiteSpace: "nowrap" },
  list: { padding: "4px 8px 40px" },
  empty: { color: SUB, textAlign: "center", padding: "80px 32px", lineHeight: 1.6, fontSize: 14 },
  row: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
    cursor: "pointer", background: CARD, borderRadius: 16, marginBottom: 8,
    boxShadow: "0 1px 0 rgba(255,255,255,.04) inset, 0 2px 6px rgba(0,0,0,.3), 0 8px 22px rgba(0,0,0,.35)" },
  avatar: { width: 46, height: 46, borderRadius: 13, flexShrink: 0,
    background: `linear-gradient(135deg,${GOLD},${ACC})`, color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 20, fontWeight: 700 },
  repoName: { fontSize: 16, fontWeight: 500, overflow: "hidden",
    textOverflow: "ellipsis", whiteSpace: "nowrap" },
  repoSub: { fontSize: 13, color: SUB, marginTop: 2, overflow: "hidden",
    textOverflow: "ellipsis", whiteSpace: "nowrap" },
  badge: { minWidth: 24, height: 24, padding: "0 7px", borderRadius: 12,
    background: ACC, color: "#fff", fontSize: 13, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    boxShadow: "0 2px 8px rgba(239,108,0,.4)" },
  modalOverlay: { position: "fixed", inset: 0, zIndex: 20, background: "rgba(0,0,0,.62)",
    backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    animation: "fS .2s ease" },
  modal: { width: "100%", maxWidth: 380, background: CARD, borderRadius: 18, padding: 20,
    boxShadow: "0 1px 0 rgba(255,255,255,.07) inset, 0 4px 12px rgba(0,0,0,.4), 0 18px 48px rgba(0,0,0,.62)",
    animation: "dropGrow .22s cubic-bezier(.2,.9,.3,1.1)" },
  modalTitle: { fontSize: 17, fontWeight: 600, marginBottom: 16 },
  input: { width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 15,
    background: CARD2, border: "1px solid " + LINE, color: TXT, outline: "none",
    userSelect: "text" },
  modalBtns: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  btnGhost: { padding: "10px 16px", borderRadius: 14, border: "none",
    background: "transparent", color: SUB, fontSize: 15, cursor: "pointer" },
  btnAcc: { padding: "10px 20px", borderRadius: 14, border: "1px solid " + ACC,
    background: "rgba(239,108,0,.16)", color: ACC, fontSize: 15, fontWeight: 600, cursor: "pointer" },
};
