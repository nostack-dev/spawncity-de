#!/usr/bin/env python3
"""Offline parser contract; fixture never becomes the published city."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from build_native_osm_snapshot import convert_osm, bbox, LON, LAT

nodes = []
ways = []
next_id = 100
for i in range(5):
    ids = []
    x = LON + i * 0.00002
    y = LAT + i * 0.00002
    for dx, dy in ((0, 0), (0.00001, 0), (0.00001, 0.00001), (0, 0.00001)):
        nodes.append(f'<node id="{next_id}" lon="{x+dx}" lat="{y+dy}"/>')
        ids.append(next_id)
        next_id += 1
    nds = "".join(f'<nd ref="{v}"/>' for v in ids + ids[:1])
    ways.append(f'<way id="{500+i}">{nds}<tag k="building" v="yes"/>'
                f'<tag k="building:levels" v="4"/></way>')
for i in range(2):
    nds = f'<nd ref="{100+i*4}"/><nd ref="{101+i*4}"/>'
    ways.append(f'<way id="{700+i}">{nds}<tag k="highway" v="residential"/></way>')
xml = ('<osm version="0.6">' + "".join(nodes + ways) + "</osm>").encode()
data = convert_osm(xml, "https://api.openstreetmap.org/api/0.6/map?bbox=test")
assert data["source"] == "openstreetmap-api-0.6"
assert data["synthetic"] is False
assert data["origin"] == {"lon": LON, "lat": LAT}
assert len(data["elements"]) == 7
assert sum("building" in w["tags"] for w in data["elements"]) == 5
assert sum("highway" in w["tags"] for w in data["elements"]) == 2
assert all(len(w["geometry"]) >= 2 for w in data["elements"])
assert len(bbox().split(",")) == 4

try:
    convert_osm(b"<fake/>", "https://api.openstreetmap.org/")
except RuntimeError:
    pass
else:
    raise AssertionError("Provider XML must be genuine OSM root")

try:
    convert_osm(b'<osm version="0.6"><node id="1" lat="0" lon="0"/></osm>',
                "https://api.openstreetmap.org/")
except RuntimeError:
    pass
else:
    raise AssertionError("Never publish an empty/synthetic city")
print("OSM snapshot builder validates authentic way/tag/node structure and fails closed")
