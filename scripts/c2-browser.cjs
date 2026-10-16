/** Focused C2 acceptance on a local production preview, no real accounts or feed URLs. */
const { chromium } = require('playwright-core')
const origin='http://127.0.0.1:4173/'
const sample=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:KLIPS Browser Test',
'BEGIN:VEVENT','UID:browser-lecture','SUMMARY:Browser lecture',
'DTSTART;TZID=Europe/Berlin:20261016T090000','DTEND;TZID=Europe/Berlin:20261016T100000','END:VEVENT',
'END:VCALENDAR'].join('\r\n')
async function blocks(page){
  return page.evaluate(async()=>{
    const request=indexedDB.open('folio')
    const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
    const rows=await new Promise((resolve,reject)=>{const q=db.transaction('timeBlocks','readonly').objectStore('timeBlocks').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})
    db.close();return rows
  })
}
;(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
  try {
    const page=await browser.newPage({viewport:{width:1280,height:850}})
    const errors=[]
    page.on('pageerror',e=>errors.push(String(e)))
    await page.goto(origin,{waitUntil:'domcontentloaded'})
    await page.locator('#main-content').waitFor()
    await page.locator('.sidebar').getByRole('button',{name:'Calendar'}).click()
    const section=page.locator('.calendar-c2-sources')
    await section.waitFor()
    await section.getByRole('button',{name:'Manage connections'}).click()
    await section.getByRole('button',{name:'Add KLIPS source'}).click()
    await section.getByLabel('From').fill('2026-10-12')
    await section.getByLabel('Through').fill('2026-10-20')
    await section.getByLabel('Or paste complete .ics content').fill(sample)
    await section.getByRole('button',{name:'Preview timetable refresh'}).click()
    await page.waitForFunction(()=>document.querySelector('.calendar-c2-preview')?.textContent?.includes('create: 1'))
    if((await blocks(page)).some(b=>b.source==='klips'))throw new Error('Preview mutated timeBlocks before confirmation.')
    await section.getByRole('button',{name:'Apply verified refresh'}).click()
    await page.waitForFunction(()=>document.querySelector('.calendar-c2-sources')?.textContent?.includes('Timetable updated: 1 added'))
    let rows=(await blocks(page)).filter(b=>b.source==='klips')
    if(rows.length!==1||rows[0].title!=='Browser lecture')throw new Error('KLIPS event not durably inserted.')
    const retainedId=rows[0].id
    await page.reload({waitUntil:'domcontentloaded'})
    await page.locator('#main-content').waitFor()
    await page.locator('.sidebar').getByRole('button',{name:'Calendar'}).click()
    await page.locator('.calendar-c2-sources').waitFor()
    await page.locator('.calendar-c2-sources').getByRole('button',{name:'Manage connections'}).click()
    rows=(await blocks(page)).filter(b=>b.source==='klips')
    if(rows.length!==1||rows[0].id!==retainedId)throw new Error('KLIPS source identity lost on reload.')
    // Source filtering changes only the visible calendar, never event storage.
    await page.getByLabel('Selected calendar date').fill('2026-10-16')
    const klipsChoice=page.locator('.calendar-c2-source-choice').filter({hasText:'KLIPS'})
    await klipsChoice.waitFor()
    const dayBrief=page.locator('.calendar-c2-day-brief')
    await dayBrief.getByText('Browser lecture').waitFor()
    const sevenDay=page.locator('.calendar-c2-week-strip__days button')
    if(await sevenDay.count()!==7)throw new Error('Seven-day overview missing dates.')
    const availabilityBefore=await page.locator('.calendar-v2-summary').textContent()
    const nextWeekBefore=await page.locator('.calendar-c2-week-strip').textContent()
    await klipsChoice.locator('input').uncheck()
    await dayBrief.getByText('No events shown from selected sources.').waitFor()
    if((await blocks(page)).filter(b=>b.source==='klips').length!==1)
      throw new Error('Source filter deleted a subscribed event.')
    if((await page.locator('.calendar-c2-week-strip').textContent())!==nextWeekBefore)
      throw new Error('Source visibility incorrectly changed next-week workload.')
    if((await page.locator('.calendar-v2-summary').textContent())!==availabilityBefore)
      throw new Error('Calendar source filter changed real availability.')
    await klipsChoice.locator('input').check()
    await dayBrief.getByText('Browser lecture').waitFor()
    const sectionAgain=page.locator('.calendar-c2-sources')
    await sectionAgain.getByLabel('From').fill('2026-10-12')
    await sectionAgain.getByLabel('Through').fill('2026-10-20')
    await sectionAgain.getByLabel('Or paste complete .ics content').fill(sample.replace('SUMMARY:Browser lecture','SUMMARY:Browser lecture changed'))
    await sectionAgain.getByRole('button',{name:'Preview timetable refresh'}).click()
    await page.waitForFunction(()=>document.querySelector('.calendar-c2-preview')?.textContent?.includes('update: 1'))
    await sectionAgain.getByRole('button',{name:'Apply verified refresh'}).click()
    await page.waitForFunction(()=>document.querySelector('.calendar-c2-sources')?.textContent?.includes('Timetable updated: 0 added, 1 changed'))
    rows=(await blocks(page)).filter(b=>b.source==='klips')
    if(rows.length!==1||rows[0].id!==retainedId||rows[0].title!=='Browser lecture changed')throw new Error('Feed revision failed to update stable event ID.')
    await page.locator('.calendar-v2').getByRole('button',{name:/Browser lecture changed/}).first().click()
    await page.getByText('External calendar event · read-only').waitFor()
    await page.getByRole('button',{name:'Close'}).last().click()
    const external=page.locator('.calendar-block-v2').filter({hasText:'Browser lecture changed'})
    if(await external.locator('.calendar-block-v2__resize').count())throw new Error('External KLIPS event exposes resize handle.')
    // Open-tab KLIPS revalidation: provider URL never persists.
    const privateUrl='https://klips2.uni-koeln.de/ics/token-private-test'
    let currentSample=sample.replace('SUMMARY:Browser lecture','SUMMARY:Browser lecture changed')
    await page.route(privateUrl,async route=>route.fulfill({status:200,contentType:'text/calendar',
      headers:{'Access-Control-Allow-Origin':'*'},body:currentSample}))
    await sectionAgain.getByLabel(/Refresh automatically while this tab is open/).check()
    await sectionAgain.getByLabel(/KLIPS HTTPS iCal URL/).fill(privateUrl)
    await sectionAgain.getByRole('button',{name:'Preview timetable refresh'}).click()
    await page.waitForFunction(()=>document.querySelector('.calendar-c2-preview')?.textContent?.includes('unchanged: 1'))
    await sectionAgain.getByRole('button',{name:'Apply verified refresh'}).click()
    await sectionAgain.getByText(/Open-tab subscription: active/).waitFor()
    currentSample=sample.replace('SUMMARY:Browser lecture','SUMMARY:Browser lecture final')
    await sectionAgain.getByRole('button',{name:'Retry refresh now'}).click()
    await sectionAgain.getByText(/Updated 0 new, 1 changed, 0 removed/).waitFor()
    rows=(await blocks(page)).filter(b=>b.source==='klips')
    if(rows.length!==1||rows[0].title!=='Browser lecture final')throw new Error('Session refresh did not update timetable.')
    const leaked=await page.evaluate(async()=>{
      const request=indexedDB.open('folio')
      const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
      const values=await new Promise((resolve,reject)=>{const q=db.transaction('settings','readonly').objectStore('settings').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})
      db.close()
      return JSON.stringify(values).includes('token-private-test')||JSON.stringify(localStorage).includes('token-private-test')
    })
    if(leaked)throw new Error('KLIPS capability URL persisted in local settings or storage.')
    await page.reload({waitUntil:'domcontentloaded'})
    await page.locator('#main-content').waitFor()
    await page.locator('.sidebar').getByRole('button',{name:'Calendar'}).click()
    await page.locator('.calendar-c2-sources').waitFor()
    await page.locator('.calendar-c2-sources').getByRole('button',{name:'Manage connections'}).click()
    if(await page.getByText(/Open-tab subscription: active/).count())throw new Error('Private source session survived reload.')
    // Real native event -> unsent Google intent -> cancel, without OAuth or network.
    await page.getByRole('button',{name:'+ Event'}).click()
    const eventModal=page.getByRole('dialog',{name:'Add calendar event'})
    await eventModal.getByLabel('Title').fill('Provider export test')
    await eventModal.getByRole('button',{name:'Add event'}).click()
    const panel=page.locator('.calendar-google-workspace')
    await panel.waitFor()
    if(!(await panel.getByText(/disconnected/).count()))throw new Error('Google panel falsely claims a live connection.')
    const eventPicker=panel.getByLabel('Folio event to prepare for Google')
    await page.waitForFunction(()=>[...document.querySelectorAll('.calendar-google-workspace option')]
      .some(n=>n.textContent?.includes('Provider export test')))
    const selectedId=await eventPicker.evaluate(el=>[...el.options].find(x=>x.textContent.includes('Provider export test'))?.value)
    if(!selectedId)throw new Error('Native event absent in Google preparation.')
    await eventPicker.selectOption(selectedId)
    await panel.getByRole('button',{name:'Prepare local export (not sent)'}).click()
    await panel.getByText(/Prepared local unsent export/).waitFor()
    await panel.getByText(/1 unsent operations/).waitFor()
    if(await panel.getByText(/No Google access has been granted/).count()!==1)
      throw new Error('Google authorization disclosure missing.')
    await panel.getByRole('button',{name:'Cancel unsent'}).click()
    await panel.getByText(/Unsent operation cancelled/).waitFor()
    await panel.getByText(/0 unsent operations/).waitFor()
    // C3: original TimeBlock store, review-first multi-day allocation and guarded undo.
    await page.evaluate(async()=>{
      const req=indexedDB.open('folio')
      const db=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)})
      const stamp='2026-10-16T09:00:00.000Z'
      await new Promise((res,rej)=>{
        const tx=db.transaction(['tasks','timeBlocks'],'readwrite')
        tx.objectStore('tasks').put({
          id:'browser-c3-study',title:'C3 coursework allocation',description:'',status:'todo',
          priority:'high',plannedDate:'2026-10-17',deadline:'2026-10-20',
          estimatedMinutes:180,tags:[],tagIds:[],checklist:[],comments:[],activity:[],
          progressMode:'manual',progressPercent:0,sourceUrl:undefined,location:undefined,
          pinned:false,blockedByTaskIds:[],sortOrder:0,rescheduleCount:0,timelineMilestone:false,
          createdAt:stamp,updatedAt:stamp
        })
        tx.objectStore('timeBlocks').put({
          id:'browser-c3-occupied',kind:'event',title:'C3 imported class',
          source:'klips',sourceCalendar:'klips:browser-synthetic',
          sourceUid:'external:class',start:'2026-10-17T09:00:00.000Z',
          end:'2026-10-17T10:00:00.000Z',createdAt:stamp,updatedAt:stamp
        })
        tx.oncomplete=res;tx.onerror=()=>rej(tx.error)
      })
      db.close()
    })
    await page.reload({waitUntil:'domcontentloaded'})
    await page.locator('#main-content').waitFor()
    await page.locator('.sidebar').getByRole('button',{name:'Calendar'}).click()
    await page.getByLabel('Selected calendar date').fill('2026-10-17')
    const c3task=page.locator('.calendar-task-card').filter({hasText:'C3 coursework allocation'})
    await c3task.waitFor()
    await c3task.getByRole('button',{name:'Spread work'}).click()
    const c3dialog=page.getByRole('dialog',{name:'Spread task over multiple days'})
    await c3dialog.waitFor()
    await c3dialog.getByText('3 sessions').waitFor()
    const proposed=await c3dialog.locator('.calendar-c3-spread__item').allTextContents()
    if(proposed.length!==3||!proposed[0].includes('10:00'))
      throw new Error('C3 proposal did not respect imported class occupancy or daily distribution: '+proposed.join('; '))
    if((await blocks(page)).filter(b=>b.taskId==='browser-c3-study').length)
      throw new Error('C3 preview wrote time blocks without confirmation.')
    await c3dialog.getByRole('button',{name:'Confirm all sessions'}).click()
    await page.locator('.calendar-c3-receipt').getByText(/3 work sessions created/).waitFor()
    const allocated=(await blocks(page)).filter(b=>b.taskId==='browser-c3-study')
    if(allocated.length!==3||new Set(allocated.map(b=>b.start.slice(0,10))).size!==3)
      throw new Error('C3 batch commit not atomic/unique across days.')
    await page.locator('.calendar-c3-receipt').getByRole('button',{name:'Undo allocation'}).click()
    await page.locator('.calendar-c3-receipt').waitFor({state:'detached'})
    if((await blocks(page)).some(b=>b.taskId==='browser-c3-study'))
      throw new Error('C3 undo did not remove all created sessions.')
    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
    await mobile.goto(origin,{waitUntil:'domcontentloaded'})
    await mobile.locator('#main-content').waitFor()
    await mobile.locator('.mobile-nav').getByRole('button',{name:'Calendar'}).click()
    await mobile.locator('.calendar-c2-sources').waitFor()
    await mobile.locator('.calendar-c2-sources').getByRole('button',{name:'Manage connections'}).click()
    if(await mobile.locator('.calendar-c2-week-strip__days button').count()!==7)
      throw new Error('Mobile seven-day navigation not available.')
    await mobile.locator('.calendar-c2-week-strip__days button').nth(1).click()
    if(await mobile.getByLabel('Selected calendar date').inputValue()!=='2026-10-17')
      throw new Error('Mobile seven-day date selection did not navigate.')
    const recurringSection=mobile.getByRole('region',{name:'Recurring work and flexible habits'})
    await recurringSection.waitFor()
    await recurringSection.getByRole('button',{name:'Review seven-day commitments'}).click()
    await recurringSection.getByRole('region',{name:'Flexible habit targets'}).waitFor()
    await recurringSection.getByRole('region',{name:'Materialized recurring tasks'}).waitFor()
    // Native mobile allocation controls: no desktop-only drag dependency.
    await mobile.evaluate(async()=>{
      const req=indexedDB.open('folio')
      const db=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)})
      await new Promise((res,rej)=>{
        const tx=db.transaction('tasks','readwrite')
        tx.objectStore('tasks').put({
          id:'c3-mobile-task',title:'Mobile batch task',description:'',status:'todo',
          priority:'normal',plannedDate:'2026-10-17',deadline:'2026-10-20',
          estimatedMinutes:120,tags:[],tagIds:[],checklist:[],comments:[],activity:[],
          progressMode:'manual',progressPercent:0,pinned:false,
          blockedByTaskIds:[],sortOrder:0,rescheduleCount:0,timelineMilestone:false,
          createdAt:'2026-10-16T09:00:00.000Z',updatedAt:'2026-10-16T09:00:00.000Z'
        })
        tx.oncomplete=res;tx.onerror=()=>rej(tx.error)
      })
      db.close()
    })
    await mobile.reload({waitUntil:'domcontentloaded'})
    await mobile.locator('#main-content').waitFor()
    await mobile.locator('.mobile-nav').getByRole('button',{name:'Calendar'}).click()
    await mobile.getByLabel('Selected calendar date').fill('2026-10-17')
    const mobileTask=mobile.locator('.calendar-task-card').filter({hasText:'Mobile batch task'})
    await mobileTask.waitFor()
    await mobileTask.getByRole('button',{name:'Spread work'}).click()
    const mobilePlan=mobile.getByRole('dialog',{name:'Spread task over multiple days'})
    await mobilePlan.waitFor()
    await mobilePlan.getByText('2 sessions').waitFor()
    if(await mobile.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2))
      throw new Error('C3 mobile allocation dialog overflows viewport.')
    await mobilePlan.getByRole('button',{name:'Close multi-day planner'}).click()
    const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)
    if(overflow)throw new Error('Calendar C2 mobile horizontal overflow.')
    if(errors.length)throw new Error('C2 runtime page errors: '+errors.join('; '))
    console.log('C2_BROWSER_PASS desktop local feed preview/apply/reload/update + mobile Calendar')
  }finally{await browser.close()}
})().catch(error=>{console.error('C2_BROWSER_FAIL',error);process.exit(1)})
