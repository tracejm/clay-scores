/** Screen 4 (Create New Round). Opening/deleting rounds is in ManageRounds.tsx. */
import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { createRound } from '../actions'
import { COURSE_TYPE_LABEL, db } from '../db'
import { DEFAULT_STATION_COUNT, FIVE_STAND, MAX_SQUAD, isFiveStand, toDateTimeInput, toMinute } from '../logic'
import { go } from '../router'
import { Actions, ErrorBox, Field, Screen, Stepper, TopBar, errorText } from '../ui'

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

export function NewRound() {
  // useLiveQuery re-runs the query (and redraws) whenever the table changes.
  const courses = useLiveQuery(() => db.courses.toArray().then((c) => c.sort((a, b) => byText(a.courseName, b.courseName) || byText(a.location, b.location))))
  const shooters = useLiveQuery(() => db.shooters.toArray().then((s) => s.sort((a, b) => byText(a.name, b.name))))

  const [courseId, setCourseId] = useState('')
  const [when, setWhen] = useState(() => toDateTimeInput(toMinute(Date.now())))
  const [stationCount, setStationCount] = useState(DEFAULT_STATION_COUNT)
  const [rotate, setRotate] = useState(true)
  const [shooterIds, setShooterIds] = useState<string[]>(Array(MAX_SQUAD).fill(''))
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      const id = await createRound({
        courseId: courseId ? Number(courseId) : null,
        roundDate: when ? new Date(when).getTime() : null,
        stationCount,
        rotateShooters: rotate,
        shooterIds: shooterIds.map((s) => (s ? Number(s) : null)),
      })
      go.round(id, true) // replace, so Back doesn't return to this form
    } catch (err) {
      setError(errorText(err))
    }
  }

  if (!courses || !shooters) return null
  const course = courses.find((c) => String(c.id) === courseId)
  const fiveStand = isFiveStand(course?.courseType)
  const missing = courses.length === 0 ? 'course' : shooters.length === 0 ? 'shooter' : null

  return (
    <>
      <TopBar title="New Round" />
      <Screen>
        {missing ? (
          <div className="empty">
            <p>You need at least one {missing} before creating a round.</p>
            <button className="btn btn-primary" onClick={missing === 'course' ? go.newCourse : go.newShooter}>
              Create New {missing === 'course' ? 'Course' : 'Shooter'}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="form">
            <Field label="Course">
              <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setError(null) }}>
                <option value="">Select a course…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.location ? `${c.courseName} — ${c.location}` : c.courseName}
                    {isFiveStand(c.courseType) ? ` (${COURSE_TYPE_LABEL.FIVE_STAND})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date & time">
              <input type="datetime-local" value={when} onChange={(e) => { setWhen(e.target.value); setError(null) }} />
            </Field>
            {fiveStand && (
              <p className="note">5-Stand: 5 stations of 5 targets, shooters don't rotate.</p>
            )}
            <div className="field">
              <span className="field-label">Stations</span>
              {fiveStand ? (
                <output className="step-value locked">{FIVE_STAND.stations}</output>
              ) : (
                <Stepper label="stations" value={stationCount} min={1} max={30} onChange={setStationCount} />
              )}
            </div>
            <label className={`check ${fiveStand ? 'check-locked' : ''}`}>
              <input
                type="checkbox"
                id="rotate-shooters"
                checked={fiveStand ? false : rotate}
                disabled={fiveStand}
                onChange={(e) => setRotate(e.target.checked)}
              />
              <span>
                Rotate shooters at each station
                <small>{(fiveStand ? false : rotate) ? 'First shooter changes each station (A,B,C → B,C,A …)' : 'Same order at every station (A,B,C)'}</small>
              </span>
            </label>
            {shooterIds.map((sid, i) => (
              <Field key={i} label={i === 0 ? 'Shooter 1 (required)' : `Shooter ${i + 1}`}>
                <select
                  value={sid}
                  onChange={(e) => {
                    const next = [...shooterIds]
                    next[i] = e.target.value
                    setShooterIds(next)
                    setError(null)
                  }}
                >
                  <option value="">{i === 0 ? 'Select a shooter…' : '— none —'}</option>
                  {shooters.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
            ))}
            <ErrorBox message={error} />
            <Actions>
              <button type="button" className="btn btn-secondary" onClick={go.home}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={submit}>Save</button>
            </Actions>
          </form>
        )}
      </Screen>
    </>
  )
}
