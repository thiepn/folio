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
    rows=(await blocks(page)).filter(b=>b.source==='klips')
    if(rows.length!==1||rows[0].id!==retainedId)throw new Error('KLIPS source identity lost on reload.')
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
    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true})
    await mobile.goto(origin,{waitUntil:'domcontentloaded'})
    await mobile.locator('#main-content').waitFor()
    await mobile.locator('.mobile-nav').getByRole('button',{name:'Calendar'}).click()
    await mobile.locator('.calendar-c2-sources').waitFor()
    const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2)
    if(overflow)throw new Error('Calendar C2 mobile horizontal overflow.')
    if(errors.length)throw new Error('C2 runtime page errors: '+errors.join('; '))
    console.log('C2_BROWSER_PASS desktop local feed preview/apply/reload/update + mobile Calendar')
  }finally{await browser.close()}
})().catch(error=>{console.error('C2_BROWSER_FAIL',error);process.exit(1)})
