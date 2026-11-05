// LOW VISIBILITY — map layout. Pure data (no rendering), so it can be checked outside the game.
// x = east, z = south. Roads are smoothed polylines; houses face the street they sit on.

const ROAD_DEFS = [
  { name: 'MLK BLVD', w: 15, median: true, pts: [[-8, 215], [-14, 140], [-6, 60], [8, -15], [20, -95], [12, -160], [4, -215]] },
  { name: 'JACKSON AVE', w: 11, pts: [[-215, 52], [-130, 50], [-62, 38], [-6, 42], [66, 30], [130, 44], [215, 36]] },
  { name: 'LAKE MEAD BLVD', w: 12, pts: [[-215, -92], [-112, -104], [-40, -86], [18, -94], [92, -110], [215, -100]] },
  { name: 'H ST', w: 9, pts: [[-62, 38], [-72, 84], [-98, 116], [-134, 110], [-148, 76], [-130, 50]] },
  { name: 'D ST', w: 9, pts: [[-130, 50], [-150, 2], [-138, -52], [-112, -104]] },
  { name: 'F ST', w: 9, pts: [[66, 30], [78, 76], [100, 116], [136, 128], [190, 158]] },
  { name: 'C ST', w: 9, pts: [[8, -15], [56, -26], [104, -14], [136, -40], [140, -80], [92, -110]] },
  { name: 'CAREY AVE', w: 8, culdesac: true, pts: [[-6, 112], [34, 116], [70, 132], [88, 142]] },
  { name: 'OWENS AVE', w: 8, culdesac: true, pts: [[40, -90], [46, -124], [52, -146]] },
  { name: 'A ST', w: 8, culdesac: true, pts: [[-112, -104], [-114, -126], [-100, -138]] },
  { name: 'WASHINGTON AVE', w: 9, pts: [[-12, 100], [-40, 104], [-72, 84]] },
  { name: 'HARRISON AVE', w: 9, pts: [[66, 30], [110, -2], [146, -42]] },
  { name: 'MONROE AVE', w: 9, pts: [[-150, 2], [-100, -12], [-50, -4], [8, -15]] },
  { name: 'E ST', w: 8, culdesac: true, pts: [[-40, -86], [-36, -60], [-26, -40]] },
  { name: 'BONANZA RD', w: 8, culdesac: true, pts: [[79, 78], [52, 86], [28, 92]] },
  { name: 'G ST', w: 8, culdesac: true, pts: [[-150, 2], [-118, 18], [-92, 20]] },
];

export function makeLayout(THREE, seed = 11) {
  let s0 = seed; const rnd = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];

  // ---------- border (quarantine fence) ----------
  const border = [];
  for (let i = 0; i < 44; i++) { const a = i / 44 * Math.PI * 2; const r = 172 + 9 * Math.sin(3 * a + 1) + 6 * Math.cos(5 * a + .5) + 3 * Math.sin(9 * a); border.push({ x: Math.cos(a) * r, z: Math.sin(a) * r }); }
  function insideBorder(x, z, margin = 0) {
    let inside = false;
    for (let i = 0, j = border.length - 1; i < border.length; j = i++) { const a = border[i], b = border[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside; }
    if (!inside) return false; if (!margin) return true;
    return distToBorder(x, z) > margin;
  }
  function distToBorder(x, z) { let best = 1e9; for (let i = 0, j = border.length - 1; i < border.length; j = i++) { const a = border[j], b = border[i]; const dx = b.x - a.x, dz = b.z - a.z; const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz))); const ex = a.x + dx * t - x, ez = a.z + dz * t - z; best = Math.min(best, Math.hypot(ex, ez)); } return best; }

  // ---------- roads ----------
  const roads = ROAD_DEFS.map((d, idx) => {
    const curve = new THREE.CatmullRomCurve3(d.pts.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal', .5);
    const L = curve.getLength(); const n = Math.max(2, Math.round(L / 2)); const P = curve.getSpacedPoints(n);
    const samples = P.map((p, k) => { const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl; return { x: p.x, z: p.z, tx, tz, nx: -tz, nz: tx, s: k * L / n }; });
    return { ...d, idx, L, samples, end: samples[samples.length - 1] };
  });
  // spatial hash of road samples
  const CELL = 8, hash = new Map();
  const key = (i, j) => i * 10007 + j;
  for (const r of roads) for (const sm of r.samples) { const k = key(Math.floor(sm.x / CELL), Math.floor(sm.z / CELL)); if (!hash.has(k)) hash.set(k, []); hash.get(k).push([r, sm]); }
  const bulbs = roads.filter(r => r.culdesac).map(r => ({ x: r.end.x, z: r.end.z, r: 11, road: r }));
  // distance from (x,z) to the paved edge of the nearest road (negative = on the road)
  function roadEdgeDist(x, z, except) {
    let best = 99, near = null; const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let i = ci - 3; i <= ci + 3; i++) for (let j = cj - 3; j <= cj + 3; j++) { const l = hash.get(key(i, j)); if (!l) continue; for (const [r, sm] of l) { if (r === except) continue; const d = Math.hypot(sm.x - x, sm.z - z) - r.w / 2; if (d < best) { best = d; near = r; } } }
    for (const b of bulbs) { if (b.road === except) continue; const d = Math.hypot(b.x - x, b.z - z) - b.r; if (d < best) { best = d; near = b.road; } }
    return { d: best, road: near };
  }
  function nearestRoads(x, z) {
    const seen = new Map(); const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let i = ci - 6; i <= ci + 6; i++) for (let j = cj - 6; j <= cj + 6; j++) { const l = hash.get(key(i, j)); if (!l) continue; for (const [r, sm] of l) { const d = Math.hypot(sm.x - x, sm.z - z); if (!seen.has(r) || seen.get(r) > d) seen.set(r, d); } }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([r, d]) => ({ name: r.name, d }));
  }
  // intersections: where two roads' centerlines meet
  const intersections = [];
  for (let a = 0; a < roads.length; a++) for (let b = a + 1; b < roads.length; b++) {
    for (const sa of roads[a].samples) for (const sb of roads[b].samples) {
      if (Math.abs(sa.x - sb.x) > 2.2 || Math.abs(sa.z - sb.z) > 2.2) continue;
      const p = { x: (sa.x + sb.x) / 2, z: (sa.z + sb.z) / 2, a: roads[a], b: roads[b] };
      if (!intersections.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 14)) intersections.push(p);
    }
  }
  const nearIntersection = (x, z, pad) => intersections.some(q => Math.hypot(q.x - x, q.z - z) < pad);

  // ---------- footprints (oriented boxes) ----------
  const foot = [];
  function obbCorners(o) { const c = Math.cos(o.ry), s = Math.sin(o.ry), hw = o.w / 2, hd = o.d / 2; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => ({ x: o.cx + lx * c + lz * s, z: o.cz - lx * s + lz * c })); }
  function obbOverlap(A, B, pad = 0) {
    const ca = obbCorners({ ...A, w: A.w + pad, d: A.d + pad }), cb = obbCorners({ ...B, w: B.w + pad, d: B.d + pad });
    for (const o of [A, B]) { const c = Math.cos(o.ry), s = Math.sin(o.ry); for (const [ax, az] of [[c, -s], [s, c]]) { let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const p of ca) { const v = p.x * ax + p.z * az; a0 = Math.min(a0, v); a1 = Math.max(a1, v); } for (const p of cb) { const v = p.x * ax + p.z * az; b0 = Math.min(b0, v); b1 = Math.max(b1, v); } if (a1 < b0 || b1 < a0) return false; } }
    return true;
  }
  function footFree(o, roadPad = 2.4, borderPad = 6, footPad = 1.5) {
    const pts = obbCorners(o); pts.push({ x: o.cx, z: o.cz });
    // edge midpoints too, so long buildings can't straddle a road
    const cs = obbCorners(o); for (let i = 0; i < 4; i++) pts.push({ x: (cs[i].x + cs[(i + 1) % 4].x) / 2, z: (cs[i].z + cs[(i + 1) % 4].z) / 2 });
    for (const p of pts) { if (roadEdgeDist(p.x, p.z).d < roadPad) return false; if (!insideBorder(p.x, p.z, borderPad)) return false; }
    for (const f of foot) if (obbOverlap(o, f, footPad)) return false;
    return true;
  }
  const faceRy = (nx, nz) => Math.atan2(-nx, -nz); // model front (+z) faces direction -n (toward the road when n points away)
  function roadPoint(name, z, side) { // sample on road `name` closest to latitude z
    const r = roads.find(q => q.name === name); let best = r.samples[0]; for (const sm of r.samples) if (Math.abs(sm.z - z) < Math.abs(best.z - z)) best = sm;
    return { r, sm: best, nx: best.nx * side, nz: best.nz * side };
  }
  function roadPointX(name, x, side) { const r = roads.find(q => q.name === name); let best = r.samples[0]; for (const sm of r.samples) if (Math.abs(sm.x - x) < Math.abs(best.x - x)) best = sm; return { r, sm: best, nx: best.nx * side, nz: best.nz * side }; }
  function parcelFrom(rp, setback, w, d, kind) { const off = rp.r.w / 2 + 2.2 + setback + d / 2; return { cx: rp.sm.x + rp.nx * off, cz: rp.sm.z + rp.nz * off, w, d, ry: faceRy(rp.nx, rp.nz), kind, frontX: rp.sm.x + rp.nx * (rp.r.w / 2 + 2.2), frontZ: rp.sm.z + rp.nz * (rp.r.w / 2 + 2.2), nx: rp.nx, nz: rp.nz }; }

  // ---------- special parcels ----------
  const specials = [];
  function reserve(o) { foot.push(o); specials.push(o); return o; }
  // which side of MLK is west? normal (−tz, tx) on a northbound road points east… detect with a probe
  const sideToward = (name, z, wantX) => { const rp = roadPoint(name, z, 1); return Math.sign((rp.sm.x + rp.nx * 10) - rp.sm.x) === Math.sign(wantX) ? 1 : -1; };
  const sideTowardZ = (name, x, wantZ) => { const rp = roadPointX(name, x, 1); return Math.sign(rp.nz) === Math.sign(wantZ) ? 1 : -1; };
  const mall = reserve(parcelFrom(roadPoint('MLK BLVD', 128, sideToward('MLK BLVD', 128, -1)), 20, 42, 20.2, 'mall'));
  const gas = reserve(parcelFrom(roadPointX('JACKSON AVE', 34, sideTowardZ('JACKSON AVE', 34, 1)), 5, 20, 22.4, 'gas'));
  const apts = reserve(parcelFrom(roadPointX('JACKSON AVE', -32, sideTowardZ('JACKSON AVE', -32, -1)), 7, 30, 20.1, 'apartments'));
  const church = reserve(parcelFrom(roadPointX('LAKE MEAD BLVD', 62, sideTowardZ('LAKE MEAD BLVD', 62, 1)), 8, 13.4, 20, 'church'));
  const park = reserve({ cx: -112, cz: 85, w: 46, d: 40, ry: .2, kind: 'park' });
  const lots = [[112, -60], [-80, -48], [128, 88]].map(([x, z]) => reserve({ cx: x, cz: z, w: 38, d: 38, ry: 0, kind: 'lot' }));

  // ---------- houses along the streets ----------
  const HOUSE = { house1: 8.4, house2: 11.0, house3: 9.1 };
  const houses = [], driveways = [], yards = [], walls = [], plants = [], bins = [], mailboxes = [], parkedCars = [], neighborSpots = [];
  for (const r of roads) {
    if (r.name === 'MLK BLVD') continue;
    for (const side of [-1, 1]) {
      let s = 8 + rnd() * 6;
      while (s < r.L - 8) {
        const k = Math.min(r.samples.length - 1, Math.round(s / (r.L / (r.samples.length - 1))));
        const sm = r.samples[k];
        if (nearIntersection(sm.x, sm.z, r.w / 2 + 12)) { s += 3; continue; }
        const model = pick(['house1', 'house1', 'house2', 'house3', 'house3']); const d = HOUSE[model], w = 11;
        const nx = sm.nx * side, nz = sm.nz * side, setback = 4.6 + rnd() * 2;
        const off = r.w / 2 + 2.2 + setback;
        const o = { cx: sm.x + nx * (off + d / 2), cz: sm.z + nz * (off + d / 2), w, d, ry: faceRy(nx, nz), kind: 'house', model };
        if (footFree(o, 1.8, 4, .7)) {
          foot.push(o); houses.push(o);
          const c = Math.cos(o.ry), sn = Math.sin(o.ry);
          const L2W = (lx, lz) => ({ x: o.cx + lx * c + lz * sn, z: o.cz - lx * sn + lz * c });
          // garage is on the model's +x side; driveway runs from it to the curb
          const g0 = L2W(w / 2 - 2.0, d / 2), g1 = { x: sm.x + nx * (r.w / 2), z: sm.z + nz * (r.w / 2) };
          const gx = g0.x + (g1.x - g0.x) * 0, gz = g0.z;
          const dl = setback + 2.2; const dc = L2W(w / 2 - 2.0, d / 2 + dl / 2);
          driveways.push({ x: dc.x, z: dc.z, w: 3.2, d: dl, ry: o.ry });
          const yc = L2W(0, d / 2 + (setback) / 2 - .4); yards.push({ x: o.cx, z: o.cz, w: w + 2.5, d: d + setback + 1, ry: o.ry, ox: 0, oz: setback / 2 });
          if (rnd() < .4) { const cp = L2W(w / 2 - 2.0, d / 2 + setback * .55); parkedCars.push({ x: cp.x, z: cp.z, ry: o.ry + Math.PI / 2 + (rnd() < .5 ? 0 : Math.PI), drive: true }); }
          const pp = L2W(-w / 2 + 1.3, d / 2 + setback * .6); plants.push({ x: pp.x, z: pp.z, kind: rnd() < .55 ? 'palm' : rnd() < .5 ? 'yucca' : 'shrub' });
          if (rnd() < .5) { const sp = L2W(-w / 2 + 3.5, d / 2 + 1.2); plants.push({ x: sp.x, z: sp.z, kind: 'shrub' }); }
          if (rnd() < .6) { const bp = L2W(w / 2 - .2, d / 2 + setback + 1.0); bins.push({ x: bp.x, z: bp.z, ry: o.ry + (rnd() - .5) * .5 }); }
          if (rnd() < .5) { const mp = L2W(w / 2 - 4.3, d / 2 + setback + 1.2); mailboxes.push({ x: mp.x, z: mp.z, ry: o.ry }); }
          const ns = L2W(-1.5, d / 2 + 2.4); neighborSpots.push({ x: ns.x, z: ns.z, yaw: o.ry });
          // backyard wall: side walls + back wall (cinder block), checked against roads
          const back = 7 + rnd() * 2;
          for (const seg of [{ lx: -w / 2 - .2, lz: -d / 2 - back / 2, w: .25, d: back }, { lx: w / 2 + .2, lz: -d / 2 - back / 2, w: .25, d: back }, { lx: 0, lz: -d / 2 - back, w: w + .65, d: .25 }]) {
            const p = L2W(seg.lx, seg.lz); const wo = { cx: p.x, cz: p.z, w: seg.w, d: seg.d, ry: o.ry };
            const ok = obbCorners(wo).every(q => roadEdgeDist(q.x, q.z).d > 2.6 && insideBorder(q.x, q.z, 3)) && !specials.some(f => obbOverlap(wo, f, .5));
            if (ok) walls.push(wo);
          }
          s += w + 1.5 + rnd() * 3.5;
        } else s += 3;
      }
    }
  }
  // houses ringing the cul-de-sac bulbs
  for (const b of bulbs) {
    for (let k = 0; k < 7; k++) {
      const a = Math.atan2(b.road.end.tz, b.road.end.tx) - Math.PI * .75 + k * Math.PI * 1.5 / 6;
      const nx = Math.cos(a), nz = Math.sin(a); const model = pick(['house1', 'house3']), d = HOUSE[model], w = 11;
      const o = { cx: b.x + nx * (b.r + 7 + d / 2), cz: b.z + nz * (b.r + 7 + d / 2), w, d, ry: faceRy(nx, nz), kind: 'house', model };
      if (footFree(o, 2.4, 6, 1.2)) {
        foot.push(o); houses.push(o);
        const c = Math.cos(o.ry), sn = Math.sin(o.ry); const L2W = (lx, lz) => ({ x: o.cx + lx * c + lz * sn, z: o.cz - lx * sn + lz * c });
        const dc = L2W(w / 2 - 2, d / 2 + 4); driveways.push({ x: dc.x, z: dc.z, w: 3.2, d: 8, ry: o.ry });
        yards.push({ x: o.cx, z: o.cz, w: w + 2.5, d: d + 8, ry: o.ry, ox: 0, oz: 3.5 });
        const pp = L2W(-w / 2 + 1.3, d / 2 + 4); plants.push({ x: pp.x, z: pp.z, kind: pick(['palm', 'yucca', 'shrub']) });
        const ns = L2W(-1.5, d / 2 + 2.4); neighborSpots.push({ x: ns.x, z: ns.z, yaw: o.ry });
        if (rnd() < .5) { const cp = L2W(w / 2 - 2, d / 2 + 4.2); parkedCars.push({ x: cp.x, z: cp.z, ry: o.ry + Math.PI / 2, drive: true }); }
      }
    }
  }

  // drop wall pieces that ended up cutting through a neighbor's house
  for (let i = walls.length - 1; i >= 0; i--) { const w = walls[i]; if (houses.some(h => obbOverlap(w, h, -.4) && Math.hypot(h.cx - w.cx, h.cz - w.cz) > 1) && houses.filter(h => obbOverlap(w, h, -.4)).length > 0) { const own = houses.find(h => Math.hypot(h.cx - w.cx, h.cz - w.cz) < Math.max(h.w, h.d) * .5 + 10 && Math.abs(((h.ry - w.ry) % Math.PI + Math.PI) % Math.PI) < .01); if (houses.some(h => h !== own && obbOverlap(w, h, -.2))) walls.splice(i, 1); } }
  // ---------- street furniture ----------
  const streetlights = [], poles = [], shelters = [], crosswalks = [], lanes = [], curbCars = [], strandedCars = [];
  for (const r of roads) {
    let side = 1, nextLight = 10 + rnd() * 10, nextCar = 6 + rnd() * 20, nextPole = 5;
    for (let k = 0; k < r.samples.length; k++) {
      const sm = r.samples[k];
      if (!insideBorder(sm.x, sm.z, 3)) continue;
      const nearX = nearIntersection(sm.x, sm.z, r.w / 2 + 10);
      if (sm.s > nextLight && !nearX) { const px = sm.x + sm.nx * side * (r.w / 2 + 1.2), pz = sm.z + sm.nz * side * (r.w / 2 + 1.2); if (roadEdgeDist(px, pz, r).d > 2 && !foot.some(f => obbOverlap({ cx: px, cz: pz, w: 1, d: 1, ry: 0 }, f, 0))) streetlights.push({ x: px, z: pz, ax: -sm.nx * side, az: -sm.nz * side }); side = -side; nextLight = sm.s + 34 + rnd() * 12; }
      if (r.name !== 'MLK BLVD' && sm.s > nextCar && !nearX) { const sd = rnd() < .5 ? 1 : -1; const px = sm.x + sm.nx * sd * (r.w / 2 - 1.25), pz = sm.z + sm.nz * sd * (r.w / 2 - 1.25); curbCars.push({ x: px, z: pz, ry: Math.atan2(-sm.tz, sm.tx) + (rnd() < .5 ? 0 : Math.PI) }); nextCar = sm.s + 18 + rnd() * 40; }
      if ((r.name === 'JACKSON AVE' || r.name === 'LAKE MEAD BLVD') && sm.s > nextPole && !nearX) { const px = sm.x + sm.nx * (r.w / 2 + 2.6), pz = sm.z + sm.nz * (r.w / 2 + 2.6); if (!foot.some(f => obbOverlap({ cx: px, cz: pz, w: .6, d: .6, ry: 0 }, f, .3))) poles.push({ x: px, z: pz, road: r.name, tx: sm.tx, tz: sm.tz }); nextPole = sm.s + 30; }
    }
    // bus shelters on the arterials
    if (r.w >= 11) for (let f = .22; f < .9; f += .3) { const sm = r.samples[Math.floor(f * (r.samples.length - 1))]; if (!insideBorder(sm.x, sm.z, 10) || nearIntersection(sm.x, sm.z, 20)) continue; const sd = rnd() < .5 ? 1 : -1; const px = sm.x + sm.nx * sd * (r.w / 2 + 1.6), pz = sm.z + sm.nz * sd * (r.w / 2 + 1.6); const o = { cx: px, cz: pz, w: 3.6, d: 1.8, ry: faceRy(-sm.nx * sd, -sm.nz * sd) + Math.PI }; if (!foot.some(q => obbOverlap(o, q, .5))) { shelters.push(o); foot.push(o); } }
  }
  // crosswalk bars at each road where it meets another
  for (const q of intersections) for (const [r, o] of [[q.a, q.b], [q.b, q.a]]) {
    for (const dir of [-1, 1]) { let best = null, bd = 1e9; for (const sm of r.samples) { const d = Math.abs(Math.hypot(sm.x - q.x, sm.z - q.z) - (o.w / 2 + 3)); const ahead = ((sm.x - q.x) * r.samples[1].tx + (sm.z - q.z) * r.samples[1].tz); if (d < bd && Math.hypot(sm.x - q.x, sm.z - q.z) < o.w / 2 + 8) { const sgn = Math.sign((sm.x - q.x) * sm.tx + (sm.z - q.z) * sm.tz); if (sgn === dir) { bd = d; best = sm; } } } if (best && insideBorder(best.x, best.z, 2)) crosswalks.push({ x: best.x, z: best.z, tx: best.tx, tz: best.tz, w: r.w }); }
  }
  // a few cars abandoned in the lanes when the Haze rolled in
  for (const r of roads) if (r.w >= 9 && rnd() < .7) { const sm = r.samples[Math.floor((.25 + rnd() * .5) * (r.samples.length - 1))]; if (!insideBorder(sm.x, sm.z, 10) || nearIntersection(sm.x, sm.z, 18)) continue; const off = (rnd() - .5) * r.w * .4; strandedCars.push({ x: sm.x + sm.nx * off, z: sm.z + sm.nz * off, ry: Math.atan2(-sm.tz, sm.tx) + (rnd() - .5) * .9 }); }
  // MLK median palms
  const medianPalms = []; { const r = roads[0]; for (let k = 6; k < r.samples.length; k += 12) { const sm = r.samples[k]; if (insideBorder(sm.x, sm.z, 6) && !nearIntersection(sm.x, sm.z, 16)) medianPalms.push({ x: sm.x, z: sm.z }); } }

  // ---------- desert scatter in the empty ground ----------
  const scatter = [];
  for (let i = 0; i < 900 && scatter.length < 260; i++) {
    const x = (rnd() - .5) * 360, z = (rnd() - .5) * 360; if (!insideBorder(x, z, 4)) continue; if (roadEdgeDist(x, z).d < 3) continue;
    if (foot.some(f => obbOverlap({ cx: x, cz: z, w: 2, d: 2, ry: 0 }, f, .5))) continue;
    scatter.push({ x, z, kind: rnd() < .55 ? 'shrub' : rnd() < .6 ? 'yucca' : rnd() < .7 ? 'boulder' : 'joshua', r: rnd() * 6.28, s: .7 + rnd() * .8 });
  }

  // ---------- spawn, crates ----------
  const spawnRP = roadPoint('MLK BLVD', 158, 1); const sp = spawnRP.sm;
  const spawn = { x: sp.x + sp.nx * 2.5, z: sp.z + sp.nz * 2.5, yaw: Math.atan2(-sp.tx, -sp.tz) };
  // walk the roads and drop an ammo crate on the sidewalk every so often
  const crates = []; for (const r of roads) for (let f = .3; f < .95; f += .45) { const sm = r.samples[Math.floor(f * (r.samples.length - 1))]; if (!insideBorder(sm.x, sm.z, 8) || nearIntersection(sm.x, sm.z, 14)) continue; const px = sm.x + sm.nx * (r.w / 2 + 1.1), pz = sm.z + sm.nz * (r.w / 2 + 1.1); if (crates.some(c => Math.hypot(c.x - px, c.z - pz) < 45)) continue; crates.push({ x: px, z: pz }); }

  // where each road leaves through the fence
  const exits = [];
  for (const r of roads) for (let k = 1; k < r.samples.length; k++) { const a = r.samples[k - 1], b = r.samples[k]; if (insideBorder(a.x, a.z) !== insideBorder(b.x, b.z)) { const inS = insideBorder(a.x, a.z) ? a : b; exits.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, tx: b.x - a.x, tz: b.z - a.z, nx: inS.nx, nz: inS.nz, w: r.w, inX: inS.x, inZ: inS.z, road: r.name }); } }
  // silhouettes of the rest of the city beyond the fence
  const outside = []; for (let i = 0; i < 46; i++) { const a = rnd() * Math.PI * 2, R = 196 + rnd() * 70; const x = Math.cos(a) * R, z = Math.sin(a) * R; if (roadEdgeDist(x, z).d < 6) continue; outside.push({ x, z, ry: rnd() * 6.28, model: pick(['house1', 'house2', 'house3']) }); }
  return { exits, outside, border, insideBorder, distToBorder, roads, bulbs, intersections, roadEdgeDist, nearestRoads, houses, driveways, yards, walls, plants, bins, mailboxes, parkedCars, curbCars, strandedCars, neighborSpots, streetlights, poles, shelters, crosswalks, medianPalms, scatter, specials, mall, gas, apts, church, park, lots, spawn, crates, obbCorners };
}
