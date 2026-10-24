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
db.version(1).stores({
  courses: '++id, courseName',
  shooters: '++id, &nameKey',
  rounds: '++id, roundDate, courseId, [courseId+roundDate]',
  stations: '++id, roundId, [roundId+stationNumber]',
  targets: '++id, stationId, [stationId+slot]',
})
