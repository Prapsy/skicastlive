// Polite HTTP helper: identified user agent, timeout, robots.txt check, no retries on blocks.
export const UA = 'SkiCastLiveBot/0.1 (New England ski conditions map; reads public snow reports)';
const robotsCache = new Map();

async function robotsFor(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let rules = [];
  try {
    const r = await fetch(origin + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    if (r.ok) {
      let applies = false;
      for (const raw of (await r.text()).split('\n')) {
        const line = raw.split('#')[0].trim();
        const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
        if (!m) continue;
        const k = m[1].toLowerCase(), v = m[2].trim();
        if (k === 'user-agent') applies = v === '*' || /skicastlive/i.test(v);
        else if (applies && (k === 'disallow' || k === 'allow') && v) rules.push({ allow: k === 'allow', path: v });
      }
    }
  } catch { /* no robots file reachable: treat as allowed */ }
  robotsCache.set(origin, rules);
  return rules;
}

function matches(rule, path) {
  const re = new RegExp('^' + rule.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$'));
  return re.test(path);
}

export async function allowed(url) {
  const u = new URL(url);
  const rules = await robotsFor(u.origin);
  let best = null;
  for (const r of rules) if (matches(r.path, u.pathname + u.search) && (!best || r.path.length > best.path.length)) best = r;
  return !best || best.allow;
}

/** Returns { ok, status, text, blocked, reason }. Never throws. */
export async function get(url, { accept = 'text/html,application/json;q=0.9,*/*;q=0.5', timeout = 25000 } = {}) {
  try {
    if (!(await allowed(url))) return { ok: false, status: 0, text: '', blocked: true, reason: 'robots.txt disallows' };
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
    const text = await r.text();
    const challenge = /Just a moment\.\.\.|cf-chl|Access Denied|_Incapsula_|Request unsuccessful|captcha/i.test(text.slice(0, 4000)) && text.length < 20000;
    if (challenge || r.status === 403 || r.status === 429) return { ok: false, status: r.status, text: '', blocked: true, reason: 'site blocks automated readers' };
    return { ok: r.ok, status: r.status, text, blocked: false, reason: r.ok ? '' : 'HTTP ' + r.status, finalUrl: r.url };
  } catch (e) {
    return { ok: false, status: 0, text: '', blocked: false, reason: String(e.cause?.code || e.name || e) };
  }
}
