#!/usr/bin/env python3
"""
JTBD map navigation for Surge preview (LHS + RHS).

LHS: map entries staged by leveloffset (+1..+4), excluding toc="no" under a chunk.
RHS: toc="no" entries nested under :chunk-to-content: jobs, plus == subsections.
"""

from __future__ import annotations

import argparse
import html
import json
import pathlib
import re
import sys
from dataclasses import dataclass, field

INCLUDE_RE = re.compile(r'^include::(.+?)\[(.*)\]\s*$')
ATTR_RE = re.compile(r'([\w-]+)=["\']?([^"\',\]]*)["\']?')
BLOCK_ID_RE = re.compile(r'^\[id="([^"]+)"\]')
SECTION2_RE = re.compile(r'^== (.+)$')
HEADING_RE = re.compile(
    r'<h([1-6])\s+id="([^"]+)"[^>]*>(.*?)</h[1-6]>',
    re.IGNORECASE | re.DOTALL,
)


@dataclass
class NavNode:
    title: str
    anchor: str = ''
    leveloffset: int = 1
    source: pathlib.Path | None = None
    toc_no: bool = False
    children: list[NavNode] = field(default_factory=list)


def parse_attrs(attr_str: str) -> dict[str, str]:
    return {k: v for k, v in ATTR_RE.findall(attr_str)}


def read_lines(path: pathlib.Path) -> list[str]:
    return path.read_text(encoding='utf-8').splitlines()


def resolve_include(target: str, base_dir: pathlib.Path) -> pathlib.Path | None:
    candidate = (base_dir / target).resolve()
    return candidate if candidate.is_file() else None


def file_attrs(path: pathlib.Path) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for line in read_lines(path):
        stripped = line.strip()
        if stripped.startswith(':') and stripped.endswith(':') and ': ' not in stripped:
            continue
        if stripped.startswith('= '):
            break
        if stripped.startswith(':') and ':' in stripped[1:]:
            key, _, val = stripped[1:].partition(':')
            attrs[key.strip()] = val.strip()
    return attrs


def is_chunk_file(path: pathlib.Path) -> bool:
    for line in read_lines(path):
        if line.strip() == ':chunk-to-content:':
            return True
        if line.startswith('= '):
            break
    return False


def load_preview_attrs(master: pathlib.Path) -> dict[str, str]:
    attrs: dict[str, str] = {}
    pending: list[pathlib.Path] = [master.resolve()]
    seen: set[pathlib.Path] = set()
    while pending:
        path = pending.pop(0)
        if path in seen or not path.is_file():
            continue
        seen.add(path)
        past_title = False
        for line in read_lines(path):
            if line.lstrip().startswith('//'):
                continue
            if not past_title and line.startswith('= '):
                past_title = True
                continue
            if past_title:
                break
            stripped = line.strip()
            m = INCLUDE_RE.match(stripped)
            if m:
                inc = resolve_include(m.group(1), path.parent)
                if inc:
                    pending.append(inc)
                continue
            if stripped.startswith(':') and not stripped.startswith('::'):
                key, _, val = stripped[1:].partition(':')
                attrs[key.strip()] = val.strip()
    return attrs


def substitute_attrs(text: str, attrs: dict[str, str]) -> dict[str, str] | str:
    if isinstance(text, str):
        for key, val in attrs.items():
            text = text.replace(f'{{{key}}}', val)
        return text
    return text


def file_title_and_block_id(path: pathlib.Path, attrs: dict[str, str] | None = None) -> tuple[str, str]:
    local = file_attrs(path)
    merged = {**(attrs or {}), **local}
    title = ''
    block_id = ''
    for line in read_lines(path):
        stripped = line.strip()
        m = BLOCK_ID_RE.match(stripped)
        if m:
            block_id = substitute_attrs(m.group(1), merged)
            continue
        if stripped.startswith('= '):
            title = substitute_attrs(stripped[2:].strip(), merged)
            break
    if not title:
        title = path.stem.replace('-', ' ').replace('_', ' ').title()
    if not block_id:
        block_id = slug(title)
    return title, block_id


def slug(text: str) -> str:
    s = text.lower()
    s = re.sub(r'[^a-z0-9]+', '_', s)
    return s.strip('_')


def normalize_title(text: str) -> str:
    text = html.unescape(re.sub(r'<[^>]+>', '', text))
    return re.sub(r'\s+', ' ', text).strip().lower()


def collect_includes(path: pathlib.Path) -> list[tuple[pathlib.Path, int, bool]]:
    items: list[tuple[pathlib.Path, int, bool]] = []
    past_title = False
    for line in read_lines(path):
        if line.lstrip().startswith('//'):
            continue
        if not past_title and line.startswith('= '):
            past_title = True
            continue
        if not past_title:
            continue
        m = INCLUDE_RE.match(line.strip())
        if not m:
            continue
        target, attr_str = m.group(1), m.group(2)
        resolved = resolve_include(target, path.parent)
        if not resolved:
            continue
        attrs = parse_attrs(attr_str)
        lo = int(str(attrs.get('leveloffset', '+1')).lstrip('+'))
        toc_no = attrs.get('toc') == 'no'
        items.append((resolved, lo, toc_no))
    return items


def nest_by_leveloffset(flat: list[NavNode]) -> list[NavNode]:
    if not flat:
        return []

    @dataclass
    class StackNode:
        leveloffset: int
        children: list[NavNode]

    root = StackNode(leveloffset=0, children=[])
    stack = [root]
    for node in flat:
        while len(stack) > 1 and node.leveloffset <= stack[-1].leveloffset:
            stack.pop()
        stack[-1].children.append(node)
        stack.append(StackNode(leveloffset=node.leveloffset, children=node.children))
    return root.children


def subsection_nodes(path: pathlib.Path, attrs: dict[str, str] | None = None) -> list[NavNode]:
    nodes: list[NavNode] = []
    past_title = False
    pending_id = ''
    merged = {**(attrs or {}), **file_attrs(path)}
    for line in read_lines(path):
        stripped = line.strip()
        if not past_title and stripped.startswith('= '):
            past_title = True
            continue
        if not past_title:
            continue
        m = BLOCK_ID_RE.match(stripped)
        if m:
            pending_id = m.group(1)
            continue
        m = SECTION2_RE.match(stripped)
        if m:
            title = substitute_attrs(m.group(1).strip(), merged)
            anchor = pending_id or slug(title)
            nodes.append(NavNode(title=title, anchor=anchor, leveloffset=0))
            pending_id = ''
    return nodes


@dataclass
class MapNav:
    root: NavNode
    rhs_by_chunk: dict[str, list[NavNode]] = field(default_factory=dict)


def build_map_nav(master: pathlib.Path) -> MapNav:
    attrs = load_preview_attrs(master)
    title, anchor = file_title_and_block_id(master, attrs)
    root = NavNode(title=title, anchor=anchor, leveloffset=0, source=master)
    rhs_by_chunk: dict[str, list[NavNode]] = {}
    _expand_nav(root, master, attrs, rhs_by_chunk, chunk_anchor=None, visited=set())
    attach_subsections(root, attrs)
    for chunk_key, nodes in list(rhs_by_chunk.items()):
        attach_subsections_list(nodes, attrs)
    return MapNav(root=root, rhs_by_chunk=rhs_by_chunk)


def attach_subsections_list(nodes: list[NavNode], attrs: dict[str, str] | None) -> None:
    for node in nodes:
        attach_subsections(node, attrs)


def attach_subsections(node: NavNode, attrs: dict[str, str] | None = None) -> None:
    if node.source and node.source.suffix == '.adoc':
        has_subs = any(c.leveloffset == 0 for c in node.children)
        if not has_subs:
            for sub in subsection_nodes(node.source, attrs):
                node.children.append(sub)
    for child in node.children:
        attach_subsections(child, attrs)


def _expand_nav(
    lhs_parent: NavNode,
    path: pathlib.Path,
    attrs: dict[str, str],
    rhs_by_chunk: dict[str, list[NavNode]],
    chunk_anchor: str | None,
    visited: set[pathlib.Path],
) -> None:
    real = path.resolve()
    if real in visited:
        return
    visited.add(real)

    if is_chunk_file(path):
        _, chunk_anchor = file_title_and_block_id(path, attrs)

    flat_lhs: list[NavNode] = []
    flat_rhs: list[NavNode] = []

    for inc_path, leveloffset, toc_no in collect_includes(path):
        title, anchor = file_title_and_block_id(inc_path, attrs)
        node = NavNode(
            title=title,
            anchor=anchor,
            leveloffset=leveloffset,
            source=inc_path,
            toc_no=toc_no,
        )
        if chunk_anchor and toc_no:
            flat_rhs.append(node)
        else:
            flat_lhs.append(node)

    lhs_parent.children.extend(nest_by_leveloffset(flat_lhs))

    if chunk_anchor and flat_rhs:
        existing = rhs_by_chunk.get(chunk_anchor, [])
        existing.extend(nest_by_leveloffset(flat_rhs))
        rhs_by_chunk[chunk_anchor] = existing

    for child in lhs_parent.children:
        if not child.source:
            continue
        content_type = file_attrs(child.source).get('_mod-docs-content-type', '')
        if content_type in ('MAP', 'ASSEMBLY'):
            child_chunk = chunk_anchor
            if is_chunk_file(child.source):
                _, child_chunk = file_title_and_block_id(child.source, attrs)
            _expand_nav(child, child.source, attrs, rhs_by_chunk, child_chunk, visited)


def extract_html_headings(html_text: str) -> list[tuple[str, str]]:
    content_match = re.search(
        r'<div id="content">(.*)</div>\s*(?:<div id="footer|<footer|$)',
        html_text,
        re.DOTALL,
    )
    scope = content_match.group(1) if content_match else html_text
    return [
        (normalize_title(raw_title), anchor)
        for _level, anchor, raw_title in HEADING_RE.findall(scope)
    ]


def titles_equal(a: str, b: str) -> bool:
    return normalize_title(a) == normalize_title(b)


def align_anchors_preorder(node: NavNode, headings: list[tuple[str, str]], index: int) -> int:
    if index < len(headings) and titles_equal(node.title, headings[index][0]):
        node.anchor = headings[index][1]
        index += 1
    for child in node.children:
        index = align_anchors_preorder(child, headings, index)
    return index


def align_all_anchors(nav: MapNav, headings: list[tuple[str, str]]) -> None:
    index = align_anchors_preorder(nav.root, headings, 0)
    for nodes in nav.rhs_by_chunk.values():
        for node in nodes:
            index = align_anchors_preorder(node, headings, index)


def render_toc_list(nodes: list[NavNode], depth: int = 1) -> str:
    if not nodes:
        return ''
    cls = 'sectlevel1' if depth == 1 else f'sectlevel{depth}'
    parts = [f'<ul class="{cls}">']
    for node in nodes:
        has_children = bool(node.children)
        li_attrs = ' class="toc-collapsible expanded"' if has_children else ''
        parts.append(f'<li{li_attrs}>')
        if has_children:
            parts.append(
                '<button type="button" class="toc-chevron" '
                'aria-label="Collapse section" aria-expanded="true"></button>'
            )
        href = f'#{html.escape(node.anchor)}' if node.anchor else '#'
        parts.append(f'<a href="{href}">{html.escape(node.title)}</a>')
        if has_children:
            parts.append(render_toc_list(node.children, depth + 1))
        parts.append('</li>')
    parts.append('</ul>')
    return ''.join(parts)


def node_to_json(node: NavNode) -> dict:
    return {
        'title': node.title,
        'anchor': node.anchor,
        'children': [node_to_json(c) for c in node.children],
    }


def nav_to_json(nav: MapNav) -> str:
    payload = {
        'lhs': [node_to_json(c) for c in nav.root.children],
        'rhsByChunk': {
            key: [node_to_json(n) for n in nodes]
            for key, nodes in nav.rhs_by_chunk.items()
        },
        'chunkAnchors': list(nav.rhs_by_chunk.keys()),
    }
    return json.dumps(payload, ensure_ascii=False)


def render_initial_rhs(nav: MapNav) -> str:
    if not nav.rhs_by_chunk:
        return ''
    first_key = next(iter(nav.rhs_by_chunk))
    nodes = nav.rhs_by_chunk[first_key]
    inner = render_toc_list(nodes, 1).replace('class="sectlevel1"', 'class="rhs-list"')
    return (
        '<aside id="right-toc" aria-label="On this page">'
        '<div class="right-toc-title">On this page</div>'
        f'{inner}'
        '</aside>'
    )


def inject_map_nav(html_path: pathlib.Path, master: pathlib.Path) -> None:
    text = html_path.read_text(encoding='utf-8')
    nav = build_map_nav(master.resolve())
    headings = extract_html_headings(text)
    align_all_anchors(nav, headings)

    toc_inner = (
        '<div id="toctitle">Navigation</div>\n'
        '<div class="map-nav-note">JTBD preview — map LHS + chunk RHS</div>\n'
        + render_toc_list(nav.root.children or [nav.root])
    )

    json_script = (
        f'<script type="application/json" id="map-nav-data">'
        f'{nav_to_json(nav)}</script>\n'
    )

    if re.search(r'<div id="toc" class="toc2">', text):
        text = re.sub(
            r'(<div id="toc" class="toc2">)(.*?)(</div>\s*</div>\s*<div id="content">)',
            lambda m: m.group(1) + toc_inner + m.group(3),
            text,
            count=1,
            flags=re.DOTALL,
        )
    else:
        raise SystemExit(f'No #toc in {html_path}')

    rhs_html = render_initial_rhs(nav)
    if rhs_html and 'id="right-toc"' not in text:
        text = text.replace('</body>', rhs_html + '\n</body>', 1)

    if 'map-nav.js' not in text:
        text = text.replace(
            '</head>',
            '<script src="/assets/js/map-nav.js" defer></script>\n</head>',
            1,
        )

    text = text.replace('</head>', json_script + '</head>', 1)
    text = re.sub(
        r'<body class="([^"]*)"',
        lambda m: f'<body class="{m.group(1)} has-right-toc map-nav-preview"',
        text,
        count=1,
    )

    html_path.write_text(text, encoding='utf-8')


def main() -> None:
    parser = argparse.ArgumentParser(description='Inject JTBD map LHS/RHS nav into preview HTML.')
    parser.add_argument('html', type=pathlib.Path)
    parser.add_argument('master', type=pathlib.Path)
    args = parser.parse_args()
    inject_map_nav(args.html.resolve(), args.master.resolve())
    print(f'map nav (LHS+RHS): {args.html}')


if __name__ == '__main__':
    main()
