/** Picks which screen to show based on the current address (see router.ts). */
import { usePath } from './router'
import { Home } from './screens/Home'
import { NewCourse, NewShooter } from './screens/MasterData'
import { NewRound, OpenRound } from './screens/RoundSetup'
import { RoundScreen, StationScreen } from './screens/Round'

export default function App() {
  const path = usePath()
  let m: RegExpMatchArray | null

  if (path === '/course/new') return <NewCourse />
  if (path === '/shooter/new') return <NewShooter />
  if (path === '/round/new') return <NewRound />
  if (path === '/round/open') return <OpenRound />
  if ((m = path.match(/^\/round\/(\d+)\/station\/(\d+)$/))) return <StationScreen roundId={Number(m[1])} stationNumber={Number(m[2])} />
  if ((m = path.match(/^\/round\/(\d+)$/))) return <RoundScreen roundId={Number(m[1])} />
  return <Home />
}
