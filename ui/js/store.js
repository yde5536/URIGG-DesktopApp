// 데이터: 웹사이트 API(https://urigg.pages.dev/api)와 앱에 들어 있는 키워드·취약점 해설.
// 실패하면 null을 돌려주고, 화면은 '불러오지 못했어요'를 보여 준다.
window.Store = (() => {
  const API = 'https://urigg.pages.dev/api';
  const V = 'hub2'; // 엣지 캐시 열쇠. 응답 모양이 바뀌면 올린다
  const get = async (url, opts = {}) => {
    try {
      const res = await fetch(url, { cache: 'no-store', ...opts });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  };
  return {
    api: (name) => get(`${API}/${name}?v=${V}`),
    net: () => get(`${API}/net`),
    local: (path) => get(path),
    // 지연 시간: 사이트의 작은 그림을 받아 오는 왕복 시간 (no-cors라 응답은 못 읽지만 시간은 잰다)
    async ping(limit = 5000) {
      const ctrl = new AbortController(), kill = setTimeout(() => ctrl.abort(), limit), t0 = performance.now();
      try {
        await fetch(`https://urigg.pages.dev/images/favicon-32.png?ping=${Date.now()}`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
        return performance.now() - t0;
      } catch { return null; } finally { clearTimeout(kill); }
    },
  };
})();
