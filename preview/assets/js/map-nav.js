/**
 * JTBD map preview: RHS mirrors assembly structure (L1 + nested L2/==/===).
 *
 * LHS: category MAP (jobs). RHS: active job's assembly L1 modules always listed;
 * subsections and L2 modules under an L1 appear progressively while scrolling it.
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

  function collectAnchors(node, out) {
    if (!node) return;
    out.push(node.anchor);
    (node.children || []).forEach(function (child) {
      collectAnchors(child, out);
    });
  }

  function findL1ForAnchor(roots, anchor) {
    for (var i = 0; i < roots.length; i++) {
      var anchors = [];
      collectAnchors(roots[i], anchors);
      if (anchors.indexOf(anchor) !== -1) return roots[i];
    }
    return null;
  }

  function activeL1Root(roots) {
    var bestAnchor = null;
    var bestTop = -Infinity;
    roots.forEach(function (l1) {
      var anchors = [];
      collectAnchors(l1, anchors);
      anchors.forEach(function (anchor) {
        var top = headingTop(anchor);
        if (top !== null && top <= SCROLL_LINE && top > bestTop) {
          bestTop = top;
          bestAnchor = anchor;
        }
      });
    });
    if (!bestAnchor) return null;
    return findL1ForAnchor(roots, bestAnchor);
  }

  function progressiveChildren(node) {
    var visible = [];
    (node.children || []).forEach(function (child) {
      if (!headingPassed(child.anchor)) return;
      var nested = progressiveChildren(child);
      visible.push({
        anchor: child.anchor,
        title: child.title,
        children: nested,
      });
    });
    return visible;
  }

  function renderChildNodes(children) {
    if (!children || !children.length) return '';
    var parts = ['<ul>'];
    children.forEach(function (child) {
      parts.push('<li><a href="#' + esc(child.anchor) + '">' + esc(child.title) + '</a>');
      parts.push(renderChildNodes(child.children));
      parts.push('</li>');
    });
    parts.push('</ul>');
    return parts.join('');
  }

  function renderChunkRhs(roots, activeL1) {
    var parts = ['<div class="right-toc-title">On this page</div>', '<ul class="rhs-list">'];
    roots.forEach(function (l1) {
      var isActive = activeL1 && l1.anchor === activeL1.anchor;
      var visibleKids = isActive ? progressiveChildren(l1) : [];

      if (isActive && visibleKids.length) {
        parts.push('<li class="rhs-collapsible expanded">');
        parts.push(
          '<button type="button" class="rhs-chevron" aria-label="Hide subsections" aria-expanded="true"></button>'
        );
        parts.push(
          '<a href="#' + esc(l1.anchor) + '" class="rhs-parent">' + esc(l1.title) + '</a>'
        );
        parts.push(renderChildNodes(visibleKids));
        parts.push('</li>');
      } else {
        parts.push('<li><a href="#' + esc(l1.anchor) + '">' + esc(l1.title) + '</a></li>');
      }
    });
    parts.push('</ul>');
    return parts.join('');
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

  function syncRhsFromScroll() {
    var chunk = activeChunkFromScroll();
    if (!chunk || !data.rhsByChunk[chunk]) {
      if (currentChunk !== null) {
        rhsPanel.innerHTML =
          '<div class="right-toc-title">On this page</div>' +
          '<p class="right-toc-empty">Scroll to a section</p>';
        currentChunk = null;
        lastRenderedKey = '';
      }
      return;
    }

    var roots = data.rhsByChunk[chunk];
    var activeL1 = activeL1Root(roots);
    var visibleKey = activeL1
      ? activeL1.anchor + ':' + JSON.stringify(progressiveChildren(activeL1).map(function (c) {
          return c.anchor;
        }))
      : '';
    var key = chunk + '|' + visibleKey;

    if (key === lastRenderedKey && chunk === currentChunk) {
      bindRhsScrollSpy();
      return;
    }

    currentChunk = chunk;
    lastRenderedKey = key;
    rhsPanel.innerHTML = renderChunkRhs(roots, activeL1);
    bindRhsScrollSpy();
  }

  syncRhsFromScroll();

  var scrollTimer;
  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncRhsFromScroll, 50);
  });
})();
