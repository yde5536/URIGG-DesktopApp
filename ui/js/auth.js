// 로그인과 PIN.
// 로그인은 코워크 캘린더와 같은 Supabase 계정. 세션은 캘린더 위젯(supabase-js)과 같은 열쇠에 같은 모양으로 저장해서,
// 잠금 화면에서 한 번 로그인하면 아래 달력 위젯도 같이 로그인된다. 세션 갱신(refresh)도 여기서 한다.
// PIN은 이 PC에만, 소금(salt)을 친 SHA-256 해시로 저장한다. 서버로 보내지 않는다. 5번 틀리면 비밀번호를 다시 묻는다.
window.Auth = (() => {
  const URL = 'https://dfvcgacadkaglgtooxdy.supabase.co';
  const KEY = 'sb_publishable_QizHB60p_MUv45grEeFt8w_8UBZjvpK'; // 공개용 키 (데이터 보호는 RLS 담당)
  const SESSION = 'sb-dfvcgacadkaglgtooxdy-auth-token';
  const PIN = 'urigg-hub-pin', FAILS = 'urigg-hub-pin-fails';
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const save = (s) => {
    if (!s.expires_at && s.expires_in) s.expires_at = Math.floor(Date.now() / 1000) + s.expires_in;
    write(SESSION, s);
    return s;
  };
  async function token(body, grant) {
    const res = await fetch(`${URL}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error_description || data.msg || data.error || `로그인 실패 (${res.status})`);
    return save(data);
  }
  let refreshing = null;
  // 만료 1분 전이면 미리 갱신한다. 갱신 토큰도 안 되면 null (다시 로그인)
  async function session() {
    const s = read(SESSION);
    if (!s?.access_token) return null;
    if (s.expires_at * 1000 > Date.now() + 60_000) return s;
    if (!s.refresh_token) return null;
    refreshing ||= token({ refresh_token: s.refresh_token }, 'refresh_token').catch(() => null).finally(() => { refreshing = null; });
    return refreshing;
  }
  // Supabase 데이터(REST). 로그인 안 되어 있으면 'login' 오류
  async function rest(path, opts = {}) {
    const s = await session();
    if (!s) throw new Error('login');
    const res = await fetch(`${URL}/rest/v1/${path}`, { ...opts, headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) } });
    if (res.status === 401) throw new Error('login');
    if (!res.ok) throw new Error(`rest ${res.status}`);
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const hash = async (salt, pin) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)));

  return {
    signIn: (email, password) => token({ email, password }, 'password'),
    session, rest,
    email: () => read(SESSION)?.user?.email || '',
    hasSession: () => !!read(SESSION)?.refresh_token,
    signOut() { write(SESSION, null); write(PIN, null); write(FAILS, null); },
    hasPin: () => !!read(PIN)?.hash,
    async setPin(pin) { const salt = hex(crypto.getRandomValues(new Uint8Array(16))); write(PIN, { salt, hash: await hash(salt, pin) }); write(FAILS, 0); },
    // 맞으면 true. 5번 틀리면 PIN을 지우고 'reset'
    async checkPin(pin) {
      const p = read(PIN);
      if (!p) return 'reset';
      if ((await hash(p.salt, pin)) === p.hash) { write(FAILS, 0); return true; }
      const n = (read(FAILS) || 0) + 1;
      write(FAILS, n);
      if (n >= 5) { write(PIN, null); write(FAILS, 0); return 'reset'; }
      return 5 - n;
    },
  };
})();
