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
  // 4-FRAME WALK CYCLES + IDLE MAPS (load-time map authoring)
  // -------------------------------------------------------------------------
  // The shipped species maps carried two walk frames whose only difference
  // was the leg rows, so a stride flipped like a strobe instead of reading as
  // a gait.  At load, every grounded species is expanded to the classic
  // 4-beat cycle — contact-A / pass-up / contact-B / pass-down — with the
  // body bounce and tail sway BAKED INTO the maps themselves: the painted
  // pixels, the collision masks derived from them, and the renderer always
  // agree.  Every map keeps its original 16-column width and row count, so
  // buildSpecies yields identical w/h and the packs stay drop-in compatible.
  // Quetzalcoatlus is deliberately NOT expanded — its 2-ground + 2-flight
  // sheet layout is pinned by the soar contract — and the ambient ptero
  // keeps its simple 2-frame flap.
  function walkRowEmpty(row) { return !/[^.]/.test(row); }
  function walkBlankRow(map) { return ".".repeat(map[0].length); }
  function walkShiftUp(map) {
    // Pass-up frame: the whole body block rises one row into the blank top
    // row.  If a species has no blank headroom the art is left untouched.
    if (!walkRowEmpty(map[0])) return map;
    return map.slice(1).concat([walkBlankRow(map)]);
  }
  function walkShiftDown(map) {
    // Low-slung species (trike/stego/pachy) bob the other way, dropping into
    // their blank bottom rows instead.
    if (!walkRowEmpty(map[map.length - 1])) return map;
    return [walkBlankRow(map)].concat(map.slice(0, -1));
  }
  function walkTailTip(map, dy) {
    // The tail tip is the sprite's leftmost painted column; nudging only
    // that column gives the cycle a 1px tail sway (and the idle its breath
    // counter-sway) without disturbing the body block.
    const cells = map.map((row) => row.split(""));
    let tip = -1;
    for (let x = 0; x < cells[0].length && tip < 0; x++) {
      for (let y = 0; y < cells.length; y++) if (cells[y][x] !== ".") { tip = x; break; }
    }
    if (tip < 0) return map;
    const moved = [];
    for (let y = 0; y < cells.length; y++) {
      if (cells[y][tip] !== ".") { moved.push([y, cells[y][tip]]); cells[y][tip] = "."; }
    }
    for (const [y, glyph] of moved) {
      const ny = Math.max(0, Math.min(cells.length - 1, y + dy));
      cells[cells[ny][tip] === "." ? ny : y][tip] = glyph;
    }
    return cells.map((row) => row.join(""));
  }
  function walkMirrorLegs(map, legTop, legBottom) {
    // Contact-B: exchange the leg columns about the hip line so the opposite
    // stride leads.  The hip row itself is symmetric in every species map,
    // which keeps the mirrored legs socketed under the same belly pixels;
    // asymmetric detail (foot shading, sickle claws) genuinely swaps sides.
    const hip = map[legTop];
    let minX = Infinity, maxX = -1;
    for (let x = 0; x < hip.length; x++) {
      if (hip[x] !== ".") { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    }
    if (maxX < 0) return map;
    const axis = minX + maxX;
    const out = map.slice();
    for (let y = legTop; y <= legBottom; y++) {
      const row = map[y], mirrored = Array(row.length).fill(".");
      for (let x = 0; x < row.length; x++) {
        if (row[x] === ".") continue;
        const mx = axis - x;
        if (mx >= 0 && mx < row.length) mirrored[mx] = row[x];
      }
      out[y] = mirrored.join("");
    }
    return out;
  }
  function walkHeadNudge(map, cfg) {
    // On the pass frame the head leads the stride by 1px.  Species with a
    // clean, separate head block shift the whole block forward; sail/frill
    // species whose head rows share body pixels move only the eye, and the
    // guard below turns that into a no-op when the eye has no room.
    if (cfg.head) {
      const out = map.slice();
      for (let y = cfg.head[0]; y <= cfg.head[1]; y++) {
        const row = map[y];
        if (row[row.length - 1] === ".") out[y] = "." + row.slice(0, -1);
      }
      return out;
    }
    return map.map((row) => {
      const k = row.indexOf("k");
      if (k < 0 || k + 1 >= row.length || row[k + 1] === ".") return row;
      const swapped = row.split("");
      swapped[k] = swapped[k + 1]; swapped[k + 1] = "k";
      return swapped.join("");
    });
  }
  // legs: [top row, bottom row] of the stride pixels.  head: rows of a clean
  // head-only block (nudged 1px forward on the pass frame) — omitted for
  // species whose head rows share sail/frill/jersey pixels (eye nudge only).
  // bob: which blank rows absorb the pass-frame body shift.
  const WALK_EXPAND = {
    troodon: { legs: [11, 14], head: [1, 4], bob: "up" },
    carno:   { legs: [11, 14], head: [1, 5], bob: "up" },
    pachy:   { legs: [10, 13], head: [1, 4], bob: "down" },
    veloci:  { legs: [11, 14], head: [1, 4], bob: "up" },
    deino:   { legs: [11, 14], head: [1, 4], bob: "up" },
    trike:   { legs: [10, 13], bob: "down" },
    stego:   { legs: [9, 12], bob: "down" },
    allo:    { legs: [11, 14], head: [1, 5], bob: "up" },
    spino:   { legs: [11, 14], bob: "up" },
    deinony: { legs: [11, 14], head: [1, 4], bob: "up" },
    trex:    { legs: [11, 14], head: [1, 5], bob: "up" },
  };
  const IDLE_MAPS = {};
  function buildIdleMaps(stand, legTop) {
    // [stand, breath, blink].  The stand is the planted gathered stance; the
    // breath drops the chest/body block one row onto the planted hips (the
    // legs never move) and lifts the tail tip; the blink swaps the eye pixel
    // for body colour.  The gameplay selector uses this pack only while a
    // dino is standing still, so presnap formations breathe instead of
    // jittering their walk legs.
    const settled = [walkBlankRow(stand)];
    for (let y = 1; y < legTop; y++) settled.push(stand[y - 1]);
    const seam = stand[legTop].split("");
    const above = stand[legTop - 1];
    for (let x = 0; x < seam.length; x++) {
      if (seam[x] === "." && above[x] !== ".") seam[x] = above[x];
    }
    settled.push(seam.join(""));
    for (let y = legTop + 1; y < stand.length; y++) settled.push(stand[y]);
    return [stand, walkTailTip(settled, -1), stand.map((row) => row.replace(/k/g, "b"))];
  }
  for (const key of Object.keys(WALK_EXPAND)) {
    const cfg = WALK_EXPAND[key];
    const spec = SPECIES[key];
    const contactA = spec.frames[0], gathered = spec.frames[1];
    const nudged = walkHeadNudge(gathered, cfg);
    // Pass frames gather the legs (the original frame 1) and carry the bob:
    // body up one row with the tail tip leading an extra pixel, then back to
    // baseline with the tail tip dropped — a 2-beat bounce and tail sway.
    const passUp = cfg.bob === "up"
      ? walkTailTip(walkShiftUp(nudged), -1)
      : walkTailTip(nudged, -1);
    const contactB = walkMirrorLegs(contactA, cfg.legs[0], cfg.legs[1]);
    const passDown = cfg.bob === "up"
      ? walkTailTip(gathered, 1)
      : walkTailTip(walkShiftDown(gathered), 1);
    spec.frames = [contactA, passUp, contactB, passDown];
    IDLE_MAPS[key] = buildIdleMaps(gathered, cfg.legs[0]);
  }
  // The safety still gets an idle stance, authored read-only from its first
  // folded-wing ground frame's gathered sibling; quetz walk frames themselves
  // stay untouched.
  IDLE_MAPS.quetz = buildIdleMaps(SPECIES.quetz.frames[1], 10);

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
    // In addition to the canvas frames, retain a tiny opaque-pixel map for
    // collision QA.  The game uses this to reject a real painted-pixel
    // overlap after its normal torso physics pass—tails, horns, and wings are
    // therefore allowed to get close, but never ghost through another dino.
    const maskRows = (map) => {
      const rows = Array.from({ length: hpx }, () => []);
      for (let y = 0; y < map.length; y++) {
        const row = map[y];
        for (let x = 0; x < row.length; x++) {
          if (row[x] === ".") continue;
          for (let yy = 0; yy < scale; yy++) rows[y * scale + yy].push([x * scale, (x + 1) * scale]);
        }
      }
      return rows;
    };
    const mirrorRows = (rows) => rows.map((row) => row.map(([a, b]) => [wpx - b, wpx - a]).reverse());
    const out = { R: [], L: [], mask: { R: [], L: [] }, w: wpx, h: hpx, n: spec.frames.length };
    for (const map of spec.frames) {
      const cR = makeCanvas(wpx, hpx);
      const rctx = cR.getContext("2d");
      drawMap(rctx, map, pal, scale, 0, 0);
      out.R.push(cR);
      const cL = makeCanvas(wpx, hpx);
      const g = cL.getContext("2d");
      g.translate(wpx, 0); g.scale(-1, 1);
      g.drawImage(cR, 0, 0);
      out.L.push(cL);
      const rows = maskRows(map);
      out.mask.R.push({ w: wpx, h: hpx, rows });
      out.mask.L.push({ w: wpx, h: hpx, rows: mirrorRows(rows) });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // LEGACY FILM-CEL MODELS (unattached)
  // -------------------------------------------------------------------------
  // The original two-frame pose rig was a failed visual experiment: it
  // rotated an idle sprite and drew a rectangular arm on top.  The live game
  // now paints every cel from its own full-body silhouette.  These aren't
  // canvas transforms of an idle dino: head, helmet, tail, torso, both arms,
  // both legs, gloves, cleats, football and species marks are placed again in
  // every individual frame.  It is deliberately a sprite-animation system,
  // so a later imported raster sheet can use the exact same { R, L, n, w, h }
  // contract without changing any game logic. `buildTeamSprites` intentionally
  // exposes only the compact map actions below; these larger helpers are not
  // part of the live action API.
  function mirrorCanvas(src) {
    const c = makeCanvas(src.width, src.height);
    const g = c.getContext("2d");
    g.translate(src.width, 0); g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  const FILM_W = 26, FILM_H = 30;
  const INK = "#111827", MASK = "#718287", GLOVE = "#f4f6f1", CLEAT = "#090d13", BALL = "#8b461f", LACE = "#f5e7c7";

  function filmCanvas(scale) {
    const c = makeCanvas(FILM_W * scale, FILM_H * scale);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.scale(scale, scale);
    return { c, g };
  }
  function fr(g, x, y, w, h, fill) {
    if (w <= 0 || h <= 0) return;
    g.fillStyle = fill; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function line(g, x0, y0, x1, y1, thick, fill) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) | 0;
    const r = Math.max(0, Math.floor(thick / 2));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / steps);
      const y = Math.round(y0 + (y1 - y0) * i / steps);
      fr(g, x - r, y - r, thick, thick, fill);
    }
  }
  function poly(g, pts, fill) {
    g.fillStyle = fill; g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); g.fill();
  }
  function limb(g, a, b, c, width, fill, glove) {
    line(g, a[0], a[1], b[0], b[1], width + 2, INK);
    line(g, b[0], b[1], c[0], c[1], width + 2, INK);
    line(g, a[0], a[1], b[0], b[1], width, fill);
    line(g, b[0], b[1], c[0], c[1], width, fill);
    if (glove) {
      fr(g, c[0] - 1, c[1] - 1, 3, 3, INK);
      fr(g, c[0], c[1], 2, 2, GLOVE);
    }
  }
  function arm(g, a, b, c, pal, big) {
    const wide = big ? 4 : 3;
    // The sleeve and scaled forearm are separate shapes.  This is what keeps
    // a stiff-arm from reading as a single coloured bar.
    line(g, a[0], a[1], b[0], b[1], wide + 2, INK);
    line(g, b[0], b[1], c[0], c[1], Math.max(3, wide), INK);
    line(g, a[0], a[1], b[0], b[1], wide, pal.j);
    line(g, b[0], b[1], c[0], c[1], Math.max(1, wide - 1), pal.b);
    fr(g, b[0] - 1, b[1] - 1, 2, 2, pal.h); // elbow pad
    fr(g, c[0] - 1, c[1] - 1, 3, 3, INK);
    fr(g, c[0], c[1], 2, 2, GLOVE);
    // two fingers give the extended hand a clear football gesture
    fr(g, c[0] + 2, c[1], 1, 1, GLOVE); fr(g, c[0] + 1, c[1] + 2, 1, 1, GLOVE);
  }
  function leg(g, a, b, c, pal) {
    line(g, a[0], a[1], b[0], b[1], 5, INK);
    line(g, b[0], b[1], c[0], c[1], 4, INK);
    line(g, a[0], a[1], b[0], b[1], 3, pal.j);
    line(g, b[0], b[1], c[0], c[1], 2, pal.b);
    fr(g, b[0] - 1, b[1] - 1, 2, 2, pal.d);
    foot(g, c[0], c[1], 1);
  }
  function tail(g, x0, y0, x1, y1, pal, feather, bulk) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) | 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
      const s = (t < 0.28 ? 4 : t < 0.65 ? 3 : t < 0.88 ? 2 : 1) + (bulk || 0);
      fr(g, x - Math.ceil(s / 2) - 1, y - Math.ceil(s / 2) - 1, s + 2, s + 2, INK);
      fr(g, x - Math.floor(s / 2), y - Math.floor(s / 2), s, s, i % 3 ? pal.b : pal.l);
    }
    if (feather) { fr(g, x1 - 2, y1 - 2, 2, 1, pal.p); fr(g, x1 - 3, y1, 2, 1, pal.p); }
  }
  function foot(g, x, y, dir) {
    fr(g, x - 1, y - 1, 4, 3, INK);
    fr(g, x, y, 3, 2, CLEAT);
    fr(g, x + (dir >= 0 ? 3 : -1), y + 1, 2, 1, GLOVE);
  }
  function football(g, x, y) {
    fr(g, x - 2, y - 1, 5, 3, INK);
    fr(g, x - 1, y - 1, 3, 3, BALL);
    fr(g, x, y, 1, 1, LACE);
  }
  function profileOf(key) {
    // These are silhouette decisions, not colour flags. A player should read
    // as a pterosaur safety or triceratops lineman before the label does.
    const p = { brow: 0, horn: 0, sail: 0, plates: 0, beak: 0, feather: 0,
      dome: 0, arms: 0, bulk: 0, eye: 0, frill: 0, wing: 0, crest: 0, claw: 0 };
    if (key === "troodon") { p.brow = 1; p.eye = 1; p.crest = 1; }
    if (key === "carno") { p.horn = 1; p.bulk = 1; p.crest = 1; }
    if (key === "pachy") { p.dome = 1; p.bulk = 1; }
    if (key === "veloci") { p.feather = 1; p.claw = 1; }
    if (key === "deino") { p.arms = 1; p.bulk = 1; p.crest = 1; }
    if (key === "trike") { p.horn = 2; p.frill = 1; p.bulk = 2; }
    if (key === "stego") { p.plates = 1; p.bulk = 2; }
    if (key === "allo") { p.brow = 2; p.bulk = 1; }
    if (key === "spino") { p.sail = 1; p.bulk = 1; }
    if (key === "deinony") { p.feather = 1; p.claw = 1; p.brow = 1; }
    if (key === "quetz") { p.beak = 2; p.wing = 1; }
    if (key === "ptero") { p.beak = 1; p.wing = 1; p.crest = 1; }
    if (key === "trex" || key === "rampage") { p.brow = 2; p.arms = -1; p.bulk = 2; p.crest = 1; }
    return p;
  }
  function filmPalette(spec, jersey, helmet, rampage) {
    const [b, d, l] = spec.body;
    return {
      b: rampage ? "#6d4520" : b, d: rampage ? "#452a10" : d,
      l: rampage ? "#b08d55" : l, p: rampage ? "#ff5533" : spec.accent,
      j: jersey, h: helmet, w: GLOVE,
    };
  }
  // Each object is one intentionally authored keyframe.  The three points in
  // every limb are shoulder/hip, elbow/knee and hand/cleat.  No source sprite
  // is rotated or pasted into another pose.
  const FILM = {
    run: [
      { b:[14,14], h:[18,7], t:[4,17], a1:[[17,15],[20,17],[21,20]], a2:[[16,15],[14,17],[13,19]], l1:[[15,20],[13,24],[10,27]], l2:[[18,20],[20,24],[22,26]] },
      { b:[14,13], h:[18,6], t:[4,17], a1:[[17,14],[20,15],[21,18]], a2:[[16,14],[14,16],[13,17]], l1:[[15,19],[18,23],[21,27]], l2:[[18,19],[15,24],[12,25]] },
      { b:[14,14], h:[18,7], t:[3,18], a1:[[17,15],[19,18],[20,20]], a2:[[16,15],[13,16],[12,19]], l1:[[15,20],[12,24],[9,26]], l2:[[18,20],[21,23],[23,27]] },
      { b:[14,13], h:[18,6], t:[4,17], a1:[[17,14],[20,16],[22,17]], a2:[[16,14],[13,17],[12,18]], l1:[[15,19],[18,23],[22,25]], l2:[[18,19],[15,24],[11,27]] },
      { b:[14,14], h:[18,7], t:[3,17], a1:[[17,15],[20,17],[21,19]], a2:[[16,15],[14,18],[12,20]], l1:[[15,20],[13,24],[10,27]], l2:[[18,20],[20,24],[22,26]] },
      { b:[14,13], h:[18,6], t:[4,17], a1:[[17,14],[19,16],[21,17]], a2:[[16,14],[13,16],[12,18]], l1:[[15,19],[18,23],[21,27]], l2:[[18,19],[15,24],[12,25]] },
    ],
    dive: [
      { b:[14,15], h:[18,8], t:[4,18], a1:[[17,16],[20,15],[23,14]], a2:[[16,16],[18,13],[21,12]], l1:[[15,21],[12,24],[10,26]], l2:[[18,21],[19,24],[21,25]] },
      { b:[14,16], h:[19,9], t:[3,19], a1:[[17,16],[21,14],[24,13]], a2:[[16,16],[19,12],[22,11]], l1:[[15,21],[12,23],[9,24]], l2:[[18,21],[20,23],[22,24]] },
      { b:[14,18], h:[19,11], t:[3,20], a1:[[17,18],[21,16],[24,15]], a2:[[16,18],[19,15],[22,14]], l1:[[15,22],[11,23],[8,23]], l2:[[18,22],[20,23],[23,23]] },
      { b:[13,20], h:[18,13], t:[2,22], a1:[[16,20],[20,18],[24,18]], a2:[[15,20],[19,18],[23,17]], l1:[[14,23],[10,24],[7,24]], l2:[[17,23],[21,24],[23,24]] },
      { b:[13,21], h:[18,15], t:[2,23], a1:[[16,21],[20,20],[23,20]], a2:[[15,21],[19,20],[22,19]], l1:[[14,24],[10,25],[7,25]], l2:[[17,24],[20,25],[23,25]] },
      { b:[13,22], h:[18,17], t:[2,24], a1:[[16,22],[19,22],[22,22]], a2:[[15,22],[18,22],[21,21]], l1:[[14,25],[11,26],[8,26]], l2:[[17,25],[20,26],[23,26]] },
    ],
    catch: [
      { b:[14,15], h:[18,8], t:[4,18], a1:[[17,15],[19,11],[21,8]], a2:[[16,15],[18,11],[20,8]], l1:[[15,21],[13,24],[11,27]], l2:[[18,21],[20,24],[22,26]], ball:[21,7] },
      { b:[14,14], h:[18,7], t:[4,18], a1:[[17,14],[20,10],[22,7]], a2:[[16,14],[18,10],[21,7]], l1:[[15,20],[12,24],[10,26]], l2:[[18,20],[21,23],[23,26]], ball:[22,6] },
      { b:[14,15], h:[18,8], t:[3,18], a1:[[17,15],[21,11],[23,9]], a2:[[16,15],[19,10],[22,9]], l1:[[15,21],[12,25],[9,26]], l2:[[18,21],[21,24],[24,26]], ball:[23,8] },
      { b:[14,17], h:[18,10], t:[3,20], a1:[[17,17],[20,14],[22,13]], a2:[[16,17],[19,14],[21,13]], l1:[[15,23],[12,25],[9,26]], l2:[[18,23],[21,25],[23,26]], ball:[21,13] },
      { b:[14,19], h:[18,12], t:[3,21], a1:[[17,19],[20,17],[21,16]], a2:[[16,19],[19,17],[21,16]], l1:[[15,24],[12,26],[10,27]], l2:[[18,24],[20,26],[22,27]], ball:[20,16] },
      { b:[14,20], h:[18,13], t:[3,22], a1:[[17,20],[19,19],[20,19]], a2:[[16,20],[18,19],[20,19]], l1:[[15,25],[12,27],[10,28]], l2:[[18,25],[21,27],[23,28]], ball:[19,19] },
    ],
    stiff: [
      { b:[13,14], h:[17,7], t:[3,18], a1:[[16,15],[20,15],[23,15]], a2:[[15,15],[13,17],[12,19]], l1:[[14,20],[12,24],[10,27]], l2:[[17,20],[19,24],[21,27]], ball:[18,17] },
      { b:[13,14], h:[17,7], t:[3,18], a1:[[16,15],[21,14],[24,14]], a2:[[15,15],[13,18],[12,20]], l1:[[14,20],[11,24],[9,27]], l2:[[17,20],[18,24],[20,27]], ball:[18,17] },
      { b:[12,15], h:[16,8], t:[2,19], a1:[[15,16],[20,15],[24,15]], a2:[[14,16],[12,18],[11,21]], l1:[[13,21],[10,25],[8,27]], l2:[[16,21],[18,25],[20,27]], ball:[17,18] },
      { b:[12,15], h:[16,8], t:[2,19], a1:[[15,16],[20,16],[23,16]], a2:[[14,16],[12,19],[11,20]], l1:[[13,21],[10,25],[8,27]], l2:[[16,21],[18,25],[20,27]], ball:[17,18] },
      { b:[13,14], h:[17,7], t:[3,18], a1:[[16,15],[21,15],[24,15]], a2:[[15,15],[13,18],[12,20]], l1:[[14,20],[11,24],[9,27]], l2:[[17,20],[19,24],[21,27]], ball:[18,17] },
      { b:[13,14], h:[17,7], t:[3,18], a1:[[16,15],[20,15],[23,15]], a2:[[15,15],[13,17],[12,19]], l1:[[14,20],[12,24],[10,27]], l2:[[17,20],[19,24],[21,27]], ball:[18,17] },
    ],
    celebrate: [
      { b:[14,15], h:[18,8], t:[4,18], a1:[[17,15],[18,10],[18,6]], a2:[[16,15],[14,10],[14,7]], l1:[[15,21],[13,24],[12,27]], l2:[[18,21],[20,24],[21,27]] },
      { b:[14,13], h:[18,6], t:[4,17], a1:[[17,13],[19,8],[19,4]], a2:[[16,13],[13,8],[13,4]], l1:[[15,19],[13,22],[12,25]], l2:[[18,19],[20,22],[21,25]] },
      { b:[14,11], h:[18,4], t:[4,15], a1:[[17,11],[20,6],[20,2]], a2:[[16,11],[12,6],[12,2]], l1:[[15,17],[13,20],[12,23]], l2:[[18,17],[20,20],[21,23]] },
      { b:[14,10], h:[18,3], t:[4,14], a1:[[17,10],[20,5],[20,1]], a2:[[16,10],[12,5],[12,1]], l1:[[15,16],[13,19],[12,22]], l2:[[18,16],[20,19],[21,22]] },
      { b:[14,12], h:[18,5], t:[4,16], a1:[[17,12],[20,7],[20,3]], a2:[[16,12],[12,7],[12,3]], l1:[[15,18],[13,21],[12,24]], l2:[[18,18],[20,21],[21,24]] },
      { b:[14,14], h:[18,7], t:[4,18], a1:[[17,14],[19,9],[19,5]], a2:[[16,14],[13,9],[13,5]], l1:[[15,20],[13,23],[12,26]], l2:[[18,20],[20,23],[21,26]] },
    ],
    tackle: [
      { b:[14,15], h:[18,8], t:[4,18], a1:[[17,15],[20,16],[23,17]], a2:[[16,15],[19,17],[22,18]], l1:[[15,21],[12,24],[10,26]], l2:[[18,21],[20,24],[22,26]] },
      { b:[14,17], h:[19,10], t:[3,20], a1:[[17,17],[21,18],[24,19]], a2:[[16,17],[20,19],[23,20]], l1:[[15,22],[12,24],[9,25]], l2:[[18,22],[20,24],[23,25]] },
      { b:[13,19], h:[18,12], t:[2,22], a1:[[16,19],[20,20],[24,21]], a2:[[15,19],[19,21],[23,22]], l1:[[14,23],[11,24],[8,24]], l2:[[17,23],[20,24],[23,24]] },
      { b:[13,21], h:[18,15], t:[2,24], a1:[[16,21],[20,22],[23,22]], a2:[[15,21],[19,22],[22,23]], l1:[[14,25],[10,26],[7,26]], l2:[[17,25],[20,26],[23,26]] },
      { b:[13,22], h:[18,17], t:[2,24], a1:[[16,22],[19,23],[22,23]], a2:[[15,22],[18,23],[21,24]], l1:[[14,26],[10,27],[7,27]], l2:[[17,26],[20,27],[23,27]] },
      { b:[13,22], h:[18,18], t:[2,24], a1:[[16,22],[19,23],[21,23]], a2:[[15,22],[18,23],[20,24]], l1:[[14,26],[11,27],[8,27]], l2:[[17,26],[20,27],[23,27]] },
    ],
  };
  // Catch height is gameplay-facing rather than cosmetic.  Both tracks are
  // painted from their own body/limb positions; no cel is skewed or rotated
  // after the fact.  High lobs extend above the helmet, while low/bullet
  // throws scoop in front of the chest before the landing frames.
  FILM.catchHigh = FILM.catch;
  FILM.catchLow = [
    { b:[14,16], h:[18,9], t:[4,19], a1:[[17,16],[20,17],[22,18]], a2:[[16,16],[18,17],[21,18]], l1:[[15,22],[13,25],[11,27]], l2:[[18,22],[20,25],[22,27]], ball:[22,18] },
    { b:[14,17], h:[18,10], t:[4,20], a1:[[17,17],[21,18],[23,19]], a2:[[16,17],[19,18],[22,19]], l1:[[15,23],[12,25],[10,27]], l2:[[18,23],[21,25],[23,27]], ball:[23,19] },
    { b:[14,18], h:[18,11], t:[3,21], a1:[[17,18],[21,19],[24,20]], a2:[[16,18],[19,19],[23,20]], l1:[[15,24],[12,26],[9,27]], l2:[[18,24],[21,26],[24,27]], ball:[24,20] },
    { b:[13,20], h:[18,13], t:[2,23], a1:[[16,20],[20,21],[23,21]], a2:[[15,20],[19,21],[22,22]], l1:[[14,25],[11,27],[8,27]], l2:[[17,25],[20,27],[23,27]], ball:[22,21] },
    { b:[13,21], h:[18,15], t:[2,24], a1:[[16,21],[19,22],[21,22]], a2:[[15,21],[18,22],[20,22]], l1:[[14,26],[11,27],[8,27]], l2:[[17,26],[20,27],[23,27]], ball:[20,22] },
    { b:[13,22], h:[18,17], t:[2,24], a1:[[16,22],[19,23],[20,23]], a2:[[15,22],[18,23],[20,23]], l1:[[14,26],[11,28],[8,28]], l2:[[17,26],[20,28],[23,28]], ball:[19,23] },
  ];
  // The ball carrier has a separate takedown track. It falls backward and
  // covers the football rather than borrowing the tackler's forward dive.
  FILM.tackled = [
    { b:[14,14], h:[18,7], t:[4,18], a1:[[17,15],[20,16],[22,18]], a2:[[16,15],[14,17],[12,19]], l1:[[15,20],[13,24],[10,27]], l2:[[18,20],[20,24],[22,26]], ball:[18,17] },
    { b:[13,15], h:[17,8], t:[3,19], a1:[[16,16],[20,18],[21,20]], a2:[[15,16],[13,19],[11,20]], l1:[[14,21],[11,24],[8,26]], l2:[[17,21],[20,24],[23,25]], ball:[17,18] },
    { b:[12,17], h:[16,11], t:[2,21], a1:[[15,18],[18,20],[20,22]], a2:[[14,18],[12,20],[10,21]], l1:[[13,22],[9,24],[6,24]], l2:[[16,22],[20,24],[23,24]], ball:[16,20] },
    { b:[11,20], h:[15,15], t:[1,23], a1:[[14,21],[17,22],[19,23]], a2:[[13,21],[10,22],[8,22]], l1:[[12,24],[8,25],[5,25]], l2:[[15,24],[19,25],[22,25]], ball:[15,22] },
    { b:[11,22], h:[15,18], t:[1,24], a1:[[14,23],[17,24],[19,24]], a2:[[13,23],[10,24],[8,24]], l1:[[12,25],[8,26],[5,26]], l2:[[15,25],[19,26],[22,26]], ball:[15,24] },
    { b:[11,22], h:[15,19], t:[1,24], a1:[[14,23],[17,24],[18,24]], a2:[[13,23],[10,24],[8,24]], l1:[[12,25],[8,26],[5,26]], l2:[[15,25],[19,26],[22,26]], ball:[15,24] },
  ];
  // Same physical fall without a ball: used by the defender who loses a
  // stiff-arm contest. It stays a complete painted body track, not a slide
  // or a rectangle pushed away from the carrier.
  FILM.shoved = FILM.tackled.map((f) => ({
    b: f.b, h: f.h, t: f.t, a1: f.a1, a2: f.a2, l1: f.l1, l2: f.l2,
  }));
  // A compact quarterback release: load the arm, step, release, then a real
  // follow-through. The football is painted in the hand only before release.
  FILM.throw = [
    { b:[14,14], h:[18,7], t:[4,18], a1:[[17,15],[13,12],[10,11]], a2:[[16,15],[18,17],[20,18]], l1:[[15,20],[13,24],[10,27]], l2:[[18,20],[20,24],[22,26]], ball:[10,11] },
    { b:[14,14], h:[18,7], t:[4,18], a1:[[17,15],[14,10],[12,8]], a2:[[16,15],[18,17],[20,18]], l1:[[15,20],[13,24],[10,27]], l2:[[18,20],[20,24],[22,26]], ball:[12,8] },
    { b:[14,13], h:[18,6], t:[4,17], a1:[[17,14],[18,10],[20,9]], a2:[[16,14],[18,16],[20,17]], l1:[[15,19],[17,23],[20,26]], l2:[[18,19],[15,24],[12,26]], ball:[20,9] },
    { b:[14,13], h:[18,6], t:[3,17], a1:[[17,14],[21,12],[24,13]], a2:[[16,14],[18,16],[20,17]], l1:[[15,19],[17,23],[21,26]], l2:[[18,19],[15,24],[11,26]] },
    { b:[14,14], h:[18,7], t:[3,18], a1:[[17,15],[21,15],[24,17]], a2:[[16,15],[18,17],[20,18]], l1:[[15,20],[13,24],[10,27]], l2:[[18,20],[20,24],[22,26]] },
    { b:[14,14], h:[18,7], t:[4,18], a1:[[17,15],[20,17],[22,19]], a2:[[16,15],[14,17],[12,19]], l1:[[15,20],[13,24],[10,27]], l2:[[18,20],[20,24],[22,26]] },
  ];

  function drawDinoCel(g, f, pal, profile, action) {
    const bx = f.b[0], by = f.b[1], hx = f.h[0], hy = f.h[1];
    // Tail goes down first so the torso overlaps it. Its taper is painted
    // segment-by-segment: a silhouette, not a long flat limb.
    tail(g, bx - 2, by + 4, f.t[0], f.t[1], pal, profile.feather, profile.bulk > 1 ? 1 : 0);
    // Feathered raptors get a short, visible fan along the tail root. It
    // survives a two-pixel field scale, unlike a colour-only tail tip.
    if (profile.feather) {
      for (let i = 0; i < 3; i++) {
        const fx = bx - 5 - i * 2, fy = by + 3 - (i % 2 ? 2 : 0);
        fr(g, fx - 1, fy - 1, 3, 3, INK); fr(g, fx, fy - 1, 2, 2, pal.p);
      }
    }
    // Pterosaurs get folded, articulated wings rather than a generic dino
    // body with a beak pasted on.
    if (profile.wing) {
      poly(g, [[bx - 1, by + 2], [bx - 9, by - 7], [bx - 12, by + 2], [bx - 8, by + 9], [bx - 2, by + 7]], INK);
      poly(g, [[bx - 2, by + 3], [bx - 8, by - 4], [bx - 10, by + 2], [bx - 7, by + 7], [bx - 2, by + 6]], pal.b);
      line(g, bx - 2, by + 3, bx - 9, by + 2, 1, pal.p);
    }
    if (profile.plates || profile.sail) {
      const count = profile.sail ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const tall = profile.sail ? 8 + (i % 2) * 2 : 5 + (i % 2);
        const px = bx - 2 - i * 2, py = by - 1 - tall;
        poly(g, [[px - 2, by + 1], [px, py], [px + 2, by + 1]], INK);
        poly(g, [[px - 1, by], [px, py + 1], [px + 1, by]], pal.p);
      }
    }
    // Legs are under the shoulder pads: planted cleats read as weight and
    // give every contact frame a different centre of gravity.
    leg(g, f.l1[0], f.l1[1], f.l1[2], pal);
    leg(g, f.l2[0], f.l2[1], f.l2[2], pal);
    // A shaped torso, independent sleeve colours and chest markings sell a
    // football uniform rather than a flat shirt rectangle.
    const bodyWide = profile.bulk || 0;
    poly(g, [[bx - 4 - bodyWide, by + 1], [bx - 2 - bodyWide, by - 1], [bx + 4 + bodyWide, by], [bx + 6 + bodyWide, by + 3], [bx + 4 + bodyWide, by + 9], [bx - 2 - bodyWide, by + 9], [bx - 4 - bodyWide, by + 6]], INK);
    poly(g, [[bx - 3 - bodyWide, by + 2], [bx - 1 - bodyWide, by], [bx + 3 + bodyWide, by + 1], [bx + 5 + bodyWide, by + 3], [bx + 3 + bodyWide, by + 8], [bx - 1 - bodyWide, by + 8], [bx - 3 - bodyWide, by + 6]], pal.j);
    fr(g, bx - 2 - bodyWide, by + 1, 6 + bodyWide * 2, 2, pal.h); // shoulder yoke
    fr(g, bx - 1 - bodyWide, by + 4, 4 + bodyWide * 2, 1, pal.w); // chest stripe
    fr(g, bx + 1, by + 5, 1, 2, pal.w);       // readable jersey number
    fr(g, bx + 2, by + 5, 1, 1, pal.h);
    fr(g, bx - 3 - bodyWide, by + 2, 1, 4, pal.d); // shaded far side
    // Arms: two full, outlined bends; the front arm owns the glove/catch.
    arm(g, f.a2[0], f.a2[1], f.a2[2], pal, profile.arms);
    arm(g, f.a1[0], f.a1[1], f.a1[2], pal, profile.arms);
    // Neck, helmet, eye, tooth line, chinstrap and facemask.
    if (profile.frill) {
      poly(g, [[hx - 6, hy - 2], [hx - 4, hy - 6], [hx - 1, hy - 5], [hx + 1, hy + 3], [hx - 4, hy + 6]], INK);
      poly(g, [[hx - 5, hy - 1], [hx - 3, hy - 4], [hx - 1, hy - 3], [hx, hy + 2], [hx - 3, hy + 4]], pal.p);
    }
    fr(g, hx - 3, hy + 5, 5, 4, INK); fr(g, hx - 2, hy + 5, 4, 3, pal.b);
    poly(g, [[hx - 4, hy + 4], [hx - 4, hy - 1], [hx - 2, hy - 3], [hx + 3, hy - 2], [hx + 5, hy + 1], [hx + 4, hy + 5]], INK);
    poly(g, [[hx - 3, hy + 3], [hx - 3, hy], [hx - 1, hy - 2], [hx + 2, hy - 1], [hx + 4, hy + 1], [hx + 3, hy + 3]], pal.h);
    // The helmet reads as a real hard shell, with a small stripe and visor;
    // the cage is deliberately broken into bars rather than a white line that
    // could be mistaken for an outstretched arm at field scale.
    fr(g, hx - 1, hy, 2, 1, "#d9ecff"); // helmet shine
    fr(g, hx, hy - 1, 1, 3, pal.p);       // team helmet stripe
    fr(g, hx - 2, hy + 3, 8 + profile.beak * 2, 4, INK);
    fr(g, hx - 1, hy + 3, 6 + profile.beak * 2, 2, pal.b);
    fr(g, hx - 1, hy + 5, 5 + profile.beak * 2, 1, pal.d); // jaw shadow
    fr(g, hx + 1, hy + 3, profile.eye ? 2 : 1, profile.eye ? 2 : 1, pal.w);
    fr(g, hx + 2, hy + 3, 1, 1, INK);
    fr(g, hx + 4, hy + 4, 2 + profile.beak, 1, pal.l); // tooth/muzzle highlight
    fr(g, hx + 3, hy + 4, 1, 3, MASK); // compact three-bar facemask
    fr(g, hx + 4, hy + 6, 2 + profile.beak, 1, MASK);
    fr(g, hx + 6 + profile.beak, hy + 5, 1, 2, MASK);
    if (profile.horn) {
      poly(g, [[hx - 3, hy - 2], [hx - 4, hy - 8], [hx, hy - 2]], INK);
      poly(g, [[hx - 3, hy - 2], [hx - 3, hy - 6], [hx - 1, hy - 2]], pal.p);
      if (profile.horn > 1) {
        poly(g, [[hx + 2, hy + 2], [hx + 9, hy], [hx + 4, hy + 4]], INK);
        poly(g, [[hx + 3, hy + 2], [hx + 7, hy + 1], [hx + 4, hy + 3]], pal.p);
      }
    }
    if (profile.dome) { fr(g, hx - 4, hy - 5, 7, 4, INK); fr(g, hx - 3, hy - 5, 5, 3, pal.p); fr(g, hx - 2, hy - 4, 2, 1, pal.l); }
    if (profile.brow) { fr(g, hx - 1, hy + 1, 4, 1, pal.p); }
    if (profile.beak) { fr(g, hx + 4, hy + 2, 4 + profile.beak, 2, INK); fr(g, hx + 5, hy + 2, 3 + profile.beak, 1, pal.p); }
    if (profile.crest) { poly(g, [[hx - 4, hy - 2], [hx - 5, hy - 7], [hx - 1, hy - 2]], INK); poly(g, [[hx - 4, hy - 3], [hx - 4, hy - 6], [hx - 2, hy - 3]], pal.p); }
    if (profile.claw) { fr(g, f.l2[2][0] + 2, f.l2[2][1] - 1, 3, 1, pal.p); }
    if (f.ball) football(g, f.ball[0], f.ball[1]);
    // celebration needs a distinct visual payoff instead of a HUD callout.
    if (action === "celebrate") {
      fr(g, bx + 2, by + 5, 2, 1, "#ffd23f");
      fr(g, hx - 5, hy - 4, 1, 1, "#ffd23f"); fr(g, hx + 5, hy - 5, 1, 1, "#ffd23f");
    }
  }
  function filmCel(spec, jersey, helmet, key, action, fi, scale, rampage) {
    const { c, g } = filmCanvas(scale);
    const f = (FILM[action] || FILM.run)[fi % (FILM[action] || FILM.run).length];
    drawDinoCel(g, f, filmPalette(spec, jersey, helmet, rampage), profileOf(key), action);
    return c;
  }
  function filmPack(spec, jersey, helmet, key, action, scale, rampage) {
    const frames = FILM[action] || FILM.run;
    const R = frames.map((_, i) => filmCel(spec, jersey, helmet, key, action, i, scale, rampage));
    return { R, L: R.map(mirrorCanvas), w: R[0].width, h: R[0].height, n: R.length };
  }

  // -------------------------------------------------------------------------
  // COMPACT ACTION MAPS
  // -------------------------------------------------------------------------
  // Action art deliberately starts from each species' original 16x16 map.
  // It keeps the same scale, palette, horns/plates/sails/tails and masks as
  // the running sprite; no enlarged generic body or canvas rotation is used.
  const COMPACT_ACTION_KEYS = [
    "dive", "tackle", "tackled", "prone", "catchHigh", "catchLow",
    "catch", "diveCatch", "throw", "celebrate", "stiff", "shoved", "getup",
  ];
  const ACTION_GLYPH_PRIORITY = { ".": 0, d: 1, b: 2, l: 3, j: 4, h: 5, p: 6, w: 7, k: 8 };

  function actionCells(map) {
    const w = Math.max.apply(null, map.map((row) => row.length));
    return map.map((row) => row.padEnd(w, ".").split(""));
  }
  function actionRows(cells) { return cells.map((row) => row.join("")); }
  function actionBlank(w, h) { return Array.from({ length: h }, () => Array(w).fill(".")); }
  function actionBounds(cells, glyphs) {
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) {
      const ch = cells[y][x];
      if (ch === "." || (glyphs && glyphs.indexOf(ch) < 0)) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return maxX < 0 ? null : { minX, minY, maxX, maxY };
  }
  function actionMark(cells, glyphs, right) {
    let found = null;
    for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) {
      if (glyphs.indexOf(cells[y][x]) < 0) continue;
      if (!found || (right ? x > found.x : x < found.x)) found = { x, y };
    }
    return found;
  }
  function actionRig(cells, key) {
    const all = actionBounds(cells) || { minX: 0, minY: 0, maxX: cells[0].length - 1, maxY: cells.length - 1 };
    const torso = actionBounds(cells, "j") || all;
    const eye = actionMark(cells, "k", true);
    const head = eye || { x: Math.min(cells[0].length - 2, torso.maxX + 2), y: torso.minY + 1 };
    const shoulderY = Math.max(1, Math.min(cells.length - 3, torso.minY + 2));
    return {
      key, w: cells[0].length, h: cells.length, all, torso, head, profile: profileOf(key),
      frontShoulder: { x: Math.min(cells[0].length - 2, torso.maxX), y: shoulderY },
      backShoulder: { x: Math.max(1, torso.minX + 1), y: shoulderY + 1 },
    };
  }
  function actionPut(cells, x, y, glyph, force) {
    x = Math.round(x); y = Math.round(y);
    if (y < 0 || y >= cells.length || x < 0 || x >= cells[0].length) return;
    const old = cells[y][x];
    if (old === "k" && glyph !== "k") return; // eyes never disappear under an arm.
    if (force || old === "." || (ACTION_GLYPH_PRIORITY[glyph] || 1) >= (ACTION_GLYPH_PRIORITY[old] || 1)) cells[y][x] = glyph;
  }
  function actionLine(cells, a, b, glyph) {
    let x0 = Math.round(a.x), y0 = Math.round(a.y), x1 = Math.round(b.x), y1 = Math.round(b.y);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      actionPut(cells, x0, y0, glyph, true);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function actionRemap(cells, mapPoint) {
    const out = actionBlank(cells[0].length, cells.length);
    for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) {
      const glyph = cells[y][x];
      if (glyph === ".") continue;
      const p = mapPoint(x, y);
      actionPut(out, p.x, p.y, glyph, false);
    }
    return out;
  }
  function actionShift(cells, dx, dy) { return actionRemap(cells, (x, y) => ({ x: x + dx, y: y + dy })); }
  function actionLean(cells, rig, amount) {
    const span = Math.max(1, rig.torso.maxY - rig.all.minY + 3);
    return actionRemap(cells, (x, y) => {
      const weight = Math.max(0, Math.min(1, (rig.torso.maxY + 1 - y) / span));
      return { x: x + Math.round(amount * weight), y };
    });
  }
  // Tackles are driven by a dino's head, neck and shoulder mass.  The older
  // action rig flattened the entire map before drawing a pair of white-ended
  // "arms" on top; at 16px that read as both a pancake body and human hands.
  // These helpers deliberately preserve the original vertical body volume and
  // only pitch it over its planted hips, then redraw short dinosaur legs or a
  // compact claw using body colours.  They are map edits rather than canvas
  // transforms, so the collision mask remains exactly what is painted.
  function actionPitchForward(cells, rig, amount, settle) {
    const pivotX = Math.round((rig.torso.minX * 2 + rig.torso.maxX) / 3);
    const settleY = settle || 0;
    return actionRemap(cells, (x, y) => ({
      x,
      // A right-facing head moves down toward the turf while the tail rises
      // slightly behind it.  This is a physical pitch, not a vertical squash.
      y: y + Math.round((x - pivotX) * amount) + settleY,
    }));
  }
  function actionLeadWithHead(cells, rig, drop) {
    // A dinosaur dives with its head and neck driving below the shoulders.
    // The source maps keep the skull tall above the jersey, so a pure whole-
    // body pitch is too subtle at 16px.  This targeted, non-scaling shift
    // brings the snout down into a believable shoulder-first line.
    const neckX = Math.max(rig.torso.minX + 2, rig.head.x - 3);
    const span = Math.max(1, rig.w - 1 - neckX);
    return actionRemap(cells, (x, y) => {
      const headWeight = Math.max(0, Math.min(1, (x - neckX) / span));
      const neckWeight = y <= rig.frontShoulder.y + 2 && x >= neckX - 1 ? 0.55 : 0;
      return { x, y: y + Math.round(drop * Math.max(headWeight, neckWeight)) };
    });
  }
  function actionClearHindLegs(cells, rig) {
    // Keep the belly and tail intact; only remove the dangling lower-leg
    // pixels before redrawing a bent pair.  This avoids a compressed block at
    // the ground line when a player hits the turf.
    const fromY = Math.min(rig.h - 1, rig.torso.maxY + 2);
    const fromX = Math.max(0, rig.torso.minX + 1);
    const toX = Math.min(rig.w - 1, rig.torso.maxX + 1);
    for (let y = fromY; y < rig.h; y++) for (let x = fromX; x <= toX; x++) {
      if ("bdlp".indexOf(cells[y][x]) >= 0) cells[y][x] = ".";
    }
    return cells;
  }
  function actionDinoLimb(cells, hip, knee, claw) {
    // Body-colour limb and dark claw: never a jersey sleeve or a white glove.
    actionLine(cells, hip, knee, "b");
    actionLine(cells, knee, claw, "d");
    actionPut(cells, claw.x, claw.y, "d", true);
  }
  function actionTuckHindLegs(cells, rig, mode) {
    const floor = Math.min(rig.h - 2, rig.torso.maxY + (mode === "dive" ? 2 : 3));
    const rearHip = actionClamp(rig, rig.torso.minX + 2, rig.torso.maxY);
    const nearHip = actionClamp(rig, rig.torso.maxX - 2, rig.torso.maxY);
    if (mode === "dive") {
      // A launched dino tucks its feet back, leaving a clear, horizontal
      // body silhouette instead of standing upright while "diving".
      actionDinoLimb(cells, rearHip,
        actionClamp(rig, rearHip.x - 2, floor - 1),
        actionClamp(rig, rearHip.x - 4, floor - 1));
      actionDinoLimb(cells, nearHip,
        actionClamp(rig, nearHip.x - 2, floor),
        actionClamp(rig, nearHip.x - 4, floor));
    } else {
      // On a side fall the knees fold underneath the belly rather than being
      // erased into a flat rectangle.  The two claws remain distinct.
      actionDinoLimb(cells, rearHip,
        actionClamp(rig, rearHip.x - 1, floor - 1),
        actionClamp(rig, rearHip.x + 1, floor));
      actionDinoLimb(cells, nearHip,
        actionClamp(rig, nearHip.x - 2, floor),
        actionClamp(rig, nearHip.x, floor + 1));
    }
    return cells;
  }
  function actionCompactTackleLegs(cells, rig, mode) {
    // The tackle uses a deliberately tight pair of hind legs. The more
    // expressive catch-dive helper above can throw a claw out to either edge
    // of a 16px cel; in a two-dino tackle that reads as loose debris rather
    // than a body driving through contact. Keep both legs tucked under the
    // original belly silhouette instead.
    // Keep every claw above the canvas floor and clustered under the hips.
    // Wide trikes and long-tailed raptors otherwise produce two isolated
    // corner pixels that look like palette debris in a GIF.
    const hipY = Math.min(rig.h - 4, rig.torso.maxY + 1);
    const hipX = Math.round((rig.torso.minX + rig.torso.maxX) / 2);
    const rearHip = actionClamp(rig, hipX - 1, hipY);
    const nearHip = actionClamp(rig, hipX + 1, hipY);
    if (mode === "dive") {
      actionDinoLimb(cells, rearHip,
        actionClamp(rig, rearHip.x - 1, hipY + 1),
        actionClamp(rig, rearHip.x - 2, hipY + 1));
      actionDinoLimb(cells, nearHip,
        actionClamp(rig, nearHip.x - 1, hipY + 1),
        actionClamp(rig, nearHip.x - 2, hipY + 2));
    } else {
      // A backward fall folds the feet close to the hips; they stay visible
      // as two bent limbs without protruding like detached pixels.
      actionDinoLimb(cells, rearHip,
        actionClamp(rig, rearHip.x + 1, hipY + 1),
        actionClamp(rig, rearHip.x + 1, hipY + 2));
      actionDinoLimb(cells, nearHip,
        actionClamp(rig, nearHip.x, hipY + 1),
        actionClamp(rig, nearHip.x + 1, hipY + 2));
    }
    return cells;
  }
  function actionClearTackleHindLegs(cells, rig) {
    // For a compact tackle, clear the pre-contact stride all the way across
    // the lower cel before drawing the tucked pair. Restricting this to the
    // jersey bounds leaves a raptor's far cleat or a trike's rear toe as a
    // detached coloured pixel after the body shifts down.
    const fromY = Math.min(rig.h - 1, rig.torso.maxY + 2);
    for (let y = fromY; y < rig.h; y++) for (let x = 0; x < rig.w; x++) {
      if ("bdlp".indexOf(cells[y][x]) >= 0) cells[y][x] = ".";
    }
    return cells;
  }
  function actionDropTackleUpperMass(cells, rig) {
    // Move complete scan lines rather than rotating individual pixels. The
    // helmet, skull and front of the neck drop together into the shoulder
    // line, which gives the hit a clear body-first angle without shredding a
    // 16px silhouette into holes.
    const cut = Math.min(rig.h - 2, rig.head.y + 2);
    return actionRemap(cells, (x, y) => ({ x, y: y <= cut ? y + 1 : y }));
  }
  function actionDrivePosture(cells, rig, phase) {
    // A tackle needs a compact, readable body line, not a point-by-point
    // rotation that turns the torso into disconnected confetti.  Shearing
    // whole horizontal rows keeps every species' original head, sail, horn,
    // plate, tail, jersey and belly mass intact while putting its shoulders
    // one pixel in front of its planted hips.
    const drive = phase >= 0.5 ? 1 : 0;
    if (drive) {
      cells = actionLean(cells, rig, 1);
      rig = actionRig(cells, rig.key);
      cells = actionDropTackleUpperMass(cells, rig);
      rig = actionRig(cells, rig.key);
    }
    // The late cel settles one pixel lower after the airborne dive.  It is a
    // translation of the complete body—not a squash—so it still reads as a
    // dino using its chest and shoulders to make the tackle.
    if (phase >= 1) {
      cells = actionShift(cells, 0, 1);
      rig = actionRig(cells, rig.key);
    }
    return { cells, rig };
  }
  // A dinosaur that is DOWN lies HORIZONTAL. Folding shears alone read as
  // "pancake mush" (owner play-test 2026-08-07); this builds the real layout
  // silhouette from the species' own pixels: rotate the standing body onto
  // its belly (helmet forward, dorsal side up, legs trailing), seat it on
  // the ground line, and center it. Rotation preserves every species
  // feature — the sail stays a sail, the frill stays a frill — so the
  // lying body is unmistakably THAT dinosaur.
  function actionLayFlat(sourceMap, settle) {
    const src = actionCells(sourceMap);               // rows of chars
    const H2 = src.length, W2 = src[0].length;
    // clockwise quarter-turn: the upright body's long axis goes horizontal —
    // head ends at the RIGHT (direction of travel), snout dips toward the
    // turf, dorsal features (sail/plates/frill) face UP, legs trail behind
    const rot = actionBlank(H2, W2);                  // W2 rows × H2 cols
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const ch = src[y][x];
      if (ch !== ".") rot[x][H2 - 1 - y] = ch;
    }
    const b = actionBounds(rot);
    const out = actionBlank(W2, H2);                  // final grid = original dims
    if (!b) return out;
    const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;
    const ox = Math.max(0, Math.round((W2 - bw) / 2));
    // mid-fall keeps the dramatic head-first pike (full rotated height);
    // the SETTLED body collapses toward the turf so the rest frame reads as
    // a sprawled dinosaur, not a body standing on its snout.
    //
    // WHAT WAS BROKEN. The settle used to multiply each row offset by 0.55
    // and write through an `out[ny][nx] === "."` guard. Several source rows
    // therefore mapped onto one destination row, the first writer won, and
    // every later pixel in that cell was silently thrown away. Because the
    // loop paints from the turf upward, the pixels discarded were always the
    // ones FURTHEST FROM THE GROUND — and on a body rotated onto its side
    // the axis being squashed is back-to-belly, so what got deleted was the
    // dorsal ridge (sail, plates, frill) and the top of the skull.
    // Measured across all 11 species: the settled cel kept 64.5% of the
    // standing body, and the helmet went 14 -> 7 px on trike, 3 -> 1 on
    // stego, 11 -> 6 on allo and spino. The owner reported it as characters
    // "condensed into pancakes" whose "body and/or head ceases to exist",
    // which is exactly what the numbers say.
    //
    // THE FIX: SETTLE BY SPILLING, NOT BY DELETING. A body dropping onto turf
    // compresses — the hollow space between the legs and under the belly
    // closes up — and it BULGES where the mass has nowhere to go. It does not
    // evaporate. So each column is packed down onto the ground and a pixel
    // whose row is already taken climbs to the nearest free row above it.
    // Because the scan still runs turf-side first, the body keeps its
    // back-to-belly ORDER (the dorsal ridge stays on top of the belly) while
    // every single pixel survives: mass is preserved exactly, by construction.
    const squash = settle ? 0.55 : 1;
    const bhOut = Math.max(5, Math.round((bh - 1) * squash) + 1);
    const ground = H2 - 2;
    const oy = Math.max(0, ground - (bhOut - 1));
    // paint from the ground row upward so turf-side pixels settle first
    for (let y = b.maxY; y >= b.minY; y--) for (let x = b.minX; x <= b.maxX; x++) {
      const ch = rot[y][x];
      if (ch === ".") continue;
      const dyBot = Math.round((b.maxY - y) * squash);
      const nx = ox + (x - b.minX);
      if (nx < 0 || nx >= W2) continue;
      let ny = oy + (bhOut - 1) - dyBot;
      if (ny >= H2) ny = H2 - 1;
      // climb away from the turf until this pixel has a row of its own
      while (ny > 0 && out[ny][nx] !== ".") ny--;
      if (out[ny][nx] === ".") out[ny][nx] = ch;
    }
    return out;
  }
  function actionLayAnchors(cells) {
    const b = actionBounds(cells);
    if (!b) return { ball: null, contact: null, hands: [] };
    return { ball: { x: Math.round((b.minX + b.maxX) / 2), y: Math.min(cells.length - 1, b.minY + 2) }, contact: null, hands: [] };
  }
  function actionLayFront(cells) {
    const b = actionBounds(cells);
    if (!b) return { x: 0, y: 0 };
    return { x: b.maxX, y: Math.min(cells.length - 1, b.minY + 2) };
  }

  function actionBackfallPosture(cells, rig, phase, prone) {
    // The tackled carrier is FOLDED, not flattened: like the reference footage,
    // it stays a full, intact, roughly upright dinosaur that doubles over as it
    // is driven down — head and shoulders pitched low, tail kicked up behind,
    // hind legs buckling.  Every part keeps its own pixels (helmet stays a
    // helmet, eye stays an eye); nothing is scaled or piled into a shallow band.
    const p = prone ? 1 : phase;
    // Pitch the whole body forward over its hips (a shear that tips it, keeping
    // full height) and lead with the head so the snout drops toward the turf.
    // gentler fold (owner: full pitch read as a pancake at field scale)
    cells = actionPitchForward(cells, rig, 0.10 + 0.08 * p, p >= 1 ? 1 : 0);
    rig = actionRig(cells, rig.key);
    cells = actionLeadWithHead(cells, rig, Math.round(1 + 2 * p));
    rig = actionRig(cells, rig.key);
    // Buckle the legs under the folding body so it reads as collapsing, not
    // standing — redrawn as clear folded dino limbs rather than a stride.
    cells = actionClearTackleHindLegs(cells, rig);
    cells = actionCompactTackleLegs(cells, rig, "fall");
    rig = actionRig(cells, rig.key);
    if (p >= 1) { cells = actionShift(cells, 0, 1); rig = actionRig(cells, rig.key); }
    return { cells, rig };
  }
  function actionDinoForeclaw(cells, rig, target) {
    // Most football dinosaurs have short forelimbs. Deinocheirus may reach a
    // little farther, T-rex reaches less, and pterosaurs use a beak/wing-root
    // contact. Horned and plated dinos lead with head/shoulder mass instead
    // of sprouting an arm their species does not have.
    if (rig.profile.wing) {
      const beak = actionClamp(rig, rig.head.x + 2, rig.head.y + 1);
      actionPut(cells, beak.x, beak.y, "p", false);
      return beak;
    }
    if (["carno", "trex", "rampage", "trike", "stego", "pachy"].includes(rig.key)) {
      return actionShoulderContact(cells, rig);
    }
    // Raptor-sized species have a deliberately tiny hook; only Deinocheirus
    // gets a visibly extended forelimb.  This keeps a ball interaction from
    // turning every player into a tiny human with a long arm.
    const reach = rig.profile.arms > 0 ? 3 : 1;
    const shoulder = rig.frontShoulder;
    const dx = Math.max(-reach, Math.min(reach, target.x - shoulder.x));
    const dy = Math.max(-1, Math.min(1, target.y - shoulder.y));
    const elbow = actionClamp(rig, shoulder.x + Math.round(dx * 0.55), shoulder.y + Math.round(dy * 0.55));
    const claw = actionClamp(rig, shoulder.x + dx, shoulder.y + dy);
    actionDinoLimb(cells, shoulder, elbow, claw);
    return claw;
  }
  function actionShoulderContact(cells, rig) {
    // The front of the head/shoulder is the contact point.  It gets a tiny
    // dark jaw/chest wedge rather than an outstretched human-looking arm.
    const contact = actionClamp(rig, rig.head.x + 1, rig.head.y + 2);
    actionPut(cells, contact.x, contact.y, "b", false);
    actionPut(cells, contact.x, contact.y + 1, "d", false);
    return contact;
  }
  function actionGroundWing(cells, rig, raise) {
    if (!rig.profile.wing) return;
    // The source sprite already owns the grounded folded wing. Adding an
    // extra wing line here makes a walking safety look as though it has begun
    // flying; only the real soar renderer selects wings-open art.
    if (!raise) return;
    const root = rig.backShoulder;
    const tip = { x: Math.max(0, root.x - 4), y: Math.max(0, root.y - (raise ? 4 : 1)) };
    actionLine(cells, root, tip, "d");
    actionLine(cells, { x: root.x - 1, y: root.y + 1 }, { x: Math.max(0, tip.x + 1), y: tip.y + 1 }, "b");
    actionPut(cells, tip.x, tip.y, "p", true);
  }
  function actionClamp(rig, x, y) { return { x: Math.max(0, Math.min(rig.w - 1, x)), y: Math.max(0, Math.min(rig.h - 1, y)) }; }

  function compactActionFrame(sourceMap, key, action, fi, count) {
    let cells = actionCells(sourceMap);
    const phase = count <= 1 ? 1 : fi / (count - 1);
    // Ambient flyers never use field action art, but retaining compact maps
    // keeps the action API total and avoids a special-case renderer branch.
    if (cells.length < 12) return { map: actionRows(cells), anchor: { ball: null, contact: null, hands: [] } };

    let rig = actionRig(cells, key);
    const kind = action === "catch" ? "catchHigh" : action;
    // A compact action can move a natural foreclaw only as far as that
    // species permits.  In particular, `arms: -1` means T-rex-short, not a
    // truthy invitation to grow a long reaching arm.
    const reach = rig.profile.arms > 0 ? 3 : rig.profile.wing ? 2 : rig.profile.arms < 0 ? 1 : 1;
    const ballAt = (x, y) => ({ x, y });
    let anchor = { ball: null, contact: null, hands: [] };

    if (kind === "tackle") {
      // Launch -> shoulder drive -> deeper drive.  All three cels are the
      // head-and-shoulder-first LUNGE, dropping lower each frame; the tackler
      // keeps its full upright body and intact head throughout the hit.  The
      // lasting flat REST is drawn by the renderer as a real quarter-turn of
      // the whole sprite (the "prone" path), so no squashed lay cel is baked.
      ({ cells, rig } = actionDrivePosture(cells, rig, 1));
      cells = actionLean(cells, rig, 1); rig = actionRig(cells, key);
      cells = actionLeadWithHead(cells, rig, fi === 0 ? 2 : fi === 1 ? 3 : 4); rig = actionRig(cells, key);
      if (fi >= 1) { cells = actionShift(cells, 0, fi + 1); rig = actionRig(cells, key); }
      cells = actionClearTackleHindLegs(cells, rig);
      cells = actionCompactTackleLegs(cells, rig, "dive");
      rig = actionRig(cells, key);
      const contact = actionShoulderContact(cells, rig);
      actionGroundWing(cells, rig, false);
      anchor = { ball: ballAt(rig.torso.maxX - 1, rig.torso.maxY - 1), contact, hands: [contact] };
    } else if (kind === "dive") {
      // Launch, then LAYOUT: the first beat is the chest-first drive off the
      // legs; from mid-dive on, the body is genuinely horizontal (the whole
      // rotated species map — jumpT supplies the altitude). This is the
      // Retro Bowl "dive is a horizontal body" read.
      if (phase < 0.34) {
        ({ cells, rig } = actionDrivePosture(cells, rig, Math.min(0.75, phase + 0.25)));
        cells = actionClearTackleHindLegs(cells, rig);
        cells = actionCompactTackleLegs(cells, rig, "dive"); rig = actionRig(cells, key);
        const contact = actionShoulderContact(cells, rig);
        actionGroundWing(cells, rig, false);
        anchor = { ball: ballAt(rig.torso.maxX - 1, rig.torso.maxY), contact, hands: [contact] };
      } else {
        cells = actionLayFlat(sourceMap, false);
        // ball rides at the front of the layout, tucked under the chin
        const front = actionLayFront(cells);
        anchor = { ball: ballAt(Math.max(0, front.x - 2), front.y + 1), contact: front, hands: [] };
      }
    } else if (kind === "tackled" || kind === "prone") {
      // The fall is a two-act read: the first half FOLDS (impact), the back
      // half actually LIES DOWN — a true horizontal body built from the
      // species' own pixels (see actionLayFlat). The old all-fold version
      // never went horizontal and read as pancake mush at field scale.
      //
      // FOUR DISTINCT SILHOUETTES: fold -> deepest fold -> horizontal -> sprawl.
      // Both fold cels used to sample `phase` directly (0 and 0.33), which put
      // frame 0 at pitch 0.10 — still visually STANDING — and frame 1 only
      // 0.027 further over. Two near-identical uprights meant the whole
      // upright->horizontal rotation landed in the single step to frame 2 and
      // read as a snap, not a fall. The pitch/head-lead curve inside
      // actionBackfallPosture is owner-tuned (LESSON #23) and untouched; only
      // WHICH point on that curve each cel samples has changed.
      const layFrom = kind === "prone" ? 0 : Math.max(1, count - 2);
      if (fi >= layFrom) {
        cells = actionLayFlat(sourceMap, kind === "prone" || fi >= count - 1);
        anchor = actionLayAnchors(cells);
      } else {
        const foldP = layFrom <= 1 ? 1 : 0.40 + 0.60 * (fi / (layFrom - 1));
        ({ cells, rig } = actionBackfallPosture(cells, rig, foldP, false));
        const cover = actionClamp(rig, rig.torso.maxX - 1, rig.torso.maxY - 1);
        actionGroundWing(cells, rig, false);
        anchor = { ball: ballAt(cover.x, cover.y), contact: null, hands: [] };
      }
    } else if (kind === "getup") {
      // STANDING BACK UP — the reverse arc of the backward fall: pushed off
      // the turf → crouched under the hips → nearly upright. A tackled dino
      // visibly rises through its own intact body instead of snapping from a
      // laid-out cel straight into the run cycle.
      if (fi === 0) {
        // Still mostly down, but the head and chest have pushed off the turf.
        ({ cells, rig } = actionBackfallPosture(cells, rig, 1, false));
        const chestCut = Math.min(rig.h - 2, rig.head.y + 3);
        cells = actionRemap(cells, (x, y) => ({ x, y: y <= chestCut ? y - 1 : y }));
      } else if (fi === 1) {
        // Crouch: the whole body gathers low over folded hind legs.
        cells = actionShift(cells, 0, 2); rig = actionRig(cells, key);
        cells = actionClearTackleHindLegs(cells, rig);
        cells = actionCompactTackleLegs(cells, rig, "fall");
        rig = actionRig(cells, key);
        cells = actionLean(cells, rig, 1);
      } else if (fi === 2) {
        // Rising: original stance with a small forward drive off the back foot.
        cells = actionShift(cells, 0, 1); rig = actionRig(cells, key);
        cells = actionLean(cells, rig, 1);
      } else {
        // Recovered: baseline height with the last of the forward lean — one
        // beat away from rejoining the walk cycle.
        cells = actionLean(cells, rig, 1);
      }
      rig = actionRig(cells, key);
      const tuck = actionClamp(rig, rig.torso.maxX - 1, rig.torso.minY + 4);
      actionGroundWing(cells, rig, false);
      anchor = { ball: ballAt(tuck.x, tuck.y), contact: null, hands: [] };
    } else if (kind === "diveCatch") {
      // The stretched reception: a load beat, then a genuinely HORIZONTAL
      // layout (the rotated species body) with the ball at the front claws.
      if (fi === 0) {
        cells = actionLean(cells, rig, 1); rig = actionRig(cells, key);
        cells = actionPitchForward(cells, rig, 0.10, 0); rig = actionRig(cells, key);
        cells = actionLeadWithHead(cells, rig, 1); rig = actionRig(cells, key);
        const load = actionClamp(rig, rig.head.x + 1 + reach, rig.frontShoulder.y - 1);
        const claw = actionDinoForeclaw(cells, rig, load);
        actionGroundWing(cells, rig, false);
        anchor = { ball: ballAt(claw.x, claw.y - 1), contact: claw, hands: [claw] };
      } else {
        cells = actionLayFlat(sourceMap, false);
        const front = actionLayFront(cells);
        const grab = { x: Math.min(cells[0].length - 1, front.x + 1), y: front.y };
        anchor = { ball: ballAt(grab.x, Math.max(0, grab.y - 1)), contact: grab, hands: [grab] };
      }
    } else if (kind === "catchHigh") {
      // Load -> high-point -> chest secure. The catch is led by a head,
      // beak, or species-appropriate claw; no frame paints a human glove.
      if (fi === 1) {
        cells = actionShift(cells, 0, -1);
      } else if (fi === 2) {
        // Coming down off the high-point: one row of drop before the secure.
        cells = actionShift(cells, 0, 1);
      }
      rig = actionRig(cells, key);
      if (fi === 1) {
        const highY = Math.max(0, rig.head.y - 2 - (rig.profile.horn || rig.profile.crest ? 1 : 0));
        const reachTarget = actionClamp(rig, rig.head.x + 1 + reach, highY + 1);
        const claw = actionDinoForeclaw(cells, rig, reachTarget);
        // The football lands at the actual species contact point: a claw,
        // horn/shoulder mass, or Quetz's beak. That keeps it supported by the
        // anatomy rather than floating between invented hands.
        const ball = actionClamp(rig, claw.x, claw.y - 1);
        actionGroundWing(cells, rig, false);
        anchor = { ball: ballAt(ball.x, ball.y), contact: claw, hands: [claw] };
      } else if (fi === 0) {
        const load = actionClamp(rig, rig.head.x + 1 + reach, rig.frontShoulder.y - 1);
        const claw = actionDinoForeclaw(cells, rig, load);
        const ball = actionClamp(rig, claw.x, claw.y - 1);
        actionGroundWing(cells, rig, false);
        anchor = { ball: ballAt(ball.x, ball.y), contact: claw, hands: [claw] };
      } else if (fi === 2) {
        // The coming-down in-between: the football is already pulled to the
        // chest while the body drops back toward the turf.
        const chest = actionClamp(rig, rig.torso.maxX - 1, rig.torso.minY + 2);
        const claw = actionDinoForeclaw(cells, rig, chest);
        actionGroundWing(cells, rig, false);
        anchor = { ball: ballAt(chest.x, chest.y), contact: claw, hands: [claw] };
      } else {
        const secure = actionClamp(rig, rig.torso.maxX - 1, rig.torso.minY + 4);
        const claw = actionDinoForeclaw(cells, rig, secure);
        actionGroundWing(cells, rig, false);
        anchor = { ball: ballAt(secure.x, secure.y), contact: claw, hands: [claw] };
      }
    } else if (kind === "catchLow") {
      // A low catch is a lowered snout/shoulder scoop, not an elastic arm
      // reaching down from the torso.
      cells = actionPitchForward(cells, rig, 0.10, 0); rig = actionRig(cells, key);
      const scoop = actionClamp(rig, rig.head.x + 1 + reach, rig.torso.maxY);
      const claw = actionDinoForeclaw(cells, rig, scoop);
      const ball = actionClamp(rig, claw.x, claw.y);
      actionGroundWing(cells, rig, false);
      anchor = { ball: ballAt(ball.x, ball.y), contact: claw, hands: [claw] };
    } else if (kind === "throw") {
      // The quarterback plants, tucks the ball by the shoulder, releases at
      // HEAD height — the ball above the helmet is what sells a throw at
      // 16px — then follows through forward.  The live projectile owns the
      // long arc; the species claw stays anatomy-limited throughout.
      if (fi > 0) { cells = actionLean(cells, rig, 2); rig = actionRig(cells, key); } // plant lean
      const release = actionClamp(rig, rig.head.x + 1, Math.max(0, rig.head.y - 2));
      const target = fi === 0
        ? actionClamp(rig, rig.frontShoulder.x + 1, rig.frontShoulder.y - 1)
        : fi === 1
          ? release
          : actionClamp(rig, rig.head.x + 2 + reach, rig.head.y + 1);
      const claw = actionDinoForeclaw(cells, rig, target);
      // At the release cel the football rides the release point over the
      // helmet, mid-leaving the claw; before and after it stays on the claw.
      const ball = fi === 1
        ? actionClamp(rig, release.x, Math.max(0, release.y - 1))
        : actionClamp(rig, claw.x + (fi > 0 ? 1 : 0), claw.y - 1);
      actionGroundWing(cells, rig, false);
      anchor = { ball: ballAt(ball.x, ball.y), contact: claw, hands: [claw] };
    } else if (kind === "celebrate") {
      // A first down is a real victory HOP, not a 1px twitch: crouch, then a
      // clearly airborne cel with the feet tucked (the same trick that sells
      // the dive cels), then a landing plant, then a tail-flick recover.  It
      // remains recognizably dinosaur anatomy in every species; only
      // long-armed Deinocheirus adds a clear downfield point.
      if (fi === 0) {
        // Crouch: load back on the hips and sink one row — the anticipation
        // that makes the next cel read as a leap.
        cells = actionLean(cells, rig, -1); rig = actionRig(cells, key);
        cells = actionShift(cells, 0, 1);
      } else if (fi === 1) {
        // Airborne: the entire intact dino rises three rows with its hind
        // legs tucked under the belly, leaving clear air beneath the
        // silhouette instead of a standing pose nudged upward.
        cells = actionShift(cells, 0, -3); rig = actionRig(cells, key);
        cells = actionClearTackleHindLegs(cells, rig);
        cells = actionCompactTackleLegs(cells, rig, "fall");
      } else if (fi === 2) {
        // Land: plant forward with the head leading the bounce down—the
        // compact, species-neutral first-down strut.
        cells = actionLean(cells, rig, 2); rig = actionRig(cells, key);
        cells = actionLeadWithHead(cells, rig, 1);
      } else {
        // Recover: neutral stance with the tail tip flicked up — the little
        // after-bounce that closes the celebration.
        cells = actionCells(walkTailTip(actionRows(cells), -1));
      }
      rig = actionRig(cells, key);
      const tuck = actionClamp(rig, rig.torso.maxX - 1, rig.torso.minY + 4);
      const tuckClaw = actionDinoForeclaw(cells, rig, tuck);
      let gesture = actionShoulderContact(cells, rig);
      if (rig.profile.arms > 0) {
        const point = actionClamp(rig, rig.head.x + 3, rig.frontShoulder.y);
        gesture = actionDinoForeclaw(cells, rig, point);
      }
      actionGroundWing(cells, rig, false);
      anchor = { ball: ballAt(tuck.x, tuck.y), contact: gesture, hands: [tuckClaw, gesture] };
    } else if (kind === "stiff") {
      // A HEAD-BUTT — the universal dino shrug-off.  Every species carries a
      // skull and a helmet, so instead of a short, hard-to-read forelimb shove
      // the carrier lowers its head and rams the helmet/horns/dome/beak into
      // the tackler.  The three cels are WIND-UP → STRIKE → RECOIL: the strike
      // is the point of contact (all the forward head drive happens here, into
      // the hit — never after it), then the head bounces back toward neutral.
      // The ball stays tucked on the far side throughout.
      if (fi === 0) {
        // Wind up: rock onto the hips, head raised and back to load the strike.
        cells = actionLean(cells, rig, -1); rig = actionRig(cells, key);
        cells = actionShift(cells, 0, -1); rig = actionRig(cells, key);
      } else if (fi === 1) {
        // Strike: pitch the whole body forward over the hips and drive the head
        // down-and-forward so the helmet is the leading point of contact.
        cells = actionLean(cells, rig, 3); rig = actionRig(cells, key);
        cells = actionPitchForward(cells, rig, 0.18, 0); rig = actionRig(cells, key);
        cells = actionLeadWithHead(cells, rig, 4); rig = actionRig(cells, key);
      } else if (fi === 2) {
        // Strike-settle: the in-between off the hit — head still low and
        // forward of neutral, but the drive itself is finished.
        cells = actionLean(cells, rig, 2); rig = actionRig(cells, key);
        cells = actionLeadWithHead(cells, rig, 2); rig = actionRig(cells, key);
      } else {
        // Recoil: the head snaps back toward neutral off the contact — it does
        // NOT keep pushing forward, which read as momentum after the whistle.
        cells = actionLean(cells, rig, 1); rig = actionRig(cells, key);
        cells = actionLeadWithHead(cells, rig, 1); rig = actionRig(cells, key);
      }
      // Contact point = the front of the driven skull/helmet.
      const contact = actionClamp(rig, rig.head.x + 2, rig.head.y + (fi === 1 ? 1 : 0));
      const tuck = actionClamp(rig, rig.torso.minX + 2, rig.torso.minY + 4);
      actionGroundWing(cells, rig, false);
      anchor = { ball: ballAt(tuck.x, tuck.y), contact, hands: [contact] };
    } else if (kind === "shoved") {
      // The stiff-armed tackler is knocked back and off balance: the whole
      // intact body reels away from the contact, head snapping back over its
      // hips, hind legs staggering — never a flattened slab.
      // A real reel-back ARC, one distinct silhouette per cel: snapped back ->
      // DEEPEST recoil (knee buckles, drops a row) -> staggering recovery, still
      // sliding backwards -> settled off balance. Every cel used to funnel
      // through lean -2/-3/-2/-2, and because the leg redraw below erases the
      // only difference between the two source walk frames, cels 0, 2 and 3 came
      // out PIXEL-IDENTICAL — a 4-frame pack that actually played 2 poses, on
      // the most frequent contact in line play.
      cells = actionLean(cells, rig, fi === 0 ? -2 : fi === 1 ? -4 : fi === 2 ? -3 : -1);
      rig = actionRig(cells, key);
      if (fi === 1) { cells = actionShift(cells, -1, 1); rig = actionRig(cells, key); }
      else if (fi === 2) { cells = actionShift(cells, -1, 0); rig = actionRig(cells, key); }
      cells = actionClearTackleHindLegs(cells, rig);
      cells = actionCompactTackleLegs(cells, rig, "dive"); rig = actionRig(cells, key);
      const gesture = actionShoulderContact(cells, rig);
      actionGroundWing(cells, rig, false);
      anchor = { ball: null, contact: gesture, hands: [gesture] };
    }
    return { map: actionRows(cells), anchor };
  }
  function scaleActionPoint(point, scale) {
    return point ? { x: (point.x + 0.5) * scale, y: (point.y + 0.5) * scale } : null;
  }
  function scaleActionAnchor(anchor, scale) {
    return {
      ball: scaleActionPoint(anchor.ball, scale),
      contact: scaleActionPoint(anchor.contact, scale),
      hands: (anchor.hands || []).map((point) => scaleActionPoint(point, scale)),
    };
  }
  function mirrorActionAnchor(anchor, width) {
    const flip = (point) => point ? { x: width - point.x, y: point.y } : null;
    return { ball: flip(anchor.ball), contact: flip(anchor.contact), hands: anchor.hands.map(flip) };
  }
  function buildCompactActionPack(spec, jersey, helmet, key, action, scale, rampage) {
    const frames = [], rawAnchors = [];
    // Quetz frame 2+ is intentionally wings-open flight art. Grounded action
    // packs (catch, tackle, celebrate, etc.) may only be authored from its
    // two folded-wing walk maps; actual flight is selected separately by
    // `soarT` in the gameplay renderer.
    const actionSourceFrames = key === "quetz" ? spec.frames.slice(0, 2) : spec.frames;
    const count = actionSourceFrames[0].length < 12 ? actionSourceFrames.length : 4;
    for (let fi = 0; fi < count; fi++) {
      // Pin every action cel to a CONTACT walk frame (map 0 or 2).  The pass
      // frames carry a baked 1-row bounce that must never leak into tackled,
      // prone, or other grounded action art.
      const source = actionSourceFrames[(fi % 2) * 2 % actionSourceFrames.length];
      const authored = compactActionFrame(source, key, action, fi, count);
      frames.push(authored.map); rawAnchors.push(authored.anchor);
    }
    const pack = buildSpecies({ body: spec.body, accent: spec.accent, frames }, jersey, helmet, scale, rampage);
    const right = rawAnchors.map((anchor) => scaleActionAnchor(anchor, scale));
    pack.action = action;
    pack.compact = true;
    pack.anchor = { R: right, L: right.map((anchor) => mirrorActionAnchor(anchor, pack.w)) };
    return pack;
  }
  function buildCompactActions(spec, jersey, helmet, key, scale, rampage) {
    const actions = {};
    for (const action of COMPACT_ACTION_KEYS) actions[action] = buildCompactActionPack(spec, jersey, helmet, key, action, scale, rampage);
    return actions;
  }

  const SPECIES_KEYS = ["troodon", "carno", "pachy", "veloci", "deino", "trike",
    "stego", "allo", "spino", "deinony", "quetz", "trex", "ptero"];

  // The stands use the same species silhouettes as the players, but do not
  // use team colours as clothing.  Keeping the full list public lets the
  // crowd choose a mixed herd without reaching into the private sprite data.
  const FAN_SPECIES_KEYS = SPECIES_KEYS.slice();

  function buildFanSprites(scale) {
    scale = scale || 1;
    const out = {};
    for (const k of FAN_SPECIES_KEYS) {
      const spec = SPECIES[k];
      // The existing maps label uniform pixels as j/h.  Reusing the dino's
      // body colour for both removes the jersey and helmet without flattening
      // its silhouette, eye, snout, horns, plates, sail, or feather detail.
      const skin = spec.body[0];
      out[k] = buildSpecies(spec, skin, skin, scale, false);
    }
    return out;
  }

  function buildTeamSprites(jersey, helmet, scale) {
    scale = scale || 2;
    const out = {};
    // Every action pack is built from the matching compact species map. The
    // renderer selects `sheet[species].actions[action]` when an action is live.
    for (const k of SPECIES_KEYS) {
      const base = buildSpecies(SPECIES[k], jersey, helmet, scale, false);
      base.actions = buildCompactActions(SPECIES[k], jersey, helmet, k, scale, false);
      // Dedicated idle pack (an additive property): [stand, breath, blink].
      // The gameplay selector prefers it only when a dino is standing still,
      // so formations breathe and blink instead of strobing their walk legs.
      if (IDLE_MAPS[k]) {
        base.idle = buildSpecies({ body: SPECIES[k].body, accent: SPECIES[k].accent, frames: IDLE_MAPS[k] }, jersey, helmet, scale, false);
      }
      out[k] = base;
    }
    out.rampage = buildSpecies(SPECIES.trex, jersey, helmet, scale * 2, true);
    out.rampage.actions = buildCompactActions(SPECIES.trex, jersey, helmet, "trex", scale * 2, true);
    if (IDLE_MAPS.trex) {
      out.rampage.idle = buildSpecies({ body: SPECIES.trex.body, accent: SPECIES.trex.accent, frames: IDLE_MAPS.trex }, jersey, helmet, scale * 2, true);
    }
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

  window.DinoSprites = {
    buildTeamSprites, buildFanSprites, buildBall, buildSnowball, drawMap, makeCanvas,
    SPECIES_KEYS, FAN_SPECIES_KEYS, COMPACT_ACTION_KEYS,
  };
})();
