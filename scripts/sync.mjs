// 동기화(수동): 웹사이트·브랜드 저장소의 공통 파일을 허브로 가져온다.  npm run sync
// 이 목록에 있는 파일만 덮어쓴다. 허브에서 따로 키우고 싶은 파일은 목록에서 빼면 그때부터 허브 전용.
// 두 저장소가 이 저장소 옆에 나란히 있어야 한다 (../URIGG-WebSite, ../URIGG-Brand).
import { cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = resolve(ROOT, '../URIGG-WebSite'), BRAND = resolve(ROOT, '../URIGG-Brand');
const SHARED = [
  // [가져올 곳, 놓을 곳]
  [join(BRAND, 'tokens/urigg.css'), 'ui/brand/urigg.css'],
  [join(BRAND, 'components/urigg-glass.css'), 'ui/brand/urigg-glass.css'],
  [join(BRAND, 'logo/emblem-320.webp'), 'ui/brand/logo/emblem-320.webp'],
  [join(BRAND, 'logo/mark-64.webp'), 'ui/brand/logo/mark-64.webp'],
  [join(BRAND, 'logo/favicon-32.png'), 'ui/brand/logo/favicon-32.png'],
  [join(WEB, 'site/data/keywords.json'), 'ui/data/keywords.json'],
  [join(WEB, 'site/data/vulns.json'), 'ui/data/vulns.json'],
  [join(WEB, 'site/calendar'), 'ui/calendar'], // 코워크 캘린더 위젯 (웹사이트가 매시간 다시 빌드)
];

for (const dir of [WEB, BRAND]) if (!existsSync(dir)) { console.error(`없음: ${dir}`); process.exit(1); }
for (const [from, to] of SHARED) {
  cpSync(from, join(ROOT, to), { recursive: true, force: true });
  console.log(`✓ ${to}`);
}
const ver = (dir) => { try { return execSync('git rev-parse --short HEAD', { cwd: dir }).toString().trim(); } catch { return '?'; } };
console.log(`\n웹사이트 ${ver(WEB)} · 브랜드 ${ver(BRAND)} 에서 가져왔어요. git diff 로 바뀐 것을 확인하세요.`);
