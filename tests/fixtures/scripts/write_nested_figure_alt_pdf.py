#!/usr/bin/env python3
import sys

import pikepdf


def main(out_path: str) -> None:
    pdf = pikepdf.Pdf.new()
    page = pdf.add_blank_page(page_size=(612, 792))
    font_dict = pikepdf.Dictionary(
        Type=pikepdf.Name("/Font"),
        Subtype=pikepdf.Name("/Type1"),
        BaseFont=pikepdf.Name("/Helvetica"),
    )
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font_dict))
    page.Contents = pdf.make_stream(
        b"/P << /MCID 0 >> BDC\nBT /F1 18 Tf 72 720 Td (Figure text) Tj ET\nEMC\n"
    )

    doc_elem = pdf.make_indirect(
        pikepdf.Dictionary(Type=pikepdf.Name("/StructElem"), S=pikepdf.Name("/Document"))
    )
    inner_figure = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/StructElem"),
            S=pikepdf.Name("/Figure"),
            Alt=pikepdf.String("Inner alt"),
            K=0,
            Pg=page.obj,
        )
    )
    outer_figure = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/StructElem"),
            S=pikepdf.Name("/Figure"),
            Alt=pikepdf.String("Outer alt"),
            K=pikepdf.Array([inner_figure]),
            Pg=page.obj,
            P=doc_elem,
        )
    )
    inner_figure["/P"] = outer_figure
    doc_elem["/K"] = pikepdf.Array([outer_figure])
    parent_tree = pikepdf.Dictionary(Nums=pikepdf.Array([0, inner_figure]))
    struct_root = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/StructTreeRoot"),
            K=pikepdf.Array([doc_elem]),
            ParentTree=parent_tree,
        )
    )
    pdf.Root["/StructTreeRoot"] = struct_root
    pdf.Root["/MarkInfo"] = pikepdf.Dictionary(Marked=True, Suspects=False)
    pdf.Root["/Lang"] = pikepdf.String("en-US")
    pdf.save(out_path)


if __name__ == "__main__":
    main(sys.argv[1])
