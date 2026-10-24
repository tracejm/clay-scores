/** Picks which screen to show based on the current address (see router.ts). */
import { usePath } from './router'
import { Home } from './screens/Home'
import { EditCourse, EditShooter, ManageCourses, ManageShooters } from './screens/MasterData'
import { NewRound, OpenRound } from './screens/RoundSetup'
import { RoundScreen, StationScreen } from './screens/Round'

export default function App() {
  const path = usePath()
  let m: RegExpMatchArray | null

  if (path === '/courses') return <ManageCourses />
  if (path === '/course/new') return <EditCourse key="new" />
  if ((m = path.match(/^\/course\/(\d+)$/))) return <EditCourse key={m[1]} id={Number(m[1])} />
  if (path === '/shooters') return <ManageShooters />
  if (path === '/shooter/new') return <EditShooter key="new" />
  if ((m = path.match(/^\/shooter\/(\d+)$/))) return <EditShooter key={m[1]} id={Number(m[1])} />
  if (path === '/round/new') return <NewRound />
  if (path === '/round/open') return <OpenRound />
  if ((m = path.match(/^\/round\/(\d+)\/station\/(\d+)$/))) return <StationScreen roundId={Number(m[1])} stationNumber={Number(m[2])} />
  if ((m = path.match(/^\/round\/(\d+)$/))) return <RoundScreen roundId={Number(m[1])} />
  return <Home />
}
