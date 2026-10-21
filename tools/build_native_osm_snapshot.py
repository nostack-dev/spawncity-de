#!/usr/bin/env python3
"""Fetch actual OSM ways once on the GitHub runner for same-origin Pages use.

Never fabricates buildings, roads or coordinates. A provider failure fails the
preview publication rather than shipping a blank or invented city.
"""
import datetime
import json
import math
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

LON, LAT = 9.17442, 47.66022  # explicitly labelled Konstanz OSM demo
RADIUS_METRES = 400
API = "https://api.openstreetmap.org/api/0.6/map"


def bbox():
    delta_lat = RADIUS_METRES / 111_320
    delta_lon = delta_lat / math.cos(math.radians(LAT))
    return ",".join(f"{value:.7f}" for value in (
        LON - delta_lon, LAT - delta_lat, LON + delta_lon, LAT + delta_lat
    ))


def fetch_actual_osm():
    url = API + "?bbox=" + urllib.parse.quote(bbox(), safe=",.-")
    request = urllib.request.Request(url, headers={
        "User-Agent": "SpawnCity/1.0 (+https://spawncity.de; native OSM demo snapshot)",
        "Accept": "application/xml",
    })
    with urllib.request.urlopen(request, timeout=55) as response:
        if response.status != 200:
            raise RuntimeError(f"OpenStreetMap HTTP {response.status}")
        xml = response.read(18 * 1024 * 1024 + 1)
    if len(xml) > 18 * 1024 * 1024:
        raise RuntimeError("OpenStreetMap response exceeds safe limit")
    return xml, url


def convert_osm(xml, url):
    root = ET.fromstring(xml)
    if root.tag != "osm":
        raise RuntimeError("Provider did not return authentic OSM XML")
    nodes = {}
    for element in root.findall("node"):
        try:
            nodes[element.attrib["id"]] = {
                "lon": float(element.attrib["lon"]),
                "lat": float(element.attrib["lat"]),
            }
        except (ValueError, KeyError):
            continue

    elements = []
    seen = set()
    building_count = 0
    road_count = 0
    for way in root.findall("way"):
        tags = {
            tag.attrib["k"]: tag.attrib["v"]
            for tag in way.findall("tag")
            if "k" in tag.attrib and "v" in tag.attrib
        }
        building, road = bool(tags.get("building")), bool(tags.get("highway"))
        water = bool(tags.get("waterway")) or tags.get("natural") == "water"
        pasture = tags.get("landuse") in {"meadow", "grassland", "farmland"}
        # Ground areas drawn like production world_city_roads: parks, woods,
        # pitches, sand (native_ground_areas.mjs classifies them).
        area = (tags.get("leisure") in {"park", "garden", "pitch", "playground", "recreation_ground", "track", "dog_park"}
                or tags.get("landuse") in {"grass", "forest", "recreation_ground", "village_green", "cemetery", "allotments"}
                or tags.get("natural") in {"wood", "scrub", "sand", "beach", "grassland"})
        if not building and not road and not water and not pasture and not area:
            continue
        refs = [nd.attrib.get("ref") for nd in way.findall("nd")]
        if any(ref not in nodes for ref in refs):
            continue
        if building and (len(refs) < 4 or refs[0] != refs[-1]):
            continue
        if not building and len(refs) < 2:
            continue
        wid = way.attrib.get("id")
        if not wid or wid in seen:
            continue
        seen.add(wid)
        geometry = [nodes[ref] for ref in refs]
        elements.append({"type": "way", "id": int(wid), "tags": tags, "geometry": geometry})
        building_count += int(building)
        road_count += int(not building and road)

    if building_count < 5 or road_count < 2:
        raise RuntimeError(
            f"Real OSM response insufficient: {building_count} buildings, {road_count} roads"
        )
    return {
        "origin": {"lon": LON, "lat": LAT},
        "source": "openstreetmap-api-0.6",
        "sourceUrl": url,
        "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "synthetic": False,
        "elements": elements,
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: build_native_osm_snapshot.py DESTINATION.json")
    xml, url = fetch_actual_osm()
    snapshot = convert_osm(xml, url)
    dest = Path(sys.argv[1])
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(snapshot, separators=(",", ":")) + "\n", encoding="utf-8")
    print("Actual OSM same-origin snapshot:", len(snapshot["elements"]),
          "ways from", url, "=>", dest)


if __name__ == "__main__":
    main()
