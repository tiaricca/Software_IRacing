"""Build a Shadow Lap reference from OpenStreetMap raceway geometry.

Pipeline: OSM ways -> chained lap polyline -> 4 m resampling -> curvature
-> simple point-mass speed profile -> curated corners with timing/intensity.

Timing is an ESTIMATE from a simplified vehicle model, not a real lap.
It will be replaced by .ibt telemetry once available.

Usage: python tools/build_track.py
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OSM_FILE = ROOT / "tools" / "data" / "oulton-park.osm.json"
OUT_FILE = ROOT / "web" / "data" / "oulton-international.json"

G = 9.81
STEP = 4.0  # resampling step, metres

# --- Track definition -------------------------------------------------------

START_WAY = 820427217  # Old Hall Corner (lap distance 0)
# Branches not used by the International layout: Foster's link,
# Island Hairpin, Britten's bypass, pit lane, two unrelated outlines.
EXCLUDED_WAYS = {29187915, 27299255, 450023909, 721714385, 848296254, 1265663568}
FINISH_LINE_M = 4180  # approximate start/finish line on the pit straight

# Curated corners: distance ranges come from the curvature analysis.
# A corner may group several curvature segments (e.g. Druids double apex).
CORNERS = [
    ("T1", "Old Hall", "R", (20, 150), False,
     "Destra a media velocità in fondo al rettilineo dei box. Prima frenata importante del giro."),
    ("T2", "Denton's", "R", (385, 455), True,
     "Piega a destra veloce dopo The Avenue: cieca, la pista scende. In pieno."),
    ("T3", "Cascades", "L", (515, 712), False,
     "Sinistra veloce in discesa. Riferimento di frenata sull'avvallamento in ingresso."),
    ("T4", "Island Bend", "L", (1135, 1356), False,
     "Sinistra lunga e molto veloce. Tieni la destra in ingresso."),
    ("T5", "Shell Oils", "R", (1405, 1568), False,
     "Tornante a destra sopraelevato (11°, il più inclinato del Regno Unito). Doppio apice."),
    ("T6", "Verso Britten's", "R", (1688, 1820), True,
     "Piega a destra in avvicinamento alla chicane."),
    ("T7", "Britten's (1)", "L", (1848, 1886), False,
     "Chicane Britten's: primo cambio a sinistra, in frenata."),
    ("T8", "Britten's (2)", "R", (1887, 1930), False,
     "Chicane Britten's: destra stretta, il punto più lento della chicane."),
    ("T9", "Britten's (3)", "L", (1940, 1988), False,
     "Uscita sinistra da Britten's verso il rettilineo Hilltop: trazione progressiva."),
    ("T10", "Hislop's (1)", "R", (2404, 2446), False,
     "Fine di Hilltop, frenata forte: chicane Hislop's, prima a destra..."),
    ("T11", "Hislop's (2)", "L", (2447, 2504), False,
     "...poi a sinistra. Pazienza con il gas."),
    ("T12", "Knickerbrook", "R", (2564, 2636), False,
     "Destra lenta subito dopo Hislop's, poi salita verso Clay Hill."),
    ("T13", "Clay Hill", "L", (2830, 2866), True,
     "Piega a sinistra in salita, in pieno. Apice ritardato."),
    ("T14", "Water Tower", "L", (3050, 3104), True,
     "Piega a sinistra: resta a sinistra per preparare Druids."),
    ("T15", "Druids", "R", (3196, 3348), False,
     "Destra lunga a doppio apice. Non esagerare in ingresso, conta l'uscita."),
    ("T16", "Lodge", "R", (3748, 3868), False,
     "Destra a 90° con cambio di pendenza. Apice ritardato, attenzione al sovrasterzo in uscita."),
    ("T17", "Deer Leap", "L", (3964, 4048), True,
     "Piega a sinistra sul rettilineo d'arrivo. Tieni l'interno."),
]

# --- Simplified Ray FF1600 model (estimates) -------------------------------

MU_LAT = 1.5         # lateral grip, g
BRAKE_G = 1.3        # peak braking, g
TRACTION_G = 0.55    # traction-limited acceleration, g
POWER_PER_KG = 150   # W/kg at the wheels (approx.)
DRAG_K = 0.00094     # aero drag accel coefficient, 1/m
V_MAX = 51.0         # m/s, gearing-limited top speed (~184 km/h)


def load_lap():
    data = json.loads(OSM_FILE.read_text(encoding="utf-8"))
    ways = {e["id"]: e for e in data["elements"] if e["type"] == "way"}

    def key(p):
        return (round(p["lat"], 7), round(p["lon"], 7))

    starts = {}
    for w in ways.values():
        if w["id"] not in EXCLUDED_WAYS:
            starts.setdefault(key(w["geometry"][0]), []).append(w["id"])

    seq, cur = [], START_WAY
    while True:
        seq.append(cur)
        nxt = starts.get(key(ways[cur]["geometry"][-1]), [])
        if len(nxt) != 1:
            raise SystemExit(f"Ambiguous or missing link after way {cur}: {nxt}")
        cur = nxt[0]
        if cur == START_WAY:
            break
        if len(seq) > 100:
            raise SystemExit("Lap does not close")

    pts = []
    for wid in seq:
        g = [(p["lat"], p["lon"]) for p in ways[wid]["geometry"]]
        pts.extend(g if not pts else g[1:])
    lat0, lon0 = pts[0]
    r = 6371000.0
    return [((lon - lon0) * math.cos(math.radians(lat0)) * math.pi / 180 * r,
             (lat - lat0) * math.pi / 180 * r) for lat, lon in pts]


def resample(xy):
    cum = [0.0]
    for i in range(1, len(xy)):
        cum.append(cum[-1] + math.dist(xy[i - 1], xy[i]))
    length = cum[-1]
    out, j, s = [], 0, 0.0
    while s < length:
        while cum[j + 1] < s:
            j += 1
        t = (s - cum[j]) / (cum[j + 1] - cum[j])
        out.append((xy[j][0] + t * (xy[j + 1][0] - xy[j][0]),
                    xy[j][1] + t * (xy[j + 1][1] - xy[j][1])))
        s += STEP
    return out, length


def curvature(pts):
    n = len(pts)
    hd = [math.atan2(pts[(i + 1) % n][1] - pts[i][1], pts[(i + 1) % n][0] - pts[i][0])
          for i in range(n)]
    dh = [((hd[(i + 1) % n] - hd[i] + math.pi) % (2 * math.pi)) - math.pi for i in range(n)]
    k = 3
    smooth = [sum(dh[(i + o) % n] for o in range(-k, k + 1)) / (2 * k + 1) for i in range(n)]
    return [s / STEP for s in smooth], dh


def speed_profile(curv):
    n = len(curv)
    vlim = []
    for c in curv:
        v = math.sqrt(MU_LAT * G / abs(c)) if abs(c) > 1e-6 else V_MAX
        vlim.append(min(v, V_MAX))
    v = vlim[:]
    # Two passes around the closed loop so the start converges.
    for _ in range(2):
        for i in range(1, 2 * n):  # forward: acceleration
            a, b = (i - 1) % n, i % n
            acc = min(TRACTION_G * G, POWER_PER_KG / max(v[a], 5.0)) - DRAG_K * v[a] ** 2
            v[b] = min(vlim[b], math.sqrt(max(v[a] ** 2 + 2 * max(acc, 0.0) * STEP, 0.0)))
        for i in range(2 * n, 0, -1):  # backward: braking
            a, b = i % n, (i - 1) % n
            dec = BRAKE_G * G + DRAG_K * v[a] ** 2
            v[b] = min(v[b], math.sqrt(v[a] ** 2 + 2 * dec * STEP))
    return v


def intensity(min_radius):
    if min_radius < 32:
        return "large"
    if min_radius < 70:
        return "medium"
    if min_radius < 160:
        return "small"
    return "minor"


def main():
    pts, length = resample(load_lap())
    n = len(pts)
    curv, dh = curvature(pts)
    v = speed_profile(curv)

    # Shift so lap distance 0 is the finish line.
    shift = int(FINISH_LINE_M / STEP)

    def lap_index(dist_from_old_hall):
        return (int(dist_from_old_hall / STEP) - shift) % n

    order = [(i + shift) % n for i in range(n)]
    t_at = [0.0] * n
    t = 0.0
    for k in range(n):
        i = order[k]
        t_at[i] = t
        t += STEP / max(v[i], 1.0)
    lap_time = t

    corners = []
    for cid, name, direction, (a, b), minor, note in CORNERS:
        idx = list(range(int(a / STEP), int(b / STEP) + 1))
        sign = sum(dh[i] for i in idx)
        if (sign < 0) != (direction == "R"):
            raise SystemExit(f"{cid} direction mismatch with geometry")
        min_r = min(1 / max(abs(curv[i]), 1e-6) for i in idx)
        apex = min(idx, key=lambda i: v[i])
        start_i, end_i = idx[0], idx[-1]
        # Braking: walk back from the corner while the car is decelerating.
        brake_i, j = None, start_i
        while v[(j - 1) % n] > v[j % n] + 0.05:
            j -= 1
            brake_i = j % n
        if brake_i is not None and v[brake_i] - v[apex] < 4:
            brake_i = None  # just a lift, not a real braking zone
        dur = sum(STEP / max(v[i], 1.0) for i in idx)
        corners.append({
            "id": cid,
            "name": name,
            "dir": direction,
            "minor": minor,
            "intensity": intensity(min_r),
            "angleDeg": round(abs(math.degrees(sign))),
            "minRadiusM": round(min_r),
            "apexKph": round(v[apex] * 3.6),
            "t": round(t_at[start_i], 2),
            "duration": round(dur, 2),
            "brakeT": round(t_at[brake_i], 2) if brake_i is not None else None,
            "pathIndex": lap_index(((start_i + end_i) / 2) * STEP),
            "note": note,
        })

    # Map path in finish-line order, normalised into a 1000-wide box, north up.
    ordered = [pts[i] for i in order]
    xs, ys = [p[0] for p in ordered], [p[1] for p in ordered]
    scale = 1000 / max(max(xs) - min(xs), max(ys) - min(ys))
    path = [[round((x - min(xs)) * scale, 1), round((max(ys) - y) * scale, 1)] for x, y in ordered]

    out = {
        "id": "oulton-international-ff1600",
        "simulator": "iRacing",
        "track": "Oulton Park",
        "layout": "International",
        "car": "Ray FF1600",
        "lengthM": round(length),
        "direction": "clockwise",
        "refLapTime": round(lap_time, 2),
        "sources": {
            "geometry": "© OpenStreetMap contributors (ODbL)",
            "timing": "Stima da modello fisico semplificato, non un giro reale",
        },
        "corners": corners,
        "path": path,
        "pathT": [round(t_at[i], 2) for i in order],
    }
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    m, s = divmod(lap_time, 60)
    print(f"Length {length:.0f} m, estimated lap {int(m)}:{s:06.3f}")
    for c in corners:
        brake = f"brake@{c['brakeT']:6.2f}" if c["brakeT"] is not None else " " * 12
        print(f"{c['id']:4s} {c['name']:16s} {c['dir']} {c['intensity']:6s} "
              f"{c['angleDeg']:4d}° R{c['minRadiusM']:4d}  {c['apexKph']:3d} km/h  "
              f"t={c['t']:6.2f} {brake}")


if __name__ == "__main__":
    main()
