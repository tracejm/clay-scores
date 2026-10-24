/**
 * Minimal "hash" router: the current screen is kept in the part of the URL
 * after '#', e.g.  #/round/3/station/2 . Using the hash means the phone's
 * Back gesture works, and no web-server configuration is needed.
 */
import { useSyncExternalStore } from 'react'

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const getPath = () => window.location.hash.replace(/^#/, '') || '/'

export function usePath(): string {
  return useSyncExternalStore(subscribe, getPath, getPath)
}

export function navigate(path: string, replace = false) {
  if (replace) window.location.replace('#' + path)
  else window.location.hash = path
  window.scrollTo(0, 0)
}

export const go = {
  home: () => navigate('/'),
  courses: (replace = false) => navigate('/courses', replace),
  course: (id: number) => navigate(`/course/${id}`),
  newCourse: () => navigate('/course/new'),
  shooters: (replace = false) => navigate('/shooters', replace),
  shooter: (id: number) => navigate(`/shooter/${id}`),
  newShooter: () => navigate('/shooter/new'),
  newRound: () => navigate('/round/new'),
  openRound: () => navigate('/round/open'),
  round: (id: number, replace = false) => navigate(`/round/${id}`, replace),
  station: (roundId: number, n: number, replace = false) => navigate(`/round/${roundId}/station/${n}`, replace),
}
