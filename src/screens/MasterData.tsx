/** Screen 2 (Create New Course) and Screen 3 (Create New Shooter). */
import { useState, type FormEvent } from 'react'
import { saveCourse, saveShooter } from '../actions'
import { go } from '../router'
import { Actions, ErrorBox, Field, Screen, TopBar, errorText } from '../ui'

export function NewCourse() {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await saveCourse(name, location)
      go.home()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <>
      <TopBar title="New Course" />
      <Screen>
        <form onSubmit={submit} className="form">
          <Field label="Course name">
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoCapitalize="words" enterKeyHint="next" />
          </Field>
          <Field label="Location">
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Granite Falls, WA" autoComplete="off" autoCapitalize="words" enterKeyHint="done" />
          </Field>
          <ErrorBox message={error} />
          <Actions>
            <button type="button" className="btn btn-secondary" onClick={go.home}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={submit}>Save</button>
          </Actions>
        </form>
      </Screen>
    </>
  )
}

export function NewShooter() {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await saveShooter(name)
      go.home()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <>
      <TopBar title="New Shooter" />
      <Screen>
        <form onSubmit={submit} className="form">
          <Field label="Shooter name">
            <input value={name} onChange={(e) => { setName(e.target.value); setError(null) }} autoComplete="off" autoCapitalize="words" enterKeyHint="done" />
          </Field>
          <ErrorBox message={error} />
          <Actions>
            <button type="button" className="btn btn-secondary" onClick={go.home}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={submit}>Save</button>
          </Actions>
        </form>
      </Screen>
    </>
  )
}
