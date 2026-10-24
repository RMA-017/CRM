"""Read a headerless workbook: lesson date, child ID, specialist ID."""
import argparse
import datetime
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("file")
parser.add_argument("output")
args = parser.parse_args()
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(args.file) as archive:
    strings = []
    if "xl/sharedStrings.xml" in archive.namelist():
        strings = ["".join(t.text or "" for t in si.findall(".//s:t", ns))
                   for si in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", ns)]
    book = ET.fromstring(archive.read("xl/workbook.xml"))
    sheet = book.find("s:sheets", ns)[0]
    rel_id = sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
    target = next(r.get("Target") for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels")) if r.get("Id") == rel_id)
    sheet_path = target.lstrip("/") if target.startswith("/") else "xl/" + target
    props = book.find("s:workbookPr", ns)
    epoch = datetime.datetime(1904, 1, 1) if props is not None and props.get("date1904") in ("1", "true") else datetime.datetime(1899, 12, 30)
    rows = []
    for row in ET.fromstring(archive.read(sheet_path)).findall("s:sheetData/s:row", ns):
        values = {}
        for cell in row.findall("s:c", ns):
            if cell.find("s:f", ns) is not None:
                raise ValueError(f"Formula in {cell.get('r')}; use values only")
            value = cell.find("s:v", ns)
            value = value.text if value is not None else ""
            if cell.get("t") == "s":
                value = strings[int(value)]
            elif cell.get("t") == "inlineStr":
                value = "".join(t.text or "" for t in cell.findall(".//s:t", ns))
            values[re.sub(r"\d", "", cell.get("r"))] = (value or "").strip()
        if not any(values.values()):
            continue
        date = values.get("A", "")
        if re.fullmatch(r"\d+(?:\.\d+)?", date):
            date = (epoch + datetime.timedelta(days=float(date))).date().isoformat()
        else:
            for pattern in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
                try:
                    date = datetime.datetime.strptime(date, pattern).date().isoformat()
                    break
                except ValueError:
                    pass
        rows.append({"row": int(row.get("r")), "date": date,
                     "clientId": values.get("B", ""), "specialistId": values.get("C", "")})
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"source": Path(args.file).name, "rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Prepared {len(rows)} journal rows: {output}")
