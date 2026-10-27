import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const makeIcon = (glyph) => ({ size = 16 }) => <span aria-hidden="true" style={{fontSize:size, lineHeight:1, display:'inline-grid', placeItems:'center', width:size, height:size}}>{glyph}</span>;
const ArrowRight=makeIcon('→'), Check=makeIcon('✓'), ChevronDown=makeIcon('⌄'), Download=makeIcon('↓'), FileJson=makeIcon('{ }'), GitBranch=makeIcon('⑂'), MessageSquareReply=makeIcon('↩'), MoreHorizontal=makeIcon('•••'), Plus=makeIcon('+'), Save=makeIcon('◇'), Sparkles=makeIcon('✦'), Trash2=makeIcon('×'), Upload=makeIcon('↑'), X=makeIcon('×');

const STORAGE_KEY = 'apo-talk-tree:v1';
const sample = {
  version: 1,
  title: '法人向け業務効率化サービス｜初回アポ獲得',
  updatedAt: new Date().toISOString(),
  root: {
    id: 'n1', type: 'talk', label: '導入',
    text: 'お世話になっております。〇〇株式会社の佐藤と申します。\n業務効率化のご支援について、少しだけお時間よろしいでしょうか？',
    children: [
      { id: 'n2', type: 'reaction', label: '興味あり', text: 'はい、大丈夫です', children: [
        { id: 'n3', type: 'talk', label: 'ヒアリング', text: 'ありがとうございます。現在、日々の定型業務にどのくらいお時間を使われていますか？', children: [] }
      ]},
      { id: 'n4', type: 'objection', label: '忙しい', text: '今ちょっと忙しくて…', children: [
        { id: 'n5', type: 'reply', label: '切り返し', text: '承知しました。30秒だけ要点をお伝えして、必要なければすぐ切らせていただきます。', children: [
          { id: 'n6', type: 'reaction', label: '続ける', text: '30秒なら', children: [] },
          { id: 'n7', type: 'reaction', label: '終了', text: 'また今度にして', children: [] }
        ]}
      ]},
      { id: 'n8', type: 'objection', label: '間に合っている', text: '今のやり方で間に合っています', children: [
        { id: 'n9', type: 'reply', label: '切り返し', text: 'そうですよね。実は今の運用を変えずに、作業時間だけを減らせる点をご評価いただいています。', children: [] }
      ]}
    ]
  }
};

const clone = (v) => JSON.parse(JSON.stringify(v));
const uid = () => `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const typeLabel = { talk: '自分のトーク', reaction: '相手の反応', objection: '断り文句', reply: '切り返し' };

function walk(node, fn) { fn(node); node.children?.forEach((child) => walk(child, fn)); }
function updateNode(root, id, updater) {
  if (root.id === id) return updater({ ...root });
  return { ...root, children: (root.children || []).map((child) => updateNode(child, id, updater)) };
}
function removeNode(root, id) {
  return {
    ...root,
    children: (root.children || []).flatMap((child) =>
      child.id === id ? (child.children || []) : [removeNode(child, id)]
    )
  };
}
function countNodes(root) { let count = 0; walk(root, () => count++); return count; }

function App() {
  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || clone(sample); } catch { return clone(sample); }
  });
  const [selectedId, setSelectedId] = useState(data.root.id);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const fileRef = useRef(null);
  const stats = useMemo(() => ({ nodes: countNodes(data.root), branches: Math.max(0, countNodes(data.root) - 1) }), [data]);
  let selected = null; walk(data.root, (n) => { if (n.id === selectedId) selected = n; });

  const flash = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2200); };
  const commit = (next) => setData({ ...next, updatedAt: new Date().toISOString() });
  const save = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); flash('ブラウザに保存しました'); };

  const addChild = (parentId, type = 'reply') => {
    const child = { id: uid(), type, label: typeLabel[type], text: '', children: [] };
    const root = updateNode(data.root, parentId, (n) => ({ ...n, children: [...(n.children || []), child] }));
    commit({ ...data, root }); setSelectedId(child.id);
  };
  const insertNext = (nodeId) => {
    const next = { id: uid(), type: 'talk', label: '次のトーク', text: '', children: [] };
    const root = updateNode(data.root, nodeId, (node) => ({
      ...node,
      children: [{ ...next, children: node.children || [] }]
    }));
    commit({ ...data, root }); setSelectedId(next.id);
  };
  const patchSelected = (patch) => commit({ ...data, root: updateNode(data.root, selectedId, (n) => ({ ...n, ...patch })) });
  const deleteNode = (nodeId) => {
    if (nodeId === data.root.id) return;
    if (!window.confirm('このノードを削除しますか？ 後ろのノードは前のノードにつなぎ直されます。')) return;
    commit({ ...data, root: removeNode(data.root, nodeId) });
    if (selectedId === nodeId) setSelectedId(data.root.id);
  };
  const createFromSource = () => {
    const lines = sourceText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    let root = { id: uid(), type: 'talk', label: '導入', text: lines[0], children: [] };
    let cursor = root;
    lines.slice(1).forEach((line, i) => { const node = { id: uid(), type: 'talk', label: `トーク ${i + 2}`, text: line, children: [] }; cursor.children = [node]; cursor = node; });
    commit({ version: 1, title: data.title || '新しいアポトーク', root }); setSelectedId(root.id); setSourceOpen(false); flash('原本からツリーを作成しました');
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `apo-talk-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href); setMenuOpen(false); flash('JSONを書き出しました');
  };
  const importJson = async (file) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed?.root?.id || !Array.isArray(parsed.root.children)) throw new Error();
      commit(parsed); setSelectedId(parsed.root.id); flash('JSONを読み込みました');
    } catch { flash('対応していないJSON形式です'); }
    setMenuOpen(false);
  };

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }, [data]);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><GitBranch size={20}/></div><div><b>APO TALK TREE</b><span>営業トーク設計</span></div></div>
      <div className="top-actions">
        <button className="btn ghost" onClick={save}><Save size={17}/>保存</button>
        <div className="menu-wrap">
          <button className="btn primary" onClick={() => setMenuOpen(!menuOpen)}><FileJson size={17}/>JSON<ChevronDown size={15}/></button>
          {menuOpen && <div className="menu"><button onClick={exportJson}><Download size={16}/>エクスポート</button><button onClick={() => fileRef.current?.click()}><Upload size={16}/>インポート</button></div>}
        </div>
        <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}/>
      </div>
    </header>

    <main>
      <section className="intro">
        <div><p className="eyebrow"><Sparkles size={14}/> TALK DESIGN WORKSPACE</p><input className="title-input" value={data.title} onChange={(e) => commit({ ...data, title: e.target.value })}/><p className="subtitle">断られた、その先を設計する。会話の流れを俯瞰して、勝てる切り返しを育てましょう。</p></div>
        <button className="btn source" onClick={() => setSourceOpen(true)}><Plus size={18}/>原本トークから作成</button>
      </section>

      <section className="workspace">
        <div className="canvas-head"><div><span className="status-dot"></span>自動保存中</div><div className="stats"><span>{stats.nodes} ノード</span><span>{stats.branches} 接続</span></div></div>
        <div className="canvas"><TreeNode node={data.root} rootId={data.root.id} selectedId={selectedId} onSelect={setSelectedId} onAdd={addChild} onInsert={insertNext} onDelete={deleteNode}/></div>
      </section>

      <aside className={`editor ${selected ? 'open' : ''}`}>
        <div className="editor-head"><div><p>ノードを編集</p><span>ID: {selected?.id}</span></div><button onClick={() => setSelectedId('')}><X size={18}/></button></div>
        {selected && <div className="editor-body">
          <label>種類<select value={selected.type} onChange={(e) => patchSelected({ type: e.target.value })}>{Object.entries(typeLabel).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>ラベル<input value={selected.label} onChange={(e) => patchSelected({ label: e.target.value })}/></label>
          <label>トーク内容<textarea rows="7" value={selected.text} placeholder="ここに話す内容を入力…" onChange={(e) => patchSelected({ text: e.target.value })}/></label>
          <div className="quick-add"><p>この後の分岐を追加</p><div><button onClick={() => addChild(selected.id, 'reaction')}><MessageSquareReply size={16}/>相手の反応</button><button onClick={() => addChild(selected.id, 'objection')}><GitBranch size={16}/>断り文句</button><button onClick={() => addChild(selected.id, 'reply')}><ArrowRight size={16}/>切り返し</button></div></div>
          <button className="insert-next" onClick={() => insertNext(selected.id)}><Plus size={16}/>ノードを1つ後ろに追加</button>
          {selected.id !== data.root.id && <button className="danger" onClick={() => deleteNode(selected.id)}><Trash2 size={16}/>このノードを削除</button>}
        </div>}
      </aside>
    </main>

    {sourceOpen && <div className="modal-backdrop" onMouseDown={() => setSourceOpen(false)}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setSourceOpen(false)}><X/></button><p className="eyebrow"><Sparkles size={14}/> START FROM SCRIPT</p><h2>原本トークを貼り付ける</h2><p>一行ごとにひとつのトークノードとして、最初の会話フローを作成します。あとから自由に分岐を足せます。</p><textarea autoFocus rows="10" value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder={'お世話になっております。〇〇株式会社の佐藤です。\n本日は業務効率化についてご連絡しました。\n現在の運用について少し伺えますか？'}/><button className="btn primary wide" disabled={!sourceText.trim()} onClick={createFromSource}>ツリーを作成する<ArrowRight size={17}/></button></div></div>}
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>;
}

function TreeNode({ node, rootId, selectedId, onSelect, onAdd, onInsert, onDelete }) {
  return <div className="tree-row">
    <div className={`node-card ${node.type} ${selectedId === node.id ? 'selected' : ''}`} onClick={() => onSelect(node.id)}>
      <div className="node-top"><span>{typeLabel[node.type]}</span><MoreHorizontal size={17}/></div>
      <b>{node.label || 'ラベルなし'}</b><p>{node.text || 'トーク内容を入力してください'}</p>
      <div className="node-actions">
        <button className="node-add next" onClick={(e) => { e.stopPropagation(); onInsert(node.id); }}><ArrowRight size={15}/>後ろに追加</button>
        <button className="node-add" onClick={(e) => { e.stopPropagation(); onAdd(node.id, node.type === 'objection' ? 'reply' : 'reaction'); }}><GitBranch size={15}/>分岐を追加</button>
        {node.id !== rootId && <button className="node-delete" title="ノードを削除" aria-label="ノードを削除" onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}><Trash2 size={16}/></button>}
      </div>
    </div>
    {node.children?.length > 0 && <div className="children">{node.children.map((child) => <TreeNode key={child.id} node={child} rootId={rootId} selectedId={selectedId} onSelect={onSelect} onAdd={onAdd} onInsert={onInsert} onDelete={onDelete}/>)}</div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
