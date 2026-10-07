import { smooth } from "./collapse-core.js";
/** CPU equivalent of the existing growth deformation at wind=0 (end of freeze).
 * Input positions retain authored morphs/pivots; no replacement flower model.
 */
export function bakeFlowerVertex(position, bud, pivot, part, height, stem, leaves, bloom) {
  let p = [...position];
  if (part < 0.5) return [p[0] * (0.4 + 0.6 * stem), p[1] * stem, p[2] * (0.4 + 0.6 * stem)];
  if (part > 1.5 && part < 2.5) p = p.map((v, i) => bud[i] + (v - bud[i]) * bloom);
  const leaf = smooth(leaves * 1.22 - pivot[1] / height * 0.22);
  const head = smooth((stem - 0.35) / (0.94 - 0.35));
  const amount = Math.max(0.0001, part < 1.5 ? leaf : head);
  p = p.map((v, i) => pivot[i] + (v - pivot[i]) * amount);
  p[1] -= pivot[1] * (1 - stem);
  return p;
}
/** Split indexed triangles by authored part + spatial fracture sector, never across a seam.
 * Returning source indices keeps GLB provenance for every new fragment vertex.
 */
export function partitionFlower({ positions, parts, pivots, indices, height }) {
  const groups = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]];
    const part = Math.round(parts[tri[0]]);
    const center = [0, 0, 0];
    for (const index of tri) for (let axis = 0; axis < 3; axis++) center[axis] += positions[index * 3 + axis] / 3;
    let sector;
    if (part === 0) sector = Math.min(6, Math.floor(center[1] / height * 7));
    else if (part === 1) sector = Math.round(pivots[tri[0] * 3 + 1] * 100);
    else if (part === 2) sector = Math.floor((Math.atan2(center[2], center[0]) + Math.PI) / (Math.PI * 2) * 12);
    else sector = 0;
    const key = `${part}:${sector}`;
    if (!groups.has(key)) groups.set(key, { kind: part, source: [], indices: [], lookup: new Map() });
    const group = groups.get(key);
    for (const index of tri) {
      if (!group.lookup.has(index)) { group.lookup.set(index, group.source.length); group.source.push(index); }
      group.indices.push(group.lookup.get(index));
    }
  }
  return [...groups.values()].map(({ kind, source, indices }) => ({ kind, source, indices }));
}
