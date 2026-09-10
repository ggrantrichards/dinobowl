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
  <div class="wrap">
    <header>
      <p class="eyebrow">NFL stat engine · nflverse · PFR advanced · Next Gen Stats · ESPN QBR</p>
      <h1>Grid<span>iron</span></h1>
      <p class="sub">Ask for player-seasons in plain-ish English. Every number is a real season line, 2000 to now.</p>
      <div class="meta" id="meta"><span>loading the stat table…</span></div>
    </header>

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

    <div class="totals" id="totals" style="display:none"></div>

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
    <button class="dino-mute" id="dinoMute" type="button" aria-pressed="false" title="Mute Dino Bowl">🔊</button>
    <button class="dino-btn" id="dinoBtn" title="8-bit football. With dinosaurs.">🦖 DINO BOWL</button>
  </div>
  <div class="dino-panel" id="dinoPanel">
    <div class="dino-head">
      <span>DINO BOWL — retro football, but Cretaceous</span>
      <a href="/game/" target="_blank">open full screen ↗</a>
    </div>
    <iframe id="dinoFrame" title="Dino Bowl"></iframe>
  </div>

  <!-- Modal -->
  <div id="playerModal" class="modal">
    <div class="modal-content">
      <span class="close" onclick="closeModal()">&times;</span>
      <div id="modal-body"></div>
    </div>
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
      EXAMPLES.forEach((ex, i) => { const b = document.createElement('button'); b.className = 'chip' + (i >= 6 ? ' extra' : ''); b.textContent = ex; b.onclick = () => { q.value = ex; q.focus(); run(); }; box.appendChild(b); });
      if (EXAMPLES.length > 6) {
        const more = document.createElement('button'); more.className = 'chip more'; more.textContent = (EXAMPLES.length - 6) + ' more examples ▾';
        more.onclick = () => { const open = box.classList.toggle('open'); more.textContent = open ? 'fewer examples ▴' : (EXAMPLES.length - 6) + ' more examples ▾'; };
        box.appendChild(more);
      }
    }

    let scatterChart = null, lineChart = null;
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
        data: { datasets: [{ label: `${head(xAxis)} vs ${head(yAxis)}`, data, backgroundColor: '#ffd23f', pointRadius: 4, pointHoverRadius: 6 }] },
        options: {
          plugins: { tooltip: { callbacks: { label: (c) => { const d = c.raw; return `${d.name} (${d.season}): ${d.x}, ${d.y}`; } } } },
          scales: { x: { title: { display: true, text: head(xAxis), color: '#9db0a4' }, grid: { color: '#1d4030' }, ticks: { color: '#9db0a4' } },
                    y: { title: { display: true, text: head(yAxis), color: '#9db0a4' }, grid: { color: '#1d4030' }, ticks: { color: '#9db0a4' } } }
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
    async function openModal(tr) {
      const pid = tr.getAttribute('data-id'); if (!pid) return;
      const modal = document.getElementById('playerModal'), body = document.getElementById('modal-body');
      body.innerHTML = 'Loading career…'; modal.style.display = 'block';
      try {
        const rows = (await loadTable()).career(pid);
        if (!rows.length) { body.innerHTML = 'No seasons found.'; return; }
        const last = rows[rows.length - 1], pos = last.position || '';
        const g = groupOf(pos);
        const statKey = g === 'QB' ? 'passing_yards' : g === 'RB' ? 'rushing_yards' : g === 'DEF' ? 'tackles' : g === 'K' ? 'fg_made' : g === 'P' ? 'punts' : 'receiving_yards';
        const valid = rows.filter(r => r[statKey] != null);
        const best = valid.length ? valid.reduce((a, b) => (b[statKey] || 0) > (a[statKey] || 0) ? b : a) : rows[0];
        const cols = CAREER_COLS[g].filter(c => rows.some(r => r[c] != null));
        const bio = [pos, last.recent_team, last.height != null ? fmt('height', last.height) : null, last.weight != null ? last.weight + ' lbs' : null,
          last.age != null ? 'Age ' + last.age : null, last.college || null,
          last.draft_year ? `Drafted ${last.draft_year} · Rd ${last.draft_round || '–'} · Pick ${last.draft_pick || '–'}` : (last.rookie_season ? 'Undrafted · rookie ' + last.rookie_season : null)].filter(Boolean).join(' · ');
        body.innerHTML = `
          <div class="modal-header">
            <img src="${last.headshot_url || ''}" onerror="this.style.display='none'">
            <div><h2>${last.player_display_name}</h2><p>${bio}</p>
              <p>Best season (${head(statKey)}): <b>${fmt(statKey, best[statKey])}</b> in ${best.season}</p></div>
          </div>
          <canvas id="lineChart" height="90"></canvas>
          <div class="results career"><table><thead><tr><th>Yr</th><th>Tm</th>${cols.map(c => `<th>${head(c)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr><td><span class="season-badge">${r.season}</span></td><td>${r.recent_team || ''}</td>${cols.map(c => `<td>${fmt(c, r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        const ctx = document.getElementById('lineChart').getContext('2d');
        if (lineChart) lineChart.destroy();
        lineChart = new Chart(ctx, { type: 'line', data: { labels: rows.map(r => r.season), datasets: [{ label: head(statKey), data: rows.map(r => r[statKey] || 0), borderColor: '#ffd23f', backgroundColor: 'rgba(255, 210, 63, 0.2)', fill: true, tension: 0.3 }] },
          options: { scales: { x: { grid: { color: '#1d4030' }, ticks: { color: '#9db0a4' } }, y: { grid: { color: '#1d4030' }, ticks: { color: '#9db0a4' }, beginAtZero: true } } } });
      } catch (e) { body.innerHTML = 'Failed to load details: ' + e.message; }
    }
    function closeModal() { document.getElementById('playerModal').style.display = 'none'; }
    window.onclick = function (e) { const m = document.getElementById('playerModal'); if (e.target == m) m.style.display = 'none'; };

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
        conds.innerHTML = d.notes.map((n) => `<div class="cond ${kind(n)}">${pill(n)}</div>`).join('')
          + ((d.ignored && d.ignored.length)
            ? `<div class="cond ignored">couldn't read ${d.ignored.map(x => '“' + esc(x) + '”').join(', ')} — not used as a filter</div>` : '');
        read.classList.add('show');
        status.innerHTML = `<span class="count">${d.count.toLocaleString()}</span> player-season${d.count === 1 ? '' : 's'} matched` + (d.truncated ? ' · showing first 2000' : '');
        renderTotals(d); renderTable(d); renderScatter(d.rows, d.columns);
      } catch (e) { status.className = 'status error'; status.textContent = 'Something broke: ' + e.message; }
      finally { runBtn.disabled = false; runBtn.textContent = 'Run query'; }
    }

    // "who has the most X since 2021" is about a SPAN, but every row below is
    // one season. This adds the per-player totals over the matched seasons, so
    // the question has its actual answer on screen.
    function renderTotals(d) {
      const box = document.getElementById('totals');
      if (!d.totals) { box.style.display = 'none'; return; }
      const t = d.totals, name = head(t.col);
      const top = Math.max(...t.rows.map(r => r.total)) || 1;
      box.innerHTML = `<h3>${name} · totals over the ${t.spanned} matched seasons</h3>` +
        t.rows.map((r, i) => `<div class="tot-row"><div class="tot-bar" style="width:${(100 * r.total / top).toFixed(1)}%"></div><span class="tot-rank">${i + 1}</span>` +
          `<span class="tot-name">${r.name || '—'}</span><span class="tot-team">${r.team || ''}</span>` +
          `<span class="tot-val">${fmt(t.col, r.total)}</span>` +
          `<span class="tot-sub">${r.seasons} season${r.seasons === 1 ? '' : 's'}</span></div>`).join('');
      box.style.display = 'block';
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
    let LAST = null, SORT = null;   // the rows on screen and how they are sorted
    function renderTable(d) {
      const res = document.getElementById('results');
      if (!d.rows.length) { res.style.display = 'none'; document.getElementById('scrollTop').style.display = 'none'; return; }
      LAST = { rows: d.rows, cols: d.columns.filter(c => c !== 'player_id' && c !== 'headshot_url') };
      SORT = null;
      const thead = document.getElementById('thead');
      thead.innerHTML = '<tr><th></th>' + LAST.cols.map(c => `<th data-col="${c}" class="${TXT.has(c) ? 'txt' : ''}" title="${(META.display[c] || c).replace(/"/g, '')} — click to sort">${head(c)}</th>`).join('') + '</tr>';
      thead.onclick = (e) => { const th = e.target.closest('th[data-col]'); if (th) sortBy(th.dataset.col); };
      renderBody(d.rows);
      res.style.display = 'block';
      syncScrollbars();
    }
    function renderBody(rows) {
      const tbody = document.getElementById('tbody'), sc = SORT && SORT.col;
      tbody.innerHTML = rows.map(row => {
        const imgStr = row.headshot_url ? `<img src="${row.headshot_url}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">` : `<div class="avatar" style="display:inline-block"></div>`;
        const tds = `<td style="padding:4px 10px;text-align:center;">${imgStr}</td>` + LAST.cols.map(c => {
          const val = c === 'season' ? `<span class="season-badge">${row[c]}</span>` : c === 'recent_team' ? `<span class="team">${row[c] || '—'}</span>` : c === 'position' ? `<span class="pos">${row[c] || '—'}</span>` : fmt(c, row[c]);
          const cls = (c === 'player_display_name' ? 'name txt' : TXT.has(c) ? 'txt' : '') + (c === sc ? ' sorted' : '');
          return `<td class="${cls}">${val}</td>`;
        }).join('');
        return `<tr data-id="${row.player_id}" onclick="openModal(this)" style="cursor:pointer" title="Click for career history">${tds}</tr>`;
      }).join('');
    }
    // first click sorts high-to-low (A-Z for text), the next click flips it; blanks always sink to the bottom
    function sortBy(col) {
      if (!LAST) return;
      SORT = SORT && SORT.col === col ? { col, dir: SORT.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: TXT.has(col) ? 'asc' : 'desc' };
      const dir = SORT.dir === 'desc' ? -1 : 1;
      const rows = LAST.rows.slice().sort((a, b) => {
        const va = a[col], vb = b[col];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const c = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb));
        return c * dir;
      });
      document.querySelectorAll('#thead th').forEach(th => { th.classList.remove('sort-desc', 'sort-asc'); th.removeAttribute('aria-sort'); if (th.dataset.col === col) { th.classList.add('sort-' + SORT.dir); th.setAttribute('aria-sort', SORT.dir === 'desc' ? 'descending' : 'ascending'); } });
      renderBody(rows);
    }

    q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } });
    runBtn.addEventListener('click', run);
    renderExamples();
    // warm the table in the background so the first question answers fast
    loadTable().catch(e => { status.className = 'status error'; status.textContent = 'Could not load the stat table: ' + e.message; });

    // DINO BOWL background-play widget
    const dinoBtn = document.getElementById('dinoBtn'), dinoPanel = document.getElementById('dinoPanel'), dinoFrame = document.getElementById('dinoFrame');
    dinoBtn.addEventListener('click', () => {
      const open = dinoPanel.classList.toggle('open');
      if (open && !dinoFrame.src) dinoFrame.src = '/game/';
      dinoBtn.textContent = open ? '🦖 HIDE DINO BOWL' : '🦖 DINO BOWL';
    });

    // MUTE. The state lives in localStorage, which the game reads at boot and
    // writes when you press M inside it, so the two always agree — and a mute
    // set before the game is ever opened still lands. While the game is up we
    // also post to it, so the click is instant rather than reload-shaped.
    const MUTE_KEY = 'dinobowl_muted', dinoMute = document.getElementById('dinoMute');
    const isMuted = () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (_) { return false; } };
    function paintMute(on) {
      dinoMute.textContent = on ? '🔇' : '🔊';
      dinoMute.classList.toggle('is-muted', on);
      dinoMute.setAttribute('aria-pressed', on ? 'true' : 'false');
      dinoMute.title = on ? 'Dino Bowl is muted — click for sound' : 'Mute Dino Bowl';
    }
    function setMuted(on) {
      try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch (_) { }
      paintMute(on);
      try { if (dinoFrame.contentWindow) dinoFrame.contentWindow.postMessage({ dinobowl: 'setMuted', muted: on }, location.origin); } catch (_) { }
    }
    dinoMute.addEventListener('click', () => setMuted(!isMuted()));
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
    /* ============ 2.3 design system: broadcast-night palette, real surfaces ============
       The template's own rules come first; everything here overrides them. */
    :root {
      --field: #0a0e13; --field-2: #0f1620;
      --card: #121a23; --card-2: #17212c;
      --line: #22303f; --line-2: #2f4155;
      --chalk: #eef2f6; --chalk-dim: #97a5b4;
      --accent: #ffc531; --accent-2: #35d07f;
      --blue: #62aeff; --violet: #b096ff; --danger: #ff6b6b;
      --radius: 12px; --radius-sm: 7px;
      --shadow: 0 12px 34px rgba(0, 0, 0, .38);
      --gold-grad: linear-gradient(135deg, #ffd86a 0%, #ffc531 55%, #f0a91b 100%);
    }
    html { background: var(--field) }
    body {
      background:
        radial-gradient(1100px 520px at 50% -180px, rgba(31, 92, 62, .55) 0%, rgba(31, 92, 62, 0) 70%),
        repeating-linear-gradient(90deg, transparent 0 119px, rgba(255, 255, 255, .018) 119px 120px),
        linear-gradient(180deg, #0c131b 0%, var(--field) 55%);
      background-attachment: fixed;
      font-family: Inter, system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .wrap { padding: 0 24px 96px }
    header { padding: 44px 0 22px; border-bottom: 0 }
    .eyebrow { font-family: Inter, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .18em; color: var(--accent-2); display: flex; align-items: center; gap: 8px }
    .eyebrow::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--accent-2); box-shadow: 0 0 10px var(--accent-2) }
    h1 { font-size: clamp(44px, 6.4vw, 76px); line-height: .95; letter-spacing: .01em; color: var(--chalk); margin: 8px 0 10px }
    h1 span { background: var(--gold-grad); -webkit-background-clip: text; background-clip: text; color: transparent }
    .sub { font-size: 16px; color: var(--chalk-dim); max-width: 62ch; margin: 0 0 18px }
    #meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; max-width: 720px; font-family: Inter, sans-serif; letter-spacing: 0; text-transform: none }
    #meta span { display: block; background: linear-gradient(180deg, var(--card-2), var(--card)); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 10px 14px; font-size: 11px; color: var(--chalk-dim); text-transform: uppercase; letter-spacing: .08em }
    #meta b { display: block; font-family: Oswald, sans-serif; font-weight: 600; font-size: 22px; color: var(--chalk); letter-spacing: .01em; margin-top: 2px }
    @media (max-width: 640px) { #meta { grid-template-columns: repeat(2, minmax(0, 1fr)) } }

    /* ---- surfaces */
    .search, .read, .totals, .results, .glossary, #chart-container {
      background: linear-gradient(180deg, var(--card-2), var(--card)) !important;
      border: 1px solid var(--line) !important; border-radius: var(--radius) !important; box-shadow: var(--shadow);
    }
    .search { margin-top: 22px; padding: 18px }
    .search textarea {
      background: #0b1119; border: 1px solid var(--line-2); border-radius: var(--radius-sm); color: var(--chalk);
      font-family: Inter, sans-serif; font-size: 17px; line-height: 1.45; padding: 14px 16px; min-height: 64px;
      transition: border-color .15s, box-shadow .15s;
    }
    .search textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(255, 197, 49, .18); outline: 0 }
    .bar { margin-top: 12px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap }
    .run {
      background: var(--gold-grad); color: #1a1200; border: 0; border-radius: var(--radius-sm);
      font-family: Oswald, sans-serif; font-weight: 600; font-size: 15px; letter-spacing: .08em; text-transform: uppercase;
      padding: 11px 22px; cursor: pointer; box-shadow: 0 6px 18px rgba(255, 197, 49, .22); transition: transform .12s, box-shadow .12s, filter .12s;
    }
    .run:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(255, 197, 49, .3); filter: brightness(1.04) }
    .run:disabled { opacity: .7; transform: none; cursor: progress }
    #hint { font-family: Inter, sans-serif; font-size: 12px; color: var(--chalk-dim) }
    .examples { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px }
    .chip {
      font-family: Inter, sans-serif; font-size: 12.5px; color: var(--chalk-dim); background: rgba(255, 255, 255, .03);
      border: 1px solid var(--line-2); border-radius: 999px; padding: 7px 13px; cursor: pointer; text-align: left; line-height: 1.3;
      transition: transform .12s, border-color .12s, color .12s, background .12s;
    }
    .chip:hover { transform: translateY(-1px); border-color: var(--accent); color: var(--chalk); background: rgba(255, 197, 49, .06) }
    .chip.extra { display: none }
    .examples.open .chip.extra { display: inline-block }
    .chip.more { color: var(--accent); border-style: dashed }

    /* ---- how I read that: pills, coloured by what they do */
    .read { margin-top: 18px; padding: 14px 18px 16px; border-left: 1px solid var(--line) !important }
    .read h3 { font-family: Inter, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .14em; color: var(--chalk-dim); margin: 0 0 10px }
    .conds { display: flex; flex-wrap: wrap; gap: 8px; border-left: 0; padding: 0 }
    .cond {
      font-family: Inter, sans-serif; font-size: 13.5px; font-weight: 500; letter-spacing: 0; padding: 7px 13px; border-radius: 999px;
      border: 1px solid var(--line-2); background: rgba(255, 255, 255, .03); color: var(--chalk); display: inline-flex; align-items: center; gap: 6px;
    }
    .cond::before { display: none }
    .cond .and { display: none }
    .cond.k-pos { border-color: rgba(98, 174, 255, .5); background: rgba(98, 174, 255, .10); color: #cfe4ff }
    .cond.k-season { border-color: rgba(176, 150, 255, .5); background: rgba(176, 150, 255, .10); color: #e2d9ff }
    .cond.k-sort { border-color: rgba(53, 208, 127, .5); background: rgba(53, 208, 127, .10); color: #c8f5dc }
    .cond.k-flag { border-color: rgba(255, 197, 49, .55); background: rgba(255, 197, 49, .10); color: #ffe7a3 }
    .cond.k-filter b { color: var(--accent); font-weight: 600 }
    .cond.ignored { border-color: rgba(255, 107, 107, .6); background: rgba(255, 107, 107, .10); color: #ffd1d1 }

    .status { margin-top: 18px; font-family: Inter, sans-serif; font-size: 14px; color: var(--chalk-dim) }
    .status .count { font-family: Oswald, sans-serif; font-size: 26px; font-weight: 600; color: var(--chalk); margin-right: 6px; letter-spacing: .01em }
    .status.error { color: var(--danger); font-weight: 500 }

    /* ---- totals leaderboard with bars */
    .totals { margin-top: 18px; padding: 14px 18px 8px }
    .totals h3 { font-family: Inter, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--chalk-dim); margin: 0 0 10px }
    .tot-row { position: relative; display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-bottom: 1px solid rgba(255, 255, 255, .04); border-radius: 6px; overflow: hidden; font-family: Inter, sans-serif; font-size: 14px }
    .tot-row:last-child { border-bottom: 0 }
    .tot-bar { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, rgba(255, 197, 49, .16), rgba(255, 197, 49, .04)); pointer-events: none }
    .tot-row > span { position: relative }
    .tot-rank { width: 22px; font-family: Oswald, sans-serif; font-weight: 600; font-size: 15px; color: var(--chalk-dim); text-align: right }
    .tot-row:nth-child(2) .tot-rank { color: var(--accent) }
    .tot-row:nth-child(3) .tot-rank { color: #d6dde6 }
    .tot-row:nth-child(4) .tot-rank { color: #d9a066 }
    .tot-name { flex: 1; font-weight: 600; color: var(--chalk) }
    .tot-team { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--chalk-dim); border: 1px solid var(--line-2); border-radius: 4px; padding: 1px 6px }
    .tot-val { font-family: 'IBM Plex Mono', monospace; font-size: 15px; font-weight: 600; color: var(--accent); min-width: 56px; text-align: right }
    .tot-sub { font-size: 11px; color: var(--chalk-dim); min-width: 68px; text-align: right }

    /* ---- the table: the page's centrepiece */
    .results { margin-top: 18px; max-height: calc(100vh - 24px); overflow: auto; width: min(100%, var(--table-w, 100%)) }
    .scroll-top { margin-top: 18px; overflow-x: auto; overflow-y: hidden; height: 14px; width: min(100%, var(--table-w, 100%)) }
    .scroll-top > div { height: 1px }
    .scroll-top + .results { margin-top: 0; border-top-left-radius: 0 !important; border-top-right-radius: 0 !important }
    @media (min-width: 1240px) {
      /* the table may use the whole monitor even though the copy above it stays at 1180px */
      .scroll-top, .results { margin-left: calc(50% - 50vw + 24px); width: min(calc(100vw - 48px), var(--table-w, 100vw)) }
    }
    table { font-size: 13px }
    thead th {
      background: #0d141c; color: #aab7c5; font-family: Inter, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .07em;
      padding: 12px 13px; border-bottom: 1px solid var(--line-2); cursor: pointer; user-select: none; transition: color .12s, background .12s;
    }
    thead th:first-child { cursor: default }
    thead th:hover { color: var(--chalk) }
    thead th.sort-desc, thead th.sort-asc { color: var(--accent); background: #121c27 }
    thead th.sort-desc::after { content: " ▼"; font-size: 9px }
    thead th.sort-asc::after { content: " ▲"; font-size: 9px }
    tbody td { font-family: 'IBM Plex Mono', monospace; font-size: 13px; padding: 9px 13px; border-bottom: 1px solid rgba(255, 255, 255, .045); color: #d7dee6 }
    tbody td.txt { font-family: Inter, sans-serif }
    tbody td.name { font-family: Inter, sans-serif; font-weight: 600; font-size: 14px; color: var(--chalk); letter-spacing: 0 }
    tbody td.sorted { background: rgba(255, 197, 49, .07); color: var(--chalk) }
    tbody tr:nth-child(even) td { background-color: rgba(255, 255, 255, .015) }
    tbody tr:nth-child(even) td.sorted { background-color: rgba(255, 197, 49, .09) }
    tbody tr:hover td { background-color: rgba(53, 208, 127, .09) }
    tbody img, tbody .avatar { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; vertical-align: middle; background: var(--card-2); border: 1px solid var(--line-2) }
    .season-badge { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #cfe4ff; background: rgba(98, 174, 255, .12); border: 1px solid rgba(98, 174, 255, .35); border-radius: 5px; padding: 2px 7px }
    .team { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: var(--chalk-dim); border: 1px solid var(--line-2); border-radius: 4px; padding: 2px 6px }
    .pos { font-family: Inter, sans-serif; font-size: 11px; font-weight: 600; color: var(--chalk-dim); letter-spacing: .06em }
    .yes { color: var(--accent-2); font-weight: 600 }
    .no { color: var(--chalk-dim) }
    tbody tr:hover td.name { color: #ffffff }

    #chart-container { margin-top: 18px; padding: 16px 18px }

    /* ---- glossary, career, modal */
    .glossary { margin-top: 24px; padding: 12px 18px }
    .glossary summary { font-family: Inter, sans-serif; font-size: 13.5px; font-weight: 600; color: var(--accent); cursor: pointer; padding: 6px 0 }
    .glossary .gloss-note { font-size: 13px; color: var(--chalk-dim); line-height: 1.55 }
    .glossary table.gloss { width: 100%; border-collapse: collapse; font-size: 12.5px }
    .glossary table.gloss th, .glossary table.gloss td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; font-family: Inter, sans-serif }
    .glossary table.gloss th { color: var(--chalk-dim); font-weight: 600 }
    .results.career { margin-top: 14px; max-height: 320px; overflow: auto; margin-left: 0 !important; width: 100% !important }
    .results.career table { font-size: 12px }
    .modal { background-color: rgba(6, 10, 14, .78) }
    .modal-content { background: linear-gradient(180deg, var(--card-2), var(--card)); border: 1px solid var(--line-2); border-radius: 14px; box-shadow: var(--shadow) }
    .modal-header img { border-color: var(--accent) }
    .modal-header p { margin: 4px 0; color: var(--chalk-dim); font-size: 13px }

    /* ---- Dino Bowl dock: launcher and mute share the corner, so the mute stays
       put (and clickable) whether the panel is open or not */
    .dino-dock { position: fixed; right: 22px; bottom: 22px; z-index: 1200; display: flex; align-items: stretch; gap: 8px }
    .dino-dock .dino-btn { position: static; right: auto; bottom: auto; background: var(--gold-grad); border-radius: var(--radius-sm); font-family: Oswald, sans-serif; font-size: 14px; letter-spacing: .08em; padding: 12px 18px }
    .dino-mute {
      width: 44px; flex: none; display: inline-flex; align-items: center; justify-content: center;
      font-size: 18px; line-height: 1; cursor: pointer; padding: 0;
      background: var(--card-2); color: var(--chalk); border: 1px solid var(--accent); border-radius: var(--radius-sm);
      box-shadow: 0 6px 24px rgba(0, 0, 0, .45); transition: transform .1s, filter .15s;
    }
    .dino-mute:hover { filter: brightness(1.3); transform: translateY(-1px) }
    .dino-mute:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
    .dino-mute.is-muted { background: var(--accent); color: #1a1200 }
    .dino-panel { border-radius: var(--radius); border-color: var(--line-2); background: #070b0f }

    /* ---- motion */
    @keyframes rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
    .read.show, .totals, .results, #chart-container { animation: rise .28s ease-out }
    @media (prefers-reduced-motion: reduce) { .read.show, .totals, .results, #chart-container { animation: none } }
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
