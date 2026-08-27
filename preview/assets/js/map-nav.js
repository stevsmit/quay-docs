/**
 * JTBD map preview: chunk-scoped RHS "On this page" nav.
 *
 * RHS switches with the top-level job (chunk) in view. Within a chunk, only the
 * active parent section's subtree is shown; level-2+ expand as you scroll into them.
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

  var currentChunk = null;
  var currentRootAnchor = null;

  function esc(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function renderList(nodes, depth, expandRoot) {
    if (!nodes || !nodes.length) return '';
    var parts = ['<ul>'];
    nodes.forEach(function (node) {
      var hasChildren = node.children && node.children.length;
      if (hasChildren) {
        var expanded = expandRoot && depth === 1 ? ' expanded' : '';
        parts.push('<li class="rhs-collapsible' + expanded + '">');
        parts.push(
          '<button type="button" class="rhs-chevron" aria-label="Show subsections" aria-expanded="' +
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
        parts.push(renderList(node.children, depth + 1, false));
      } else {
        parts.push('<li><a href="#' + esc(node.anchor) + '">' + esc(node.title) + '</a>');
      }
      parts.push('</li>');
    });
    parts.push('</ul>');
    return parts.join('');
  }

  function collapseRhsItem(li) {
    li.classList.remove('expanded');
    var btn = li.querySelector('.rhs-chevron');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function expandRhsItem(li) {
    var parentUl = li.parentElement;
    if (parentUl) {
      parentUl.querySelectorAll(':scope > li.rhs-collapsible.expanded').forEach(function (other) {
        if (other !== li) collapseRhsItem(other);
      });
    }
    li.classList.add('expanded');
    var btn = li.querySelector('.rhs-chevron');
    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Hide subsections');
    }
  }

  function toggleRhsItem(li) {
    if (li.classList.contains('expanded')) {
      collapseRhsItem(li);
    } else {
      expandRhsItem(li);
    }
  }

  function bindRhsCollapse() {
    rhsPanel.querySelectorAll('li.rhs-collapsible').forEach(function (li) {
      var btn = li.querySelector('.rhs-chevron');
      var link = li.querySelector('a.rhs-parent');
      if (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          toggleRhsItem(li);
        });
      }
      if (link) {
        link.addEventListener('click', function () {
          expandRhsItem(li);
        });
      }
    });
  }

  function collectAnchors(node, out) {
    if (!node) return;
    out.push(node.anchor);
    (node.children || []).forEach(function (child) {
      collectAnchors(child, out);
    });
  }

  function findRootForAnchor(roots, anchor) {
    for (var i = 0; i < roots.length; i++) {
      var anchors = [];
      collectAnchors(roots[i], anchors);
      if (anchors.indexOf(anchor) !== -1) return roots[i];
    }
    return null;
  }

  function activeRhsRootInChunk(chunkAnchor) {
    var roots = data.rhsByChunk[chunkAnchor];
    if (!roots || !roots.length) return null;

    var bestRoot = null;
    var bestTop = -Infinity;
    roots.forEach(function (root) {
      var anchors = [];
      collectAnchors(root, anchors);
      anchors.forEach(function (anchor) {
        var el = document.getElementById(anchor);
        if (!el) return;
        var top = el.getBoundingClientRect().top;
        if (top <= 120 && top > bestTop) {
          bestTop = top;
          bestRoot = root;
        }
      });
    });
    return bestRoot || roots[0];
  }

  function expandParentForAnchor(anchor) {
    if (!anchor) return;
    var link = rhsPanel.querySelector('a[href="#' + CSS.escape(anchor) + '"]');
    if (!link) return;
    var li = link.closest('li.rhs-collapsible');
    if (li) expandRhsItem(li);
  }

  function renderRhs(chunkAnchor, rootNode) {
    if (!rootNode) {
      rhsPanel.innerHTML =
        '<div class="right-toc-title">On this page</div>' +
        '<p class="right-toc-empty">No nested sections</p>';
      return;
    }
    rhsPanel.innerHTML =
      '<div class="right-toc-title">On this page</div>' +
      renderList([rootNode], 1, true);
    bindRhsCollapse();
    bindRhsScrollSpy();
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
      if (active) {
        expandParentForAnchor(active.getAttribute('href').slice(1));
      }
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
        currentRootAnchor = null;
      }
      return;
    }

    var root = activeRhsRootInChunk(chunk);
    var rootAnchor = root ? root.anchor : null;
    if (chunk === currentChunk && rootAnchor === currentRootAnchor) {
      bindRhsScrollSpy();
      return;
    }

    currentChunk = chunk;
    currentRootAnchor = rootAnchor;
    renderRhs(chunk, root);
  }

  markChunkSections();
  syncRhsFromScroll();

  var scrollTimer;
  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncRhsFromScroll, 80);
  });

  document.getElementById('toc').addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (data.rhsByChunk[id]) {
      currentChunk = id;
      currentRootAnchor = null;
      setTimeout(syncRhsFromScroll, 50);
      return;
    }
    setTimeout(function () {
      if (!currentChunk) return;
      var roots = data.rhsByChunk[currentChunk];
      var root = findRootForAnchor(roots, id);
      if (root) {
        currentRootAnchor = root.anchor;
        renderRhs(currentChunk, root);
      }
    }, 50);
  });
})();
