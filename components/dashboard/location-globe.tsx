'use client'

import { useEffect, useRef, type PointerEvent } from 'react'
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

export function LocationGlobe({ location, eventSignal = 0 }: { location?: ShippingLocation; eventSignal?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const alertUntil = useRef(0)
  const focusRequested = useRef(false)
  useEffect(() => {
    if (eventSignal > 0) {
      focusRequested.current = true
      alertUntil.current = 0
    }
  }, [eventSignal])
  const interaction = useRef({ hovered: false, longitude: 0, latitude: 0, velocityX: 0, velocityY: 0, drag: null as { id: number; x: number; y: number; time: number } | null })

  function endDrag(event: PointerEvent<HTMLElement>) {
    if (interaction.current.drag?.id !== event.pointerId) return
    if (event.timeStamp - interaction.current.drag.time > 80) {
      interaction.current.velocityX = interaction.current.velocityY = 0
    }
    interaction.current.drag = null
    const bounds = event.currentTarget.getBoundingClientRect()
    interaction.current.hovered = event.pointerType !== 'touch' && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
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
    let spin = 0
    let speed = 1
    let focus: { longitude: number; latitude: number; turn: number; progress: number } | null = null
    const rad = Math.PI / 180
    const baseTilt = (location?.latitude ?? 25) * rad
    function draw(time: number) {
      const delta = previous && !document.hidden ? Math.min(time - previous, 50) : 0
      if (!reduced.matches) elapsed += delta
      previous = time
      const state = interaction.current
      // Let an active drag finish before turning toward the saved location.
      if (state.drag && focus) { focus = null; focusRequested.current = true }
      if (focusRequested.current && location && !state.drag && !document.hidden) {
        const longitude = spin + state.longitude
        focus = { longitude, latitude: state.latitude, turn: Math.atan2(Math.sin(-longitude), Math.cos(-longitude)), progress: 0 }
        focusRequested.current = false
      }
      if (focus) {
        speed = 0
        state.velocityX = state.velocityY = 0
        focus.progress = reduced.matches ? 1 : Math.min(1, focus.progress + delta / 600)
        const eased = focus.progress ** 2 * (3 - 2 * focus.progress)
        state.longitude = focus.longitude + focus.turn * eased - spin
        state.latitude = focus.latitude * (1 - eased)
        if (focus.progress === 1) {
          focus = null
          alertUntil.current = time + 4000
        }
      }
      const presentingEvent = focus !== null || time < alertUntil.current
      if (!state.drag && !presentingEvent) {
        const decay = Math.exp(-delta / 260)
        const travel = reduced.matches ? 0 : 260 * (1 - decay)
        state.longitude += state.velocityX * travel
        state.latitude += state.velocityY * travel
        state.velocityX *= reduced.matches ? 0 : decay
        state.velocityY *= reduced.matches ? 0 : decay
      }
      state.latitude = Math.max(-Math.PI / 2 - baseTilt, Math.min(Math.PI / 2 - baseTilt, state.latitude))
      if (presentingEvent || interaction.current.hovered || interaction.current.drag || reduced.matches) speed = 0
      else speed += (1 - speed) * (1 - Math.exp(-delta / 450))
      spin += delta * speed * 1.05 * 0.96 / 18000
      const rotation = -(location?.longitude ?? -95) * rad + spin + interaction.current.longitude
      const tilt = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, baseTilt + interaction.current.latitude))
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
          const alertRemaining = Math.max(0, alertUntil.current - time)
          const redPulse = reduced.matches ? 1 : (1 + Math.cos((4000 - alertRemaining) * Math.PI * 2 / 800)) / 2
          const alert = Math.min(1, alertRemaining / 400) * (reduced.matches ? 1 : 0.55 + redPulse * 0.45)
          const tint = (normal: number[], red: number[]) => normal.map((value, i) => Math.round(value + (red[i] - value) * alert)).join(',')
          const pulse = reduced.matches ? 0 : alertRemaining > 0 ? redPulse : (Math.sin(elapsed / 700) + 1) / 2
          ctx!.globalAlpha = Math.min(1, p.z * 5)
          ctx!.strokeStyle = `rgba(${tint([225,245,195], [255,110,110])},.5)`; ctx!.lineWidth = 1
          ctx!.beginPath(); ctx!.arc(p.x, p.y, 6 + pulse * 4, 0, Math.PI * 2); ctx!.stroke()
          ctx!.fillStyle = `rgb(${tint([236,247,202], [255,95,95])})`; ctx!.shadowColor = `rgb(${tint([220,244,173], [255,75,75])})`; ctx!.shadowBlur = 9 + alert * 5
          ctx!.beginPath(); ctx!.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx!.fill()
          ctx!.shadowBlur = 0; ctx!.globalAlpha = 1
        }
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [location?.latitude, location?.longitude])

  return <figure className="group flex shrink-0 touch-none select-none flex-col items-center cursor-grab active:cursor-grabbing"
    onPointerEnter={event => { if (event.pointerType !== 'touch') interaction.current.hovered = true }}
    onPointerDown={event => {
      if (event.button !== 0 || interaction.current.drag) return
      event.currentTarget.setPointerCapture(event.pointerId)
      interaction.current.velocityX = interaction.current.velocityY = 0
      interaction.current.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp }
    }}
    onPointerMove={event => {
      const drag = interaction.current.drag
      if (!drag || drag.id !== event.pointerId) return
      const roll = -23.5 * Math.PI / 180
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y
      const sensitivity = Math.PI * 0.4 / event.currentTarget.getBoundingClientRect().width
      const longitude = (dx * Math.cos(roll) - dy * Math.sin(roll)) * sensitivity
      const latitude = (dx * Math.sin(roll) + dy * Math.cos(roll)) * sensitivity
      const duration = Math.max(8, event.timeStamp - drag.time)
      const blend = 1 - Math.exp(-duration / 35)
      interaction.current.longitude += longitude
      interaction.current.latitude += latitude
      interaction.current.velocityX += (Math.max(-0.003, Math.min(0.003, longitude / duration)) - interaction.current.velocityX) * blend
      interaction.current.velocityY += (Math.max(-0.003, Math.min(0.003, latitude / duration)) - interaction.current.velocityY) * blend
      drag.x = event.clientX; drag.y = event.clientY; drag.time = event.timeStamp
    }}
    onPointerUp={endDrag}
    onPointerCancel={event => { endDrag(event); interaction.current.hovered = false; interaction.current.velocityX = interaction.current.velocityY = 0 }}
    onLostPointerCapture={() => { interaction.current.drag = null }}
    onPointerLeave={() => { interaction.current.hovered = false }}>
    <canvas ref={canvas} role="img" aria-label={location ? `Globe marking your default address: ${location.matchedAddress}. Drag to rotate.` : 'Globe: no verified default address. Drag to rotate.'} className="size-24 transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transform-none sm:size-28" />
  </figure>
}
