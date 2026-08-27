/**
 * JTBD map preview: chunk-scoped, scroll-progressive RHS nav.
 *
 * - LHS: category MAP jobs (levels 1–2 of product navigation)
 * - RHS: assembly sections for the active job only; empty until you scroll
 *   into a section; level-2 entries appear one by one as their headings pass.
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
  var lastRenderedKey = '';

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

  function headingPassed(anchor) {
    var top = headingTop(anchor);
    return top !== null && top <= SCROLL_LINE;
  }

  function progressiveSubtree(node) {
    if (!node || !headingPassed(node.anchor)) return null;

    var kids = [];
    (node.children || []).forEach(function (child) {
      if (!headingPassed(child.anchor)) return;
      var nested = progressiveSubtree(child);
      kids.push(
        nested || { anchor: child.anchor, title: child.title, children: [] }
      );
    });

    return { anchor: node.anchor, title: node.title, children: kids };
  }

  function renderNode(node) {
    var parts = [
      '<li><a href="#' +
        esc(node.anchor) +
        '">' +
        esc(node.title) +
        '</a>',
    ];
    if (node.children && node.children.length) {
      parts.push('<ul>');
      node.children.forEach(function (child) {
        parts.push(renderNode(child));
      });
      parts.push('</ul>');
    }
    parts.push('</li>');
    return parts.join('');
  }

  function renderProgressiveTree(tree) {
    if (!tree) {
      rhsPanel.innerHTML =
        '<div class="right-toc-title">On this page</div>' +
        '<p class="right-toc-empty">Scroll to a section</p>';
      return;
    }
    rhsPanel.innerHTML =
      '<div class="right-toc-title">On this page</div>' +
      '<ul class="rhs-list">' +
      renderNode(tree) +
      '</ul>';
    bindRhsScrollSpy();
  }

  function activeSectionInChunk(chunkAnchor) {
    var roots = data.rhsByChunk[chunkAnchor];
    if (!roots || !roots.length) return null;

    var active = null;
    var bestTop = -Infinity;
    roots.forEach(function (root) {
      var top = headingTop(root.anchor);
      if (top === null || top > SCROLL_LINE) return;
      if (top > bestTop) {
        bestTop = top;
        active = root;
      }
    });
    return active;
  }

  function activeChunkFromScroll() {
    var best = null;
    var bestTop = -Infinity;
    (data.chunkAnchors || []).forEach(function (anchor) {
      var top = headingTop(anchor);
      if (top === null || top > SCROLL_LINE) return;
      if (top > bestTop) {
        bestTop = top;
        best = anchor;
      }
    });
    return best;
  }

  function syncRhsFromScroll() {
    var chunk = activeChunkFromScroll();
    if (!chunk || !data.rhsByChunk[chunk]) {
      if (currentChunk !== null) {
        renderProgressiveTree(null);
        currentChunk = null;
        lastRenderedKey = '';
      }
      return;
    }

    var section = activeSectionInChunk(chunk);
    var tree = section ? progressiveSubtree(section) : null;
    var key =
      chunk +
      '|' +
      (section ? section.anchor : '') +
      '|' +
      JSON.stringify(tree ? tree.children.map(function (c) { return c.anchor; }) : []);

    if (key === lastRenderedKey && chunk === currentChunk) {
      bindRhsScrollSpy();
      return;
    }

    currentChunk = chunk;
    lastRenderedKey = key;
    renderProgressiveTree(tree);
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

  syncRhsFromScroll();

  var scrollTimer;
  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncRhsFromScroll, 50);
  });
})();
