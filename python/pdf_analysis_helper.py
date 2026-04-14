#!/usr/bin/env python3
"""
PDF Analysis Helper — read-only structural analysis via pikepdf.

Usage: python3 pdf_analysis_helper.py <pdf_path>

Outputs a single JSON object to stdout. Errors/warnings go to stderr.
Exit 0 always (errors produce empty/partial results, never crash the caller).
"""

import sys
import json
import re
from collections import deque

try:
    import pikepdf
except ImportError:
    print(json.dumps({
        "error": "pikepdf not installed",
        "isTagged": False, "markInfo": None, "lang": None,
        "pdfUaVersion": None, "headings": [], "figures": [],
        "tables": [], "fonts": [], "bookmarks": [], "formFields": [],
        "structureTree": None,
    }))
    sys.exit(0)

MAX_ITEMS = 2000  # cap per collection to avoid runaway on malformed trees

# ─── Helpers ─────────────────────────────────────────────────────────────────

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

        # MarkInfo → isTagged
        mi = root.get("/MarkInfo")
        if mi is not None:
            marked = mi.get("/Marked")
            result["isTagged"] = bool(marked)
            result["markInfo"] = {"Marked": bool(marked)}

        # Structure tree presence also counts as tagged
        if root.get("/StructTreeRoot") is not None:
            result["isTagged"] = True
            if result["markInfo"] is None:
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
    struct_tree_json = None

    try:
        root = pdf.Root
        str_root = root.get("/StructTreeRoot")
        if str_root is None:
            return {"headings": headings, "figures": figures,
                    "tables": tables_out, "formFields": form_fields,
                    "structureTree": None}

        # Build a minimal JSON struct tree for reading-order heuristic (depth-limited)
        struct_tree_json = _build_mini_tree(str_root, depth=0, max_depth=4)

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
                    text = _extract_text_from_elem(elem)
                    headings.append({"level": level, "text": text, "page": page})

                # Figures
                elif tag == "Figure" and len(figures) < MAX_ITEMS:
                    alt = get_alt(elem)
                    is_artifact = _is_artifact(elem)
                    figures.append({
                        "hasAlt": alt is not None and len(alt) > 0,
                        "altText": alt,
                        "isArtifact": is_artifact,
                        "page": page,
                    })

                # Tables
                elif tag == "Table" and len(tables_out) < MAX_ITEMS:
                    th_count, td_count = _count_table_cells(elem)
                    tables_out.append({
                        "hasHeaders": th_count > 0,
                        "headerCount": th_count,
                        "totalCells": th_count + td_count,
                        "page": page,
                    })

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
    """Count /TH and /TD cells in a table element (BFS, shallow)."""
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

                        fonts.append({
                            "name": base_font,
                            "isEmbedded": is_embedded,
                            "hasUnicode": has_unicode,
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
        "structureTree": None,
    }

    try:
        pdf = pikepdf.open(pdf_path, suppress_warnings=True)

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

        # Fonts
        result["fonts"] = extract_fonts(pdf)

        # Bookmarks
        result["bookmarks"] = extract_bookmarks(pdf)

        # AcroForm fields (supplement tagged form fields)
        acro = extract_acroform_fields(pdf)
        if acro and not result["formFields"]:
            result["formFields"] = acro

        pdf.close()

    except pikepdf.PasswordError:
        print("[warn] PDF is password-protected; returning empty analysis", file=sys.stderr)
    except Exception as e:
        print(f"[warn] PDF open/parse failed: {e}", file=sys.stderr)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
