/**
 * Pure scoring rules. No screens and no database here, so every rule can be
 * unit-tested on its own (see logic.test.ts).
 */
import type { Course, Round, Shooter, Station, TargetResult, TargetRow } from './db'

export const MAX_TARGETS = 12
export const MIN_TARGETS = 1
export const DEFAULT_STATION_TARGETS = 10
export const DEFAULT_STATION_COUNT = 15
export const MAX_SQUAD = 5

/** Circles are activated in pairs: 1-2 targets -> 2 circles, 3-4 -> 4, etc. */
export function activeCircleCount(targetCount: number): number {
  if (targetCount <= 0) return 0
  return Math.min(MAX_TARGETS, Math.ceil(targetCount / 2) * 2)
}

/** Build a fresh results array for a station with the given target count. */
export function blankResults(targetCount: number): TargetResult[] {
  const active = activeCircleCount(targetCount)
  return Array.from({ length: MAX_TARGETS }, (_, i) => (i < active ? null : 'NA'))
}

/**
 * Re-shape an existing results array for a new target count, keeping recorded
 * hits/misses in circles that stay active.
 */
export function resizeResults(results: TargetResult[], targetCount: number): TargetResult[] {
  const active = activeCircleCount(targetCount)
  return Array.from({ length: MAX_TARGETS }, (_, i) => {
    if (i >= active) return 'NA'
    const r = results[i]
    return r === 'HIT' || r === 'MISS' ? r : null
  })
}

/** Tapping a circle: grey(null) -> green(HIT) -> red(MISS) -> grey(null). */
export function nextResult(r: TargetResult): TargetResult {
  if (r === null) return 'HIT'
  if (r === 'HIT') return 'MISS'
  if (r === 'MISS') return null
  return 'NA' // black circles never change
}

export const countHits = (results: TargetResult[]) => results.filter((r) => r === 'HIT').length
export const countRecorded = (results: TargetResult[]) =>
  results.filter((r) => r === 'HIT' || r === 'MISS').length

/** Squad = filled shooter slots, in slot order. */
export interface SquadMember {
  slot: number
  shooterId: number
}
export function squadOf(round: Round): SquadMember[] {
  const ids = [round.shooter1Id, round.shooter2Id, round.shooter3Id, round.shooter4Id, round.shooter5Id]
  const out: SquadMember[] = []
  ids.forEach((id, i) => {
    if (id != null) out.push({ slot: i + 1, shooterId: id })
  })
  return out
}

/** Shooting order at a station rotates: station 1 = A,B,C; station 2 = B,C,A; ... */
export function rotateForStation<T>(squad: T[], stationNumber: number): T[] {
  if (squad.length === 0) return []
  const offset = (stationNumber - 1) % squad.length
  return [...squad.slice(offset), ...squad.slice(0, offset)]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** "23-Oct-2026 15:30" (the format used in email_example.txt). */
export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Value for <input type="datetime-local">: "2026-10-23T15:30". */
export function toDateTimeInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Round to the start of the minute so "same date/time" comparisons are exact. */
export const toMinute = (ms: number) => Math.floor(ms / 60000) * 60000

/** "GCFC / Granite Falls, WA / 23-Oct-2026 15:30" */
export function roundLabel(course: Course | undefined, round: Round): string {
  const parts = [course?.courseName ?? '(deleted course)']
  if (course?.location) parts.push(course.location)
  parts.push(formatDateTime(round.roundDate))
  return parts.join(' / ')
}

const symbol = (r: TargetResult) => (r === 'HIT' ? 'X' : r === 'MISS' ? 'O' : '-')

/** Two lines of X/O/- : top = targets 1,3,5..., bottom = targets 2,4,6... */
export function gridLines(results: TargetResult[], targetCount: number): [string, string] {
  const active = activeCircleCount(targetCount)
  let top = ''
  let bottom = ''
  for (let i = 0; i < active; i += 2) {
    top += symbol(results[i])
    bottom += symbol(results[i + 1])
  }
  return [top, bottom]
}

export interface EmailInput {
  round: Round
  course: Course | undefined
  shooters: Map<number, Shooter>
  stations: Station[]
  targets: TargetRow[]
}

/** Builds the subject and body exactly in the style of email_example.txt. */
export function buildEmail({ round, course, shooters, stations, targets }: EmailInput) {
  const label = roundLabel(course, round)
  const subject = `Scores From ${label}`
  const played = [...stations]
    .filter((s) => s.targetCount > 0)
    .sort((a, b) => a.stationNumber - b.stationNumber)
  const totalTargets = played.reduce((sum, s) => sum + s.targetCount, 0)

  const lines: string[] = []
  lines.push(`Course Name:  ${course?.courseName ?? ''}`)
  lines.push(`Course Location:  ${course?.location ?? ''}`)
  lines.push(`Date:  ${formatDateTime(round.roundDate)}`)
  lines.push(`Stations:  ${round.stationCount}`)
  lines.push(`Total Targets:  ${totalTargets}`)
  lines.push('')

  for (const member of squadOf(round)) {
    const rowFor = (st: Station) => targets.find((t) => t.stationId === st.id && t.slot === member.slot)
    const total = played.reduce((sum, st) => sum + countHits(rowFor(st)?.results ?? []), 0)
    lines.push(`Shooter ${member.slot}:  ${shooters.get(member.shooterId)?.name ?? '?'}`)
    lines.push(`  Total:  ${total}`)
    for (const st of played) {
      const results = rowFor(st)?.results ?? blankResults(st.targetCount)
      const [top, bottom] = gridLines(results, st.targetCount)
      lines.push(`    Station ${st.stationNumber}:  ${countHits(results)} / ${st.targetCount}`)
      lines.push(`    ${top}`)
      lines.push(`    ${bottom}`)
    }
    lines.push('')
  }

  const broken = played.filter((s) => s.breakageCount > 0)
  lines.push('')
  lines.push('Breakage:')
  if (broken.length === 0) lines.push('    None')
  for (const s of broken) lines.push(`    Station ${s.stationNumber}:  ${s.breakageCount}`)

  return { subject, body: lines.join('\n') }
}

/** A mailto: link opens the phone's default mail app with a pre-filled draft. */
export function mailtoUrl(subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\n/g, '\r\n'))
  return `mailto:?subject=${enc(subject)}&body=${enc(body)}`
}
