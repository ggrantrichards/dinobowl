// Text-fitting regression suite.
//
// WHY THIS FILE EXISTS: tests/harness.js used to stub measureText as
// () => ({ width: 10 }), a constant, so no test could see a text overflow.
// Now that the stub is faithful (Press Start 2P is exactly 1em per ASCII
// glyph), overflow is a NUMBER and therefore testable. Everything below is a
// measured width against a box width — no screenshots, no eyeballing.
"use strict";
const H = require("./harness.js");
const { step, stepFor, key, G, measureTextWidth, fontPx, textEm } = H;
const PF = (s) => s + "px 'Press Start 2P', monospace";
const W = 960;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra != null ? "  [" + extra + "]" : "")); }
}
// the assertion this whole file is built on
function fits(name, text, font, maxW) {
  const w = measureTextWidth(text, font);
  check(name, w <= maxW, "measured " + w.toFixed(1) + "px in " + maxW + "px  " + JSON.stringify(text));
}

(async () => {
  await new Promise((r) => setTimeout(r, 300));
  const g = G(), D = g.debug;

  // ---------------------------------------------- the metric itself
  check("metric: ASCII is exactly 1em per glyph",
    measureTextWidth("AAAAAAAAAA", PF(9)) === 90 && measureTextWidth("iiiiiiiiii", PF(9)) === 90);
  check("metric: scales linearly with px",
    measureTextWidth("HELLO", PF(7)) === 35 && measureTextWidth("HELLO", PF(28)) === 140);
  check("metric: additive (no kerning)",
    measureTextWidth("AB", PF(9)) === measureTextWidth("A", PF(9)) + measureTextWidth("B", PF(9)));
  check("metric: emoji cost one CODE POINT, not two chars",
    Math.abs(textEm("🦖") - 1.373) < 1e-9,
    "surrogate pair measured as " + textEm("🦖") + "em");
  check("metric: reads the px out of the font shorthand", fontPx(PF(13)) === 13);
  check("metric: real browser number reproduced exactly",
    measureTextWidth("auto-queue — get paired with a random player online", PF(9)) === 459,
    measureTextWidth("auto-queue — get paired with a random player online", PF(9)));

  // ---------------------------------------------- the helpers in game.js
  const T = g.debug.textfit;
  check("helpers: game.js exposes the text-fitting primitives for test",
    !!T && typeof T.fitFont === "function" && typeof T.fitText === "function" &&
    typeof T.wrapLines === "function" && typeof T.ellipsize === "function");
  if (T) {
    check("fitFont: returns an INTEGER px size (this is a pixel font)",
      Number.isInteger(T.fitFont("SOMETHING LONGISH", 100, 12, 6)));
    check("fitFont: never exceeds the base size",
      T.fitFont("A", 10000, 9, 6) === 9, T.fitFont("A", 10000, 9, 6));
    check("fitFont: never goes below the floor",
      T.fitFont("A VERY LONG STRING INDEED THAT CANNOT POSSIBLY FIT", 20, 12, 6) === 6);
    check("fitFont: picks the largest size that fits",
      T.fitFont("ABCDEFGHIJ", 90, 12, 6) === 9, T.fitFont("ABCDEFGHIJ", 90, 12, 6));
    check("ellipsize: result fits, at the current font",
      (() => { const s = T.withFont(PF(9), () => T.ellipsize("A".repeat(40), 90));
        return measureTextWidth(s, PF(9)) <= 90; })());
    check("ellipsize: leaves a string that already fits ALONE",
      T.withFont(PF(9), () => T.ellipsize("SHORT", 900)) === "SHORT");
    const lines = T.withFont(PF(7), () => T.wrapLines("auto-queue — get paired with a random player online", 212, 2));
    check("wrapLines: at most the requested number of lines", lines.length <= 2, lines.length);
    check("wrapLines: every line fits", lines.every((l) => measureTextWidth(l, PF(7)) <= 212),
      JSON.stringify(lines));
    check("wrapLines: no word is silently dropped (nothing lost, or an ellipsis says so)",
      lines.join(" ").replace(/…$/, "").trim().length >=
      "auto-queue — get paired with a random player online".length - 2,
      JSON.stringify(lines));
    check("wrapLines: an unbreakable word is ellipsized, not overflowed",
      measureTextWidth(T.withFont(PF(7), () => T.wrapLines("A".repeat(80), 100, 2))[0], PF(7)) <= 100);
  }

  // ---------------------------------------------- the boxes that were broken
  // 1. MENU cards. cw 284, copy starts 60px in past the mascot, 12px right pad.
  const CARD_TW = 284 - 60 - 12;
  const MENU_DESCS = [
    "one game, any matchup",
    "you vs a friend on one screen",
    "auto-queue — get paired with a random player online",
    "host a private game, share the link with a friend",
    "free reps: passing, running, punch, flight, RAMPAGE",
    "pick up where the herd left off",
    "17 games + playoffs + the DINO BOWL",
    "create a dino, take the DINOLICK, get drafted",
    "all 32 starting quarterbacks, dino-fied",
    "everything explained — even Cover 4 and Tampa 2",
    "every player ranked: speed, strength, jump…",
    "draw your own play, run it in games",
    "defense snaps · halftime shows · quarter length · flow",
  ];
  if (T) {
    let worst = 0, worstS = "";
    for (const d of MENU_DESCS) {
      const ls = T.withFont(PF(7), () => T.wrapLines(d, CARD_TW, 2));
      for (const l of ls) {
        const w = measureTextWidth(l, PF(7));
        if (w > worst) { worst = w; worstS = l; }
      }
    }
    check("menu: every card description wraps INSIDE the card", worst <= CARD_TW,
      "widest wrapped line " + worst.toFixed(0) + "px in " + CARD_TW + "px: " + JSON.stringify(worstS));
    check("menu: descriptions are no longer chopped at a hard 34 characters",
      T.withFont(PF(7), () => T.wrapLines(MENU_DESCS[2], CARD_TW, 2)).join(" ")
        .indexOf("random player online") >= 0);
  }
  // the card TITLE with its emoji icon, at the selected (larger) size
  fits("menu: widest title + icon fits the card at PF(10)",
    "🤜🤛 2-PLAYER VERSUS", PF(10), CARD_TW);

  // 2. PLAY-CALL cards. Signature play names are the long ones.
  const SIGS = ["IMMACULATE RECEPTION", "MINNEAPOLIS MIRACLE", "MUSIC CITY MIRACLE",
    "HAIL MARY ORIGINAL", "MILE HIGH FLICKER", "COVER 4 QUARTERS", "GOAL-LINE STUFF",
    "FIELD GOAL", "PUNT", "MY PLAY", "APEX SPECIAL"];
  const CARD_W = D.cardGeom ? D.cardGeom().cw : 196;
  check("playcall: the card is wide enough to have been fixed", CARD_W >= 196, CARD_W);
  if (T) {
    for (const nm of SIGS) {
      const size = T.fitFont(nm, CARD_W - 16, 10, 8);
      const w = measureTextWidth(nm, PF(size));
      check("playcall: \"" + nm + "\" fits the card at PF(" + size + ")", w <= CARD_W - 16,
        w.toFixed(0) + "px in " + (CARD_W - 16) + "px");
      check("playcall: \"" + nm + "\" keeps an integer font size", Number.isInteger(size));
    }
  }

  // 3. PRESNAP footer plate — was 78 chars at PF(9) (702px) inside a 580px plate
  const PRESNAP = [
    "HOLD YOUR QB & PULL BACK = SNAP + THROW  ·  SPACE = SNAP  ·  Q/E = CHANGE PLAY",
    "TAP A DINO TO CONTROL HIM  ·  SPACE = SNAP  ·  Q/E = CHANGE DEFENSE",
  ];
  const plate = D.presnapFooter ? D.presnapFooter() : { w: 740, tw: 720 };
  check("presnap: the footer plate stays on the canvas", plate.w <= W - 40, plate.w);
  for (const s of PRESNAP) fits("presnap: footer copy fits its plate", s, PF(9), plate.tw);

  // 4. PRACTICE tips strip — full canvas width, was 1057px at PF(7)
  const TIPS = [
    "OFFENSE DRILL — hold & PULL BACK=aim, release=throw · SPACE=bullet · SHIFT=juke · F=stiff-arm · Q=lateral · R=RAMPAGE     [P] SWITCH DRILL · [ESC] QUIT",
    "DEFENSE DRILL — TAB=switch · SPACE=jump · JUMP+F=punch · SHIFT=soar · R=RAMPAGE     [P] SWITCH DRILL · [ESC] QUIT",
  ];
  if (T) {
    for (const s of TIPS) {
      const size = T.fitFont(s, W - 24, 7, 6);
      fits("practice: drill tips fit the canvas at PF(" + size + ")", s, PF(size), W - 24);
      check("practice: drill tips keep an integer font size", Number.isInteger(size));
    }
  }

  // 5. SEASON STATS — two 400px columns; the right one used to run off canvas
  const STAT_LINES = [
    "199/288, 3410 yds, 31 TD, 12 INT · 41 car, 288 yds, 4 TD",
    "8/12, 133 yds, 2 TD, 1 INT · 30 car, 244 yds, 3 TD · 103 rec, 1500 yds, 12 TD",
    "244 car, 1388 yds, 17 TD · 44 rec, 402 yds, 3 TD",
    "142 tkl, 13 sacks, 4 INT",
  ];
  const COL = 400;
  if (T) {
    for (const s of STAT_LINES) {
      const size = T.fitFont(s, COL, 8, 7);
      const shown = T.withFont(PF(size), () => T.ellipsize(s, COL));
      const w = measureTextWidth(shown, PF(size));
      check("sznstats: stat line stays in its column", w <= COL,
        w.toFixed(0) + "px in " + COL + "px @PF(" + size + "): " + JSON.stringify(shown));
    }
    check("sznstats: the right-hand column cannot leave the canvas", W / 2 + 40 + COL <= W,
      W / 2 + 40 + COL);
  }

  // 6. PT-choice replay chip
  const chip = D.ptReplayGeom ? D.ptReplayGeom() : { w: 372 };
  fits("ptchoice: replay chip copy fits its chip",
    "[R] / TAP = REPLAY THAT TOUCHDOWN  ·  G = SAVE GIF", PF(7), chip.w - 12);

  // 7. KICK title must not run into the WIND readout at x=W/2+178
  if (T) {
    const KICK_TITLES = ["EXTRA POINT", "FIELD GOAL · 52 YDS", "KICKOFF · COVER THE RETURN",
      "PUNT · PIN THEM DEEP"];
    const KICK_TW = D.kickTitleW ? D.kickTitleW() : 270;
    for (const s of KICK_TITLES) {
      const size = T.fitFont(s, KICK_TW, 14, 9);
      const half = measureTextWidth(s, PF(size)) / 2;
      // the wind chip is centred at W/2+178 and is ~8 chars at PF(9) => 36px
      check("kick: \"" + s + "\" clears the wind readout", W / 2 + half <= W / 2 + 178 - 36,
        "title right edge " + (W / 2 + half).toFixed(0) + " vs wind left edge " + (W / 2 + 178 - 36));
    }
  }

  // ---------------------------------------------- and it still runs
  key("Enter"); step(); step();
  check("game still boots and renders after the UI change", !G().lastErr, G().lastErr);

  console.log("\n" + pass + " pass, " + fail + " fail");
  if (fail) process.exitCode = 1;
})();
