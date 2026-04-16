#!/usr/bin/env python3
"""Emit a minimal tagged PDF: /LI is direct child of /Document (invalid; Acrobat List items)."""
from __future__ import annotations

import sys
from pathlib import Path

import pikepdf


def main(out: Path) -> None:
    pdf = pikepdf.Pdf.new()
    pdf.add_blank_page(page_size=(612, 792))

    doc_elem = pdf.make_indirect(
        pikepdf.Dictionary(Type=pikepdf.Name("/StructElem"), S=pikepdf.Name("/Document"))
    )
    li_elem = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/StructElem"),
            S=pikepdf.Name("/LI"),
            P=doc_elem,
            K=pikepdf.Array(),
        )
    )
    doc_elem["/K"] = pikepdf.Array([li_elem])
    str_root = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/StructTreeRoot"),
            K=pikepdf.Array([doc_elem]),
            ParentTree=pikepdf.Dictionary(Nums=pikepdf.Array([])),
        )
    )
    pdf.Root["/StructTreeRoot"] = str_root
    pdf.Root["/MarkInfo"] = pikepdf.Dictionary(Marked=True, Suspects=False)

    pdf.save(out)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: write_list_li_wrong_parent.py <out.pdf>", file=sys.stderr)
        sys.exit(2)
    main(Path(sys.argv[1]))
