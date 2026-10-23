/*
 * Runtime das páginas do site SF Damaiense (formato de componentes exportado do protótipo).
 * Cada página traz um modelo (<x-dc>) e uma classe Component com renderVals().
 * Este ficheiro desenha o modelo com os valores e, a cada setState, só atualiza o que mudou
 * (morphdom) — mantém foco, texto escrito em formulários e vídeos a correr.
 * Requer /js/vendor/morphdom-umd.min.js carregado antes.
 */
(function () {
  'use strict';
  var EVENTS = ['click', 'input', 'change', 'error', 'submit', 'keydown'];
  var handlers = [];

  window.DCLogic = function DCLogic(props) { this.props = props || {}; this.state = {}; };
  var pending = false;
  window.DCLogic.prototype.setState = function (u) {
    var p = typeof u === 'function' ? u(this.state) : u;
    this.state = Object.assign({}, this.state, p);
    if (!pending) { pending = true; Promise.resolve().then(function () { pending = false; window.__rerender && window.__rerender(); }); }
  };
  window.DCLogic.prototype.forceUpdate = function () { window.__rerender && window.__rerender(); };

  function look(ctx, path) {
    path = path.trim();
    if (path === 'true') return true; if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return +path;
    var parts = path.split('.'), v, i;
    for (i = ctx.length - 1; i >= 0; i--) { if (ctx[i] && parts[0] in ctx[i]) { v = ctx[i][parts[0]]; break; } }
    for (i = 1; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function interp(s, ctx) { return s.replace(/\{\{([^}]+)\}\}/g, function (m, p) { var v = look(ctx, p); return v == null ? '' : String(v); }); }
  var SVG = 'http://www.w3.org/2000/svg';
  var FIX = { clippath: 'clipPath', textpath: 'textPath', lineargradient: 'linearGradient', radialgradient: 'radialGradient', foreignobject: 'foreignObject' };

  function render(node, ctx, out, svg) {
    if (node.nodeType === 3) { out.appendChild(document.createTextNode(interp(node.nodeValue, ctx))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase(), i;
    if (tag === 'template' && node.hasAttribute('data-for')) {
      var list = look(ctx, node.getAttribute('data-for').replace(/[{}]/g, '')) || [], as = node.getAttribute('data-as');
      list.forEach(function (it, idx) { var c = { $index: idx }; c[as] = it; for (var k = 0; k < node.content.childNodes.length; k++) render(node.content.childNodes[k], ctx.concat([c]), out, svg); });
      return;
    }
    if (tag === 'template' && node.hasAttribute('data-if')) {
      if (look(ctx, node.getAttribute('data-if').replace(/[{}]/g, ''))) for (i = 0; i < node.content.childNodes.length; i++) render(node.content.childNodes[i], ctx, out, svg);
      return;
    }
    var isSvg = svg || tag === 'svg';
    var el = isSvg ? document.createElementNS(SVG, FIX[tag] || tag) : document.createElement(node.tagName);
    for (i = 0; i < node.attributes.length; i++) {
      var a = node.attributes[i], m = a.value.match(/^\{\{([^}]+)\}\}$/);
      if (/^on/i.test(a.name) && m) {
        var fn = look(ctx, m[1]);
        if (typeof fn === 'function') { handlers.push(fn); el.setAttribute('data-on-' + a.name.slice(2).toLowerCase(), String(handlers.length - 1)); }
        continue;
      }
      if (a.name.indexOf('hint-') === 0) continue;
      var v = interp(a.value, ctx);
      if (/^(href|src|action|formaction)$/i.test(a.name) && /^\s*javascript:/i.test(v)) v = '#';
      if (v.indexOf('/_blob/') !== -1) v = v.replace(/\/_blob\/([0-9a-f]{32})/g, function (m, id) { var e = (window.SFD_ASSETS || {})[id]; return e ? '/assets/' + id + '.' + e : m; });
      el.setAttribute(a.name, v);
    }
    // guarda o que veio do modelo, para distinguir do que os scripts da página acrescentam depois
    el.__sfdCls = el.getAttribute('class') || '';
    el.__sfdStyle = el.getAttribute('style') || '';
    var kids = tag === 'template' ? node.content.childNodes : node.childNodes;
    for (i = 0; i < kids.length; i++) render(kids[i], ctx, el, isSvg);
    out.appendChild(el);
  }

  // Classes e estilos acrescentados por scripts (ex.: "in" das animações de entrada, "scrolled"/"hide" do topo,
  // transform da barra de progresso) mantêm-se quando a página volta a desenhar.
  function keepScriptState(from, to) {
    if (from.__sfdCls !== undefined) {
      var base = {}; from.__sfdCls.split(/\s+/).forEach(function (c) { if (c) base[c] = 1; });
      var extra = []; for (var i = 0; i < from.classList.length; i++) if (!base[from.classList[i]]) extra.push(from.classList[i]);
      var tplCls = to.getAttribute('class') || '';
      if (extra.length) to.setAttribute('class', (tplCls + ' ' + extra.join(' ')).trim());
      to.__sfdCls = tplCls;
    }
    if (from.__sfdStyle !== undefined) {
      var tplStyle = to.getAttribute('style') || '';
      var cur = from.getAttribute('style') || '';
      if (tplStyle === from.__sfdStyle && cur !== from.__sfdStyle) { if (cur) to.setAttribute('style', cur); else to.removeAttribute('style'); }
      to.__sfdStyle = tplStyle;
    }
  }

  function keepFormState(from, to) {
    keepScriptState(from, to);
    var t = from.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') {
      if (!to.hasAttribute('value') && t !== 'SELECT') to.value = from.value;
      if (t === 'SELECT' && !to.querySelector('option[selected]')) to.value = from.value;
      if ((from.type === 'checkbox' || from.type === 'radio') && !to.hasAttribute('checked')) to.checked = from.checked;
      if (t === 'INPUT' && from.type === 'file') return false; // nunca recriar ficheiros escolhidos
    }
    if (t === 'VIDEO' || t === 'AUDIO') { for (var i = 0; i < to.attributes.length; i++) if (from.getAttribute(to.attributes[i].name) !== to.attributes[i].value) from.setAttribute(to.attributes[i].name, to.attributes[i].value); return false; }
    return true;
  }

  window.addEventListener('DOMContentLoaded', function () {
    // O modelo vem num <template id="x-dc"> (inerte: o browser não pede imagens com {{ }}).
    var xdc = document.getElementById('x-dc') || document.querySelector('x-dc');
    if (!xdc) return;
    var tpl;
    if (xdc.tagName === 'TEMPLATE') tpl = xdc;
    else {
      tpl = document.createElement('template');
      tpl.innerHTML = xdc.innerHTML
        .replace(/<sc-for\s+list="([^"]*)"\s+as="([^"]*)"[^>]*>/g, '<template data-for="$1" data-as="$2">').replace(/<\/sc-for>/g, '</template>')
        .replace(/<sc-if\s+value="([^"]*)"[^>]*>/g, '<template data-if="$1">').replace(/<\/sc-if>/g, '</template>');
    }
    var helmet = tpl.content.querySelector('helmet');
    if (helmet) { Array.prototype.slice.call(helmet.children).forEach(function (ch) { document.head.appendChild(document.importNode(ch, true)); }); helmet.remove(); }
    var sc = document.querySelector('script[data-dc-script]');
    var Comp = new Function('DCLogic', sc.textContent + '\nreturn Component;')(window.DCLogic);
    var props = {};
    try { var dp = JSON.parse(sc.getAttribute('data-props') || '{}'); for (var k in dp) if (dp[k] && 'default' in dp[k]) props[k] = dp[k].default; } catch (e) {}
    var inst = new Comp(props);
    var root = document.createElement('div'); root.id = 'sfd-root';
    xdc.replaceWith(root);

    EVENTS.forEach(function (type) {
      root.addEventListener(type, function (ev) {
        var el = ev.target;
        if (type === 'error') { var h = el && el.getAttribute && el.getAttribute('data-on-error'); if (h && handlers[h]) handlers[h].call(el, ev); return; }
        while (el && el !== root) {
          var id = el.getAttribute && el.getAttribute('data-on-' + type);
          if (id != null && handlers[id]) {
            var cur = ev.currentTarget; // emula o currentTarget do elemento com o handler
            try { Object.defineProperty(ev, 'currentTarget', { configurable: true, get: function () { return el; } }); } catch (e) {}
            handlers[id].call(el, ev);
            return;
          }
          el = el.parentNode;
        }
      }, true);
    });

    var first = true;
    window.__rerender = function () {
      handlers = [];
      var vals = inst.renderVals();
      var next = document.createElement('div'); next.id = 'sfd-root';
      for (var i = 0; i < tpl.content.childNodes.length; i++) render(tpl.content.childNodes[i], [vals], next);
      if (first) { root.innerHTML = ''; while (next.firstChild) root.appendChild(next.firstChild); first = false; return; }
      window.morphdom(root, next, { onBeforeElUpdated: function (f, t) { var r = keepFormState(f, t); if (r !== false) { f.__sfdCls = t.__sfdCls; f.__sfdStyle = t.__sfdStyle; } return r; } });
    };
    window.__rerender();
    if (inst.componentDidMount) inst.componentDidMount();
  });
})();
