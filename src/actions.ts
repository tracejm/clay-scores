/**
 * Every change the app makes to the database goes through one of these
 * functions. Validation rules from the spec live here.
 */
import { db, type CourseType, type Round, type Station, type TargetRow } from './db'
import { blankResults, countRecorded, nextResult, resizeResults, squadOf, toMinute, activeCircleCount, isFiveStand, FIVE_STAND, MAX_TARGETS, MIN_TARGETS } from './logic'

/** Thrown for problems the user can fix; the message is shown on screen. */
export class UserError extends Error {}

/**
 * Create a course, or update one when `id` is given. Rounds point to the
 * course by id, so a correction shows up everywhere automatically.
 */
export async function saveCourse(courseName: string, location: string, id?: number): Promise<number> {
  const name = courseName.trim().replace(/\s+/g, ' ')
  const loc = location.trim().replace(/\s+/g, ' ')
  if (!name) throw new UserError('Please enter a course name.')
  const dup = await db.courses
    .filter((c) => c.id !== id && c.courseName.toLowerCase() === name.toLowerCase() && c.location.toLowerCase() === loc.toLowerCase())
    .first()
  if (dup) throw new UserError(`"${name}" at "${loc || 'no location'}" already exists.`)
  if (id != null) {
    await db.courses.update(id, { courseName: name, location: loc })
    return id
  }
  return db.courses.add({ courseName: name, location: loc })
}

/**
 * Create a shooter, or rename one when `id` is given. Names must be unique,
 * ignoring capitals (fixing "jay" to "Jay" is allowed).
 */
export async function saveShooter(rawName: string, id?: number): Promise<number> {
  const name = rawName.trim().replace(/\s+/g, ' ')
  if (!name) throw new UserError('Please enter a shooter name.')
  const nameKey = name.toLowerCase()
  const dup = await db.shooters.where('nameKey').equals(nameKey).first()
  if (dup && dup.id !== id) {
    throw new UserError(`A shooter named "${dup.name}" already exists. Please change the name and try again.`)
  }
  if (id != null) {
    await db.shooters.update(id, { name, nameKey })
    return id
  }
  return db.shooters.add({ name, nameKey })
}

export interface NewRound {
  courseId: number | null
  roundDate: number | null
  stationCount: number
  courseType: CourseType
  rotateShooters: boolean
  shooterIds: (number | null)[] // 5 slots
}

/**
 * Creates the round plus one station row per station. Returns the round id.
 * For a 5-Stand round the layout is fixed: 5 stations of 5 targets, and every
 * station is ready to score immediately. Rotation is the user's choice either way.
 */
export async function createRound(input: NewRound): Promise<number> {
  if (input.courseId == null) throw new UserError('Please select a course.')
  if (input.roundDate == null || Number.isNaN(input.roundDate)) throw new UserError('Please choose the date and time.')
  if (input.shooterIds[0] == null) throw new UserError('Shooter 1 is required.')
  if (input.stationCount < 1) throw new UserError('A round needs at least 1 station.')
  const roundDate = toMinute(input.roundDate)
  const courseId = input.courseId

  return db.transaction('rw', db.courses, db.rounds, db.stations, db.targets, async () => {
    if (!(await db.courses.get(courseId))) throw new UserError('Please select a course.')
    const courseType = input.courseType ?? 'SPORTING_CLAYS'
    const fiveStand = isFiveStand(courseType)
    const stationCount = fiveStand ? FIVE_STAND.stations : input.stationCount
    const targetCount = fiveStand ? FIVE_STAND.targets : 0 // 0 = set at the station

    const clash = await db.rounds.where('[courseId+roundDate]').equals([courseId, roundDate]).first()
    if (clash) {
      throw new UserError('A round at this course with the same date and time already exists. Change the date/time, or use "Manage Existing Rounds".')
    }
    const [s1, s2, s3, s4, s5] = input.shooterIds
    const round = {
      roundDate,
      courseId,
      stationCount,
      courseType,
      rotateShooters: input.rotateShooters,
      shooter1Id: s1!,
      shooter2Id: s2 ?? null,
      shooter3Id: s3 ?? null,
      shooter4Id: s4 ?? null,
      shooter5Id: s5 ?? null,
    } as Round
    const roundId = await db.rounds.add(round)
    const stationIds = (await db.stations.bulkAdd(
      Array.from({ length: stationCount }, (_, i) => ({
        roundId,
        stationNumber: i + 1,
        targetCount,
        breakageCount: 0,
        lookCount: 0,
        practiceCount: 0,
        notes: '',
      })) as Station[],
      { allKeys: true },
    )) as number[]
    if (targetCount > 0) {
      // Targets are already known, so create each shooter's scoring row now.
      const rows = stationIds.flatMap((stationId) =>
        squadOf({ ...round, id: roundId }).map((m) => ({ stationId, slot: m.slot, shooterId: m.shooterId, results: blankResults(targetCount) })),
      )
      await db.targets.bulkAdd(rows as TargetRow[])
    }
    return roundId
  })
}

/**
 * Confirm the number of targets at a station. Creates/updates one target row
 * per squad member. If the change would throw away recorded results, the
 * caller is asked (via `confirmLoss`) before anything is changed.
 */
export async function setStationTargets(
  stationId: number,
  targetCount: number,
  confirmLoss: (message: string) => boolean,
): Promise<boolean> {
  if (targetCount < MIN_TARGETS || targetCount > MAX_TARGETS) throw new UserError('Targets must be between 1 and 12.')
  const station = await db.stations.get(stationId)
  if (!station) throw new UserError('Station not found.')
  const round = await db.rounds.get(station.roundId)
  if (!round) throw new UserError('Round not found.')
  if (isFiveStand(round.courseType) && targetCount !== FIVE_STAND.targets) {
    throw new UserError('5-Stand stations always have 5 targets.')
  }
  const existing = await db.targets.where('stationId').equals(stationId).toArray()

  const active = activeCircleCount(targetCount)
  for (const row of existing) {
    const lost = row.results.slice(active).filter((r) => r === 'HIT' || r === 'MISS').length
    const keptRecorded = countRecorded(row.results.slice(0, active))
    if (keptRecorded > targetCount) {
      const name = (await db.shooters.get(row.shooterId))?.name ?? 'A shooter'
      throw new UserError(`${name} already has ${keptRecorded} results recorded. Clear some before lowering targets to ${targetCount}.`)
    }
    if (lost > 0 && !confirmLoss('Lowering the target count will clear results already recorded in the removed circles. Continue?')) {
      return false
    }
  }

  await db.transaction('rw', db.stations, db.targets, async () => {
    await db.stations.update(stationId, { targetCount })
    for (const member of squadOf(round)) {
      const row = existing.find((r) => r.slot === member.slot)
      if (row) {
        await db.targets.update(row.id, { results: resizeResults(row.results, targetCount), shooterId: member.shooterId })
      } else {
        await db.targets.add({ stationId, slot: member.slot, shooterId: member.shooterId, results: blankResults(targetCount) } as TargetRow)
      }
    }
  })
  return true
}

/** Tap a circle: grey -> green (hit) -> red (miss) -> grey. Saved immediately. */
export async function tapTarget(rowId: number, index: number, targetCount: number): Promise<void> {
  await db.transaction('rw', db.targets, async () => {
    const row = await db.targets.get(rowId)
    if (!row) return
    const current = row.results[index]
    if (current === 'NA') return
    const next = nextResult(current)
    // Don't allow more results than there are targets (e.g. 7 targets, 8 circles).
    if (current === null && countRecorded(row.results) >= targetCount) {
      throw new UserError(`All ${targetCount} targets are already recorded for this shooter.`)
    }
    const results = [...row.results]
    results[index] = next
    await db.targets.update(rowId, { results })
  })
}

/** The per-station counters that don't affect scores. */
export type StationCounter = 'breakageCount' | 'lookCount' | 'practiceCount'

export async function setStationCounter(stationId: number, field: StationCounter, value: number): Promise<void> {
  await db.stations.update(stationId, { [field]: Math.max(0, Math.min(99, Math.round(value))) })
}

export const setBreakage = (stationId: number, n: number) => setStationCounter(stationId, 'breakageCount', n)

export async function setStationNotes(stationId: number, notes: string): Promise<void> {
  await db.stations.update(stationId, { notes: notes.slice(0, 2000) })
}

/** Permanently delete a round with all of its stations and recorded targets. */
export async function deleteRound(roundId: number): Promise<void> {
  await db.transaction('rw', db.rounds, db.stations, db.targets, async () => {
    const stationIds = await db.stations.where('roundId').equals(roundId).primaryKeys()
    await db.targets.where('stationId').anyOf(stationIds).delete()
    await db.stations.bulkDelete(stationIds)
    await db.rounds.delete(roundId)
  })
}
