/**
 * JTBD map preview: right-hand "On this page" nav for chunked job sections.
 * Reads #map-nav-data JSON emitted by preview/map_nav.py.
 */
(function () {
  var dataEl = document.getElementById('map-nav-data');
  if (!dataEl) return;

  var data;
  try {
    data = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }

  var rhsPanel = document.getElementById('right-toc');
  if (!rhsPanel || !data.rhsByChunk) return;

  function esc(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function renderList(nodes, depth) {
    if (!nodes || !nodes.length) return '';
    var parts = ['<ul>'];
    nodes.forEach(function (node) {
      var cls = depth > 2 ? ' class="right-toc-too-deep"' : '';
      parts.push('<li' + cls + '><a href="#' + esc(node.anchor) + '">' + esc(node.title) + '</a>');
      if (node.children && node.children.length) {
        parts.push(renderList(node.children, depth + 1));
      }
      parts.push('</li>');
    });
    parts.push('</ul>');
    return parts.join('');
  }

  function renderRhs(chunkAnchor) {
    var nodes = data.rhsByChunk[chunkAnchor];
    if (!nodes || !nodes.length) {
      rhsPanel.innerHTML =
        '<div class="right-toc-title">On this page</div>' +
        '<p class="right-toc-empty">No nested sections</p>';
      return;
    }
    rhsPanel.innerHTML =
      '<div class="right-toc-title">On this page</div>' + renderList(nodes, 1);
    bindRhsScrollSpy();
  }

  function chunkForElement(el) {
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.chunkAnchor) {
        return el.dataset.chunkAnchor;
      }
      el = el.parentElement;
    }
    return null;
  }

  function bindRhsScrollSpy() {
    var links = rhsPanel.querySelectorAll('a[href^="#"]');
    if (!links.length || !window.jQuery) return;

    var $ = window.jQuery;
    var targets = [];
    links.forEach(function (link) {
      var id = link.getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (el) targets.push({ link: link, el: el });
    });

    function sync() {
      var scrollTop = $(document).scrollTop();
      var active = null;
      for (var i = targets.length - 1; i >= 0; i--) {
        if (scrollTop > $(targets[i].el).offset().top - 90) {
          active = targets[i].link;
          break;
        }
      }
      links.forEach(function (l) {
        l.classList.toggle('active', l === active);
      });
    }

    $(window).off('scroll.mapNavRhs').on('scroll.mapNavRhs', sync);
    sync();
  }

  function markChunkSections() {
    (data.chunkAnchors || []).forEach(function (anchor) {
      var el = document.getElementById(anchor);
      if (!el) return;
      var section = el.closest('.sect1, .sect2, .sectionbody') || el.parentElement;
      if (section) section.dataset.chunkAnchor = anchor;
    });
  }

  function activeChunkFromScroll() {
    var best = null;
    var bestTop = -Infinity;
    (data.chunkAnchors || []).forEach(function (anchor) {
      var el = document.getElementById(anchor);
      if (!el) return;
      var top = el.getBoundingClientRect().top;
      if (top <= 120 && top > bestTop) {
        bestTop = top;
        best = anchor;
      }
    });
    return best || (data.chunkAnchors && data.chunkAnchors[0]);
  }

  markChunkSections();
  var current = activeChunkFromScroll();
  if (current) renderRhs(current);

  var scrollTimer;
  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      var next = activeChunkFromScroll();
      if (next && next !== current) {
        current = next;
        renderRhs(current);
      } else {
        bindRhsScrollSpy();
      }
    }, 80);
  });

  document.getElementById('toc').addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (data.rhsByChunk[id]) {
      current = id;
      setTimeout(function () { renderRhs(id); }, 50);
    }
  });
})();
