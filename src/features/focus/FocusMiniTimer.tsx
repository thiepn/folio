import { useEffect, useState } from 'react'
import type { FocusSessionEntity } from '../../domain/models'
import { countdownReached, focusDisplaySeconds, focusPhaseLabel, formatFocusClock } from './focusLogic'

export function FocusMiniTimer({session,onOpen,onPause,onResume,onNext}:{session:FocusSessionEntity;onOpen:()=>void;onPause:(id:string)=>void;onResume:(id:string)=>void;onNext:(id:string)=>void}){
  const [now,setNow]=useState(Date.now())
  useEffect(()=>{if(session.status!=='running')return;const timer=window.setInterval(()=>setNow(Date.now()),500);return()=>window.clearInterval(timer)},[session.id,session.status])
  const reached=countdownReached(session,now)
  useEffect(()=>{if(reached&&session.status==='running')onPause(session.id)},[reached,session.id,session.status,onPause])
  const phase=session.mode==='pomodoro'?focusPhaseLabel(session.phase):session.mode==='countdown'?'Countdown':'Focus'
  return <aside className={`focus-mini-timer ${session.status==='paused'?'is-paused':''}`} aria-label="Active focus timer">
    <button className="focus-mini-timer__main" onClick={onOpen}><span>{phase}</span><strong>{session.taskTitleSnapshot??'Focus session'}</strong><time>{formatFocusClock(focusDisplaySeconds(session,now))}</time></button>
    <div>{reached&&session.mode==='pomodoro'?<button onClick={()=>onNext(session.id)}>Next</button>:session.status==='running'?<button onClick={()=>onPause(session.id)}>Pause</button>:<button onClick={()=>onResume(session.id)}>Resume</button>}<button onClick={onOpen}>Open</button></div>
  </aside>
}
