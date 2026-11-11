// Automatic brand logos: type "Netflix", "Spotify", "Jio recharge"… and the app shows that brand's
// own logo, fetched from Google's public favicon service (cached by the phone after the first load).
// No logo files are bundled in the app; unknown names fall back to the normal icon.

const BRANDS: [RegExp, string][] = [
  // streaming & music
  [/netflix/i, 'netflix.com'], [/spotify/i, 'spotify.com'], [/youtube\s*music/i, 'music.youtube.com'], [/youtube|yt\s*premium/i, 'youtube.com'],
  [/prime\s*video|amazon\s*prime/i, 'primevideo.com'], [/hotstar|jio\s*cinema|jiohotstar/i, 'hotstar.com'], [/sony\s*liv/i, 'sonyliv.com'],
  [/zee\s*5/i, 'zee5.com'], [/apple\s*(music|tv|one|care)|icloud/i, 'apple.com'], [/gaana/i, 'gaana.com'], [/jio\s*saavn|saavn/i, 'jiosaavn.com'],
  [/audible/i, 'audible.in'], [/kindle/i, 'amazon.in'],
  // AI & work tools
  [/chat\s*gpt|openai/i, 'openai.com'], [/claude|anthropic/i, 'claude.ai'], [/gemini/i, 'gemini.google.com'], [/perplexity/i, 'perplexity.ai'],
  [/canva/i, 'canva.com'], [/figma/i, 'figma.com'], [/adobe|photoshop|premiere|lightroom/i, 'adobe.com'], [/notion/i, 'notion.so'],
  [/github/i, 'github.com'], [/supabase/i, 'supabase.com'], [/vercel/i, 'vercel.com'], [/netlify/i, 'netlify.com'], [/hostinger/i, 'hostinger.in'],
  [/godaddy/i, 'godaddy.com'], [/google\s*one|google\s*drive|g\s*suite|workspace/i, 'one.google.com'], [/microsoft|office\s*365|m365|outlook/i, 'microsoft.com'],
  [/zoom/i, 'zoom.us'], [/dropbox/i, 'dropbox.com'], [/slack/i, 'slack.com'], [/trello/i, 'trello.com'], [/grammarly/i, 'grammarly.com'],
  [/capcut/i, 'capcut.com'], [/linkedin/i, 'linkedin.com'], [/meta\s*ads|facebook\s*ads|facebook/i, 'facebook.com'], [/instagram/i, 'instagram.com'],
  [/whatsapp/i, 'whatsapp.com'], [/telegram/i, 'telegram.org'], [/google\s*ads/i, 'ads.google.com'], [/upwork/i, 'upwork.com'], [/fiverr/i, 'fiverr.com'],
  // telecom & bills
  [/\bjio\b|jio\s*fiber/i, 'jio.com'], [/airtel/i, 'airtel.in'], [/\bvi\b|vodafone/i, 'myvi.in'], [/bsnl/i, 'bsnl.co.in'], [/tata\s*play/i, 'tataplay.com'],
  // credit, loans, investing & insurance
  [/sbi\s*card/i, 'sbicard.com'], [/\bsimpl\b/i, 'getsimpl.com'], [/lazy\s*pay/i, 'lazypay.in'], [/\bslice\b/i, 'sliceit.com'], [/one\s*card/i, 'getonecard.app'],
  [/bajaj\s*fin/i, 'bajajfinserv.in'], [/postpaid/i, 'paytm.com'], [/flipkart\s*pay\s*later/i, 'flipkart.com'], [/kreditbee/i, 'kreditbee.in'], [/moneyview|money\s*view/i, 'moneyview.in'],
  [/navi\b/i, 'navi.com'], [/groww/i, 'groww.in'], [/zerodha|kite/i, 'zerodha.com'], [/upstox/i, 'upstox.com'], [/angel\s*one/i, 'angelone.in'], [/kuvera/i, 'kuvera.in'],
  [/et\s*money/i, 'etmoney.com'], [/coin\s*dcx|coindcx/i, 'coindcx.com'], [/star\s*health/i, 'starhealth.in'], [/hdfc\s*ergo/i, 'hdfcergo.com'], [/icici\s*lombard/i, 'icicilombard.com'],
  [/niva\s*bupa/i, 'nivabupa.com'], [/care\s*health/i, 'careinsurance.com'], [/policy\s*bazaar/i, 'policybazaar.com'], [/acko/i, 'acko.com'], [/digit\s*insurance|go\s*digit/i, 'godigit.com'],
  [/cibil/i, 'cibil.com'], [/experian/i, 'experian.in'], [/muthoot/i, 'muthootfinance.com'], [/manappuram/i, 'manappuram.com'], [/hero\s*fincorp/i, 'herofincorp.com'], [/tata\s*capital/i, 'tatacapital.com'],
  // payments & banks
  [/google\s*pay|\bg\s*pay\b/i, 'pay.google.com'], [/phone\s*pe/i, 'phonepe.com'], [/paytm/i, 'paytm.com'], [/bhim/i, 'bhimupi.org.in'], [/\bcred\b/i, 'cred.club'],
  [/amazon\s*pay/i, 'amazon.in'], [/mobikwik/i, 'mobikwik.com'], [/super\.?money/i, 'super.money'],
  [/india\s*post|ippb/i, 'ippbonline.com'], [/\bsbi\b|state bank/i, 'sbi.co.in'], [/fino/i, 'finobank.com'],
  [/bank of baroda|\bbob\b/i, 'bankofbaroda.in'], [/hdfc/i, 'hdfcbank.com'], [/icici/i, 'icicibank.com'], [/axis/i, 'axisbank.com'], [/kotak/i, 'kotak.com'],
  [/\bpnb\b|punjab national/i, 'pnbindia.in'], [/canara/i, 'canarabank.com'], [/union bank/i, 'unionbankofindia.co.in'], [/idfc/i, 'idfcfirstbank.com'],
  [/indusind/i, 'indusind.com'], [/yes\s*bank/i, 'yesbank.in'], [/au\s*small|au\s*bank/i, 'aubank.in'], [/airtel\s*payments/i, 'airtel.in'], [/\blic\b/i, 'licindia.in'],
  // shopping, food, travel
  [/amazon/i, 'amazon.in'], [/flipkart/i, 'flipkart.com'], [/myntra/i, 'myntra.com'], [/meesho/i, 'meesho.com'], [/ajio/i, 'ajio.com'], [/nykaa/i, 'nykaa.com'],
  [/swiggy|instamart/i, 'swiggy.com'], [/zomato/i, 'zomato.com'], [/blinkit/i, 'blinkit.com'], [/zepto/i, 'zeptonow.com'], [/big\s*basket/i, 'bigbasket.com'],
  [/dmart/i, 'dmart.in'], [/jiomart/i, 'jiomart.com'], [/uber/i, 'uber.com'], [/\bola\b/i, 'olacabs.com'], [/rapido/i, 'rapido.bike'], [/irctc/i, 'irctc.co.in'],
  [/make\s*my\s*trip|mmt/i, 'makemytrip.com'], [/redbus/i, 'redbus.in'], [/indigo/i, 'goindigo.in'], [/domino/i, 'dominos.co.in'], [/kfc/i, 'kfc.co.in'],
  [/mc\s*donald/i, 'mcdonaldsindia.com'], [/starbucks/i, 'starbucks.in'], [/book\s*my\s*show/i, 'bookmyshow.com'],
  // study
  [/physics\s*wallah|\bpw\b/i, 'pw.live'], [/allen/i, 'allen.ac.in'], [/unacademy/i, 'unacademy.com'], [/byju/i, 'byjus.com'], [/vedantu/i, 'vedantu.com'],
  [/coursera/i, 'coursera.org'], [/udemy/i, 'udemy.com'], [/duolingo/i, 'duolingo.com'], [/khan\s*academy/i, 'khanacademy.org'],
];

/** Domain for a name like "Netflix Premium" or "spotify.com", or null if unknown. */
export function brandDomain(name: string | null | undefined): string | null {
  const n = String(name ?? '').trim();
  if (!n) return null;
  const direct = n.match(/\b([a-z0-9-]+\.(?:com|in|co\.in|ai|io|app|org|net|live|so|us|club|tv))\b/i);
  if (direct) return direct[1].toLowerCase();
  for (const [re, d] of BRANDS) if (re.test(n)) return d;
  return null;
}

export const brandLogoUrl = (domain: string, size = 128) =>
  `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=${size}`;
export const brandLogoFallback = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

const KEY = 'brand-logos';
export function brandLogosOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setBrandLogosOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('brand-logos-changed'));
}
