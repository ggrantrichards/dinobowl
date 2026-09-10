"""
Gridiron — page builder.

Takes the <head> (fonts + all CSS) of templates/index.html and writes
static/index.html: the same look, but a static page whose queries run in the
browser on static/gridiron/data.json via static/gridiron/engine.js. Flask
serves the same file at /, so local and hosted are one page.

    python build_gridiron_page.py
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "templates", "index.html")
OUT = os.path.join(HERE, "static", "index.html")
VERSION = sys.argv[1] if len(sys.argv) > 1 else "g1"

BODY = r"""
<body>
  <script>(function () { try { if (localStorage.getItem('gridiron_theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch (e) { } })();</script>
  <div class="wrap">
    <header>
      <button class="theme" id="themeToggle" type="button">☾ Dark mode</button>
      <p class="eyebrow">NFL stat engine · nflverse · PFR advanced · Next Gen Stats · ESPN QBR</p>
      <h1>Grid<span>iron</span></h1>
      <p class="sub">Ask for player-seasons in plain-ish English. Every number is a real season line, 2000 to now.</p>
      <div class="meta" id="meta"><span>loading the stat table…</span></div>
    </header>

    <section id="player" class="player" hidden>
      <a href="#" class="back" id="playerBack">← back to results</a>
      <div id="player-body"></div>
    </section>

    <div class="search">
      <textarea id="q" placeholder="e.g. edge rushers with 50+ pressures and a pressure rate over 7% since 2020"></textarea>
      <div class="bar">
        <button class="run" id="run">Run query</button>
        <span class="status" id="hint">Enter to run · Shift+Enter for newline</span>
      </div>
      <div class="examples" id="examples"></div>
    </div>

    <div class="read" id="read">
      <h3>How I read that</h3>
      <div class="conds" id="conds"></div>
    </div>

    <div class="status" id="status"></div>

    <div id="chart-container"
      style="display:none; margin-top: 20px; background: var(--card); padding: 15px; border: 1px solid var(--line); border-radius: var(--radius);">
      <canvas id="scatterChart" height="80"></canvas>
    </div>


    <div class="scroll-top" id="scrollTop" style="display:none"><div id="scrollTopInner"></div></div>
    <div class="results" id="results" style="display:none">
      <table>
        <thead id="thead"></thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>

    <details class="glossary" id="glossary">
      <summary>Every stat I know, with its formula and source</summary>
      <p class="gloss-note">Counting stats and rates come from nflverse play-by-play aggregates (2000–). Pressures, blitzes, hurries, knockdowns, coverage and drops are Pro Football Reference advanced stats (2018–). Rates per snap use nflverse snap counts (2012–). Total QBR is ESPN's (2006–). Time to throw, aggressiveness, separation, cushion and yards over expected are NFL Next Gen Stats (2016–). Length- and depth-qualified numbers — TD passes of 20+ yards, 20+ air-yard deep balls, explosive runs — are counted from nflverse play-by-play, regular season only (air yards are charted from 2006). <b>ESPN's Pass Rush Win Rate and Run Stop Win Rate are not published as data</b>, so “pass rush win rate” answers with pressure rate and “run stop win rate” with tackles for loss, and the column says so. Per-lineman <b>sacks allowed</b> is not public either; “sacks allowed” answers with the quarterback's sacks taken.</p>
      <div id="gloss-body"></div>
    </details>
  </div>

  <!-- DINO BOWL: play while your queries run. The mute chip lives beside the
       launcher, not inside the panel, because the game keeps playing when the
       panel is collapsed and that is exactly when you need to silence it. -->
  <div class="dino-dock">
    <button class="dino-mute" id="dinoMute" type="button" aria-pressed="false" title="Mute Dino Bowl" hidden>🔊</button>
    <button class="dino-btn" id="dinoBtn" type="button" title="Dino Bowl — 8-bit football. With dinosaurs." aria-label="Open Dino Bowl">🦖</button>
  </div>
  <div class="dino-panel" id="dinoPanel">
    <div class="dino-head">
      <span>DINO BOWL — retro football, but Cretaceous</span>
      <span class="tools">
        <button id="dinoMute2" type="button" aria-pressed="false" title="Mute Dino Bowl">🔊</button>
        <a href="/game/" target="_blank">full screen ↗</a>
        <button id="dinoMin" type="button" title="Minimise (the game keeps running)">—</button>
      </span>
    </div>
    <iframe id="dinoFrame" title="Dino Bowl"></iframe>
  </div>


  <script src="/gridiron/engine.js?v=__V__"></script>
  <script>
    const DATA_URL = '/gridiron/data.json?v=__V__';
    const EXAMPLES = [
      "QBs top 10 in passing yards and passing touchdowns with a top 5 lowest interception rate who had a playoff game",
      "QBs with a QBR over 70 and EPA per play above 0.2",
      "edge rushers with 50+ pressures and a pressure rate over 7% since 2020",
      "CBs top 5 in interceptions plus passes defended with a completion percentage allowed under 55%",
      "RBs over 1500 rushing yards with a turnover percentage under 1%",
      "WRs taller than 6'3 with over 1000 receiving yards and a drop rate under 5% in 2024",
      "linebackers heavier than 250 pounds with over 100 tackles and 5+ sacks",
      "QBs with a sack rate under 5% and a passer rating over 100 since 2018",
      "safeties top 3 in interception return touchdowns",
      "kickers with a field goal percentage over 90% and at least 25 field goals made",
      "What QB has had the most deep pass TDs (20+ yards) since 2021",
      "QBs with the most 20+ yard passing TDs since 2021",
      "QBs who won a playoff game with 4000+ passing yards",
      "which QB has the most rings since 2000",
      "Qbs under 25 years old"
    ];
    // short table headers; anything not listed falls back to the display name
    // with its parenthetical trimmed
    const HEAD = {
      season: "Yr", player_display_name: "Player", position: "Pos", recent_team: "Tm", games: "G", made_playoffs: "Playoffs", age: "Age",
      passing_yards: "Pass Yds", passing_tds: "Pass TD", completions: "Cmp", pass_attempts: "Att", completion_pct: "Cmp%", interceptions: "INT",
      int_rate: "INT%", td_pct: "TD%", ypa: "Y/A", passer_rating: "Rate", qbr: "QBR", epa_per_play: "EPA/play", pass_epa_per_play: "Pass EPA/play",
      rush_epa_per_carry: "Rush EPA/car", rec_epa_per_target: "Rec EPA/tgt", cpoe: "CPOE", cpoe_ngs: "CPOE (NGS)", sacks_taken: "Sacked", sack_pct: "Sk%",
      sack_yards_lost: "Sk Yds", turnover_pct: "TO%", turnovers: "TO", fumbles: "Fum", fumbles_lost: "FL", pass_ypg: "Pass Y/G",
      rushing_yards: "Rush Yds", rushing_tds: "Rush TD", carries: "Car", ypc: "Y/C", rush_ypg: "Rush Y/G", ryoe: "RYOE", ryoe_per_att: "RYOE/att",
      receptions: "Rec", targets: "Tgt", receiving_yards: "Rec Yds", receiving_tds: "Rec TD", catch_pct: "Catch%", ypr: "Y/R", rec_ypg: "Rec Y/G",
      rec_yac: "YAC", drops: "Drops", drop_pct: "Drop%", target_share: "Tgt%", separation: "Sep", cushion: "Cush", adot: "aDOT",
      total_yards: "Tot Yds", total_ypg: "Y/G", total_tds: "Tot TD", fantasy_ppr: "Fan PPR", fantasy_std: "Fan Std",
      tackles: "Tkl", tackles_solo: "Solo", tackles_for_loss: "TFL", tfl_yards: "TFL Yds", sacks: "Sacks", qb_hits: "QB Hits", qb_hit_rate: "QBH%",
      pressures: "Prss", pressure_rate: "Prss%", hurries: "Hrry", qb_knockdowns: "QBKD", blitzes: "Bltz", blitz_pct: "Bltz%", sack_per_blitz: "Sk/Bltz",
      def_interceptions: "Def INT", passes_defended: "PD", int_plus_pd: "INT+PD", forced_fumbles: "FF", fumble_recoveries: "FR",
      def_tds: "Def TD", int_tds: "INT TD", fumble_rec_tds: "FR TD", def_int_yards: "INT Yds", safeties: "Sfty",
      missed_tackles: "MTkl", missed_tackle_pct: "MTkl%", cov_targets: "Cov Tgt", cov_completions: "Cov Cmp", cov_cmp_pct: "Cov Cmp%",
      cov_yards: "Cov Yds", cov_tds: "Cov TD", cov_rating: "Cov Rate", def_snaps: "Def Snaps", off_snaps: "Off Snaps",
      times_pressured: "Prss'd", pressured_pct: "Prss'd%", times_blitzed: "Blitzed", times_hurried: "Hurried", times_hit: "Hit",
      pocket_time: "Pocket", time_to_throw: "TTT", aggressiveness: "AGG%", bad_throw_pct: "Bad%", on_target_pct: "OnTgt%",
      fg_made: "FGM", fg_att: "FGA", fg_pct: "FG%", fg_long: "Lng", pat_made: "XPM", pat_att: "XPA", punts: "Punts", punt_yards: "Punt Yds", punts_inside_20: "In20",
      pass_td_20: "TD 20+", pass_td_40: "TD 40+", rush_td_20: "RuTD 20+", rush_td_40: "RuTD 40+",
      rec_td_20: "ReTD 20+", rec_td_40: "ReTD 40+", pass_20_plus: "Cmp 20+", pass_40_plus: "Cmp 40+",
      rush_20_plus: "Run 20+", rush_40_plus: "Run 40+", rec_20_plus: "Catch 20+", rec_40_plus: "Catch 40+",
      deep_att: "Deep Att", deep_cmp: "Deep Cmp", deep_cmp_pct: "Deep Cmp%", deep_yards: "Deep Yds",
      deep_td: "Deep TD", deep_int: "Deep INT", deep_targets: "Deep Tgt", deep_recs: "Deep Rec",
      deep_rec_yards: "Deep ReYds", deep_rec_td: "Deep ReTD",
      playoff_wins: "PO W", super_bowl_wins: "SB W", height: "Ht", weight: "Wt", college: "College", draft_year: "Draft", draft_round: "Rd", draft_pick: "Pick", experience: "Exp",
    };
    const TXT = new Set(["player_display_name", "position", "recent_team", "college"]);
    const INT_COLS = new Set(["games", "age", "weight", "draft_year", "draft_round", "draft_pick", "rookie_season", "experience", "season"]);

    let T = null, META = null, loading = null;
    const q = document.getElementById('q'), runBtn = document.getElementById('run');
    const status = document.getElementById('status');

    async function loadTable() {
      if (T) return T;
      if (loading) return loading;
      loading = (async () => {
        status.className = 'status'; status.textContent = 'Loading the stat table (one time, ~4 MB)…';
        const res = await fetch(DATA_URL);
        if (!res.ok) throw new Error('data.json ' + res.status);
        const reader = res.body && res.body.getReader ? res.body.getReader() : null;
        let json;
        if (reader) {
          const total = +res.headers.get('content-length') || 0; const chunks = []; let got = 0;
          for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; if (total) status.textContent = 'Loading the stat table… ' + Math.round(got / total * 100) + '%'; }
          const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
          json = JSON.parse(new TextDecoder().decode(buf));
        } else json = await res.json();
        T = new Gridiron.Table(json); META = json.meta;
        document.getElementById('meta').innerHTML = `<span><b>${META.rows.toLocaleString()}</b> player-seasons</span><span>seasons <b>${META.seasons[0]}–${META.seasons[META.seasons.length - 1]}</b></span><span><b>${META.columns.length}</b> stats per line</span><span>built <b>${META.built.slice(0, 10)}</b></span>`;
        renderGlossary();
        status.textContent = '';
        return T;
      })();
      return loading;
    }

    function head(c) { return HEAD[c] || (META && META.display[c] ? META.display[c].replace(/\s*\(.*\)\s*$/, '') : c); }
    function fmt(col, v) {
      if (v === null || v === undefined) return '—';
      if (col === 'made_playoffs') return v ? '<span class="yes">✓ yes</span>' : '<span class="no">no</span>';
      if (col === 'height') return Math.floor(v / 12) + "'" + Math.round(v % 12) + '"';
      if (META && META.pct_stats.includes(col)) return (v * 100).toFixed(1) + '%';
      if (META && META.pp_stats.includes(col)) return (v >= 0 ? '+' : '') + Number(v).toFixed(1);
      if (typeof v === 'number') {
        if (INT_COLS.has(col) || Number.isInteger(v)) return v.toLocaleString();
        return Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 10 ? v.toFixed(2) : v.toFixed(3).replace(/0$/, '');
      }
      return v;
    }
    function renderGlossary() {
      const body = document.getElementById('gloss-body');
      const cov = META.coverage;
      const src = (c) => {
        if (META.derived[c]) return META.derived[c];
        if (["qbr", "qbr_raw", "qbr_pts_added", "qbr_plays", "qbr_epa_total"].includes(c)) return "ESPN Total QBR season table (" + cov.qbr + "–)";
        if (/^(pressures|hurries|qb_knockdowns|blitzes|missed_tackles|missed_tackle_pct|pfr_comb_tackles|cov_|times_|pressured_pct|pocket_time|drops|drop_pct|bad_throw|on_target|throwaways|scrambles|iay_per_att|ybc_per_att|yac_per_att|broken_tackles|adot|rec_yac_per_rec)/.test(c)) return "Pro Football Reference advanced stats via nflverse (" + cov.pfr + "–)";
        if (/^(time_to_throw|ngs_|air_yards_diff|aggressiveness|max_completed_air|air_yards_to_sticks|xcomp_pct|cpoe_ngs|rush_efficiency|stacked_box_pct|time_to_los|x_rush_yards|ryoe|rush_pct_oe|cushion|separation|rec_iay|iay_share|yac_oe|x_yac)/.test(c)) return "NFL Next Gen Stats via nflverse (" + cov.ngs + "–)";
        if (/snaps$/.test(c)) return "nflverse snap counts, regular season (" + cov.snaps + "–)";
        if (["height", "weight", "college", "draft_year", "draft_round", "draft_pick", "rookie_season", "age", "headshot_url"].includes(c)) return "nflverse players database";
        return "nflverse player stats, regular season (" + cov.box_score + "–)";
      };
      const skip = new Set(["player_id", "headshot_url", "player_display_name", "position", "position_group", "recent_team", "season", "made_playoffs"]);
      const rows = META.columns.filter((c) => !skip.has(c)).sort((a, b) => head(a).localeCompare(head(b)));
      body.innerHTML = '<table class="gloss"><thead><tr><th>Column</th><th>Ask for it as</th><th>What it is</th></tr></thead><tbody>' +
        rows.map((c) => {
          const names = META.aliases.filter(([, col]) => col === c).map(([p]) => p).slice(0, 4).join(', ');
          return `<tr><td><b>${head(c)}</b></td><td>${names || (META.display[c] || c)}</td><td>${src(c)}</td></tr>`;
        }).join('') + '</tbody></table>';
    }

    function renderExamples() {
      const box = document.getElementById('examples');
      EXAMPLES.forEach(ex => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = ex; b.onclick = () => { q.value = ex; q.focus(); run(); }; box.appendChild(b); });
    }

    let scatterChart = null, lineChart = null, lastD = null;
    // chart colours follow the theme
    const themeColor = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const chartColors = () => ({ accent: themeColor('--accent'), dim: themeColor('--chalk-dim'), line: themeColor('--line') });
    function renderScatter(rows, columns) {
      const container = document.getElementById('chart-container');
      if (!rows.length) { container.style.display = 'none'; return; }
      let xAxis, yAxis;
      const pairs = [['passing_yards', 'passing_tds'], ['rushing_yards', 'rushing_tds'], ['receiving_yards', 'receiving_tds'], ['tackles', 'sacks'], ['pressures', 'sacks']];
      for (const [x, y] of pairs) if (columns.includes(x) && columns.includes(y) && rows.some(r => r[x] > 0)) { xAxis = x; yAxis = y; break; }
      if (!xAxis) { container.style.display = 'none'; return; }
      container.style.display = 'block';
      const data = rows.filter(r => r[xAxis] != null && r[yAxis] != null).map(r => ({ x: r[xAxis], y: r[yAxis], name: r.player_display_name, season: r.season }));
      const ctx = document.getElementById('scatterChart').getContext('2d');
      if (scatterChart) scatterChart.destroy();
      scatterChart = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [{ label: `${head(xAxis)} vs ${head(yAxis)}`, data, backgroundColor: chartColors().accent, pointRadius: 4, pointHoverRadius: 6 }] },
        options: {
          plugins: { tooltip: { callbacks: { label: (c) => { const d = c.raw; return `${d.name} (${d.season}): ${d.x}, ${d.y}`; } } } },
          scales: { x: { title: { display: true, text: head(xAxis), color: chartColors().dim }, grid: { color: chartColors().line }, ticks: { color: chartColors().dim } },
                    y: { title: { display: true, text: head(yAxis), color: chartColors().dim }, grid: { color: chartColors().line }, ticks: { color: chartColors().dim } } }
        }
      });
    }

    const CAREER_COLS = {
      QB: ["games", "pass_attempts", "completions", "completion_pct", "passing_yards", "passing_tds", "interceptions", "passer_rating", "qbr", "epa_per_play", "cpoe", "sacks_taken", "sack_pct", "rushing_yards", "rushing_tds"],
      RB: ["games", "carries", "rushing_yards", "ypc", "rushing_tds", "receptions", "receiving_yards", "receiving_tds", "total_yards", "fumbles_lost", "ryoe_per_att", "fantasy_ppr"],
      WR: ["games", "targets", "receptions", "receiving_yards", "ypr", "receiving_tds", "catch_pct", "rec_yac", "drops", "target_share", "separation", "fantasy_ppr"],
      DEF: ["games", "tackles", "tackles_for_loss", "sacks", "qb_hits", "pressures", "pressure_rate", "forced_fumbles", "fumble_recoveries", "def_interceptions", "passes_defended", "def_tds", "missed_tackle_pct", "cov_cmp_pct"],
      K: ["games", "fg_made", "fg_att", "fg_pct", "fg_long", "pat_made", "pat_att"], P: ["games", "punts", "punt_yards", "punts_inside_20"],
    };
    function groupOf(pos) { if (META.def_codes.includes(pos)) return "DEF"; if (pos === "TE") return "WR"; if (pos === "FB") return "RB"; return CAREER_COLS[pos] ? pos : "WR"; }
    // PLAYER PAGES. Every name is a link to #player/<id>: the player's header,
    // a career line, and every season he has played as one grid with a career
    // row at the bottom. The rest of the page hides while it is open; the
    // browser's back button (or the link) returns to the results as they were.
    const HOME = ['.search', '#read', '#status', '#chart-container', '#scrollTop', '#results', '.glossary'];
    function showHome() {
      document.getElementById('player').hidden = true;
      for (const sel of HOME) { const el = document.querySelector(sel); if (el) el.style.visibility = ''; el && el.classList.remove('offpage'); }
    }
    async function showPlayer(pid) {
      for (const sel of HOME) { const el = document.querySelector(sel); if (el) el.classList.add('offpage'); }
      const page = document.getElementById('player'), body = document.getElementById('player-body');
      page.hidden = false; body.innerHTML = '<p class="status">Loading…</p>'; window.scrollTo(0, 0);
      try {
        const rows = (await loadTable()).career(pid);
        if (!rows.length) { body.innerHTML = '<p class="status error">No seasons found for this player.</p>'; return; }
        const last = rows[rows.length - 1], pos = last.position || '', g = groupOf(pos);
        const statKey = g === 'QB' ? 'passing_yards' : g === 'RB' ? 'rushing_yards' : g === 'DEF' ? 'tackles' : g === 'K' ? 'fg_made' : g === 'P' ? 'punts' : 'receiving_yards';
        const cols = [...new Set(['games', 'made_playoffs', 'age', ...CAREER_COLS[g]])].filter(c => rows.some(r => r[c] != null));
        const teams = [...new Set(rows.map(r => r.recent_team).filter(Boolean))];
        const bio = [pos, teams.join(', '), last.height != null ? fmt('height', last.height) : null, last.weight != null ? last.weight + ' lbs' : null,
          last.age != null ? 'Age ' + last.age : null, last.college || null,
          last.draft_year ? `Drafted ${last.draft_year} · Rd ${last.draft_round || '–'} · Pick ${last.draft_pick || '–'}` : (last.rookie_season ? 'Undrafted · rookie ' + last.rookie_season : null)].filter(Boolean).join(' · ');
        // career row: counting stats add up; a rate whose formula is "a / b" is recomputed from the sums
        const counting = new Set([...META.rank_desc, 'games', 'playoff_wins', 'super_bowl_wins'].filter(c => !META.pct_stats.includes(c) && !(META.pp_stats || []).includes(c)));
        const sum = {}; for (const c of cols) if (counting.has(c) && rows.some(r => typeof r[c] === 'number')) sum[c] = rows.reduce((t, r) => t + (r[c] || 0), 0);
        const career = {};
        for (const c of cols) {
          if (c in sum) { career[c] = sum[c]; continue; }
          const m = /^(\w+) \/ (\w+)$/.exec(META.derived[c] || '');
          if (m && m[1] in sum && m[2] in sum && sum[m[2]] > 0) career[c] = sum[m[1]] / sum[m[2]];
          else if (c === 'made_playoffs') career[c] = null;
        }
        const seasons = rows.filter(r => r.made_playoffs).length;
        const cell = (c, v, r) => c === 'made_playoffs' && r === career ? `${seasons} of ${rows.length}` : fmt(c, v);
        body.innerHTML = `
          <div class="player-head">
            <img src="${last.headshot_url || ''}" onerror="this.style.display='none'" alt="">
            <div><h2>${last.player_display_name}</h2><p>${bio}</p>
              <p>${rows.length} season${rows.length === 1 ? '' : 's'} · ${META.seasons[0] <= rows[0].season ? rows[0].season : '?'}–${last.season}</p></div>
          </div>
          <div class="player-chart"><canvas id="lineChart" height="80"></canvas></div>
          <h3 class="player-h3">Seasons <span class="player-hint">click a column to sort</span></h3>
          <div class="results career-grid"><table>
            <thead id="pthead"><tr><th class="txt" data-col="season">Yr</th><th class="txt" data-col="recent_team">Tm</th><th class="txt" data-col="position">Pos</th>${cols.map(c => `<th data-col="${c}" title="${(META.display[c] || c).replace(/"/g, '')} — click to sort">${head(c)}</th>`).join('')}</tr></thead>
            <tbody id="ptbody"></tbody>
          </table></div>`;
        const P = { rows, sort: null };
        const paintSeasons = () => {
          const sc = P.sort && P.sort.col, mark = (c) => c === sc ? ' sorted' : '';
          document.getElementById('ptbody').innerHTML = sortRows(rows, P.sort).map(r => `<tr><td class="txt${mark('season')}"><span class="season-badge">${r.season}</span></td><td class="txt${mark('recent_team')}">${r.recent_team || ''}</td><td class="txt${mark('position')}">${r.position || ''}</td>${cols.map(c => `<td class="${mark(c).trim()}">${cell(c, r[c], r)}</td>`).join('')}</tr>`).join('')
            + `<tr class="career-row"><td class="txt">Career</td><td class="txt"></td><td class="txt"></td>${cols.map(c => `<td>${c in career ? cell(c, career[c], career) : (c === 'made_playoffs' ? cell(c, null, career) : '')}</td>`).join('')}</tr>`;
        };
        wireSort(document.getElementById('pthead'), P, paintSeasons);
        paintSeasons();
        const ctx = document.getElementById('lineChart').getContext('2d');
        if (lineChart) lineChart.destroy();
        lineChart = new Chart(ctx, { type: 'line', data: { labels: rows.map(r => r.season), datasets: [{ label: head(statKey), data: rows.map(r => r[statKey] || 0), borderColor: chartColors().accent, backgroundColor: chartColors().accent + '33', fill: true, tension: 0.3 }] },
          options: { scales: { x: { grid: { color: chartColors().line }, ticks: { color: chartColors().dim } }, y: { grid: { color: chartColors().line }, ticks: { color: chartColors().dim }, beginAtZero: true } } } });
      } catch (e) { body.innerHTML = '<p class="status error">Failed to load this player: ' + e.message + '</p>'; }
    }
    function route() {
      const m = /^#player\/(.+)$/.exec(location.hash);
      if (m) showPlayer(decodeURIComponent(m[1])); else showHome();
    }
    window.addEventListener('hashchange', route);
    document.getElementById('playerBack').addEventListener('click', (e) => { e.preventDefault(); if (history.length > 1) history.back(); else location.hash = ''; });

    async function run() {
      const text = q.value.trim(); if (!text) return;
      runBtn.disabled = true; runBtn.textContent = 'Running…';
      const read = document.getElementById('read'), conds = document.getElementById('conds');
      try {
        const table = await loadTable();
        status.className = 'status'; status.textContent = '';
        let d;
        try { d = table.query(text); }
        catch (e) {
          if (e instanceof Gridiron.QueryError || e.name === 'QueryError') { read.classList.remove('show'); status.className = 'status error'; status.textContent = e.message; document.getElementById('results').style.display = 'none'; return; }
          throw e;
        }
        const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const kind = (n) => /^position is/.test(n) ? 'k-pos' : /^season/.test(n) ? 'k-season' : /^sorted by/.test(n) ? 'k-sort'
          : /^(won |appeared|led the league|top \d|bottom \d)/.test(n) ? 'k-flag' : 'k-filter';
        const pill = (n) => kind(n) === 'k-filter' ? esc(n).replace(/(\S+)$/, '<b>$1</b>') : esc(n);
        conds.innerHTML = d.notes.map((n, i) => `<div class="cond">${i > 0 ? '<span class="and">and</span>' : ''}${esc(n)}</div>`).join('')
          + ((d.ignored && d.ignored.length)
            ? `<div class="cond ignored">couldn't read ${d.ignored.map(x => '“' + esc(x) + '”').join(', ')} — not used as a filter</div>` : '');
        read.classList.add('show');
        status.innerHTML = `<span class="count">${d.count.toLocaleString()}</span> player-season${d.count === 1 ? '' : 's'} matched` + (d.truncated ? ' · showing first 2000' : '');
        lastD = d; renderTable(d); renderScatter(d.rows, d.columns);
      } catch (e) { status.className = 'status error'; status.textContent = 'Something broke: ' + e.message; }
      finally { runBtn.disabled = false; runBtn.textContent = 'Run query'; }
    }

    // a second horizontal scrollbar above the table, kept in step with the real one
    function syncScrollbars() {
      const res = document.getElementById('results'), top = document.getElementById('scrollTop'), inner = document.getElementById('scrollTopInner');
      const table = res.querySelector('table');
      res.style.width = top.style.width = '';
      document.documentElement.style.setProperty('--table-w', table.scrollWidth + 2 + 'px');
      const wide = table.scrollWidth > res.clientWidth + 1;
      top.style.display = wide ? 'block' : 'none';
      inner.style.width = table.scrollWidth + 'px';
      if (!top.dataset.wired) {
        top.dataset.wired = '1';
        let lock = false;
        top.addEventListener('scroll', () => { if (lock) return; lock = true; res.scrollLeft = top.scrollLeft; lock = false; });
        res.addEventListener('scroll', () => { if (lock) return; lock = true; top.scrollLeft = res.scrollLeft; lock = false; });
        window.addEventListener('resize', () => { if (res.style.display !== 'none') syncScrollbars(); });
      }
    }
    // ONE SORTER FOR EVERY GRID. Click a header: high-to-low (A-Z for text,
    // oldest-first for the year). Click it again: the other way. Blanks always
    // sink to the bottom. The sorted header is filled, the column is tinted.
    function sortRows(rows, sort) {
      if (!sort) return rows;
      const dir = sort.dir === 'desc' ? -1 : 1, col = sort.col;
      return rows.slice().sort((a, b) => {
        const va = a[col], vb = b[col];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const c = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb));
        return c * dir;
      });
    }
    function wireSort(thead, state, rerender) {
      thead.onclick = (e) => {
        const th = e.target.closest('th[data-col]'); if (!th) return;
        const col = th.dataset.col;
        const flip = state.sort && state.sort.col === col;
        state.sort = { col, dir: flip ? (state.sort.dir === 'desc' ? 'asc' : 'desc') : ((TXT.has(col) || col === 'season') ? 'asc' : 'desc') };
        thead.querySelectorAll('th').forEach(t => {
          t.classList.remove('sort-desc', 'sort-asc'); t.removeAttribute('aria-sort');
          if (t.dataset.col === col) { t.classList.add('sort-' + state.sort.dir); t.setAttribute('aria-sort', state.sort.dir === 'desc' ? 'descending' : 'ascending'); }
        });
        rerender();
      };
    }

    let LAST = null;   // the result rows on screen, their columns, and how they are sorted
    function renderTable(d) {
      const res = document.getElementById('results');
      if (!d.rows.length) { res.style.display = 'none'; document.getElementById('scrollTop').style.display = 'none'; return; }
      LAST = { rows: d.rows, cols: d.columns.filter(c => c !== 'player_id' && c !== 'headshot_url'), sort: null };
      const thead = document.getElementById('thead');
      thead.innerHTML = '<tr><th></th>' + LAST.cols.map(c => `<th data-col="${c}" class="${TXT.has(c) ? 'txt' : ''}" title="${(META.display[c] || c).replace(/"/g, '')} — click to sort">${head(c)}</th>`).join('') + '</tr>';
      wireSort(thead, LAST, () => renderBody(sortRows(LAST.rows, LAST.sort)));
      renderBody(d.rows);
      res.style.display = 'block';
      syncScrollbars();
    }
    function renderBody(rows) {
      const tbody = document.getElementById('tbody'), sc = LAST.sort && LAST.sort.col;
      tbody.innerHTML = rows.map(row => {
        const imgStr = row.headshot_url ? `<img src="${row.headshot_url}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">` : `<div class="avatar" style="display:inline-block"></div>`;
        const tds = `<td style="padding:4px 10px;text-align:center;">${imgStr}</td>` + LAST.cols.map(c => {
          const val = c === 'season' ? `<span class="season-badge">${row[c]}</span>` : c === 'recent_team' ? `<span class="team">${row[c] || '—'}</span>` : c === 'position' ? `<span class="pos">${row[c] || '—'}</span>`
            : c === 'player_display_name' ? `<a class="plink" href="#player/${encodeURIComponent(row.player_id)}" title="Open ${row[c]}'s page">${row[c]}</a>` : fmt(c, row[c]);
          const cls = (c === 'player_display_name' ? 'name txt' : TXT.has(c) ? 'txt' : '') + (c === sc ? ' sorted' : '');
          return `<td class="${cls}">${val}</td>`;
        }).join('');
        return `<tr data-id="${row.player_id}">${tds}</tr>`;
      }).join('');
    }

    q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } });
    runBtn.addEventListener('click', run);
    renderExamples();
    // warm the table in the background so the first question answers fast,
    // then honour a direct link to a player's page
    loadTable().then(route).catch(e => { status.className = 'status error'; status.textContent = 'Could not load the stat table: ' + e.message; });

    // DINO BOWL background-play widget
    const dinoBtn = document.getElementById('dinoBtn'), dinoPanel = document.getElementById('dinoPanel'), dinoFrame = document.getElementById('dinoFrame');
    const dinoDock = document.querySelector('.dino-dock');
    // the corner dock disappears while the panel is open (the panel head has
    // the same controls), and the mute chip only appears once there is a game
    // that could make a sound
    function openPanel(open) {
      dinoPanel.classList.toggle('open', open);
      if (open && !dinoFrame.src) dinoFrame.src = '/game/';
      dinoDock.classList.toggle('hidden', open);
      if (dinoFrame.src) dinoMute.hidden = false;
    }
    dinoBtn.addEventListener('click', () => openPanel(!dinoPanel.classList.contains('open')));
    document.getElementById('dinoMin').addEventListener('click', () => openPanel(false));

    const themeBtn = document.getElementById('themeToggle');
    function paintTheme() { themeBtn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'; }
    themeBtn.addEventListener('click', () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      if (dark) delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = 'dark';
      try { localStorage.setItem('gridiron_theme', dark ? 'light' : 'dark'); } catch (_) { }
      paintTheme();
      if (lastD) renderScatter(lastD.rows, lastD.columns);
    });
    paintTheme();

    // MUTE. The state lives in localStorage, which the game reads at boot and
    // writes when you press M inside it, so the two always agree — and a mute
    // set before the game is ever opened still lands. While the game is up we
    // also post to it, so the click is instant rather than reload-shaped.
    const MUTE_KEY = 'dinobowl_muted', dinoMute = document.getElementById('dinoMute'), muteBtns = [dinoMute, document.getElementById('dinoMute2')];
    const isMuted = () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (_) { return false; } };
    function paintMute(on) {
      for (const btn of muteBtns) {
        btn.textContent = on ? '🔇' : '🔊';
        btn.classList.toggle('is-muted', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.title = on ? 'Dino Bowl is muted — click for sound' : 'Mute Dino Bowl';
      }
    }
    function setMuted(on) {
      try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch (_) { }
      paintMute(on);
      try { if (dinoFrame.contentWindow) dinoFrame.contentWindow.postMessage({ dinobowl: 'setMuted', muted: on }, location.origin); } catch (_) { }
    }
    muteBtns.forEach(btn => btn.addEventListener('click', () => setMuted(!isMuted())));
    // the game reports back when M is pressed inside it
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin) return;
      const d = e.data;
      if (d && d.dinobowl === 'muted') paintMute(!!d.muted);
    });
    paintMute(isMuted());
  </script>
</body>

</html>
"""

EXTRA_CSS = """
    /* 2.1: definitions + career table */
    .glossary { margin-top: 28px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); padding: 10px 16px; }
    .glossary summary { cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--accent); padding: 6px 0; }
    .glossary .gloss-note { font-size: 13px; color: var(--chalk-dim); line-height: 1.5; }
    .glossary table.gloss { width: 100%; border-collapse: collapse; font-size: 12px; }
    .glossary table.gloss th, .glossary table.gloss td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .glossary table.gloss th { color: var(--chalk-dim); font-weight: 600; }
    .results.career { margin-top: 14px; max-height: 320px; overflow: auto; }
    .results.career table { font-size: 12px; }
    .modal-header p { margin: 4px 0; color: var(--chalk-dim); font-size: 13px; }

    /* the launcher and the mute chip share one small dock in the corner; it
       hides while the panel is open, whose head has the same controls */
    .dino-dock { position: fixed; right: 18px; bottom: 18px; z-index: 1200; display: flex; align-items: center; gap: 8px }
    .dino-dock.hidden { display: none }
    .dino-dock .dino-btn { position: static; right: auto; bottom: auto; width: 42px; height: 42px; padding: 0; border-radius: 50%; font-size: 20px; line-height: 1; color: var(--on-accent); display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0, 0, 0, .28) }
    .dino-mute {
      width: 34px; height: 34px; flex: none; display: inline-flex; align-items: center; justify-content: center; padding: 0;
      font-size: 15px; line-height: 1; cursor: pointer; border-radius: 50%;
      background: var(--card); color: var(--chalk); border: 1px solid var(--line-strong); box-shadow: 0 4px 14px rgba(0, 0, 0, .22);
    }
    .dino-mute[hidden] { display: none }
    .dino-mute:hover { border-color: var(--accent) }
    .dino-mute:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
    .dino-mute.is-muted { background: var(--accent); color: var(--on-accent); border-color: var(--accent) }
    .dino-panel { background: var(--card); border-color: var(--line-strong); box-shadow: 0 18px 60px rgba(0, 0, 0, .35) }
    .dino-panel .dino-head { color: var(--chalk-dim); border-bottom-color: var(--line) }
    .dino-head .tools { display: flex; align-items: center; gap: 6px }
    .dino-head .tools a, .dino-head .tools button { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--chalk); background: transparent; border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 3px 8px; cursor: pointer; text-decoration: none; line-height: 1.4 }
    .dino-head .tools a:hover, .dino-head .tools button:hover { border-color: var(--accent) }
    .dino-head .tools button.is-muted { background: var(--accent); color: var(--on-accent); border-color: var(--accent) }

    /* a clause the parser could not read is shown, not swallowed */
    .cond.ignored { color: var(--danger); border-color: var(--danger) }

    /* per-player totals for a "most X" question */
    .results { overflow-x: auto; width: min(100%, var(--table-w, 100%)) }
    .scroll-top { position: sticky; top: 0; z-index: 5; margin-top: 18px; padding-top: 6px; background: var(--field); overflow-x: auto; overflow-y: hidden; height: 20px; width: min(100%, var(--table-w, 100%)) }
    .scroll-top > div { height: 1px }
    .scroll-top + .results { margin-top: 0; border-top-left-radius: 0; border-top-right-radius: 0 }
    @media (min-width: 1240px) {
      /* the table may use the whole monitor even though the copy above it stays at 1180px */
      .scroll-top, .results { margin-left: calc(50% - 50vw + 24px); width: min(calc(100vw - 48px), var(--table-w, 100vw)) }
    }
    .totals { margin-top: 18px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 16px }
    .totals h3 { margin: 0 0 8px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--accent); font-weight: 600 }
    .tot-row { display: flex; align-items: baseline; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--line); font-size: 13px }
    .tot-row:last-child { border-bottom: 0 }
    .tot-rank { width: 18px; color: var(--chalk-dim); font-size: 11px; text-align: right }
    .tot-name { flex: 1; font-weight: 600 }
    .tot-team, .tot-sub { color: var(--chalk-dim); font-size: 11px }
    .tot-val { font-family: 'IBM Plex Mono', monospace; color: var(--accent); min-width: 56px; text-align: right }

    /* ============ light by default, dark on the toggle ============ */
    :root {
      --field: #f4f6f2; --field-2: #e9eee8; --card: #ffffff;
      --chalk: #0d1611; --chalk-dim: #3a4a41;
      --line: #d3dbd4; --line-strong: #b9c5bb; --line-soft: rgba(21, 34, 25, .12);
      --accent: #0e7a44; --accent-2: #b5480f; --danger: #b42318; --on-accent: #ffffff;
      --thead: #e6ece6; --hover: rgba(14, 122, 68, .07); --sorted: rgba(14, 122, 68, .12); --stripe: rgba(0, 0, 0, .028);
      --bg-grad: linear-gradient(180deg, #f7f9f5, #f2f5f0); --modal-bg: rgba(21, 34, 25, .55);
    }
    :root[data-theme="dark"] {
      --field: #0a1f14; --field-2: #0e2a1b; --card: #0d2519;
      --chalk: #f8faf5; --chalk-dim: #d6e0d9;
      --line: #1d4030; --line-strong: #35624a; --line-soft: rgba(29, 64, 48, .5);
      --accent: #ffd23f; --accent-2: #f0783f; --danger: #ff7a6b; --on-accent: #1a1200;
      --thead: #0b2016; --hover: rgba(255, 210, 63, .07); --sorted: rgba(255, 210, 63, .14); --stripe: rgba(255, 255, 255, .025);
      --bg-grad: radial-gradient(120% 90% at 50% -10%, var(--field-2), var(--field) 60%); --modal-bg: rgba(10, 31, 20, .85);
    }
    html { scroll-behavior: auto; background: var(--field) }
    body, .sub, .status, .meta, #hint { font-weight: 500 }
    .chip { font-weight: 500 }
    .cond { font-weight: 500 }
    tbody td { font-weight: 500 }
    thead th { font-weight: 600 }
    .glossary .gloss-note, .glossary table.gloss td { font-weight: 500 }
    body { background: repeating-linear-gradient(90deg, transparent 0 119px, var(--stripe) 119px 120px), var(--bg-grad); color: var(--chalk) }
    header { position: relative }
    .theme { position: absolute; right: 0; top: 50px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--chalk-dim); background: var(--card); border: 1px solid var(--line-strong); border-radius: var(--radius); padding: 6px 10px; cursor: pointer }
    .theme:hover { color: var(--chalk); border-color: var(--accent) }
    .run, .dino-btn { color: var(--on-accent) }
    .chip { color: var(--chalk-dim); border-color: var(--line-strong) }
    .chip:hover { color: var(--chalk); border-color: var(--accent) }
    .search textarea, .results, .read, .totals, .glossary, #chart-container { background: var(--card) !important }
    .search textarea { border-color: var(--line-strong) }
    thead th { background: var(--thead) }
    tbody td { border-bottom-color: var(--line-soft) }
    tbody tr:hover { background: var(--hover) }
    tbody img, tbody .avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; vertical-align: middle; background: var(--line) }
    .season-badge, .team, .pos { font-family: 'IBM Plex Mono', monospace; color: var(--chalk-dim) }
    .modal { background-color: var(--modal-bg) }
    .modal-content { background: var(--card); border-color: var(--line-strong) }
    .glossary table.gloss td, .glossary table.gloss th { border-bottom-color: var(--line) }

    /* sortable headers: click for high-to-low, again to flip; the sorted column is marked */
    thead th { cursor: pointer; user-select: none }
    thead th:first-child { cursor: default }
    thead th:hover { color: var(--chalk) }
    thead th[data-col]:not(.sort-desc):not(.sort-asc):hover::after { content: " \\21C5"; opacity: .7 }
    thead th.sort-desc, thead th.sort-asc { background: var(--accent); color: var(--on-accent); box-shadow: none }
    thead th.sort-desc::after { content: " \\25BC"; font-size: 8px }
    thead th.sort-asc::after { content: " \\25B2"; font-size: 8px }
    tbody td.sorted { background: var(--sorted); font-weight: 600 }
    .career-grid thead th { cursor: pointer }
    .player-hint { font-weight: 400; letter-spacing: 0; text-transform: none; margin-left: 10px; opacity: .8 }

    /* player pages */
    .offpage { display: none !important }
    .player { margin-top: 18px }
    .player .back { display: inline-block; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--accent); text-decoration: none; margin-bottom: 14px }
    .player .back:hover { text-decoration: underline }
    .player-head { display: flex; gap: 20px; align-items: center; padding: 18px 20px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius) }
    .player-head img { width: 88px; height: 88px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent); background: var(--field) }
    .player-head h2 { margin: 0; font-family: Oswald, sans-serif; font-size: 34px; color: var(--chalk); letter-spacing: .01em }
    .player-head p { margin: 4px 0 0; color: var(--chalk-dim); font-size: 14px }
    .player-chart { margin-top: 14px; padding: 12px 16px; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius) }
    .player-h3 { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--chalk-dim); margin: 22px 0 8px }
    .career-grid { margin-top: 0; margin-left: 0 !important; width: 100% !important }
    .career-row td { font-weight: 600; color: var(--chalk); border-top: 2px solid var(--line-strong); background: var(--thead) }
    a.plink { color: var(--chalk); text-decoration: none; border-bottom: 1px solid var(--line-strong) }
    a.plink:hover { color: var(--accent); border-bottom-color: var(--accent) }
"""

def main():
    src = open(SRC, encoding="utf-8").read()
    head_end = src.index("<body>")
    head = src[:head_end]
    # the page title says what it is now
    head = re.sub(r"<title>.*?</title>", "<title>Gridiron — NFL stat engine</title>", head, count=1, flags=re.S)
    head = head.replace("</style>", EXTRA_CSS + "  </style>", 1)
    if 'rel="icon"' not in head:
        head = head.replace("</title>", "</title>\n  <meta name=\"description\" content=\"Gridiron: ask for NFL player-seasons in plain English — box score, EPA, CPOE, QBR, pressures, blitzes, coverage, Next Gen Stats — 2000 to now.\">\n  <link rel=\"icon\" href=\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='%230a1f14'/><text x='32' y='47' font-size='40' text-anchor='middle'>🏈</text></svg>\">", 1)
    out = head + BODY.replace("__V__", VERSION).lstrip("\n")
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(out)
    print(f"wrote {OUT} ({len(out):,} bytes, version {VERSION})")

if __name__ == "__main__":
    main()
