// Miller cylindrical moderates Mercator's polar stretch and includes both poles.
export const worldWidth = 3600;
export const latitudeLimit = 90;
const radius = worldWidth / (2 * Math.PI);
const northing = phi => radius * 1.25 * Math.asinh(Math.tan(.8 * phi));
export const worldHeight = +(2 * northing(Math.PI / 2)).toFixed(3);
export function project([longitude, latitude]) {
  const phi = Math.max(-latitudeLimit, Math.min(latitudeLimit, latitude)) * Math.PI / 180;
  return [(longitude + 180) * worldWidth / 360,
    Math.max(0, Math.min(worldHeight, worldHeight / 2 - northing(phi)))];
}
