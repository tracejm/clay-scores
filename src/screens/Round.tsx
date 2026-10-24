/** Screen 7 (Stations / round overview) and Screen 8 (Individual Station). */
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { setStationCounter, setStationNotes, setStationTargets, tapTarget, type StationCounter } from '../actions'
import { COURSE_TYPE_LABEL, db, type Course, type Round, type Shooter, type Station, type TargetResult, type TargetRow } from '../db'
import {
  DEFAULT_STATION_TARGETS, MAX_TARGETS, MIN_TARGETS, activeCircleCount, buildEmail, countHits,
  countRecorded, formatDateTime, isFiveStand, mailtoUrl, orderForStation, squadOf,
} from '../logic'
import { go } from '../router'
import { Screen, Stepper, TopBar, errorText, useToast } from '../ui'

/** Loads everything about one round; redraws automatically when data changes. */
function useRound(roundId: number) {
  return useLiveQuery(async () => {
    const round = await db.rounds.get(roundId)
    if (!round) return { round: undefined } as const
    const course = await db.courses.get(round.courseId)
    const shooters = new Map((await db.shooters.toArray()).map((s) => [s.id, s]))
    const stations = (await db.stations.where('roundId').equals(roundId).toArray()).sort((a, b) => a.stationNumber - b.stationNumber)
    const targets = await db.targets.where('stationId').anyOf(stations.map((s) => s.id)).toArray()
    return { round, course, shooters, stations, targets }
  }, [roundId])
}

function NotFound() {
  return (
    <>
      <TopBar title="Not found" />
      <Screen>
        <div className="empty"><p>That round no longer exists.</p></div>
      </Screen>
    </>
  )
}

export function RoundScreen({ roundId }: { roundId: number }) {
  const data = useRound(roundId)
  if (!data) return null
  if (!data.round) return <NotFound />
  const { round, course, shooters, stations, targets } = data
  const squad = squadOf(round)
  const totalTargets = stations.reduce((s, st) => s + st.targetCount, 0)
  const total = (f: (st: Station) => number) => stations.reduce((n, st) => n + (f(st) || 0), 0)
  const rowsFor = (stationId: number) => targets.filter((t) => t.stationId === stationId)

  return (
    <>
      <TopBar title={`${course?.courseName ?? 'Round'} · ${formatDateTime(round.roundDate)}`} />
      <Screen>
        <p className="round-info">
          {COURSE_TYPE_LABEL[round.courseType ?? 'SPORTING_CLAYS']} · {round.rotateShooters === false ? 'Shooters don’t rotate' : 'Shooters rotate each station'}
        </p>
        <div className="station-grid">
          {stations.map((st) => {
            const rows = rowsFor(st.id)
            const done = st.targetCount > 0 && rows.length > 0 && rows.every((r) => countRecorded(r.results) >= st.targetCount)
            const state = st.targetCount === 0 ? 'unset' : done ? 'done' : 'started'
            return (
              <button key={st.id} className={`station-btn ${state}`} onClick={() => go.station(roundId, st.stationNumber)}>
                <span className="station-num">{st.stationNumber}</span>
                <span className="station-meta">
                  {st.targetCount === 0 ? 'not set' : `${st.targetCount} tgts`}
                  {done && ' ✓'}
                </span>
                {st.notes?.trim() && <span className="station-note-flag">✎ note</span>}
              </button>
            )
          })}
        </div>

        <section className="totals" aria-label="Current totals">
          <h2>Current Totals</h2>
          <dl className="totals-counts">
            <div><dt>Targets</dt><dd>{totalTargets}</dd></div>
            <div><dt>Breakage</dt><dd>{total((st) => st.breakageCount)}</dd></div>
            <div><dt>Look</dt><dd>{total((st) => st.lookCount)}</dd></div>
            <div><dt>Practice</dt><dd>{total((st) => st.practiceCount)}</dd></div>
          </dl>
          <ul>
            {squad.map((m) => {
              const hits = stations.reduce((sum, st) => sum + countHits(rowsFor(st.id).find((r) => r.slot === m.slot)?.results ?? []), 0)
              return (
                <li key={m.slot}>
                  <span>{shooters.get(m.shooterId)?.name ?? '?'}</span>
                  <strong>{hits}</strong>
                </li>
              )
            })}
          </ul>
        </section>

        <EmailExport email={buildEmail({ round, course, shooters, stations, targets })} />
      </Screen>
    </>
  )
}

export function StationScreen({ roundId, stationNumber }: { roundId: number; stationNumber: number }) {
  const data = useRound(roundId)
  if (!data) return null
  if (!data.round) return <NotFound />
  const station = data.stations.find((s) => s.stationNumber === stationNumber)
  if (!station) return <NotFound />
  // `key` resets the screen's local state when moving to another station.
  return <StationBody key={station.id} data={data as RoundData} stationId={station.id} />
}

interface RoundData {
  round: Round
  course: Course | undefined
  shooters: Map<number, Shooter>
  stations: Station[]
  targets: TargetRow[]
}

function StationBody({ data, stationId }: { data: RoundData; stationId: number }) {
  const { round, course, shooters, stations, targets } = data
  const station = stations.find((s) => s.id === stationId)!
  const [pending, setPending] = useState(station.targetCount || DEFAULT_STATION_TARGETS)
  const [toast, showToast] = useToast()
  const isSet = station.targetCount > 0
  const needsConfirm = pending !== station.targetCount

  const fiveStand = isFiveStand(round.courseType)
  const order = orderForStation(round, station.stationNumber)
  const rows = targets.filter((t) => t.stationId === station.id)

  const [lossWarning, setLossWarning] = useState<string | null>(null)

  async function confirm(acceptLoss = false) {
    try {
      // If recorded results would be cleared, show an on-screen warning first.
      const done = await setStationTargets(station.id, pending, (msg) => {
        if (!acceptLoss) setLossWarning(msg)
        return acceptLoss
      })
      if (done) setLossWarning(null)
    } catch (e) {
      showToast(errorText(e))
    }
  }

  async function tap(row: TargetRow, i: number) {
    try {
      await tapTarget(row.id, i, station.targetCount)
    } catch (e) {
      showToast(errorText(e))
    }
  }

  const prev = station.stationNumber > 1 ? station.stationNumber - 1 : null
  const next = station.stationNumber < round.stationCount ? station.stationNumber + 1 : null

  return (
    <>
      <TopBar
        title={`Station ${station.stationNumber}`}
        sub={`${course?.courseName ?? 'Round'} · ${formatDateTime(round.roundDate)}`}
        onSub={() => go.round(round.id)}
      />
      <Screen>
        {fiveStand ? (
          <div className="target-bar">
            <span className="target-bar-label">Targets</span>
            <span className="locked-count">{station.targetCount} <small>(5-Stand)</small></span>
          </div>
        ) : (
          <div className={`target-bar ${needsConfirm ? 'pending' : ''}`}>
            <span className="target-bar-label">Targets</span>
            <Stepper label="targets" value={pending} min={MIN_TARGETS} max={MAX_TARGETS} onChange={(v) => { setPending(v); setLossWarning(null) }} />
            <button className="confirm-btn" onClick={() => confirm()} disabled={!needsConfirm} aria-label="Confirm number of targets">
              ✓
            </button>
          </div>
        )}
        {lossWarning && (
          <div className="error">
            <p className="warn-text">{lossWarning}</p>
            <div className="actions">
              <button className="btn btn-secondary" onClick={() => { setLossWarning(null); setPending(station.targetCount) }}>Keep {station.targetCount}</button>
              <button className="btn btn-danger" onClick={() => confirm(true)}>Use {pending}</button>
            </div>
          </div>
        )}
        {!isSet && <p className="hint">Set the number of targets, then tap ✓ to start scoring.</p>}
        {isSet && needsConfirm && !lossWarning && <p className="hint">Tap ✓ to change targets to {pending}.</p>}

        {isSet &&
          order.map((m) => {
            const row = rows.find((r) => r.slot === m.slot)
            const results: TargetResult[] = row?.results ?? Array(MAX_TARGETS).fill('NA')
            return (
              <section key={m.slot} className="shooter">
                <div className="shooter-bar">
                  <span>{shooters.get(m.shooterId)?.name ?? '?'}</span>
                  <span className="shooter-score">
                    {countHits(results)}<small> / {station.targetCount}</small>
                  </span>
                </div>
                <TargetGrid results={results} targetCount={station.targetCount} onTap={(i) => row && tap(row, i)} />
              </section>
            )
          })}

        <section className="extras" aria-label="Not scored">
          <h2 className="extras-title">Not scored</h2>
          <CounterBar station={station} field="breakageCount" label="Broken targets" />
          <CounterBar station={station} field="lookCount" label="Look targets" />
          <CounterBar station={station} field="practiceCount" label="Practice targets" />
        </section>

        <StationNotes station={station} />

        <nav className="station-nav">
          <button className="btn btn-secondary" disabled={!prev} onClick={() => prev && go.station(round.id, prev, true)}>‹ Station {prev ?? ''}</button>
          <button className="btn btn-secondary" disabled={!next} onClick={() => next && go.station(round.id, next, true)}>Station {next ?? ''} ›</button>
        </nav>
      </Screen>
      {toast}
    </>
  )
}

/** A − n + row for one of the non-scoring counts at a station. Saved immediately. */
function CounterBar({ station, field, label }: { station: Station; field: StationCounter; label: string }) {
  return (
    <div className="breakage-bar">
      <span className="target-bar-label">{label}</span>
      <Stepper label={label.toLowerCase()} value={station[field] ?? 0} min={0} max={99} onChange={(v) => setStationCounter(station.id, field, v)} />
    </div>
  )
}

/**
 * Free-text notes for the station. Typing is kept on screen and saved shortly
 * after you pause (and when you leave the box), so nothing is lost.
 */
function StationNotes({ station }: { station: Station }) {
  const [text, setText] = useState(station.notes ?? '')
  const [saved, setSaved] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef(text)

  const save = () => {
    clearTimeout(timer.current)
    setStationNotes(station.id, latest.current).then(() => setSaved(true))
  }
  // Save any unsaved typing when leaving the station.
  useEffect(() => () => {
    if (latest.current !== (station.notes ?? '')) setStationNotes(station.id, latest.current)
    clearTimeout(timer.current)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="field notes">
      <label className="field-label" htmlFor={`notes-${station.id}`}>
        Notes {text && <span className="notes-status">{saved ? 'Saved' : 'Saving…'}</span>}
      </label>
      <textarea
        id={`notes-${station.id}`}
        value={text}
        rows={3}
        maxLength={2000}
        placeholder="e.g. Long crosser left to right, second bird drops fast"
        onChange={(e) => {
          setText(e.target.value)
          latest.current = e.target.value
          setSaved(false)
          clearTimeout(timer.current)
          timer.current = setTimeout(save, 600)
        }}
        onBlur={save}
      />
    </div>
  )
}

/**
 * True when the app is shown inside another page's frame (e.g. the claude.ai
 * test preview). Such frames can't open the mail app, so we show the text instead.
 */
function inFrame(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/**
 * Email export.
 *  - "Email Round Results" is a real mailto: link. The phone hands it to the
 *    default mail app; the app page itself is never replaced.
 *  - "Share" opens the phone's share menu (Gmail, Messages, WhatsApp...).
 *  - "Show email text" displays the text with a Copy button.
 */
function EmailExport({ email }: { email: { subject: string; body: string } }) {
  const framed = inFrame()
  const canShare = !framed && typeof navigator.share === 'function'
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const full = `${email.subject}\n\n${email.body}`

  async function share() {
    try {
      await navigator.share({ title: email.subject, text: email.body })
    } catch {
      /* user closed the share menu: nothing to do */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(full)
      setCopied(true)
    } catch {
      // Clipboard blocked: select the text so the user can copy it by hand.
      const pre = document.querySelector('.email-preview pre')
      if (pre) window.getSelection()?.selectAllChildren(pre)
    }
  }

  return (
    <div className="email-export">
      {framed ? (
        <button className="btn btn-primary btn-xl" onClick={() => setOpen(true)}>
          ✉ Email Round Results
        </button>
      ) : (
        <a className="btn btn-primary btn-xl btn-link" href={mailtoUrl(email.subject, email.body)}>
          ✉ Email Round Results
        </a>
      )}
      {canShare && (
        <button className="btn btn-secondary" onClick={share}>Share results…</button>
      )}
      {!open && <button className="btn btn-secondary" onClick={() => setOpen(true)}>Show email text</button>}
      {open && (
        <section className="email-preview">
          {framed && (
            <p className="hint">
              The test preview can't open your mail app. In the installed app this button opens a new email.
              For now, copy the text below.
            </p>
          )}
          <div className="actions">
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>Hide</button>
            <button className="btn btn-primary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy text'}</button>
          </div>
          <pre>{full}</pre>
        </section>
      )}
    </div>
  )
}

/** 6 columns x 2 rows. Column c holds targets 2c+1 (top) and 2c+2 (bottom). */
function TargetGrid({ results, targetCount, onTap }: { results: TargetResult[]; targetCount: number; onTap: (i: number) => void }) {
  const active = activeCircleCount(targetCount)
  return (
    <div className="target-grid">
      {Array.from({ length: MAX_TARGETS / 2 }, (_, col) => (
        <div key={col} className={`pair ${col * 2 < active ? '' : 'pair-off'}`}>
          {[col * 2, col * 2 + 1].map((i) => {
            const r = results[i]
            const cls = r === 'HIT' ? 'hit' : r === 'MISS' ? 'miss' : r === 'NA' ? 'na' : 'open'
            const label = r === 'HIT' ? '+' : r === 'MISS' ? '−' : r === 'NA' ? '' : String(i + 1)
            return (
              <button
                key={i}
                className={`circle ${cls}`}
                disabled={r === 'NA'}
                onClick={() => onTap(i)}
                aria-label={`Target ${i + 1}: ${r === 'HIT' ? 'hit' : r === 'MISS' ? 'miss' : r === 'NA' ? 'not used' : 'not recorded'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
