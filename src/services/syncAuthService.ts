import { FOLIO_SYNC_CLOUD } from '../config/syncCloud'

export interface SyncAuthSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  userId: string
  email?: string
}

const STORAGE_KEY='folio:sync-auth:v1'
let refreshPromise:Promise<SyncAuthSession|null>|null=null

function read():SyncAuthSession|null{
  try{
    const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return null
    const value=JSON.parse(raw) as SyncAuthSession
    if(!value.accessToken||!value.refreshToken||!value.userId)return null
    return value
  }catch{return null}
}
function write(session:SyncAuthSession|null){
  if(session)localStorage.setItem(STORAGE_KEY,JSON.stringify(session))
  else localStorage.removeItem(STORAGE_KEY)
}
function normalize(data:any):SyncAuthSession|null{
  if(!data?.access_token||!data?.refresh_token||!data?.user?.id)return null
  return {
    accessToken:data.access_token,
    refreshToken:data.refresh_token,
    expiresAt:Date.now()+Math.max(60,Number(data.expires_in)||3600)*1000,
    userId:data.user.id,
    email:data.user.email,
  }
}
async function authFetch(path:string,body:unknown,token?:string){
  const response=await fetch(FOLIO_SYNC_CLOUD.url+path,{
    method:'POST',
    headers:{
      apikey:FOLIO_SYNC_CLOUD.publishableKey,
      'Content-Type':'application/json',
      ...(token?{Authorization:'Bearer '+token}:{}),
    },
    body:JSON.stringify(body),
  })
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||'Sync authentication failed.')
  return data
}

export const syncAuthService={
  getStoredSession(){return read()},

  async signUp(email:string,password:string){
    const value=email.trim().toLowerCase()
    if(!value||password.length<8)throw new Error('Use a valid email and a password of at least 8 characters.')
    const data=await authFetch('/auth/v1/signup',{email:value,password})
    const session=normalize(data)
    if(session)write(session)
    return {session,confirmationRequired:!session,userEmail:data?.user?.email??value}
  },

  async signIn(email:string,password:string){
    const value=email.trim().toLowerCase()
    if(!value||!password)throw new Error('Email and password are required.')
    const data=await authFetch('/auth/v1/token?grant_type=password',{email:value,password})
    const session=normalize(data)
    if(!session)throw new Error('Supabase did not return a sync session.')
    write(session)
    return session
  },

  async refresh(){
    if(refreshPromise)return refreshPromise
    refreshPromise=(async()=>{
      const current=read();if(!current)return null
      try{
        const data=await authFetch('/auth/v1/token?grant_type=refresh_token',{refresh_token:current.refreshToken})
        const session=normalize(data);if(!session)throw new Error('Sync session refresh failed.')
        write(session);return session
      }catch(error){write(null);throw error}
      finally{refreshPromise=null}
    })()
    return refreshPromise
  },

  async getValidSession(){
    const current=read();if(!current)return null
    if(current.expiresAt-Date.now()>90_000)return current
    return this.refresh()
  },

  async signOut(){
    const current=read()
    try{
      if(current)await authFetch('/auth/v1/logout',{},current.accessToken)
    }catch{/* Local sign-out must still succeed when offline or already expired. */}
    write(null)
  },
}
