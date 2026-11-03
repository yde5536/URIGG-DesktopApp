// 허브 화면. 시안(URIGG-Brand/mockups/hub)과 같은 배치에 실제 데이터를 넣는다.
// 순서: 잠금(로그인·PIN) → 데이터 불러오기 → 화면. 30분마다 데이터를 새로 받는다.
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const two = (n) => String(n).padStart(2, '0');
  const DAY = 86_400_000, KST = 9 * 3_600_000;
  const kst = (t = Date.now()) => new Date(t + KST); // 한국 시간을 UTC 필드로 읽는다 (getUTC*)
  const ymd = (t = Date.now()) => kst(t).toISOString().slice(0, 10);
  const kstDay = (t) => Math.floor((t + KST) / DAY);
  const daysAgo = (iso) => kstDay(Date.now()) - kstDay(Date.parse(iso));
  const ago = (iso) => { const d = daysAgo(iso); return d <= 0 ? '오늘' : d === 1 ? '어제' : `${d}일 전`; };
  const daysTo = (date) => Math.round((Date.parse(`${date}T00:00:00+09:00`) - Date.parse(`${ymd()}T00:00:00+09:00`)) / DAY);
  const ddLabel = (n) => (n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`);
  const md = (date) => { const [, m, d] = date.split('-').map(Number); return `${m}월 ${d}일`; };
  const hm = (iso) => { const t = kst(Date.parse(iso)); return `${two(t.getUTCHours())}:${two(t.getUTCMinutes())}`; };
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Tauri (브라우저로 열면 없음: 미리보기에서도 화면은 돌아가게) ── */
  const T = window.__TAURI__;
  const invoke = (cmd, args) => (T ? T.core.invoke(cmd, args) : Promise.reject(new Error('no tauri')));
  const win = T?.window?.getCurrentWindow?.();
  const openUrl = (url) => (T ? invoke('plugin:opener|open_url', { url }) : window.open(url, '_blank', 'noopener'));
  // 바깥 링크는 앱 안이 아니라 기본 브라우저로
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="http"]');
    if (!a) return;
    e.preventDefault();
    openUrl(a.href);
  });

  /* ── 설정 (이 PC에만) ── */
  const SET_KEY = 'urigg-hub-settings';
  const settings = { size: '', close: 'tray', idle: 30, update: true, ...(JSON.parse(localStorage.getItem(SET_KEY) || '{}')) };
  const saveSettings = () => localStorage.setItem(SET_KEY, JSON.stringify(settings));

  /* ── 데이터 ── */
  const S = { news: [], kev: [], ctf: [], activity: {}, release: null, posts: [], net: null, events: [], ddays: [], vulns: [], keywords: [], loggedIn: false };

  /* ── 시계 · 날짜 · 지지직 제목 ── */
  const tick = () => {
    const t = kst(), clock = `${two(t.getUTCHours())}:${two(t.getUTCMinutes())}:${two(t.getUTCSeconds())}`;
    $('#clock').textContent = clock;
    $('#lock-clock').textContent = clock.slice(0, 5);
    $('#date').textContent = `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일 ${WEEK[t.getUTCDay()]}요일`;
  };
  tick(); setInterval(tick, 1000);
  const GLYPHS = '!<>-_\\/[]{}=+*^?#', title = $('#title');
  const scramble = (to) => {
    const len = Math.max(title.textContent.length, to.length), t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 700);
      title.textContent = [...Array(len)].map((_, i) => (i < to.length * k ? to[i] || '' : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('');
      if (k < 1) requestAnimationFrame(step); else title.textContent = to;
    };
    requestAnimationFrame(step);
  };
  let titleAt = 1; const TITLES = ['URIGG', 'Security.log HUB'];
  setInterval(() => { if (!document.hidden) { titleAt = 1 - titleAt; scramble(TITLES[titleAt]); } }, 15000);

  /* ── 지연 시간: 매분 0초·30초, 최근 30분을 이 PC에 저장 ── */
  const PING_KEY = 'urigg-hub-ping', WINDOW = 30 * 60_000;
  let pings = [];
  try { pings = JSON.parse(localStorage.getItem(PING_KEY) || '[]').filter((p) => Date.now() - p.t < WINDOW && (p.ms == null || p.ms < 5000)); } catch {}
  const okMs = () => pings.filter((p) => p.ms != null).map((p) => p.ms);
  const lastMs = () => { const p = pings[pings.length - 1]; return p ? (p.ms == null ? null : Math.round(p.ms)) : undefined; };
  const ping = async () => {
    if (document.hidden) return;
    const at = Date.now(), ms = navigator.onLine ? await Store.ping() : null;
    if (Date.now() - at > 8000) return; // 재는 사이 창이 멈췄다 풀린 것
    pings.push({ t: at, ms }); pings = pings.filter((p) => Date.now() - p.t < WINDOW);
    try { localStorage.setItem(PING_KEY, JSON.stringify(pings)); } catch {}
    drawDock();
    if (open === 'net') refreshBig();
  };
  const schedulePing = () => setTimeout(() => { ping(); schedulePing(); }, 30_000 - (Date.now() % 30_000) + 20);

  /* ── 사이드바 칸 목록 ─────────────────────────
     새 칸은 여기에 한 줄 더하면 된다: 사이드바 버튼, 'open <id>' 명령, Tab 자동 완성, 날아가는 움직임이 알아서 붙는다.
     status(): 제목 옆 상태 · body(): 가운데에 크게 그릴 내용 */
  const newKev = () => S.kev.filter((v) => daysAgo(`${v.added}T12:00:00-05:00`) <= 2);
  let vulnAt = (() => { const v = +localStorage.getItem('urigg-hub-vuln'); return Number.isInteger(v) ? v : kstDay(Date.now()); })();
  const PANELS = [
    { id: 'news', title: 'Security News', status: () => ({ text: S.news.length ? `${S.news.length}건` : '—' }),
      body: () => (S.news.length ? `<ol class="rows">${S.news.map((x) => `<li><span>${esc(x.source)}</span><a href="${esc(x.link)}">${esc(x.title)}</a><time>${ago(x.date)}</time></li>`).join('')}</ol>` : '<p class="empty">최근 3일 안에 올라온 뉴스가 없어요.</p>') },
    { id: 'kev', title: 'KEV', status: () => { const n = newKev().length; return n ? { text: `${n} new`, warn: true } : { text: S.kev.length ? `${S.kev.length}건` : '—' }; },
      body: () => `<ol class="rows">${S.kev.map((v) => `<li><span>${esc(v.vendor)}</span><a href="https://nvd.nist.gov/vuln/detail/${esc(v.cve)}">${v.ransomware ? '<b class="chip">랜섬웨어</b> ' : ''}${esc(v.cve)} · ${esc(v.product)}</a><time>${ago(`${v.added}T12:00:00-05:00`)}</time></li>`).join('')}</ol>` },
    { id: 'vuln', title: 'Vuln', status: () => ({ text: curVuln()?.alias || '—' }), body: () => vulnBig() },
    { id: 'ctf', title: 'CTF', status: () => ({ text: S.ctf.length ? `${S.ctf.length}개 · 초보 ${S.ctf.filter((e) => e.beginner).length}` : '—' }),
      body: () => `<ul class="rows ctf">${S.ctf.map((e) => { const live = Date.parse(e.start) <= Date.now(); return `<li><a href="${esc(e.url)}">${esc(e.title)}${e.beginner ? '<b class="chip">초보</b>' : ''}</a><time>${live ? `진행 중 · ${Math.ceil((Date.parse(e.finish) - Date.now()) / 3_600_000)}시간 남음` : `${kst(Date.parse(e.start)).getUTCMonth() + 1}/${kst(Date.parse(e.start)).getUTCDate()} ${hm(e.start)} · ${ctfLen(e)}`}</time></li>`; }).join('') || '<li class="empty">45일 안에 예정된 CTF가 없어요.</li>'}</ul>` },
    { id: 'net', title: 'Network', status: () => { const m = lastMs(); return { text: m === undefined ? '—' : m === null ? '끊김' : `${m} ms`, warn: m === null }; }, body: () => netBig() },
    { id: 'programs', title: 'Programs', status: () => ({ text: S.release?.tag || '—' }),
      body: () => `<div class="prog"><img src="brand/logo/emblem-320.webp" alt="" width="56" height="56"><p><b style="font-size:1.375rem">코워크 캘린더</b><span>${esc(S.release?.tag || '최신 버전')} · Windows</span></p><a class="u-btn" href="https://github.com/yde5536/URIGG-ClaudeCalender/releases/latest/download/CoworkCalendar-setup.exe">Windows 다운로드</a><span class="prog__desc">대화로 짠 일정을 위젯·아이폰에 띄우는 캘린더</span></div>` },
    // 명령어 설명서. 타이머가 돌면 상태 자리에 가장 먼저 끝나는 것의 남은 시간
    { id: 'cmds', title: 'Commands', status: () => { const n = nextEnd(); return n ? { text: `⏱ ${left(n - Date.now())}` } : { text: `${ALL_DOCS.length}개` }; }, body: () => cmdsBig() },
  ];
  /* Commands 칸: 왼쪽 챕터별 목록(이름 + 한 줄), 오른쪽 누른 명령어의 사용법·옵션·예시 */
  const ALL_DOCS = CMD_DOCS.flatMap((c) => c.groups.flatMap((g) => g.cmds.map((d) => ({ ...d, chapter: c.chapter, group: g.name }))));
  const docOf = (n) => ALL_DOCS.find((d) => d.name === n);
  let docSel = ALL_DOCS[0].name;
  function cmdsBig() {
    return `<div class="cb">
      <nav class="cb__index" aria-label="명령어 목록">${CMD_DOCS.map((c) => `<section><h3 class="cb__chapter">${esc(c.chapter)}</h3>${c.groups.map((g) => `<p class="cb__group">${esc(g.name)}</p><ul>${g.cmds.map((d) => `<li><button type="button" class="cb__cmd${d.name === docSel ? ' is-on' : ''}" data-doc="${d.name}"><code>${d.name}</code><span>${esc(d.short)}</span></button></li>`).join('')}</ul>`).join('')}</section>`).join('')}</nav>
      <article class="cb__detail">${docDetail(docOf(docSel))}</article>
    </div>`;
  }
  function docDetail(d) {
    return `<p class="cb__crumb">${esc(d.chapter)} · ${esc(d.group)}</p>
      <h3 class="cb__name"><code>${d.name}</code></h3>
      <p class="cb__short">${esc(d.short)}</p>
      <h4>사용법</h4><pre class="cb__usage">${d.usage.map(esc).join('\n')}</pre>
      ${d.opts.length ? `<h4>옵션</h4><dl class="cb__opts">${d.opts.map(([k, v]) => `<div><dt><code>${esc(k)}</code></dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      ${d.ex.length ? `<h4>예시 <span>누르면 터미널 입력칸에 넣어요</span></h4><div class="cb__ex">${d.ex.map((x) => `<button type="button" data-ex="${esc(x)}"><code>${esc(x)}</code></button>`).join('')}</div>` : ''}
      ${d.notes.length ? `<h4>참고</h4><ul class="cb__notes">${d.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
  }
  const ctfLen = (e) => { const h = Math.round((Date.parse(e.finish) - Date.parse(e.start)) / 3_600_000); return h % 24 === 0 ? `${h / 24}일` : `${h}시간`; };
  const curVuln = () => S.vulns.length ? S.vulns[((vulnAt % S.vulns.length) + S.vulns.length) % S.vulns.length] : null;
  function vulnBig() {
    const v = curVuln();
    if (!v) return '<p class="empty">취약점 해설을 불러오지 못했어요.</p>';
    // 칸 전체를 쓴다: 왼쪽 이름·정보·설명, 오른쪽 어떻게 터지나·예시·막는 법, 아래 순서와 넘기기 (← → 키도)
    const list = (a) => (Array.isArray(a) ? `<ol class="vb__steps">${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : `<p>${esc(a)}</p>`);
    const n = ((vulnAt % S.vulns.length) + S.vulns.length) % S.vulns.length;
    const fact = (k, val) => (val ? `<div><dt>${k}</dt><dd>${val}</dd></div>` : '');
    return `<div class="vb">
      <div class="vb__main">
        <p class="vb__alias">${esc(v.alias)}</p>
        <dl class="vb__facts">${fact('CVE', esc(v.cve))}${fact('대상', esc(v.target))}${fact('유형', esc(v.type))}${fact('공개', `${v.year}년`)}${fact('CVSS', v.cvss != null ? Number(v.cvss).toFixed(1) : '—')}${fact('분류', v.cwe ? esc(v.cwe) : '')}</dl>
        <p class="vb__desc">${esc(v.desc)}</p>
        <p class="vb__links"><a href="https://nvd.nist.gov/vuln/detail/${esc(v.cve)}">NVD ↗</a><a href="https://www.cve.org/CVERecord?id=${esc(v.cve)}">CVE.org ↗</a></p>
      </div>
      <div class="vb__more">
        ${v.flow ? `<section><h3>어떻게 터지나</h3>${list(v.flow)}</section>` : ''}
        ${v.ex ? `<section><h3>예시</h3><pre class="vb__ex">${esc(v.ex)}</pre></section>` : ''}
        ${v.fix ? `<section><h3>막는 법</h3>${list(v.fix)}</section>` : ''}
      </div>
      <div class="vb__foot">
        <span class="vb__count">${n + 1} / ${S.vulns.length}</span>
        <span class="vb__keys"><kbd>←</kbd> <kbd>→</kbd> 로 넘기기</span>
        <button type="button" class="u-btn-ghost" data-act="vuln-prev">‹ 이전</button>
        <button type="button" class="u-btn-ghost" data-act="vuln-next">다음 취약점 ›</button>
      </div>
    </div>`;
  }
  function netBig() {
    const n = S.net, ms = okMs(), W = 600, H = 200, max = Math.max(50, Math.ceil(Math.max(0, ...ms) / 50) * 50);
    const x = (t) => ((t - (Date.now() - WINDOW)) / WINDOW) * W, y = (v) => H - 4 - (Math.min(v, max) / max) * (H - 8);
    let d = '', pen = false, gaps = '';
    for (const p of pings) { if (p.ms == null) { pen = false; gaps += `<line class="gap" x1="${x(p.t)}" x2="${x(p.t)}" y1="0" y2="${H}"/>`; continue; } d += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.ms).toFixed(1)}`; pen = true; }
    const avg = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const vpn = n && ((n.timezone && tz !== n.timezone) || /cloud|hosting|server|vpn|proxy|amazon|aws|google|microsoft|azure|digitalocean|linode|ovh|hetzner|vultr|m247|datacamp|proton|nord|mullvad|surfshark/i.test(n.isp || ''));
    const c = navigator.connection;
    return `<div class="netbig">
      <dl>
        <div><dt>공인 IP</dt><dd class="ip">${esc(n?.ip || '—')}</dd></div>
        <div><dt>통신사</dt><dd>${esc(n?.isp || '—')}${n?.asn ? ` <span style="color:var(--u-muted)">AS${n.asn}</span>` : ''}</dd></div>
        <div><dt>위치</dt><dd>${esc([n?.city, n?.country].filter(Boolean).join(', ') || '—')}</dd></div>
        <div><dt>VPN·프록시</dt><dd>${n ? (vpn ? '사용 중 (추정)' : '안 씀 (추정)') : '—'}</dd></div>
        <div><dt>연결</dt><dd>${esc([n?.http, n?.tls, n?.colo && `Cloudflare ${n.colo}`].filter(Boolean).join(' · ') || '—')}</dd></div>
        ${c?.effectiveType ? `<div><dt>브라우저</dt><dd>${esc(`${c.effectiveType.toUpperCase()} · 지연 ${c.rtt}ms · ${c.downlink}Mbps`)}</dd></div>` : ''}
      </dl>
      <div class="chart">
        <div class="chart__head"><span>지연 시간 · 최근 30분 · 30초마다</span><b>${lastMs() == null ? (lastMs() === null ? '끊김' : '—') : `${lastMs()} ms`}</b></div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line class="grid" x1="0" x2="${W}" y1="4" y2="4"/><line class="grid" x1="0" x2="${W}" y1="${H - 4}" y2="${H - 4}"/>${gaps}<path class="line" d="${d}"/></svg>
        <p class="chart__stats">${ms.length ? `최저 ${Math.round(Math.min(...ms))} · 평균 ${avg} · 최고 ${Math.round(Math.max(...ms))} ms · 눈금 ${max} ms` : '30초마다 재요'} · 점선은 끊긴 때</p>
      </div>
    </div>`;
  }

  /* 사이드바 그리기 */
  const dock = $('#dock');
  function drawDock() {
    if (!dock.children.length) {
      dock.innerHTML = PANELS.map((p) => `<li><button type="button" class="dock__item" data-id="${p.id}"><b>${esc(p.title)}</b><span></span></button></li>`).join('');
    }
    for (const p of PANELS) { const s = p.status(), sp = dock.querySelector(`[data-id="${p.id}"] span`); sp.textContent = s.text; sp.className = s.warn ? 'is-warn' : ''; }
  }
  dock.addEventListener('click', (e) => { const b = e.target.closest('.dock__item'); if (b) summon(b.dataset.id); });

  /* 불러오기: 사이드바 버튼 자리에서 터미널 자리로 날아가며 커진다. Esc면 같은 시간의 부드러운 곡선으로 돌아간다 */
  const stage = $('#stage'), FLY = 420;
  let open = null, flying = false;
  const flyFrames = (from, to) => [
    { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: 0.6 },
    { transform: 'none', opacity: 1 },
  ];
  function stepVuln(d) {
    if (!S.vulns.length) return;
    vulnAt += d;
    try { localStorage.setItem('urigg-hub-vuln', String(((vulnAt % S.vulns.length) + S.vulns.length) % S.vulns.length)); } catch {}
    refreshBig(); drawDock();
  }
  function refreshBig() { const el = stage.querySelector('.big__body'), p = PANELS.find((x) => x.id === open); if (el && p) el.innerHTML = p.body(); }
  function summon(id) {
    const p = PANELS.find((x) => x.id === id);
    if (!p || flying || open === id) return;
    if (open) back(true);
    const btn = dock.querySelector(`[data-id="${id}"]`), el = document.createElement('article');
    el.className = 'u-tile big';
    el.innerHTML = `<div class="u-tile__head"><h2 class="u-tile__title" style="font-size:1.75rem">${esc(p.title)}</h2><button type="button" class="big__esc"><kbd>Esc</kbd> 터미널로</button></div><div class="big__body">${p.body()}</div>`;
    el.querySelector('.big__esc').onclick = () => back();
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="vuln-next"]')) stepVuln(1);
      if (e.target.closest('[data-act="vuln-prev"]')) stepVuln(-1);
      const d = e.target.closest('[data-doc]');
      if (d) {
        docSel = d.dataset.doc;
        el.querySelectorAll('.cb__cmd').forEach((b) => b.classList.toggle('is-on', b === d));
        const det = el.querySelector('.cb__detail'); det.innerHTML = docDetail(docOf(docSel)); det.scrollTop = 0;
      }
      const x = e.target.closest('[data-ex]');
      if (x) { back(); cmd.value = x.dataset.ex; }
    });
    document.activeElement?.blur?.(); // 터미널 입력칸이 ← → 키를 가져가지 않게
    stage.append(el); stage.classList.add('is-summoned'); btn.classList.add('is-away'); open = id;
    if (!reduced) {
      flying = true;
      el.animate(flyFrames(btn.getBoundingClientRect(), el.getBoundingClientRect()), { duration: FLY, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' }).onfinish = () => { flying = false; };
      el.querySelector('.big__body').animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: FLY });
    }
  }
  function back(instant) {
    if (!open) return;
    const el = stage.querySelector('.big'), btn = dock.querySelector(`[data-id="${open}"]`);
    open = null; stage.classList.remove('is-summoned');
    const done = () => { el.remove(); btn.classList.remove('is-away'); cmd.focus(); };
    if (reduced || instant) { flying = false; return done(); }
    flying = true;
    el.querySelector('.big__body').animate([{ opacity: 1 }, { opacity: 0, offset: 0.35 }, { opacity: 0 }], { duration: FLY + 60, fill: 'forwards' });
    el.animate(flyFrames(btn.getBoundingClientRect(), el.getBoundingClientRect()).reverse(), { duration: FLY + 60, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' }).onfinish = () => { flying = false; done(); };
  }

  /* ── 타임라인: '지금'은 위 1/3에 고정, 일정이 위로 흐른다 (1시간 = 44px) ── */
  const tl = $('#timeline'), PX_H = 44;
  function drawTimeline() {
    const t = kst(), now = t.getUTCHours() * 60 + t.getUTCMinutes(), nowY = tl.clientHeight * 0.33;
    const y = (min) => nowY + ((min - now) / 60) * PX_H;
    const today = ymd(), tomorrow = ymd(Date.now() + DAY);
    const todays = S.events.filter((e) => ymd(Date.parse(e.start_at)) === today);
    $('#allday').innerHTML = todays.filter((e) => e.all_day).map((e) => `<span>종일 · ${esc(e.emoji ? `${e.emoji} ` : '')}${esc(e.title)}</span>`).join('');
    let html = '';
    for (const h of [0, 3, 6, 9, 12, 15, 18, 21, 24].filter((hh) => Math.abs(hh * 60 - now) > 30)) html += `<div class="tl__item is-day" style="top:${y(h * 60)}px"><i></i><time>${two(h % 24)}:00</time><span>${h === 24 ? '내일' : ''}</span></div>`;
    for (const e of todays.filter((x) => !x.all_day)) {
      const at = hm(e.start_at), [hh, mm] = at.split(':').map(Number), min = hh * 60 + mm;
      html += `<div class="tl__item${min < now ? ' is-past' : ''}" style="top:${y(min)}px"><i></i><time>${at}</time><span>${esc(e.title)}</span></div>`;
    }
    S.events.filter((e) => ymd(Date.parse(e.start_at)) === tomorrow).slice(0, 4).forEach((e, i) => { html += `<div class="tl__item" style="top:${y(24 * 60 + 60 + i * 40)}px"><i></i><time>내일</time><span>${esc(e.title)}</span></div>`; });
    if (!S.loggedIn) html += `<div class="tl__item is-day" style="top:${nowY + 60}px"><i></i><time></time><span>로그인하면 오늘 일정이 보여요</span></div>`;
    html += `<div class="tl__now"><i></i><b>지금 ${two(t.getUTCHours())}:${two(t.getUTCMinutes())}</b></div>`;
    tl.innerHTML = html;
  }

  /* ── D-day (Supabase ddays 표, 웹사이트와 같은 데이터) ── */
  const mainDd = () => S.ddays.find((d) => d.is_main) || [...S.ddays].sort((a, b) => a.target.localeCompare(b.target)).find((d) => daysTo(d.target) >= 0) || S.ddays[0];
  function drawDdays() {
    const m = mainDd();
    $('#dday-main').textContent = m ? ddLabel(daysTo(m.target)) : '—';
    $('#dday-name').textContent = m ? `${m.title} · ${md(m.target)}` : (S.loggedIn ? 'D-day 없음' : '');
    $('#dday-big').innerHTML = m
      ? `<p class="dday__big">${ddLabel(daysTo(m.target))}</p><div><p class="dday__name">${esc(m.title)}</p><p class="dday__date">${md(m.target)}${m.is_main ? ' · 메인' : ''}</p></div>`
      : `<p class="dday__date">${S.loggedIn ? 'D-day가 없어요. 아래에서 추가하세요.' : '로그인하면 D-day가 보여요.'}</p>`;
    $('#dday-list').innerHTML = S.ddays.filter((d) => d !== m).sort((a, b) => a.target.localeCompare(b.target))
      .map((d) => `<li data-id="${esc(d.id)}" class="${daysTo(d.target) < 0 ? 'is-past' : ''}"><b>${ddLabel(daysTo(d.target))}</b><span>${esc(d.title)}</span><time>${md(d.target)}</time><button type="button" class="dday__btn" data-act="main">메인</button><button type="button" class="dday__btn" data-act="del" aria-label="삭제">×</button></li>`).join('');
  }
  async function loadDdays() { try { S.ddays = (await Auth.rest('ddays?select=id,title,target,is_main&order=target.asc')) || []; } catch { S.ddays = []; } drawDdays(); buildAlerts(); }
  $('#dday-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('li').dataset.id;
    try {
      if (b.dataset.act === 'main') { await Auth.rest('ddays?is_main=is.true', { method: 'PATCH', body: JSON.stringify({ is_main: false }) }); await Auth.rest(`ddays?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ is_main: true }) }); }
      else await Auth.rest(`ddays?id=eq.${id}`, { method: 'DELETE' });
    } catch { termLine('<span class="warn">D-day를 바꾸지 못했어요</span>'); }
    loadDdays();
  });
  async function addDday(title, target) { await Auth.rest('ddays', { method: 'POST', body: JSON.stringify({ title, target, is_main: !S.ddays.length }) }); await loadDdays(); }
  $('#dday-date-in').value = ymd(Date.now() + 7 * DAY);
  $('#dday-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#dday-name-in').value.trim(), date = $('#dday-date-in').value;
    if (!name || !date) return;
    try { await addDday(name, date); $('#dday-name-in').value = ''; } catch { termLine('<span class="warn">D-day를 추가하지 못했어요 (로그인 확인)</span>'); }
  });

  /* ── 알림 (웹사이트 알림과 같은 규칙) ── */
  const URGENT = /긴급|제로데이|0-?day|zero-day|critical|치명|CVSS\s*(9|10)|actively exploited|악용 중/i;
  let alerts = [];
  function buildAlerts() {
    const a = [];
    for (const n of S.news.filter((x) => daysAgo(x.date) <= 2 && URGENT.test(x.title)).slice(0, 3)) a.push({ warn: true, text: `${n.source} · ${n.title}`, time: ago(n.date), href: n.link });
    const nk = newKev(); if (nk.length) a.push({ warn: true, text: `KEV 새 항목 ${nk.length} · ${nk[0].vendor} ${nk[0].product}`, time: ago(`${nk[0].added}T12:00:00-05:00`), href: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog' });
    for (const e of S.ctf.filter((x) => x.beginner && !x.onsite && Date.parse(x.start) - Date.now() <= 7 * DAY).slice(0, 2)) a.push({ warn: true, text: `${e.title} · 초보 CTF가 곧 시작해요`, time: `${kst(Date.parse(e.start)).getUTCMonth() + 1}/${kst(Date.parse(e.start)).getUTCDate()}`, href: e.url });
    for (const d of S.ddays.filter((x) => [0, 1].includes(daysTo(x.target)))) a.push({ text: `${d.title} ${ddLabel(daysTo(d.target))}`, time: md(d.target) });
    if (S.release && daysAgo(S.release.publishedAt) <= 3) a.push({ text: `코워크 캘린더 ${S.release.tag} 나왔어요`, time: ago(S.release.publishedAt), href: S.release.url });
    if (S.posts[0]) { const d = daysAgo(S.posts[0].date); if (d >= 14) a.push({ text: `블로그에 ${d}일째 새 글이 없어요`, time: '새 글 쓰기', href: 'https://urigg-security.tistory.com/manage/newpost' }); }
    alerts = a;
    $('#alert-rows').innerHTML = a.length ? a.map((x) => { const inner = `<b>${x.warn ? '!' : '·'}</b><span>${esc(x.text)}</span><time>${esc(x.time || '')}</time>`; return `<li class="${x.warn ? 'is-warn' : ''}">${x.href ? `<a href="${esc(x.href)}" style="display:contents">${inner}</a>` : inner}</li>`; }).join('') : '<li class="empty">새 알림이 없어요</li>';
    const warn = a.filter((x) => x.warn).length;
    for (const el of [$('#alert-count'), $('#bar-count')]) { el.textContent = warn; el.hidden = !warn; }
  }
  $('#btn-alerts').onclick = () => $('#alerts-section').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });

  /* ── 잔디 (53주 전체, 칸 너비 안에서 칸 크기가 줄어든다) ── */
  function drawGrass() {
    const days = S.activity || {}, todayDow = kst().getUTCDay(), start = Date.now() - (todayDow + 52 * 7) * DAY;
    let total = 0, week = 0; const cells = [];
    for (let i = 0; i <= 52 * 7 + todayDow; i++) {
      const key = ymd(start + i * DAY), n = days[key] || 0;
      total += n; if (i > 52 * 7 + todayDow - 1 - todayDow) week += n;
      cells.push(`<i class="${n === 0 ? '' : n === 1 ? 'l1' : n <= 3 ? 'l2' : 'l3'}" title="${key} · ${n} commits"></i>`);
    }
    let streak = 0; for (let d = days[ymd()] ? 0 : 1; days[ymd(Date.now() - d * DAY)]; d++) streak++;
    $('#grass').innerHTML = cells.join('');
    $('#g-streak').textContent = `${streak}일`; $('#g-week').textContent = week.toLocaleString(); $('#g-total').textContent = total.toLocaleString();
  }

  /* ── 오늘의 키워드 ── */
  function drawKeyword() {
    const k = S.keywords.length ? S.keywords[kstDay(Date.now()) % S.keywords.length] : null;
    $('#kw-term').textContent = k?.[0] || '—'; $('#kw-name').textContent = k?.[1] || ''; $('#kw-desc').textContent = k?.[2] || '';
  }

  /* ── 카드 알림: 가운데 칸 아래쪽에 한 장씩 올라온다. 소리는 내지 않는다. 닫을 때까지 남는다 ── */
  const toastsEl = $('#toasts');
  const hmOf = (t) => { const k = kst(t); return `${two(k.getUTCHours())}:${two(k.getUTCMinutes())}`; };
  function toast({ kind, title, text = '', snooze }) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<p class="toast__head"><span>${esc(kind)}</span><time>${hmOf(Date.now())}</time></p><p class="toast__title">${esc(title)}</p>${text ? `<p class="toast__text">${esc(text)}</p>` : ''}<p class="toast__acts">${snooze ? '<button type="button" class="u-btn-ghost" data-t="snooze">+5분</button>' : ''}<button type="button" class="u-btn-ghost" data-t="close">닫기</button></p>`;
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; if (b.dataset.t === 'snooze') snooze(); dismiss(el); });
    toastsEl.append(el);
    while (toastsEl.children.length > 4) toastsEl.firstElementChild.remove();
    if (!reduced) el.animate([{ transform: 'translateY(28px) scale(0.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' });
  }
  function dismiss(el) {
    if (reduced) return el.remove();
    el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(14px) scale(0.98)' }], { duration: 200, fill: 'forwards' }).onfinish = () => el.remove();
  }

  /* ── 타이머 · 알람 · 뽀모도로 · 공부 시간 · 메모 · 할 일 (이 PC에만 저장) ── */
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const TM_KEY = 'urigg-hub-timers', PO_KEY = 'urigg-hub-pomo', ST_KEY = 'urigg-hub-study', MEMO_KEY = 'urigg-hub-memo', TODO_KEY = 'urigg-hub-todo';
  let timers = load(TM_KEY, []); // { kind: 'timer'|'alarm', end, label, ms, study }
  let pomo = load(PO_KEY, null); // { focus, rest, total, round, phase: 'focus'|'rest', end }
  const study = load(ST_KEY, { days: {}, running: null });
  let memos = load(MEMO_KEY, []), todos = load(TODO_KEY, []);
  const left = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600); return h ? `${h}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`; };
  const fmtMin = (m) => { m = Math.round(m); const h = Math.floor(m / 60); return h ? `${h}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`; };
  const fmtDur = (ms) => (ms < 60_000 ? `${Math.round(ms / 1000)}초` : fmtMin(ms / 60_000));
  // 알람은 몇 시간 뒤일 수 있어 빼고, 타이머와 뽀모도로만
  const nextEnd = () => { const v = Math.min(...timers.filter((t) => t.kind === 'timer').map((t) => t.end), pomo ? pomo.end : Infinity); return Number.isFinite(v) ? v : null; };
  const addStudy = (min, day = ymd()) => { study.days[day] = Math.max(0, (study.days[day] || 0) + min); save(ST_KEY, study); };
  function addTimer(ms, label = '', kind = 'timer', asStudy = false, end = Date.now() + ms) {
    timers.push({ kind, end, label, ms, study: asStudy }); timers.sort((a, b) => a.end - b.end); save(TM_KEY, timers); drawDock();
  }
  function pomoStep(now) {
    const late = now - pomo.end > 120_000; // 허브가 꺼져 있던 사이에 지난 것
    if (pomo.phase === 'focus') {
      addStudy(pomo.focus, ymd(pomo.end));
      if (late) { toast({ kind: '뽀모도로', title: '허브가 꺼져 있는 동안 멈췄어요', text: `집중 ${pomo.round}/${pomo.total}까지 공부 시간에 더했어요` }); pomo = null; }
      else if (pomo.round >= pomo.total) { toast({ kind: '뽀모도로', title: `집중 ${pomo.total}번 모두 끝`, text: `${fmtMin(pomo.focus * pomo.total)}을 공부 시간에 더했어요` }); pomo = null; }
      else { pomo.phase = 'rest'; pomo.end += pomo.rest * 60_000; toast({ kind: '뽀모도로', title: `집중 ${pomo.round}/${pomo.total} 끝`, text: `${pomo.rest}분 쉬어요` }); }
    } else if (late) { toast({ kind: '뽀모도로', title: '허브가 꺼져 있는 동안 멈췄어요', text: `집중 ${pomo.round}/${pomo.total}까지 했어요` }); pomo = null; }
    else { pomo.round++; pomo.phase = 'focus'; pomo.end += pomo.focus * 60_000; toast({ kind: '뽀모도로', title: `휴식 끝 · 집중 ${pomo.round}/${pomo.total}`, text: `${pomo.focus}분 집중해요` }); }
    save(PO_KEY, pomo);
  }
  let ticking = false;
  function tickTimers() {
    const now = Date.now(), due = timers.filter((t) => t.end <= now);
    if (due.length) {
      timers = timers.filter((t) => t.end > now); save(TM_KEY, timers);
      for (const t of due) {
        const late = now - t.end > 90_000 ? `허브가 꺼져 있어서 ${fmtDur(now - t.end)} 늦게 알려요` : '';
        if (t.study) addStudy(t.ms / 60_000, ymd(t.end));
        const again = () => addTimer(5 * 60_000, t.label);
        if (t.kind === 'alarm') toast({ kind: '알람', title: t.label || `${hmOf(t.end)} 알람`, text: late || `${hmOf(t.end)}이에요`, snooze: again });
        else toast({ kind: '타이머', title: `${t.label || fmtDur(t.ms)} 끝`, text: late || (t.label ? `${fmtDur(t.ms)} 타이머` : '') + (t.study ? ' · 공부 시간에 더했어요' : ''), snooze: again });
      }
    }
    if (pomo && pomo.end <= now) pomoStep(now);
    const running = !!nextEnd();
    if (running || ticking) drawDock(); // 사이드바 Commands 옆 남은 시간
    ticking = running;
  }
  setInterval(tickTimers, 1000);
  const kv = (rows) => `<span class="kv">${rows.map(([k, v]) => `<span class="kv__k">${k}</span><span>${v}</span>`).join('')}</span>`;
  const opts = (rest, names) => { const on = {}; let r = rest; for (;;) { const m = r.match(/^(-[a-z]+)(?:\s+|$)/i); if (!m || !names.includes(m[1])) break; on[m[1]] = true; r = r.slice(m[0].length); } return [on, r]; };
  const usage = (name) => `<span class="warn">사용법:</span> ${docOf(name).usage.map(esc).join('  ·  ')}  <span class="muted">(help ${name})</span>`;
  const warnLine = (s) => `<span class="warn">${s}</span>`;

  /* ── 터미널 ── */
  const body = $('#term-body');
  const PS1 = '<span class="ps1"><b>urigg@hub</b>:<em>~</em>$</span>';
  const inputRow = document.createElement('p');
  inputRow.className = 'term__input';
  inputRow.innerHTML = `${PS1}<input id="cmd" aria-label="명령어" autocomplete="off" spellcheck="false">`;
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'help 명령 목록 · open <칸> 크게 보기 · Tab 자동 완성 · ↑↓ 이전 명령 · Esc 터미널로';
  const termLine = (html, cls = '') => { const p = document.createElement('p'); if (cls) p.className = cls; p.innerHTML = html; inputRow.before(p); body.scrollTop = body.scrollHeight; return p; };
  const IDS = PANELS.map((p) => p.id);
  const nextEvent = () => { const now = Date.now(); return S.events.filter((e) => !e.all_day && Date.parse(e.start_at) > now)[0]; };
  const CMDS = {
    help: (a) => {
      if (a[0]) {
        const d = docOf(a[0]);
        if (!d) return warnLine(`help: 모르는 명령어 '${esc(a[0])}'`);
        return `<b>${d.name}</b>  <span class="muted">${esc(d.chapter)} · ${esc(d.group)}</span>\n${esc(d.short)}\n\n<span class="ok">사용법</span>\n${d.usage.map((u) => `  ${esc(u)}`).join('\n')}${d.opts.length ? `\n\n<span class="ok">옵션</span>${kv(d.opts.map(([k, v]) => [esc(k), esc(v)]))}` : ''}${d.ex.length ? `\n<span class="ok">예시</span>\n${d.ex.map((x) => `  ${esc(x)}`).join('\n')}` : ''}${d.notes.length ? `\n\n${d.notes.map((n) => `<span class="muted">· ${esc(n)}</span>`).join('\n')}` : ''}`;
      }
      return CMD_DOCS.map((c) => `<span class="ok">${esc(c.chapter)}</span>\n${kv(c.groups.map((g) => [esc(g.name), g.cmds.map((d) => d.name).join('  ')]))}`).join('') + '<span class="muted">help &lt;명령어&gt; 자세히 · open cmds 설명서 칸</span>';
    },
    fetch: () => {
      const nx = nextEvent(), m = mainDd(), nk = newKev();
      let left = ''; if (nx) { const d = Math.round((Date.parse(nx.start_at) - Date.now()) / 60000); left = d >= 60 ? `${Math.floor(d / 60)}시간 ${d % 60}분 뒤` : `${d}분 뒤`; }
      const row = (k, v) => `<span class="ff__k">${k}</span><span>${v}</span>`, t = kst();
      return `<div class="ff"><img src="brand/logo/emblem-320.webp" alt="" width="112" height="112"><div class="ff__info"><p class="ff__title"><b>urigg</b>@<b>hub</b></p><p class="ff__rule"></p>${[
        row('날짜', `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일 ${WEEK[t.getUTCDay()]}요일`),
        row('다음 일정', nx ? `<b>${esc(nx.title)}</b> · ${hm(nx.start_at)} (${left})` : (S.loggedIn ? '오늘 남은 일정 없음' : '로그인 필요')),
        row('D-day', m ? `${esc(m.title)} <b>${ddLabel(daysTo(m.target))}</b>` : '—'),
        row('KEV', nk.length ? `<span class="warn">새 항목 ${nk.length}</span> · ${esc(nk[0].vendor)} ${esc(nk[0].product)}` : `새 항목 없음 · 최근 ${S.kev.length}건`),
        row('CTF', `${S.ctf.length}개 예정 · <span class="ok">초보 ${S.ctf.filter((e) => e.beginner).length}</span>`),
        row('키워드', esc(S.keywords.length ? S.keywords[kstDay(Date.now()) % S.keywords.length][0] : '—')),
        row('네트워크', `${esc(S.net?.ip || '—')}${lastMs() ? ` · ${lastMs()} ms` : ''}`),
        ...(todos.some((x) => !x.done) ? [row('할 일', `${todos.filter((x) => !x.done).length}개 남음 · ${esc(todos.find((x) => !x.done).text)}`)] : []),
        ...(nextEnd() ? [row('타이머', `${left(nextEnd() - Date.now())} 남음`)] : []),
        ...(study.days[ymd()] ? [row('공부', fmtMin(study.days[ymd()]))] : []),
      ].join('')}</div></div>`;
    },
    today: () => { const today = ymd(), ev = S.events.filter((e) => ymd(Date.parse(e.start_at)) === today); return ev.length ? ev.map((e) => `${e.all_day ? ' 종일' : hm(e.start_at)}  ${esc(e.title)}`).join('\n') : (S.loggedIn ? '오늘 일정이 없어요' : '<span class="muted">로그인이 필요해요</span>'); },
    dday: (a) => {
      if (a[0] === 'add') {
        const date = a.at(-1), name = a.slice(1, -1).join(' ');
        if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '<span class="warn">사용법: dday add 이름 YYYY-MM-DD</span>';
        addDday(name, date).then(() => termLine(`<span class="ok">✓</span> D-day 추가: ${esc(name)} · ${ddLabel(daysTo(date))}`)).catch(() => termLine('<span class="warn">추가하지 못했어요 (로그인 확인)</span>'));
        return '<span class="muted">추가하는 중…</span>';
      }
      return S.ddays.length ? [...S.ddays].sort((x, y) => x.target.localeCompare(y.target)).map((d) => `${ddLabel(daysTo(d.target)).padEnd(6)}  ${esc(d.title)}${d.is_main ? ' · 메인' : ''}  <span class="muted">${d.target}</span>`).join('\n') : 'D-day가 없어요';
    },
    kw: (a, rest) => {
      const show = (k) => `<b>${esc(k[0])}</b>  <span class="muted">${esc(k[1])}</span>\n${esc(k[2])}`;
      if (rest) { const q = rest.toLowerCase(), hit = S.keywords.filter((k) => k.join(' ').toLowerCase().includes(q)); return hit.length ? hit.slice(0, 6).map(show).join('\n\n') : `키워드 사전에 '${esc(rest)}'가 없어요`; }
      const k = S.keywords[kstDay(Date.now()) % (S.keywords.length || 1)]; return k ? show(k) : '—';
    },
    ip: () => `${esc(S.net?.ip || '—')}  <span class="muted">${esc(S.net?.isp || '')}</span>`,
    ping: () => { const m = lastMs(); return m == null ? '아직 잰 값이 없어요' : `cloudflare  ${m} ms`; },
    open: (a) => {
      const k = a[0];
      if (['cal', 'calendar', 'today', 'alerts', 'kw', 'keyword', 'grass', 'dday'].includes(k)) return '그건 가운데로 불러오지 않아요. 아래로 스크롤하면 있어요.';
      if (!IDS.includes(k)) return `<span class="warn">open: 모르는 칸 '${esc(k || '')}'</span>  <span class="muted">${IDS.join(' · ')}</span>`;
      setTimeout(() => summon(k), 40);
      return `<span class="muted">${k} → 가운데 · Esc로 돌아와요</span>`;
    },
    lock: () => { setTimeout(lock, 150); return '<span class="muted">잠그는 중…</span>'; },
    clear: () => { body.querySelectorAll('p:not(.term__input):not(.hint), .ff').forEach((p) => p.remove()); return null; },

    /* 일상: 시간 · 공부 */
    timer: (a) => {
      const own = timers.filter((t) => t.kind === 'timer');
      if (!a.length) return own.length ? own.map((t, i) => `${i + 1}  <b>${left(t.end - Date.now())}</b> 남음  ${esc(t.label || '')}  <span class="muted">${fmtDur(t.ms)}${t.study ? ' · 공부' : ''}</span>`).join('\n') : '<span class="muted">돌아가는 타이머가 없어요</span>';
      if (a[0] === 'stop') { timers = timers.filter((t) => t.kind !== 'timer'); save(TM_KEY, timers); drawDock(); return `<span class="ok">✓</span> 타이머 ${own.length}개를 껐어요`; }
      if (a[0] === 'rm') { const t = own[+a[1] - 1]; if (!t) return warnLine('그 번호의 타이머가 없어요 (timer로 확인)'); timers = timers.filter((x) => x !== t); save(TM_KEY, timers); drawDock(); return `<span class="ok">✓</span> 껐어요: ${esc(t.label || fmtDur(t.ms))}`; }
      const ms = Tools.duration(a[0]);
      if (!ms || ms > 24 * 3_600_000) return usage('timer');
      const asStudy = a.includes('-s'), label = a.slice(1).filter((x) => x !== '-s').join(' ');
      addTimer(ms, label, 'timer', asStudy);
      return `<span class="ok">✓</span> ${fmtDur(ms)} 타이머${label ? ` · ${esc(label)}` : ''}  <span class="muted">${hmOf(Date.now() + ms)}에 카드로 알려요${asStudy ? ' · 공부 시간에 더해요' : ''}</span>`;
    },
    alarm: (a) => {
      const own = timers.filter((t) => t.kind === 'alarm');
      if (!a.length) return own.length ? own.map((t, i) => `${i + 1}  <b>${hmOf(t.end)}</b>${ymd(t.end) !== ymd() ? ' <span class="muted">내일</span>' : ''}  ${esc(t.label || '')}`).join('\n') : '<span class="muted">맞춰 둔 알람이 없어요</span>';
      if (a[0] === 'stop') { timers = timers.filter((t) => t.kind !== 'alarm'); save(TM_KEY, timers); drawDock(); return `<span class="ok">✓</span> 알람 ${own.length}개를 껐어요`; }
      if (a[0] === 'rm') { const t = own[+a[1] - 1]; if (!t) return warnLine('그 번호의 알람이 없어요 (alarm으로 확인)'); timers = timers.filter((x) => x !== t); save(TM_KEY, timers); drawDock(); return `<span class="ok">✓</span> 껐어요: ${hmOf(t.end)} ${esc(t.label || '')}`; }
      const m = a[0].match(/^(\d{1,2}):(\d{2})$/);
      if (!m || +m[1] > 23 || +m[2] > 59) return usage('alarm');
      let end = Date.parse(`${ymd()}T${two(+m[1])}:${m[2]}:00+09:00`);
      if (end <= Date.now()) end += DAY;
      const label = a.slice(1).join(' ');
      addTimer(end - Date.now(), label, 'alarm', false, end);
      return `<span class="ok">✓</span> ${ymd(end) !== ymd() ? '내일 ' : ''}${hmOf(end)} 알람${label ? ` · ${esc(label)}` : ''}  <span class="muted">${fmtDur(end - Date.now())} 뒤</span>`;
    },
    pomo: (a) => {
      if (a[0] === 'stop') { if (!pomo) return '<span class="muted">돌아가는 뽀모도로가 없어요</span>'; const r = pomo.round - (pomo.phase === 'focus' ? 1 : 0); pomo = null; save(PO_KEY, null); drawDock(); return `<span class="ok">✓</span> 뽀모도로를 멈췄어요${r ? `  <span class="muted">마친 집중 ${r}번은 공부 시간에 남아요</span>` : ''}`; }
      if (pomo && !a.length) return `${pomo.phase === 'focus' ? '<b>집중</b>' : '<b>휴식</b>'} ${pomo.round}/${pomo.total}  ${left(pomo.end - Date.now())} 남음  <span class="muted">${pomo.focus}분 집중 · ${pomo.rest}분 휴식 · pomo stop으로 멈추기</span>`;
      if (pomo) return warnLine('이미 돌아가는 중이에요. pomo stop으로 멈춘 다음 다시 시작하세요');
      const [f = 25, r = 5, n = 4] = a.map(Number);
      if (![f, r, n].every((x) => Number.isInteger(x) && x > 0) || f > 180 || r > 60 || n > 12) return usage('pomo');
      pomo = { focus: f, rest: r, total: n, round: 1, phase: 'focus', end: Date.now() + f * 60_000 };
      save(PO_KEY, pomo); drawDock();
      return `<span class="ok">✓</span> 뽀모도로 시작: ${f}분 집중 · ${r}분 휴식 × ${n}  <span class="muted">바뀔 때마다 카드로 알려요</span>`;
    },
    study: (a) => {
      if (a[0] === 'start') { if (study.running) return warnLine(`이미 재는 중이에요 (${esc(study.running.label || '공부')}). study stop으로 멈추세요`); study.running = { t0: Date.now(), label: a.slice(1).join(' ') }; save(ST_KEY, study); return `<span class="ok">✓</span> 재기 시작${study.running.label ? `: ${esc(study.running.label)}` : ''}  <span class="muted">study stop으로 멈춰요</span>`; }
      if (a[0] === 'stop') { if (!study.running) return '<span class="muted">재고 있는 게 없어요</span>'; const min = (Date.now() - study.running.t0) / 60_000; study.running = null; addStudy(min); return `<span class="ok">✓</span> ${fmtMin(min)} 더했어요 · 오늘 ${fmtMin(study.days[ymd()] || 0)}`; }
      if (a[0] === 'add') { const n = Number(a[1]); if (!Number.isFinite(n) || !n) return usage('study'); addStudy(n); return `<span class="ok">✓</span> ${n > 0 ? '더했어요' : '뺐어요'} · 오늘 ${fmtMin(study.days[ymd()] || 0)}`; }
      if (a.length) return usage('study');
      const t = kst(), mon = (t.getUTCDay() + 6) % 7, run = study.running ? (Date.now() - study.running.t0) / 60_000 : 0;
      const day = (i) => ymd(Date.now() - i * DAY), mins = (i) => (study.days[day(i)] || 0) + (i === 0 ? run : 0);
      const week = [...Array(mon + 1)].reduce((s, _, i) => s + mins(i), 0);
      const last7 = [6, 5, 4, 3, 2, 1, 0].map((i) => [WEEK[kst(Date.now() - i * DAY).getUTCDay()], mins(i)]), top = Math.max(60, ...last7.map((x) => x[1]));
      return kv([
        ['오늘', `<b>${fmtMin(mins(0))}</b>${study.running ? ` <span class="muted">(재는 중${study.running.label ? `: ${esc(study.running.label)}` : ''} ${left(run * 60_000)})</span>` : ''}`],
        ['이번 주', fmtMin(week)],
        ['최근 7일', last7.map(([w, m]) => `${w} <span class="bar">${'█'.repeat(Math.round((m / top) * 14)) || '·'}</span> <span class="muted">${fmtMin(m)}</span>`).join('\n')],
      ]);
    },

    /* 일상: 메모 · 할 일 · 계산 */
    todo: (a, rest) => {
      const list = () => (todos.length ? todos.map((t, i) => `${i + 1}  ${t.done ? '<span class="ok">✓</span>' : '□'}  ${t.done ? `<span class="muted">${esc(t.text)}</span>` : esc(t.text)}`).join('\n') : '<span class="muted">할 일이 없어요. todo &lt;내용&gt;으로 추가해요</span>');
      if (!a.length) return list();
      if (a[0] === 'rm' && a.length === 2) { const i = +a[1] - 1; if (!todos[i]) return warnLine('그 번호가 없어요'); todos.splice(i, 1); save(TODO_KEY, todos); return list(); }
      if (a[0] === 'clear' && a.length === 1) { todos = todos.filter((t) => !t.done); save(TODO_KEY, todos); return list(); }
      todos.push({ text: rest, done: false, t: Date.now() }); save(TODO_KEY, todos);
      return `<span class="ok">✓</span> ${todos.length}번에 추가: ${esc(rest)}`;
    },
    done: (a) => { const i = +a[0] - 1; if (!todos[i]) return usage('done'); todos[i].done = !todos[i].done; save(TODO_KEY, todos); return todos[i].done ? `<span class="ok">✓</span> 끝: ${esc(todos[i].text)}  <span class="muted">남은 할 일 ${todos.filter((x) => !x.done).length}개</span>` : `되돌렸어요: ${esc(todos[i].text)}`; },
    memo: (a, rest) => {
      const list = () => (memos.length ? memos.map((m, i) => `${i + 1}  ${esc(m.text)}  <span class="muted">${md(ymd(m.t))} ${hmOf(m.t)}</span>`).join('\n') : '<span class="muted">메모가 없어요. memo &lt;내용&gt;으로 적어요</span>');
      if (!a.length) return list();
      if (a[0] === 'rm' && a.length === 2) { const i = +a[1] - 1; if (!memos[i]) return warnLine('그 번호가 없어요'); memos.splice(i, 1); save(MEMO_KEY, memos); return list(); }
      if (a[0] === 'clear' && a.length === 1) { const n = memos.length; memos = []; save(MEMO_KEY, memos); return `<span class="ok">✓</span> 메모 ${n}개를 지웠어요`; }
      memos.unshift({ text: rest, t: Date.now() }); save(MEMO_KEY, memos);
      return `<span class="ok">✓</span> 적었어요  <span class="muted">memo로 목록</span>`;
    },
    calc: (a, rest) => { if (!rest) return usage('calc'); try { return `${esc(rest)} = <b>${Tools.fmt(Tools.calc(rest))}</b>`; } catch (err) { return warnLine(`calc: ${esc(err.message)}`); } },

    /* 보안 공부: 인코딩 */
    b64: (a, rest) => {
      const [o, s] = opts(rest, ['-d', '-u']);
      if (!s) return usage('b64');
      if (!o['-d']) return esc(Tools.b64enc(s, o['-u']));
      const u = Tools.b64bytes(s); if (!u) return warnLine('Base64가 아니에요');
      const t = Tools.text(u); return t != null ? esc(t) : `<span class="muted">글자가 아니라 16진수로 보여요</span>\n${Tools.hexOf(u)}`;
    },
    url: (a, rest) => {
      const [o, s] = opts(rest, ['-d', '-a']);
      if (!s) return usage('url');
      if (o['-d']) { try { return esc(decodeURIComponent(s)); } catch { return warnLine('URL 인코딩이 깨져 있어요'); } }
      return esc(o['-a'] ? Tools.urlAll(s) : encodeURIComponent(s));
    },
    hex: (a, rest) => {
      const [o, s] = opts(rest, ['-d', '-n']);
      if (!s) return usage('hex');
      if (o['-n']) { const n = Tools.numBases(s); return n ? kv([['10진', n.dec], ['16진', n.hex], ['2진', n.bin], ['8진', n.oct]]) : warnLine('정수를 넣어 주세요 (255, 0xff, 0b1010)'); }
      if (o['-d']) { const u = Tools.hexbytes(s); if (!u) return warnLine('16진수가 아니에요 (짝수 자리여야 해요)'); const t = Tools.text(u); return t != null ? esc(t) : warnLine('글자로 풀리지 않아요'); }
      return Tools.hexOf(Tools.bytes(s)).match(/../g).join(' ');
    },
    rot: (a, rest) => {
      const m = rest.match(/^-n\s+(-?\d+)\s+([\s\S]+)$/);
      if (m) return esc(Tools.rot(m[2], +m[1]));
      if (!rest) return usage('rot');
      return `<b>ROT13</b>  ${esc(Tools.rot(rest, 13))}\n${kv([...Array(25)].map((_, i) => [`+${i + 1}`, esc(Tools.rot(rest, i + 1))]))}`;
    },
    decode: (a, rest) => {
      if (!rest) return usage('decode');
      const c = Tools.decode(rest);
      if (!c.some((x) => !x.weak)) return `<span class="muted">알아본 인코딩이 없어요</span>\n<b>ROT13이라면</b>  ${esc(Tools.rot(rest, 13))}`;
      return kv(c.map((x) => [x.weak ? `<span class="muted">${x.type}</span>` : x.type, `${x.weak ? `<span class="muted">${esc(x.value)}</span>` : `<b>${esc(x.value)}</b>`}${x.note ? `  <span class="muted">${x.note}</span>` : ''}${x.then ? `\n<span class="muted">→ 한 번 더 (${x.then.type})</span>  <b>${esc(x.then.value)}</b>` : ''}`]));
    },

    /* 보안 공부: 해시 · 토큰 */
    hash: (a, rest) => {
      const [o, s] = opts(rest, ['-id']);
      if (!s) return usage('hash');
      if (o['-id']) { const k = Tools.hashId(s); return k.length ? `짐작: <b>${k.join(' · ')}</b>  <span class="muted">(${s.trim().length}자, 길이와 앞머리로만 본 것)</span>` : '<span class="muted">알아본 해시 모양이 아니에요</span>'; }
      return Tools.hashes(s).then((h) => kv(Object.entries(h).map(([k, v]) => [k, v])));
    },
    jwt: (a, rest) => {
      if (!rest) return usage('jwt');
      const j = Tools.jwt(rest); if (!j) return warnLine('JWT가 아니에요 (점으로 나뉜 세 덩어리, 앞 두 개는 Base64 JSON)');
      const when = (k) => { const v = j.payload[k]; if (typeof v !== 'number') return null; const t = v * 1000; return `${ymd(t)} ${hmOf(t)}`; };
      const exp = j.payload.exp;
      const rows = [['header', `<span class="code">${esc(JSON.stringify(j.header, null, 2))}</span>`], ['payload', `<span class="code">${esc(JSON.stringify(j.payload, null, 2))}</span>`]];
      if (when('iat')) rows.push(['발급 iat', when('iat')]);
      if (when('nbf')) rows.push(['시작 nbf', when('nbf')]);
      if (when('exp')) rows.push(['만료 exp', `${when('exp')}  ${exp * 1000 < Date.now() ? warnLine('만료됨') : `<span class="ok">${fmtDur(exp * 1000 - Date.now())} 남음</span>`}`]);
      rows.push(['서명', j.sigLen ? `${j.sigLen}자 <span class="muted">(확인 안 함)</span>` : warnLine('없음')]);
      const alg = String(j.header.alg || '').toLowerCase();
      return kv(rows) + (alg === 'none' ? warnLine('⚠ alg: none · 서명 없는 토큰이에요. 이걸 받아 주는 서버는 누구나 토큰을 위조할 수 있어요') : '');
    },

    /* 보안 공부: 네트워크 · 리눅스 */
    cidr: (a) => {
      if (!a.length) return usage('cidr');
      const r = Tools.cidr(a[0], a[1]);
      if (!r) return usage('cidr');
      if (r.error) return warnLine(r.error);
      return kv([['입력', `${esc(r.ip)}/${r.prefix}  <span class="muted">${r.kind}</span>`], ['네트워크', r.net], ['브로드캐스트', r.bc], ['쓸 수 있는 범위', `${r.first} ~ ${r.last}`], ['호스트 수', r.hosts.toLocaleString()], ['서브넷 마스크', `${r.mask}  <span class="muted">${r.bin}</span>`], ['와일드카드', r.wild]]);
    },
    chmod: (a) => {
      const r = a[0] && Tools.chmod(a[0]);
      if (!r) return usage('chmod');
      const yes = (b) => (b ? '<span class="ok">✓</span>' : '<span class="muted">·</span>');
      return `<b>${r.num}</b>  =  <b>${r.sym}</b>${r.mean ? `  <span class="muted">${r.mean}</span>` : ''}\n${kv([['', '읽기 r  쓰기 w  실행 x'], ...r.who.map((w) => [w.who, `  ${yes(w.r)}       ${yes(w.w)}       ${yes(w.x)}${w.special ? `   <span class="warn">${w.special}</span>` : ''}`])])}`;
    },

    /* 찾기 */
    find: (a, rest) => {
      if (!rest) return usage('find');
      const q = rest.toLowerCase(), has = (...xs) => xs.filter(Boolean).join(' ').toLowerCase().includes(q);
      const link = (href, s) => `<a href="${esc(href)}">${esc(s)}</a>`;
      const groups = [
        ['뉴스', S.news.filter((x) => has(x.title, x.source)).map((x) => `${link(x.link, x.title)} <span class="muted">${esc(x.source)} · ${ago(x.date)}</span>`)],
        ['KEV', S.kev.filter((v) => has(v.cve, v.vendor, v.product)).map((v) => `${link(`https://nvd.nist.gov/vuln/detail/${v.cve}`, `${v.cve} · ${v.vendor} ${v.product}`)}`)],
        ['CTF', S.ctf.filter((e) => has(e.title)).map((e) => `${link(e.url, e.title)}${e.beginner ? ' <span class="ok">초보</span>' : ''}`)],
        ['Vuln', S.vulns.map((v, i) => [v, i]).filter(([v]) => has(v.alias, v.cve, v.target, v.type, v.desc)).map(([v, i]) => `${esc(v.alias)} <span class="muted">${esc(v.cve)} · vuln ${i + 1}</span>`)],
        ['키워드', S.keywords.filter((k) => has(...k)).map((k) => `${esc(k[0])} <span class="muted">${esc(k[1])}</span>`)],
        ['메모', memos.filter((m) => has(m.text)).map((m) => `${esc(m.text)} <span class="muted">${md(ymd(m.t))}</span>`)],
        ['할 일', todos.filter((t) => has(t.text)).map((t) => `${t.done ? '✓ ' : ''}${esc(t.text)}`)],
      ].filter(([, r]) => r.length);
      if (!groups.length) return `<span class="muted">'${esc(rest)}'로 찾은 게 없어요</span>`;
      return groups.map(([k, r]) => `<span class="ok">${k}</span> <span class="muted">${r.length}</span>\n${r.slice(0, 5).map((x) => `  ${x}`).join('\n')}${r.length > 5 ? `\n  <span class="muted">… ${r.length - 5}개 더</span>` : ''}`).join('\n');
    },
    cve: (a) => {
      const m = (a[0] || '').match(/^(?:cve-)?(\d{4}-\d{4,})$/i);
      if (!m) return usage('cve');
      const id = `CVE-${m[1]}`, k = S.kev.find((v) => v.cve === id), vi = S.vulns.findIndex((v) => v.cve === id);
      return kv([
        ['KEV', k ? `${warnLine('있음')} · ${esc(k.vendor)} ${esc(k.product)} · ${k.added} 추가${k.ransomware ? ' · 랜섬웨어에 쓰임' : ''}` : '<span class="muted">최근 20건에는 없어요</span>'],
        ['Vuln 해설', vi >= 0 ? `<b>${esc(S.vulns[vi].alias)}</b>  <span class="muted">vuln ${vi + 1} 로 열기</span>` : '<span class="muted">없어요</span>'],
        ['링크', `<a href="https://nvd.nist.gov/vuln/detail/${id}">NVD ↗</a>  <a href="https://www.cve.org/CVERecord?id=${id}">CVE.org ↗</a>`],
      ]);
    },
    vuln: (a, rest) => {
      if (!S.vulns.length) return warnLine('취약점 해설을 아직 못 불러왔어요');
      if (a[0] === 'ls') return S.vulns.map((v, i) => `${String(i + 1).padStart(2)}  ${esc(v.alias)}  <span class="muted">${esc(v.cve)}</span>`).join('\n');
      let i = -1;
      if (!rest) i = ((vulnAt % S.vulns.length) + S.vulns.length) % S.vulns.length;
      else if (/^\d+$/.test(rest)) i = +rest - 1;
      else { const q = rest.toLowerCase().replace(/^cve-/, ''); i = S.vulns.findIndex((v) => v.cve.toLowerCase().replace(/^cve-/, '') === q); if (i < 0) i = S.vulns.findIndex((v) => `${v.alias} ${v.target}`.toLowerCase().includes(q)); }
      if (!S.vulns[i]) return warnLine(`'${esc(rest)}'에 맞는 해설이 없어요  <span class="muted">vuln ls로 목록</span>`);
      vulnAt = i; try { localStorage.setItem('urigg-hub-vuln', String(i)); } catch {}
      drawDock();
      if (open === 'vuln') refreshBig(); else setTimeout(() => summon('vuln'), 40);
      return `<span class="muted">${esc(S.vulns[i].alias)} → 가운데 · ← → 로 넘기기 · Esc로 돌아와요</span>`;
    },
    ctf: (a) => {
      const f = a[0], now = Date.now();
      const list = S.ctf.filter((e) => (f === 'beginner' ? e.beginner : f === 'week' ? Date.parse(e.start) - now <= 7 * DAY && Date.parse(e.start) > now : f === 'live' ? Date.parse(e.start) <= now : true));
      if (f && !['beginner', 'week', 'live'].includes(f)) return usage('ctf');
      if (!list.length) return '<span class="muted">맞는 CTF가 없어요</span>';
      return list.slice(0, 10).map((e) => { const s = kst(Date.parse(e.start)), live = Date.parse(e.start) <= now; return `${live ? '<span class="ok">진행 중</span>' : `${s.getUTCMonth() + 1}/${s.getUTCDate()} ${hm(e.start)}`}  <a href="${esc(e.url)}">${esc(e.title)}</a>${e.beginner ? ' <span class="ok">초보</span>' : ''}  <span class="muted">${ctfLen(e)}</span>`; }).join('\n');
    },
    g: (a, rest) => { if (!rest) return usage('g'); openUrl(`https://www.google.com/search?q=${encodeURIComponent(rest)}`); return `<span class="muted">브라우저에서 검색: ${esc(rest)}</span>`; },
  };
  const history = []; let hAt = 0;
  const exec = (raw) => {
    // a: 띄어쓰기로 나눈 인자 · rest: 명령어 뒤 글자 그대로 (b64, memo처럼 문장을 받는 명령어용)
    const line = raw.trim(), c = line.split(/\s+/)[0], rest = line.slice(c.length).trim(), a = rest ? rest.split(/\s+/) : [];
    termLine(`${PS1} ${esc(raw)}`);
    if (!c) return;
    let out;
    try { out = CMDS[c] ? CMDS[c](a, rest) : `<span class="warn">bash: ${esc(c)}: command not found</span>  <span class="muted">help로 목록</span>`; }
    catch (err) { out = warnLine(`${esc(c)}: ${esc(err.message)}`); }
    if (out instanceof Promise) { const p = termLine('<span class="muted">계산하는 중…</span>'); out.then((h) => { p.innerHTML = h; }).catch((err) => { p.innerHTML = warnLine(esc(err.message)); }); }
    else if (out) termLine(out);
  };
  const t0 = kst();
  body.innerHTML = `<p class="muted">Last login: ${WEEK[t0.getUTCDay()]} ${t0.getUTCMonth() + 1}/${t0.getUTCDate()} ${two(t0.getUTCHours())}:${two(t0.getUTCMinutes())} on hub</p>`;
  body.append(inputRow, hint);
  const cmd = $('#cmd');
  cmd.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const v = cmd.value; if (v.trim()) { history.push(v); hAt = history.length; } cmd.value = ''; exec(v); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hAt > 0) cmd.value = history[--hAt]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hAt = Math.min(history.length, hAt + 1); cmd.value = history[hAt] || ''; }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const parts = cmd.value.split(' '), last = parts.at(-1), pool = parts.length === 1 ? Object.keys(CMDS) : parts[0] === 'open' ? IDS : parts[0] === 'help' ? ALL_DOCS.map((d) => d.name) : [];
      const hit = pool.filter((x) => x.startsWith(last));
      if (hit.length === 1) { parts[parts.length - 1] = hit[0]; cmd.value = parts.join(' ') + ' '; } else if (hit.length > 1) termLine(hit.join('  '), 'muted');
    }
  });
  body.addEventListener('click', () => { if (!getSelection().toString()) cmd.focus(); });

  /* ── 데이터 불러오기 ── */
  async function loadPublic() {
    const [news, kev, ctf, gh, blog, net] = await Promise.all([Store.api('news'), Store.api('kev'), Store.api('ctf'), Store.api('github'), Store.api('blog'), Store.net()]);
    S.news = (news?.items || []).filter((n) => daysAgo(n.date) <= 3);
    S.kev = kev?.items || [];
    S.ctf = (ctf?.events || []).filter((e) => Date.parse(e.finish) > Date.now());
    S.activity = gh?.activity || S.activity; S.release = gh?.release || S.release;
    S.posts = blog?.posts || S.posts;
    S.net = net || S.net;
  }
  async function loadPrivate() {
    const s = await Auth.session();
    S.loggedIn = !!s;
    if (!s) { S.events = []; S.ddays = []; return; }
    const from = `${ymd()}T00:00:00+09:00`, to = `${ymd(Date.now() + 2 * DAY)}T00:00:00+09:00`;
    try { S.events = (await Auth.rest(`events?select=title,emoji,start_at,all_day&start_at=gte.${encodeURIComponent(from)}&start_at=lt.${encodeURIComponent(to)}&order=start_at.asc&limit=50`)) || []; } catch { S.events = []; }
    try { S.ddays = (await Auth.rest('ddays?select=id,title,target,is_main&order=target.asc')) || []; } catch { S.ddays = []; }
  }
  function drawAll() { drawDock(); drawTimeline(); drawDdays(); buildAlerts(); drawGrass(); drawKeyword(); if (open) refreshBig(); }
  async function refreshAll() { await Promise.all([loadPublic(), loadPrivate()]); drawAll(); }
  Promise.all([Store.local('data/keywords.json'), Store.local('data/vulns.json')]).then(([k, v]) => { S.keywords = k || []; S.vulns = v || []; drawKeyword(); drawDock(); });

  /* ── 잠금 화면 ── */
  const lockEl = $('#lock'), form = $('#lock-form'), msg = $('#lock-msg'), pin = $('#pin');
  let mode = 'pin', newPin = null, started = false;
  const say = (text, err) => { msg.textContent = text; msg.classList.toggle('is-error', !!err); };
  function setMode(m, text = '', err = false) {
    mode = m; newPin = m === 'setpin' ? null : newPin;
    $('#lock-login').hidden = m !== 'login';
    $('#lock-pinbox').hidden = !['pin', 'setpin', 'confirm'].includes(m);
    $('#lock-alt').hidden = m !== 'pin';
    pin.value = '';
    pin.placeholder = m === 'setpin' ? '새 PIN 6자리' : m === 'confirm' ? 'PIN 한 번 더' : 'PIN';
    say(text || (m === 'login' ? 'Supabase 계정으로 로그인하세요' : m === 'setpin' ? '이 PC에서 쓸 PIN을 정하세요' : ''), err);
    setTimeout(() => (m === 'login' ? $('#lock-email') : pin).focus(), 30);
  }
  function lock() {
    back(true); $('#settings').hidden = true; scrollTo(0, 0);
    lockEl.hidden = false; document.body.classList.add('is-locked');
    setMode(Auth.hasSession() && Auth.hasPin() ? 'pin' : 'login');
  }
  function unlock() {
    lockEl.hidden = true; document.body.classList.remove('is-locked');
    $('#set-email').textContent = Auth.email() || '—';
    if (!started) { started = true; start(); } else refreshAll();
    cmd.focus();
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (mode !== 'login') return;
    const email = $('#lock-email').value.trim(), pass = $('#lock-pass').value;
    if (!email || !pass) return say('이메일과 비밀번호를 넣어 주세요', true);
    say('로그인하는 중…');
    try { await Auth.signIn(email, pass); $('#lock-pass').value = ''; setMode('setpin'); $('#cal-frame').contentWindow?.location.reload(); }
    catch (err) { say(/invalid/i.test(err.message) ? '이메일이나 비밀번호가 맞지 않아요' : err.message, true); }
  });
  pin.addEventListener('input', async () => {
    pin.value = pin.value.replace(/\D/g, '');
    if (pin.value.length < 6) return;
    const v = pin.value;
    if (mode === 'setpin') { newPin = v; setMode('confirm'); newPin = v; return; }
    if (mode === 'confirm') { if (v === newPin) { await Auth.setPin(v); unlock(); } else { setMode('setpin', '두 번 넣은 PIN이 달라요. 다시 정하세요', true); } return; }
    const r = await Auth.checkPin(v);
    if (r === true) { if (await Auth.session()) unlock(); else setMode('login', '로그인이 만료됐어요. 다시 로그인하세요', true); }
    else if (r === 'reset') setMode('login', 'PIN을 5번 틀렸어요. 비밀번호로 로그인하세요', true);
    else { pin.value = ''; say(`PIN이 맞지 않아요 (${r}번 남음)`, true); }
  });
  $('#lock-alt').onclick = () => setMode('login');
  $('#btn-lock').onclick = lock;

  // 자리 비우면 잠금
  let lastInput = Date.now();
  for (const ev of ['pointermove', 'keydown', 'wheel', 'pointerdown']) addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true });
  setInterval(() => { if (settings.idle > 0 && lockEl.hidden && Date.now() - lastInput > settings.idle * 60_000) lock(); }, 30_000);

  /* ── 단축키 ── */
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('#settings').hidden) $('#settings').hidden = true; else if (open) back(); else if (toastsEl.lastElementChild) dismiss(toastsEl.lastElementChild); }
    if (open === 'vuln' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.target.closest('input, textarea, select')) { e.preventDefault(); stepVuln(e.key === 'ArrowRight' ? 1 : -1); }
    if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); lock(); }
    if (e.ctrlKey && e.key === ',') { e.preventDefault(); if (lockEl.hidden) $('#settings').hidden = false; }
    if (e.key === 'F5') { e.preventDefault(); refreshAll(); }
    if (e.key === 'F11' && win) { e.preventDefault(); win.isFullscreen().then((f) => win.setFullscreen(!f)).catch(() => {}); }
  });

  /* ── 창 버튼 ── */
  $('#win-min').onclick = () => win?.minimize();
  $('#win-max').onclick = () => win?.toggleMaximize();
  $('#win-close').onclick = () => { if (!win) return; if (settings.close === 'tray') win.hide(); else invoke('plugin:process|exit', { code: 0 }).catch(() => win.close()); };
  $('.bar').addEventListener('dblclick', (e) => { if (!e.target.closest('button')) win?.toggleMaximize(); });

  /* ── 설정 ── */
  $('#btn-settings').onclick = () => { if (lockEl.hidden) $('#settings').hidden = !$('#settings').hidden; };
  $('#settings-close').onclick = () => { $('#settings').hidden = true; };
  $('#set-size').value = settings.size; $('#set-close').value = settings.close; $('#set-idle').value = String(settings.idle); $('#set-update').checked = settings.update;
  const applySize = (v) => {
    if (!v || !win) return;
    const [w, h] = v.split('x').map(Number), L = T.dpi?.LogicalSize || T.window?.LogicalSize;
    if (L) win.setSize(new L(w, h)).then(() => win.center()).catch(() => {});
  };
  $('#set-size').onchange = (e) => { settings.size = e.target.value; saveSettings(); applySize(settings.size); };
  $('#set-close').onchange = (e) => { settings.close = e.target.value; saveSettings(); };
  $('#set-idle').onchange = (e) => { settings.idle = +e.target.value; saveSettings(); };
  $('#set-update').onchange = (e) => { settings.update = e.target.checked; saveSettings(); };
  invoke('plugin:autostart|is_enabled').then((on) => { $('#set-autostart').checked = !!on; }).catch(() => { $('#set-autostart').disabled = true; });
  $('#set-autostart').onchange = (e) => invoke(`plugin:autostart|${e.target.checked ? 'enable' : 'disable'}`).catch(() => {});
  $('#set-pin').onclick = () => { $('#settings').hidden = true; lockEl.hidden = false; document.body.classList.add('is-locked'); setMode('setpin', '새 PIN을 정하세요'); };
  $('#set-logout').onclick = () => { Auth.signOut(); S.loggedIn = false; S.events = []; S.ddays = []; drawAll(); $('#cal-frame').contentWindow?.location.reload(); lock(); };
  const checkUpdate = (manual) => invoke('check_update').then((r) => {
    const [state, v] = String(r).split(':');
    $('#set-version').textContent = state === 'latest' ? `${v} · 최신` : `${v}로 업데이트 중…`;
    if (manual && state === 'latest') termLine(`<span class="ok">✓</span> 최신 버전이에요 (${esc(v)})`);
  }).catch((err) => { if (manual) termLine(`<span class="warn">업데이트 확인 실패</span> <span class="muted">${esc(String(err))}</span>`); });
  T?.app?.getVersion?.().then((v) => { $('#set-version').textContent = v; });
  $('#set-check').onclick = () => checkUpdate(true);

  /* ── 시작: 잠금 화면부터 ── */
  function start() {
    termLine('<span class="muted">불러오는 중…</span>', 'loading');
    refreshAll().then(() => { body.querySelector('.loading')?.remove(); exec('fetch'); });
    schedulePing(); ping();
    setInterval(() => { if (!document.hidden) refreshAll(); }, 30 * 60_000);
    setInterval(drawTimeline, 30_000);
    addEventListener('resize', drawTimeline);
    if (settings.update) setTimeout(() => checkUpdate(false), 8000);
  }
  applySize(settings.size);
  drawDock(); drawTimeline(); drawDdays(); buildAlerts(); drawGrass();
  lock();
})();
