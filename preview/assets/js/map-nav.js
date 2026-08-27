/**
 * JTBD map preview: right-hand "On this page" nav for chunked job sections.
 * Reads #map-nav-data JSON emitted by preview/map_nav.py.
 *
 * Level-1 RHS entries are always visible; level-2+ children expand only when
 * their parent is clicked (accordion — one expanded section at a time).
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
      var hasChildren = node.children && node.children.length;
      if (hasChildren) {
        parts.push('<li class="rhs-collapsible">');
        parts.push(
          '<button type="button" class="rhs-chevron" aria-label="Show subsections" aria-expanded="false"></button>'
        );
        parts.push(
          '<a href="#' +
            esc(node.anchor) +
            '" class="rhs-parent">' +
            esc(node.title) +
            '</a>'
        );
        parts.push(renderList(node.children, depth + 1));
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

  function expandParentForAnchor(anchor) {
    if (!anchor) return;
    var link = rhsPanel.querySelector('a[href="#' + CSS.escape(anchor) + '"]');
    if (!link) return;
    var li = link.closest('li.rhs-collapsible');
    if (li) expandRhsItem(li);
  }

  function expandRhsParentForAnchor(anchor) {
    if (!anchor) return;
    var selector = 'a.rhs-parent[href="#' + anchor.replace(/"/g, '\\"') + '"]';
    var parentLink = rhsPanel.querySelector(selector);
    if (!parentLink) return;
    var li = parentLink.closest('li.rhs-collapsible');
    if (li) expandRhsItem(li);
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
        var activeAnchor = active.getAttribute('href').slice(1);
        expandParentForAnchor(activeAnchor);
        expandRhsParentForAnchor(activeAnchor);
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
      setTimeout(function () {
        renderRhs(id);
      }, 50);
      return;
    }
    setTimeout(function () {
      expandRhsParentForAnchor(id);
    }, 50);
  });
})();
