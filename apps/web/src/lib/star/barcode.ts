// Code 128 (subset B) SVG generator. Pure JS, no deps. Always renders
// at the requested natural width via viewBox so CSS scaling never
// distorts the bars and breaks the scanner.
//
// Public: bc128svg(text, displayW, displayH, showText, unit) → SVG string
//   - displayW=0 means natural width. NEVER scale down with CSS.
//   - unit=2.0 = print-quality, unit=1.4 = compact preview.

const C128B = (() => {
  let s = "";
  for (let i = 32; i < 127; i++) s += String.fromCharCode(i);
  return s;
})();

// 107-entry bar/space table (widths 1..4)
const BARS: number[][] = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
  [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
  [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
  [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
  [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
  [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
  [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
  [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
  [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
  [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
  [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
  [2,1,1,2,3,2],[2,3,3,1,1,1,2], // STOP (7 widths)
];

const START_B = 104;
const STOP    = 106;

function encode(text: string): number[] {
  const codes: number[] = [START_B];
  for (let i = 0; i < text.length; i++) {
    const idx = C128B.indexOf(text.charAt(i));
    if (idx >= 0) codes.push(idx);
  }
  // Checksum: (start + sum(idx * (i+1))) % 103
  let cksum = codes[0];
  for (let i = 1; i < codes.length; i++) cksum += codes[i] * i;
  cksum %= 103;
  codes.push(cksum);
  codes.push(STOP);
  return codes;
}

/** Builds a Code 128 SVG. unit=2.0 default (print quality). */
export function bc128svg(
  text: string,
  displayW = 0,
  displayH = 70,
  showText = true,
  unit = 2.0,
): string {
  const safe = (text || "").replace(/[^\x20-\x7e]/g, "?");
  const codes = encode(safe);

  // Total bar units = sum of widths. Quiet zone: 10 units each side.
  let unitsTotal = 20;
  for (const c of codes) {
    const seg = BARS[c];
    for (const w of seg) unitsTotal += w;
  }

  const naturalW = unitsTotal * unit;
  const widthAttr = displayW > 0 ? displayW : naturalW;

  // Build bars
  let svgBars = "";
  let x = 10 * unit; // left quiet zone
  for (const c of codes) {
    const seg = BARS[c];
    for (let i = 0; i < seg.length; i++) {
      const w = seg[i] * unit;
      const isBar = i % 2 === 0; // alternates bar / space
      if (isBar) {
        svgBars += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${displayH - (showText ? 16 : 0)}" fill="#000"/>`;
      }
      x += w;
    }
  }

  let textNode = "";
  if (showText) {
    textNode = `<text x="${(naturalW / 2).toFixed(2)}" y="${displayH - 2}" text-anchor="middle" font-family="Menlo,monospace" font-size="11" fill="#000">${escapeXml(safe)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr}" height="${displayH}" viewBox="0 0 ${naturalW.toFixed(2)} ${displayH}">${svgBars}${textNode}</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
