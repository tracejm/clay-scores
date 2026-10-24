/**
 * Manage Courses / Manage Shooters (master data).
 * Each has a list screen (tap a row to edit, or "Add") and an edit screen
 * that is used both for new records and for corrections.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import { saveCourse, saveShooter } from '../actions'
import { db, type Round } from '../db'
import { go } from '../router'
import { Actions, ErrorBox, Field, Screen, TopBar, errorText } from '../ui'

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })
const plural = (n: number) => (n === 1 ? '1 round' : `${n} rounds`)

/** Number of rounds that use each shooter (any of the 5 slots). */
function shooterUsage(rounds: Round[]) {
  const counts = new Map<number, number>()
  for (const r of rounds) {
    const ids = new Set([r.shooter1Id, r.shooter2Id, r.shooter3Id, r.shooter4Id, r.shooter5Id].filter((x) => x != null))
    for (const id of ids) counts.set(id!, (counts.get(id!) ?? 0) + 1)
  }
  return counts
}

// ---------------------------------------------------------------- Courses

export function ManageCourses() {
  const data = useLiveQuery(async () => {
    const courses = (await db.courses.toArray()).sort((a, b) => byText(a.courseName, b.courseName) || byText(a.location, b.location))
    const rounds = await db.rounds.toArray()
    return courses.map((c) => ({ ...c, rounds: rounds.filter((r) => r.courseId === c.id).length }))
  })
  if (!data) return null
  return (
    <>
      <TopBar title="Courses" />
      <Screen>
        <button className="btn btn-primary btn-xl" onClick={go.newCourse}>+ Add New Course</button>
        {data.length === 0 ? (
          <p className="empty-note">No courses yet.</p>
        ) : (
          <ul className="record-list" aria-label="Courses">
            {data.map((c) => (
              <li key={c.id}>
                <button className="record" onClick={() => go.course(c.id)}>
                  <span className="record-main">
                    <span className="record-title">{c.courseName}</span>
                    <span className="record-sub">{c.location || 'No location'} · {plural(c.rounds)}</span>
                  </span>
                  <span className="record-edit">Edit ›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Screen>
    </>
  )
}

export function EditCourse({ id }: { id?: number }) {
  const existing = useLiveQuery(async () => (id != null ? ((await db.courses.get(id)) ?? null) : null), [id])
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Fill the fields once the record has loaded.
  useEffect(() => {
    if (existing) {
      setName(existing.courseName)
      setLocation(existing.location)
    }
  }, [existing])

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    try {
      await saveCourse(name, location, id)
      go.courses(true)
    } catch (err) {
      setError(errorText(err))
    }
  }

  if (id != null && existing === undefined) return null // still loading
  if (id != null && !existing) return <Missing what="course" />
  return (
    <>
      <TopBar title={id != null ? 'Edit Course' : 'New Course'} sub="Courses" onSub={() => go.courses(true)} />
      <Screen>
        <form onSubmit={submit} className="form">
          <Field label="Course name">
            <input id="course-name" value={name} onChange={(e) => { setName(e.target.value); setError(null) }} autoComplete="off" autoCapitalize="words" enterKeyHint="next" />
          </Field>
          <Field label="Location">
            <input id="course-location" value={location} onChange={(e) => { setLocation(e.target.value); setError(null) }} placeholder="e.g. Granite Falls, WA" autoComplete="off" autoCapitalize="words" enterKeyHint="done" />
          </Field>
          {id != null && <p className="note">Changes apply to every round played at this course.</p>}
          <ErrorBox message={error} />
          <Actions>
            <button type="button" className="btn btn-secondary" onClick={() => go.courses(true)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => submit()}>Save</button>
          </Actions>
        </form>
      </Screen>
    </>
  )
}

// ---------------------------------------------------------------- Shooters

export function ManageShooters() {
  const data = useLiveQuery(async () => {
    const shooters = (await db.shooters.toArray()).sort((a, b) => byText(a.name, b.name))
    const usage = shooterUsage(await db.rounds.toArray())
    return shooters.map((s) => ({ ...s, rounds: usage.get(s.id) ?? 0 }))
  })
  if (!data) return null
  return (
    <>
      <TopBar title="Shooters" />
      <Screen>
        <button className="btn btn-primary btn-xl" onClick={go.newShooter}>+ Add New Shooter</button>
        {data.length === 0 ? (
          <p className="empty-note">No shooters yet.</p>
        ) : (
          <ul className="record-list" aria-label="Shooters">
            {data.map((s) => (
              <li key={s.id}>
                <button className="record" onClick={() => go.shooter(s.id)}>
                  <span className="record-main">
                    <span className="record-title">{s.name}</span>
                    <span className="record-sub">{plural(s.rounds)}</span>
                  </span>
                  <span className="record-edit">Edit ›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Screen>
    </>
  )
}

export function EditShooter({ id }: { id?: number }) {
  const existing = useLiveQuery(async () => (id != null ? ((await db.shooters.get(id)) ?? null) : null), [id])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (existing) setName(existing.name)
  }, [existing])

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    try {
      await saveShooter(name, id)
      go.shooters(true)
    } catch (err) {
      setError(errorText(err))
    }
  }

  if (id != null && existing === undefined) return null
  if (id != null && !existing) return <Missing what="shooter" />
  return (
    <>
      <TopBar title={id != null ? 'Edit Shooter' : 'New Shooter'} sub="Shooters" onSub={() => go.shooters(true)} />
      <Screen>
        <form onSubmit={submit} className="form">
          <Field label="Shooter name">
            <input id="shooter-name" value={name} onChange={(e) => { setName(e.target.value); setError(null) }} autoComplete="off" autoCapitalize="words" enterKeyHint="done" />
          </Field>
          {id != null && <p className="note">The new name appears in every round this shooter is in.</p>}
          <ErrorBox message={error} />
          <Actions>
            <button type="button" className="btn btn-secondary" onClick={() => go.shooters(true)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => submit()}>Save</button>
          </Actions>
        </form>
      </Screen>
    </>
  )
}

function Missing({ what }: { what: string }) {
  return (
    <>
      <TopBar title="Not found" />
      <Screen>
        <p className="empty-note">That {what} no longer exists.</p>
      </Screen>
    </>
  )
}
