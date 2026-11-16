// Finder datoer i et citat, så koden kan kontrollere, at en værdi faktisk står i kilden.
// Forstår engelske, danske og tyske månedsnavne, intervaller ("4–6 March 2027",
// "March 4-6, 2027", "28 February – 2 March 2027") og tal (2027-03-04, 04.03.2027, 4/3/2027).
//
// findDates(tekst) → [{ iso: "2027-03-04", noYear: false, ambiguous: false }, ...]
//   noYear:    citatet nævner dag og måned, men intet år (iso bruger året 0000)
//   ambiguous: tal som 04/03/2027, hvor dag og måned kan byttes om

const MONTHS = {
  january: 1, jan: 1, januar: 1,
  february: 2, feb: 2, februar: 2,
  march: 3, mar: 3, marts: 3, märz: 3, maerz: 3,
  april: 4, apr: 4,
  may: 5, maj: 5, mai: 5,
  june: 6, jun: 6, juni: 6,
  july: 7, jul: 7, juli: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, oktober: 10, okt: 10,
  november: 11, nov: 11,
  december: 12, dec: 12, dezember: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const ORD = "(?:st|nd|rd|th|\\.)?";
const DASH = "\\s*(?:-|–|—|to|til|bis)\\s*";

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}`;
function valid(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y || 2000, m - 1, d)); // år 0 → tjek mod skudår 2000
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function cleanText(s) {
  return String(s)
    .replace(/[‐-―−]/g, (c) => (c === "–" || c === "—" ? c : "-"))
    .replace(/[‘’‛]/g, "'").replace(/[“”„]/g, '"')
    .replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

export function findDates(text) {
  const s = cleanText(text);
  const found = []; // { start, end, dates: [{y,m,d}] } med y = null hvis intet år
  const take = (re, fn) => {
    for (const m of s.matchAll(re)) found.push({ start: m.index, end: m.index + m[0].length, ...fn(m) });
  };
  // 1) ISO 2027-03-04
  take(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, (m) => ({ dates: [{ y: +m[1], m: +m[2], d: +m[3] }] }));
  // 2) tal med dag først: 04.03.2027, 4/3/2027, 4-3-2027
  take(/\b(\d{1,2})([./-])(\d{1,2})\2(\d{4})\b/g, (m) => {
    const a = +m[1], b = +m[3], y = +m[4];
    const amb = m[2] === "/" && a <= 12 && b <= 12 && a !== b;
    return { dates: [{ y, m: b, d: a, ambiguous: amb }] };
  });
  // 3) dag først med månedsnavn: "4 March 2027", "4.–6. marts 2027", "4th of March", "28 February – 2 March 2027"
  take(new RegExp(`\\b(\\d{1,2})${ORD}(?:${DASH}(\\d{1,2})${ORD})?\\s+(?:of\\s+)?(${MONTH_RE})\\.?(?![a-zæøå])(?:,?\\s+(\\d{4})(?!\\d))?`, "gi"), (m) => {
    const mo = MONTHS[m[3].toLowerCase()], y = m[4] ? +m[4] : null;
    const ds = [{ y, m: mo, d: +m[1] }];
    if (m[2]) ds.push({ y, m: mo, d: +m[2] });
    return { dates: ds };
  });
  // 4) måned først: "March 4, 2027", "March 4-6, 2027", "December 15th 2026"
  take(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?!\\d)${ORD.replace("\\.", "")}(?:${DASH}(\\d{1,2})(?!\\d)${ORD.replace("\\.", "")})?(?:,?\\s+(\\d{4})(?!\\d))?`, "gi"), (m) => {
    const mo = MONTHS[m[1].toLowerCase()], y = m[4] ? +m[4] : null;
    const ds = [{ y, m: mo, d: +m[2] }];
    if (m[3]) ds.push({ y, m: mo, d: +m[3] });
    return { dates: ds };
  });

  // Overlap: behold det tidligste og længste match.
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const f of found) if (!kept.length || f.start >= kept[kept.length - 1].end) kept.push(f);

  // Et match uden år arver året fra det næste match med år, hvis det følger tæt efter
  // ("28 February – 2 March 2027"). Ligger måneden efter den næste dato, er det året før.
  for (let i = 0; i < kept.length; i++) {
    for (const d of kept[i].dates) {
      if (d.y !== null) continue;
      const next = kept[i + 1];
      const gap = next ? s.slice(kept[i].end, next.start) : "";
      const ny = next && next.dates.find((x) => x.y !== null);
      if (ny && gap.length <= 6 && /^[\s\-–—,]*(?:to|til|bis)?[\s\-–—,]*$/i.test(gap)) {
        d.y = d.m > ny.m ? ny.y - 1 : ny.y;
      }
    }
  }

  const out = [];
  for (const f of kept) for (const d of f.dates) {
    if (!valid(d.y, d.m, d.d)) continue;
    out.push({ iso: iso(d.y ?? 0, d.m, d.d), noYear: d.y === null, ambiguous: !!d.ambiguous });
  }
  return out;
}
