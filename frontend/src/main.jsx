import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const interestsList = ['Sightseeing', 'Food', 'Culture', 'Nature', 'Adventure', 'History', 'Shopping', 'Relaxation', 'Nightlife', 'Photography']
const today = new Date(); const datePlus = (n) => { const d = new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10) }
const defaults = { destination: 'Jaipur, India', start_date: datePlus(14), end_date: datePlus(16), budget: 18000, currency: 'INR', trip_type: 'solo', group_size: 1, interests: ['Sightseeing','Food','Culture'], pace: 'balanced', accommodation: 'mid-range', notes: '' }
const fmt = (v, c='INR') => new Intl.NumberFormat('en-IN', {style:'currency',currency:c,maximumFractionDigits:0}).format(Number(v||0))
const daysBetween = (a,b) => Math.max(1, Math.round((new Date(b)-new Date(a))/86400000)+1)

async function api(path, options={}) {
  const response = await fetch(`${API}${path}`, { headers: {'Content-Type':'application/json', ...(options.headers||{})}, ...options })
  if (!response.ok) { let message = 'Something went wrong'; try { message = (await response.json()).detail || message } catch {} throw new Error(message) }
  return response.json()
}
function Icon({children}) { return <span className="icon" aria-hidden="true">{children}</span> }
function App() {
  const [form, setForm] = useState(defaults)
  const [page, setPage] = useState('planner')
  const [trip, setTrip] = useState(null)
  const [saved, setSaved] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [activeDay, setActiveDay] = useState(0)
  const [editing, setEditing] = useState(false)
  const [health, setHealth] = useState(null)
  const [search, setSearch] = useState('')

  const loadSaved = async () => { try { setSaved(await api('/api/itineraries')) } catch { setSaved([]) } }
  useEffect(() => { loadSaved(); api('/health').then(setHealth).catch(()=>setHealth({status:'offline'})) }, [])
  const setField = (key, value) => setForm(f => ({...f, [key]: value}))
  const setScenario = (type) => {
    setForm(f => ({...f, trip_type:type, group_size:type==='couple'?2:type==='group'?5:1, budget:type==='couple'?45000:type==='group'?65000:18000, accommodation:type==='couple'?'premium':type==='group'?'budget':'mid-range', interests:type==='couple'?['Food','Nature','Relaxation','Photography']:type==='group'?['Adventure','Culture','Food','Sightseeing']:['Sightseeing','Food','Culture'], pace:type==='couple'?'relaxed':'balanced'}))
    setTrip(null); setPage('planner')
  }
  const generate = async (e) => {
    e?.preventDefault(); setLoading(true); setMessage('Building your itinerary…')
    try {
      const data = await api('/api/itineraries/generate', {method:'POST', body:JSON.stringify({...form, budget:Number(form.budget), group_size:Number(form.group_size)})})
      setTrip(data); setActiveDay(0); setPage('itinerary'); setMessage('Your trip is ready. Make it yours.')
      await loadSaved()
    } catch (err) { setMessage(`Could not generate itinerary: ${err.message}`) } finally { setLoading(false) }
  }
  const saveTrip = async () => {
    if (!trip) return
    setLoading(true)
    try { const updated = await api(`/api/itineraries/${trip.id}`, {method:'PUT', body:JSON.stringify({itinerary:trip})}); setTrip(updated); setMessage('Changes saved.'); await loadSaved() }
    catch (err) { setMessage(`Save failed: ${err.message}`) } finally { setLoading(false) }
  }
  const openTrip = async (id) => { try { const t=await api(`/api/itineraries/${id}`); setTrip(t); setActiveDay(0); setPage('itinerary') } catch(e) { setMessage(e.message) } }
  const removeTrip = async (id) => { try { await api(`/api/itineraries/${id}`,{method:'DELETE'}); await loadSaved(); if(trip?.id===id)setTrip(null); setMessage('Trip deleted.') } catch(e) { setMessage(e.message) } }
  const patchActivity = (dayIndex, activityIndex, key, value) => setTrip(t => ({...t, days:t.days.map((d,di)=>di!==dayIndex?d:{...d,activities:d.activities.map((a,ai)=>ai!==activityIndex?a:{...a,[key]:value})})}))
  const deleteActivity = (dayIndex, activityIndex) => setTrip(t=>({...t,days:t.days.map((d,di)=>di!==dayIndex?d:{...d,activities:d.activities.filter((_,ai)=>ai!==activityIndex)})}))
  const regenerate = async () => { if(!trip)return; setLoading(true); try { const t=await api(`/api/itineraries/${trip.id}/regenerate-day`,{method:'POST',body:JSON.stringify({day_index:activeDay,preferences:form.interests.join(', ')})});setTrip(t);setMessage('Day refreshed with new suggestions.') } catch(e){setMessage(`Could not refresh day: ${e.message}`)}finally{setLoading(false)} }
  const filtered = useMemo(()=>saved.filter(t=>(t.destination+' '+t.title).toLowerCase().includes(search.toLowerCase())),[saved,search])
  const totalActivities = trip?.days?.reduce((sum,d)=>sum+d.activities.length,0)||0

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={()=>setPage('planner')}><span className="brand-mark">w.</span><span>wayfarer<small>TRAVEL, THOUGHTFULLY PLANNED</small></span></button>
      <div className="side-label">WORKSPACE</div>
      <button className={`nav-item ${page==='planner'?'active':''}`} onClick={()=>setPage('planner')}><Icon>✳</Icon> Trip planner</button>
      <button className={`nav-item ${page==='itinerary'?'active':''}`} onClick={()=>trip&&setPage('itinerary')}><Icon>▤</Icon> Current itinerary</button>
      <button className={`nav-item ${page==='saved'?'active':''}`} onClick={()=>{setPage('saved');loadSaved()}}><Icon>♡</Icon> Saved trips <span className="nav-count">{saved.length}</span></button>
      <div className="sidebar-bottom"><div className="mini-card"><div className="mini-icon">✦</div><strong>A little more wonder.</strong><p>Less time planning. More time being there.</p><button onClick={()=>setScenario('couple')}>Plan a getaway ↗</button></div><div className="status-line"><span className={`status-dot ${health?.status==='ok'?'':'muted'}`}></span> {health?.status==='ok'?'Planner systems online':'Local demo mode'}</div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><div className="eyebrow">YOUR NEXT CHAPTER</div><h1>{page==='planner'?'Where to next?':page==='itinerary'?(trip?.destination||'Your itinerary'):'Your saved journeys'}</h1></div><div className="top-actions"><span className="date-pill">✧ Thoughtful travel starts here</span><button className="avatar" title="Your workspace">H</button></div></header>
      {message && <div className="toast" role="status"><span>{message}</span><button onClick={()=>setMessage('')} aria-label="Dismiss">×</button></div>}
      {page==='planner' && <>
        <section className="hero"><div className="hero-content"><div className="hero-kicker"><span></span> YOUR PERSONAL TRAVEL COMPANION</div><h2>Make room for<br/><em>the unexpected.</em></h2><p>A thoughtful itinerary, shaped around your pace, your people, and the things you love.</p><div className="hero-stats"><div><strong>01</strong><span>Tell us what you love</span></div><div><strong>02</strong><span>We shape your days</span></div><div><strong>03</strong><span>Go make memories</span></div></div></div><div className="hero-art"><div className="sun"></div><div className="mountain mountain-back"></div><div className="mountain mountain-front"></div><div className="hero-stamp">TAKE<br/>THE<br/><i>SCENIC</i><br/>ROUTE</div><div className="art-caption">Somewhere worth<br/>getting lost in.</div></div><div className="hero-number">№ 001 — YOUR JOURNEY</div></section>
        <div className="section-heading"><div><div className="eyebrow">START WITH A FEELING</div><h3>What kind of trip are we dreaming up?</h3></div><span className="step-label">STEP 01 <b>—</b> TRAVEL STYLE</span></div>
        <div className="scenario-grid">
          <button className={`scenario-card solo ${form.trip_type==='solo'?'chosen':''}`} onClick={()=>setScenario('solo')}><div className="scenario-visual solo-visual"><span>✳</span><div className="sun-disc"></div><div className="shape-hill"></div><div className="shape-hill second"></div><b>GO YOUR<br/>OWN WAY</b></div><div className="scenario-copy"><div className="scenario-top"><span>01 / SOLO</span><span>↗</span></div><h4>A little time for you</h4><p>Quiet discoveries, spontaneous detours, your own rhythm.</p><span className="scenario-link">Plan a solo escape ↗</span></div></button>
          <button className={`scenario-card couple ${form.trip_type==='couple'?'chosen':''}`} onClick={()=>setScenario('couple')}><div className="scenario-visual couple-visual"><div className="moon"></div><div className="couple-shape">♡</div><div className="couple-caption">JUST US, SOMEWHERE NEW</div></div><div className="scenario-copy"><div className="scenario-top"><span>02 / COUPLE</span><span>↗</span></div><h4>Somewhere, just us</h4><p>Slow mornings, lovely dinners, and moments to keep.</p><span className="scenario-link">Plan a romantic escape ↗</span></div></button>
          <button className={`scenario-card group ${form.trip_type==='group'?'chosen':''}`} onClick={()=>setScenario('group')}><div className="scenario-visual group-visual"><div className="group-sun"></div><div className="group-arch"></div><div className="group-people">●　●　●</div><b>BETTER<br/>TOGETHER</b></div><div className="scenario-copy"><div className="scenario-top"><span>03 / GROUP</span><span>↗</span></div><h4>The more, the merrier</h4><p>Shared adventures without the group-chat chaos.</p><span className="scenario-link">Plan a group adventure ↗</span></div></button>
        </div>
        <section className="builder-section"><div className="section-heading"><div><div className="eyebrow">THE GOOD DETAILS</div><h3>Let's make it yours.</h3><p className="section-sub">A few details help us turn a destination into your kind of journey.</p></div><span className="step-label">STEP 02 <b>—</b> YOUR DETAILS</span></div>
          <form onSubmit={generate} className="builder-grid"><div className="form-card destination-card"><label htmlFor="destination">WHERE TO? <span>✳</span></label><div className="input-with-icon"><span>⌖</span><input id="destination" required minLength="2" value={form.destination} onChange={e=>setField('destination',e.target.value)} placeholder="A city, region, or country"/></div><small>Dream big or start close to home.</small></div>
            <div className="form-card"><label htmlFor="budget">YOUR TOTAL BUDGET</label><div className="budget-row"><select aria-label="Currency" value={form.currency} onChange={e=>setField('currency',e.target.value)}><option value="INR">₹ INR</option><option value="USD">$ USD</option><option value="AED">AED</option><option value="EUR">€ EUR</option><option value="GBP">£ GBP</option></select><input id="budget" type="number" min="50" max="1000000" required value={form.budget} onChange={e=>setField('budget',e.target.value)}/></div><small>We'll keep your plans mindful of it.</small></div>
            <div className="form-card"><label htmlFor="start">WHEN ARE WE GOING?</label><div className="date-row"><input id="start" type="date" required value={form.start_date} onChange={e=>{setField('start_date',e.target.value);if(e.target.value>form.end_date)setField('end_date',e.target.value)}}/><span>→</span><input aria-label="Return date" type="date" min={form.start_date} required value={form.end_date} onChange={e=>setField('end_date',e.target.value)}/></div><small>{daysBetween(form.start_date,form.end_date)} days of possibility.</small></div>
            <div className="form-card"><label htmlFor="pace">YOUR PACE</label><select id="pace" className="full-select" value={form.pace} onChange={e=>setField('pace',e.target.value)}><option value="relaxed">Slow & unhurried</option><option value="balanced">A little of everything</option><option value="packed">Make every moment count</option></select><small>No wrong way to travel.</small></div>
            <div className="form-card"><label htmlFor="group-size">TRAVEL PARTY</label><div className="party-row"><select value={form.accommodation} onChange={e=>setField('accommodation',e.target.value)} aria-label="Accommodation style"><option value="budget">Budget stay</option><option value="mid-range">Mid-range stay</option><option value="premium">Premium stay</option><option value="not-needed">No stay needed</option></select><label className="party-count" htmlFor="group-size">× <input id="group-size" type="number" min="1" max="30" value={form.group_size} onChange={e=>setField('group_size',e.target.value)} aria-label="Group size"/> people</label></div><small>We’ll tailor the details to your crew.</small></div>
            <div className="form-card interests-card"><label>THINGS THAT MAKE YOU, YOU</label><div className="interest-chips">{interestsList.map(item=><button type="button" key={item} className={`interest-chip ${form.interests.includes(item)?'selected':''}`} onClick={()=>setField('interests',form.interests.includes(item)?form.interests.filter(x=>x!==item):[...form.interests,item].slice(0,8))}>{form.interests.includes(item)?'✓':'+'} {item}</button>)}</div><small>Choose up to 8 interests.</small></div>
            <div className="form-card notes-card"><label htmlFor="notes">ANYTHING ELSE WE SHOULD KNOW?</label><textarea id="notes" value={form.notes} onChange={e=>setField('notes',e.target.value)} placeholder="Dietary needs, a birthday, must-see places, accessibility needs…" rows="3"/><small>Optional — little details can make a big difference.</small></div>
            <div className="submit-card"><div><span className="submit-spark">✳</span><div><strong>Your next great story starts here.</strong><p>Personalized to your interests, pace, and budget.</p></div></div><button className="primary-btn" type="submit" disabled={loading}>{loading?'Putting it together…':'Build my itinerary'} <span>↗</span></button></div>
          </form>
        </section>
        <footer className="footer"><span>WAYFARER © 2026</span><span>MADE FOR THE JOURNEY, NOT JUST THE DESTINATION.</span><span>GO A LITTLE FURTHER ↗</span></footer>
      </>}
      {page==='itinerary' && trip && <section className="itinerary-page"><div className="trip-banner"><div><div className="eyebrow">YOUR JOURNEY, BEAUTIFULLY MAPPED</div><h2>{trip.title}</h2><p>⌖ {trip.destination}　·　{trip.start_date} → {trip.end_date}　·　{trip.days.length} days</p><div className="trip-tags"><span>{trip.trip_type} trip</span><span>{trip.group_size} traveller{trip.group_size===1?'':'s'}</span><span>{trip.generated_by?.startsWith('ai:')?'AI-personalized':'Smart itinerary'}</span></div></div><div className="budget-summary"><small>ESTIMATED TRIP BUDGET</small><strong>{fmt(trip.total_estimate,trip.currency)}</strong><span>of {fmt(trip.budget,trip.currency)} planned</span><div className="budget-bar"><i style={{width:`${Math.min(100,trip.total_estimate/trip.budget*100)}%`}}/></div><button className="outline-btn" onClick={saveTrip} disabled={loading}>↧ Save changes</button></div></div>
        <div className="itinerary-layout"><aside className="day-sidebar"><div className="eyebrow">YOUR DAYS <span>({trip.days.length})</span></div>{trip.days.map((d,i)=><button key={d.date} className={`day-nav ${activeDay===i?'selected':''}`} onClick={()=>setActiveDay(i)}><span className="day-number">{String(i+1).padStart(2,'0')}</span><span><b>{d.label}</b><small>{d.date}</small></span><span className="day-arrow">↗</span></button>)}<div className="trip-tip"><span>✦ A LITTLE TIP</span><p>{trip.disclaimer}</p></div></aside>
          <div className="day-content"><div className="day-head"><div><div className="eyebrow">{trip.days[activeDay]?.date}</div><h3>{trip.days[activeDay]?.theme}</h3><p>{trip.personalization_summary}</p></div><button className="outline-btn" onClick={regenerate} disabled={loading}>⟳ Refresh this day</button></div>
            {(trip.days[activeDay]?.activities||[]).map((a,i)=><div className="activity-card" key={a.id||i}><div className="activity-time"><span className="timeline-dot"></span><span>{a.time}</span><small>{a.duration}</small></div><div className="activity-main"><div className="activity-category">{a.category||'EXPERIENCE'}</div>{editing?<input className="edit-title" value={a.title} onChange={e=>patchActivity(activeDay,i,'title',e.target.value)}/>:<h4>{a.title}</h4>}{editing?<textarea value={a.description} onChange={e=>patchActivity(activeDay,i,'description',e.target.value)}/>:<p>{a.description}</p>}<div className="activity-meta"><span>↗ {a.transport}</span><span className="activity-cost">~ {fmt(a.estimated_cost,trip.currency)}</span></div></div><button className="tiny-action" title="Remove activity" onClick={()=>deleteActivity(activeDay,i)}>×</button></div>)}
            <div className="dining-card"><div className="dining-icon">♨</div><div><div className="eyebrow">A TASTE OF THE PLACE</div><h4>Make time for something delicious.</h4><p><b>Lunch:</b> {trip.days[activeDay]?.dining?.lunch}</p><p><b>Dinner:</b> {trip.days[activeDay]?.dining?.dinner}</p></div></div>
            <div className="day-tip"><span>✳ THE LOCAL NOTE</span><p>{trip.days[activeDay]?.travel_tip}</p></div>
            <div className="itinerary-actions"><button className="outline-btn" onClick={()=>setEditing(v=>!v)}>{editing?'✓ Done editing':'✎ Edit activities'}</button><button className="primary-btn" onClick={saveTrip} disabled={loading}>Save itinerary ↗</button></div>
          </div></div><div className="itinerary-bottom"><div><strong>{totalActivities} thoughtful stops</strong><span> across {trip.days.length} days</span></div><button className="text-btn" onClick={()=>{setPage('planner');setTrip(null)}}>＋ Plan another trip</button></div>
        </section>}
      {page==='itinerary' && !trip && <div className="empty-state"><span>✳</span><h3>Your next story is waiting.</h3><p>Create a trip and your day-by-day itinerary will appear here.</p><button className="primary-btn" onClick={()=>setPage('planner')}>Start planning ↗</button></div>}
      {page==='saved' && <section className="saved-page"><div className="section-heading"><div><div className="eyebrow">THE PLACES YOU'RE TAKING WITH YOU</div><h3>Your saved journeys.</h3><p className="section-sub">Every itinerary is a little possibility waiting to happen.</p></div><button className="primary-btn" onClick={()=>setPage('planner')}>＋ New trip</button></div><div className="saved-toolbar"><span>{saved.length} saved {saved.length===1?'journey':'journeys'}</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search destinations…"/></div>{filtered.length===0?<div className="empty-state"><span>⌖</span><h3>No journeys here just yet.</h3><p>Plan your first trip and save it to keep the details close.</p><button className="primary-btn" onClick={()=>setPage('planner')}>Plan a journey ↗</button></div>:<div className="saved-grid">{filtered.map((t,i)=><article className="saved-card" key={t.id}><div className={`saved-art saved-art-${i%3}`}><span>{t.trip_type.toUpperCase()} JOURNEY</span><b>{t.destination}</b><i>№ {String(i+1).padStart(2,'0')}</i></div><div className="saved-info"><div className="saved-dates">{t.start_date} — {t.end_date}</div><h4>{t.title}</h4><p>{t.days?.length||0} days · {t.group_size||1} traveller(s) · {fmt(t.total_estimate,t.currency)}</p><div className="saved-actions"><button onClick={()=>openTrip(t.id)}>Open itinerary ↗</button><button className="delete-btn" onClick={()=>removeTrip(t.id)} title="Delete trip">Delete</button></div></div></article>)}</div>}</section>}
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>)
