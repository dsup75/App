// Group split maths — all integer paise, rounding remainder spread so shares always add up.

export interface Part {
  member_id: string;
  amount_paise: number;
}

/** Split `total` equally among members; leftover paise go to the first members. */
export function splitEqual(total: number, memberIds: string[]): Part[] {
  if (!memberIds.length) return [];
  const base = Math.floor(total / memberIds.length);
  let rem = total - base * memberIds.length;
  return memberIds.map((m) => {
    const extra = rem > 0 ? 1 : 0;
    rem -= extra;
    return { member_id: m, amount_paise: base + extra };
  });
}

/** Split by percentages (basis points, 10000 = 100%). Largest-remainder rounding. */
export function splitPercent(total: number, bps: { member_id: string; bp: number }[]): Part[] {
  const raw = bps.map((x) => ({ member_id: x.member_id, exact: (total * x.bp) / 10000 }));
  const parts = raw.map((x) => ({ member_id: x.member_id, amount_paise: Math.floor(x.exact), frac: x.exact - Math.floor(x.exact) }));
  let rem = total - parts.reduce((s, p) => s + p.amount_paise, 0);
  [...parts].sort((a, b) => b.frac - a.frac).forEach((p) => {
    if (rem > 0) {
      p.amount_paise += 1;
      rem -= 1;
    }
  });
  return parts.map(({ member_id, amount_paise }) => ({ member_id, amount_paise }));
}

/** Item-wise: each item split equally among the members who shared it. */
export function splitItems(items: { amount_paise: number; members: string[] }[]): Part[] {
  const map = new Map<string, number>();
  for (const it of items) for (const p of splitEqual(it.amount_paise, it.members)) map.set(p.member_id, (map.get(p.member_id) ?? 0) + p.amount_paise);
  return [...map.entries()].map(([member_id, amount_paise]) => ({ member_id, amount_paise }));
}

export function mergeParts(parts: Part[]): Part[] {
  const map = new Map<string, number>();
  for (const p of parts) if (p.amount_paise) map.set(p.member_id, (map.get(p.member_id) ?? 0) + p.amount_paise);
  return [...map.entries()].map(([member_id, amount_paise]) => ({ member_id, amount_paise }));
}

/** Net balance per member: + means others owe them, − means they owe. */
export function netBalances(
  memberIds: string[],
  expenses: { payers: Part[]; shares: Part[] }[],
  settlements: { from_member_id: string; to_member_id: string; amount_paise: number }[],
): Map<string, number> {
  const net = new Map<string, number>(memberIds.map((m) => [m, 0]));
  const add = (m: string, v: number) => net.set(m, (net.get(m) ?? 0) + v);
  for (const e of expenses) {
    e.payers.forEach((p) => add(p.member_id, p.amount_paise));
    e.shares.forEach((p) => add(p.member_id, -p.amount_paise));
  }
  for (const s of settlements) {
    add(s.from_member_id, s.amount_paise);
    add(s.to_member_id, -s.amount_paise);
  }
  return net;
}

/** Fewest transfers that settle everyone (greedy). */
export function suggestSettlements(net: Map<string, number>): { from: string; to: string; amount_paise: number }[] {
  const debtors = [...net.entries()].filter(([, v]) => v < 0).map(([m, v]) => ({ m, v: -v })).sort((a, b) => b.v - a.v);
  const creditors = [...net.entries()].filter(([, v]) => v > 0).map(([m, v]) => ({ m, v })).sort((a, b) => b.v - a.v);
  const out: { from: string; to: string; amount_paise: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    if (amt > 0) out.push({ from: debtors[i].m, to: creditors[j].m, amount_paise: amt });
    debtors[i].v -= amt;
    creditors[j].v -= amt;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}
