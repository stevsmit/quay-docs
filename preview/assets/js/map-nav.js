/**
 * JTBD Surge preview: map-preview style RHS ("On this page").
 *
 * LHS: category MAP jobs (levels 1–2).
 * RHS: in-page detail for the active job — ==/=== subs and toc="no" modules.
 * Assembly modules already on the LHS are omitted unless they group ==/=== subs
 * (then kept as a collapsible parent); toc_no-only wrappers promote their children.
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

  var SCROLL_LINE = 120;
  var currentChunk = null;
  var expandedByChunk = {};

  function esc(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function headingTop(anchor) {
    var el = document.getElementById(anchor);
    if (!el) return null;
    return el.getBoundingClientRect().top;
  }

  function expandedSet(chunk) {
    if (!expandedByChunk[chunk]) expandedByChunk[chunk] = new Set();
    return expandedByChunk[chunk];
  }

  function isExpanded(chunk, anchor) {
    return expandedSet(chunk).has(anchor);
  }

  function renderNavNode(node, chunk) {
    var hasChildren = node.children && node.children.length;
    if (!hasChildren) {
      return '<li><a href="#' + esc(node.anchor) + '">' + esc(node.title) + '</a></li>';
    }

    var expanded = isExpanded(chunk, node.anchor);
    var parts = ['<li class="rhs-collapsible' + (expanded ? ' expanded' : '') + '">'];
    parts.push(
      '<button type="button" class="rhs-chevron" aria-label="' +
        (expanded ? 'Collapse section' : 'Expand section') +
        '" aria-expanded="' +
        (expanded ? 'true' : 'false') +
        '"></button>'
    );
    parts.push(
      '<a href="#' +
        esc(node.anchor) +
        '" class="rhs-parent">' +
        esc(node.title) +
        '</a>'
    );
    parts.push(renderChildList(node.children, chunk));
    parts.push('</li>');
    return parts.join('');
  }

  function renderChildList(nodes, chunk) {
    if (!nodes || !nodes.length) return '';
    var parts = ['<ul>'];
    nodes.forEach(function (node) {
      parts.push(renderNavNode(node, chunk));
    });
    parts.push('</ul>');
    return parts.join('');
  }

  function renderChunkRhs(roots, chunk) {
    if (!roots || !roots.length) {
      return (
        '<div class="right-toc-title">On this page</div>' +
        '<p class="right-toc-empty">No sections in this job</p>'
      );
    }

    var parts = ['<div class="right-toc-title">On this page</div>', '<ul class="rhs-list">'];
    roots.forEach(function (l1) {
      parts.push(renderNavNode(l1, chunk));
    });
    parts.push('</ul>');
    return parts.join('');
  }

  function bindRhsCollapse(chunk) {
    rhsPanel.querySelectorAll('li.rhs-collapsible').forEach(function (li) {
      var link = li.querySelector(':scope > a.rhs-parent');
      if (!link) return;
      var anchor = link.getAttribute('href').slice(1);

      function toggleExpand() {
        var set = expandedSet(chunk);
        if (set.has(anchor)) {
          set.delete(anchor);
        } else {
          set.add(anchor);
        }
        renderChunk(chunk);
      }

      var btn = li.querySelector(':scope > .rhs-chevron');
      if (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          toggleExpand();
        });
      }
      link.addEventListener('click', function () {
        if (!isExpanded(chunk, anchor)) {
          expandedSet(chunk).add(anchor);
          renderChunk(chunk);
        }
      });
    });
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

  function activeChunkFromScroll() {
    var best = null;
    var bestTop = -Infinity;
    (data.chunkAnchors || []).forEach(function (anchor) {
      var top = headingTop(anchor);
      if (top !== null && top <= SCROLL_LINE && top > bestTop) {
        bestTop = top;
        best = anchor;
      }
    });
    return best;
  }

  function renderChunk(chunk) {
    var roots = data.rhsByChunk[chunk];
    rhsPanel.innerHTML = renderChunkRhs(roots, chunk);
    bindRhsCollapse(chunk);
    bindRhsScrollSpy();
  }

  function syncChunkFromScroll() {
    var chunk = activeChunkFromScroll();
    if (!chunk || !data.rhsByChunk[chunk]) {
      if (currentChunk !== null) {
        rhsPanel.innerHTML =
          '<div class="right-toc-title">On this page</div>' +
          '<p class="right-toc-empty">Scroll to a job section</p>';
        currentChunk = null;
      }
      return;
    }
    if (chunk !== currentChunk) {
      currentChunk = chunk;
      renderChunk(chunk);
    } else {
      bindRhsScrollSpy();
    }
  }

  syncChunkFromScroll();

  var scrollTimer;
  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncChunkFromScroll, 80);
  });

  var toc = document.getElementById('toc');
  if (toc) {
    toc.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (data.rhsByChunk[id]) {
        currentChunk = id;
        renderChunk(id);
      }
    });
  }
})();
