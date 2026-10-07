import { CONFIG } from "./config.js";
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
function angle(a, b, c) {
  const ab = distance(a, b), bc = distance(b, c), ac = distance(a, c);
  if (ab * bc < 1e-9) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (ab * ab + bc * bc - ac * ac) / (2 * ab * bc)))) * 180 / Math.PI;
}
/** Deliberately ambiguous poses return UNKNOWN. No inferred release on missing data. */
export function classifyHand(points, settings = CONFIG.handTracking.pose) {
  if (!Array.isArray(points) || points.length !== 21 || points.some(p => !p || ![p.x, p.y, p.z].every(Number.isFinite))) return "UNKNOWN";
  const palm = distance(points[0], points[9]);
  if (palm < 0.0001) return "UNKNOWN";
  const fingers = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]];
  const extended = fingers.every(([mcp, pip, tip]) => angle(points[mcp], points[pip], points[tip]) > settings.extendedAngle && distance(points[tip], points[0]) > distance(points[pip], points[0]) * settings.extendedRatio);
  const thumbOpen = angle(points[2], points[3], points[4]) > settings.thumbAngle && distance(points[4], points[5]) / palm > settings.thumbSpread;
  if (extended && thumbOpen) return "OPEN_PALM";
  const folded = fingers.every(([mcp, pip, tip]) => angle(points[mcp], points[pip], points[tip]) < settings.foldedAngle && distance(points[tip], points[mcp]) / palm < settings.foldedDistance);
  const thumbClosed = distance(points[4], points[9]) / palm < settings.thumbClosed;
  return folded && thumbClosed ? "FIST" : "UNKNOWN";
}
