import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createRound, deleteRound, setRoundNotes, saveCourse, saveShooter, setBreakage, setStationCounter, setStationNotes, setStationTargets, tapTarget, UserError } from './actions'
import { activeCircleCount, buildEmail, formatDateTime, gridLines, nextResult, orderForStation, rotateForStation } from './logic'

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
    const id = await createRound({ courseId: c, roundDate: when, stationCount: 12, courseType: 'SPORTING_CLAYS', rotateShooters: true, shooterIds: [jay, null, null, null, null] })
    expect(await db.stations.where('roundId').equals(id).count()).toBe(12)
    await expect(createRound({ courseId: c, roundDate: when + 20_000, stationCount: 12, courseType: 'SPORTING_CLAYS', rotateShooters: true, shooterIds: [jay, null, null, null, null] })).rejects.toThrow(/already exists/)
  })

  it('records taps, enforces the target limit and builds the email', async () => {
    const c = await saveCourse('GCFC', 'Granite Falls, WA')
    const jay = await saveShooter('Jay')
    const jerry = await saveShooter('Jerry T')
    const when = new Date(2026, 9, 23, 15, 30).getTime()
    const roundId = await createRound({ courseId: c, roundDate: when, stationCount: 12, courseType: 'SPORTING_CLAYS', rotateShooters: true, shooterIds: [jay, jerry, null, null, null] })
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

  it('edits shooters and courses, keeping names unique', async () => {
    const jay = await saveShooter('jya')
    const gil = await saveShooter('Gil')
    await saveShooter('Jay', jay) // fix the spelling
    expect((await db.shooters.get(jay))!.name).toBe('Jay')
    await saveShooter('JAY', jay) // capitals-only change is fine
    await expect(saveShooter('jay', gil)).rejects.toThrow(/already exists/) // can't take another's name
    const c = await saveCourse('GFCF', 'Granite Fals')
    await saveCourse('GCFC', 'Granite Falls, WA', c)
    expect(await db.courses.get(c)).toMatchObject({ courseName: 'GCFC', location: 'Granite Falls, WA' })
    expect(await db.courses.count()).toBe(1)
  })

  it('deletes a round with its stations and targets, leaving others intact', async () => {
    const c = await saveCourse('GCFC', 'Granite Falls, WA')
    const jay = await saveShooter('Jay')
    const keep = await createRound({ courseId: c, roundDate: Date.UTC(2026, 9, 1), stationCount: 3, courseType: 'SPORTING_CLAYS', rotateShooters: true, shooterIds: [jay, null, null, null, null] })
    const gone = await createRound({ courseId: c, roundDate: Date.UTC(2026, 9, 2), stationCount: 4, courseType: 'SPORTING_CLAYS', rotateShooters: true, shooterIds: [jay, null, null, null, null] })
    for (const r of [keep, gone]) {
      const st = (await db.stations.where('roundId').equals(r).first())!
      await setStationTargets(st.id, 6, () => true)
    }
    await deleteRound(gone)
    expect(await db.rounds.get(gone)).toBeUndefined()
    expect(await db.stations.where('roundId').equals(gone).count()).toBe(0)
    expect(await db.stations.where('roundId').equals(keep).count()).toBe(3)
    expect(await db.targets.count()).toBe(1)
    expect(await db.shooters.count()).toBe(1) // master data untouched
    expect(await db.courses.count()).toBe(1)
  })

  async function emailFor(roundId: number) {
    const round = (await db.rounds.get(roundId))!
    return buildEmail({
      round,
      course: await db.courses.get(round.courseId),
      shooters: new Map((await db.shooters.toArray()).map((x) => [x.id, x])),
      stations: await db.stations.where('roundId').equals(roundId).toArray(),
      targets: await db.targets.toArray(),
    }).body
  }

  it('keeps the same shooter order at every station when rotation is off', async () => {
    const c = await saveCourse('GCFC', '')
    const [a, b, cc] = [await saveShooter('A'), await saveShooter('B'), await saveShooter('C')]
    const id = await createRound({ courseId: c, roundDate: Date.UTC(2026, 9, 3), stationCount: 4, courseType: 'SPORTING_CLAYS', rotateShooters: false, shooterIds: [a, b, cc, null, null] })
    const round = (await db.rounds.get(id))!
    for (const n of [1, 2, 3, 4]) expect(orderForStation(round, n).map((m) => m.shooterId)).toEqual([a, b, cc])
    expect(await emailFor(id)).toContain('Rotate Shooters:  No')
    const rot = await createRound({ courseId: c, roundDate: Date.UTC(2026, 9, 4), stationCount: 4, courseType: 'SPORTING_CLAYS', rotateShooters: true, shooterIds: [a, b, cc, null, null] })
    expect(orderForStation((await db.rounds.get(rot))!, 2).map((m) => m.shooterId)).toEqual([b, cc, a])
    expect(await emailFor(rot)).toContain('Rotate Shooters:  Yes')
  })

  it('5-Stand rounds are 5 stations x 5 targets, ready to score; rotation is still a choice', async () => {
    const c = await saveCourse('Monroe Gun Club', 'Monroe, WA')
    const [a, b] = [await saveShooter('A'), await saveShooter('B')]
    // Ask for 15 stations: must be overridden to 5. Rotation choice is kept.
    const id = await createRound({ courseId: c, roundDate: Date.UTC(2026, 9, 5), stationCount: 15, courseType: 'FIVE_STAND', rotateShooters: true, shooterIds: [a, b, null, null, null] })
    const round = (await db.rounds.get(id))!
    expect(round).toMatchObject({ stationCount: 5, rotateShooters: true, courseType: 'FIVE_STAND' })
    expect(orderForStation(round, 2).map((m) => m.shooterId)).toEqual([b, a])
    const stations = await db.stations.where('roundId').equals(id).toArray()
    expect(stations.map((x) => x.targetCount)).toEqual([5, 5, 5, 5, 5])
    expect(await db.targets.count()).toBe(10) // 5 stations x 2 shooters
    await expect(setStationTargets(stations[0].id, 6, () => true)).rejects.toThrow(/always have 5/)
    let body = await emailFor(id)
    expect(body).toContain('Course Type:  5-Stand')
    expect(body).toContain('Stations:  5\nTotal Targets:  25\nRotate Shooters:  Yes')
    // Same course, different round type, rotation off
    const id2 = await createRound({ courseId: c, roundDate: Date.UTC(2026, 9, 6), stationCount: 12, courseType: 'FIVE_STAND', rotateShooters: false, shooterIds: [a, b, null, null, null] })
    body = await emailFor(id2)
    expect(body).toContain('Rotate Shooters:  No')
    const id3 = await createRound({ courseId: c, roundDate: Date.UTC(2026, 9, 7), stationCount: 12, courseType: 'SPORTING_CLAYS', rotateShooters: true, shooterIds: [a, null, null, null, null] })
    expect((await db.rounds.get(id3))!.stationCount).toBe(12)
    expect(await emailFor(id3)).toContain('Course Type:  Sporting Clays')
  })

  it('lists breakage/look/practice totals only when non-zero, and notes at the end', async () => {
    const c = await saveCourse('GCFC', 'Granite Falls, WA')
    const a = await saveShooter('Jay')
    const id = await createRound({ courseId: c, roundDate: Date.UTC(2026, 9, 6), stationCount: 5, courseType: 'SPORTING_CLAYS', rotateShooters: true, shooterIds: [a, null, null, null, null] })
    const st = (await db.stations.where('roundId').equals(id).toArray()).sort((x, y) => x.stationNumber - y.stationNumber)
    let body = await emailFor(id)
    expect(body).not.toMatch(/Breakage|Look Targets|Practice Targets|Notes:/)
    expect(body).toContain('Course Type:  Sporting Clays')

    await setStationCounter(st[0].id, 'lookCount', 2)
    await setStationCounter(st[3].id, 'lookCount', 1)
    await setStationCounter(st[1].id, 'practiceCount', 4)
    await setStationCounter(st[1].id, 'breakageCount', -3) // clamped to 0
    await setStationNotes(st[3].id, 'Rabbit bounces early')
    await setStationNotes(st[0].id, '  Long crosser L to R  ')
    await setStationNotes(st[2].id, '   ') // blank: ignored
    body = await emailFor(id)
    expect(body).toContain('Look Targets:  3')
    expect(body).toContain('Practice Targets:  4')
    expect(body).not.toContain('Breakage')
    expect(body.endsWith('Notes:\nStation 1 -\nLong crosser L to R\nStation 4 -\nRabbit bounces early')).toBe(true)
    expect(body).not.toContain('Round Notes')

    // Round notes go after the shooters' scores and before the breakage details.
    await setStationCounter(st[1].id, 'breakageCount', 2)
    await setRoundNotes(id, '  Windy morning  ')
    body = await emailFor(id)
    const iShooter = body.indexOf('Shooter 1:'), iRound = body.indexOf('Round Notes:\nWindy morning'), iBreak = body.indexOf('Breakage:\n    Station 2:  2'), iNotes = body.indexOf('\nNotes:\n')
    expect(iShooter).toBeGreaterThan(-1)
    expect(iRound).toBeGreaterThan(iShooter)
    expect(iBreak).toBeGreaterThan(iRound)
    expect(iNotes).toBeGreaterThan(iBreak)
  })

  it('upgrades data saved by the previous app version without losing anything', async () => {
    db.close()
    await Dexie.delete('ClayScores')
    // Recreate the old (version 1) database exactly as v0.3.0 stored it.
    const old = new Dexie('ClayScores')
    old.version(1).stores({
      courses: '++id, courseName', shooters: '++id, &nameKey',
      rounds: '++id, roundDate, courseId, [courseId+roundDate]',
      stations: '++id, roundId, [roundId+stationNumber]', targets: '++id, stationId, [stationId+slot]',
    })
    const cId = await old.table('courses').add({ courseName: 'GCFC', location: 'Granite Falls, WA' })
    const sId = await old.table('shooters').add({ name: 'Jay', nameKey: 'jay' })
    const rId = await old.table('rounds').add({ roundDate: Date.UTC(2026, 9, 23), courseId: cId, stationCount: 12, shooter1Id: sId, shooter2Id: null, shooter3Id: null, shooter4Id: null, shooter5Id: null })
    const stId = await old.table('stations').add({ roundId: rId, stationNumber: 1, targetCount: 8, breakageCount: 2 })
    await old.table('targets').add({ stationId: stId, shooterId: sId, slot: 1, results: ['HIT', 'MISS', null, null, null, null, null, null, 'NA', 'NA', 'NA', 'NA'] })
    old.close()

    await db.open() // the new app opening the old data
    const course = (await db.courses.get(cId as number))!
    expect(course).toMatchObject({ courseName: 'GCFC', location: 'Granite Falls, WA' })
    expect('courseType' in course).toBe(false) // type now lives on the round
    expect(await db.rounds.get(rId as number)).toMatchObject({ stationCount: 12, rotateShooters: true, courseType: 'SPORTING_CLAYS' })
    expect(await db.stations.get(stId as number)).toMatchObject({ targetCount: 8, breakageCount: 2, lookCount: 0, practiceCount: 0, notes: '' })
    expect((await db.targets.toArray())[0].results.slice(0, 2)).toEqual(['HIT', 'MISS'])
    expect(await db.shooters.count()).toBe(1)
  })
})
