"""Convert the three-column school schedule workbook to validated import JSON."""
import argparse
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
        strings = ["".join(t.text or "" for t in item.findall(".//s:t", ns))
                   for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("s:si", ns)]
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    first_sheet = workbook.find("s:sheets", ns)[0]
    relationship = first_sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target = next(r.get("Target") for r in rels if r.get("Id") == relationship)
    sheet_path = target.lstrip("/") if target.startswith("/") else "xl/" + target
    root = ET.fromstring(archive.read(sheet_path))
    rows = []
    for row in root.findall("s:sheetData/s:row", ns):
        values = {}
        for cell in row.findall("s:c", ns):
            if cell.find("s:f", ns) is not None:
                raise ValueError(f"Formula is not allowed in {cell.get('r')}")
            value = cell.find("s:v", ns)
            value = value.text if value is not None else ""
            if cell.get("t") == "s":
                value = strings[int(value)]
            elif cell.get("t") == "inlineStr":
                value = "".join(t.text or "" for t in cell.findall(".//s:t", ns))
            values[re.sub(r"\d", "", cell.get("r"))] = (value or "").strip()
        if any(values.values()):
            rows.append((int(row.get("r")), values))
    headers = rows.pop(0)[1] if rows else {}
    if "id" not in headers.get("A", "").lower() or "id" not in headers.get("B", "").lower():
        raise ValueError("Expected: Child ID, Specialist ID, Week day")
    data = [{"row": number, "clientId": values.get("A", ""), "specialistId": values.get("B", ""),
             "weekDay": values.get("C", "")} for number, values in rows]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"source": Path(args.file).name, "rows": data}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Prepared {len(data)} rows: {output}")
