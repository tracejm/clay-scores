/**
 * Local database (IndexedDB via Dexie).
 *
 * Everything is stored ON THE PHONE, inside the browser's IndexedDB storage.
 * Nothing is sent to the internet, so the app works with no cell signal.
 *
 * The tables mirror the drawDB_ClayAppDiagram.pdf design:
 *   courses  (COURSES_B)  - master data
 *   shooters (SHOOTERS_B) - master data
 *   rounds   (ROUNDS_B)   - transaction header
 *   stations (STATION_B)  - one row per station in a round
 *   targets  (TARGET_B)   - one row per shooter per station, 12 target results
 */
import Dexie, { type EntityTable } from 'dexie'

/** The four possible values for a single target (TARGET_1 .. TARGET_12). */
export type TargetResult = 'HIT' | 'MISS' | 'NA' | null

/** Kind of round. 5-Stand fixes the layout at 5 stations x 5 targets. */
export type CourseType = 'SPORTING_CLAYS' | 'FIVE_STAND'
export const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  SPORTING_CLAYS: 'Sporting Clays',
  FIVE_STAND: '5-Stand',
}

export interface Course {
  id: number
  courseName: string
  location: string
}

export interface Shooter {
  id: number
  name: string
  /** Lower-cased, trimmed copy of name, used to enforce unique names. */
  nameKey: string
}

export interface Round {
  id: number
  /** Date/time of the round, stored as milliseconds since 1970 (to the minute). */
  roundDate: number
  courseId: number
  stationCount: number
  /** Chosen when the round is created. */
  courseType: CourseType
  /** true: first shooter rotates each station (A,B,C -> B,C,A ...). false: always A,B,C. */
  rotateShooters: boolean
  shooter1Id: number
  shooter2Id: number | null
  shooter3Id: number | null
  shooter4Id: number | null
  shooter5Id: number | null
}

export interface Station {
  id: number
  roundId: number
  stationNumber: number
  /** 0 means "not set yet"; otherwise 1..12. */
  targetCount: number
  breakageCount: number
  /** Targets shown to the squad before shooting ("look" or "show" birds). Not scored. */
  lookCount: number
  /** Practice targets thrown at the station. Not scored. */
  practiceCount: number
  /** Free-text notes about the station. */
  notes: string
}

export interface TargetRow {
  id: number
  stationId: number
  shooterId: number
  /**
   * Squad position (1-5) of the shooter. The spec allows the same shooter to be
   * picked in two slots, so the slot (not the shooter id) identifies the row.
   */
  slot: number
  /** results[0] = TARGET_1 ... results[11] = TARGET_12 */
  results: TargetResult[]
}

export const db = new Dexie('ClayScores') as Dexie & {
  courses: EntityTable<Course, 'id'>
  shooters: EntityTable<Shooter, 'id'>
  rounds: EntityTable<Round, 'id'>
  stations: EntityTable<Station, 'id'>
  targets: EntityTable<TargetRow, 'id'>
}

// Schema: '++id' = auto-increment primary key; other names are indexes
// (columns we look things up by). '&' means the index must be unique.
const STORES = {
  courses: '++id, courseName',
  shooters: '++id, &nameKey',
  rounds: '++id, roundDate, courseId, [courseId+roundDate]',
  stations: '++id, roundId, [roundId+stationNumber]',
  targets: '++id, stationId, [stationId+slot]',
}
db.version(1).stores(STORES)

// Version 2 (app v0.4.0) added course type, rotate-shooters, look/practice
// targets and notes. The first time an updated app opens, this fills in
// sensible values for everything already saved on the phone. Nothing is lost.
db.version(2)
  .stores(STORES)
  .upgrade(async (tx) => {
    await tx.table('courses').toCollection().modify((c) => {
      c.courseType ??= 'SPORTING_CLAYS'
    })
    await tx.table('rounds').toCollection().modify((r) => {
      r.courseType ??= 'SPORTING_CLAYS'
      r.rotateShooters ??= true // old rounds always rotated
    })
    await tx.table('stations').toCollection().modify((s) => {
      s.lookCount ??= 0
      s.practiceCount ??= 0
      s.notes ??= ''
    })
  })

// Version 3 (app v0.5.0): course type moved from the course to the round.
// Rounds already have their own type; just remove the old value from courses.
db.version(3)
  .stores(STORES)
  .upgrade(async (tx) => {
    await tx.table('courses').toCollection().modify((c) => {
      delete c.courseType
    })
  })
