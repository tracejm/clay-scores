import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createRound, saveCourse, saveShooter, setBreakage, setStationTargets, tapTarget, UserError } from './actions'
import { activeCircleCount, buildEmail, formatDateTime, gridLines, nextResult, rotateForStation } from './logic'

describe('scoring rules', () => {
  it('activates circles in pairs', () => {
    expect([1, 2, 3, 4, 7, 8, 10, 12].map(activeCircleCount)).toEqual([2, 2, 4, 4, 8, 8, 10, 12])
  })

  it('cycles grey -> hit -> miss -> grey, black never changes', () => {
    expect(nextResult(null)).toBe('HIT')
    expect(nextResult('HIT')).toBe('MISS')
    expect(nextResult('MISS')).toBe(null)
    expect(nextResult('NA')).toBe('NA')
  })

  it('rotates the shooting order by station (spec example A,B,C)', () => {
    const s = ['A', 'B', 'C']
    expect(rotateForStation(s, 1)).toEqual(['A', 'B', 'C'])
    expect(rotateForStation(s, 2)).toEqual(['B', 'C', 'A'])
    expect(rotateForStation(s, 3)).toEqual(['C', 'A', 'B'])
    expect(rotateForStation(s, 4)).toEqual(['A', 'B', 'C'])
    expect(rotateForStation(s, 5)).toEqual(['B', 'C', 'A'])
  })

  it('formats dates like the email example', () => {
    expect(formatDateTime(new Date(2026, 9, 23, 15, 30).getTime())).toBe('23-Oct-2026 15:30')
  })

  it('draws the two-line grid (odd targets on top, even below)', () => {
    // Jerry T, station 12 in email_example.txt: 7 / 10, XOXXO / XXXX-
    const r = ['HIT', 'HIT', 'MISS', 'HIT', 'HIT', 'HIT', 'HIT', 'HIT', 'MISS', null, 'NA', 'NA'] as const
    expect(gridLines([...r], 10)).toEqual(['XOXXO', 'XXXX-'])
  })
})

describe('database actions', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('rejects duplicate shooter names (case-insensitive)', async () => {
    await saveShooter('Jay')
    await expect(saveShooter('  jay ')).rejects.toThrow(UserError)
  })

  it('creates a round with stations and rejects a duplicate course+date/time', async () => {
    const c = await saveCourse('GCFC', 'Granite Falls, WA')
    const jay = await saveShooter('Jay')
    const when = new Date(2026, 9, 23, 15, 30).getTime()
    const id = await createRound({ courseId: c, roundDate: when, stationCount: 12, shooterIds: [jay, null, null, null, null] })
    expect(await db.stations.where('roundId').equals(id).count()).toBe(12)
    await expect(createRound({ courseId: c, roundDate: when + 20_000, stationCount: 12, shooterIds: [jay, null, null, null, null] })).rejects.toThrow(/already exists/)
  })

  it('records taps, enforces the target limit and builds the email', async () => {
    const c = await saveCourse('GCFC', 'Granite Falls, WA')
    const jay = await saveShooter('Jay')
    const jerry = await saveShooter('Jerry T')
    const when = new Date(2026, 9, 23, 15, 30).getTime()
    const roundId = await createRound({ courseId: c, roundDate: when, stationCount: 12, shooterIds: [jay, jerry, null, null, null] })
    const st1 = (await db.stations.where('[roundId+stationNumber]').equals([roundId, 1]).first())!
    await setStationTargets(st1.id, 3, () => true)
    const jayRow = (await db.targets.where('[stationId+slot]').equals([st1.id, 1]).first())!
    expect(jayRow.results.slice(0, 5)).toEqual([null, null, null, null, 'NA'])

    await tapTarget(jayRow.id, 0, 3) // hit
    await tapTarget(jayRow.id, 1, 3) // hit
    await tapTarget(jayRow.id, 2, 3) // hit
    await tapTarget(jayRow.id, 2, 3) // -> miss
    await expect(tapTarget(jayRow.id, 3, 3)).rejects.toThrow(/already recorded/)
    await setBreakage(st1.id, 2)

    const round = (await db.rounds.get(roundId))!
    const { subject, body } = buildEmail({
      round,
      course: await db.courses.get(c),
      shooters: new Map((await db.shooters.toArray()).map((s) => [s.id, s])),
      stations: await db.stations.where('roundId').equals(roundId).toArray(),
      targets: await db.targets.toArray(),
    })
    expect(subject).toBe('Scores From GCFC / Granite Falls, WA / 23-Oct-2026 15:30')
    expect(body).toContain('Total Targets:  3')
    expect(body).toContain('Shooter 1:  Jay\n  Total:  2\n    Station 1:  2 / 3\n    XO\n    X-')
    expect(body).toContain('Shooter 2:  Jerry T\n  Total:  0')
    expect(body).toContain('Breakage:\n    Station 1:  2')
  })
})
