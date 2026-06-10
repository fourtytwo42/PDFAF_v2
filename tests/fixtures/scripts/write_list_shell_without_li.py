#!/usr/bin/env python3
"""Emit a minimal tagged PDF with /L shells that have no direct /LI children."""
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
    outer_list = pdf.make_indirect(
        pikepdf.Dictionary(Type=pikepdf.Name("/StructElem"), S=pikepdf.Name("/L"), P=doc_elem)
    )
    nested_list = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/StructElem"),
            S=pikepdf.Name("/L"),
            P=outer_list,
            K=pikepdf.Array([7]),
        )
    )
    section = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/StructElem"),
            S=pikepdf.Name("/Sect"),
            P=outer_list,
            K=pikepdf.Array(),
        )
    )
    outer_list["/K"] = pikepdf.Array([nested_list, section, 4])
    doc_elem["/K"] = pikepdf.Array([outer_list])
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
        print("usage: write_list_shell_without_li.py <out.pdf>", file=sys.stderr)
        sys.exit(2)
    main(Path(sys.argv[1]))
