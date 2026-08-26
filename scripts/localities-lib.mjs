import proj4 from 'proj4'

// EPSG:2039 — Israeli Transverse Mercator (רשת ישראל החדשה)
const ITM =
  '+proj=tmerc +lat_0=31.734393611 +lon_0=35.204516944 +k=1.0000067 ' +
  '+x_0=219529.584 +y_0=626907.39 +ellps=GRS80 ' +
  '+towgs84=-24.0024,-17.1032,-17.8444,-0.33077,-1.85269,1.66969,5.4248 +units=m +no_defs'

export function parsePackedCoord(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const s = String(value)
  if (s.length !== 12) return null
  return { east: Number(s.slice(0, 6)), north: Number(s.slice(6)) }
}

export function itmToWgs84(east, north) {
  const [lng, lat] = proj4(ITM, proj4.WGS84, [east, north])
  return { lat, lng }
}

const IN_ISRAEL = ({ lat, lng }) =>
  lat > 29.4 && lat < 33.4 && lng > 34.2 && lng < 35.95

export function recordsToLocalities(records) {
  if (records.length === 0) return []
  const out = []
  for (const r of records) {
    const popKey = Object.keys(r).find((k) => k.startsWith('סך הכל אוכלוסייה'))
    const pop = popKey ? r[popKey] : null
    const packed = parsePackedCoord(r['קואורדינטות'])
    const id = r['סמל יישוב']
    const name = typeof r['שם יישוב'] === 'string' ? r['שם יישוב'].trim() : ''
    if (!packed || typeof pop !== 'number' || !pop || !id || !name) continue
    const { lat, lng } = itmToWgs84(packed.east, packed.north)
    if (!IN_ISRAEL({ lat, lng })) continue
    out.push({
      id,
      name,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      pop,
    })
  }
  return out
}
