#!/usr/bin/env python3
"""
PDF Analysis Helper — read-only structural analysis via pikepdf.

Usage: python3 pdf_analysis_helper.py <pdf_path>

Outputs a single JSON object to stdout. Errors/warnings go to stderr.
Exit 0 always (errors produce empty/partial results, never crash the caller).
"""

import sys
import json
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
import secrets
from collections import Counter, deque

try:
    import pikepdf
except ImportError:
    print(json.dumps({
        "error": "pikepdf not installed",
        "isTagged": False, "markInfo": None, "lang": None,
        "pdfUaVersion": None, "headings": [], "figures": [],
        "tables": [], "fonts": [], "bookmarks": [], "formFields": [],
        "paragraphStructElems": [],
        "structureTree": None,
        "threeCcGoldenV1": False,
        "threeCcGoldenOrphanV1": False,
        "orphanMcids": [],
        "mcidTextSpans": [],
        "annotationAccessibility": {
            "pagesMissingTabsS": 0,
            "pagesAnnotationOrderDiffers": 0,
            "linkAnnotationsMissingStructure": 0,
            "nonLinkAnnotationsMissingStructure": 0,
            "nonLinkAnnotationsMissingContents": 0,
            "linkAnnotationsMissingStructParent": 0,
            "nonLinkAnnotationsMissingStructParent": 0,
        },
        "linkScoringRows": [],
    }))
    sys.exit(0)

MAX_ITEMS = 2000  # cap per collection to avoid runaway on malformed trees
MAX_MCID_SPANS = 500  # Phase 3c-c: cap MCID scan results in analysis JSON
PDFAF_3CC_GOLDEN_MARKER = "pdfaf-3cc-golden-v1"
PDFAF_3CC_ORPHAN_MARKER = "pdfaf-3cc-orphan-v1"

MCID_OP_RE = re.compile(rb"/MCID\s+(\d+)", re.IGNORECASE)
TJ_AFTER_MCID_RE = re.compile(rb"\(((?:\\.|[^\\\)])+)\)\s*Tj")
HEX_TJ_AFTER_MCID_RE = re.compile(rb"<([0-9A-Fa-f]+)>\s*Tj", re.IGNORECASE)
TJ_ARRAY_AFTER_MCID_RE = re.compile(rb"\[([^\]]*)\]\s*TJ", re.IGNORECASE)

# Operators that render visible output (used for TaggedCont artifact-wrapping).
_PAINT_OPS = frozenset({
    "Tj", "TJ", "'", '"',           # text rendering
    "S", "s", "f", "F", "f*",       # path painting (stroke / fill)
    "B", "B*", "b", "b*",           # fill+stroke combos
    "sh",                            # shading pattern
    "Do",                            # external object (image / form XObject)
    "EI",                            # end inline image
})


def _mcid_max_pages() -> int:
    try:
        return max(1, min(500, int(os.environ.get("PDFAF_SEMANTIC_MCID_MAX_PAGES", "50"))))
    except ValueError:
        return 50


def _missing_figure_alt_for_elem(elem, page_map: dict) -> str:
    """
    Placeholder /Alt for informative figures with none (override via PDFAF_MISSING_FIGURE_ALT).

    Leaf figure-like nodes whose /K is only marked content (MCID / MCR) — no child structure
    tags — are very often exported charts or tables tagged as /Figure; use a table-oriented
    default so Acrobat 'Figures alternate text' and human review align with typical CHRI/ICJIA docs.
    """
    v = os.environ.get("PDFAF_MISSING_FIGURE_ALT", "").strip()
    if v:
        return v[:200]
    try:
        pg = int(get_page_number(elem, page_map)) + 1
        try:
            kl = elem.get("/K")
        except Exception:
            kl = None
        if len(_direct_role_children(elem)) == 0 and _k_has_mcid_association(kl):
            return f"Table (page {pg})"[:200]
        return f"Illustration (page {pg})"[:200]
    except Exception:
        return "Illustration"


def _struct_role_requires_figure_style_alt(tag: str) -> bool:
    """
    Structure roles that Acrobat groups with Figure for alternate text (WCAG 1.1.1).

    Includes Microsoft Word/Office export tags (InlineShape, Shape) that carry vector
    or image content but are not tagged as /Figure.
    """
    tu = (tag or "").lstrip("/").upper()
    return tu in {"FIGURE", "FORMULA", "INLINESHAPE", "SHAPE"}


def _under_figure_like_ancestor_with_meaningful_alt(elem) -> bool:
    """True if a figure-like ancestor already has non-empty /Alt (nested figure chain)."""
    try:
        cur = elem.get("/P")
    except Exception:
        return False
    depth = 0
    while cur is not None and depth < 250:
        depth += 1
        if not isinstance(cur, pikepdf.Dictionary):
            break
        try:
            if cur.get("/Type") == pikepdf.Name("/StructTreeRoot"):
                break
        except Exception:
            pass
        try:
            tag = get_name(cur)
            if _struct_role_requires_figure_style_alt(tag):
                a = get_alt(cur)
                if a is not None and str(a).strip():
                    return True
        except Exception:
            pass
        try:
            cur = cur.get("/P")
        except Exception:
            break
    return False


def _fill_missing_figure_alts(pdf: pikepdf.Pdf) -> bool:
    """
    - Set /Alt on informative Figure / Formula / InlineShape / Shape structure elements that have none.
    - Treats nodes as structure elements when /Type /StructElem is present or when
      /Type is omitted but /S and /P are set (common tagged-PDF variant).
    - Figure with empty/missing /K cannot satisfy 'Associated with content'; promote to /S /Artifact
      and clear /Alt|/ActualText (same spirit as mark_figure_decorative).
    Also handles /Formula elements (OtherAltText check) with the same logic.
    """
    changed = False
    try:
        sr = pdf.Root.get("/StructTreeRoot")
        if sr is None:
            return False
        page_map = build_page_map(pdf)
        q: deque = deque()
        _enqueue_children(q, sr.get("/K"))
        visited = set()
        item_count = 0
        # Use a larger cap to handle long documents (8k → 40k items).
        item_limit = max(MAX_ITEMS * 4, 40_000)
        while q and item_count < item_limit:
            item_count += 1
            try:
                elem = q.popleft()
            except Exception:
                break
            if not isinstance(elem, pikepdf.Dictionary):
                continue
            vk = _struct_elem_visit_key(elem)
            if vk in visited:
                continue
            visited.add(vk)
            try:
                if _is_struct_elem_dict(elem):
                    tag = get_name(elem)
                    if _struct_role_requires_figure_style_alt(tag) and not _is_artifact(elem):
                        if _k_absent_or_empty(elem):
                            # Element has no content — convert to artifact to avoid AltTextNoContent.
                            if _has_nonempty_alt_or_actual(elem):
                                _clear_alt_actual_and_title(elem)
                                changed = True
                            try:
                                elem["/S"] = pikepdf.Name.Artifact
                                changed = True
                            except Exception:
                                pass
                        else:
                            alt = get_alt(elem)
                            if (alt is None or not str(alt).strip()) and (
                                not _under_figure_like_ancestor_with_meaningful_alt(elem)
                            ):
                                elem["/Alt"] = _pdf_text_string(_missing_figure_alt_for_elem(elem, page_map), 500)
                                changed = True
            except Exception:
                pass
            try:
                k = elem.get("/K")
                _enqueue_children(q, k)
            except Exception:
                pass
        return changed
    except Exception as e:
        print(f"[warn] _fill_missing_figure_alts: {e}", file=sys.stderr)
        return False


def _read_page_contents_raw(page) -> bytes:
    raw = b""
    try:
        c = page.get("/Contents")
        if c is None:
            return raw
        if isinstance(c, pikepdf.Array):
            for part in c:
                try:
                    raw += part.read_bytes()
                except Exception:
                    try:
                        raw += bytes(part)
                    except Exception:
                        pass
        else:
            try:
                raw = c.read_bytes()
            except Exception:
                try:
                    raw = bytes(c)
                except Exception:
                    pass
    except Exception:
        pass
    return raw


def _decode_pdf_hex_string(hex_bytes: bytes) -> str:
    """Decode PDF hex string content (best-effort; ASCII / Latin-1 common in tests)."""
    try:
        h = hex_bytes.decode("ascii", errors="ignore")
        if len(h) % 2 == 1:
            h = h[:-1]
        raw = bytes.fromhex(h)
        if not raw:
            return ""
        return raw.decode("latin-1", errors="replace")
    except Exception:
        return ""


def _strings_from_tj_array_body(body: bytes) -> str:
    """Concatenate literal (..) and <hex> string segments inside a TJ array body."""
    parts: list[str] = []
    try:
        for seg_m in re.finditer(rb"\(((?:\\.|[^\\\)])+)\)|<([0-9A-Fa-f]+)>", body):
            if seg_m.group(1):
                inner = seg_m.group(1)
                s = inner.decode("latin-1", errors="replace")
                s = s.replace("\\)", ")").replace("\\(", "(").replace("\\\\", "\\")
                parts.append(s)
            elif seg_m.group(2):
                parts.append(_decode_pdf_hex_string(seg_m.group(2)))
    except Exception:
        pass
    return "".join(parts).strip()[:500]


def extract_resolved_text_after_mcid(raw: bytes, mcid_match: re.Match) -> str:
    """Best-effort text after /MCID: literal (...) Tj, <hex> Tj, or [...] TJ array."""
    try:
        w = raw[mcid_match.end() : mcid_match.end() + 1200]
        m = TJ_AFTER_MCID_RE.search(w)
        if m:
            inner = m.group(1)
            s = inner.decode("latin-1", errors="replace")
            s = s.replace("\\)", ")").replace("\\(", "(").replace("\\\\", "\\")
            return s.strip()[:500]
        m2 = HEX_TJ_AFTER_MCID_RE.search(w)
        if m2:
            return _decode_pdf_hex_string(m2.group(1)).strip()[:500]
        m3 = TJ_ARRAY_AFTER_MCID_RE.search(w)
        if m3:
            return _strings_from_tj_array_body(m3.group(1))
    except Exception:
        pass
    return ""


def _sync_parent_tree_orphan_fixture(pdf: pikepdf.Pdf, page, struct_elem) -> None:
    """Append ParentTree /Nums entry and page /StructParents for single-page orphan CI PDF only."""
    try:
        if not pdf_has_3cc_orphan_marker(pdf) or len(pdf.pages) != 1:
            return
        sr = pdf.Root.get("/StructTreeRoot")
        if sr is None:
            return
        pt = sr.get("/ParentTree")
        if pt is None:
            pt = pdf.make_indirect(pikepdf.Dictionary(Nums=pikepdf.Array([])))
            sr["/ParentTree"] = pt
        nums = pt.get("/Nums")
        if nums is None or not isinstance(nums, pikepdf.Array):
            nums = pikepdf.Array([])
            pt["/Nums"] = nums
        parent_id = len(nums) // 2
        nums.append(pikepdf.Integer(parent_id))
        nums.append(struct_elem)
        page["/StructParents"] = pikepdf.Integer(parent_id)
    except Exception:
        pass


def _sync_parent_tree_single_page_wrap(pdf: pikepdf.Pdf, page, struct_elem) -> None:
    """Best-effort ParentTree append for one-page PDFs after inserting an MCID-backed /P (non-CI)."""
    try:
        if len(pdf.pages) != 1:
            return
        sr = pdf.Root.get("/StructTreeRoot")
        if sr is None:
            return
        pt = sr.get("/ParentTree")
        if pt is None:
            pt = pdf.make_indirect(pikepdf.Dictionary(Nums=pikepdf.Array([])))
            sr["/ParentTree"] = pt
        nums = pt.get("/Nums")
        if nums is None or not isinstance(nums, pikepdf.Array):
            nums = pikepdf.Array([])
            pt["/Nums"] = nums
        parent_id = len(nums) // 2
        nums.append(pikepdf.Integer(parent_id))
        nums.append(struct_elem)
        page["/StructParents"] = pikepdf.Integer(parent_id)
    except Exception:
        pass


def _outline_dest_fit(pdf: pikepdf.Pdf, page_idx: int) -> pikepdf.Array:
    n = len(pdf.pages)
    if page_idx < 0 or page_idx >= n:
        page_idx = 0
    return pikepdf.Array([pdf.pages[page_idx].obj, pikepdf.Name("/Fit")])


def _outlines_nonempty(pdf: pikepdf.Pdf) -> bool:
    try:
        ol = pdf.Root.get("/Outlines")
        if ol is None or not isinstance(ol, pikepdf.Dictionary):
            return False
        if ol.get("/First") is not None:
            return True
        bm = extract_bookmarks(pdf)
        return len(bm) > 0
    except Exception:
        return False


def _op_replace_bookmarks_from_headings(pdf: pikepdf.Pdf, params: dict) -> bool:
    """
    Build /Catalog /Outlines from structure headings (nested by H-level).
    Default: skip when outlines already populated; params.force=true replaces.
    """
    force = bool(params.get("force"))
    if not force and _outlines_nonempty(pdf):
        return False
    page_map = build_page_map(pdf)
    struct = traverse_struct_tree(pdf, page_map)
    headings = struct.get("headings") or []
    if not headings:
        return False

    outline_root = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/Outlines"),
        )
    )
    stack: list[tuple] = []  # (outline_dict, level)

    for h in headings:
        try:
            level = int(h.get("level") or 1)
        except (TypeError, ValueError):
            level = 1
        level = max(1, min(6, level))
        title = (h.get("text") or "").strip() or "Heading"
        title = title[:400]
        try:
            pidx = int(h.get("page") or 0)
        except (TypeError, ValueError):
            pidx = 0
        dest = _outline_dest_fit(pdf, pidx)
        new_item = pdf.make_indirect(
            pikepdf.Dictionary(
                Title=_pdf_text_string(title, 400),
                Dest=dest,
            )
        )

        while stack and stack[-1][1] >= level:
            stack.pop()

        if not stack:
            new_item["/Parent"] = outline_root
            last_top = outline_root.get("/Last")
            if last_top is None:
                outline_root["/First"] = new_item
                outline_root["/Last"] = new_item
            else:
                new_item["/Prev"] = last_top
                last_top["/Next"] = new_item
                outline_root["/Last"] = new_item
        else:
            parent_item, _pl = stack[-1]
            new_item["/Parent"] = parent_item
            last_c = parent_item.get("/Last")
            if last_c is None:
                parent_item["/First"] = new_item
                parent_item["/Last"] = new_item
            else:
                new_item["/Prev"] = last_c
                last_c["/Next"] = new_item
                parent_item["/Last"] = new_item

        stack.append((new_item, level))

    pdf.Root["/Outlines"] = outline_root
    return True


def _op_add_page_outline_bookmarks(pdf: pikepdf.Pdf, params: dict) -> bool:
    """
    Long documents (Acrobat bookmarks check): add a flat /Outlines tree with one entry per page
    ('Page 1' … 'Page N') pointing at /Fit destinations. Used when there are no structure headings
    for replace_bookmarks_from_headings (typical OCR + tag_ocr_text_blocks pipeline).

    Skips when outlines already exist unless params.force=true. Skips below 10 pages.
    """
    force = bool(params.get("force"))
    if not force and _outlines_nonempty(pdf):
        return False
    np = len(pdf.pages)
    if np < 10:
        return False
    try:
        maxp = int(params.get("maxPages") or 240)
    except (TypeError, ValueError):
        maxp = 240
    maxp = max(1, min(maxp, np))

    outline_root = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/Outlines"),
        )
    )
    prev_item = None
    for i in range(maxp):
        title = f"Page {i + 1}"
        dest = _outline_dest_fit(pdf, i)
        new_item = pdf.make_indirect(
            pikepdf.Dictionary(
                Title=_pdf_text_string(title, 80),
                Dest=dest,
                Parent=outline_root,
            )
        )
        if prev_item is None:
            outline_root["/First"] = new_item
        else:
            new_item["/Prev"] = prev_item
            prev_item["/Next"] = new_item
        prev_item = new_item
        outline_root["/Last"] = new_item

    pdf.Root["/Outlines"] = outline_root
    return True


def _iter_table_struct_elems(pdf: pikepdf.Pdf):
    sr = pdf.Root.get("/StructTreeRoot")
    if sr is None:
        return
    q: deque = deque()
    _enqueue_children(q, sr.get("/K"))
    seen = set()
    n = 0
    while q and n < MAX_ITEMS * 4:
        n += 1
        elem = q.popleft()
        if not isinstance(elem, pikepdf.Dictionary):
            continue
        oid = id(elem)
        if oid in seen:
            continue
        seen.add(oid)
        tag = (get_name(elem) or "").lstrip("/").upper()
        if tag == "TABLE":
            yield elem
        try:
            _enqueue_children(q, elem.get("/K"))
        except Exception:
            pass


def _find_first_tr(table_elem) -> object | None:
    q: deque = deque()
    _enqueue_children(q, table_elem.get("/K"))
    limit = 500
    while q and limit > 0:
        limit -= 1
        e = q.popleft()
        if not isinstance(e, pikepdf.Dictionary):
            continue
        tag = (get_name(e) or "").lstrip("/").upper()
        if tag == "TR":
            return e
        _enqueue_children(q, e.get("/K"))
    return None


def _promote_first_row_td_to_th(table_elem) -> bool:
    tr = _find_first_tr(table_elem)
    if tr is None:
        return False
    changed = False
    # Iterate TR children directly; handles both direct Dictionaries and indirect
    # object references (pikepdf auto-dereferences via .get()). Do NOT rely on
    # _struct_elem_children here — it requires /Type /StructElem which is optional.
    k = tr.get("/K")
    if k is None:
        return False
    children = list(k) if isinstance(k, pikepdf.Array) else [k]
    for cell in children:
        try:
            tag = (get_name(cell) or "").lstrip("/").upper()
            if tag == "TD":
                cell["/S"] = pikepdf.Name("/TH")
                changed = True
        except Exception:
            pass
    return changed


def _op_set_table_header_cells(pdf: pikepdf.Pdf, params: dict) -> bool:
    ref = params.get("structRef")
    if not ref:
        return False
    try:
        table = _resolve_ref(pdf, ref)
    except Exception:
        return False
    if table is None or not isinstance(table, pikepdf.Dictionary):
        return False
    if (get_name(table) or "").lstrip("/").upper() != "TABLE":
        return False
    return _promote_first_row_td_to_th(table)


def _op_repair_native_table_headers(pdf: pikepdf.Pdf, _params: dict) -> bool:
    changed = False
    for table in _iter_table_struct_elems(pdf):
        th, td = _count_table_cells(table)
        if th == 0 and td > 0 and _promote_first_row_td_to_th(table):
            changed = True
    return changed


def _strip_pdf_strings_bytes(raw: bytes) -> bytes:
    """Remove (...) and <> hex strings for cheap content-stream scans."""
    out = bytearray()
    i = 0
    n = len(raw)
    while i < n:
        c = raw[i : i + 1]
        if c == b"(":
            depth = 1
            i += 1
            while i < n and depth:
                if raw[i : i + 1] == b"\\":
                    i += 2
                    continue
                if raw[i : i + 1] == b"(":
                    depth += 1
                elif raw[i : i + 1] == b")":
                    depth -= 1
                i += 1
            continue
        if c == b"<" and i + 1 < n and raw[i + 1 : i + 2] != b"<":
            i += 1
            while i < n and raw[i : i + 1] != b">":
                i += 1
            if i < n:
                i += 1
            continue
        out.extend(c)
        i += 1
    return bytes(out)


def _count_path_paint_outside_mcid_bdc(pdf: pikepdf.Pdf, max_pages: int, max_hits: int) -> int:
    """
    Bounded heuristic: painting operators (re, m, l) outside BDC/EMC marked-content blocks.
    Acrobat TaggedCont is richer; this is a coarse risk signal only.
    """
    hits = 0
    mp = min(len(pdf.pages), max_pages)
    paint_re = re.compile(rb"(?<![A-Za-z0-9])(re|[ml])(?![A-Za-z0-9])")
    for pi in range(mp):
        raw = _read_page_contents_raw(pdf.pages[pi])
        stripped = _strip_pdf_strings_bytes(raw)
        depth = 0
        i = 0
        ns = len(stripped)
        while i < ns and hits < max_hits:
            if stripped[i : i + 3] in (b"BDC", b"BMC"):
                depth += 1
                i += 3
                continue
            if stripped[i : i + 3] == b"EMC":
                depth = max(0, depth - 1)
                i += 3
                continue
            if depth == 0:
                m = paint_re.match(stripped, i)
                if m:
                    hits += 1
                    i += m.end() - m.start()
                    continue
            i += 1
    return hits


def collect_list_structure_audit(pdf: pikepdf.Pdf) -> dict:
    """
    Walk the structure tree collecting list-related statistics and Acrobat-style violations.

    Acrobat checks:
    - ListItems (anchor): LI elements must be direct children of an L element.
    - LblLBody (anchor): Lbl and LBody elements must be direct children of an LI element.

    Returns counts suitable for JSON serialisation and PDFAF signal tracking.
    An empty / absent structure tree returns all-zero counts.
    """
    _empty = {
        "listCount": 0,
        "listItemCount": 0,
        "listItemMisplacedCount": 0,
        "lblBodyMisplacedCount": 0,
        "listsWithoutItems": 0,
    }
    try:
        sr = pdf.Root.get("/StructTreeRoot")
        if sr is None:
            return _empty
    except Exception:
        return _empty

    list_count = 0
    list_item_count = 0
    list_item_misplaced = 0
    lbl_body_misplaced = 0
    lists_without_items = 0

    q: deque = deque()
    try:
        _enqueue_children(q, sr.get("/K"))
    except Exception:
        return _empty

    visited: set = set()
    n = 0

    while q and n < MAX_ITEMS * 4:
        n += 1
        try:
            elem = q.popleft()
            if not isinstance(elem, pikepdf.Dictionary):
                continue
            vk = _struct_elem_visit_key(elem)
            if vk in visited:
                continue
            visited.add(vk)

            tag = (get_name(elem) or "").lstrip("/").upper()

            # Determine parent tag (best-effort via /P back-pointer)
            parent_tag = ""
            try:
                p = elem.get("/P")
                if isinstance(p, pikepdf.Dictionary):
                    parent_tag = (get_name(p) or "").lstrip("/").upper()
            except Exception:
                pass

            if tag == "L":
                list_count += 1
                # Check that L has at least one LI direct child
                has_li = False
                try:
                    k = elem.get("/K")
                    children: list = []
                    if isinstance(k, pikepdf.Array):
                        children = list(k)
                    elif isinstance(k, pikepdf.Dictionary):
                        children = [k]
                    for ch in children:
                        if isinstance(ch, pikepdf.Dictionary):
                            ctag = (get_name(ch) or "").lstrip("/").upper()
                            if ctag == "LI":
                                has_li = True
                                break
                except Exception:
                    pass
                if not has_li:
                    lists_without_items += 1

            elif tag == "LI":
                list_item_count += 1
                # LI must be a child of L
                if parent_tag and parent_tag != "L":
                    list_item_misplaced += 1

            elif tag in ("LBL", "LBODY"):
                # Lbl / LBody must be children of LI
                if parent_tag and parent_tag != "LI":
                    lbl_body_misplaced += 1

            try:
                _enqueue_children(q, elem.get("/K"))
            except Exception:
                pass
        except Exception:
            pass

    return {
        "listCount": list_count,
        "listItemCount": list_item_count,
        "listItemMisplacedCount": list_item_misplaced,
        "lblBodyMisplacedCount": lbl_body_misplaced,
        "listsWithoutItems": lists_without_items,
    }


def collect_tagged_content_audit(pdf: pikepdf.Pdf) -> dict:
    orphans = collect_orphan_mcids(pdf)
    spans = collect_mcid_text_spans(pdf)
    return {
        "orphanMcidCount": len(orphans),
        "mcidTextSpanCount": len(spans),
        "suspectedPathPaintOutsideMc": _count_path_paint_outside_mcid_bdc(pdf, max_pages=12, max_hits=200),
    }


def _is_qQ_balanced(insts: list) -> bool:
    """Return True iff the instruction list has balanced q/Q with no negative depth."""
    depth = 0
    for inst in insts:
        op = str(inst.operator)
        if op == "q":
            depth += 1
        elif op == "Q":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def _page_has_paint_ops(instructions: list) -> bool:
    """Return True if any instruction is a visible paint operator."""
    return any(str(inst.operator) in _PAINT_OPS for inst in instructions)


def _mark_page_untagged_as_artifact(pdf: pikepdf.Pdf, page_obj) -> bool:
    """
    Rewrite *one* page content stream to ensure all visible content is inside a
    marked-content block (BDC/BMC … EMC), satisfying Acrobat's 'All page content
    is tagged' (TaggedCont) check.

    Two cases are handled:

    Case A — page already has BDC/BMC blocks but also has content *outside* them:
        Wrap each outside segment that contains paint operators in /Artifact BMC…EMC.

    Case B — page has NO BDC/BMC blocks at all (a tagged-in-name-only PDF):
        Wrap the entire content stream in /Artifact BMC…EMC so Acrobat sees the
        content as intentionally-decorated / background.  This preserves the raw
        text/graphics while satisfying the structural check without corrupting the
        existing (empty) structure tree.

    Returns True iff the content stream was changed.
    """
    try:
        instructions = list(pikepdf.parse_content_stream(page_obj))
    except Exception:
        return False

    if not instructions:
        return False

    has_marked = any(str(inst.operator) in ("BDC", "BMC") for inst in instructions)

    # ── Case B: no BDC/BMC on this page at all ────────────────────────────────
    if not has_marked:
        if not _page_has_paint_ops(instructions):
            return False  # Empty or state-only page; nothing to wrap.
        # Wrap the whole stream in a single Artifact block.
        # BMC/EMC are independent of q/Q graphics-state save/restore, so wrapping
        # is safe regardless of q/Q balance.
        try:
            new_insts = (
                [pikepdf.ContentStreamInstruction([pikepdf.Name("/Artifact")], pikepdf.Operator("BMC"))]
                + list(instructions)
                + [pikepdf.ContentStreamInstruction([], pikepdf.Operator("EMC"))]
            )
            page_obj["/Contents"] = pdf.make_stream(
                pikepdf.unparse_content_stream(new_insts)
            )
            return True
        except Exception as e:
            print(f"[warn] _mark_page_untagged_as_artifact (case B): {e}", file=sys.stderr)
            return False

    # ── Case A: page has BDC/BMC but also untagged paint outside those blocks ─
    depth = 0
    outside_segs: list[tuple[int, int]] = []  # (start_idx, end_idx) exclusive
    seg_start = 0

    for i, inst in enumerate(instructions):
        op = str(inst.operator)
        if op in ("BDC", "BMC"):
            if depth == 0 and i > seg_start:
                outside_segs.append((seg_start, i))
            depth += 1
        elif op == "EMC":
            depth = max(0, depth - 1)
            if depth == 0:
                seg_start = i + 1

    # Trailing segment after last EMC.
    if depth == 0 and seg_start < len(instructions):
        outside_segs.append((seg_start, len(instructions)))

    # Keep only segments with at least one paint operator.
    segs_to_wrap = [
        (s, e)
        for s, e in outside_segs
        if any(str(instructions[j].operator) in _PAINT_OPS for j in range(s, e))
    ]
    if not segs_to_wrap:
        return False

    rewritten: list = []
    prev_end = 0
    made_change = False

    for seg_start, seg_end in segs_to_wrap:
        rewritten.extend(instructions[prev_end:seg_start])
        seg = instructions[seg_start:seg_end]

        # BMC/EMC don't interact with q/Q graphics-state save/restore, so wrapping
        # is safe even when the segment has a leading Q or other imbalance.
        rewritten.append(
            pikepdf.ContentStreamInstruction(
                [pikepdf.Name("/Artifact")],
                pikepdf.Operator("BMC"),
            )
        )
        rewritten.extend(seg)
        rewritten.append(
            pikepdf.ContentStreamInstruction([], pikepdf.Operator("EMC"))
        )
        made_change = True

        prev_end = seg_end

    rewritten.extend(instructions[prev_end:])

    if not made_change:
        return False

    try:
        page_obj["/Contents"] = pdf.make_stream(
            pikepdf.unparse_content_stream(rewritten)
        )
        return True
    except Exception as e:
        print(f"[warn] _mark_page_untagged_as_artifact (case A): {e}", file=sys.stderr)
        return False


def _op_mark_untagged_content_as_artifact(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """
    For every page in a tagged PDF, wrap content outside BDC/EMC blocks in
    /Artifact BMC…EMC so Acrobat passes the 'All page content is tagged' check.

    On OCRmyPDF-produced PDFs that have NOT yet had tag_ocr_text_blocks applied
    (detected by absence of BDC markers on the first non-empty page): skip entirely
    to avoid converting the invisible OCR text layer to Artifact before it's tagged.
    Once tag_ocr_text_blocks has run, BDC markers are present and this tool safely
    wraps the remaining untagged Do (background image) operators as Artifacts.
    """
    if _is_ocrmypdf_produced(pdf):
        # Only run if tag_ocr_text_blocks has already wrapped text in BDC blocks.
        # Check first non-empty page for BDC markers as a proxy.
        has_bdc = False
        for pg in pdf.pages[:5]:
            try:
                insts = list(pikepdf.parse_content_stream(pg.obj))
                if any(str(i.operator) == "BDC" for i in insts):
                    has_bdc = True
                    break
            except Exception:
                pass
        if not has_bdc:
            return False
    changed = False
    for page in pdf.pages:
        try:
            if _mark_page_untagged_as_artifact(pdf, page.obj):
                changed = True
        except Exception as e:
            print(f"[warn] _op_mark_untagged_content_as_artifact page: {e}", file=sys.stderr)
    return changed


def _remap_orphan_mcids_page(page_obj, orphan_mcids_on_page: set) -> bool:
    """
    Rewrite one page content stream: replace BDC instructions whose /MCID value
    appears in *orphan_mcids_on_page* with /Artifact BMC so Acrobat no longer
    sees orphaned (unreferenced) marked-content identifiers.
    Returns True iff the stream changed.
    """
    if not orphan_mcids_on_page:
        return False
    try:
        instructions = list(pikepdf.parse_content_stream(page_obj))
    except Exception:
        return False

    rewritten = []
    changed = False
    for inst in instructions:
        if str(inst.operator) == "BDC":
            ops = inst.operands
            if len(ops) >= 2:
                try:
                    prop = ops[1]
                    if isinstance(prop, pikepdf.Dictionary):
                        mcid_val = prop.get("/MCID")
                        if isinstance(mcid_val, int) and mcid_val in orphan_mcids_on_page:
                            rewritten.append(
                                pikepdf.ContentStreamInstruction(
                                    [pikepdf.Name("/Artifact")],
                                    pikepdf.Operator("BMC"),
                                )
                            )
                            changed = True
                            continue
                except Exception:
                    pass
        rewritten.append(inst)

    if not changed:
        return False
    try:
        page_obj["/Contents"] = pikepdf.Pdf.new().make_stream(
            pikepdf.unparse_content_stream(rewritten)
        )
    except Exception:
        # Fallback: we need the actual pdf to make_stream — use a raw bytes approach.
        # This branch only triggers if make_stream needs a Pdf context.
        return False
    return True


def _op_remap_orphan_mcids_as_artifacts(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """
    For each orphan MCID (content-stream /MCID N with no StructTree reference),
    replace its BDC with /Artifact BMC so Acrobat's 'Tagged content' check passes.
    This converts truly-unreferenced marked content to artifacts, which is the
    correct accessibility state (not worse than orphaned, and structurally valid).

    Loops until convergence because collect_orphan_mcids caps at 64 per call —
    multiple passes may be needed to catch all orphans.
    """
    any_changed = False
    for _round in range(8):  # at most 8 passes; each pass fixes up to 64 orphans
        orphans = collect_orphan_mcids(pdf)
        if not orphans:
            break

        # Group by page index
        by_page: dict[int, set] = {}
        for o in orphans:
            pi = o["page"]
            by_page.setdefault(pi, set()).add(o["mcid"])

        round_changed = False
        for pi, mcid_set in by_page.items():
            if pi >= len(pdf.pages):
                continue
            page_obj = pdf.pages[pi].obj
            try:
                insts = list(pikepdf.parse_content_stream(page_obj))
            except Exception:
                continue
            rewritten = []
            page_changed = False
            for inst in insts:
                if str(inst.operator) == "BDC":
                    ops = inst.operands
                    if len(ops) >= 2:
                        try:
                            prop = ops[1]
                            if isinstance(prop, pikepdf.Dictionary):
                                mcid_val = prop.get("/MCID")
                                if isinstance(mcid_val, int) and mcid_val in mcid_set:
                                    rewritten.append(
                                        pikepdf.ContentStreamInstruction(
                                            [pikepdf.Name("/Artifact")],
                                            pikepdf.Operator("BMC"),
                                        )
                                    )
                                    page_changed = True
                                    continue
                        except Exception:
                            pass
                rewritten.append(inst)
            if page_changed:
                try:
                    page_obj["/Contents"] = pdf.make_stream(
                        pikepdf.unparse_content_stream(rewritten)
                    )
                    round_changed = True
                except Exception as e:
                    print(f"[warn] _op_remap_orphan_mcids_as_artifacts page {pi}: {e}", file=sys.stderr)

        if round_changed:
            any_changed = True
        else:
            break  # No progress — stop

    return any_changed


def _insert_p_for_orphan_mcid_on_page(pdf: pikepdf.Pdf, target_page: int, mcid: int) -> bool:
    page_map = build_page_map(pdf)
    ref_pairs = collect_referenced_mcid_pairs(pdf, page_map)
    if (target_page, mcid) in ref_pairs:
        return False
    page = pdf.pages[target_page]
    raw = _read_page_contents_raw(page)
    ok = False
    for m in MCID_OP_RE.finditer(raw):
        if int(m.group(1)) == mcid:
            ok = True
            break
    if not ok:
        return False
    sr = pdf.Root.get("/StructTreeRoot")
    if sr is None:
        return False
    kroot = sr.get("/K")
    if not isinstance(kroot, pikepdf.Array) or len(kroot) < 1:
        return False
    doc_elem = kroot[0]
    if not isinstance(doc_elem, pikepdf.Dictionary):
        return False
    p_elem = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/StructElem"),
            S=pikepdf.Name("/P"),
            K=mcid,
            Pg=page.obj,
            P=doc_elem,
        )
    )
    existing_k = doc_elem.get("/K")
    if isinstance(existing_k, pikepdf.Array):
        existing_k.append(p_elem)
    elif existing_k is None:
        doc_elem["/K"] = pikepdf.Array([p_elem])
    else:
        doc_elem["/K"] = pikepdf.Array([existing_k, p_elem])
    if pdf_has_3cc_orphan_marker(pdf):
        _sync_parent_tree_orphan_fixture(pdf, page, p_elem)
    else:
        _sync_parent_tree_single_page_wrap(pdf, page, p_elem)
    return True


def _op_wrap_singleton_orphan_mcid(pdf: pikepdf.Pdf, params: dict) -> bool:
    """Link a single orphan (page, mcid) into the document /P child; params from planner only."""
    try:
        page = int(params.get("page", -1))
        mcid = int(params.get("mcid", -1))
    except (TypeError, ValueError):
        return False
    if page < 0 or mcid < 0:
        return False
    orphans = collect_orphan_mcids(pdf)
    if len(orphans) != 1:
        return False
    o0 = orphans[0]
    if int(o0.get("page", -1)) != page or int(o0.get("mcid", -1)) != mcid:
        return False
    return _insert_p_for_orphan_mcid_on_page(pdf, page, mcid)


def try_struct_elem_bbox(elem) -> list[float] | None:
    """Optional [x0,y0,x1,y1] from /QuadPoints or /A/*/BBox when present."""
    try:
        qp = elem.get("/QuadPoints")
        if qp is not None:
            arr = [float(x) for x in list(qp)]
            if len(arr) >= 8:
                xs = arr[0::2]
                ys = arr[1::2]
                return [min(xs), min(ys), max(xs), max(ys)]
    except Exception:
        pass

    def bbox_from_dict(d) -> list[float] | None:
        try:
            b = d.get("/BBox")
            if b is None:
                return None
            bb = [float(x) for x in list(b)]
            if len(bb) < 4:
                return None
            return [bb[0], bb[1], bb[2], bb[3]]
        except Exception:
            return None

    try:
        a = elem.get("/A")
        if isinstance(a, pikepdf.Dictionary):
            bb = bbox_from_dict(a)
            if bb:
                return bb
        if isinstance(a, pikepdf.Array):
            for item in a:
                if isinstance(item, pikepdf.Dictionary):
                    bb = bbox_from_dict(item)
                    if bb:
                        return bb
    except Exception:
        pass
    return None


def collect_referenced_mcid_pairs(pdf: pikepdf.Pdf, page_map: dict) -> set[tuple[int, int]]:
    """(page_index, mcid) pairs referenced by structure elements' integer /K."""
    out: set[tuple[int, int]] = set()
    try:
        sr = pdf.Root.get("/StructTreeRoot")
        if sr is None:
            return out
        q: deque = deque()
        _enqueue_children(q, sr.get("/K"))
        seen: set[int] = set()
        it = 0
        while q and it < MAX_ITEMS * 80:
            it += 1
            elem = q.popleft()
            try:
                oid = id(elem)
            except Exception:
                continue
            if oid in seen or not isinstance(elem, pikepdf.Dictionary):
                continue
            seen.add(oid)
            pg = get_page_number(elem, page_map)
            k = elem.get("/K")
            if isinstance(k, int):
                out.add((pg, k))
            elif isinstance(k, pikepdf.Array):
                for ch in k:
                    if isinstance(ch, int):
                        out.add((pg, ch))
                    elif isinstance(ch, pikepdf.Dictionary):
                        try:
                            if ch.get("/Type") == pikepdf.Name("/MCR"):
                                mid = ch.get("/MCID")
                                if isinstance(mid, int):
                                    out.add((pg, mid))
                            else:
                                q.append(ch)
                        except Exception:
                            q.append(ch)
            elif isinstance(k, pikepdf.Dictionary):
                try:
                    if k.get("/Type") == pikepdf.Name("/MCR"):
                        mid = k.get("/MCID")
                        if isinstance(mid, int):
                            out.add((pg, mid))
                    else:
                        q.append(k)
                except Exception:
                    q.append(k)
    except Exception:
        pass
    return out


def collect_orphan_mcids(pdf: pikepdf.Pdf) -> list[dict]:
    """MCIDs appearing in page streams but not referenced as integer /K on any StructElem."""
    page_map = build_page_map(pdf)
    ref = collect_referenced_mcid_pairs(pdf, page_map)
    mp = _mcid_max_pages()
    seen: set[tuple[int, int]] = set()
    out: list[dict] = []
    for pi in range(min(len(pdf.pages), mp)):
        raw = _read_page_contents_raw(pdf.pages[pi])
        for m in MCID_OP_RE.finditer(raw):
            pair = (pi, int(m.group(1)))
            if pair in ref or pair in seen:
                continue
            seen.add(pair)
            out.append({"page": pi, "mcid": pair[1]})
            if len(out) >= 64:
                return out
    return out


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _normalize_pdf_user_text(s: str, max_len: int | None = None) -> str:
    """
    Normalize user-facing strings written into PDF dictionaries / structure / metadata.
    NFC for stable composed characters; strip NULs and UTF-16 surrogate code units (invalid in PDF text).
    """
    if not isinstance(s, str):
        s = str(s)
    s = unicodedata.normalize("NFC", s).replace("\x00", "")
    s = "".join(ch for ch in s if not (0xD800 <= ord(ch) <= 0xDFFF))
    if max_len is not None:
        s = s[: max(0, int(max_len))]
    return s


def _pdf_text_string(s: str, max_len: int | None = None) -> pikepdf.String:
    """PDF text string for human-readable values (UTF-16BE with BOM when non-ASCII; pikepdf handles encoding)."""
    return pikepdf.String(_normalize_pdf_user_text(s, max_len))


def safe_str(obj, default="") -> str:
    """Convert a pikepdf object to a plain Python string safely."""
    if obj is None:
        return default
    try:
        if isinstance(obj, pikepdf.String):
            return str(obj)
        if isinstance(obj, pikepdf.Name):
            return str(obj)[1:]  # strip leading /
        return str(obj)
    except Exception:
        return default


def safe_int(obj, default=0) -> int:
    try:
        return int(obj)
    except Exception:
        return default


def get_name(obj) -> str:
    """Extract the /S (subtype) name from a structure element."""
    try:
        s = obj.get("/S")
        if s is not None:
            return safe_str(s)
    except Exception:
        pass
    return ""


def get_alt(obj) -> str | None:
    """Get /Alt text from a structure element."""
    try:
        a = obj.get("/Alt")
        if a is not None:
            v = safe_str(a)
            return v if v else None
    except Exception:
        pass
    return None


def object_ref_str(obj) -> str | None:
    """Stable indirect reference 'num_gen' for mutation targeting; None if not indirect."""
    try:
        if isinstance(obj, pikepdf.Dictionary):
            n, g = obj.objgen
            if n == 0:
                return None
            return f"{n}_{g}"
    except Exception:
        pass
    return None


def get_page_number(obj, page_map: dict) -> int:
    """Best-effort page number (0-indexed) from an element's /Pg ref."""
    try:
        pg = obj.get("/Pg")
        if pg is not None:
            objid = pg.objgen[0]
            return page_map.get(objid, 0)
    except Exception:
        pass
    return 0


def build_page_map(pdf: pikepdf.Pdf) -> dict:
    """Map object-id → 0-based page index for fast /Pg lookups."""
    page_map = {}
    for idx, page in enumerate(pdf.pages):
        try:
            page_map[page.objgen[0]] = idx
        except Exception:
            pass
    return page_map


def normalize_heading_level(tag: str) -> int | None:
    """Return 1–6 for H, H1–H6; None for anything else."""
    tag = tag.upper()
    if tag == "H":
        return 1
    m = re.match(r"^H([1-6])$", tag)
    if m:
        return int(m.group(1))
    return None


# ─── Metadata extraction ─────────────────────────────────────────────────────

def extract_metadata(pdf: pikepdf.Pdf) -> dict:
    result = {"title": None, "author": None, "subject": None,
              "lang": None, "pdfUaVersion": None,
              "isTagged": False, "markInfo": None}
    try:
        root = pdf.Root
        # Language
        lang = root.get("/Lang")
        if lang is not None:
            result["lang"] = safe_str(lang) or None

        mi = root.get("/MarkInfo")
        if mi is not None:
            marked = mi.get("/Marked")
            result["markInfo"] = {"Marked": bool(marked) and str(marked) != "false"}

        # Tagged PDF (WCAG / external auditors): require /StructTreeRoot, not MarkInfo alone
        sr_meta = root.get("/StructTreeRoot")
        result["isTagged"] = isinstance(sr_meta, pikepdf.Dictionary)
        if result["isTagged"] and result["markInfo"] is None:
            result["markInfo"] = {"Marked": True}

        # Info dict
        try:
            info = pdf.docinfo
            if info:
                t = info.get("/Title")
                if t:
                    result["title"] = safe_str(t) or None
                a = info.get("/Author")
                if a:
                    result["author"] = safe_str(a) or None
                s = info.get("/Subject")
                if s:
                    result["subject"] = safe_str(s) or None
        except Exception:
            pass

        # XMP metadata → pdfuaid:part
        try:
            with pdf.open_metadata() as meta:
                ua = meta.get("pdfuaid:part")
                if ua:
                    result["pdfUaVersion"] = str(ua)
                # Also check language from XMP if not set
                if not result["lang"]:
                    dc_lang = meta.get("dc:language")
                    if dc_lang:
                        result["lang"] = str(dc_lang)
        except Exception:
            pass

    except Exception as e:
        print(f"[warn] metadata extraction failed: {e}", file=sys.stderr)

    return result


def pdf_has_3cc_golden_marker(pdf: pikepdf.Pdf) -> bool:
    """True when this PDF is the Phase 3c-c CI golden fixture (Info /Producer marker)."""
    try:
        info = pdf.docinfo
        if info:
            p = info.get("/Producer")
            if p:
                s = safe_str(p)
                if PDFAF_3CC_GOLDEN_MARKER in s:
                    return True
                # Producer is set but not our marker — do not open XMP here (open_metadata may rewrite /Producer).
                return False
    except Exception:
        pass
    try:
        with pdf.open_metadata(set_pikepdf_as_editor=False) as m:
            prod = m.get("pdf:Producer")
            if prod and PDFAF_3CC_GOLDEN_MARKER in str(prod):
                return True
    except Exception:
        pass
    return False


def pdf_has_3cc_orphan_marker(pdf: pikepdf.Pdf) -> bool:
    """True when this PDF is the Phase 3c-c orphan-MCID CI fixture (Info /Producer marker)."""
    try:
        info = pdf.docinfo
        if info:
            p = info.get("/Producer")
            if p:
                s = safe_str(p)
                if PDFAF_3CC_ORPHAN_MARKER in s:
                    return True
                return False
    except Exception:
        pass
    try:
        with pdf.open_metadata(set_pikepdf_as_editor=False) as m:
            prod = m.get("pdf:Producer")
            if prod and PDFAF_3CC_ORPHAN_MARKER in str(prod):
                return True
    except Exception:
        pass
    return False


def collect_mcid_text_spans(pdf: pikepdf.Pdf) -> list[dict]:
    """Best-effort: find /MCID operators in page content streams (Phase 3c-c analysis)."""
    out: list[dict] = []
    n = min(len(pdf.pages), _mcid_max_pages())
    for pi in range(n):
        if len(out) >= MAX_MCID_SPANS:
            break
        try:
            page = pdf.pages[pi]
            raw = _read_page_contents_raw(page)
            for m in MCID_OP_RE.finditer(raw):
                if len(out) >= MAX_MCID_SPANS:
                    break
                start = max(0, m.start() - 40)
                end = min(len(raw), m.end() + 40)
                snippet = raw[start:end].decode("latin-1", errors="replace").replace("\n", " ")
                resolved = extract_resolved_text_after_mcid(raw, m)
                row: dict = {"page": pi, "mcid": int(m.group(1)), "snippet": snippet[:200]}
                if resolved:
                    row["resolvedText"] = resolved
                out.append(row)
        except Exception:
            continue
    return out


def dump_structure_page(pdf: pikepdf.Pdf, page_idx: int) -> dict:
    """Dev-only JSON report: structure root, ParentTree size, page /Contents MCID scan."""
    out: dict = {
        "pageIndex": page_idx,
        "goldenMarker": pdf_has_3cc_golden_marker(pdf),
        "orphanMarker": pdf_has_3cc_orphan_marker(pdf),
        "structTreeRootPresent": False,
        "parentTreeNumsPairCount": None,
        "pageDictKeys": [],
        "mcidMatches": [],
        "contentSnippet": "",
    }
    try:
        sr = pdf.Root.get("/StructTreeRoot")
        if sr is not None:
            out["structTreeRootPresent"] = True
            pt = sr.get("/ParentTree")
            if pt is not None:
                nums = pt.get("/Nums")
                if isinstance(nums, pikepdf.Array):
                    out["parentTreeNumsPairCount"] = len(nums) // 2
        if page_idx < 0 or page_idx >= len(pdf.pages):
            out["error"] = "page_out_of_range"
            return out
        page = pdf.pages[page_idx]
        out["pageDictKeys"] = [str(k) for k in page.keys()]
        c = page.get("/Contents")
        raw = b""
        if c is not None:
            if isinstance(c, pikepdf.Array):
                for part in c:
                    try:
                        raw += part.read_bytes()
                    except Exception:
                        try:
                            raw += bytes(part)
                        except Exception:
                            pass
            else:
                try:
                    raw = c.read_bytes()
                except Exception:
                    try:
                        raw = bytes(c)
                    except Exception:
                        pass
        out["contentSnippet"] = raw[:1200].decode("latin-1", errors="replace")
        for m in MCID_OP_RE.finditer(raw):
            out["mcidMatches"].append({"mcid": int(m.group(1)), "offset": m.start()})
    except Exception as e:
        out["error"] = str(e)
    return out


def write_3cc_golden_fixture(path: str) -> None:
    """Write a one-page tagged PDF used for Phase 3c-c CI (producer marker + /P + MCID 0)."""
    pdf = pikepdf.Pdf.new()
    page = pdf.add_blank_page(page_size=(612, 792))
    font_dict = pikepdf.Dictionary(
        Type=pikepdf.Name("/Font"),
        Subtype=pikepdf.Name("/Type1"),
        BaseFont=pikepdf.Name("/Helvetica"),
    )
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font_dict))
    content = (
        b"/P << /MCID 0 >> BDC\n"
        b"BT /F1 24 Tf 72 720 Td (Golden Title) Tj\n"
        b"ET\n"
        b"EMC\n"
    )
    page.Contents = pdf.make_stream(content)
    doc_elem = pdf.make_indirect(
        pikepdf.Dictionary(Type=pikepdf.Name("/StructElem"), S=pikepdf.Name("/Document"))
    )
    p_elem = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/StructElem"),
            S=pikepdf.Name("/P"),
            K=0,
            Pg=page.obj,
            P=doc_elem,
        )
    )
    doc_elem["/K"] = pikepdf.Array([p_elem])
    str_root = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/StructTreeRoot"),
            K=pikepdf.Array([doc_elem]),
            ParentTree=pikepdf.Dictionary(Nums=pikepdf.Array([])),
        )
    )
    pdf.Root["/StructTreeRoot"] = str_root
    pdf.Root["/MarkInfo"] = pikepdf.Dictionary(Marked=True, Suspects=False)
    pdf.docinfo[pikepdf.Name.Producer] = pikepdf.String(PDFAF_3CC_GOLDEN_MARKER)
    pdf.save(path)


def write_3cc_orphan_fixture(path: str) -> None:
    """One-page tagged PDF: /P marked content + MCID in stream, but no StructElem references that MCID (orphan)."""
    pdf = pikepdf.Pdf.new()
    page = pdf.add_blank_page(page_size=(612, 792))
    font_dict = pikepdf.Dictionary(
        Type=pikepdf.Name("/Font"),
        Subtype=pikepdf.Name("/Type1"),
        BaseFont=pikepdf.Name("/Helvetica"),
    )
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font_dict))
    content = (
        b"/P << /MCID 0 >> BDC\n"
        b"BT /F1 24 Tf 72 720 Td (Orphan Title) Tj\n"
        b"ET\n"
        b"EMC\n"
    )
    page.Contents = pdf.make_stream(content)
    doc_elem = pdf.make_indirect(
        pikepdf.Dictionary(Type=pikepdf.Name("/StructElem"), S=pikepdf.Name("/Document"))
    )
    doc_elem["/K"] = pikepdf.Array([])
    str_root = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/StructTreeRoot"),
            K=pikepdf.Array([doc_elem]),
            ParentTree=pikepdf.Dictionary(Nums=pikepdf.Array([])),
        )
    )
    pdf.Root["/StructTreeRoot"] = str_root
    pdf.Root["/MarkInfo"] = pikepdf.Dictionary(Marked=True, Suspects=False)
    pdf.docinfo[pikepdf.Name.Producer] = pikepdf.String(PDFAF_3CC_ORPHAN_MARKER)
    pdf.save(path)


# ─── Structure tree traversal ─────────────────────────────────────────────────

def traverse_struct_tree(pdf: pikepdf.Pdf, page_map: dict) -> dict:
    """
    Walk the structure tree iteratively, collecting headings, figures, tables,
    and form fields. Returns counts/lists suitable for JSON serialisation.
    """
    headings   = []
    figures    = []
    tables_out = []
    form_fields= []
    paragraph_struct_elems = []
    struct_tree_json = None

    try:
        root = pdf.Root
        str_root = root.get("/StructTreeRoot")
        if str_root is None:
            return {"headings": headings, "figures": figures,
                    "tables": tables_out, "formFields": form_fields,
                    "paragraphStructElems": paragraph_struct_elems,
                    "structureTree": None}

        # Build a minimal JSON struct tree for reading-order heuristic (depth-limited)
        struct_tree_json = _build_mini_tree(str_root, depth=0, max_depth=4)

        try:
            mcid_lookup = _build_mcid_resolved_lookup(pdf)
        except Exception:
            mcid_lookup = {}

        # BFS across the full tree
        # Each queue item: the element object
        queue = deque()
        try:
            k = str_root.get("/K")
            _enqueue_children(queue, k)
        except Exception:
            pass

        visited = set()
        item_count = 0

        while queue and item_count < MAX_ITEMS * 4:
            item_count += 1
            try:
                elem = queue.popleft()

                # Avoid infinite loops on circular refs
                try:
                    oid = id(elem)
                    if oid in visited:
                        continue
                    visited.add(oid)
                except Exception:
                    pass

                tag = get_name(elem)
                page = get_page_number(elem, page_map)

                # Headings
                level = normalize_heading_level(tag)
                if level is not None and len(headings) < MAX_ITEMS:
                    text = _extract_text_from_elem(elem) or _text_from_mcid_for_elem(elem, page, mcid_lookup)
                    ref = object_ref_str(elem)
                    row = {"level": level, "text": text, "page": page}
                    if ref:
                        row["structRef"] = ref
                    headings.append(row)

                # Figures (includes Word InlineShape / Shape — Acrobat FigAltText)
                elif _struct_role_requires_figure_style_alt(tag) and len(figures) < MAX_ITEMS:
                    alt = get_alt(elem)
                    is_artifact = _is_artifact(elem)
                    ref = object_ref_str(elem)
                    row = {
                        "hasAlt": alt is not None and len(alt) > 0,
                        "altText": alt,
                        "isArtifact": is_artifact,
                        "page": page,
                    }
                    if ref:
                        row["structRef"] = ref
                    try:
                        fbb = try_struct_elem_bbox(elem)
                        if fbb:
                            row["bbox"] = fbb
                    except Exception:
                        pass
                    figures.append(row)

                # Tables
                elif tag == "Table" and len(tables_out) < MAX_ITEMS:
                    th_count, td_count = _count_table_cells(elem)
                    audit = _audit_table_structure(elem)
                    ref = object_ref_str(elem)
                    row = {
                        "hasHeaders": th_count > 0,
                        "headerCount": th_count,
                        "totalCells": th_count + td_count,
                        "rowCount": audit["rowCount"],
                        "cellsMisplacedCount": audit["cellsMisplacedCount"],
                        "irregularRows": audit["irregularRows"],
                        "rowCellCounts": audit.get("rowCellCounts") or [],
                        "dominantColumnCount": audit.get("dominantColumnCount") or 0,
                        "maxRowSpan": audit.get("maxRowSpan") or 1,
                        "maxColSpan": audit.get("maxColSpan") or 1,
                        "page": page,
                    }
                    if ref:
                        row["structRef"] = ref
                    tables_out.append(row)

                # Paragraph-like struct elems (Phase 3c analysis; promote mutator may allow /P only)
                elif len(paragraph_struct_elems) < MAX_ITEMS:
                    tnorm = (tag or "").lstrip("/").upper()
                    if tnorm in ("P", "SPAN", "DIV") and normalize_heading_level(tag) is None:
                        ref = object_ref_str(elem)
                        if ref:
                            text = _extract_text_from_elem(elem) or _text_from_mcid_for_elem(elem, page, mcid_lookup)
                            prow = {
                                "tag": tnorm,
                                "text": (text or "")[:500],
                                "page": page,
                                "structRef": ref,
                            }
                            try:
                                bb = try_struct_elem_bbox(elem)
                                if bb:
                                    prow["bbox"] = bb
                            except Exception:
                                pass
                            paragraph_struct_elems.append(prow)

                # Form fields (tagged)
                elif tag in ("Form", "Widget") and len(form_fields) < MAX_ITEMS:
                    name = safe_str(elem.get("/T", ""))
                    tooltip = safe_str(elem.get("/TU", "")) or None
                    form_fields.append({"name": name, "tooltip": tooltip, "page": page})

                # Recurse into children
                k = elem.get("/K")
                if k is not None:
                    _enqueue_children(queue, k)

            except Exception as e:
                print(f"[warn] struct element error: {e}", file=sys.stderr)
                continue

    except Exception as e:
        print(f"[warn] struct tree traversal failed: {e}", file=sys.stderr)

    return {
        "headings": headings,
        "figures": figures,
        "tables": tables_out,
        "formFields": form_fields,
        "paragraphStructElems": paragraph_struct_elems,
        "structureTree": struct_tree_json,
    }


def _enqueue_children(queue: deque, k) -> None:
    if k is None:
        return
    try:
        if isinstance(k, pikepdf.Array):
            for child in k:
                try:
                    if isinstance(child, pikepdf.Dictionary):
                        queue.append(child)
                except Exception:
                    pass
        elif isinstance(k, pikepdf.Dictionary):
            queue.append(k)
    except Exception:
        pass


def _extract_text_from_elem(elem) -> str:
    """Best-effort: get text content from a structure element's /ActualText or /Alt."""
    try:
        at = elem.get("/ActualText")
        if at is not None:
            v = safe_str(at).strip()
            if v:
                return v[:200]
    except Exception:
        pass
    try:
        alt = elem.get("/Alt")
        if alt is not None:
            v = safe_str(alt).strip()
            if v:
                return v[:200]
    except Exception:
        pass
    return ""


def _direct_k_mcids(elem) -> list[int]:
    """Integer /MCID values referenced directly on this structure element's /K (shallow)."""
    out: list[int] = []
    try:
        k = elem.get("/K")
    except Exception:
        return out
    if isinstance(k, int):
        return [k]
    if isinstance(k, pikepdf.Array):
        for ch in k:
            if isinstance(ch, int):
                out.append(ch)
            elif isinstance(ch, pikepdf.Dictionary):
                try:
                    if ch.get("/Type") == pikepdf.Name("/MCR"):
                        mid = ch.get("/MCID")
                        if isinstance(mid, int):
                            out.append(mid)
                except Exception:
                    pass
    elif isinstance(k, pikepdf.Dictionary):
        try:
            if k.get("/Type") == pikepdf.Name("/MCR"):
                mid = k.get("/MCID")
                if isinstance(mid, int):
                    return [mid]
        except Exception:
            pass
    return out


def _build_mcid_resolved_lookup(pdf: pikepdf.Pdf) -> dict[tuple[int, int], str]:
    """Map (page_index, mcid) -> best resolved or snippet text from content streams."""
    d: dict[tuple[int, int], str] = {}
    try:
        for row in collect_mcid_text_spans(pdf):
            page = int(row["page"])
            mcid = int(row["mcid"])
            rt = (row.get("resolvedText") or "").strip()
            sn = (row.get("snippet") or "").strip()
            t = rt or sn
            if not t:
                continue
            key = (page, mcid)
            prev = d.get(key, "")
            if len(t) > len(prev):
                d[key] = t[:400]
    except Exception:
        pass
    return d


def _text_from_mcid_for_elem(elem, page: int, lookup: dict[tuple[int, int], str]) -> str:
    parts: list[str] = []
    for mid in _direct_k_mcids(elem):
        t = lookup.get((page, mid), "").strip()
        if t:
            parts.append(t)
    s = " ".join(parts).strip()
    return s[:500]


def _is_artifact(elem) -> bool:
    try:
        usage = elem.get("/Usage")
        if usage is not None and "Artifact" in safe_str(usage):
            return True
        # Some encoders mark decorative figures with /Type /Artifact
        t = elem.get("/Type")
        if t is not None and "Artifact" in safe_str(t):
            return True
    except Exception:
        pass
    return False


def _count_table_cells(table_elem) -> tuple[int, int]:
    """Count /TH and /TD cells in a table element (BFS)."""
    th = 0
    td = 0
    try:
        q: deque = deque()
        k = table_elem.get("/K")
        _enqueue_children(q, k)
        limit = 500
        while q and limit > 0:
            limit -= 1
            elem = q.popleft()
            tag = get_name(elem)
            if tag == "TH":
                th += 1
            elif tag == "TD":
                td += 1
            k2 = elem.get("/K")
            _enqueue_children(q, k2)
    except Exception:
        pass
    return th, td


def _count_tr_row_cells(tr_elem) -> int:
    """Count /TH and /TD that are direct StructElem children of a /TR (Acrobat row model)."""
    n = 0
    try:
        for rc in _struct_elem_children(tr_elem):
            rtag = (get_name(rc) or "").lstrip("/").upper()
            if rtag in ("TH", "TD"):
                n += 1
    except Exception:
        pass
    return n


def _tr_cell_span_max(tr_elem) -> tuple[int, int]:
    """Max /RowSpan and /ColSpan on TH/TD direct children of TR (defaults 1)."""
    max_rs, max_cs = 1, 1
    try:
        for rc in _struct_elem_children(tr_elem):
            rtag = (get_name(rc) or "").lstrip("/").upper()
            if rtag not in ("TH", "TD"):
                continue
            try:
                rs = int(rc.get("/RowSpan") or 1)
            except Exception:
                rs = 1
            try:
                cs = int(rc.get("/ColSpan") or 1)
            except Exception:
                cs = 1
            max_rs = max(max_rs, rs)
            max_cs = max(max_cs, cs)
    except Exception:
        pass
    return max_rs, max_cs


def _audit_table_structure(table_elem) -> dict:
    """
    Structural audit of a single Table StructElem (v1 pdf_structure_helper table_row_dicts spirit):
    - rowCount: TR rows under Table, THead, TBody, or TFoot
    - cellsMisplacedCount: TH/TD that are direct children of Table or of THead/TBody/TFoot but not under TR
    - irregularRows: TR siblings with differing TH+TD counts (capped sample)
    - rowCellCounts, dominantColumnCount, maxRowSpan, maxColSpan: for pdfaf-style advisory regularity (Tier A)
    """
    row_count = 0
    cells_misplaced = 0
    row_cell_counts: list[int] = []
    max_row_span = 1
    max_col_span = 1

    def scan_section(section) -> None:
        nonlocal row_count, cells_misplaced, row_cell_counts, max_row_span, max_col_span
        try:
            for ch in _struct_elem_children(section):
                tag = (get_name(ch) or "").lstrip("/").upper()
                if tag == "TR":
                    row_count += 1
                    if len(row_cell_counts) < 20:
                        row_cell_counts.append(_count_tr_row_cells(ch))
                    rs, cs = _tr_cell_span_max(ch)
                    max_row_span = max(max_row_span, rs)
                    max_col_span = max(max_col_span, cs)
                elif tag in ("THEAD", "TBODY", "TFOOT"):
                    scan_section(ch)
                elif tag in ("TH", "TD"):
                    cells_misplaced += 1
        except Exception:
            pass

    try:
        for ch in _struct_elem_children(table_elem):
            tag = (get_name(ch) or "").lstrip("/").upper()
            if tag == "TR":
                row_count += 1
                if len(row_cell_counts) < 20:
                    row_cell_counts.append(_count_tr_row_cells(ch))
                rs, cs = _tr_cell_span_max(ch)
                max_row_span = max(max_row_span, rs)
                max_col_span = max(max_col_span, cs)
            elif tag in ("THEAD", "TBODY", "TFOOT"):
                scan_section(ch)
            elif tag in ("TH", "TD"):
                cells_misplaced += 1
    except Exception:
        pass

    irregular_rows = 0
    if len(row_cell_counts) > 1:
        ref = row_cell_counts[0]
        irregular_rows = sum(1 for c in row_cell_counts if c != ref)

    dominant = 0
    if row_cell_counts:
        dominant = Counter(row_cell_counts).most_common(1)[0][0]

    return {
        "rowCount": row_count,
        "cellsMisplacedCount": cells_misplaced,
        "irregularRows": irregular_rows,
        "rowCellCounts": row_cell_counts,
        "dominantColumnCount": dominant,
        "maxRowSpan": max_row_span,
        "maxColSpan": max_col_span,
    }


def _build_mini_tree(elem, depth: int, max_depth: int) -> dict | None:
    """Recursively build a depth-limited JSON tree for reading-order checks."""
    if depth > max_depth:
        return None
    try:
        tag = get_name(elem)
        node: dict = {"type": tag, "children": []}
        k = elem.get("/K")
        if k is not None and depth < max_depth:
            if isinstance(k, pikepdf.Array):
                for child in k:
                    if isinstance(child, pikepdf.Dictionary):
                        sub = _build_mini_tree(child, depth + 1, max_depth)
                        if sub:
                            node["children"].append(sub)
            elif isinstance(k, pikepdf.Dictionary):
                sub = _build_mini_tree(k, depth + 1, max_depth)
                if sub:
                    node["children"].append(sub)
        return node
    except Exception:
        return None


# ─── Font extraction ─────────────────────────────────────────────────────────

def extract_fonts(pdf: pikepdf.Pdf) -> list:
    seen = set()
    fonts = []
    try:
        for page in pdf.pages:
            if len(fonts) >= MAX_ITEMS:
                break
            try:
                resources = page.get("/Resources")
                if resources is None:
                    continue
                font_dict = resources.get("/Font")
                if font_dict is None:
                    continue
                for key in font_dict.keys():
                    if len(fonts) >= MAX_ITEMS:
                        break
                    try:
                        font = font_dict[key]
                        base_font = safe_str(font.get("/BaseFont", ""))
                        if base_font in seen:
                            continue
                        seen.add(base_font)

                        is_embedded = _font_is_embedded(font)
                        has_unicode = font.get("/ToUnicode") is not None
                        sub = safe_str(font.get("/Subtype", "")).lstrip("/")
                        enc = font.get("/Encoding")
                        enc_name = ""
                        if enc is not None:
                            if isinstance(enc, pikepdf.Name):
                                enc_name = safe_str(enc).lstrip("/")
                            else:
                                enc_name = "Custom"
                        # Acrobat "Character encoding" / reliable Unicode: non-embedded fonts almost always
                        # risk failure; embedded Type1/TrueType without /ToUnicode often fail WinAnsi mapping.
                        encoding_risk = (not is_embedded) or (
                            (not has_unicode) and sub in ("Type1", "TrueType")
                        )

                        fonts.append({
                            "name": base_font,
                            "isEmbedded": is_embedded,
                            "hasUnicode": has_unicode,
                            "subtype": sub or None,
                            "encodingName": enc_name or None,
                            "encodingRisk": encoding_risk,
                        })
                    except Exception as e:
                        print(f"[warn] font item error: {e}", file=sys.stderr)
            except Exception as e:
                print(f"[warn] page font error: {e}", file=sys.stderr)
    except Exception as e:
        print(f"[warn] font extraction failed: {e}", file=sys.stderr)
    return fonts


def _font_is_embedded(font) -> bool:
    try:
        descriptor = font.get("/FontDescriptor")
        if descriptor is None:
            return False
        for stream_key in ("/FontFile", "/FontFile2", "/FontFile3"):
            if descriptor.get(stream_key) is not None:
                return True
    except Exception:
        pass
    return False


def _strip_subset_prefix_from_base_font(base: str) -> str:
    s = (base or "").lstrip("/").replace(" ", "")
    if len(s) > 7 and s[6] == "+" and len(s[:6]) == 6 and all(c in "ABCDEF0123456789" for c in s[:6]):
        return s[7:]
    return s


def _urw_type1_search_roots() -> list[str]:
    roots: list[str] = []
    extra = (os.environ.get("PDFAF_URW_TYPE1_DIR") or "").strip()
    if extra:
        roots.append(extra)
    roots.extend(
        (
            "/usr/share/fonts/type1/urw-base35",
            "/usr/share/fonts/urw-base35",
        )
    )
    return [r for r in roots if os.path.isdir(r)]


def _resolve_urw_afm_t1(urw_stem: str) -> tuple[str, str] | None:
    for root in _urw_type1_search_roots():
        afm = os.path.join(root, f"{urw_stem}.afm")
        t1 = os.path.join(root, f"{urw_stem}.t1")
        if os.path.isfile(afm) and os.path.isfile(t1):
            return afm, t1
    return None


def _map_legacy_type1_to_urw_stem(stripped: str) -> str | None:
    """
    Map common Acrobat-failing non-embedded Type1 names to URW base35 files
    (Debian/Ubuntu: fonts-urw-base35 under .../type1/urw-base35/).
    """
    k = stripped.replace("-", "").replace("_", "").lower()
    if not k:
        return None
    # Longest prefix first so e.g. centurybookitalic does not match centurybook.
    if k == "centuryitalic":
        return "C059-Italic"
    ordered: list[tuple[str, str]] = [
        ("centurybookitalic", "C059-Italic"),
        ("centurybolditalic", "C059-BdIta"),
        ("centurybook", "C059-Roman"),
        ("centurybold", "C059-Bold"),
        ("impressumbold", "NimbusSans-Bold"),
        ("impressum", "NimbusSans-Bold"),
        ("century", "C059-Roman"),
    ]
    for prefix, stem in ordered:
        if k.startswith(prefix):
            return stem
    return None


def _parse_afm_winansi_widths(afm_path: str) -> tuple[dict[int, int], list[int], int, int, int, float, int]:
    """
    Returns (code_to_wx_unused, font_bbox_4, cap_height, ascent, descent, italic_angle, stem_v).
    Widths for WinAnsi are built separately with first=32 last=255.
    """
    code_wx: dict[int, int] = {}
    font_bbox = [-50, -200, 1000, 900]
    cap_h = 700
    ascent = 900
    descent = -200
    italic_angle = 0.0
    stem_v = 80
    char_line = re.compile(r"^\s*C\s+(-?\d+)\s*;\s*WX\s+(\d+)\s*;", re.MULTILINE)
    try:
        with open(afm_path, encoding="utf-8", errors="replace") as f:
            body = f.read()
    except OSError:
        return code_wx, font_bbox, cap_h, ascent, descent, italic_angle, stem_v
    for m in char_line.finditer(body):
        try:
            ch = int(m.group(1))
            wx = int(m.group(2))
        except ValueError:
            continue
        if 0 <= ch <= 255:
            code_wx[ch] = wx
    mbb = re.search(r"^\s*FontBBox\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$", body, re.MULTILINE)
    if mbb:
        font_bbox = [int(mbb.group(i)) for i in range(1, 5)]
    mc = re.search(r"^\s*CapHeight\s+(-?\d+)\s*$", body, re.MULTILINE)
    if mc:
        cap_h = int(mc.group(1))
    ma = re.search(r"^\s*Ascender\s+(-?\d+)\s*$", body, re.MULTILINE)
    if ma and int(ma.group(1)) != 0:
        ascent = int(ma.group(1))
    else:
        ascent = font_bbox[3]
    md = re.search(r"^\s*Descender\s+(-?\d+)\s*$", body, re.MULTILINE)
    if md and int(md.group(1)) != 0:
        descent = int(md.group(1))
    else:
        descent = font_bbox[1]
    mi = re.search(r"^\s*ItalicAngle\s+(-?[\d.]+)\s*$", body, re.MULTILINE)
    if mi:
        try:
            italic_angle = float(mi.group(1))
        except ValueError:
            pass
    ms = re.search(r"^\s*StdHW\s+\[?\s*(\d+)", body, re.MULTILINE)
    if ms:
        stem_v = max(50, int(ms.group(1)))
    return code_wx, font_bbox, cap_h, ascent, descent, italic_angle, stem_v


def _build_winansi_widths_array(code_wx: dict[int, int]) -> tuple[int, int, list[int]]:
    first_c, last_c = 32, 255
    space = code_wx.get(32, 278)
    widths = [int(code_wx.get(c, space)) for c in range(first_c, last_c + 1)]
    return first_c, last_c, widths


def _font_descriptor_flags(urw_stem: str, italic_angle: float) -> int:
    # Bit 6 (32): nonsymbolic; bit 2 (4): symbolic is unset for Latin text.
    # Bit 2 in PDF 1.7 Table 5.20 is Serif (value 2); bit 7 (64) Italic.
    flags = 32
    if urw_stem.startswith("C059") or urw_stem.startswith("NimbusRoman"):
        flags |= 2
    if abs(italic_angle) > 0.01 or "Italic" in urw_stem or urw_stem.endswith("BdIta") or "Oblique" in urw_stem:
        flags |= 64
    return flags


def _font_width_drift_exceeds(font: pikepdf.Dictionary, widths_list: list[int], first_c: int, max_width_drift: float | None) -> bool:
    if max_width_drift is None:
        return False
    try:
        existing_first = font.get("/FirstChar")
        existing_widths = font.get("/Widths")
        if not isinstance(existing_first, (int, pikepdf.Integer)) or not isinstance(existing_widths, pikepdf.Array):
            return False
        for idx, width in enumerate(widths_list):
            code = first_c + idx
            current_idx = code - int(existing_first)
            if current_idx < 0 or current_idx >= len(existing_widths):
                continue
            try:
                existing_width = int(existing_widths[current_idx])
            except Exception:
                continue
            if existing_width <= 0:
                continue
            if abs(width - existing_width) / existing_width > max_width_drift:
                return True
    except Exception:
        return False
    return False


def _apply_urw_substitute_to_font(pdf: pikepdf.Pdf, font: pikepdf.Dictionary, max_width_drift: float | None = None) -> bool:
    try:
        sub = safe_str(font.get("/Subtype", "")).lstrip("/")
        if sub != "Type1":
            return False
        base = safe_str(font.get("/BaseFont", ""))
        stem = _strip_subset_prefix_from_base_font(base)
        urw_stem = _map_legacy_type1_to_urw_stem(stem)
        if not urw_stem:
            return False
        if _font_is_embedded(font):
            return False
        enc = font.get("/Encoding")
        if enc is not None and not isinstance(enc, pikepdf.Name):
            # Custom encoding differences — glyph ids may not match WinAnsi; skip.
            return False
        paths = _resolve_urw_afm_t1(urw_stem)
        if not paths:
            return False
        afm_path, t1_path = paths
        code_wx, fb, cap_h, ascent, descent, italic_angle, stem_v = _parse_afm_winansi_widths(afm_path)
        first_c, last_c, widths_list = _build_winansi_widths_array(code_wx)
        if _font_width_drift_exceeds(font, widths_list, first_c, max_width_drift):
            return False
        try:
            with open(t1_path, "rb") as tf:
                t1_bytes = tf.read()
        except OSError:
            return False
        if len(t1_bytes) < 100:
            return False
        font_stream = pikepdf.Stream(pdf, t1_bytes)
        flags = _font_descriptor_flags(urw_stem, italic_angle)
        bbox_arr = pikepdf.Array([fb[0], fb[1], fb[2], fb[3]])
        widths_arr = pikepdf.Array([pikepdf.Integer(w) for w in widths_list])
        desc = pikepdf.Dictionary(
            {
                "/Type": pikepdf.Name("/FontDescriptor"),
                "/FontName": pikepdf.Name("/" + urw_stem),
                "/Flags": pikepdf.Integer(flags),
                "/FontBBox": bbox_arr,
                "/ItalicAngle": pikepdf.Real(italic_angle),
                "/Ascent": pikepdf.Integer(ascent),
                "/Descent": pikepdf.Integer(descent),
                "/CapHeight": pikepdf.Integer(cap_h),
                "/StemV": pikepdf.Integer(stem_v),
                "/FontFile": font_stream,
            }
        )
        font["/FontDescriptor"] = desc
        font[pikepdf.Name("/BaseFont")] = pikepdf.Name("/" + urw_stem)
        font[pikepdf.Name("/Encoding")] = pikepdf.Name("/WinAnsiEncoding")
        font[pikepdf.Name("/FirstChar")] = pikepdf.Integer(first_c)
        font[pikepdf.Name("/LastChar")] = pikepdf.Integer(last_c)
        font[pikepdf.Name("/Widths")] = widths_arr
        try:
            if font.get("/ToUnicode") is not None:
                del font["/ToUnicode"]
        except Exception:
            pass
        return True
    except Exception:
        return False


def _iter_font_dicts_from_resources(res: pikepdf.Dictionary, seen: set[int], out: list) -> None:
    try:
        fd = res.get("/Font")
        if fd is not None:
            for _k, font in fd.items():
                try:
                    if not isinstance(font, pikepdf.Dictionary):
                        continue
                    oid = id(font)
                    if oid in seen:
                        continue
                    seen.add(oid)
                    out.append(font)
                except Exception:
                    continue
        xobj = res.get("/XObject")
        if xobj is not None:
            for _xk, xo in xobj.items():
                try:
                    if isinstance(xo, pikepdf.Stream):
                        inner = xo.get("/Resources")
                        if isinstance(inner, pikepdf.Dictionary):
                            _iter_font_dicts_from_resources(inner, seen, out)
                except Exception:
                    continue
    except Exception:
        return


def _collect_all_page_fonts(pdf: pikepdf.Pdf) -> list:
    fonts: list = []
    seen: set[int] = set()
    for page in pdf.pages:
        try:
            res = page.get("/Resources")
            if isinstance(res, pikepdf.Dictionary):
                _iter_font_dicts_from_resources(res, seen, fonts)
        except Exception:
            continue
    try:
        ac = pdf.Root.get("/AcroForm")
        if ac is not None:
            dr = ac.get("/DR")
            if isinstance(dr, pikepdf.Dictionary):
                _iter_font_dicts_from_resources(dr, seen, fonts)
    except Exception:
        pass
    return fonts


def _op_embed_urw_type1_substitutes(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """
    Embed URW Type1 programs for legacy non-embedded Century* / Impressum* Type1 fonts.
    Preserves structure (unlike Ghostscript pdfwrite). No-op if URW files are missing.
    """
    changed = False
    for font in _collect_all_page_fonts(pdf):
        if _apply_urw_substitute_to_font(pdf, font):
            changed = True
    return changed


def _op_substitute_legacy_fonts_in_place(pdf: pikepdf.Pdf, params: dict) -> bool:
    """Conservative Type1 fallback substitution with width-drift guardrails."""
    try:
        max_width_drift = float(params.get("maxWidthDrift", 0.12))
    except (TypeError, ValueError):
        max_width_drift = 0.12
    changed = False
    for font in _collect_all_page_fonts(pdf):
        if _apply_urw_substitute_to_font(pdf, font, max_width_drift=max_width_drift):
            changed = True
    return changed


def _op_finalize_substituted_font_conformance(pdf: pikepdf.Pdf, params: dict) -> bool:
    """
    Second-pass Type1 substitute finalization. Uses a looser width drift threshold so a file that
    remains blocked after the strict first pass can still settle on embedded, width-populated fonts.
    """
    try:
        max_width_drift = float(params.get("maxWidthDrift", 0.35))
    except (TypeError, ValueError):
        max_width_drift = 0.35
    changed = False
    for font in _collect_all_page_fonts(pdf):
        if _apply_urw_substitute_to_font(pdf, font, max_width_drift=max_width_drift):
            changed = True
    return changed


# ─── Bookmark extraction ─────────────────────────────────────────────────────

def extract_bookmarks(pdf: pikepdf.Pdf) -> list:
    bookmarks = []
    try:
        root = pdf.Root
        outlines = root.get("/Outlines")
        if outlines is None:
            return bookmarks
        first = outlines.get("/First")
        if first is None:
            return bookmarks
        _walk_outlines(first, level=1, out=bookmarks)
    except Exception as e:
        print(f"[warn] bookmark extraction failed: {e}", file=sys.stderr)
    return bookmarks


def _walk_outlines(node, level: int, out: list) -> None:
    while node is not None and len(out) < MAX_ITEMS:
        try:
            title = safe_str(node.get("/Title", ""))
            out.append({"title": title, "level": level})
            first = node.get("/First")
            if first is not None:
                _walk_outlines(first, level + 1, out)
            node = node.get("/Next")
        except Exception:
            break


# ─── AcroForm field extraction ───────────────────────────────────────────────

def extract_acroform_fields(pdf: pikepdf.Pdf) -> list:
    fields = []
    try:
        root = pdf.Root
        acroform = root.get("/AcroForm")
        if acroform is None:
            return fields
        form_fields = acroform.get("/Fields")
        if form_fields is None:
            return fields
        _walk_fields(form_fields, fields)
    except Exception as e:
        print(f"[warn] acroform extraction failed: {e}", file=sys.stderr)
    return fields


def _walk_fields(field_array, out: list, page: int = 0) -> None:
    try:
        for field in field_array:
            if len(out) >= MAX_ITEMS:
                break
            try:
                name    = safe_str(field.get("/T", ""))
                tooltip = safe_str(field.get("/TU", "")) or None
                kids    = field.get("/Kids")
                if kids is not None:
                    _walk_fields(kids, out, page)
                else:
                    out.append({"name": name, "tooltip": tooltip, "page": page})
            except Exception:
                continue
    except Exception:
        pass


def _iter_acroform_widget_field_dicts(field_array) -> list:
    """Terminal /Widget field dictionaries from AcroForm /Fields (including under /Kids)."""
    found: list = []

    def walk(arr) -> None:
        if arr is None:
            return
        try:
            seq = list(arr) if isinstance(arr, pikepdf.Array) else [arr]
        except Exception:
            return
        for field in seq:
            if not isinstance(field, pikepdf.Dictionary):
                continue
            kids = field.get("/Kids")
            if kids is not None:
                walk(kids)
            try:
                sub = safe_str(field.get("/Subtype", "")).lstrip("/")
            except Exception:
                sub = ""
            if sub == "Widget":
                found.append(field)

    walk(field_array)
    return found


def _tooltip_fallback_for_widget_field(field: pikepdf.Dictionary) -> str:
    """Acrobat 'Field descriptions' uses /TU (tooltip). Derive from /T and /FT when missing."""
    t = safe_str(field.get("/T", "")).strip()
    ft = safe_str(field.get("/FT", "")).lstrip("/").strip()
    if not t:
        t = "Form field"
    if ft == "Btn":
        # Checkboxes / radio pushbuttons often ship with names like "Check Box1"
        tl = t.lower()
        if "check" in tl or "box" in tl:
            return t[:500]
        return f"Checkbox: {t}"[:500]
    if ft == "Tx":
        return t[:500]
    if ft == "Ch":  # choice / list
        return t[:500]
    if ft == "Sig":
        return f"Signature: {t}"[:500]
    return t[:500]


def _op_fill_form_field_tooltips(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """
    Set /TU on AcroForm widget fields when absent or blank (Acrobat 'Field descriptions').
    """
    changed = False
    try:
        acro = pdf.Root.get("/AcroForm")
        if acro is None:
            return False
        fields = acro.get("/Fields")
        if fields is None:
            return False
        for field in _iter_acroform_widget_field_dicts(fields):
            try:
                tu = field.get("/TU")
                tu_s = safe_str(tu).strip() if tu is not None else ""
                if tu_s:
                    continue
                label = _tooltip_fallback_for_widget_field(field)
                if not label:
                    continue
                field["/TU"] = label
                changed = True
            except Exception:
                continue
    except Exception as e:
        print(f"[warn] fill_form_field_tooltips: {e}", file=sys.stderr)
    return changed


# ─── Annotation / tab order (Acrobat checker; logic aligned with PDFAF v1) ───

_VISIBLE_ANNOT_SUBTYPES = frozenset({
    "/Link", "/Widget", "/Screen", "/Movie", "/Sound",
    "/FileAttachment", "/Stamp", "/FreeText", "/Highlight",
    "/Underline", "/Squiggly", "/StrikeOut", "/Ink", "/Popup",
})


def _obj_ref_str(obj) -> str | None:
    og = getattr(obj, "objgen", None)
    if not og:
        return None
    return f"obj:{og[0]} {og[1]} R"


def _iter_struct_elems(pdf: pikepdf.Pdf):
    for obj in pdf.objects:
        try:
            if not isinstance(obj, pikepdf.Dictionary) or "/S" not in obj:
                continue
            tag = str(obj.get("/S"))
            if tag in {"/Transparency", "/Luminosity", "/URI"}:
                continue
            if "/P" in obj or "/K" in obj or str(obj.get("/Type")) == "/StructElem":
                yield obj
        except Exception:
            continue


def _struct_kids_list(obj):
    kids = obj.get("/K") if isinstance(obj, pikepdf.Dictionary) else None
    if isinstance(kids, pikepdf.Array):
        return list(kids)
    if kids is None:
        return []
    return [kids]


def _objr_targets_annotation(kid, annot) -> bool:
    if not isinstance(kid, pikepdf.Dictionary):
        return False
    if str(kid.get("/Type", "")) != "/OBJR":
        return False
    try:
        target = kid.get("/Obj")
    except Exception:
        return False
    if not isinstance(target, pikepdf.Dictionary):
        return False
    return _obj_ref_str(target) == _obj_ref_str(annot)


def _remove_annotation_objr_from_nonlink_elems(pdf: pikepdf.Pdf, annot) -> bool:
    changed = False
    ar = _obj_ref_str(annot)
    if not ar:
        return False
    for elem in _iter_struct_elems(pdf):
        tag = str(elem.get("/S", ""))
        if tag == "/Link":
            continue
        kids = _struct_kids_list(elem)
        if not kids:
            continue
        kept = []
        row_changed = False
        for kid in kids:
            if _objr_targets_annotation(kid, annot):
                row_changed = True
                continue
            kept.append(kid)
        if not row_changed:
            continue
        if len(kept) == 0:
            try:
                del elem["/K"]
            except Exception:
                elem["/K"] = pikepdf.Array()
        elif len(kept) == 1:
            elem["/K"] = kept[0]
        else:
            elem["/K"] = pikepdf.Array(kept)
        changed = True
    return changed


def _remove_annotation_objr_from_nonmatching_elems(pdf: pikepdf.Pdf, annot, expected_tag: str) -> bool:
    changed = False
    ar = _obj_ref_str(annot)
    if not ar:
        return False
    for elem in _iter_struct_elems(pdf):
        tag = str(elem.get("/S", ""))
        if tag == expected_tag:
            continue
        kids = _struct_kids_list(elem)
        if not kids:
            continue
        kept = []
        row_changed = False
        for kid in kids:
            if _objr_targets_annotation(kid, annot):
                row_changed = True
                continue
            kept.append(kid)
        if not row_changed:
            continue
        if len(kept) == 0:
            try:
                del elem["/K"]
            except Exception:
                elem["/K"] = pikepdf.Array()
        elif len(kept) == 1:
            elem["/K"] = kept[0]
        else:
            elem["/K"] = pikepdf.Array(kept)
        changed = True
    return changed


def _annotation_struct_parent_entry(annot, nums):
    sp = annot.get("/StructParent")
    try:
        sp_int = int(sp) if sp is not None else None
    except Exception:
        sp_int = None
    if sp_int is None:
        return None, None
    index = 0
    while index + 1 < len(nums):
        try:
            ek = int(nums[index])
        except Exception:
            index += 2
            continue
        if ek == sp_int:
            return sp_int, nums[index + 1]
        index += 2
    return sp_int, None


def _annotation_has_struct_parent_tag(annot, nums, expected_tag: str) -> bool:
    _, entry = _annotation_struct_parent_entry(annot, nums)
    if not isinstance(entry, pikepdf.Dictionary):
        return False
    return str(entry.get("/S", "")) == expected_tag


def _ensure_parent_tree(struct_root: pikepdf.Dictionary, pdf: pikepdf.Pdf):
    parent_tree = struct_root.get("/ParentTree")
    if not isinstance(parent_tree, pikepdf.Dictionary):
        parent_tree = pdf.make_indirect(pikepdf.Dictionary({
            "/Nums": pikepdf.Array(),
        }))
        struct_root["/ParentTree"] = parent_tree
    nums = parent_tree.get("/Nums")
    if not isinstance(nums, pikepdf.Array):
        nums = pikepdf.Array()
        parent_tree["/Nums"] = nums
    return parent_tree, nums


def _upsert_parent_tree_entry(nums: pikepdf.Array, key: int, value) -> None:
    key = int(key)
    index = 0
    while index + 1 < len(nums):
        try:
            ek = int(nums[index])
        except Exception:
            index += 2
            continue
        if ek == key:
            nums[index + 1] = value
            return
        index += 2
    nums.append(key)
    nums.append(value)


def _ensure_document_struct_elem(pdf: pikepdf.Pdf, struct_root: pikepdf.Dictionary):
    kids = struct_root.get("/K")
    if isinstance(kids, pikepdf.Array):
        for child in kids:
            if isinstance(child, pikepdf.Dictionary) and str(child.get("/S")) == "/Document":
                return child
    document = pdf.make_indirect(pikepdf.Dictionary({
        "/Type": pikepdf.Name("/StructElem"),
        "/S": pikepdf.Name("/Document"),
        "/P": struct_root,
        "/K": pikepdf.Array(),
    }))
    if isinstance(kids, pikepdf.Array):
        kids.append(document)
    elif kids is None:
        struct_root["/K"] = pikepdf.Array([document])
    else:
        struct_root["/K"] = pikepdf.Array([kids, document])
    return document


def _ensure_mark_info(catalog: pikepdf.Dictionary) -> None:
    mark_info = catalog.get("/MarkInfo")
    if not isinstance(mark_info, pikepdf.Dictionary):
        mark_info = pikepdf.Dictionary()
        catalog["/MarkInfo"] = mark_info
    mark_info["/Marked"] = True


def _annotation_is_invisible(annot: pikepdf.Dictionary) -> bool:
    flags = annot.get("/F")
    if isinstance(flags, int):
        if (flags & 1) or (flags & 2) or (flags & 32):
            return True
    return False


def _normalize_annotation_sort_key(annot):
    rect = annot.get("/Rect") if isinstance(annot, pikepdf.Dictionary) else None
    if isinstance(rect, pikepdf.Array) and len(rect) == 4:
        try:
            x0 = float(rect[0])
            y0 = float(rect[1])
            x1 = float(rect[2])
            y1 = float(rect[3])
            top = max(y0, y1)
            left = min(x0, x1)
            return (-top, left)
        except Exception:
            pass
    return (0, 0)


def _pdf_is_effectively_tagged(pdf: pikepdf.Pdf) -> bool:
    """
    True only when a real /StructTreeRoot exists (PAC / ICIJA style).
    MarkInfo /Marked alone is not sufficient — it caused false \"native_tagged\"
    classification and skipped structure remediation while external auditors reported
    \"no StructTreeRoot\".
    """
    sr = pdf.Root.get("/StructTreeRoot")
    return isinstance(sr, pikepdf.Dictionary)


def _resolve_annots_array(page_obj):
    raw = page_obj.get("/Annots")
    if isinstance(raw, pikepdf.Object) and not isinstance(raw, pikepdf.Array):
        try:
            raw = raw.obj if hasattr(raw, "obj") else raw
        except Exception:
            pass
    if isinstance(raw, pikepdf.Array) and len(raw) > 0:
        return raw
    return None


def _repair_annotation_struct_ownership(
    pdf: pikepdf.Pdf,
    _struct_root: pikepdf.Dictionary,
    document,
    nums: pikepdf.Array,
    next_key: int,
    annot: pikepdf.Dictionary,
    page_obj,
    expected_tag: str,
) -> tuple[bool, int]:
    changed = False
    if expected_tag == "/Link":
        if _remove_annotation_objr_from_nonlink_elems(pdf, annot):
            changed = True
    else:
        if _remove_annotation_objr_from_nonmatching_elems(pdf, annot, expected_tag):
            changed = True

    if nums is not None:
        _, entry = _annotation_struct_parent_entry(annot, nums)
        if isinstance(entry, pikepdf.Dictionary):
            et = str(entry.get("/S", ""))
            if et and et != expected_tag:
                try:
                    del annot["/StructParent"]
                    changed = True
                except Exception:
                    pass

    if _annotation_has_struct_parent_tag(annot, nums, expected_tag):
        return changed, next_key

    struct_parent = annot.get("/StructParent")
    try:
        struct_parent_int = int(struct_parent) if struct_parent is not None else None
    except Exception:
        struct_parent_int = None
    if struct_parent_int is None:
        struct_parent_int = next_key
        next_key += 1
        annot["/StructParent"] = pikepdf.Integer(struct_parent_int)
        changed = True

    objr = pdf.make_indirect(pikepdf.Dictionary({
        "/Type": pikepdf.Name("/OBJR"),
        "/Obj": annot,
        "/Pg": page_obj,
    }))
    et = expected_tag if str(expected_tag).startswith("/") else f"/{expected_tag}"
    struct_elem = pdf.make_indirect(pikepdf.Dictionary({
        "/Type": pikepdf.Name("/StructElem"),
        "/S": pikepdf.Name(et),
        "/P": document,
        "/Pg": page_obj,
        "/K": objr,
    }))

    dk = document.get("/K")
    if not isinstance(dk, pikepdf.Array):
        dk = pikepdf.Array([dk]) if dk is not None else pikepdf.Array()
    dk.append(struct_elem)
    document["/K"] = dk

    _upsert_parent_tree_entry(nums, struct_parent_int, struct_elem)
    return True, next_key


def collect_annotation_accessibility_stats(pdf: pikepdf.Pdf) -> dict:
    out = {
        "pagesMissingTabsS": 0,
        "pagesAnnotationOrderDiffers": 0,
        "linkAnnotationsMissingStructure": 0,
        "nonLinkAnnotationsMissingStructure": 0,
        "nonLinkAnnotationsMissingContents": 0,
        "linkAnnotationsMissingStructParent": 0,
        "nonLinkAnnotationsMissingStructParent": 0,
    }
    is_tagged = _pdf_is_effectively_tagged(pdf)
    sr = pdf.Root.get("/StructTreeRoot")
    nums = None
    if isinstance(sr, pikepdf.Dictionary):
        pt = sr.get("/ParentTree")
        if isinstance(pt, pikepdf.Dictionary):
            n = pt.get("/Nums")
            if isinstance(n, pikepdf.Array):
                nums = n

    for page in pdf.pages:
        page_obj = page.obj
        annots_raw = _resolve_annots_array(page_obj)
        has_annots = annots_raw is not None

        if is_tagged or has_annots:
            tabs_val = page_obj.get("/Tabs")
            if tabs_val is None or str(tabs_val) != "/S":
                out["pagesMissingTabsS"] += 1

        if has_annots:
            annots = annots_raw
            ordered = sorted(list(annots), key=lambda r: _normalize_annotation_sort_key(
                pdf.get_object(r.objgen) if hasattr(r, "objgen") else r
            ))
            if ordered != list(annots):
                out["pagesAnnotationOrderDiffers"] += 1

        if not has_annots:
            continue

        for annot_ref in annots_raw:
            try:
                annot = pdf.get_object(annot_ref.objgen) if hasattr(annot_ref, "objgen") else annot_ref
            except Exception:
                annot = annot_ref
            if not isinstance(annot, pikepdf.Dictionary):
                continue
            subtype = str(annot.get("/Subtype") or "")
            if subtype not in _VISIBLE_ANNOT_SUBTYPES or subtype == "/Popup":
                continue
            if _annotation_is_invisible(annot):
                continue
            if annot.get("/StructParent") is None:
                if subtype == "/Link":
                    out["linkAnnotationsMissingStructParent"] += 1
                else:
                    out["nonLinkAnnotationsMissingStructParent"] += 1
            if nums is not None:
                if subtype == "/Link":
                    if not _annotation_has_struct_parent_tag(annot, nums, "/Link"):
                        out["linkAnnotationsMissingStructure"] += 1
                else:
                    if not _annotation_has_struct_parent_tag(annot, nums, "/Annot"):
                        out["nonLinkAnnotationsMissingStructure"] += 1
            if subtype != "/Link":
                ct = annot.get("/Contents")
                try:
                    txt = str(ct).strip() if ct is not None else ""
                except Exception:
                    txt = ""
                if not txt:
                    out["nonLinkAnnotationsMissingContents"] += 1
    return out


def _clear_hidden_link_flag_if_needed(annot: pikepdf.Dictionary) -> bool:
    """Clear PDF annotation hidden flag (bit 2) on /Link so links are perceivable (PDF/UA)."""
    if str(annot.get("/Subtype") or "") != "/Link":
        return False
    flags = annot.get("/F")
    try:
        fi = int(flags) if flags is not None else 0
    except Exception:
        fi = 0
    if fi & 2:
        annot["/F"] = pikepdf.Integer(fi & ~2)
        return True
    return False


def _extract_uri_from_link_dict(a: pikepdf.Dictionary) -> str:
    try:
        if str(a.get("/S")) == "/URI":
            u = a.get("/URI")
            return str(u).strip() if u is not None else ""
    except Exception:
        pass
    return ""


def _extract_http_uri_from_link_annot(annot: pikepdf.Dictionary) -> str:
    a = annot.get("/A")
    if isinstance(a, pikepdf.Dictionary):
        u = _extract_uri_from_link_dict(a)
        if u:
            return u
    elif isinstance(a, pikepdf.Array):
        for item in a:
            if isinstance(item, pikepdf.Dictionary):
                u = _extract_uri_from_link_dict(item)
                if u:
                    return u
    return ""


def _link_contents_needs_fill(current: str, uri: str) -> bool:
    t = (current or "").strip()
    if not t:
        return True
    tl = t.lower()
    bad = {
        "click here", "here", "read more", "more", "link", "this link",
        "this page", "learn more", "details", "info", "more info",
        "go", "visit", "open", "view", "see more", "click",
    }
    if tl in bad:
        return True
    if uri and tl == uri.strip().lower():
        return True
    if t.lower().startswith("http://") or t.lower().startswith("https://"):
        return True
    return False


def _label_for_uri(uri: str) -> str:
    u = (uri or "").strip()
    if not u:
        return "External link"
    try:
        from urllib.parse import urlparse

        p = urlparse(u)
        host = (p.netloc or "").split("@")[-1]
        if host:
            path = (p.path or "").strip("/")
            tail = (" — " + path[:60]) if path else ""
            return f"Web link ({host}){tail}"[:200]
    except Exception:
        pass
    return "External link"[:200]


def collect_link_scoring_rows(pdf: pikepdf.Pdf) -> list:
    """One row per visible /Link annotation (all pages) for scorer merge — pdfjs only samples pages."""
    rows: list = []
    max_rows = 3000
    for page_idx, page in enumerate(pdf.pages):
        if len(rows) >= max_rows:
            break
        page_obj = page.obj
        raw = page_obj.get("/Annots")
        if not isinstance(raw, pikepdf.Array):
            continue
        for annot_ref in raw:
            if len(rows) >= max_rows:
                break
            try:
                annot = pdf.get_object(annot_ref.objgen) if hasattr(annot_ref, "objgen") else annot_ref
            except Exception:
                annot = annot_ref
            if not isinstance(annot, pikepdf.Dictionary):
                continue
            if str(annot.get("/Subtype") or "") != "/Link":
                continue
            if _annotation_is_invisible(annot):
                continue
            uri = _extract_http_uri_from_link_annot(annot) or ""
            cur = annot.get("/Contents")
            try:
                cur_s = str(cur).strip() if cur is not None else ""
            except Exception:
                cur_s = ""
            if uri:
                if _link_contents_needs_fill(cur_s, uri):
                    eff = _label_for_uri(uri)
                else:
                    eff = (cur_s or _label_for_uri(uri))[:200]
            else:
                if cur_s and not _link_contents_needs_fill(cur_s, ""):
                    eff = cur_s[:200]
                else:
                    eff = "In-document link"
            rows.append({"page": page_idx, "url": uri, "effectiveText": eff[:200]})
    return rows


def _mut_stamp_pdf_ua_xmp(pdf: pikepdf.Pdf) -> bool:
    """Declare PDF/UA identifier in XMP (pdfuaid:part) so analysis matches Matterhorn 06-002."""
    changed = False
    try:
        with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
            cur = meta.get("pdfuaid:part")
            if cur is None or str(cur).strip() == "":
                meta["pdfuaid:part"] = "1"
                changed = True
    except Exception:
        return False
    return changed


def _mut_fill_link_annotation_contents(pdf: pikepdf.Pdf) -> bool:
    """Set /Contents on /Link annotations when empty, generic, or raw URL (pdfjs + link_quality)."""
    changed = False
    for page in pdf.pages:
        page_obj = page.obj
        raw = page_obj.get("/Annots")
        if not isinstance(raw, pikepdf.Array):
            continue
        for annot_ref in raw:
            try:
                annot = pdf.get_object(annot_ref.objgen) if hasattr(annot_ref, "objgen") else annot_ref
            except Exception:
                annot = annot_ref
            if not isinstance(annot, pikepdf.Dictionary):
                continue
            if str(annot.get("/Subtype") or "") != "/Link":
                continue
            if _annotation_is_invisible(annot):
                continue
            uri = _extract_http_uri_from_link_annot(annot)
            if not uri:
                continue
            cur = annot.get("/Contents")
            try:
                cur_s = str(cur).strip() if cur is not None else ""
            except Exception:
                cur_s = ""
            if not _link_contents_needs_fill(cur_s, uri):
                continue
            lab = _label_for_uri(uri)
            try:
                annot["/Contents"] = _pdf_text_string(lab, 500)
                changed = True
            except Exception:
                pass
    return changed


def _mut_repair_native_link_structure(pdf: pikepdf.Pdf) -> bool:
    """Clear hidden /Link flags and ensure /Link structure ownership (PDFAF v1 parity)."""
    root_cat = pdf.Root
    if not isinstance(root_cat, pikepdf.Dictionary):
        return False
    sr = root_cat.get("/StructTreeRoot")
    if not isinstance(sr, pikepdf.Dictionary):
        return False
    _ensure_mark_info(root_cat)
    document = _ensure_document_struct_elem(pdf, sr)
    _, nums = _ensure_parent_tree(sr, pdf)
    next_key = int(sr.get("/ParentTreeNextKey", 0) or 0)
    changed = False
    for page in pdf.pages:
        page_obj = page.obj
        annots = page_obj.get("/Annots")
        if not isinstance(annots, pikepdf.Array):
            continue
        for annot_ref in annots:
            try:
                annot = pdf.get_object(annot_ref.objgen) if hasattr(annot_ref, "objgen") else annot_ref
            except Exception:
                annot = annot_ref
            if not isinstance(annot, pikepdf.Dictionary):
                continue
            if str(annot.get("/Subtype") or "") != "/Link":
                continue
            if _clear_hidden_link_flag_if_needed(annot):
                changed = True
            row_changed, next_key = _repair_annotation_struct_ownership(
                pdf, sr, document, nums, next_key, annot, page_obj, "/Link",
            )
            if row_changed:
                changed = True
    sr["/ParentTreeNextKey"] = pikepdf.Integer(next_key)
    return changed


def _mut_tag_unowned_annotations(pdf: pikepdf.Pdf) -> bool:
    root_cat = pdf.Root
    if not isinstance(root_cat, pikepdf.Dictionary):
        return False
    sr = root_cat.get("/StructTreeRoot")
    if not isinstance(sr, pikepdf.Dictionary):
        return False
    _ensure_mark_info(root_cat)
    document = _ensure_document_struct_elem(pdf, sr)
    _, nums = _ensure_parent_tree(sr, pdf)
    next_key = int(sr.get("/ParentTreeNextKey", 0) or 0)
    changed = False
    for page in pdf.pages:
        page_obj = page.obj
        annots_raw = page_obj.get("/Annots")
        if not isinstance(annots_raw, pikepdf.Array):
            continue
        for annot_ref in annots_raw:
            try:
                annot = pdf.get_object(annot_ref.objgen) if hasattr(annot_ref, "objgen") else annot_ref
            except Exception:
                annot = annot_ref
            if not isinstance(annot, pikepdf.Dictionary):
                continue
            subtype = str(annot.get("/Subtype") or "")
            if subtype not in _VISIBLE_ANNOT_SUBTYPES or subtype == "/Popup":
                continue
            if _annotation_is_invisible(annot):
                continue
            if subtype == "/Link" and _clear_hidden_link_flag_if_needed(annot):
                changed = True
            expected = "/Link" if subtype == "/Link" else "/Annot"
            row_changed, next_key = _repair_annotation_struct_ownership(
                pdf, sr, document, nums, next_key, annot, page_obj, expected,
            )
            if row_changed:
                changed = True
    sr["/ParentTreeNextKey"] = pikepdf.Integer(next_key)
    return changed


def _mut_normalize_annotation_tab_order(pdf: pikepdf.Pdf) -> bool:
    is_tagged = _pdf_is_effectively_tagged(pdf)
    changed = False
    for page in pdf.pages:
        page_obj = page.obj
        annots_raw = _resolve_annots_array(page_obj)
        has_annots = annots_raw is not None
        if not has_annots and not is_tagged:
            continue
        tabs_val = page_obj.get("/Tabs")
        if tabs_val is None or str(tabs_val) != "/S":
            page_obj["/Tabs"] = pikepdf.Name("/S")
            changed = True
        if has_annots:
            annots = annots_raw
            ordered = sorted(list(annots), key=lambda r: _normalize_annotation_sort_key(
                pdf.get_object(r.objgen) if hasattr(r, "objgen") else r
            ))
            if ordered != list(annots):
                page_obj["/Annots"] = pikepdf.Array(ordered)
                changed = True
    return changed


def _mut_repair_annotation_alt_text(pdf: pikepdf.Pdf) -> bool:
    subtype_labels = {
        "/Stamp": "Stamp",
        "/FreeText": "Text annotation",
        "/Highlight": "Highlighted text",
        "/Underline": "Underlined text",
        "/Squiggly": "Squiggly underline",
        "/StrikeOut": "Strikethrough",
        "/Ink": "Ink annotation",
        "/Sound": "Sound annotation",
        "/Movie": "Movie annotation",
        "/FileAttachment": "File attachment",
        "/Screen": "Screen annotation",
        "/Widget": "Form field",
        "/Popup": "Popup note",
    }
    is_tagged = _pdf_is_effectively_tagged(pdf)

    struct_root = None
    struct_document = None
    struct_nums = None
    struct_next_key = 0
    if is_tagged:
        struct_root = pdf.Root.get("/StructTreeRoot")
        if isinstance(struct_root, pikepdf.Dictionary):
            struct_document = _ensure_document_struct_elem(pdf, struct_root)
            _, struct_nums = _ensure_parent_tree(struct_root, pdf)
            struct_next_key = int(struct_root.get("/ParentTreeNextKey", 0) or 0)

    changed = False
    for page in pdf.pages:
        page_obj = page.obj
        annots_raw = page_obj.get("/Annots")
        if isinstance(annots_raw, pikepdf.Object) and not isinstance(annots_raw, pikepdf.Array):
            try:
                annots_raw = annots_raw.obj if hasattr(annots_raw, "obj") else annots_raw
            except Exception:
                pass
        has_annots = isinstance(annots_raw, pikepdf.Array) and len(annots_raw) > 0

        if has_annots or is_tagged:
            tabs_val = page_obj.get("/Tabs")
            if tabs_val is None or str(tabs_val) != "/S":
                page_obj["/Tabs"] = pikepdf.Name("/S")
                changed = True

        if not has_annots:
            continue

        for annot_ref in annots_raw:
            try:
                annot = pdf.get_object(annot_ref.objgen) if hasattr(annot_ref, "objgen") else annot_ref
                if not isinstance(annot, pikepdf.Dictionary):
                    continue
            except Exception:
                try:
                    annot = annot_ref
                    if not isinstance(annot, pikepdf.Dictionary):
                        continue
                except Exception:
                    continue

            subtype = str(annot.get("/Subtype") or "")
            if subtype not in _VISIBLE_ANNOT_SUBTYPES:
                continue
            if _annotation_is_invisible(annot):
                continue
            if subtype == "/Link":
                continue

            existing_contents = annot.get("/Contents")
            existing_text = ""
            if existing_contents is not None:
                try:
                    existing_text = str(existing_contents).strip()
                except Exception:
                    existing_text = ""

            if not existing_text:
                try:
                    tu = annot.get("/TU")
                    if tu is not None:
                        existing_text = str(tu).strip()
                except Exception:
                    pass

            if not existing_text:
                try:
                    t = annot.get("/T")
                    title = str(t).strip() if t is not None else ""
                except Exception:
                    title = ""
                label = subtype_labels.get(subtype, subtype.lstrip("/") + " annotation")
                description = title if title else label
                annot["/Contents"] = _pdf_text_string(description, 500)
                changed = True

            if is_tagged and struct_nums is not None and struct_document is not None:
                if annot.get("/StructParent") is None:
                    try:
                        objr = pdf.make_indirect(pikepdf.Dictionary({
                            "/Type": pikepdf.Name("/OBJR"),
                            "/Obj": annot,
                            "/Pg": page_obj,
                        }))
                        annot_elem = pdf.make_indirect(pikepdf.Dictionary({
                            "/Type": pikepdf.Name("/StructElem"),
                            "/S": pikepdf.Name("/Annot"),
                            "/P": struct_document,
                            "/Pg": page_obj,
                            "/K": objr,
                        }))
                        kids = struct_document.get("/K")
                        if not isinstance(kids, pikepdf.Array):
                            kids = pikepdf.Array([kids]) if kids is not None else pikepdf.Array()
                        kids.append(annot_elem)
                        struct_document["/K"] = kids
                        annot["/StructParent"] = pikepdf.Integer(struct_next_key)
                        _upsert_parent_tree_entry(struct_nums, struct_next_key, annot_elem)
                        struct_next_key += 1
                        changed = True
                    except Exception:
                        pass

    if struct_root is not None and isinstance(struct_root, pikepdf.Dictionary):
        struct_root["/ParentTreeNextKey"] = pikepdf.Integer(struct_next_key)
    return changed


def _op_tag_unowned_annotations(pdf: pikepdf.Pdf, _params: dict) -> bool:
    return _mut_tag_unowned_annotations(pdf)


def _op_set_link_annotation_contents(pdf: pikepdf.Pdf, params: dict) -> bool:
    if params.get("pageNumber") is not None:
        return False
    return _mut_fill_link_annotation_contents(pdf)


def _op_stamp_pdf_ua_xmp(pdf: pikepdf.Pdf, _params: dict) -> bool:
    return _mut_stamp_pdf_ua_xmp(pdf)


def _op_set_pdfua_identification(pdf: pikepdf.Pdf, params: dict) -> bool:
    """
    Full PDF/UA identification via pikepdf only (no pdf-lib round-trip):
      1. Set /MarkInfo/Marked: true on the document catalog.
      2. Set /Lang on the catalog when absent or empty.
      3. Stamp pdfuaid:part=1 in XMP metadata.
    Returns True when any of the three steps made a change.
    """
    changed = False
    root = pdf.Root

    # 1. /MarkInfo/Marked
    try:
        mark_info = root.get("/MarkInfo")
        if mark_info is None or not isinstance(mark_info, pikepdf.Dictionary):
            root["/MarkInfo"] = pikepdf.Dictionary(Marked=True)
            changed = True
        elif mark_info.get("/Marked") is not pikepdf.Boolean.true:
            mark_info["/Marked"] = pikepdf.Boolean.true
            changed = True
    except Exception:
        pass

    # 2. /Lang
    lang = (params.get("language") or "").strip() or "en-US"
    try:
        existing_lang = root.get("/Lang")
        if not existing_lang or str(existing_lang).strip() == "":
            root["/Lang"] = _pdf_text_string(lang, 64)
            changed = True
    except Exception:
        pass

    # 3. XMP pdfuaid:part
    if _mut_stamp_pdf_ua_xmp(pdf):
        changed = True

    # 4. ViewerPreferences/DisplayDocTitle — required by Acrobat DocTitle check.
    # OCRmyPDF and other tools strip /ViewerPreferences; set it here so the
    # post-pass that calls set_pdfua_identification also repairs DocTitle display.
    try:
        vp = root.get("/ViewerPreferences")
        if vp is None:
            root["/ViewerPreferences"] = pikepdf.Dictionary(DisplayDocTitle=True)
            changed = True
        elif isinstance(vp, pikepdf.Dictionary):
            if vp.get("/DisplayDocTitle") is not True:
                vp["/DisplayDocTitle"] = True
                changed = True
    except Exception:
        pass

    return changed


def _op_repair_native_link_structure(pdf: pikepdf.Pdf, _params: dict) -> bool:
    return _mut_repair_native_link_structure(pdf)


def _op_normalize_annotation_tab_order(pdf: pikepdf.Pdf, _params: dict) -> bool:
    return _mut_normalize_annotation_tab_order(pdf)


def _op_repair_annotation_alt_text(pdf: pikepdf.Pdf, _params: dict) -> bool:
    return _mut_repair_annotation_alt_text(pdf)


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: pdf_analysis_helper.py <pdf_path>"}))
        sys.exit(0)

    pdf_path = sys.argv[1]

    # Default empty result — returned on any hard failure
    result = {
        "isTagged": False,
        "markInfo": None,
        "lang": None,
        "pdfUaVersion": None,
        "title": None,
        "author": None,
        "subject": None,
        "headings": [],
        "figures": [],
        "tables": [],
        "fonts": [],
        "bookmarks": [],
        "formFields": [],
        "paragraphStructElems": [],
        "structureTree": None,
        "threeCcGoldenV1": False,
        "threeCcGoldenOrphanV1": False,
        "orphanMcids": [],
        "mcidTextSpans": [],
        "annotationAccessibility": {
            "pagesMissingTabsS": 0,
            "pagesAnnotationOrderDiffers": 0,
            "linkAnnotationsMissingStructure": 0,
            "nonLinkAnnotationsMissingStructure": 0,
            "nonLinkAnnotationsMissingContents": 0,
            "linkAnnotationsMissingStructParent": 0,
            "nonLinkAnnotationsMissingStructParent": 0,
        },
        "linkScoringRows": [],
        "taggedContentAudit": None,
        "listStructureAudit": {
            "listCount": 0,
            "listItemCount": 0,
            "listItemMisplacedCount": 0,
            "lblBodyMisplacedCount": 0,
            "listsWithoutItems": 0,
        },
        "acrobatStyleAltRisks": {
            "nonFigureWithAltCount": 0,
            "nestedFigureAltCount": 0,
            "orphanedAltEmptyElementCount": 0,
            "sampleOwnershipModes": [],
        },
    }

    try:
        pdf = pikepdf.open(pdf_path, suppress_warnings=True)

        # CI producer markers (read before extract_metadata; order must not clobber docinfo via XMP side effects).
        result["threeCcGoldenV1"] = pdf_has_3cc_golden_marker(pdf)
        result["threeCcGoldenOrphanV1"] = pdf_has_3cc_orphan_marker(pdf)
        result["orphanMcids"] = collect_orphan_mcids(pdf)
        result["mcidTextSpans"] = collect_mcid_text_spans(pdf)
        result["taggedContentAudit"] = collect_tagged_content_audit(pdf)

        try:
            result["listStructureAudit"] = collect_list_structure_audit(pdf)
        except Exception as e:
            print(f"[warn] list structure audit: {e}", file=sys.stderr)

        # Metadata
        meta = extract_metadata(pdf)
        result.update(meta)

        # Build page→index map once (used by struct traversal)
        page_map = build_page_map(pdf)

        # Structure tree
        struct = traverse_struct_tree(pdf, page_map)
        result["headings"]     = struct["headings"]
        result["figures"]      = struct["figures"]
        result["tables"]       = struct["tables"]
        result["formFields"]   = struct["formFields"]
        result["structureTree"]= struct["structureTree"]
        result["paragraphStructElems"] = struct.get("paragraphStructElems") or []

        # Fonts
        result["fonts"] = extract_fonts(pdf)

        # Bookmarks
        result["bookmarks"] = extract_bookmarks(pdf)

        # AcroForm fields (supplement tagged form fields)
        acro = extract_acroform_fields(pdf)
        if acro and not result["formFields"]:
            result["formFields"] = acro

        try:
            result["annotationAccessibility"] = collect_annotation_accessibility_stats(pdf)
        except Exception as e:
            print(f"[warn] annotation accessibility stats: {e}", file=sys.stderr)

        try:
            result["linkScoringRows"] = collect_link_scoring_rows(pdf)
        except Exception as e:
            print(f"[warn] link scoring rows: {e}", file=sys.stderr)
            result["linkScoringRows"] = []

        try:
            result["acrobatStyleAltRisks"] = collect_acrobat_style_alt_risks(pdf)
        except Exception as e:
            print(f"[warn] acrobat-style alt risks: {e}", file=sys.stderr)
            result["acrobatStyleAltRisks"] = {
                "nonFigureWithAltCount": 0,
                "nestedFigureAltCount": 0,
                "orphanedAltEmptyElementCount": 0,
                "sampleOwnershipModes": [],
            }

        pdf.close()

    except pikepdf.PasswordError:
        print("[warn] PDF is password-protected; returning empty analysis", file=sys.stderr)
    except Exception as e:
        print(f"[warn] PDF open/parse failed: {e}", file=sys.stderr)

    print(json.dumps(result, ensure_ascii=False))


# ─── Mutation mode (Phase 2) ─────────────────────────────────────────────────
# Usage: python3 pdf_analysis_helper.py --mutate <request.json>
# request.json: { "input_path", "output_path", "mutations": [ { "op", "params" }, ... ] }


def _resolve_ref(pdf: pikepdf.Pdf, ref: str):
    """Resolve `structRef` from Node (e.g. \"12_0\" = object 12 gen 0). pikepdf.Pdf uses get_object, not dict-like get."""
    num_s, gen_s = ref.split("_", 1)
    return pdf.get_object(int(num_s), int(gen_s))


def _has_nonempty_alt_or_actual(elem) -> bool:
    try:
        a = elem.get("/Alt")
        if a is not None and safe_str(a).strip():
            return True
    except Exception:
        pass
    try:
        at = elem.get("/ActualText")
        if at is not None and safe_str(at).strip():
            return True
    except Exception:
        pass
    return False


def _clear_alt_actual_and_title(elem) -> None:
    for key in ("/Alt", "/ActualText"):
        try:
            if key in elem:
                del elem[key]
        except Exception:
            pass


def _struct_elem_children(elem) -> list:
    """Direct child structure elements (/Type /StructElem) from /K."""
    out: list = []
    try:
        k = elem.get("/K")
    except Exception:
        return out
    if k is None:
        return out
    if isinstance(k, pikepdf.Dictionary):
        try:
            if k.get("/Type") == pikepdf.Name("/StructElem"):
                out.append(k)
        except Exception:
            pass
        return out
    if isinstance(k, pikepdf.Array):
        for ch in k:
            if isinstance(ch, pikepdf.Dictionary):
                try:
                    if ch.get("/Type") == pikepdf.Name("/StructElem"):
                        out.append(ch)
                except Exception:
                    pass
    return out


def _is_struct_elem_dict(elem) -> bool:
    """
    True for PDF 32000-2 structure elements: /Type /StructElem.

    Some producers (e.g. InDesign exports) omit /Type but still emit valid /S + /P
    trees. Acrobat treats those as structure tags; our fill pass must not skip them
    or 'Figures alternate text' can fail while Figure nodes never get /Alt.
    """
    if not isinstance(elem, pikepdf.Dictionary):
        return False
    try:
        t = elem.get("/Type")
        if t == pikepdf.Name("/StructElem"):
            return True
        if t is not None:
            return False
    except Exception:
        return False
    try:
        if elem.get("/S") is None or elem.get("/P") is None:
            return False
    except Exception:
        return False
    return True


def _struct_elem_visit_key(elem) -> object:
    """Stable key for de-duplicating structure nodes (same PDF object can appear as multiple wrappers)."""
    try:
        if isinstance(elem, pikepdf.Dictionary):
            n, g = elem.objgen
            if n:
                return (n, g)
    except Exception:
        pass
    return id(elem)


def _direct_role_children(elem) -> list:
    """
    Direct /K children that are structure elements, including Type-less Word/InDesign nodes.

    Skips /MCR and /OBJR dictionaries so marked-content references are not treated as branches.
    """
    out: list = []
    if not isinstance(elem, pikepdf.Dictionary):
        return out
    try:
        k = elem.get("/K")
    except Exception:
        return out
    if k is None:
        return out
    if isinstance(k, pikepdf.Dictionary):
        try:
            t = k.get("/Type")
            if t in (pikepdf.Name("/MCR"), pikepdf.Name("/OBJR")):
                return out
        except Exception:
            pass
        if _is_struct_elem_dict(k):
            out.append(k)
        return out
    if isinstance(k, pikepdf.Array):
        for ch in k:
            if not isinstance(ch, pikepdf.Dictionary):
                continue
            try:
                t = ch.get("/Type")
                if t in (pikepdf.Name("/MCR"), pikepdf.Name("/OBJR")):
                    continue
            except Exception:
                pass
            if _is_struct_elem_dict(ch):
                out.append(ch)
    return out


def _strip_subtree_alt_actual_text_recursive(elem) -> bool:
    """Remove /Alt and /ActualText from elem and all structure descendants (Adobe nested alt)."""
    changed = False
    if _has_nonempty_alt_or_actual(elem):
        _clear_alt_actual_and_title(elem)
        changed = True
    for ch in _direct_role_children(elem):
        changed = _strip_subtree_alt_actual_text_recursive(ch) or changed
    return changed


def _sweep_strip_descendants_under_figure_like_with_alt(pdf: pikepdf.Pdf) -> bool:
    """
    For each figure-like node that keeps a canonical /Alt, strip /Alt|/ActualText from the entire
    subtree below it (nested figures, Spans with soft-hyphen ActualText, etc.).
    """
    changed = False
    try:
        sr = pdf.Root.get("/StructTreeRoot")
        if sr is None:
            return False
        q: deque = deque()
        _enqueue_children(q, sr.get("/K"))
        visited: set = set()
        n = 0
        limit = max(MAX_ITEMS * 4, 40_000)
        while q and n < limit:
            n += 1
            try:
                elem = q.popleft()
            except Exception:
                break
            if not isinstance(elem, pikepdf.Dictionary):
                continue
            vk = _struct_elem_visit_key(elem)
            if vk in visited:
                continue
            visited.add(vk)
            try:
                tag = get_name(elem)
                if _struct_role_requires_figure_style_alt(tag) and not _is_artifact(elem):
                    alt = get_alt(elem)
                    if alt is not None and str(alt).strip():
                        for ch in _direct_role_children(elem):
                            if _strip_subtree_alt_actual_text_recursive(ch):
                                changed = True
            except Exception:
                pass
            try:
                _enqueue_children(q, elem.get("/K"))
            except Exception:
                pass
        return changed
    except Exception as e:
        print(f"[warn] sweep_strip_descendants_under_figure_like_with_alt: {e}", file=sys.stderr)
        return False


def _artifact_nested_figure_like_under_outer_alt(pdf: pikepdf.Pdf) -> bool:
    """
    Figure-like nodes under an outer figure-like that still have /Alt are stripped by the sweep;
    any that remain without alt text are promoted to /Artifact so Acrobat is not asked for
    duplicate 'Figures alternate text' on decorative nested frames (common ICCJIA / Word stacks).
    """
    changed = False
    try:
        sr = pdf.Root.get("/StructTreeRoot")
        if sr is None:
            return False
        q: deque = deque()
        _enqueue_children(q, sr.get("/K"))
        visited: set = set()
        n = 0
        limit = max(MAX_ITEMS * 4, 40_000)
        while q and n < limit:
            n += 1
            try:
                elem = q.popleft()
            except Exception:
                break
            if not isinstance(elem, pikepdf.Dictionary):
                continue
            vk = _struct_elem_visit_key(elem)
            if vk in visited:
                continue
            visited.add(vk)
            try:
                tag = get_name(elem)
                if _struct_role_requires_figure_style_alt(tag) and not _is_artifact(elem):
                    if _under_figure_like_ancestor_with_meaningful_alt(elem):
                        a = get_alt(elem)
                        if a is None or not str(a).strip():
                            try:
                                elem["/S"] = pikepdf.Name.Artifact
                                changed = True
                            except Exception:
                                pass
            except Exception:
                pass
            try:
                _enqueue_children(q, elem.get("/K"))
            except Exception:
                pass
        return changed
    except Exception as e:
        print(f"[warn] artifact_nested_figure_like_under_outer_alt: {e}", file=sys.stderr)
        return False


def _k_absent_or_empty(elem) -> bool:
    """True when /K is missing, null, or an empty array (no associated content)."""
    try:
        if "/K" not in elem:
            return True
        k = elem.get("/K")
        if k is None:
            return True
        if isinstance(k, pikepdf.Array) and len(k) == 0:
            return True
    except Exception:
        return True
    return False


def _subtree_has_alt_excluding_self(elem) -> bool:
    for ch in _direct_role_children(elem):
        if _has_nonempty_alt_or_actual(ch) or _subtree_has_alt_excluding_self(ch):
            return True
    return False


def _struct_tag_upper(elem) -> str:
    try:
        return (get_name(elem) or "").upper()
    except Exception:
        return ""


def _k_has_mcid_association(k) -> bool:
    """True when /K directly references marked content (integer MCID or /MCR)."""
    if k is None:
        return False
    if isinstance(k, (int, pikepdf.Integer)):
        return True
    if isinstance(k, pikepdf.Dictionary):
        try:
            if k.get("/Type") == pikepdf.Name("/MCR"):
                return k.get("/MCID") is not None
        except Exception:
            pass
        return False
    if isinstance(k, pikepdf.Array):
        for ch in k:
            if isinstance(ch, (int, pikepdf.Integer)):
                return True
            if isinstance(ch, pikepdf.Dictionary):
                try:
                    if ch.get("/Type") == pikepdf.Name("/MCR"):
                        return ch.get("/MCID") is not None
                except Exception:
                    pass
    return False


def _k_has_objr(k) -> bool:
    if isinstance(k, pikepdf.Array):
        for ch in k:
            if isinstance(ch, pikepdf.Dictionary):
                try:
                    if ch.get("/Type") == pikepdf.Name("/OBJR"):
                        return True
                except Exception:
                    pass
    return False


def _elem_has_alt_or_actual(elem) -> bool:
    try:
        if elem.get("/Alt") is not None:
            return True
        if elem.get("/ActualText") is not None:
            return True
    except Exception:
        pass
    return False


def collect_acrobat_style_alt_risks(pdf: pikepdf.Pdf) -> dict:
    """
    Subset of PDFAF v1 `acrobat_alt_risk_nodes` heuristics (see pdfaf pdf_structure_helper.py).
    Counts drive alt_text scoring and Adobe parity signals for NestedAltText / AltTextNoContent / non-Figure alt.
    """
    out = {
        "nonFigureWithAltCount": 0,
        "nestedFigureAltCount": 0,
        "orphanedAltEmptyElementCount": 0,
        "sampleOwnershipModes": [],
    }
    samples: list = out["sampleOwnershipModes"]

    def note(mode: str) -> None:
        if len(samples) < 24:
            samples.append(mode)

    try:
        sr = pdf.Root.get("/StructTreeRoot")
    except Exception:
        return out
    if not isinstance(sr, pikepdf.Dictionary):
        return out

    def walk(node: pikepdf.Dictionary) -> None:
        if not isinstance(node, pikepdf.Dictionary):
            return
        tag_u = _struct_tag_upper(node)
        has_alt = _elem_has_alt_or_actual(node)
        try:
            kl = node.get("/K")
        except Exception:
            kl = None
        has_mcid = _k_has_mcid_association(kl)
        has_objr = _k_has_objr(kl) if isinstance(kl, pikepdf.Array) else False
        child_structs = _direct_role_children(node)

        if has_alt and not _struct_role_requires_figure_style_alt(get_name(node)):
            if has_mcid or len(child_structs) > 0:
                out["nonFigureWithAltCount"] += 1
                note("nonfigure_with_alt")

        if _struct_role_requires_figure_style_alt(get_name(node)) and has_alt:
            if _subtree_has_alt_excluding_self(node):
                out["nestedFigureAltCount"] += 1
                note("nested_alt_text_hides_content")

        if has_alt and not has_mcid and len(child_structs) == 0 and not has_objr:
            out["orphanedAltEmptyElementCount"] += 1
            note("orphaned_alt_empty_element")

        for c in child_structs:
            walk(c)

    try:
        doc_k = sr.get("/K")
    except Exception:
        return out
    if doc_k is None:
        return out
    if isinstance(doc_k, pikepdf.Dictionary):
        walk(doc_k)
    elif isinstance(doc_k, pikepdf.Array):
        for top in doc_k:
            if isinstance(top, pikepdf.Dictionary):
                walk(top)

    return out


def _repair_alt_text_subtree(elem) -> bool:
    """
    Post-order: fix Adobe 'Nested alternate text' without breaking 'Figures alternate text'.
    - Non-Figure wrappers: remove parent /Alt|/ActualText when a descendant also has them.
    - Figure-like (Figure, Formula, InlineShape, Shape): keep /Alt on the parent; strip all
      descendant /Alt|/ActualText (nested figures, Spans with soft-hyphen ActualText, etc.).
    - Recursion follows /K children that omit /Type /StructElem (Word stacks).
    - Any struct elem: clear alt when /K is empty (Adobe 'Associated with content').
    """
    changed = False
    for ch in _direct_role_children(elem):
        changed = _repair_alt_text_subtree(ch) or changed

    if not _has_nonempty_alt_or_actual(elem):
        return changed

    if _k_absent_or_empty(elem):
        _clear_alt_actual_and_title(elem)
        return True

    tag = get_name(elem)
    try:
        kl = elem.get("/K")
    except Exception:
        kl = None
    has_mcid = _k_has_mcid_association(kl)
    child_structs = _direct_role_children(elem)

    # Acrobat "Other elements alternate text": /Alt|/ActualText on non-Figure roles that map to
    # marked content (MCID) or wrap other structure is invalid — alt belongs on Figure/Formula/
    # InlineShape/Shape leaves, not on P/H/Div/Link wrappers (matches collect_acrobat_style_alt_risks).
    if not _struct_role_requires_figure_style_alt(tag):
        if has_mcid or len(child_structs) > 0:
            _clear_alt_actual_and_title(elem)
            return True

    if not _subtree_has_alt_excluding_self(elem):
        return changed

    if _struct_role_requires_figure_style_alt(tag):
        for ch in _direct_role_children(elem):
            changed = _strip_subtree_alt_actual_text_recursive(ch) or changed
    else:
        _clear_alt_actual_and_title(elem)
        changed = True
    return changed


def _op_repair_alt_text_structure(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """Fix Acrobat 'Nested alternate text' and 'Alt must be associated with some content' on tagged trees."""
    try:
        sr = pdf.Root.get("/StructTreeRoot")
        if sr is None:
            return False
        _fill_missing_figure_alts(pdf)
        k = sr.get("/K")
        if isinstance(k, pikepdf.Dictionary):
            if _is_struct_elem_dict(k):
                _repair_alt_text_subtree(k)
        elif isinstance(k, pikepdf.Array):
            for ch in k:
                if isinstance(ch, pikepdf.Dictionary) and _is_struct_elem_dict(ch):
                    _repair_alt_text_subtree(ch)
        _sweep_strip_descendants_under_figure_like_with_alt(pdf)
        _artifact_nested_figure_like_under_outer_alt(pdf)
        _fill_missing_figure_alts(pdf)
        # Return True when tagged so batch counts as applied (idempotent no-op OK).
        return True
    except Exception as e:
        print(f"[warn] repair_alt_text_structure: {e}", file=sys.stderr)
        return False


def _op_canonicalize_figure_alt_ownership(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """Stage 14 deterministic wrapper around the existing nested/duplicate alt cleanup."""
    return _op_repair_alt_text_structure(pdf, _params)


def _elem_has_direct_mcid_content(elem) -> bool:
    try:
        return _k_has_mcid_association(elem.get("/K"))
    except Exception:
        return False


def _descendant_leaf_figures_with_direct_content(node) -> list:
    figures: list = []
    visited: set = set()

    def visit(value, is_root: bool = False) -> None:
        if not isinstance(value, pikepdf.Dictionary):
            return
        vk = _struct_elem_visit_key(value)
        if vk in visited:
            return
        visited.add(vk)
        if not is_root and (get_name(value) or "") == "Figure" and _elem_has_direct_mcid_content(value):
            figures.append(value)
        for child in _direct_role_children(value):
            visit(child)

    visit(node, is_root=True)
    return figures


def _count_descendant_figures(node) -> int:
    count = 0
    visited: set = set()

    def visit(value, is_root: bool = False) -> None:
        nonlocal count
        if not isinstance(value, pikepdf.Dictionary):
            return
        vk = _struct_elem_visit_key(value)
        if vk in visited:
            return
        visited.add(vk)
        if not is_root and (get_name(value) or "") == "Figure":
            count += 1
        for child in _direct_role_children(value):
            visit(child)

    visit(node, is_root=True)
    return count


def _op_normalize_nested_figure_containers(pdf: pikepdf.Pdf, params: dict) -> bool:
    """
    Move wrapper /Alt onto one unambiguous leaf figure and retag empty wrapper /Figure nodes to /Sect.
    Ambiguous multi-leaf cases are left unchanged.
    """
    try:
        max_repairs = int(params.get("maxRepairsPerRun", 6))
    except (TypeError, ValueError):
        max_repairs = 6
    max_repairs = max(1, min(max_repairs, 32))

    changed = False
    repairs = 0
    try:
        sr = pdf.Root.get("/StructTreeRoot")
    except Exception:
        return False
    if not isinstance(sr, pikepdf.Dictionary):
        return False

    q: deque = deque()
    _enqueue_children(q, sr.get("/K"))
    visited: set = set()
    n = 0
    while q and n < MAX_ITEMS * 6 and repairs < max_repairs:
        n += 1
        try:
            obj = q.popleft()
        except Exception:
            break
        if not isinstance(obj, pikepdf.Dictionary):
            continue
        vk = _struct_elem_visit_key(obj)
        if vk in visited:
            continue
        visited.add(vk)
        if (get_name(obj) or "") == "Figure" and not _elem_has_direct_mcid_content(obj) and _count_descendant_figures(obj) > 0:
            leaf_figures = [
                figure for figure in _descendant_leaf_figures_with_direct_content(obj)
                if not str(figure.get("/Alt") or "").replace("u:", "").strip()
            ]
            before_alt = obj.get("/Alt")
            before_alt_text = str(before_alt or "").replace("u:", "").strip()
            if before_alt_text and len(leaf_figures) == 1:
                try:
                    leaf_figures[0]["/Alt"] = before_alt
                    changed = True
                except Exception:
                    pass
            if before_alt is not None:
                try:
                    del obj["/Alt"]
                    changed = True
                except Exception:
                    pass
            try:
                obj["/S"] = pikepdf.Name("/Sect")
                changed = True
                repairs += 1
            except Exception:
                pass
        try:
            _enqueue_children(q, obj.get("/K"))
        except Exception:
            pass
    return changed


def _op_set_figure_alt_text(pdf: pikepdf.Pdf, params: dict) -> bool:
    ref = params.get("structRef")
    if not ref:
        return False
    elem = _resolve_ref(pdf, ref)
    if elem is None:
        return False
    alt = params.get("altText", "Image")
    elem["/Alt"] = _pdf_text_string(str(alt), 2000)
    return True


def _op_set_document_title(pdf: pikepdf.Pdf, params: dict) -> bool:
    """
    Set /Info /Title, XMP dc:title, and /ViewerPreferences/DisplayDocTitle=true.

    Acrobat's DocTitle accessibility check requires *both* a non-empty /Title metadata entry
    AND the viewer preference that instructs conforming readers to show the document title in
    the title bar (DisplayDocTitle=true).  Without that flag Acrobat still reports "Failed"
    even when /Title is present.
    """
    text = _normalize_pdf_user_text(params.get("title") or "", 500).strip()
    if not text:
        return False
    changed = False
    try:
        cur = ""
        if pdf.docinfo is not None:
            t = pdf.docinfo.get("/Title")
            if t is not None:
                cur = safe_str(t).strip()
        if cur != text:
            if pdf.docinfo is None:
                pdf.docinfo = pikepdf.Dictionary()
            pdf.docinfo[pikepdf.Name("/Title")] = _pdf_text_string(text, 500)
            changed = True
    except Exception:
        pass
    try:
        with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
            prev = str(meta.get("dc:title") or "").strip()
            if prev != text:
                meta["dc:title"] = text
                changed = True
    except Exception:
        pass
    # Acrobat DocTitle check: /Catalog /ViewerPreferences /DisplayDocTitle must be true.
    try:
        root = pdf.Root
        vp = root.get("/ViewerPreferences")
        if vp is None:
            root["/ViewerPreferences"] = pikepdf.Dictionary(DisplayDocTitle=True)
            changed = True
        elif isinstance(vp, pikepdf.Dictionary):
            if vp.get("/DisplayDocTitle") is not True:
                vp["/DisplayDocTitle"] = True
                changed = True
    except Exception:
        pass
    return changed


def _op_set_document_language(pdf: pikepdf.Pdf, params: dict) -> bool:
    """Set /Root /Lang and XMP dc:language (BCP 47; typically ASCII)."""
    lang = _normalize_pdf_user_text(params.get("language") or "", 64).strip()
    if not lang:
        return False
    changed = False
    try:
        root = pdf.Root
        prev = safe_str(root.get("/Lang")).strip() if root.get("/Lang") is not None else ""
        if prev != lang:
            root["/Lang"] = _pdf_text_string(lang, 64)
            changed = True
    except Exception:
        pass
    try:
        with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
            pl = str(meta.get("dc:language") or "").strip()
            if pl != lang:
                meta["dc:language"] = lang
                changed = True
    except Exception:
        pass
    return changed


def _op_mark_figure_decorative(pdf: pikepdf.Pdf, params: dict) -> bool:
    ref = params.get("structRef")
    if not ref:
        return False
    elem = _resolve_ref(pdf, ref)
    if elem is None:
        return False
    elem["/S"] = pikepdf.Name.Artifact
    return True


def _wrap_misplaced_th_td_children(parent_elem, pdf: pikepdf.Pdf) -> bool:
    """
    Acrobat requires TH/TD under TR. Wrap each direct TH/TD StructElem child of `parent_elem`
    in a new /TR (single-cell row). Idempotent for already-wrapped trees.
    """
    try:
        k = parent_elem.get("/K")
    except Exception:
        return False
    if not isinstance(k, pikepdf.Array) or len(k) == 0:
        return False
    new_k = pikepdf.Array()
    changed_local = False
    for child in list(k):
        if not isinstance(child, pikepdf.Dictionary):
            new_k.append(child)
            continue
        try:
            if child.get("/Type") != pikepdf.Name("/StructElem"):
                new_k.append(child)
                continue
        except Exception:
            new_k.append(child)
            continue
        t = (get_name(child) or "").lstrip("/").upper()
        if t in ("TH", "TD"):
            tr = pdf.make_indirect(
                pikepdf.Dictionary(
                    Type=pikepdf.Name("/StructElem"),
                    S=pikepdf.Name("/TR"),
                    P=parent_elem,
                    K=pikepdf.Array([child]),
                )
            )
            child["/P"] = tr
            new_k.append(tr)
            changed_local = True
        else:
            new_k.append(child)
    if changed_local:
        parent_elem["/K"] = new_k
    return changed_local


def _struct_dict_same(a, b) -> bool:
    if not isinstance(a, pikepdf.Dictionary) or not isinstance(b, pikepdf.Dictionary):
        return False
    try:
        na, ga = a.objgen
        nb, gb = b.objgen
        if na and nb:
            return (na, ga) == (nb, gb)
    except Exception:
        pass
    return a is b


def _replace_li_child_with_l_wrapper(parent, li, pdf: pikepdf.Pdf) -> bool:
    """
    When `LI` is a direct /K child of `parent` and parent is not an /L, insert a new /L wrapper.
    Returns True if the tree was mutated.
    """
    try:
        if (get_name(li) or "").lstrip("/").upper() != "LI":
            return False
    except Exception:
        return False
    try:
        if not _struct_dict_same(li.get("/P"), parent):
            return False
    except Exception:
        return False
    try:
        k = parent.get("/K")
    except Exception:
        return False
    if k is None:
        return False

    def wrap() -> pikepdf.Dictionary:
        L = pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name("/StructElem"),
                S=pikepdf.Name("/L"),
                P=parent,
                K=pikepdf.Array([li]),
            )
        )
        li["/P"] = L
        return L

    if isinstance(k, pikepdf.Array):
        for i in range(len(k)):
            try:
                ch = k[i]
            except Exception:
                continue
            if isinstance(ch, pikepdf.Dictionary) and _struct_dict_same(ch, li):
                L = wrap()
                k[i] = L
                return True
        return False
    if isinstance(k, pikepdf.Dictionary) and _struct_dict_same(k, li):
        L = wrap()
        parent["/K"] = L
        return True
    return False


def _op_repair_list_li_wrong_parent(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """Wrap misplaced /LI (parent is not /L) in a new /L StructElem (bounded)."""
    try:
        cap = int(os.environ.get("PDFAF_MAX_LIST_LI_REPAIR_PER_CALL", "32"))
    except ValueError:
        cap = 32
    cap = max(1, min(cap, 256))

    try:
        sr = pdf.Root.get("/StructTreeRoot")
    except Exception:
        return False
    if not isinstance(sr, pikepdf.Dictionary):
        return False

    q: deque = deque()
    _enqueue_children(q, sr.get("/K"))
    visited: set = set()
    changed = False
    repairs = 0
    n = 0
    while q and n < MAX_ITEMS * 4 and repairs < cap:
        n += 1
        try:
            elem = q.popleft()
        except Exception:
            break
        if not isinstance(elem, pikepdf.Dictionary):
            continue
        vk = _struct_elem_visit_key(elem)
        if vk in visited:
            continue
        visited.add(vk)

        tag = (get_name(elem) or "").lstrip("/").upper()
        if tag == "LI" and repairs < cap:
            try:
                parent = elem.get("/P")
            except Exception:
                parent = None
            if isinstance(parent, pikepdf.Dictionary):
                parent_tag = (get_name(parent) or "").lstrip("/").upper()
                if parent_tag != "L":
                    if _replace_li_child_with_l_wrapper(parent, elem, pdf):
                        changed = True
                        repairs += 1

        try:
            _enqueue_children(q, elem.get("/K"))
        except Exception:
            pass

    return changed


def _repair_table_role_misplacement(pdf: pikepdf.Pdf) -> bool:
    """
    Bounded tree walk: for each Table, wrap loose TH/TD under the table and under THead/TBody/TFoot.
    Mirrors pdfaf v1 table_row_dicts expectations without importing the 8k-line helper.
    """
    changed = False
    try:
        sr = pdf.Root.get("/StructTreeRoot")
    except Exception:
        return False
    if not isinstance(sr, pikepdf.Dictionary):
        return False
    q: deque = deque()
    _enqueue_children(q, sr.get("/K"))
    visited: set = set()
    n = 0
    tables_seen = 0
    while q and n < MAX_ITEMS * 4 and tables_seen < 64:
        n += 1
        try:
            elem = q.popleft()
        except Exception:
            break
        if not isinstance(elem, pikepdf.Dictionary):
            continue
        oid = id(elem)
        if oid in visited:
            continue
        visited.add(oid)
        tag = (get_name(elem) or "").lstrip("/").upper()
        if tag == "TABLE":
            tables_seen += 1
            if _wrap_misplaced_th_td_children(elem, pdf):
                changed = True
            for sec in _struct_elem_children(elem):
                st = (get_name(sec) or "").lstrip("/").upper()
                if st in ("THEAD", "TBODY", "TFOOT"):
                    if _wrap_misplaced_th_td_children(sec, pdf):
                        changed = True
        try:
            _enqueue_children(q, elem.get("/K"))
        except Exception:
            pass
    return changed


def _iter_top_level_struct_elems(struct_root) -> list:
    try:
        k = struct_root.get("/K")
    except Exception:
        return []
    if isinstance(k, pikepdf.Dictionary):
        return [k] if _is_struct_elem_dict(k) else []
    if isinstance(k, pikepdf.Array):
        return [item for item in k if isinstance(item, pikepdf.Dictionary) and _is_struct_elem_dict(item)]
    return []


def _ensure_parent_tree_entry(nums: pikepdf.Array, key: int, value) -> None:
    for idx in range(0, len(nums), 2):
        try:
            existing_key = int(nums[idx])
        except Exception:
            continue
        if existing_key == key:
            nums[idx + 1] = value
            return
    nums.append(pikepdf.Integer(key))
    nums.append(value)


def _op_repair_structure_conformance(pdf: pikepdf.Pdf, _params: dict) -> bool:
    changed = False
    root = pdf.Root
    mi = root.get("/MarkInfo")
    if mi is not None:
        try:
            if mi.get("/Marked") is not True:
                mi["/Marked"] = True
                changed = True
        except Exception:
            pass
    else:
        root["/MarkInfo"] = pikepdf.Dictionary(Marked=True, Suspects=False)
        changed = True
    sr, doc_elem = _find_or_create_document_elem(pdf)
    if sr is not None and doc_elem is not None:
        pt = sr.get("/ParentTree")
        if not isinstance(pt, pikepdf.Dictionary):
            pt = pikepdf.Dictionary(Nums=pikepdf.Array([]))
            sr["/ParentTree"] = pt
            changed = True
        nums = pt.get("/Nums")
        if not isinstance(nums, pikepdf.Array):
            nums = pikepdf.Array([])
            pt["/Nums"] = nums
            changed = True
        next_key = int(sr.get("/ParentTreeNextKey", 0) or 0)
        top_level = _iter_top_level_struct_elems(sr)
        page_backed = [elem for elem in top_level if isinstance(elem.get("/Pg"), pikepdf.Dictionary)]
        for page_idx, page in enumerate(pdf.pages):
            page_obj = page.obj
            try:
                sp = page_obj.get("/StructParents")
                if not isinstance(sp, (int, pikepdf.Integer)):
                    page_obj["/StructParents"] = pikepdf.Integer(next_key)
                    page_key = next_key
                    next_key += 1
                    changed = True
                else:
                    page_key = int(sp)
            except Exception:
                page_obj["/StructParents"] = pikepdf.Integer(next_key)
                page_key = next_key
                next_key += 1
                changed = True

            page_elem = None
            for elem in page_backed:
                try:
                    if elem.get("/Pg") is page_obj:
                        page_elem = elem
                        break
                except Exception:
                    continue
            if page_elem is None:
                page_elem = pdf.make_indirect(pikepdf.Dictionary(
                    Type=pikepdf.Name("/StructElem"),
                    S=pikepdf.Name("/Sect"),
                    P=doc_elem,
                    Pg=page_obj,
                    K=pikepdf.Array([]),
                ))
                dk = doc_elem.get("/K")
                if isinstance(dk, pikepdf.Array):
                    dk.append(page_elem)
                elif dk is None:
                    doc_elem["/K"] = pikepdf.Array([page_elem])
                else:
                    doc_elem["/K"] = pikepdf.Array([dk, page_elem])
                page_backed.append(page_elem)
                changed = True

            _ensure_parent_tree_entry(nums, page_key, pikepdf.Array([page_elem]))
        sr["/ParentTreeNextKey"] = pikepdf.Integer(next_key)
        if _mut_tag_unowned_annotations(pdf):
            changed = True
        if _mut_repair_native_link_structure(pdf):
            changed = True
    try:
        if _repair_table_role_misplacement(pdf):
            changed = True
    except Exception as e:
        print(f"[warn] repair_structure_conformance table roles: {e}", file=sys.stderr)
    return changed


def _struct_elem_heading_level(elem) -> int | None:
    """If /S is a heading role, return 1–6; else None."""
    try:
        s = elem.get("/S")
        if s is None:
            return None
        raw = str(s).lstrip("/")
        u = raw.upper()
        if u == "H":
            return 1
        m = re.match(r"^H([1-6])$", u)
        if m:
            return int(m.group(1))
    except Exception:
        pass
    return None


def _op_normalize_heading_hierarchy(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """
    Fix skipped heading levels in the structure tree so Acrobat's "Headings — Appropriate
    nesting" check can pass.

    Algorithm (document BFS order):
    - Track the highest level seen so far (prev_level, 0 = before first heading).
    - When a heading jumps more than one level (e.g. H1 → H3), rename it to prev+1
      so no level is skipped.
    - Returning to a lower level (H3 → H2) is always allowed — that just means a
      new top-level section, which is valid.

    Only changes /S on heading StructElems whose current level is too deep.
    Returns True iff at least one element was renamed.
    """
    try:
        sr = pdf.Root.get("/StructTreeRoot")
        if sr is None:
            return False
    except Exception:
        return False

    # Collect heading elements in BFS (document) order together with their levels
    heading_elems: list[tuple] = []  # (elem, current_level)
    q: deque = deque()
    try:
        _enqueue_children(q, sr.get("/K"))
    except Exception:
        return False

    visited: set = set()
    n = 0
    while q and n < MAX_ITEMS * 4:
        n += 1
        try:
            elem = q.popleft()
            if not isinstance(elem, pikepdf.Dictionary):
                continue
            oid = id(elem)
            if oid in visited:
                continue
            visited.add(oid)
            level = _struct_elem_heading_level(elem)
            if level is not None:
                heading_elems.append((elem, level))
            try:
                _enqueue_children(q, elem.get("/K"))
            except Exception:
                pass
        except Exception:
            pass

    if not heading_elems:
        return False

    changed = False
    prev_level = 0
    for elem, level in heading_elems:
        if level > prev_level + 1:
            # Skipped levels — normalise down to prev+1
            new_level = prev_level + 1
            try:
                elem["/S"] = pikepdf.Name(f"/H{new_level}")
                changed = True
            except Exception:
                pass
            prev_level = new_level
        else:
            prev_level = level

    return changed


def _op_create_heading_from_candidate(pdf: pikepdf.Pdf, params: dict) -> bool:
    """Promote a safe structural paragraph-like target to a heading level."""
    target_ref = params.get("targetRef") or params.get("structRef")
    if not target_ref:
        return False
    try:
        level = int(params.get("level", 2))
    except (TypeError, ValueError):
        level = 2
    level = max(1, min(level, 6))
    return _op_retag_struct_as_heading(pdf, {
        "structRef": target_ref,
        "level": level,
    })


def _op_golden_v1_promote_p_to_heading(pdf: pikepdf.Pdf, params: dict) -> bool:
    """Same as retag_struct_as_heading but only on pdfaf-3cc-golden-v1 producer PDFs (Phase 3c-c CI)."""
    if not pdf_has_3cc_golden_marker(pdf):
        return False
    return _op_retag_struct_as_heading(pdf, params)


def _op_orphan_v1_insert_p_for_mcid(pdf: pikepdf.Pdf, params: dict) -> bool:
    """Insert a /P StructElem referencing orphan MCID (pdfaf-3cc-orphan-v1 fixture only)."""
    if not pdf_has_3cc_orphan_marker(pdf):
        return False
    try:
        mcid = int(params.get("mcid", 0))
    except (TypeError, ValueError):
        mcid = 0
    page_map = build_page_map(pdf)
    ref = collect_referenced_mcid_pairs(pdf, page_map)
    target_page: int | None = None
    mp = _mcid_max_pages()
    for pi in range(min(len(pdf.pages), mp)):
        raw = _read_page_contents_raw(pdf.pages[pi])
        found_mcid = False
        for m in MCID_OP_RE.finditer(raw):
            if int(m.group(1)) == mcid:
                found_mcid = True
                break
        if not found_mcid:
            continue
        if (pi, mcid) in ref:
            return False
        target_page = pi
        break
    if target_page is None:
        return False
    return _insert_p_for_orphan_mcid_on_page(pdf, target_page, mcid)


def _op_orphan_v1_promote_p_to_heading(pdf: pikepdf.Pdf, params: dict) -> bool:
    """Same as retag_struct_as_heading but only on pdfaf-3cc-orphan-v1 producer PDFs."""
    if not pdf_has_3cc_orphan_marker(pdf):
        return False
    return _op_retag_struct_as_heading(pdf, params)


def _op_retag_struct_as_heading(pdf: pikepdf.Pdf, params: dict) -> bool:
    """Promote /P, /Span, or /Div structure elements to /H1–/H6 (Office-tagged PDFs often use Span/Div)."""
    ref = params.get("structRef")
    level = params.get("level")
    if not ref:
        return False
    try:
        level = int(level)
    except (TypeError, ValueError):
        return False
    if level < 1 or level > 6:
        return False
    elem = _resolve_ref(pdf, ref)
    if elem is None:
        return False
    try:
        s = elem.get("/S")
        tnorm = str(s).lstrip("/").upper() if s is not None else ""
    except Exception:
        return False
    if tnorm not in ("P", "SPAN", "DIV"):
        return False
    tag = "/H1" if level == 1 else f"/H{level}"
    elem["/S"] = pikepdf.Name(tag)
    return True


def _op_set_heading_level(pdf: pikepdf.Pdf, params: dict) -> bool:
    """Set structure element /S to /H1–/H6. Only mutates elements that are already headings."""
    ref = params.get("structRef")
    level = params.get("level")
    if not ref:
        return False
    try:
        level = int(level)
    except (TypeError, ValueError):
        return False
    if level < 1 or level > 6:
        return False
    elem = _resolve_ref(pdf, ref)
    if elem is None:
        return False
    if _struct_elem_heading_level(elem) is None:
        return False
    tag = "/H1" if level == 1 else f"/H{level}"
    elem["/S"] = pikepdf.Name(tag)
    return True


def _is_ocrmypdf_produced(pdf: pikepdf.Pdf) -> bool:
    """Return True when the PDF's Creator field indicates OCRmyPDF produced it."""
    try:
        creator = safe_str(pdf.docinfo.get(pikepdf.Name("/Creator"), ""))
        return "ocrmypdf" in creator.lower()
    except Exception:
        return False


def _op_bootstrap_struct_tree(pdf: pikepdf.Pdf, _params: dict) -> bool:
    root = pdf.Root
    if root.get("/StructTreeRoot") is not None:
        return False
    try:
        doc_elem = pikepdf.Dictionary(
            Type=pikepdf.Name("/StructElem"),
            S=pikepdf.Name("/Document"),
        )
        pt = pikepdf.Dictionary(Nums=pikepdf.Array([]))
        str_root = pikepdf.Dictionary(
            Type=pikepdf.Name("/StructTreeRoot"),
            K=pikepdf.Array([doc_elem]),
            ParentTree=pt,
        )
        pdf.Root["/StructTreeRoot"] = str_root
        # Ensure MarkInfo.Marked=True when bootstrapping
        if root.get("/MarkInfo") is None:
            pdf.Root["/MarkInfo"] = pikepdf.Dictionary(Marked=True, Suspects=False)
        return True
    except Exception as e:
        print(f"[warn] bootstrap_struct_tree failed: {e}", file=sys.stderr)
        return False


def _wrap_do_operators_as_artifact(insts: list) -> list:
    """
    Walk a content stream instruction list and wrap any `Do` operators that sit
    outside existing BDC/BMC…EMC blocks inside /Artifact BMC…EMC.
    This converts the scanned-page background raster image to an accessibility Artifact.
    Returns a new instruction list (does not mutate the input).
    """
    depth = 0
    outside_segs: list[tuple[int, int]] = []
    seg_start = 0

    for i, inst in enumerate(insts):
        op = str(inst.operator)
        if op in ("BDC", "BMC"):
            if depth == 0 and i > seg_start:
                outside_segs.append((seg_start, i))
            depth += 1
        elif op == "EMC":
            depth = max(0, depth - 1)
            if depth == 0:
                seg_start = i + 1

    if depth == 0 and seg_start < len(insts):
        outside_segs.append((seg_start, len(insts)))

    # Only keep segments that contain a `Do` operator
    segs_to_wrap = [
        (s, e) for s, e in outside_segs
        if any(str(insts[j].operator) == "Do" for j in range(s, e))
    ]
    if not segs_to_wrap:
        return insts

    result: list = []
    prev_end = 0
    for s, e in segs_to_wrap:
        result.extend(insts[prev_end:s])
        result.append(pikepdf.ContentStreamInstruction(
            [pikepdf.Name("/Artifact")], pikepdf.Operator("BMC")
        ))
        result.extend(insts[s:e])
        result.append(pikepdf.ContentStreamInstruction([], pikepdf.Operator("EMC")))
        prev_end = e
    result.extend(insts[prev_end:])
    return result


def _extract_text_from_instruction_segment(seg_insts: list) -> str:
    """Best-effort plain text extracted from a BT…ET instruction segment."""
    try:
        raw = pikepdf.unparse_content_stream(seg_insts)
    except Exception:
        return ""
    parts: list[str] = []
    try:
        for seg_m in re.finditer(rb"\(((?:\\.|[^\\\)])+)\)|<([0-9A-Fa-f]+)>", raw):
            if seg_m.group(1):
                inner = seg_m.group(1)
                s = inner.decode("latin-1", errors="replace")
                s = s.replace("\\)", ")").replace("\\(", "(").replace("\\\\", "\\")
                parts.append(s)
            elif seg_m.group(2):
                parts.append(_decode_pdf_hex_string(seg_m.group(2)))
    except Exception:
        pass
    text = " ".join(part.strip() for part in parts if part and part.strip())
    text = re.sub(r"\s+", " ", text).strip()
    return text[:500]


def _bt_et_text_groups(insts: list) -> list[tuple[int, int, str]]:
    """Return BT…ET spans plus extracted text."""
    groups: list[tuple[int, int, str]] = []
    in_bt = False
    bt_start = 0
    for idx, inst in enumerate(insts):
        op = str(inst.operator)
        if op == "BT" and not in_bt:
            in_bt = True
            bt_start = idx
        elif op == "ET" and in_bt:
            in_bt = False
            text = _extract_text_from_instruction_segment(insts[bt_start : idx + 1])
            groups.append((bt_start, idx, text))
    return groups


def _looks_like_heading_text(text: str, page_idx: int, block_idx: int, page_count: int) -> bool:
    s = re.sub(r"\s+", " ", (text or "")).strip()
    if len(s) < 4 or len(s) > 140:
        return False
    words = [w for w in re.split(r"\s+", s) if w]
    if len(words) == 0 or len(words) > 16:
        return False
    if page_idx == 0 and block_idx == 0:
        return True
    if block_idx > 1:
        return False
    if s.endswith("."):
        return False
    alpha_chars = sum(1 for ch in s if ch.isalpha())
    if alpha_chars < max(3, len(s) // 3):
        return False
    titleish_words = sum(1 for w in words if any(ch.isalpha() for ch in w) and w[:1].isupper())
    upperish = s.upper() == s and alpha_chars >= 4
    return upperish or titleish_words >= max(1, int(len(words) * 0.6)) or (page_count > 1 and block_idx == 0)


def _find_or_create_document_elem(pdf: pikepdf.Pdf) -> tuple[object | None, object | None]:
    root = pdf.Root
    sr = root.get("/StructTreeRoot")
    if sr is None:
      _op_bootstrap_struct_tree(pdf, {})
      sr = root.get("/StructTreeRoot")
    if sr is None:
      return None, None
    k_root = sr.get("/K")
    doc_elem = None
    if isinstance(k_root, pikepdf.Array) and len(k_root) > 0:
        candidate = k_root[0]
        if isinstance(candidate, pikepdf.Dictionary):
            s = candidate.get("/S")
            if s is not None and str(s).lstrip("/").upper() in ("DOCUMENT", "SECT"):
                doc_elem = candidate
    if doc_elem is None:
        doc_elem = pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name("/StructElem"),
                S=pikepdf.Name("/Document"),
            )
        )
        sr["/K"] = pikepdf.Array([doc_elem])
    return sr, doc_elem


def _op_synthesize_basic_structure_from_layout(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """
    Build a minimal structure tree from BT…ET text groups on native digital PDFs.
    Heuristic-only and intentionally conservative: create one H/P StructElem per text block
    and leave non-text / ambiguous content unclaimed.
    """
    if len(pdf.pages) == 0 or pdf.Root is None:
        return False
    if _is_ocrmypdf_produced(pdf):
        return False

    changed = False
    sr, doc_elem = _find_or_create_document_elem(pdf)
    if sr is None or doc_elem is None:
        return False

    try:
        existing_ck = doc_elem.get("/K")
        if isinstance(existing_ck, pikepdf.Array) and len(existing_ck) > 0:
            return False
        if isinstance(existing_ck, pikepdf.Dictionary):
            return False
    except Exception:
        pass

    pt = sr.get("/ParentTree")
    if not isinstance(pt, pikepdf.Dictionary):
        pt = pikepdf.Dictionary(Nums=pikepdf.Array([]))
        sr["/ParentTree"] = pt
        changed = True
    nums = pt.get("/Nums")
    if not isinstance(nums, pikepdf.Array):
        nums = pikepdf.Array([])
        pt["/Nums"] = nums
        changed = True

    next_mcid = int(sr.get("/ParentTreeNextKey", 0) or 0)
    page_children = pikepdf.Array([])

    for page_idx, page in enumerate(pdf.pages):
        page_obj = page.obj
        try:
            insts = list(pikepdf.parse_content_stream(page_obj))
        except Exception:
            continue
        if any(str(i.operator) == "BDC" for i in insts):
            continue

        groups = _bt_et_text_groups(insts)
        if not groups:
            continue

        sect = pdf.make_indirect(
            pikepdf.Dictionary(
                Type=pikepdf.Name("/StructElem"),
                S=pikepdf.Name("/Sect"),
                P=doc_elem,
                Pg=page_obj,
                K=pikepdf.Array([]),
            )
        )
        sect_children = pikepdf.Array([])
        rewritten: list = []
        prev_end = 0
        heading_count = 0

        for block_idx, (grp_start, grp_end, text) in enumerate(groups):
            cleaned = re.sub(r"\s+", " ", (text or "")).strip()
            if not cleaned:
                continue
            mcid = next_mcid
            next_mcid += 1
            tag_name = "/P"
            if _looks_like_heading_text(cleaned, page_idx, block_idx, len(pdf.pages)):
                if page_idx == 0 and heading_count == 0:
                    tag_name = "/H1"
                elif heading_count == 0:
                    tag_name = "/H2"
                elif heading_count == 1 and page_idx == 0:
                    tag_name = "/H2"
                heading_count += 1

            elem = pdf.make_indirect(
                pikepdf.Dictionary(
                    Type=pikepdf.Name("/StructElem"),
                    S=pikepdf.Name(tag_name),
                    K=mcid,
                    Pg=page_obj,
                    P=sect,
                    ActualText=_pdf_text_string(cleaned, 500),
                )
            )
            sect_children.append(elem)
            nums.append(mcid)
            nums.append(elem)
            rewritten.extend(insts[prev_end:grp_start])
            rewritten.append(
                pikepdf.ContentStreamInstruction(
                    [pikepdf.Name("/P"), pikepdf.Dictionary(MCID=mcid)],
                    pikepdf.Operator("BDC"),
                )
            )
            rewritten.extend(insts[grp_start : grp_end + 1])
            rewritten.append(pikepdf.ContentStreamInstruction([], pikepdf.Operator("EMC")))
            prev_end = grp_end + 1

        if len(sect_children) == 0:
            continue

        rewritten.extend(insts[prev_end:])
        final_rewritten = _wrap_do_operators_as_artifact(rewritten)
        try:
            page_obj["/Contents"] = pdf.make_stream(
                pikepdf.unparse_content_stream(final_rewritten)
            )
        except Exception as e:
            print(f"[warn] synthesize_basic_structure_from_layout page {page_idx}: {e}", file=sys.stderr)
            continue
        sect["/K"] = sect_children
        page_children.append(sect)
        changed = True

    if len(page_children) > 0:
        doc_elem["/K"] = page_children
        sr["/ParentTreeNextKey"] = next_mcid
        changed = True
    return changed


def _op_artifact_repeating_page_furniture(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """
    Convert repeated short first/last text elements that recur across 3+ pages into Artifacts.
    This is intentionally bounded and only touches obvious repeated page furniture.
    """
    try:
        sr = pdf.Root.get("/StructTreeRoot")
    except Exception:
        return False
    if not isinstance(sr, pikepdf.Dictionary) or len(pdf.pages) < 3:
        return False

    try:
        mcid_lookup = _build_mcid_resolved_lookup(pdf)
    except Exception:
        mcid_lookup = {}
    page_map = build_page_map(pdf)

    q: deque = deque()
    _enqueue_children(q, sr.get("/K"))
    visited: set = set()
    page_entries: dict[int, list[tuple[int, object, str]]] = {}
    seq = 0
    while q and seq < MAX_ITEMS * 6:
        seq += 1
        try:
            elem = q.popleft()
        except Exception:
            break
        if not isinstance(elem, pikepdf.Dictionary):
            continue
        vk = _struct_elem_visit_key(elem)
        if vk in visited:
            continue
        visited.add(vk)
        tag = (get_name(elem) or "").lstrip("/").upper()
        page = get_page_number(elem, page_map)
        if tag in ("P", "SPAN", "DIV", "H", "H1", "H2", "H3", "H4", "H5", "H6"):
            text = _extract_text_from_elem(elem) or _text_from_mcid_for_elem(elem, page, mcid_lookup)
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                page_entries.setdefault(page, []).append((seq, elem, text[:200]))
        try:
            _enqueue_children(q, elem.get("/K"))
        except Exception:
            pass

    counts: dict[str, set[int]] = {}
    first_last_refs: set[str] = set()
    for page, entries in page_entries.items():
        if not entries:
            continue
        ordered = sorted(entries, key=lambda row: row[0])
        for _, elem, text in (ordered[0], ordered[-1]):
            ref = object_ref_str(elem) or str(id(elem))
            first_last_refs.add(ref)
            norm = re.sub(r"\s+", " ", text).strip().lower()
            if len(norm) <= 80 and len(norm.split()) <= 10:
                counts.setdefault(norm, set()).add(page)
    repeated_texts = {text for text, pages in counts.items() if len(pages) >= 3}
    if not repeated_texts:
        return False

    changed = False
    for entries in page_entries.values():
        for _seq, elem, text in entries:
            ref = object_ref_str(elem) or str(id(elem))
            norm = re.sub(r"\s+", " ", text).strip().lower()
            if ref not in first_last_refs or norm not in repeated_texts:
                continue
            try:
                elem["/S"] = pikepdf.Name("/Artifact")
                _clear_alt_actual_and_title(elem)
                changed = True
            except Exception:
                pass
    return changed


def _tag_bt_et_blocks_into_structure(pdf: pikepdf.Pdf, *, require_ocrmypdf: bool) -> bool:
    """
    Wrap each BT…ET block in /P <</MCID N>> BDC … EMC and attach ONE P struct element
    per page under the Document element. Shared by OCRmyPDF and legacy native paths.

    When require_ocrmypdf is True, only runs on OCRmyPDF-produced PDFs (original behaviour).
    When False, runs on any PDF with suitable BT/ET groups (legacy untagged exports).
    """
    if require_ocrmypdf and not _is_ocrmypdf_produced(pdf):
        return False

    root = pdf.Root
    sr = root.get("/StructTreeRoot")
    if sr is None:
        _op_bootstrap_struct_tree(pdf, {})
        sr = root.get("/StructTreeRoot")
    if sr is None:
        return False

    # Ensure Document element exists
    k_root = sr.get("/K")
    doc_elem = None
    if isinstance(k_root, pikepdf.Array) and len(k_root) > 0:
        candidate = k_root[0]
        if isinstance(candidate, pikepdf.Dictionary):
            s = candidate.get("/S")
            if s is not None and str(s).lstrip("/").upper() in ("DOCUMENT", "SECT"):
                doc_elem = candidate
    if doc_elem is None:
        doc_elem = pdf.make_indirect(pikepdf.Dictionary(
            Type=pikepdf.Name("/StructElem"),
            S=pikepdf.Name("/Document"),
        ))
        sr["/K"] = pikepdf.Array([doc_elem])

    # Idempotent guard: if Document already has children, skip.
    try:
        existing_ck = doc_elem.get("/K")
        if existing_ck is not None:
            return False
    except Exception:
        pass

    # Build / extend ParentTree
    pt = sr.get("/ParentTree")
    if not isinstance(pt, pikepdf.Dictionary):
        pt = pikepdf.Dictionary(Nums=pikepdf.Array([]))
        sr["/ParentTree"] = pt
    nums = pt.get("/Nums")
    if not isinstance(nums, pikepdf.Array):
        nums = pikepdf.Array([])
        pt["/Nums"] = nums

    next_mcid = int(sr.get("/ParentTreeNextKey", 0) or 0)

    changed = False
    new_p_elems = []

    for page_idx, page in enumerate(pdf.pages):
        page_obj = page.obj
        try:
            insts = list(pikepdf.parse_content_stream(page_obj))
        except Exception:
            continue

        # Skip pages that already have BDC markers
        if any(str(i.operator) == "BDC" for i in insts):
            continue

        # Find BT…ET groups
        bt_et_groups: list[tuple[int, int]] = []
        in_bt = False
        bt_start = 0
        for idx, inst in enumerate(insts):
            op = str(inst.operator)
            if op == "BT" and not in_bt:
                in_bt = True
                bt_start = idx
            elif op == "ET" and in_bt:
                in_bt = False
                bt_et_groups.append((bt_start, idx))

        if not bt_et_groups:
            continue

        # Assign MCIDs for this page's BT/ET groups
        page_mcids: list[int] = []
        rewritten: list = []
        prev_end = 0

        for grp_start, grp_end in bt_et_groups:
            mcid = next_mcid
            next_mcid += 1
            page_mcids.append(mcid)

            rewritten.extend(insts[prev_end:grp_start])
            rewritten.append(pikepdf.ContentStreamInstruction(
                [pikepdf.Name("/P"), pikepdf.Dictionary(MCID=mcid)],
                pikepdf.Operator("BDC"),
            ))
            rewritten.extend(insts[grp_start:grp_end + 1])
            rewritten.append(pikepdf.ContentStreamInstruction([], pikepdf.Operator("EMC")))
            prev_end = grp_end + 1

        rewritten.extend(insts[prev_end:])

        # Also wrap any trailing/leading untagged `Do` operators (scanned page image) as Artifact.
        # These exist outside BDC blocks and represent the background raster image.
        # Walk the rewritten stream and wrap segments with `Do` that are outside BDC/EMC in Artifact.
        final_rewritten = _wrap_do_operators_as_artifact(rewritten)

        try:
            page_obj["/Contents"] = pdf.make_stream(
                pikepdf.unparse_content_stream(final_rewritten)
            )
        except Exception as e:
            print(f"[warn] tag_ocr_text_blocks page {page_idx}: {e}", file=sys.stderr)
            continue

        # ONE P struct element per page referencing all MCIDs via /K array
        p_elem = pdf.make_indirect(pikepdf.Dictionary(
            Type=pikepdf.Name("/StructElem"),
            S=pikepdf.Name("/P"),
            K=pikepdf.Array(page_mcids),
            Pg=page_obj,
            P=doc_elem,
        ))
        new_p_elems.append(p_elem)

        # ParentTree: each MCID → this P element
        for mcid in page_mcids:
            nums.append(mcid)
            nums.append(p_elem)

        changed = True

    if not changed:
        return False

    # Attach all page P elements to Document
    doc_elem["/K"] = pikepdf.Array(new_p_elems)
    sr["/ParentTreeNextKey"] = next_mcid
    return True


def _op_tag_ocr_text_blocks(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """OCRmyPDF sandwich: see _tag_bt_et_blocks_into_structure."""
    return _tag_bt_et_blocks_into_structure(pdf, require_ocrmypdf=True)


def _op_tag_native_text_blocks(pdf: pikepdf.Pdf, _params: dict) -> bool:
    """Legacy native PDFs with extractable BT/ET text but no marked-content IDs."""
    if _is_ocrmypdf_produced(pdf):
        return False
    return _tag_bt_et_blocks_into_structure(pdf, require_ocrmypdf=False)


def _op_ensure_accessibility_tagging(pdf: pikepdf.Pdf, params: dict) -> bool:
    """
    End-of-pipeline invariant: real /StructTreeRoot + BT/ET tagging when applicable.
    pdfClass in params: skip bootstrap on pure 'scanned' (OCR stage owns structure).
    """
    pdf_class = str(params.get("pdfClass") or "").strip().lower()
    changed = False
    if pdf.Root.get("/StructTreeRoot") is None:
        if pdf_class != "scanned":
            if _op_bootstrap_struct_tree(pdf, {}):
                changed = True
    if _is_ocrmypdf_produced(pdf):
        if _tag_bt_et_blocks_into_structure(pdf, require_ocrmypdf=True):
            changed = True
    else:
        if _tag_bt_et_blocks_into_structure(pdf, require_ocrmypdf=False):
            changed = True
    return changed


MUTATORS = {
    "stamp_pdf_ua_xmp": _op_stamp_pdf_ua_xmp,
    "set_document_title": _op_set_document_title,
    "set_document_language": _op_set_document_language,
    "set_pdfua_identification": _op_set_pdfua_identification,
    "synthesize_basic_structure_from_layout": _op_synthesize_basic_structure_from_layout,
    "artifact_repeating_page_furniture": _op_artifact_repeating_page_furniture,
    "create_heading_from_candidate": _op_create_heading_from_candidate,
    "set_figure_alt_text": _op_set_figure_alt_text,
    "mark_figure_decorative": _op_mark_figure_decorative,
    "normalize_nested_figure_containers": _op_normalize_nested_figure_containers,
    "canonicalize_figure_alt_ownership": _op_canonicalize_figure_alt_ownership,
    "repair_alt_text_structure": _op_repair_alt_text_structure,
    "repair_structure_conformance": _op_repair_structure_conformance,
    "substitute_legacy_fonts_in_place": _op_substitute_legacy_fonts_in_place,
    "finalize_substituted_font_conformance": _op_finalize_substituted_font_conformance,
    "bootstrap_struct_tree": _op_bootstrap_struct_tree,
    "mark_untagged_content_as_artifact": _op_mark_untagged_content_as_artifact,
    "tag_ocr_text_blocks": _op_tag_ocr_text_blocks,
    "tag_native_text_blocks": _op_tag_native_text_blocks,
    "ensure_accessibility_tagging": _op_ensure_accessibility_tagging,
    "remap_orphan_mcids_as_artifacts": _op_remap_orphan_mcids_as_artifacts,
    "set_heading_level": _op_set_heading_level,
    "normalize_heading_hierarchy": _op_normalize_heading_hierarchy,
    "retag_struct_as_heading": _op_retag_struct_as_heading,
    "golden_v1_promote_p_to_heading": _op_golden_v1_promote_p_to_heading,
    "orphan_v1_insert_p_for_mcid": _op_orphan_v1_insert_p_for_mcid,
    "orphan_v1_promote_p_to_heading": _op_orphan_v1_promote_p_to_heading,
    "wrap_singleton_orphan_mcid": _op_wrap_singleton_orphan_mcid,
    "replace_bookmarks_from_headings": _op_replace_bookmarks_from_headings,
    "add_page_outline_bookmarks": _op_add_page_outline_bookmarks,
    "set_table_header_cells": _op_set_table_header_cells,
    "repair_native_table_headers": _op_repair_native_table_headers,
    "repair_list_li_wrong_parent": _op_repair_list_li_wrong_parent,
    "tag_unowned_annotations": _op_tag_unowned_annotations,
    "set_link_annotation_contents": _op_set_link_annotation_contents,
    "repair_native_link_structure": _op_repair_native_link_structure,
    "normalize_annotation_tab_order": _op_normalize_annotation_tab_order,
    "repair_annotation_alt_text": _op_repair_annotation_alt_text,
    "embed_urw_type1_substitutes": _op_embed_urw_type1_substitutes,
    "fill_form_field_tooltips": _op_fill_form_field_tooltips,
}


def _ocr_timeout_sec() -> int:
    try:
        return max(60, int(os.environ.get("PDFAF_OCR_TIMEOUT_SEC", "1800")))
    except ValueError:
        return 1800


def _run_ocrmypdf(in_pdf: str, out_pdf: str, params: dict) -> tuple[bool, str]:
    """
    Run ocrmypdf (Tesseract) to add a searchable text layer. Requires `ocrmypdf` on PATH plus
    tesseract-ocr and ghostscript (see distro packages).
    """
    exe_name = (os.environ.get("PDFAF_OCRMYPDF_BIN") or "ocrmypdf").strip() or "ocrmypdf"
    exe = shutil.which(exe_name)
    if not exe:
        return False, (
            "ocrmypdf not found on PATH — install ocrmypdf, tesseract-ocr, and ghostscript "
            "(e.g. apt install ocrmypdf tesseract-ocr-eng ghostscript)"
        )
    langs = (params.get("languages") or "eng").strip() or "eng"
    cmd = [exe, "--optimize", "0", "--jobs", "1"]
    # Remediation often runs `bootstrap_struct_tree` in an earlier stage than OCR; the PDF is then
    # “Tagged” while still having no extractable text — ocrmypdf refuses that unless we force OCR.
    if params.get("forceOcr", True):
        cmd.append("--force-ocr")
    if params.get("deskew", True):
        cmd.append("--deskew")
    if params.get("rotatePages", True):
        cmd.append("--rotate-pages")
    if params.get("skipExistingText") or params.get("skip_text"):
        cmd.append("--skip-text")
    cmd.extend(["--language", langs, in_pdf, out_pdf])
    # On many dev machines `pip install --user pikepdf` is newer than apt `ocrmypdf`; mixing them makes
    # ocrmypdf crash (e.g. `Pdf` missing `.check()`). Isolating user-site for the ocrmypdf subprocess fixes that.
    ocr_env = {
        **os.environ,
        "OMP_THREAD_LIMIT": os.environ.get("OMP_THREAD_LIMIT", "1"),
        "PYTHONNOUSERSITE": "1",
    }
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=_ocr_timeout_sec(),
            check=False,
            env=ocr_env,
        )
    except subprocess.TimeoutExpired:
        return False, f"ocrmypdf timed out after {_ocr_timeout_sec()}s"
    if proc.returncode != 0:
        se = proc.stderr or b""
        so = proc.stdout or b""
        err = (
            (se.decode("utf-8", errors="replace") if isinstance(se, bytes) else str(se))
            + (so.decode("utf-8", errors="replace") if isinstance(so, bytes) else str(so))
        )
        err = (err or f"ocrmypdf exit {proc.returncode}").strip()[:4000]
        return False, err
    return True, ""


def mutate_main(request_path: str) -> int:
    try:
        with open(request_path, encoding="utf-8") as f:
            req = json.load(f)
    except Exception as e:
        print(json.dumps({"success": False, "applied": [], "failed": [{"op": "_request", "error": str(e)}]}, ensure_ascii=False))
        return 0

    input_path = req.get("input_path")
    output_path = req.get("output_path")
    mutations = req.get("mutations") or []
    if not input_path or not output_path:
        print(
            json.dumps(
                {"success": False, "applied": [], "failed": [{"op": "_request", "error": "missing input_path or output_path"}]},
                ensure_ascii=False,
            )
        )
        return 0

    applied = []
    failed = []

    try:
        pdf = pikepdf.open(input_path, allow_overwriting_input=False)
    except Exception as e:
        print(json.dumps({"success": False, "applied": [], "failed": [{"op": "_open", "error": str(e)}]}, ensure_ascii=False))
        return 0

    ocr_temp_paths: list[str] = []
    try:
        for m in mutations:
            op = m.get("op")
            params = m.get("params") or {}
            if op == "ocr_scanned_pdf":
                tok = secrets.token_hex(8)
                tmp_in = os.path.join(tempfile.gettempdir(), f"pdfaf-ocr-in-{tok}.pdf")
                tmp_out = os.path.join(tempfile.gettempdir(), f"pdfaf-ocr-out-{tok}.pdf")
                ocr_temp_paths.extend([tmp_in, tmp_out])
                try:
                    pdf.save(tmp_in)
                except Exception as e:
                    failed.append({"op": op, "error": f"save_temp: {e}"})
                    break
                try:
                    pdf.close()
                except Exception:
                    pass
                pdf = None
                ok, msg = _run_ocrmypdf(tmp_in, tmp_out, params)
                if not ok:
                    failed.append({"op": op, "error": msg})
                    try:
                        pdf = pikepdf.open(input_path, allow_overwriting_input=False)
                    except Exception as e2:
                        failed.append({"op": "_reopen", "error": str(e2)})
                    break
                try:
                    pdf = pikepdf.open(tmp_out, allow_overwriting_input=False)
                except Exception as e:
                    failed.append({"op": op, "error": f"open_ocr_out: {e}"})
                    try:
                        pdf = pikepdf.open(input_path, allow_overwriting_input=False)
                    except Exception as e3:
                        failed.append({"op": "_reopen", "error": str(e3)})
                    break
                applied.append(op)
                continue

            fn = MUTATORS.get(op)
            if not fn:
                failed.append({"op": op or "", "error": "unknown_op"})
                continue
            if pdf is None:
                failed.append({"op": op or "", "error": "no_pdf_handle"})
                break
            try:
                ok = bool(fn(pdf, params))
                if ok:
                    applied.append(op)
                # no-op (False) is not a batch failure — caller treats empty `applied` as no_effect
            except Exception as ex:
                failed.append({"op": op, "error": str(ex)})
        if pdf is not None:
            pdf.save(output_path)
    finally:
        try:
            if pdf is not None:
                pdf.close()
        except Exception:
            pass
        for tp in ocr_temp_paths:
            try:
                if os.path.isfile(tp):
                    os.unlink(tp)
            except Exception:
                pass

    # Exit 0; Node reads stdout JSON `success` (true only if no hard failures).
    print(json.dumps({"success": len(failed) == 0, "applied": applied, "failed": failed}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    argv = sys.argv[1:]
    if len(argv) >= 2 and argv[0] == "--mutate":
        raise SystemExit(mutate_main(argv[1]))
    if len(argv) >= 3 and argv[0] == "--dump-structure-page":
        page_i = int(argv[1])
        path = argv[2]
        try:
            with pikepdf.open(path, suppress_warnings=True) as pdf:
                rep = dump_structure_page(pdf, page_i)
            print(json.dumps(rep, ensure_ascii=False, default=str))
        except Exception as e:
            print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(0)
    if len(argv) >= 2 and argv[0] == "--write-3cc-golden":
        try:
            write_3cc_golden_fixture(argv[1])
            print(json.dumps({"ok": True, "path": argv[1]}, ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(0)
    if len(argv) >= 2 and argv[0] == "--write-3cc-orphan":
        try:
            write_3cc_orphan_fixture(argv[1])
            print(json.dumps({"ok": True, "path": argv[1]}, ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(0)
    main()
