'use client'

import { useEffect, useRef } from 'react'
import type { ShippingLocation } from '@/lib/types'

// Simplified coastline silhouettes, in longitude / latitude coordinates.
const continents = [
  [[-168,70],[-140,70],[-125,55],[-124,40],[-110,28],[-100,20],[-85,10],[-78,9],[-82,25],[-65,45],[-55,52],[-65,65],[-95,75],[-130,72]],
  [[-81,12],[-65,10],[-50,0],[-35,-8],[-43,-23],[-55,-35],[-68,-55],[-75,-40],[-80,-10]],
  [[-52,60],[-42,60],[-20,75],[-35,83],[-55,80]],
  [[-17,35],[10,37],[34,30],[43,12],[51,10],[40,-12],[32,-30],[18,-35],[10,-20],[-5,5],[-17,15]],
  [[-10,36],[-10,58],[10,71],[30,70],[45,55],[65,60],[100,77],[150,70],[179,60],[155,45],[140,35],[120,20],[105,0],[95,10],[80,7],[70,25],[50,30],[35,42],[20,35]],
  [[112,-12],[135,-10],[153,-25],[145,-39],[116,-34]],
  [[47,-13],[50,-17],[48,-26],[44,-24]],
]

function onLand(lon: number, lat: number) {
  return continents.some(polygon => {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [x, y] = polygon[i], [px, py] = polygon[j]
      if ((y > lat) !== (py > lat) && lon < (px - x) * (lat - y) / (py - y) + x) inside = !inside
    }
    return inside
  })
}

const land = Array.from({ length: 59 }, (_, row) => -87 + row * 3).flatMap(lat =>
  Array.from({ length: 120 }, (_, col) => -180 + col * 3).filter(lon => onLand(lon, lat)).map(lon => [lat, lon]))

export function LocationGlobe({ location }: { location?: ShippingLocation }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pointer = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const scale = Math.min(window.devicePixelRatio || 1, 2)
    element.width = element.height = 144 * scale
    ctx.scale(scale, scale)
    let frame = 0
    let elapsed = 0
    let previous = 0
    let followX = 0
    let followY = 0
    const rad = Math.PI / 180
    const baseTilt = (location?.latitude ?? 25) * rad
    function draw(time: number) {
      if (previous && !document.hidden && !reduced.matches) elapsed += Math.min(time - previous, 50)
      previous = time
      const smoothing = reduced.matches ? 1 : 1 - Math.exp(-Math.min(time - previousFrame, 50) / 140)
      previousFrame = time
      followX += (pointer.current.x - followX) * smoothing
      followY += (pointer.current.y - followY) * smoothing
      const rotation = -(location?.longitude ?? -95) * rad + elapsed * 1.05 / 18000 + followX * 0.65
      const tilt = baseTilt - followY * 0.4
      const roll = -23.5 * rad
      function project(lat: number, lon: number) {
        const a = lat * rad, b = lon * rad + rotation
        const x = Math.cos(a) * Math.sin(b)
        const y = Math.sin(a) * Math.cos(tilt) - Math.cos(a) * Math.cos(b) * Math.sin(tilt)
        const z = Math.sin(a) * Math.sin(tilt) + Math.cos(a) * Math.cos(b) * Math.cos(tilt)
        return { x: 72 + (x * Math.cos(roll) - y * Math.sin(roll)) * 58, y: 69 - (x * Math.sin(roll) + y * Math.cos(roll)) * 58, z }
      }
      ctx!.clearRect(0, 0, 144, 144)
      const shade = ctx!.createRadialGradient(50, 43, 5, 80, 80, 84)
      shade.addColorStop(0, '#39644d'); shade.addColorStop(0.65, '#193d30'); shade.addColorStop(1, '#0c211b')
      ctx!.fillStyle = shade
      ctx!.beginPath(); ctx!.arc(72, 69, 58, 0, Math.PI * 2); ctx!.fill()
      ctx!.strokeStyle = 'rgba(177,213,181,.15)'; ctx!.lineWidth = 0.6
      function line(points: number[][]) {
        ctx!.beginPath()
        let visible = false
        points.forEach(([lat, lon]) => {
          const p = project(lat, lon)
          if (p.z <= 0) { visible = false; return }
          if (visible) ctx!.lineTo(p.x, p.y); else ctx!.moveTo(p.x, p.y)
          visible = true
        })
        ctx!.stroke()
      }
      for (let lat = -60; lat <= 60; lat += 30) line(Array.from({ length: 181 }, (_, i) => [lat, i * 2 - 180]))
      for (let lon = -180; lon < 180; lon += 30) line(Array.from({ length: 91 }, (_, i) => [i * 2 - 90, lon]))
      land.forEach(([lat, lon]) => {
        const p = project(lat, lon)
        if (p.z <= 0) return
        ctx!.fillStyle = `rgba(174,209,164,${0.25 + p.z * 0.6})`
        ctx!.beginPath(); ctx!.arc(p.x, p.y, 0.8, 0, Math.PI * 2); ctx!.fill()
      })
      if (location) {
        const p = project(location.latitude, location.longitude)
        if (p.z > 0) {
          const pulse = reduced.matches ? 0 : (Math.sin(elapsed / 700) + 1) / 2
          ctx!.globalAlpha = Math.min(1, p.z * 5)
          ctx!.strokeStyle = 'rgba(225,245,195,.5)'; ctx!.lineWidth = 1
          ctx!.beginPath(); ctx!.arc(p.x, p.y, 6 + pulse * 4, 0, Math.PI * 2); ctx!.stroke()
          ctx!.fillStyle = '#ecf7ca'; ctx!.shadowColor = '#dcf4ad'; ctx!.shadowBlur = 9
          ctx!.beginPath(); ctx!.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx!.fill()
          ctx!.shadowBlur = 0; ctx!.globalAlpha = 1
        }
      }
      frame = requestAnimationFrame(draw)
    }
    let previousFrame = performance.now()
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [location?.latitude, location?.longitude])

  return <figure className="group flex shrink-0 flex-col items-center" title={location?.matchedAddress ?? 'Set your default address in account settings'}
    onPointerMove={event => {
      if (event.pointerType === 'touch') return
      const bounds = event.currentTarget.getBoundingClientRect()
      pointer.current = { x: Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)), y: Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1)) }
    }}
    onPointerLeave={() => { pointer.current = { x: 0, y: 0 } }}>
    <canvas ref={canvas} role="img" aria-label={location ? `Globe marking your default address: ${location.matchedAddress}` : 'Globe: no verified default address'} className="size-28 transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transform-none sm:size-32" />
  </figure>
}
