export interface LatLng {
  lat: number
  lng: number
}

const R = 6371 // km
const rad = (deg: number) => (deg * Math.PI) / 180

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function pointsFor(distanceKm: number): number {
  return Math.round(1000 * Math.exp(-distanceKm / 30))
}
