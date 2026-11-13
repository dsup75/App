// Glossy, realistic-looking icons (shoe, moon, phone, earbuds, watch…) drawn in SVG, like the
// reference design. Generic objects only — no brand logos. Black & White theme greys them out.
import { useId, type ReactNode } from 'react';

export type GlyphName =
  | 'shoe' | 'moon' | 'phone' | 'earbuds' | 'watch' | 'scale' | 'heart' | 'flame' | 'activity' | 'body'
  | 'calendar' | 'check' | 'book' | 'cap' | 'chart' | 'money' | 'dumbbell' | 'card' | 'bank' | 'shield'
  | 'clock' | 'bell' | 'wallet' | 'handshake' | 'gift' | 'receipt' | 'target' | 'briefcase'
  | 'gear' | 'barchart' | 'sigma' | 'atom' | 'flask' | 'leaf' | 'globe' | 'grid' | 'lock' | 'sparkle' | 'trash' | 'info' | 'palette' | 'cloud' | 'stopwatch' | 'people' | 'house' | 'plus';

type G = (id: (k: string) => string) => ReactNode;

/* gradient helper */
const lg = (id: string, stops: [string, string][], x2 = '0', y2 = '1') => (
  <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
    {stops.map(([o, c]) => (
      <stop key={o} offset={o} stopColor={c} />
    ))}
  </linearGradient>
);
const shine = (x: number, y: number, rx: number, ry: number, o = 0.45) => <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#fff" opacity={o} />;
const floor = <ellipse cx="24" cy="44.5" rx="15" ry="2.2" fill="#000" opacity=".22" />;

const GLYPHS: Record<GlyphName, G> = {
  shoe: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#7cc4ff'], ['.55', '#2f7bff'], ['1', '#1546c9']], '1', '1')}
        {lg(i('s'), [['0', '#ffffff'], ['1', '#cfd8e8']])}
      </defs>
      {floor}
      <path d="M5 33c0-4 2-6 5-7l9-9c2-2 4-2 6 0l3 4c2 2 5 3 8 3l5 1c3 1 4 3 4 6v2H5z" fill={`url(#${i('a')})`} />
      <path d="M4 33h41c1 0 1 1 1 2v2c0 2-1 3-3 3H8c-2 0-4-1-4-3v-2c0-1 0-2 0-2z" fill={`url(#${i('s')})`} />
      <path d="M8 36h37" stroke="#9fb3d1" strokeWidth="1" />
      <path d="M12 30c6-1 14-1 22-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".9" />
      <path d="M20 19l3 3M23 17l3 3M26 16l3 3" stroke="#e8f1ff" strokeWidth="1.8" strokeLinecap="round" />
      {shine(17, 22, 6, 2.5, 0.35)}
    </>
  ),
  moon: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#f1e6ff'], ['.5', '#b794ff'], ['1', '#7c4dff']], '1', '1')}
        <radialGradient id={i('g')}>
          <stop offset="0" stopColor="#a78bfa" stopOpacity=".55" />
          <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill={`url(#${i('g')})`} />
      <path d="M30 8a16 16 0 1 0 10 26A13 13 0 0 1 30 8z" fill={`url(#${i('a')})`} />
      {shine(19, 16, 4, 2.2, 0.5)}
      <path d="M38 10l1 2 2 1-2 1-1 2-1-2-2-1 2-1z M42 20l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6z" fill="#fff" opacity=".9" />
    </>
  ),
  phone: (i) => (
    <>
      <defs>
        {lg(i('b'), [['0', '#3a4a7a'], ['1', '#0c1430']], '1', '1')}
        {lg(i('s'), [['0', '#60a5fa'], ['.6', '#2563eb'], ['1', '#1e1b8a']], '1', '1')}
      </defs>
      {floor}
      <rect x="13" y="3" width="22" height="40" rx="5" fill={`url(#${i('b')})`} stroke="#6b84c9" strokeWidth="1" />
      <rect x="15" y="6" width="18" height="34" rx="3" fill={`url(#${i('s')})`} />
      <rect x="21" y="7.5" width="6" height="1.6" rx=".8" fill="#0b1230" />
      <path d="M15 22c6-6 12-2 18-8v-5a3 3 0 0 0-3-3H18a3 3 0 0 0-3 3z" fill="#fff" opacity=".18" />
    </>
  ),
  earbuds: (i) => (
    <>
      <defs>
        {lg(i('w'), [['0', '#ffffff'], ['.7', '#e6e9f0'], ['1', '#b9c0cc']], '1', '1')}
      </defs>
      {floor}
      <g>
        <ellipse cx="15" cy="13" rx="8" ry="7.5" fill={`url(#${i('w')})`} />
        <ellipse cx="17.5" cy="12" rx="3" ry="2.6" fill="#2a2f3a" opacity=".85" />
        <rect x="9" y="17" width="5" height="22" rx="2.5" fill={`url(#${i('w')})`} />
        <ellipse cx="11.5" cy="38.5" rx="2.5" ry="1.4" fill="#aab2bf" />
        {shine(12, 9.5, 3.2, 1.6, 0.8)}
      </g>
      <g>
        <ellipse cx="33" cy="13" rx="8" ry="7.5" fill={`url(#${i('w')})`} />
        <ellipse cx="30.5" cy="12" rx="3" ry="2.6" fill="#2a2f3a" opacity=".85" />
        <rect x="34" y="17" width="5" height="22" rx="2.5" fill={`url(#${i('w')})`} />
        <ellipse cx="36.5" cy="38.5" rx="2.5" ry="1.4" fill="#aab2bf" />
        {shine(36, 9.5, 3.2, 1.6, 0.8)}
      </g>
    </>
  ),
  watch: (i) => (
    <>
      <defs>
        {lg(i('c'), [['0', '#4b5563'], ['1', '#111827']], '1', '1')}
        {lg(i('st'), [['0', '#1f2937'], ['1', '#0b0f17']])}
        {lg(i('sc'), [['0', '#0b3b3a'], ['1', '#04201f']], '1', '1')}
      </defs>
      <rect x="16" y="1" width="16" height="11" rx="3" fill={`url(#${i('st')})`} />
      <rect x="16" y="36" width="16" height="11" rx="3" fill={`url(#${i('st')})`} />
      <rect x="10" y="9" width="28" height="30" rx="8" fill={`url(#${i('c')})`} stroke="#9ca3af" strokeWidth="1" />
      <rect x="13" y="12" width="22" height="24" rx="5.5" fill={`url(#${i('sc')})`} />
      <rect x="38" y="19" width="2.2" height="6" rx="1" fill="#9ca3af" />
      <text x="24" y="27" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#5eead4" fontFamily="system-ui, sans-serif">10:09</text>
      <rect x="16" y="30" width="16" height="2" rx="1" fill="#22d3ee" opacity=".7" />
      {shine(19, 14, 5, 1.6, 0.25)}
    </>
  ),
  scale: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#ffffff'], ['1', '#c7d2fe']], '1', '1')}
      </defs>
      {floor}
      <rect x="5" y="8" width="38" height="34" rx="9" fill={`url(#${i('a')})`} stroke="#94a3b8" strokeWidth="1" />
      <rect x="15" y="13" width="18" height="8" rx="2.5" fill="#0f172a" />
      <text x="24" y="19.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#5eead4" fontFamily="system-ui, sans-serif">68.4</text>
      <circle cx="13" cy="34" r="2" fill="#94a3b8" />
      <circle cx="35" cy="34" r="2" fill="#94a3b8" />
      {shine(16, 11, 8, 1.5, 0.7)}
    </>
  ),
  heart: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#ff8fb1'], ['.5', '#ff3d7f'], ['1', '#c2185b']], '1', '1')}
      </defs>
      {floor}
      <path d="M24 42S5 30 5 17a10 10 0 0 1 19-5 10 10 0 0 1 19 5c0 13-19 25-19 25z" fill={`url(#${i('a')})`} />
      <path d="M9 23h8l3-5 4 10 3-6h12" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {shine(15, 13, 5, 2.4, 0.5)}
    </>
  ),
  flame: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#ffe259'], ['.5', '#ff8a00'], ['1', '#e52e2e']])}
        {lg(i('b'), [['0', '#fff7c2'], ['1', '#ffcc33']])}
      </defs>
      {floor}
      <path d="M24 3c3 8 13 12 13 25a13 13 0 0 1-26 0c0-7 4-10 6-15 1 4 3 6 5 6-1-6 0-11 2-16z" fill={`url(#${i('a')})`} />
      <path d="M24 24c2 4 6 6 6 11a6 6 0 0 1-12 0c0-4 3-6 6-11z" fill={`url(#${i('b')})`} />
    </>
  ),
  activity: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#86efac'], ['1', '#16a34a']], '1', '1')}
      </defs>
      <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(34,197,94,.2)" strokeWidth="7" />
      <path d="M24 6a18 18 0 1 1-17 12" fill="none" stroke={`url(#${i('a')})`} strokeWidth="7" strokeLinecap="round" />
      <path d="M15 25h5l2-5 4 9 2-4h5" stroke="#22c55e" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  body: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#67e8f9'], ['1', '#0891b2']], '1', '1')}
      </defs>
      {floor}
      <circle cx="24" cy="9" r="5.5" fill={`url(#${i('a')})`} />
      <path d="M14 17h20l-3 13h-3l-1 13h-6l-1-13h-3z" fill={`url(#${i('a')})`} />
      {shine(22, 7, 2, 1.2, 0.6)}
    </>
  ),
  calendar: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#ffffff'], ['1', '#dbeafe']])}
        {lg(i('t'), [['0', '#60a5fa'], ['1', '#2563eb']])}
      </defs>
      {floor}
      <rect x="6" y="8" width="36" height="34" rx="7" fill={`url(#${i('a')})`} />
      <path d="M6 15a7 7 0 0 1 7-7h22a7 7 0 0 1 7 7v3H6z" fill={`url(#${i('t')})`} />
      <rect x="14" y="4" width="3.5" height="9" rx="1.7" fill="#1e3a8a" />
      <rect x="30.5" y="4" width="3.5" height="9" rx="1.7" fill="#1e3a8a" />
      <g fill="#93c5fd">
        <rect x="12" y="23" width="5" height="4" rx="1" />
        <rect x="21.5" y="23" width="5" height="4" rx="1" />
        <rect x="31" y="23" width="5" height="4" rx="1" fill="#f87171" />
        <rect x="12" y="31" width="5" height="4" rx="1" />
        <rect x="21.5" y="31" width="5" height="4" rx="1" />
      </g>
      {shine(18, 10, 7, 1.4, 0.35)}
    </>
  ),
  check: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#fde68a'], ['.5', '#f59e0b'], ['1', '#d97706']], '1', '1')}
      </defs>
      {floor}
      <rect x="6" y="5" width="36" height="36" rx="10" fill={`url(#${i('a')})`} />
      <path d="M15 23l6 6 12-13" stroke="#fff" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {shine(17, 10, 8, 2.4, 0.4)}
    </>
  ),
  book: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#93c5fd'], ['1', '#2563eb']], '1', '1')}
      </defs>
      {floor}
      <path d="M4 11c7-3 13-2 20 2v29c-7-4-13-5-20-2z" fill={`url(#${i('a')})`} />
      <path d="M44 11c-7-3-13-2-20 2v29c7-4 13-5 20-2z" fill={`url(#${i('a')})`} opacity=".85" />
      <path d="M8 16c4-1 8-1 12 1M8 21c4-1 8-1 12 1M28 17c4-2 8-2 12-1M28 22c4-2 8-2 12-1" stroke="#e0ecff" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M24 13v29" stroke="#1e3a8a" strokeWidth="1.2" />
    </>
  ),
  cap: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#c4b5fd'], ['1', '#6d28d9']], '1', '1')}
      </defs>
      {floor}
      <path d="M2 18L24 8l22 10-22 10z" fill={`url(#${i('a')})`} />
      <path d="M11 23v9c0 3 6 6 13 6s13-3 13-6v-9l-13 6z" fill="#5b21b6" />
      <path d="M40 20v11" stroke="#fbbf24" strokeWidth="2" />
      <circle cx="40" cy="32" r="2" fill="#fbbf24" />
      {shine(20, 14, 8, 2, 0.35)}
    </>
  ),
  chart: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#7dd3fc'], ['1', '#2563eb']], '1', '1')}
      </defs>
      {floor}
      <rect x="6" y="5" width="36" height="36" rx="10" fill={`url(#${i('a')})`} />
      <path d="M12 31l8-8 6 5 10-12" stroke="#fff" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M31 16h5v5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {shine(17, 10, 8, 2.2, 0.35)}
    </>
  ),
  money: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#86efac'], ['.6', '#16a34a'], ['1', '#14532d']], '1', '1')}
      </defs>
      {floor}
      <path d="M17 6h14l-4 7h-6z" fill="#15803d" />
      <path d="M21 13h6c10 5 15 13 15 20 0 6-6 10-18 10S6 39 6 33c0-7 5-15 15-20z" fill={`url(#${i('a')})`} />
      <text x="24" y="35" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">₹</text>
      {shine(16, 22, 4, 3, 0.35)}
    </>
  ),
  dumbbell: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#fda4af'], ['1', '#e11d48']], '1', '1')}
      </defs>
      <rect x="4" y="15" width="7" height="18" rx="3" fill={`url(#${i('a')})`} />
      <rect x="11" y="12" width="6" height="24" rx="3" fill={`url(#${i('a')})`} />
      <rect x="37" y="15" width="7" height="18" rx="3" fill={`url(#${i('a')})`} />
      <rect x="31" y="12" width="6" height="24" rx="3" fill={`url(#${i('a')})`} />
      <rect x="17" y="21.5" width="14" height="5" rx="2" fill="#cbd5e1" />
    </>
  ),
  card: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#6d7dff'], ['1', '#1e1b8a']], '1', '1')}
      </defs>
      {floor}
      <rect x="3" y="10" width="42" height="28" rx="5" fill={`url(#${i('a')})`} />
      <rect x="8" y="17" width="8" height="6" rx="1.5" fill="#f5d77a" />
      <rect x="8" y="29" width="18" height="2.4" rx="1.2" fill="#c7d2fe" />
      <path d="M34 26a5 5 0 0 1 0 6M37 24a8 8 0 0 1 0 10" stroke="#e0e7ff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {shine(18, 13, 12, 1.6, 0.3)}
    </>
  ),
  bank: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#fde68a'], ['1', '#d97706']], '1', '1')}
      </defs>
      {floor}
      <path d="M4 17L24 6l20 11z" fill={`url(#${i('a')})`} />
      <g fill="#fbbf24">
        <rect x="8" y="19" width="5" height="16" rx="1" />
        <rect x="17" y="19" width="5" height="16" rx="1" />
        <rect x="26" y="19" width="5" height="16" rx="1" />
        <rect x="35" y="19" width="5" height="16" rx="1" />
      </g>
      <rect x="5" y="36" width="38" height="5" rx="1.5" fill="#d97706" />
    </>
  ),
  shield: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#6ee7b7'], ['1', '#059669']], '1', '1')}
      </defs>
      {floor}
      <path d="M24 3l17 6v12c0 11-8 18-17 22C15 39 7 32 7 21V9z" fill={`url(#${i('a')})`} />
      <path d="M16 23l6 6 11-12" stroke="#fff" strokeWidth="3.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {shine(18, 11, 6, 2, 0.4)}
    </>
  ),
  clock: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#ffffff'], ['1', '#c7d2fe']], '1', '1')}
      </defs>
      {floor}
      <circle cx="24" cy="23" r="19" fill="#4f46e5" />
      <circle cx="24" cy="23" r="15.5" fill={`url(#${i('a')})`} />
      <path d="M24 13v10l7 4" stroke="#1e1b4b" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  bell: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#fde68a'], ['1', '#f59e0b']], '1', '1')}
      </defs>
      {floor}
      <path d="M24 5a12 12 0 0 1 12 12v9l4 7H8l4-7v-9A12 12 0 0 1 24 5z" fill={`url(#${i('a')})`} />
      <circle cx="24" cy="38" r="4" fill="#d97706" />
      {shine(19, 12, 4, 2.4, 0.45)}
    </>
  ),
  wallet: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#7dd3fc'], ['1', '#2563eb']], '1', '1')}
      </defs>
      {floor}
      <rect x="5" y="11" width="38" height="29" rx="7" fill={`url(#${i('a')})`} />
      <path d="M9 11l22-6 3 6" fill="#93c5fd" />
      <rect x="29" y="20" width="14" height="11" rx="3" fill="#1d4ed8" />
      <circle cx="35" cy="25.5" r="2.2" fill="#fff" />
    </>
  ),
  handshake: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#fcd34d'], ['1', '#f59e0b']], '1', '1')}
      </defs>
      {floor}
      <path d="M4 20l9-8 8 4 6-3 8 3 9 8-6 6-9 8c-2 2-4 2-6 0l-9-8-4 1z" fill={`url(#${i('a')})`} />
      <path d="M21 16l-6 7c-1 2 1 4 3 3l5-4 7 7" stroke="#b45309" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  gift: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#f9a8d4'], ['1', '#db2777']], '1', '1')}
      </defs>
      {floor}
      <rect x="7" y="18" width="34" height="24" rx="4" fill={`url(#${i('a')})`} />
      <rect x="5" y="13" width="38" height="8" rx="3" fill="#ec4899" />
      <rect x="21.5" y="13" width="5" height="29" fill="#fde68a" />
      <path d="M24 13c-4-8-12-6-9-1 1 1 5 1 9 1zm0 0c4-8 12-6 9-1-1 1-5 1-9 1z" fill="#fde68a" />
    </>
  ),
  receipt: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#ffffff'], ['1', '#dbeafe']])}
      </defs>
      {floor}
      <path d="M10 4h28v38l-4-3-3 3-4-3-3 3-4-3-3 3-3-3-4 3z" fill={`url(#${i('a')})`} stroke="#93c5fd" />
      <path d="M16 13h16M16 19h16M16 25h10" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" />
      <text x="31" y="33" textAnchor="middle" fontSize="9" fontWeight="800" fill="#16a34a" fontFamily="system-ui, sans-serif">₹</text>
    </>
  ),
  target: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#fca5a5'], ['1', '#dc2626']], '1', '1')}
      </defs>
      <circle cx="24" cy="24" r="19" fill={`url(#${i('a')})`} />
      <circle cx="24" cy="24" r="13" fill="#fff" />
      <circle cx="24" cy="24" r="8" fill={`url(#${i('a')})`} />
      <circle cx="24" cy="24" r="3" fill="#fff" />
    </>
  ),
  briefcase: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#c084fc'], ['1', '#7e22ce']], '1', '1')}
      </defs>
      {floor}
      <path d="M17 13v-3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" stroke="#6b21a8" strokeWidth="3" fill="none" />
      <rect x="5" y="13" width="38" height="28" rx="6" fill={`url(#${i('a')})`} />
      <rect x="5" y="24" width="38" height="3" fill="#6b21a8" opacity=".5" />
      <rect x="21" y="22" width="6" height="7" rx="1.5" fill="#fde68a" />
      {shine(16, 17, 8, 2, 0.35)}
    </>
  ),
  gear: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#93c5fd'], ['1', '#2563eb']], '1', '1')}
      </defs>
      {floor}
      <path d="M21 3h6l1 5 4 2 4-3 4 4-3 4 2 4 5 1v6l-5 1-2 4 3 4-4 4-4-3-4 2-1 5h-6l-1-5-4-2-4 3-4-4 3-4-2-4-5-1v-6l5-1 2-4-3-4 4-4 4 3 4-2z" fill={`url(#${i('a')})`} />
      <circle cx="24" cy="24" r="7" fill="#0b1a3d" />
      <circle cx="24" cy="24" r="4" fill="#bfdbfe" />
      {shine(18, 10, 5, 2, 0.4)}
    </>
  ),
  barchart: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#93c5fd'], ['1', '#2563eb']])}
        {lg(i('b'), [['0', '#c4b5fd'], ['1', '#7c3aed']])}
        {lg(i('c'), [['0', '#67e8f9'], ['1', '#0891b2']])}
      </defs>
      {floor}
      <rect x="6" y="26" width="9" height="16" rx="2.5" fill={`url(#${i('c')})`} />
      <rect x="19.5" y="16" width="9" height="26" rx="2.5" fill={`url(#${i('b')})`} />
      <rect x="33" y="6" width="9" height="36" rx="2.5" fill={`url(#${i('a')})`} />
      <path d="M8 20l13-9 7 4 13-10" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
    </>
  ),
  sigma: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#a5b4fc'], ['1', '#4f46e5']], '1', '1')}
      </defs>
      <path d="M10 6h28v8h-4l-1-3H20l9 13-9 13h13l1-3h4v8H10v-4l12-14L10 10z" fill={`url(#${i('a')})`} />
      {shine(20, 8, 8, 1.5, 0.45)}
    </>
  ),
  atom: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#93c5fd'], ['1', '#7c3aed']], '1', '1')}
      </defs>
      <g fill="none" stroke={`url(#${i('a')})`} strokeWidth="2.6">
        <ellipse cx="24" cy="24" rx="20" ry="8" />
        <ellipse cx="24" cy="24" rx="20" ry="8" transform="rotate(60 24 24)" />
        <ellipse cx="24" cy="24" rx="20" ry="8" transform="rotate(120 24 24)" />
      </g>
      <circle cx="24" cy="24" r="4.5" fill="#f472b6" />
    </>
  ),
  flask: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#fde68a'], ['1', '#f59e0b']])}
      </defs>
      {floor}
      <path d="M18 4h12v4h-2v10l11 19c2 3 0 6-3 6H12c-3 0-5-3-3-6l11-19V8h-2z" fill="#e0f2fe" opacity=".35" stroke="#bae6fd" strokeWidth="1.2" />
      <path d="M14 30h20l5 7c2 3 0 6-3 6H12c-3 0-5-3-3-6z" fill={`url(#${i('a')})`} />
      <circle cx="20" cy="36" r="2" fill="#fff" opacity=".8" />
      <circle cx="27" cy="33" r="1.4" fill="#fff" opacity=".8" />
    </>
  ),
  leaf: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#86efac'], ['1', '#15803d']], '1', '1')}
      </defs>
      {floor}
      <path d="M40 6C18 6 7 17 8 38c21 1 32-10 32-32z" fill={`url(#${i('a')})`} />
      <path d="M10 40C18 28 26 20 36 12" stroke="#dcfce7" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  globe: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#7dd3fc'], ['1', '#0369a1']], '1', '1')}
      </defs>
      <circle cx="24" cy="24" r="19" fill={`url(#${i('a')})`} />
      <path d="M12 14c5 2 6 6 4 9s1 6 5 6 2 6 0 9M30 8c-2 4 1 6 5 6s5 4 3 8-5 5-5 9" stroke="#bbf7d0" strokeWidth="3" fill="none" strokeLinecap="round" />
      {shine(17, 13, 6, 3, 0.35)}
    </>
  ),
  grid: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#93c5fd'], ['1', '#2563eb']], '1', '1')}
        {lg(i('b'), [['0', '#f9a8d4'], ['1', '#db2777']], '1', '1')}
        {lg(i('c'), [['0', '#86efac'], ['1', '#16a34a']], '1', '1')}
        {lg(i('d'), [['0', '#fde68a'], ['1', '#f59e0b']], '1', '1')}
      </defs>
      <rect x="5" y="5" width="17" height="17" rx="5" fill={`url(#${i('a')})`} />
      <rect x="26" y="5" width="17" height="17" rx="5" fill={`url(#${i('b')})`} />
      <rect x="5" y="26" width="17" height="17" rx="5" fill={`url(#${i('c')})`} />
      <rect x="26" y="26" width="17" height="17" rx="5" fill={`url(#${i('d')})`} />
    </>
  ),
  lock: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#6ee7b7'], ['1', '#059669']], '1', '1')}
      </defs>
      {floor}
      <path d="M15 21v-6a9 9 0 0 1 18 0v6" stroke="#94a3b8" strokeWidth="4" fill="none" />
      <rect x="9" y="20" width="30" height="22" rx="6" fill={`url(#${i('a')})`} />
      <circle cx="24" cy="30" r="3" fill="#064e3b" />
      <rect x="22.8" y="31" width="2.4" height="6" rx="1.2" fill="#064e3b" />
    </>
  ),
  sparkle: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#c4b5fd'], ['.5', '#60a5fa'], ['1', '#22d3ee']], '1', '1')}
      </defs>
      <path d="M22 4l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" fill={`url(#${i('a')})`} />
      <path d="M38 28l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fbbf24" />
    </>
  ),
  trash: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#c4b5fd'], ['1', '#7c3aed']])}
      </defs>
      {floor}
      <rect x="8" y="9" width="32" height="5" rx="2.5" fill="#a78bfa" />
      <rect x="19" y="5" width="10" height="5" rx="2" fill="#a78bfa" />
      <path d="M11 16h26l-2 24c0 2-2 3-4 3H17c-2 0-4-1-4-3z" fill={`url(#${i('a')})`} />
      <path d="M19 22v14M24 22v14M29 22v14" stroke="#ede9fe" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  info: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#7dd3fc'], ['1', '#2563eb']], '1', '1')}
      </defs>
      <circle cx="24" cy="24" r="19" fill={`url(#${i('a')})`} />
      <circle cx="24" cy="15" r="2.8" fill="#fff" />
      <rect x="21.5" y="21" width="5" height="15" rx="2.5" fill="#fff" />
    </>
  ),
  palette: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#fde68a'], ['1', '#f59e0b']], '1', '1')}
      </defs>
      {floor}
      <path d="M24 5C12 5 4 13 4 23c0 9 7 15 13 15 4 0 4-3 3-5-1-3 1-5 4-5h6c6 0 14-3 14-11C44 10 35 5 24 5z" fill={`url(#${i('a')})`} />
      <circle cx="14" cy="20" r="3.2" fill="#ef4444" />
      <circle cx="22" cy="13" r="3.2" fill="#3b82f6" />
      <circle cx="32" cy="14" r="3.2" fill="#22c55e" />
      <circle cx="37" cy="22" r="3.2" fill="#a855f7" />
    </>
  ),
  cloud: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#ffffff'], ['1', '#93c5fd']])}
      </defs>
      {floor}
      <path d="M14 38a9 9 0 0 1-1-18 12 12 0 0 1 23 2 8 8 0 0 1 0 16z" fill={`url(#${i('a')})`} />
      <path d="M24 34V22m-5 5l5-5 5 5" stroke="#2563eb" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  stopwatch: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#ffffff'], ['1', '#c7d2fe']], '1', '1')}
      </defs>
      {floor}
      <rect x="20" y="2" width="8" height="5" rx="2" fill="#f59e0b" />
      <circle cx="24" cy="26" r="17" fill="#f97316" />
      <circle cx="24" cy="26" r="13.5" fill={`url(#${i('a')})`} />
      <path d="M24 26V16" stroke="#1e1b4b" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="26" r="2.4" fill="#1e1b4b" />
    </>
  ),
  people: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#fdba74'], ['1', '#ea580c']], '1', '1')}
        {lg(i('b'), [['0', '#fde68a'], ['1', '#f59e0b']], '1', '1')}
      </defs>
      {floor}
      <circle cx="32" cy="14" r="6" fill={`url(#${i('b')})`} />
      <path d="M22 40c0-8 4-14 10-14s10 6 10 14z" fill={`url(#${i('b')})`} />
      <circle cx="18" cy="16" r="7" fill={`url(#${i('a')})`} />
      <path d="M5 42c0-9 6-15 13-15s13 6 13 15z" fill={`url(#${i('a')})`} />
    </>
  ),
  house: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#93c5fd'], ['1', '#2563eb']], '1', '1')}
        {lg(i('r'), [['0', '#fca5a5'], ['1', '#dc2626']], '1', '1')}
      </defs>
      {floor}
      <path d="M9 22v17a3 3 0 0 0 3 3h24a3 3 0 0 0 3-3V22L24 9z" fill={`url(#${i('a')})`} />
      <path d="M4 23L24 6l20 17-3 3L24 12 7 26z" fill={`url(#${i('r')})`} />
      <rect x="20" y="29" width="8" height="13" rx="2" fill="#fde68a" />
      {shine(18, 24, 6, 1.8, 0.35)}
    </>
  ),
  plus: (i) => (
    <>
      <defs>
        {lg(i('a'), [['0', '#ffffff'], ['1', '#dbeafe']])}
      </defs>
      <path d="M20 6h8v14h14v8H28v14h-8V28H6v-8h14z" fill={`url(#${i('a')})`} />
    </>
  ),
};

export function Glyph({ name, size = 44, className }: { name: GlyphName; size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (k: string) => `g${uid}${k}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={'glyph shrink-0 ' + (className ?? '')} aria-hidden>
      {GLYPHS[name](id)}
    </svg>
  );
}
