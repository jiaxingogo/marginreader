'use client';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Plus, Search, ArrowUpRight, Upload, Download, Trash2, ArrowLeft, Check, Bookmark } from 'lucide-react';
import { Article, parseImport, generationPrompt, sample, annotatedParts } from './reading';
import { storageApi, BASE } from './storage';
const labels = { unread: '未读', reading: '在读', done: '已读' };
export default function Home() {
  const [view, V] = useState('home'), [items, I] = useState<Article[]>([]), [active, A] = useState<Article | null>(null), [query, Q] = useState(''), [order, O] = useState('updated-desc'), [filter, F] = useState('all'), [busy, S] = useState(false), [message, M] = useState(''), [loaded, L] = useState(false), [pending, P] = useState<Article[]>([]), [filename, FN] = useState(''), [notes, N] = useState(''), [dirty, D] = useState(false), [selected, SEL] = useState(-1), [del, DEL] = useState<Article | null>(null), [saved, SV] = useState('');
  const [extraRequirements, EXTRA] = useState('');
  const currentPrompt = generationPrompt(extraRequirements);
  const requestQueue = useRef<Promise<unknown>>(Promise.resolve());
  const flushProgress = useRef<() => void>(() => { });
  const position = useRef(0);
  const [recent, R] = useState<{
    id: string;
    position: number;
  } | null>(null);
  function remember(id: string, value: number) {
    const entry = { id, position: value }; R(entry); try {
      localStorage.setItem(BASE + 'last-read', JSON.stringify(entry));
    }
      catch { }
  }
  useEffect(() => {
    try {
      const entry = JSON.parse(localStorage.getItem(BASE + 'last-read') || 'null');
      if (entry && typeof entry.id === 'string' && Number.isFinite(entry.position))
        R({ id: entry.id, position: Math.max(0, Math.min(1, entry.position)) });
    }
    catch { }
  }, []);
  async function api(method = 'GET', data?: unknown) { const task = requestQueue.current.catch(() => { }).then(() => storageApi(method, data)); requestQueue.current = task; return task; }
  function cachedProgress(a: Article) {
    try {
      const local = JSON.parse(localStorage.getItem(BASE + 'progress-' + a.id) || 'null');
      if (local && Number.isFinite(local.position) && Number.isFinite(local.updated) && local.updated >= (a.updated || 0))
        return { ...a, position: Math.max(0, Math.min(1, local.position)), updated: local.updated };
    }
    catch { } return a;
  }
  async function refresh() { const j = await api(); I(j.articles.map(cachedProgress)); L(true); }
  useEffect(() => { refresh().catch(e => M(e.message)); }, []);
  useEffect(() => {
    function protect(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    } window.addEventListener('beforeunload', protect); return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  useEffect(() => {
    if (view !== 'read' || !active)
      return;
    const panel = document.getElementById('original-panel');
    if (!panel)
      return;
    const id = active.id;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: {
      position: number;
      updated: number;
    } | null = null;
    panel.scrollTop = position.current * Math.max(0, panel.scrollHeight - panel.clientHeight);
    const flush = () => {
      clearTimeout(timer); if (!pending)
        return; const change = pending; pending = null; api('PATCH', { id, position: change.position }).then(() => { SV('阅读位置已自动保存到此浏览器'); }).catch(() => { SV('本地保存失败，请导出备份；位置暂存在浏览器缓存'); });
    };
    flushProgress.current = flush;
    const record = () => {
      const updated = Date.now(); const value = position.current; pending = { position: value, updated }; try {
        localStorage.setItem(BASE + 'progress-' + id, JSON.stringify(pending));
      }
        catch { } remember(id, value); I(rows => rows.map(a => a.id === id ? { ...a, position: value, updated } : a)); A(a => a?.id === id ? { ...a, position: value, updated } : a); SV('正在自动保存…'); clearTimeout(timer); timer = setTimeout(flush, 800);
    };
    const scroll = () => { position.current = Math.max(0, Math.min(1, panel.scrollTop / Math.max(1, panel.scrollHeight - panel.clientHeight))); record(); };
    const hidden = () => {
      if (document.visibilityState === 'hidden')
        flush();
    };
    record();
    panel.addEventListener('scroll', scroll, { passive: true });
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', flush);
    return () => { panel.removeEventListener('scroll', scroll); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', flush); flush(); flushProgress.current = () => { }; };
  }, [view, active?.id]);
  function nav(next: string) {
    if (dirty && !confirm('笔记尚未保存，确定离开？'))
      return; D(false); history.pushState({}, '', BASE + (next === 'home' ? '' : next + '/')); V(next); M(''); window.scrollTo(0, 0);
  }
  function download(name: string, value: unknown) { const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: typeof value === 'string' ? 'text/plain;charset=utf-8' : 'application/json;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  async function backup() {
    flushProgress.current(); S(true); try {
      const j = await api();
      download('margin-reader-backup-' + new Date().toISOString().slice(0, 10) + '.json', { schemaVersion: 1, exportedAt: new Date().toISOString(), articles: j.articles.map(cachedProgress) });
      M('备份已导出，包含全部文章、译文、词汇注释、阅读状态、位置与笔记。');
    }
      catch (e: any) {
        M(e.message);
      }
      finally {
        S(false);
      }
  }
  async function file(f?: File) {
    P([]); FN(''); M(''); if (!f)
      return; try {
        if (f.size > 10000000)
          throw Error('文件不能超过 10 MB。');
        const rows = parseImport(JSON.parse(await f.text()));
        P(rows);
        FN(f.name);
      }
    catch (e: any) {
      M('未导入：' + e.message);
    }
  }
  async function importAll() {
    S(true); try {
      const j = await api('POST', { schemaVersion: 1, articles: pending });
      P([]);
      await refresh();
      nav('home');
      M(`已导入 ${j.imported} 篇；跳过 ${j.skipped} 篇重复文章。已有记录不会被覆盖。`);
    }
      catch (e: any) {
        M(e.message + ' 如已部分导入，可重试；重复文章会被跳过。');
      }
      finally {
        S(false);
      }
  }
  function open(a: Article, resume = false, push = true) {
    if (push)
      history.pushState({}, '', BASE + 'read/' + a.id + '/'); A(a); N(a.personalNotes || ''); D(false); SV(''); SEL(-1); position.current = a.position; try {
        const local = JSON.parse(localStorage.getItem(BASE + 'progress-' + a.id) || 'null');
        if (local && Number.isFinite(local.position) && local.updated >= (a.updated || 0))
          position.current = Math.max(0, Math.min(1, local.position));
      }
    catch { } remember(a.id, position.current); V('read'); window.scrollTo(0, 0);
  }
  async function update(changes: Partial<Article>) {
    if (!active)
      return; S(true); try {
        const j = await api('PATCH', { id: active.id, ...changes });
        A(j.article);
        I(v => v.map(a => a.id === j.article.id ? j.article : a));
        if (changes.personalNotes !== undefined)
          D(false);
        SV('已保存到此浏览器 · ' + new Date().toLocaleTimeString('zh-CN'));
        return true;
      }
    catch (e: any) {
      M(e.message);
      return false;
    }
    finally {
      S(false);
    }
  }
  function scrollNote(n: number) {
    const panel = document.getElementById('margin-notes'); const note = document.getElementById('note-' + n); if (!panel || !note)
      return; const horizontal = getComputedStyle(panel).scrollSnapType.startsWith('x'); const p = panel.getBoundingClientRect(), r = note.getBoundingClientRect(); panel.scrollTo({ ...horizontal ? { left: panel.scrollLeft + r.left - p.left - panel.clientLeft } : { top: panel.scrollTop + r.top - p.top - 12 }, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function highlight(text: string) { const nn = active?.analysis?.notes || []; return annotatedParts(text, nn).map((part, i) => part.index < 0 ? part.text : <button key={i} className={'term ' + (nn[part.index].kind === 'person' ? 'person-term ' : '') + (selected === part.index ? 'chosen' : '')} onClick={() => { SEL(part.index); scrollNote(part.index); }}>{part.text}<sup>{part.index + 1}</sup></button>); }
  const [routeKey, ROUTE] = useState(0);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const previousPath = useRef('');
  useEffect(() => {
    const query = new URLSearchParams(location.search); const redirected = query.get('route'); if (redirected && /^(import\/|read\/[a-f0-9-]{36}\/)$/.test(redirected))
      history.replaceState({}, '', BASE + redirected); const pop = () => {
        if (dirtyRef.current && !confirm('笔记尚未保存，确定离开？')) {
          history.pushState({}, '', previousPath.current);
          return;
        } D(false); ROUTE(x => x + 1);
      }; window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => { previousPath.current = location.pathname; }, [view, active?.id]);
  useEffect(() => {
    if (!loaded)
      return; let path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : ''; path = path.replace(/\/$/, ''); if (path === '') {
        V('home');
        return;
      } if (path === 'import') {
        V('import');
        return;
      } const match = /^read\/([a-f0-9-]{36})$/.exec(path); const a = match && items.find(x => x.id === match[1]); if (a) {
        open(a, true, false);
      }
    else {
      V('home');
      M('找不到这篇文章。若它只导入到另一台设备，请先在此设备导入文章或备份。');
    }
  }, [loaded, routeKey]);
  const lastRead = recent ? items.find(a => a.id === recent.id) : undefined;
  const filtered = items.filter(a => (filter === 'all' || a.status === filter) && (a.title + ' ' + a.body + ' ' + a.intro).toLowerCase().includes(query.toLowerCase())).sort((a, b) => order === 'updated-desc' ? (b.updated ?? b.created) - (a.updated ?? a.created) : order === 'updated-asc' ? (a.updated ?? a.created) - (b.updated ?? b.created) : order === 'desc' ? b.created - a.created : a.created - b.created);
  return <><header className="nav"><button className="brand" onClick={() => nav('home')}><BookOpen size={24} />页边 <span>Margin Reader</span></button><nav><button onClick={() => nav('home')}>我的文章</button><button disabled={busy} onClick={backup}><Download size={15} />备份</button><button className="primary" onClick={() => nav('import')}><Plus size={16} />导入文章</button></nav></header><main>{message && <div className="notice" role="status">{message}<button onClick={() => M('')}>×</button></div>}
    {view === 'home' && <><section className="hero"><div><p className="eyebrow">YOUR READING ROOM</p><h1>读懂字里，<i>也读懂行间。</i></h1><p className="sub">在 GPT 中分析，在页边慢慢读。<br />你的文章、笔记与阅读记录，留在自己的阅读室。</p><button className="primary" onClick={() => nav('import')}>导入一篇新阅读 <ArrowUpRight size={17} /></button></div><div className="resume-card"><p className="eyebrow">CONTINUE READING · 继续阅读</p>{lastRead ? <><h2>{lastRead.title || '未命名文章'}</h2><p className="resume-excerpt">{lastRead.intro || lastRead.body.slice(0, 160)}</p><button className="primary" onClick={() => open(lastRead, true)}>继续上次阅读 <ArrowUpRight size={17} /></button></> : <p className="sub">{loaded ? '还没有可继续阅读的文章。' : '正在载入阅读记录…'}</p>}</div></section><section className="collection"><div className="section-title"><h2>我的文章 <small>{items.length.toString().padStart(2, '0')}</small></h2><span>原文完整，注释相伴</span></div><div className="toolbar"><label className="search"><Search size={18} /><input aria-label="搜索标题和正文" placeholder="搜索标题或正文…" value={query} onChange={e => Q(e.target.value)} /></label><select aria-label="阅读状态筛选" value={filter} onChange={e => F(e.target.value)}><option value="all">全部状态</option>{Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><select aria-label="文章排序" value={order} onChange={e => O(e.target.value)}><option value="updated-desc">最近更新优先 ↓</option><option value="updated-asc">最早更新优先 ↑</option><option value="desc">最新添加优先 ↓</option><option value="asc">最早添加优先 ↑</option></select></div><div className="grid">{filtered.map(a => <article className="card" key={a.id}><a className="cardlink" href={BASE + 'read/' + a.id + '/'} onClick={e => {
      if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        open(a);
      }
    }}><span className="tag">{labels[a.status]} · {a.analysis ? `${a.analysis.notes.length} 条注释` : '仅原文'}</span><h3>{a.title || '未命名文章'}</h3><p>{a.body.slice(0, 140)}</p></a><div className="cardfoot"><span>更新 {new Date(a.updated ?? a.created).toLocaleString('zh-CN')} · 位置 {Math.round(a.position * 100)}%</span><button aria-label={'删除 ' + a.title} onClick={() => DEL(a)}><Trash2 size={16} /></button></div></article>)}{!query && filter === 'all' && <button className="addcard" onClick={() => nav('import')}><Upload size={26} /><b>导入分析文件</b><span>JSON 或备份 · 保存到此浏览器</span></button>}</div>{loaded && !filtered.length && <p className="empty">{query || filter !== 'all' ? '没有匹配的文章。' : '还没有个人文章。导入文件后，从这里开始阅读。'}</p>}{!loaded && <div className="empty">尚未载入文章。<button onClick={() => refresh().catch(e => M(e.message))}>重新加载</button></div>}</section></>}
    {view === 'import' && (
      <>
        <button className="back" onClick={() => nav('home')}>
          <ArrowLeft size={16} />返回我的文章
        </button>
        <p className="eyebrow">FROM CONVERSATION TO COLLECTION</p>
        <h1>把新的理解，带到页边。</h1>
        <p className="sub">
          上传 GPT 生成的分析文件，或恢复你导出的阅读库备份。不需要 API 密钥。
        </p>

        <div className="editor">
          <section className="form">
            <label className="upload">
              <Upload size={28} />
              <b>选择分析文件或备份文件</b>
              <span>JSON · 最大 10 MB · 每次最多 200 篇</span>
              <input
                aria-label="导入 JSON 文件"
                type="file"
                accept=".json,application/json"
                onChange={e => {
                  file(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>

            {pending.length > 0 && (
              <>
                <h2>确认导入 · {pending.length} 篇</h2>
                <p className="muted">{filename}</p>
                <div className="importlist">
                  {pending.map((a, i) => (
                    <div key={i}>
                      <b>{a.title || '未命名文章'}</b>
                      <p>
                        {a.body.length.toLocaleString()} 字符 · {a.analysis?.notes.length || 0} 条词汇注释 · {labels[a.status]}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="muted">
                  同一文件重复导入会跳过。恢复备份时，相同编号的文章保留网站现有版本，不会覆盖笔记。
                </p>
                <button className="primary" disabled={busy} onClick={importAll}>
                  {busy ? '正在保存…' : '确认导入'}
                  <Check size={16} />
                </button>
              </>
            )}

            {!pending.length && (
              <div className="profile">
                <h3>三步，开始阅读</h3>
                <p>
                  1. 复制提示词，将它和文章一起交给 GPT。
                  <br />
                  2. 让 GPT 生成可下载的 .json 分析文件。
                  <br />
                  3. 在这里上传，确认后加入你的阅读库。
                </p>
              </div>
            )}
          </section>

          <aside className="preferences">
            <p className="eyebrow">FILE GUIDE</p>
            <h2>让 GPT 输出统一格式</h2>
            <p>
              包含完整原文、中文翻译、英语定义、法语对应表达及语境补充。词汇必须与原文逐字对应。
            </p>
            <label htmlFor="generation-extra">
              本次额外要求（可选）
              <textarea
                id="generation-extra"
                rows={5}
                value={extraRequirements}
                onChange={e => EXTRA(e.target.value)}
                placeholder="例如：重点解释习语和政治背景；法语对应表达请标注词性。"
                aria-describedby="generation-extra-help"
              />
            </label>
            <p id="generation-extra-help">
              填写内容会同时加入下载的生成说明和复制的提示词；留空则使用默认说明。
            </p>

            <button
              className="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(currentPrompt);
                  M('生成提示词已复制。');
                } catch {
                  M('无法访问剪贴板，请下载生成说明。');
                }
              }}
            >
              复制提示词
            </button>

            <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 18 }}>
              <button onClick={() => download('reading-example.json', sample)}>
                下载 JSON 示例
              </button>
              <button onClick={() => download('GPT-reading-instructions.txt', currentPrompt)}>
                下载生成说明 <Download size={16} />
              </button>
            </div>

            <div className="service">
              分析在 GPT 对话中完成。本站不会调用 AI 服务。
              <p>
                阅读位置自动保存，也可手动保存。文章导入、阅读位置与笔记保存在当前浏览器，不会自动写入 GitHub 或同步到其他设备。备份导出包含这些记录。
              </p>
            </div>
          </aside>
        </div>
      </>
    )}

    {view === 'read' && active && <><button className="back" onClick={() => nav('home')}><ArrowLeft size={16} />返回我的文章</button><div className="readcontrols"><label>阅读状态 <select value={active.status} disabled={busy} onChange={e => update({ status: e.target.value as Article['status'] })}>{Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><button disabled={busy} onClick={() => update({ position: position.current, status: active.status === 'unread' ? 'reading' : active.status })}><Bookmark size={15} />保存当前位置</button><button onClick={() => (() => {
      const p = document.getElementById('original-panel'); if (p)
        p.scrollTo({ top: active.position * Math.max(0, p.scrollHeight - p.clientHeight), behavior: 'smooth' });
    })()}>回到阅读位置 {Math.round(active.position * 100)}%</button><button onClick={() => download('reading-' + active.id + '.json', { schemaVersion: 1, ...active })}>导出本文</button><span role="status">{saved}</span></div><div className="paper imported-reader"><div className="paperhead"><p className="eyebrow">MAGAZINE READER / MARGIN NOTES</p><h1>{highlight(active.title || '未命名文章')}</h1>{active.intro && <p className="intro">{highlight(active.intro)}</p>}</div><div className="reading"><article id="original-panel" tabIndex={0} aria-label="原文与译文滚动区域"><p className="eyebrow">ORIGINAL TEXT · 原文</p><div className="source">{active.body.split(/\n\s*\n/).map((p, i) => <p key={i}>{highlight(p)}</p>)}</div>{active.analysis && <section className="translation"><p className="eyebrow">TRANSLATION · 中文译文</p><p>{active.analysis.translation}</p></section>}</article><aside id="margin-notes" tabIndex={0} aria-label="页边词汇滚动区域"><p className="eyebrow">VOCABULARY · 词汇解释</p><p className="right-hint">依原文出现顺序排列；点击划线词汇可定位对应注释。</p>{active.analysis?.notes.map((n, i) => <section id={'note-' + i} className={'note ' + (n.kind === 'person' ? 'person-note ' : '') + (selected === i ? 'selected' : '')} key={i}><span className="number">{String(i + 1).padStart(2, '0')}</span><div><h3>{n.term} <small>{n.ipa}</small></h3><p className="meaning">{n.meaning}</p>{n.kind === 'person' && <p className="person-aliases">文中称呼：{n.aliases?.join('、')}</p>}<p className="definition">{n.definition}</p><p className="french">{n.french && 'FR · '}{n.french}</p><p className="context">{n.context && <b>语境：</b>}{n.context}</p></div></section>)}{!active.analysis && <p className="muted">这篇文章只保存了原文，没有导入分析结果。</p>}</aside></div><div className="reader-footer"><span>READ WITHOUT INTERRUPTING THE PARAGRAPH</span><span>ENGLISH · 中文 · FRANÇAIS</span></div></div><section className="personal"><label><p className="eyebrow">MY NOTES · 个人笔记</p><textarea aria-label="个人笔记" disabled={busy} value={notes} maxLength={50000} rows={6} onChange={e => { N(e.target.value); D(true); }} placeholder="写下你的理解、疑问或想保留的句子…" /></label><div className="actions"><span>{dirty ? '有未保存的修改' : '笔记已保存'} · {notes.length}/50,000</span><button className="primary" disabled={busy || !dirty} onClick={() => update({ personalNotes: notes })}>保存笔记 <Check size={15} /></button></div></section></>}
  </main><footer><span>页边 / MARGIN READER</span><span>自己的阅读室 · 分析文件可随时备份</span></footer>{del && <div className="overlay"><div className="dialog" role="dialog" aria-modal="true" aria-label="删除文章"><h2>删除这篇文章？</h2><p>「{del.title || '未命名文章'}」将从此浏览器移除；不会删除 GitHub 仓库文件。已有备份可重新导入。</p><div className="actions"><button onClick={() => DEL(null)}>取消</button><button className="danger" disabled={busy} onClick={async () => {
    S(true); try {
      await api('DELETE', { id: del.id });
      try {
        localStorage.removeItem(BASE + 'progress-' + del.id);
      }
      catch { }
      I(v => v.filter(a => a.id !== del.id));
      DEL(null);
      M('文章已删除。');
    }
      catch (e: any) {
        M(e.message);
        DEL(null);
      }
      finally {
        S(false);
      }
  }}>确认删除</button></div></div></div>}</>;
}
