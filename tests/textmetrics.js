"use strict";
// Faithful Press Start 2P text metrics. Measured in Chrome (probe/font*.html):
//   * every ASCII 32..126 advance is EXACTLY 1em, at every px size tested
//     (7,8,9,10,11,12,14,16,18,22,28,36) -> width scales linearly with px
//   * advances are perfectly additive: measureText(whole) === sum of chars,
//     so there is no kerning or ligature to model
//   * glyphs the font LACKS fall through to the platform fallback. Every
//     non-ASCII codepoint that appears in game.js was measured individually;
//     the ratios are the table below. Emoji are 1.373em per CODE POINT, so
//     surrogate pairs must be walked by codepoint, never by .length.
const RATIO = {
  "\u2014": 1, "\u2013": 1, "\u00d7": 1, "\u00a7": 1, "\u00b1": 1, "\u00b7": 1,
  "\u00b0": 1, "\u2026": 1, "\u2193": 1, "\u2191": 1, "\u270f": 1, "\u00bd": 1,
  "\ud83c\udf99": 1,
  "\u25b2": 0.5498, "\u25bc": 0.5498, "\u2192": 0.5498, "\u2212": 0.5498,
  "\u2248": 0.5498, "\u25cf": 0.5498, "\u2190": 0.5498,
  "\u2198": 0.7329, "\u2199": 0.7329, "\u2196": 0.7329, "\u2197": 0.7319,
  "\u2603": 0.7036, "\u2213": 0.7471, "\u25c8": 0.8354, "\u2605": 0.833,
  "\u2699": 0.8428, "\u2600": 0.8428, "\u25c0": 0.8613, "\u25b6": 0.8613,
  "\u21d2": 0.8657, "\u2601": 0.8687, "\u2744": 0.8882, "\u23f1": 0.9043,
  "\u2604": 0.9102, "\u27f3": 0.9526, "\u27f5": 1.1792,
};
// astral-plane emoji, all measured at 1.373em
for (const ch of ["\ud83d\udca6", "\ud83c\udf2d", "\ud83c\udfc8", "\ud83e\uddb6",
  "\ud83c\udfc3", "\ud83d\udea9", "\ud83c\udfa5", "\ud83e\udd96", "\ud83e\udd1c",
  "\ud83e\udd1b", "\ud83c\udf10", "\ud83d\udd17", "\ud83c\udfcb", "\ud83d\udcc5",
  "\u2b50", "\ud83c\udf93", "\ud83d\udcd6", "\ud83d\udd0e", "\ud83c\udfc6",
  "\u2614"]) RATIO[ch] = 1.373;

// Unmeasured codepoints default to 1em (what the font itself always does).
function ratio(ch) { const r = RATIO[ch]; return r === undefined ? 1 : r; }
function widthEm(text) {
  let em = 0;
  for (const ch of String(text)) em += ratio(ch);   // for..of walks CODE POINTS
  return em;
}
function pxOf(font) {
  const m = /(\d+(?:\.\d+)?)px/.exec(String(font || ""));
  return m ? parseFloat(m[1]) : 10;
}
function measure(text, font) { return widthEm(text) * pxOf(font); }
module.exports = { measure, widthEm, pxOf, ratio, RATIO };
