// 할 일·메모 동기화 — 여러 PC의 허브가 Supabase 표 hub_items(db/hub_items.sql)를 같이 쓴다.
// 이 PC의 localStorage가 먼저(꺼져 있어도 바로 쓰기), 바뀐 것은 곧바로 올리고, 켤 때·30분마다·창이 다시 보일 때 받아 온다.
// "지난번 맞춘 모습"(snapshot)을 기억해서 비교한다:
//   서버에 없는데 snapshot에 있던 것 → 다른 PC에서 지운 것 → 여기서도 지움
//   snapshot과 달라진 내 것 → 아직 못 올린 내 변경 → 내 것을 남기고 올림
// 표가 아직 없거나 로그인 전이면 조용히 이 PC에만 저장한다.
window.Sync = (() => {
  const SNAP = (kind) => `urigg-hub-sync-${kind}`;
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const sig = (x) => `${x.text}\u0000${x.done ? 1 : 0}`;
  let off = false; // 표가 없으면 이번 실행에서는 더 시도하지 않는다

  // 이 PC의 항목에 id가 없으면 붙인다 (예전에 만든 항목 → 처음 동기화 때 올라간다)
  const ensureIds = (list) => { let changed = false; for (const x of list) if (!x.id) { x.id = crypto.randomUUID(); changed = true; } return changed; };

  const row = (kind, x) => ({ id: x.id, kind, text: x.text, done: !!x.done, created_at: new Date(x.t || Date.now()).toISOString(), updated_at: new Date().toISOString() });
  const fail = (err) => { if (/rest 404|rest 400/.test(String(err?.message))) off = true; };

  // 바뀐 것만 올리고 지운 것은 지운다. 성공한 만큼 snapshot을 맞춘다
  async function push(kind, list) {
    if (off || !Auth.hasSession()) return;
    const snap = read(SNAP(kind));
    const now = new Map(list.map((x) => [x.id, x]));
    const up = list.filter((x) => snap[x.id] !== sig(x));
    const gone = Object.keys(snap).filter((id) => !now.has(id));
    try {
      if (up.length) {
        await Auth.rest('hub_items?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(up.map((x) => row(kind, x))) });
        for (const x of up) snap[x.id] = sig(x);
      }
      if (gone.length) {
        await Auth.rest(`hub_items?id=in.(${gone.join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
        for (const id of gone) delete snap[id];
      }
      write(SNAP(kind), snap);
    } catch (err) { fail(err); }
  }

  // 받아 와서 합친 목록을 돌려준다 (못 받으면 null → 그대로 둔다)
  async function pull(kind, list) {
    if (off || !Auth.hasSession()) return null;
    let rows;
    try { rows = await Auth.rest(`hub_items?select=id,text,done,created_at&kind=eq.${kind}`); } catch (err) { fail(err); return null; }
    if (!Array.isArray(rows)) return null;
    const snap = read(SNAP(kind)), local = new Map(list.map((x) => [x.id, x])), out = [];
    for (const r of rows) {
      const mine = local.get(r.id);
      // 내가 고쳤는데 아직 못 올린 것이면 내 것, 아니면 서버 것
      if (mine && snap[r.id] !== undefined && sig(mine) !== snap[r.id]) out.push(mine);
      else out.push({ id: r.id, text: r.text, done: !!r.done, t: Date.parse(r.created_at) });
      local.delete(r.id);
    }
    // 서버에 없는 이 PC 것: 한 번도 안 올라간 것(snapshot에 없음)만 남긴다. 올라갔던 것은 다른 PC에서 지운 것
    for (const x of local.values()) if (snap[x.id] === undefined) out.push(x);
    // snapshot은 서버에 실제로 있는 것 기준으로 다시 맞춘다
    const fresh = {};
    for (const r of rows) fresh[r.id] = sig({ text: r.text, done: r.done });
    write(SNAP(kind), fresh);
    return out;
  }

  return { ensureIds, push, pull, available: () => !off };
})();
