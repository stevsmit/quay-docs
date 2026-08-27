/**
 * JTBD map preview: scroll-driven RHS "On this page" nav.
 * Shows only == subsections for the content section currently in view.
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
  if (!rhsPanel || !data.rhsSectionsByChunk) return;

  var currentChunk = null;
  var currentSectionAnchor = null;

  function esc(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function renderFlatList(children) {
    if (!children || !children.length) return '';
    var parts = ['<ul class="rhs-list">'];
    children.forEach(function (node) {
      parts.push(
        '<li><a href="#' + esc(node.anchor) + '">' + esc(node.title) + '</a></li>'
      );
    });
    parts.push('</ul>');
    return parts.join('');
  }

  function renderRhsSection(section) {
    var title = '<div class="right-toc-title">On this page</div>';
    if (!section || !section.children || !section.children.length) {
      rhsPanel.innerHTML = title + '<p class="right-toc-empty">No subsections</p>';
      bindRhsScrollSpy();
      return;
    }
    rhsPanel.innerHTML = title + renderFlatList(section.children);
    bindRhsScrollSpy();
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

  function activeSectionInChunk(chunkAnchor) {
    var sections = data.rhsSectionsByChunk[chunkAnchor];
    if (!sections || !sections.length) return null;
    var best = null;
    var bestTop = -Infinity;
    sections.forEach(function (section) {
      var el = document.getElementById(section.anchor);
      if (!el) return;
      var top = el.getBoundingClientRect().top;
      if (top <= 120 && top > bestTop) {
        bestTop = top;
        best = section;
      }
    });
    return best;
  }

  function syncRhsFromScroll() {
    var chunk = activeChunkFromScroll();
    if (!chunk) {
      if (currentChunk !== null) {
        rhsPanel.innerHTML =
          '<div class="right-toc-title">On this page</div>' +
          '<p class="right-toc-empty">Scroll to a section</p>';
        currentChunk = null;
        currentSectionAnchor = null;
      }
      return;
    }
    var section = activeSectionInChunk(chunk);
    var sectionAnchor = section ? section.anchor : null;
    if (chunk === currentChunk && sectionAnchor === currentSectionAnchor) {
      bindRhsScrollSpy();
      return;
    }
    currentChunk = chunk;
    currentSectionAnchor = sectionAnchor;
    renderRhsSection(section);
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

  markChunkSections();
  syncRhsFromScroll();

  var scrollTimer;
  window.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(syncRhsFromScroll, 80);
  });
})();
