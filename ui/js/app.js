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
  ];
  const ctfLen = (e) => { const h = Math.round((Date.parse(e.finish) - Date.parse(e.start)) / 3_600_000); return h % 24 === 0 ? `${h / 24}일` : `${h}시간`; };
  const curVuln = () => S.vulns.length ? S.vulns[((vulnAt % S.vulns.length) + S.vulns.length) % S.vulns.length] : null;
  function vulnBig() {
    const v = curVuln();
    if (!v) return '<p class="empty">취약점 해설을 불러오지 못했어요.</p>';
    const list = (a) => (Array.isArray(a) ? `<ol style="margin:6px 0 0 1.2em;padding:0;list-style:decimal">${a.map((x) => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}</ol>` : `<p>${esc(a)}</p>`);
    const n = ((vulnAt % S.vulns.length) + S.vulns.length) % S.vulns.length;
    return `<div style="display:grid;gap:14px;max-width:72ch">
      <div style="display:flex;align-items:baseline;gap:14px"><p style="font-size:2.25rem;font-weight:700;letter-spacing:-0.03em">${esc(v.alias)}</p><button type="button" class="u-btn-ghost" data-act="vuln-next" style="margin-left:auto">다음 취약점 ›</button></div>
      <p style="color:var(--u-muted)">${esc(v.cve)} · ${esc(v.target)} · ${v.year}년 · ${esc(v.type)}${v.cvss != null ? ` · CVSS ${Number(v.cvss).toFixed(1)}` : ''}${v.cwe ? ` · ${esc(v.cwe)}` : ''} · ${n + 1} / ${S.vulns.length}</p>
      <p style="font-size:var(--u-step-lead);line-height:1.6">${esc(v.desc)}</p>
      ${v.flow ? `<div><b>어떻게 터지나</b>${list(v.flow)}</div>` : ''}
      ${v.ex ? `<div><b>예시</b><p style="font-family:var(--u-mono);color:var(--u-muted);margin-top:4px">${esc(v.ex)}</p></div>` : ''}
      ${v.fix ? `<div><b>막는 법</b>${list(v.fix)}</div>` : ''}
      <p><a href="https://nvd.nist.gov/vuln/detail/${esc(v.cve)}">NVD ↗</a> · <a href="https://www.cve.org/CVERecord?id=${esc(v.cve)}">CVE.org ↗</a></p>
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
  function refreshBig() { const el = stage.querySelector('.big__body'), p = PANELS.find((x) => x.id === open); if (el && p) el.innerHTML = p.body(); }
  function summon(id) {
    const p = PANELS.find((x) => x.id === id);
    if (!p || flying || open === id) return;
    if (open) back(true);
    const btn = dock.querySelector(`[data-id="${id}"]`), el = document.createElement('article');
    el.className = 'u-tile big';
    el.innerHTML = `<div class="u-tile__head"><h2 class="u-tile__title" style="font-size:1.75rem">${esc(p.title)}</h2><button type="button" class="big__esc"><kbd>Esc</kbd> 터미널로</button></div><div class="big__body">${p.body()}</div>`;
    el.querySelector('.big__esc').onclick = () => back();
    el.addEventListener('click', (e) => { if (e.target.closest('[data-act="vuln-next"]')) { vulnAt += 1; try { localStorage.setItem('urigg-hub-vuln', String(vulnAt % S.vulns.length)); } catch {} refreshBig(); drawDock(); } });
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

  /* ── 터미널 (명령어는 아직 정하는 중) ── */
  const body = $('#term-body');
  const PS1 = '<span class="ps1"><b>urigg@hub</b>:<em>~</em>$</span>';
  const inputRow = document.createElement('p');
  inputRow.className = 'term__input';
  inputRow.innerHTML = `${PS1}<input id="cmd" aria-label="명령어" autocomplete="off" spellcheck="false">`;
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'help 명령 목록 · open <칸> 크게 보기 · Tab 자동 완성 · ↑↓ 이전 명령 · Esc 터미널로';
  const termLine = (html, cls = '') => { const p = document.createElement('p'); if (cls) p.className = cls; p.innerHTML = html; inputRow.before(p); body.scrollTop = body.scrollHeight; };
  const IDS = PANELS.map((p) => p.id);
  const nextEvent = () => { const now = Date.now(); return S.events.filter((e) => !e.all_day && Date.parse(e.start_at) > now)[0]; };
  const CMDS = {
    help: () => [`open <칸>      칸을 가운데로   (${IDS.join(' · ')})`, 'fetch          오늘 요약', 'today          오늘 일정', 'dday           D-day 목록   dday add <이름> <YYYY-MM-DD>', 'kw · ip · ping · lock · clear'].join('\n'),
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
    kw: () => { const k = S.keywords[kstDay(Date.now()) % (S.keywords.length || 1)]; return k ? `<b>${esc(k[0])}</b>  <span class="muted">${esc(k[1])}</span>\n${esc(k[2])}` : '—'; },
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
  };
  const history = []; let hAt = 0;
  const exec = (raw) => {
    const [c, ...a] = raw.trim().split(/\s+/);
    termLine(`${PS1} ${esc(raw)}`);
    if (!c) return;
    const out = CMDS[c] ? CMDS[c](a) : `<span class="warn">bash: ${esc(c)}: command not found</span>`;
    if (out) termLine(out);
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
      const parts = cmd.value.split(' '), last = parts.at(-1), pool = parts.length === 1 ? Object.keys(CMDS) : parts[0] === 'open' ? IDS : [];
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
    if (e.key === 'Escape') { if (!$('#settings').hidden) $('#settings').hidden = true; else back(); }
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
