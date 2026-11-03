// 터미널 도구 중 계산만 하는 것들 (인코딩, 해시, 계산기, 서브넷, 권한…). 화면·저장은 app.js가 한다.
// 전부 이 PC 안에서만 돈다: 입력한 글자는 어디로도 보내지 않는다.
window.Tools = (() => {
  const enc = new TextEncoder();
  const bytes = (s) => enc.encode(s);
  const hexOf = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

  /* 바이트 → 글자. 깨지거나 제어 문자가 많으면 null (글자가 아닌 것) */
  function text(u8) {
    let s; try { s = new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch { return null; }
    if (!s.length) return null;
    const bad = [...s].filter((c) => { const n = c.codePointAt(0); return (n < 32 && !'\n\r\t'.includes(c)) || n === 0x7f || n === 0xfffd; }).length;
    return bad / s.length < 0.05 ? s : null;
  }

  /* ── Base64 ── */
  const b64enc = (s, urlsafe) => { let bin = ''; for (const b of bytes(s)) bin += String.fromCharCode(b); const r = btoa(bin); return urlsafe ? r.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : r; };
  function b64bytes(s) {
    let t = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(t) || t.length % 4 === 1) return null;
    t += '='.repeat((4 - (t.length % 4)) % 4);
    try { return Uint8Array.from(atob(t), (c) => c.charCodeAt(0)); } catch { return null; }
  }

  /* ── 16진수 ── */
  function hexbytes(s) {
    const t = s.replace(/0x|\\x|[\s:,-]/gi, '');
    if (!t.length || t.length % 2 || !/^[0-9a-f]+$/i.test(t)) return null;
    return Uint8Array.from(t.match(/../g), (h) => parseInt(h, 16));
  }
  function numBases(s) {
    const t = s.trim().toLowerCase().replace(/_/g, '');
    let n;
    if (/^0x[0-9a-f]+$/.test(t)) n = BigInt(t);
    else if (/^0b[01]+$/.test(t)) n = BigInt(t);
    else if (/^0o[0-7]+$/.test(t)) n = BigInt(t);
    else if (/^-?\d+$/.test(t)) n = BigInt(t);
    else return null;
    const neg = n < 0n, a = neg ? -n : n, sign = neg ? '-' : '';
    return { dec: n.toString(), hex: sign + '0x' + a.toString(16), bin: sign + '0b' + a.toString(2), oct: sign + '0o' + a.toString(8) };
  }

  /* ── 2진수 ── */
  function binbytes(s) {
    const t = s.replace(/\s+/g, '');
    if (!t.length || t.length % 8 || !/^[01]+$/.test(t)) return null;
    return Uint8Array.from(t.match(/.{8}/g), (b) => parseInt(b, 2));
  }

  /* ── HTML 엔티티 ── */
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®' };
  const htmlDecode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, k) => (k[0] === '#' ? String.fromCodePoint(k[1].toLowerCase() === 'x' ? parseInt(k.slice(2), 16) : +k.slice(1)) : NAMED[k.toLowerCase()] ?? m));
  const htmlEncode = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* ── ROT / 시저 ── */
  const rot = (s, n) => s.replace(/[a-z]/gi, (c) => { const a = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - a + n) % 26 + 26) % 26 + a); });

  /* ── URL ── */
  const urlAll = (s) => [...bytes(s)].map((b) => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');

  /* ── 해시: SHA는 브라우저 내장, MD5는 내장이 없어 직접 계산 ── */
  function md5(str) {
    const msg = bytes(str), len = msg.length, n = ((len + 8) >>> 6) + 1, w = new Uint32Array(n * 16);
    for (let i = 0; i < len; i++) w[i >> 2] |= msg[i] << ((i % 4) * 8);
    w[len >> 2] |= 0x80 << ((len % 4) * 8);
    w[n * 16 - 2] = (len * 8) >>> 0; w[n * 16 - 1] = Math.floor(len / 0x20000000);
    const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
    const R = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let o = 0; o < w.length; o += 16) {
      let a = a0, b = b0, c = c0, d = d0;
      for (let i = 0; i < 64; i++) {
        let f, g; const r = i >> 4;
        if (r === 0) { f = (b & c) | (~b & d); g = i; } else if (r === 1) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; } else if (r === 2) { f = b ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (b | ~d); g = (7 * i) % 16; }
        const t = d; d = c; c = b;
        const x = (a + f + K[i] + w[o + g]) >>> 0, s = R[r * 4 + (i % 4)];
        b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0; a = t;
      }
      a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
    }
    return [a0, b0, c0, d0].map((v) => [0, 8, 16, 24].map((s) => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
  }
  const sha = async (algo, s) => hexOf(new Uint8Array(await crypto.subtle.digest(algo, bytes(s))));
  async function hashes(s) { return { 'MD5': md5(s), 'SHA-1': await sha('SHA-1', s), 'SHA-256': await sha('SHA-256', s), 'SHA-512': await sha('SHA-512', s) }; }
  // 생김새로 짐작하는 해시 종류
  function hashId(h) {
    const t = h.trim();
    if (/^\$2[aby]\$\d\d\$/.test(t)) return ['bcrypt'];
    if (/^\$argon2(id|i|d)\$/.test(t)) return ['Argon2'];
    if (/^\$6\$/.test(t)) return ['SHA-512 crypt (리눅스 /etc/shadow)'];
    if (/^\$5\$/.test(t)) return ['SHA-256 crypt (리눅스 /etc/shadow)'];
    if (/^\$1\$/.test(t)) return ['MD5 crypt (옛 리눅스 /etc/shadow)'];
    if (!/^[0-9a-f]+$/i.test(t)) return [];
    return ({ 32: ['MD5', 'NTLM', 'MD4'], 40: ['SHA-1', 'RIPEMD-160'], 56: ['SHA-224', 'SHA3-224'], 64: ['SHA-256', 'SHA3-256'], 96: ['SHA-384', 'SHA3-384'], 128: ['SHA-512', 'SHA3-512', 'Whirlpool'] })[t.length] || [];
  }

  /* ── JWT: 내용만 풀고 서명은 확인하지 않는다 ── */
  function jwt(tok) {
    const p = tok.trim().split('.');
    if (p.length < 2 || p.length > 3) return null;
    const part = (s) => { const u = b64bytes(s); const t = u && text(u); try { return t ? JSON.parse(t) : null; } catch { return null; } };
    const header = part(p[0]), payload = part(p[1]);
    if (!header || !payload) return null;
    return { header, payload, sigLen: (p[2] || '').length };
  }

  /* ── 자동으로 풀어 보기: 어울리는 후보를 모두 ── */
  function decodeOnce(s) {
    const out = [], t = s.trim();
    if (/^[\w-]+\.[\w-]+\.[\w-]*$/.test(t) && jwt(t)) out.push({ type: 'JWT', value: JSON.stringify(jwt(t).payload), note: 'jwt 명령으로 자세히' });
    if (/%[0-9a-f]{2}/i.test(t)) { try { out.push({ type: 'URL 인코딩', value: decodeURIComponent(t) }); } catch {} }
    if (/&(#x?[0-9a-f]+|[a-z]+);/i.test(t)) out.push({ type: 'HTML 엔티티', value: htmlDecode(t) });
    const bi = binbytes(t); if (bi && text(bi)) out.push({ type: '2진수', value: text(bi) });
    const hx = !bi && hexbytes(t); if (hx && text(hx)) out.push({ type: '16진수', value: text(hx) });
    if (!bi && t.length >= 4 && /^[A-Za-z0-9+/_-]+={0,2}$/.test(t.replace(/\s/g, ''))) { const u = b64bytes(t); const v = u && text(u); if (v && v !== t) out.push({ type: 'Base64', value: v }); }
    return out;
  }
  function decode(s) {
    const first = decodeOnce(s);
    for (const c of first) { const next = c.type !== 'JWT' && decodeOnce(c.value)[0]; if (next) c.then = next; }
    if (/[a-z]/i.test(s)) first.push({ type: 'ROT13이라면', value: rot(s, 13), weak: true });
    return first;
  }

  /* ── 계산기: eval 없이 직접 읽는다 ── */
  const FN = { sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, log: Math.log10, ln: Math.log, log2: Math.log2, sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, min: Math.min, max: Math.max, pow: Math.pow };
  const CONST = { pi: Math.PI, e: Math.E };
  function calc(src) {
    const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/,(?=\d{3}\b)/g, '').replace(/\*\*/g, '^');
    const tok = s.match(/0x[0-9a-f]+|0b[01]+|\d*\.?\d+(?:e[+-]?\d+)?|[a-z_][a-z0-9_]*|[-+*/%^(),]|\S/gi) || [];
    let i = 0;
    const peek = () => tok[i], take = () => tok[i++];
    const want = (t) => { if (take() !== t) throw new Error(`'${t}'가 있어야 해요`); };
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') v = take() === '+' ? v + term() : v - term(); return v; }
    function term() { let v = unary(); while (['*', '/', '%'].includes(peek())) { const o = take(), r = unary(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
    function unary() { if (peek() === '-') { take(); return -unary(); } if (peek() === '+') { take(); return unary(); } return power(); }
    function power() { const b = primary(); if (peek() === '^') { take(); return b ** unary(); } return b; }
    function primary() {
      const t = take();
      if (t === undefined) throw new Error('식이 끝나지 않았어요');
      if (t === '(') { const v = expr(); want(')'); return v; }
      if (/^0x/i.test(t)) return parseInt(t, 16);
      if (/^0b/i.test(t)) return parseInt(t.slice(2), 2);
      if (/^[\d.]/.test(t)) return parseFloat(t);
      const k = t.toLowerCase();
      if (k in CONST) return CONST[k];
      if (k in FN) { want('('); const args = [expr()]; while (peek() === ',') { take(); args.push(expr()); } want(')'); return FN[k](...args); }
      throw new Error(`모르는 글자 '${t}'`);
    }
    const v = expr();
    if (i < tok.length) throw new Error(`'${tok[i]}' 앞에서 막혔어요`);
    return v;
  }
  const fmt = (v) => (!Number.isFinite(v) ? String(v) : Number.isInteger(v) && Math.abs(v) < 1e21 ? v.toLocaleString('ko-KR') : String(+v.toPrecision(12)));

  /* ── 서브넷 (IPv4) ── */
  const ip2n = (ip) => { const p = ip.split('.'); if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || +x > 255)) return null; return p.reduce((a, x) => a * 256 + +x, 0); };
  const n2ip = (n) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');
  function cidr(a, b) {
    let ip, prefix;
    if (a.includes('/')) { [ip, prefix] = a.split('/'); prefix = +prefix; }
    else if (b) {
      ip = a; const m = ip2n(b); if (m == null) return null;
      const bits = m.toString(2).padStart(32, '0');
      if (!/^1*0*$/.test(bits)) return { error: '서브넷 마스크가 이상해요 (1이 이어지다 0이 이어져야 해요)' };
      prefix = bits.indexOf('0') === -1 ? 32 : bits.indexOf('0');
    }
    else { ip = a; prefix = 32; }
    const n = ip2n(ip);
    if (n == null || !(prefix >= 0 && prefix <= 32) || !Number.isInteger(prefix)) return null;
    const size = 2 ** (32 - prefix), net = Math.floor(n / size) * size, bc = net + size - 1, mask = 2 ** 32 - size;
    const hosts = prefix >= 31 ? size : size - 2;
    const first = prefix >= 31 ? net : net + 1, last = prefix >= 31 ? bc : bc - 1;
    const inR = (base, bits) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(ip2n(base) / 2 ** (32 - bits));
    const kind = inR('10.0.0.0', 8) || inR('172.16.0.0', 12) || inR('192.168.0.0', 16) ? '사설 IP' : inR('127.0.0.0', 8) ? '루프백 (내 PC)' : inR('169.254.0.0', 16) ? '링크 로컬 (DHCP 실패 때)' : inR('100.64.0.0', 10) ? 'CGNAT (통신사 내부)' : inR('224.0.0.0', 4) ? '멀티캐스트' : '공인 IP';
    return { ip, prefix, net: n2ip(net), bc: n2ip(bc), first: n2ip(first), last: n2ip(last), hosts, mask: n2ip(mask), wild: n2ip(size - 1), kind, bin: mask.toString(2).padStart(32, '0').match(/.{8}/g).join('.') };
  }

  /* ── 리눅스 권한 ── */
  const MEAN = { '755': '실행 파일·폴더의 기본값', '644': '일반 파일의 기본값', '600': '나만 읽고 쓰기 (비밀키, 설정 파일)', '700': '나만 모두 (개인 폴더·스크립트)', '400': '나만 읽기 (SSH 개인키)', '777': '모두가 모든 권한: 위험', '666': '모두가 읽고 쓰기: 위험', '750': '나는 모두, 그룹은 읽기·실행', '4755': 'setuid 실행 파일 (예: passwd)', '1777': '모두 쓰되 남의 파일은 못 지움 (/tmp)' };
  function chmod(arg) {
    let num, sym;
    const a = arg.trim();
    if (/^[0-7]{3,4}$/.test(a)) {
      num = a.padStart(4, '0');
      const sp = +num[0], d = num.slice(1).split('').map(Number);
      sym = d.map((v, i) => {
        let x = (v & 4 ? 'r' : '-') + (v & 2 ? 'w' : '-'), ex = v & 1;
        const special = [sp & 4, sp & 2, sp & 1][i];
        x += special ? (i === 2 ? (ex ? 't' : 'T') : (ex ? 's' : 'S')) : ex ? 'x' : '-';
        return x;
      }).join('');
    } else if (/^[-dlcbps]?[-r][-w][-xsS][-r][-w][-xsS][-r][-w][-xtT]$/.test(a)) {
      sym = a.slice(-9);
      let sp = 0;
      const d = [0, 1, 2].map((i) => { const t = sym.slice(i * 3, i * 3 + 3); let v = (t[0] === 'r' ? 4 : 0) + (t[1] === 'w' ? 2 : 0) + ('xst'.includes(t[2]) ? 1 : 0); if ('sStT'.includes(t[2])) sp += [4, 2, 1][i]; return v; });
      num = `${sp}${d.join('')}`;
    } else return null;
    const short = num[0] === '0' ? num.slice(1) : num;
    const who = ['소유자', '그룹', '다른 사람'].map((w, i) => { const t = sym.slice(i * 3, i * 3 + 3); return { who: w, r: t[0] === 'r', w: t[1] === 'w', x: 'xst'.includes(t[2]), special: 'sStT'.includes(t[2]) ? (i === 2 ? 'sticky' : i === 0 ? 'setuid' : 'setgid') : '' }; });
    return { num: short, sym, who, mean: MEAN[short] || '' };
  }

  /* ── 시간 글자 읽기: 25 → 25분, 90s, 10m, 1h30m, 1:30(분:초), 1:30:00 ── */
  function duration(s) {
    const t = s.trim().toLowerCase();
    if (/^\d+(\.\d+)?$/.test(t)) return +t * 60_000;
    if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(t)) { const p = t.split(':').map(Number); return (p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]) * 1000; }
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (m && (m[1] || m[2] || m[3])) return ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000;
    const k = t.match(/^(?:(\d+)시간)?(?:(\d+)분)?(?:(\d+)초)?$/);
    if (k && (k[1] || k[2] || k[3])) return ((+k[1] || 0) * 3600 + (+k[2] || 0) * 60 + (+k[3] || 0)) * 1000;
    return null;
  }

  return { bytes, hexOf, text, b64enc, b64bytes, hexbytes, numBases, binbytes, htmlDecode, htmlEncode, rot, urlAll, hashes, md5, hashId, jwt, decode, calc, fmt, cidr, chmod, duration };
})();
