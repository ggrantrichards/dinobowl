/* DINO BOWL — 8-bit pixel art engine.
 * Every position is its own dinosaur species:
 *   QB  Troodon           (slender, big brainy eye)
 *   RB  Carnotaurus       (bull build, brow horns)
 *   FB  Pachycephalosaurus(bone dome)
 *   WR  Velociraptor      (sleek, feather-tipped tail)
 *   TE  Deinocheirus      (huge catching arms)
 *   OL  Triceratops       (frill + horns, wide)
 *   DT  Stegosaurus       (back plates, low + immovable)
 *   ED  Allosaurus        (brow ridges, lean rusher)
 *   LB  Spinosaurus       (sail, long snout)
 *   CB  Deinonychus       (sickle claw)
 *   S   Quetzalcoatlus    (pterosaur — can SOAR)
 *   + T-rex rampage form, small pterodactyl flyers
 *
 * Palette chars: b body / d body-dark / l belly / p species accent
 *                j jersey (team primary) / h helmet (team secondary)
 *                w white / k eye / . empty
 */
(function () {
  "use strict";

  const SPECIES = {};

  // ---- QB: Troodon --------------------------------------------------------
  SPECIES.troodon = {
    body: ["#3aa06b", "#256b47", "#a8d9b0"], accent: "#e8d44d",
    frames: [
      [
        "................",
        "..........hhhh..",
        ".........hhhhhh.",
        ".........hbkkb..",
        "..........bbbb..",
        "..........bdb...",
        ".......jbbbb....",
        "...jjjjjjjbb....",
        ".ddjjjjjjjb.....",
        "dd..jjjjjb......",
        "....blllb.......",
        "....bb..bb......",
        "...bb....bb.....",
        "...b......b.....",
        "..db.......db...",
        "................",
      ],
      [
        "................",
        "..........hhhh..",
        ".........hhhhhh.",
        ".........hbkkb..",
        "..........bbbb..",
        "..........bdb...",
        ".......jbbbb....",
        "...jjjjjjjbb....",
        ".ddjjjjjjjb.....",
        "dd..jjjjjb......",
        "....blllb.......",
        ".....bb.bb......",
        "....bb...b......",
        ".....b..bb......",
        "....bd..bd......",
        "................",
      ],
    ],
  };

  // ---- RB: Carnotaurus ----------------------------------------------------
  SPECIES.carno = {
    body: ["#a8552e", "#6e341a", "#dba379"], accent: "#4a2412",
    frames: [
      [
        "................",
        ".........p..p...",
        ".........hhhh...",
        "........hhhhhh..",
        "........hbkbb...",
        ".........bbbbb..",
        ".........bdd....",
        "....jjjjbbbb....",
        "..jjjjjjjjbb....",
        ".ddjjjjjjjjb....",
        "dd..bllllbb.....",
        "....bbb.bb......",
        "...bbb...bb.....",
        "...bb.....bb....",
        "..dbb.....dbb...",
        "................",
      ],
      [
        "................",
        ".........p..p...",
        ".........hhhh...",
        "........hhhhhh..",
        "........hbkbb...",
        ".........bbbbb..",
        ".........bdd....",
        "....jjjjbbbb....",
        "..jjjjjjjjbb....",
        ".ddjjjjjjjjb....",
        "dd..bllllbb.....",
        "....bb.bbb......",
        "....bb...bb.....",
        ".....bb...b.....",
        "....dbb...bd....",
        "................",
      ],
    ],
  };

  // ---- FB: Pachycephalosaurus --------------------------------------------
  SPECIES.pachy = {
    body: ["#7c8a4a", "#525e2c", "#c2cf96"], accent: "#e3d7b8",
    frames: [
      [
        "................",
        ".........ppp....",
        "........pppppp..",
        "........hbkbb...",
        ".........bbbb...",
        ".........bdb....",
        "....jjjjbbb.....",
        "..jjjjjjjjb.....",
        ".ddjjjjjjjb.....",
        "dd..blllbb......",
        "....bbb.bb......",
        "....bb...bb.....",
        "....b.....b.....",
        "...db.....db....",
        "................",
        "................",
      ],
      [
        "................",
        ".........ppp....",
        "........pppppp..",
        "........hbkbb...",
        ".........bbbb...",
        ".........bdb....",
        "....jjjjbbb.....",
        "..jjjjjjjjb.....",
        ".ddjjjjjjjb.....",
        "dd..blllbb......",
        "....bb.bbb......",
        ".....bb..bb.....",
        ".....b....b.....",
        "....db....db....",
        "................",
        "................",
      ],
    ],
  };

  // ---- WR: Velociraptor ---------------------------------------------------
  SPECIES.veloci = {
    body: ["#3e9b4f", "#2a6e37", "#a8d97f"], accent: "#e07840",
    frames: [
      [
        "................",
        "..........hhhh..",
        ".........hhhhhh.",
        ".........hbkbb..",
        "..........bbbbb.",
        "..........bdb...",
        ".......jbbbb....",
        "..jjjjjjjjbb....",
        ".pdjjjjjjjjb....",
        "pd.jjjjjjjb.....",
        "....blllbb......",
        "....bb..bb......",
        "...bb....bb.....",
        "...b......bb....",
        "..db.......db...",
        "................",
      ],
      [
        "................",
        "..........hhhh..",
        ".........hhhhhh.",
        ".........hbkbb..",
        "..........bbbbb.",
        "..........bdb...",
        ".......jbbbb....",
        "..jjjjjjjjbb....",
        ".pdjjjjjjjjb....",
        "pd.jjjjjjjb.....",
        "....blllbb......",
        ".....bb.bb......",
        "....bb...b......",
        ".....b...bb.....",
        "....bd....bd....",
        "................",
      ],
    ],
  };

  // ---- TE: Deinocheirus (those arms) --------------------------------------
  SPECIES.deino = {
    body: ["#c98a3e", "#8a5a22", "#ecd3a3"], accent: "#f4f6f1",
    frames: [
      [
        "................",
        "..........hhhh..",
        ".........hhhhhh.",
        ".........hbkbbb.",
        "..........bbbbb.",
        "..........bdb...",
        ".....ddbbbb.....",
        "..jjjjjjjjbb....",
        ".ddjjjjjjjjbbb..",
        "dd.jjjjjjjb.pp..",
        "....blllbb......",
        "....bb..bb......",
        "...bb....bb.....",
        "...b......bb....",
        "..db.......db...",
        "................",
      ],
      [
        "................",
        "..........hhhh..",
        ".........hhhhhh.",
        ".........hbkbbb.",
        "..........bbbbb.",
        "..........bdb...",
        ".....ddbbbb.....",
        "..jjjjjjjjbb....",
        ".ddjjjjjjjjbbb..",
        "dd.jjjjjjjb.pp..",
        "....blllbb......",
        ".....bb.bb......",
        "....bb...b......",
        ".....b...bb.....",
        "....bd....bd....",
        "................",
      ],
    ],
  };

  // ---- OL: Triceratops ----------------------------------------------------
  SPECIES.trike = {
    body: ["#7a8a99", "#54616e", "#b9c6d2"], accent: "#e8e3d0",
    frames: [
      [
        "................",
        "...........pp...",
        "..........dpp...",
        ".......hhhdbb...",
        "......hhhhbbbp..",
        "..jjjjhhbbbkb...",
        ".jjjjjjjbbbb....",
        "djjjjjjjjbb.....",
        "ddjjjjjjjjb.....",
        ".dblllllbbb.....",
        "..bbb..bbb......",
        "..bb....bb......",
        "..bb....bb......",
        "..db....db......",
        "................",
        "................",
      ],
      [
        "................",
        "...........pp...",
        "..........dpp...",
        ".......hhhdbb...",
        "......hhhhbbbp..",
        "..jjjjhhbbbkb...",
        ".jjjjjjjbbbb....",
        "djjjjjjjjbb.....",
        "ddjjjjjjjjb.....",
        ".dblllllbbb.....",
        "..bbb..bbb......",
        "...bb..bb.......",
        "...bb..bb.......",
        "...bd..bd.......",
        "................",
        "................",
      ],
    ],
  };

  // ---- DT: Stegosaurus ----------------------------------------------------
  SPECIES.stego = {
    body: ["#5e7d4a", "#3d5530", "#a9c48d"], accent: "#d98f3e",
    frames: [
      [
        "................",
        ".....p...p......",
        "....ppp.ppp.....",
        "..p.ppppppp.....",
        ".ppdbbbbbbbb....",
        "p.dbbbbbbbbbhh..",
        ".ddjjjjjjjbbhbk.",
        ".djjjjjjjjjbbb..",
        ".dbllllllbbb....",
        "..bbb..bbb......",
        "..bb....bb......",
        "..bb....bb......",
        "..db....db......",
        "................",
        "................",
        "................",
      ],
      [
        "................",
        ".....p...p......",
        "....ppp.ppp.....",
        "..p.ppppppp.....",
        ".ppdbbbbbbbb....",
        "p.dbbbbbbbbbhh..",
        ".ddjjjjjjjbbhbk.",
        ".djjjjjjjjjbbb..",
        ".dbllllllbbb....",
        "..bbb..bbb......",
        "...bb..bb.......",
        "...bb..bb.......",
        "...bd..bd.......",
        "................",
        "................",
        "................",
      ],
    ],
  };

  // ---- EDGE: Allosaurus ---------------------------------------------------
  SPECIES.allo = {
    body: ["#b3703b", "#7a4620", "#e3b586"], accent: "#8a2f1d",
    frames: [
      [
        "................",
        ".........phhh...",
        "........hhhhhh..",
        "........hbkbbb..",
        ".........bbbbbb.",
        ".........bdwd...",
        ".........bb.....",
        "....jjjjbbbb....",
        "..jjjjjjjbbd....",
        ".ddjjjjjjjb.....",
        "dd..blllbb......",
        "....bbb.bb......",
        "...bbb...bb.....",
        "...bb.....bb....",
        "..dbb.....dbb...",
        "................",
      ],
      [
        "................",
        ".........phhh...",
        "........hhhhhh..",
        "........hbkbbb..",
        ".........bbbbbb.",
        ".........bdwd...",
        ".........bb.....",
        "....jjjjbbbb....",
        "..jjjjjjjbbd....",
        ".ddjjjjjjjb.....",
        "dd..blllbb......",
        "....bb.bbb......",
        "....bb...bb.....",
        ".....bb...b.....",
        "....dbb...bd....",
        "................",
      ],
    ],
  };

  // ---- LB: Spinosaurus (sail) ---------------------------------------------
  SPECIES.spino = {
    body: ["#3d7d85", "#265158", "#9cc8cd"], accent: "#d96a3e",
    frames: [
      [
        "................",
        "....ppp.........",
        "...ppppp........",
        "..ppppppp.hhhh..",
        "..ppppppphhhhhh.",
        "...bbbbbbhbkbbbb",
        "....jjjjbbbbdd..",
        "..jjjjjjjjbb....",
        ".ddjjjjjjjjb....",
        "dd.jjjjjjjb.....",
        "....blllbb......",
        "....bbb.bb......",
        "...bbb...bb.....",
        "...bb.....bb....",
        "..dbb.....dbb...",
        "................",
      ],
      [
        "................",
        "....ppp.........",
        "...ppppp........",
        "..ppppppp.hhhh..",
        "..ppppppphhhhhh.",
        "...bbbbbbhbkbbbb",
        "....jjjjbbbbdd..",
        "..jjjjjjjjbb....",
        ".ddjjjjjjjjb....",
        "dd.jjjjjjjb.....",
        "....blllbb......",
        "....bb.bbb......",
        "....bb...bb.....",
        ".....bb...b.....",
        "....dbb...bd....",
        "................",
      ],
    ],
  };

  // ---- CB: Deinonychus (sickle claw) --------------------------------------
  SPECIES.deinony = {
    body: ["#2f7d52", "#1d5236", "#8fc9a5"], accent: "#e8d44d",
    frames: [
      [
        "................",
        "..........hhhh..",
        ".........hhhhhh.",
        ".........hbkbb..",
        "..........bbbbb.",
        "..........bdb...",
        ".......jbbbb....",
        "..jjjjjjjjbb....",
        ".ddjjjjjjjjb....",
        "dd.jjjjjjjb.....",
        "....blllbb......",
        "....bb..bb......",
        "...bpb...bb.....",
        "...b......bpb...",
        "..db.......db...",
        "................",
      ],
      [
        "................",
        "..........hhhh..",
        ".........hhhhhh.",
        ".........hbkbb..",
        "..........bbbbb.",
        "..........bdb...",
        ".......jbbbb....",
        "..jjjjjjjjbb....",
        ".ddjjjjjjjjb....",
        "dd.jjjjjjjb.....",
        "....blllbb......",
        ".....bb.bb......",
        "....bpb..b......",
        ".....b...bpb....",
        "....bd....bd....",
        "................",
      ],
    ],
  };

  // ---- S: Quetzalcoatlus (frames 0-1 ground, 2-3 soaring) ------------------
  SPECIES.quetz = {
    body: ["#d9c9a3", "#a08c62", "#f2ead2"], accent: "#c94f3e",
    frames: [
      [
        "................",
        "..........pp....",
        ".........phhh...",
        ".........hhbbbbb",
        "..........bkb...",
        ".....dd...bb....",
        "....ddddjbb.....",
        "...ddjjjjbb.....",
        "..ddjjjjjbb.....",
        ".dd.jjjjbb......",
        "....bb..bb......",
        "....b....b......",
        "...db....db.....",
        "................",
        "................",
        "................",
      ],
      [
        "................",
        "..........pp....",
        ".........phhh...",
        ".........hhbbbbb",
        "..........bkb...",
        ".....dd...bb....",
        "....ddddjbb.....",
        "...ddjjjjbb.....",
        "..ddjjjjjbb.....",
        ".dd.jjjjbb......",
        "....bb..bb......",
        ".....b..b.......",
        "....bd..db......",
        "................",
        "................",
        "................",
      ],
      [
        "................",
        "..dd........dd..",
        "..ddd......ddd..",
        "...ddd....ddd...",
        "....dddjjddd....",
        "......jjjjpp....",
        ".....bbjjhhh....",
        "......bbbbbbbbb.",
        ".......bkb......",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
      ],
      [
        "................",
        "................",
        "................",
        "....ddd..ddd....",
        "..dddddjjddddd..",
        "..dd..jjjjpp.dd.",
        ".....bbjjhhh....",
        "......bbbbbbbbb.",
        ".......bkb......",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
        "................",
      ],
    ],
  };

  // ---- T-rex (rampage + ambient) ------------------------------------------
  SPECIES.trex = {
    body: ["#8a6f3c", "#5f4a24", "#cdb27a"], accent: "#f4f6f1",
    frames: [
      [
        "................",
        ".........hhhh...",
        "........hhhhhh..",
        "........hbkbbb..",
        ".........bbbbbb.",
        ".........bdwdw..",
        ".........bb.....",
        "....jjjjbbbb....",
        "..jjjjjjjbbw....",
        ".ddjjjjjjjb.....",
        "dd..blllbb......",
        "....bbb.bb......",
        "...bbb...bb.....",
        "...bb.....bb....",
        "..dbb.....dbb...",
        "................",
      ],
      [
        "................",
        ".........hhhh...",
        "........hhhhhh..",
        "........hbkbbb..",
        ".........bbbbbb.",
        ".........bdwdw..",
        ".........bb.....",
        "....jjjjbbbb....",
        "..jjjjjjjbbw....",
        ".ddjjjjjjjb.....",
        "dd..blllbb......",
        "....bb.bbb......",
        "....bb...bb.....",
        ".....bb...b.....",
        "....dbb...bd....",
        "................",
      ],
    ],
  };

  // ---- ambient flyer -------------------------------------------------------
  SPECIES.ptero = {
    body: ["#c98f4a", "#8f5f2a", "#e8c99a"], accent: "#8f5f2a",
    frames: [
      [
        "................",
        "..bb.......bb...",
        "..bbb.....bbb...",
        "...bbb...bbb....",
        "....bbbbbbb.....",
        "......bbbkbb....",
        ".......bb..bbb..",
        "................",
      ],
      [
        "................",
        "................",
        "................",
        "....bbbbbbb.....",
        "..bbbbbbbkbb....",
        "..bb...bb..bbb..",
        "................",
        "................",
      ],
    ],
  };

  // -------------------------------------------------------------------------
  function drawMap(ctx, map, pal, scale, ox, oy) {
    for (let y = 0; y < map.length; y++) {
      const row = map[y];
      for (let x = 0; x < row.length; x++) {
        const c = pal[row[x]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = false;
    return c;
  }

  function buildSpecies(spec, jersey, helmet, scale, rampage) {
    const [b, d, l] = spec.body;
    const pal = {
      b: rampage ? "#6d4520" : b,
      d: rampage ? "#452a10" : d,
      l: rampage ? "#b08d55" : l,
      p: rampage ? "#ff5533" : spec.accent,
      j: jersey, h: helmet,
      w: "#f4f6f1", k: rampage ? "#ff2222" : "#101010",
    };
    const wpx = Math.max(...spec.frames.map((f) => f[0].length)) * scale;
    const hpx = Math.max(...spec.frames.map((f) => f.length)) * scale;
    const out = { R: [], L: [], w: wpx, h: hpx, n: spec.frames.length };
    for (const map of spec.frames) {
      const cR = makeCanvas(wpx, hpx);
      drawMap(cR.getContext("2d"), map, pal, scale, 0, 0);
      out.R.push(cR);
      const cL = makeCanvas(wpx, hpx);
      const g = cL.getContext("2d");
      g.translate(wpx, 0); g.scale(-1, 1);
      g.drawImage(cR, 0, 0);
      out.L.push(cL);
    }
    return out;
  }

  const SPECIES_KEYS = ["troodon", "carno", "pachy", "veloci", "deino", "trike",
    "stego", "allo", "spino", "deinony", "quetz", "trex", "ptero"];

  function buildTeamSprites(jersey, helmet, scale) {
    scale = scale || 2;
    const out = {};
    for (const k of SPECIES_KEYS) out[k] = buildSpecies(SPECIES[k], jersey, helmet, scale);
    out.rampage = buildSpecies(SPECIES.trex, jersey, helmet, scale * 2, true);
    return out;
  }

  function buildBall(scale) {
    scale = scale || 2;
    const map = [
      "..nnnn..",
      ".nnwwnn.",
      "nnnwwnnn",
      ".nnwwnn.",
      "..nnnn..",
    ];
    const pal = { n: "#8a4a1f", w: "#f4f6f1" };
    const c = makeCanvas(8 * scale, 5 * scale);
    drawMap(c.getContext("2d"), map, pal, scale, 0, 0);
    return c;
  }

  // small snowball (for the crowd to throw)
  function buildSnowball(scale) {
    scale = scale || 2;
    const map = ["..ww..", ".wwww.", "wwwwlw", ".wwww.", "..ww.."];
    const pal = { w: "#f4f6f1", l: "#c9d4df" };
    const c = makeCanvas(6 * scale, 5 * scale);
    drawMap(c.getContext("2d"), map, pal, scale, 0, 0);
    return c;
  }

  window.DinoSprites = { buildTeamSprites, buildBall, buildSnowball, drawMap, makeCanvas, SPECIES_KEYS };
})();
