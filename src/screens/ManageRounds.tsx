/**
 * Manage Existing Rounds: list of rounds (newest first) with Open and Delete.
 * Delete always asks for confirmation in an on-screen dialog first.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { deleteRound } from '../actions'
import { db } from '../db'
import { countRecorded, formatDateTime, squadOf } from '../logic'
import { go } from '../router'
import { Screen, TopBar, errorText, useToast } from '../ui'

interface RoundSummary {
  id: number
  courseName: string
  location: string
  when: string
  squad: string
  stationCount: number
  stationsScored: number
  totalTargets: number
  recorded: number // hits + misses entered, across all shooters
}

export function ManageRounds() {
  const rounds = useLiveQuery(async (): Promise<RoundSummary[]> => {
    const rounds = await db.rounds.orderBy('roundDate').reverse().toArray() // newest first
    const courses = new Map((await db.courses.toArray()).map((c) => [c.id, c]))
    const shooters = new Map((await db.shooters.toArray()).map((s) => [s.id, s.name]))
    const stations = await db.stations.toArray()
    const targets = await db.targets.toArray()
    return rounds.map((r) => {
      const st = stations.filter((s) => s.roundId === r.id)
      const stIds = new Set(st.map((s) => s.id))
      const course = courses.get(r.courseId)
      return {
        id: r.id,
        courseName: course?.courseName ?? '(deleted course)',
        location: course?.location ?? '',
        when: formatDateTime(r.roundDate),
        squad: squadOf(r).map((m) => shooters.get(m.shooterId) ?? '?').join(', '),
        stationCount: r.stationCount,
        stationsScored: st.filter((s) => s.targetCount > 0).length,
        totalTargets: st.reduce((sum, s) => sum + s.targetCount, 0),
        recorded: targets.filter((t) => stIds.has(t.stationId)).reduce((sum, t) => sum + countRecorded(t.results), 0),
      }
    })
  })
  const [toDelete, setToDelete] = useState<RoundSummary | null>(null)
  const [toast, showToast] = useToast()

  async function confirmDelete() {
    if (!toDelete) return
    const label = `${toDelete.courseName} · ${toDelete.when}`
    try {
      await deleteRound(toDelete.id)
      showToast(`Deleted ${label}`)
    } catch (e) {
      showToast(errorText(e))
    }
    setToDelete(null)
  }

  if (!rounds) return null
  return (
    <>
      <TopBar title="Rounds" />
      <Screen>
        <button className="btn btn-primary btn-xl" onClick={go.newRound}>+ Create New Round</button>
        {rounds.length === 0 ? (
          <p className="empty-note">No rounds yet.</p>
        ) : (
          <ul className="record-list" aria-label="Rounds">
            {rounds.map((r) => (
              <li key={r.id} className="round-card">
                <div className="record-main">
                  <span className="record-title">{r.courseName}</span>
                  <span className="round-when">{r.when}{r.location && <> · {r.location}</>}</span>
                  <span className="record-sub">{r.squad}</span>
                  <span className="record-sub">
                    {r.stationsScored} of {r.stationCount} stations scored · {r.totalTargets} targets
                  </span>
                </div>
                <div className="round-actions">
                  <button className="btn btn-secondary btn-delete" onClick={() => setToDelete(r)} aria-label={`Delete round ${r.courseName} ${r.when}`}>
                    Delete
                  </button>
                  <button className="btn btn-primary" onClick={() => go.round(r.id)} aria-label={`Open round ${r.courseName} ${r.when}`}>
                    Open
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Screen>
      {toDelete && <ConfirmDelete round={toDelete} onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />}
      {toast}
    </>
  )
}

/** On-screen confirmation (pop-up browser dialogs are unreliable on phones). */
function ConfirmDelete({ round, onCancel, onConfirm }: { round: RoundSummary; onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus() // the safe choice gets focus
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="del-title" aria-describedby="del-body" onClick={(e) => e.stopPropagation()}>
        <h2 id="del-title">Delete this round?</h2>
        <div id="del-body">
          <p className="dialog-round">
            <strong>{round.courseName}</strong>
            <br />
            {round.when}
            {round.location && <> · {round.location}</>}
            <br />
            {round.squad}
          </p>
          <p>
            {round.recorded > 0
              ? `This permanently erases ${round.recorded} recorded target results across ${round.stationsScored} ${round.stationsScored === 1 ? 'station' : 'stations'}.`
              : 'This round has no scores recorded yet.'}{' '}
            <strong>This can't be undone.</strong>
          </p>
        </div>
        <div className="actions">
          <button ref={cancelRef} className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete round</button>
        </div>
      </div>
    </div>
  )
}
