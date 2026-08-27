/**
 * JTBD Surge preview: map-preview style RHS ("On this page").
 *
 * LHS: category MAP jobs (levels 1–2).
 * RHS: assembly L1 modules for the active job — always listed, collapsible.
 * L2 modules and ==/=== subsections appear only when their L1 row is expanded.
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
  var expandedL1ByChunk = {};

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

  function renderChildTree(nodes) {
    if (!nodes || !nodes.length) return '';
    var parts = ['<ul>'];
    nodes.forEach(function (node) {
      parts.push('<li><a href="#' + esc(node.anchor) + '">' + esc(node.title) + '</a>');
      parts.push(renderChildTree(node.children));
      parts.push('</li>');
    });
    parts.push('</ul>');
    return parts.join('');
  }

  function renderChunkRhs(roots, expandedAnchor) {
    if (!roots || !roots.length) {
      return (
        '<div class="right-toc-title">On this page</div>' +
        '<p class="right-toc-empty">No sections in this job</p>'
      );
    }

    var parts = ['<div class="right-toc-title">On this page</div>', '<ul class="rhs-list">'];
    roots.forEach(function (l1) {
      var hasChildren = l1.children && l1.children.length;
      if (!hasChildren) {
        parts.push('<li><a href="#' + esc(l1.anchor) + '">' + esc(l1.title) + '</a></li>');
        return;
      }

      var expanded = expandedAnchor === l1.anchor;
      parts.push('<li class="rhs-collapsible' + (expanded ? ' expanded' : '') + '">');
      parts.push(
        '<button type="button" class="rhs-chevron" aria-label="' +
          (expanded ? 'Collapse section' : 'Expand section') +
          '" aria-expanded="' +
          (expanded ? 'true' : 'false') +
          '"></button>'
      );
      parts.push(
        '<a href="#' +
          esc(l1.anchor) +
          '" class="rhs-parent">' +
          esc(l1.title) +
          '</a>'
      );
      parts.push(renderChildTree(l1.children));
      parts.push('</li>');
    });
    parts.push('</ul>');
    return parts.join('');
  }

  function bindRhsCollapse(chunk, roots) {
    rhsPanel.querySelectorAll('li.rhs-collapsible').forEach(function (li) {
      var link = li.querySelector('a.rhs-parent');
      if (!link) return;
      var anchor = link.getAttribute('href').slice(1);

      function toggle() {
        var next = expandedL1ByChunk[chunk] === anchor ? null : anchor;
        expandedL1ByChunk[chunk] = next;
        renderChunk(chunk);
      }

      var btn = li.querySelector('.rhs-chevron');
      if (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          toggle();
        });
      }
      link.addEventListener('click', function () {
        if (expandedL1ByChunk[chunk] !== anchor) {
          expandedL1ByChunk[chunk] = anchor;
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
    var expanded = expandedL1ByChunk[chunk] || null;
    rhsPanel.innerHTML = renderChunkRhs(roots, expanded);
    bindRhsCollapse(chunk, roots);
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
