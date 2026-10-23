/*
 * SF Damaiense — conteúdos geridos pelo painel.
 * Lê da base de dados (Supabase, só leitura pública via RLS) as notícias publicadas,
 * a cronologia, os órgãos sociais, os documentos e os horários da Academia,
 * e entrega-os às páginas no mesmo formato que elas já usavam.
 * Se a base de dados não responder, as páginas continuam a mostrar o conteúdo
 * que trazem escrito (nada parte).
 */
(function () {
  'use strict';
  var cfg = window.SFD_CONFIG || {};
  var store = {};
  var DIAS = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : ''; }
  function hhmm(t) { return t ? String(t).slice(0, 5).replace(':', 'h') : ''; }
  function partsText(parts) { return (parts || []).map(function (x) { return x.text || ''; }).join(''); }
  function blocksText(blocks) {
    var out = [];
    (blocks || []).forEach(function (b) {
      if (b.type === 'p') out.push(partsText(b.parts));
      else (b.items || []).forEach(function (it) { out.push(partsText(it)); });
    });
    return out.filter(function (t) { return t.trim(); });
  }
  function safeHref(h) { return /^(https?:\/\/|mailto:)/i.test(h || '') ? h : ''; }
  function publicFile(bucket, path) {
    return cfg.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/' + bucket + '/' + String(path).split('/').map(encodeURIComponent).join('/');
  }

  function get(path) {
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path, {
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, Accept: 'application/json' },
      cache: 'no-store'
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  var tasks = {
    news: function () {
      return get('news?select=slug,title,category,cover_url,published_at,body&order=published_at.desc,created_at.desc').then(function (rows) {
        return rows.map(function (n) {
          var paras = blocksText(n.body);
          var words = paras.join(' ').split(/\s+/).filter(Boolean).length;
          return { slug: n.slug, title: n.title, cat: n.category, iso: n.published_at, date: fmtDate(n.published_at),
            img: n.cover_url || '', min: Math.max(1, Math.round(words / 200)), body: paras.length ? paras : [''], blocks: n.body };
        });
      });
    },
    history: function () {
      return get('history_events?select=year,description&order=year.asc,created_at.asc').then(function (rows) {
        return rows.map(function (h) { return { y: String(h.year), t: h.description }; });
      });
    },
    bodies: function () {
      return Promise.all([get('board_bodies?select=id,name&order=sort.asc'), get('board_members?select=body_id,role,full_name,mandate&order=sort.asc,created_at.asc')])
        .then(function (r) {
          var mand = {};
          r[1].forEach(function (m) { if (m.mandate) mand[m.mandate] = (mand[m.mandate] || 0) + 1; });
          store.mandate = Object.keys(mand).sort(function (a, b) { return mand[b] - mand[a]; })[0] || '';
          return r[0].map(function (b) {
            return { name: b.name, roles: r[1].filter(function (m) { return m.body_id === b.id; })
              .map(function (m) { return { role: m.role, name: m.full_name || 'A designar' }; }) };
          }).filter(function (b) { return b.roles.length; });
        });
    },
    docs: function () {
      return get('documents?select=title,category,file_path,file_size,doc_date&order=sort.asc,created_at.desc').then(function (rows) {
        return rows.map(function (d) {
          return { t: d.title, m: [d.category, d.doc_date ? fmtDate(d.doc_date) : ''].filter(Boolean).join(' · '),
            href: publicFile('documentos', d.file_path), size: d.file_size ? (Math.max(1, Math.round(d.file_size / 1024)) + ' KB') : '' };
        });
      });
    },
    schedule: function () {
      return get('academy_schedule?select=escalao,idade,dias,hora_inicio,hora_fim,local,treinador,observacoes&order=sort.asc,created_at.asc').then(function (rows) {
        return rows.map(function (h) {
          var dias = (h.dias || []).slice().sort().map(function (d) { return DIAS[d]; }).join(' · ');
          var time = h.hora_inicio ? hhmm(h.hora_inicio) + (h.hora_fim ? '–' + hhmm(h.hora_fim) : '') : '';
          return { name: h.escalao, age: h.idade || '', days: dias || '[A confirmar]', time: time || '[A confirmar]',
            coach: h.treinador || '[A confirmar]', coachCls: h.treinador ? '' : 'na', local: h.local || '', obs: h.observacoes || '', hasObs: !!h.observacoes };
        });
      });
    },
    texts: function () {
      return get('site_texts?select=key,value').then(function (rows) {
        var o = {}; rows.forEach(function (r) { o[r.key] = r.value; }); return o;
      });
    }
  };

  var configured = !!(cfg.supabaseUrl && cfg.anonKey);
  // Damaiense TV: vídeos mais recentes do canal (função do Netlify /api/youtube), independente do Supabase.
  var videos = function () {
    return fetch('/api/youtube', { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
    }).then(function (j) { if (!j || !Array.isArray(j.videos) || !j.videos.length) throw new Error('sem vídeos'); return j.videos; });
  };
  var keys = configured ? Object.keys(tasks) : [];
  var ready = Promise.all(keys.map(function (k) {
    return tasks[k]().then(function (v) { store[k] = v; }, function (e) { store[k] = null; if (window.console) console.warn('[SFD] ' + k + ':', e.message); });
  }).concat([videos().then(function (v) { store.videos = v; }, function () { store.videos = null; })])).then(function () { return configured; });

  window.SFDContent = {
    ready: ready,
    /** Devolve os dados do painel, ou null para a página usar o seu conteúdo de origem. */
    get: function (name) {
      var v = store[name];
      if (v == null) return null;
      if (name === 'news' && !v.length) return null; // as páginas de notícias precisam de pelo menos uma
      return v;
    },
    text: function (key) { return store.texts && store.texts[key] ? store.texts[key] : null; },
    mandate: function () { return store.mandate || null; },
    /** Converte o texto estruturado de uma notícia para o formato dos modelos da página. */
    blocks: function (blocks) {
      return (blocks || []).map(function (b, i) {
        function parts(ps) {
          return (ps || []).map(function (p) {
            var href = safeHref(p.href);
            return { text: p.text || '', href: href, isLink: !!href, isBold: !href && !!p.bold, isPlain: !href && !p.bold, linkBold: !!href && !!p.bold };
          });
        }
        return { isP: b.type === 'p', isUl: b.type === 'ul', isOl: b.type === 'ol', cls: i === 0 && b.type === 'p' ? 'lead' : '',
          parts: parts(b.parts), items: (b.items || []).map(function (it) { return { parts: parts(it) }; }) };
      });
    }
  };
})();
