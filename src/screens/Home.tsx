import { go } from '../router'

declare const __APP_VERSION__: string

export function Home() {
  return (
    <main className="screen home">
      <div className="brand">
        <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden>
          <ellipse cx="32" cy="38" rx="26" ry="9" fill="#ff7a1a" />
          <ellipse cx="32" cy="33" rx="26" ry="9" fill="#ff9a3d" />
          <ellipse cx="32" cy="31" rx="10" ry="3.4" fill="#000" opacity=".25" />
        </svg>
        <h1>Clay Scores</h1>
      </div>
      <nav className="home-menu">
        <button className="btn btn-primary btn-xl" onClick={go.newRound}>Create New Round</button>
        <button className="btn btn-primary btn-xl" onClick={go.openRound}>Open Existing Round</button>
        <button className="btn btn-secondary btn-xl" onClick={go.newCourse}>Create New Course</button>
        <button className="btn btn-secondary btn-xl" onClick={go.newShooter}>Create New Shooter</button>
      </nav>
      <p className="version">v{__APP_VERSION__}</p>
    </main>
  )
}
