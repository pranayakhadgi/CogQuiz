'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const FAKE_DUE_CARDS = [
  { id: 1, question: "What is the powerhouse of the cell?", deck: "Biology 101", difficulty: "easy" },
  { id: 2, question: "What does DNA stand for?", deck: "Biology 101", difficulty: "medium" },
  { id: 3, question: "What is Newton's First Law?", deck: "Physics 101", difficulty: "hard" },
  { id: 4, question: "What is the speed of light?", deck: "Physics 101", difficulty: "easy" },
  { id: 5, question: "What is the Krebs cycle?", deck: "Biology 101", difficulty: "hard" },
]

const FAKE_STATS = {
  streak: 3,
  totalStudied: 24,
  accuracy: 78,
  decks: 2
}

// ── count-up hook (visual only) ──────────────────────────
function useCountUp(target, duration = 1000) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let start = 0
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [target, duration])
  return count
}

export default function DashboardPage() {
  const router = useRouter()
  const [authLoading, setAuthLoading] = useState(true)
  const [dueCards, setDueCards] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)

  // ── YOUR ORIGINAL AUTH — NOT TOUCHED ──────────────────
  useEffect(() => {
    const checkAuth = async () => {
      const fakeUser = null
      setAuthLoading(false)
    }
    checkAuth()
  }, [router])

  // ── YOUR ORIGINAL DATA LOAD — NOT TOUCHED ─────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        setDueCards(FAKE_DUE_CARDS)
        setStats(FAKE_STATS)
      } catch (err) {
        setDueCards(FAKE_DUE_CARDS)
        setStats(FAKE_STATS)
      }
      setLoading(false)
      // trigger fade-in after data loads
      setTimeout(() => setVisible(true), 50)
    }
    loadData()
  }, [])

  // ── YOUR ORIGINAL FUNCTION — NOT TOUCHED ──────────────
  const getDifficultyColor = (difficulty) => {
    if (difficulty === 'easy') return { bg: '#d4edda', text: '#2d6a35' }
    if (difficulty === 'medium') return { bg: '#fff3cd', text: '#856404' }
    return { bg: '#fde8e8', text: '#8b2020' }
  }

  // count-up values (visual only, reads from stats)
  const animatedStreak = useCountUp(stats?.streak ?? 0)
  const animatedAccuracy = useCountUp(stats?.accuracy ?? 0)
  const animatedStudied = useCountUp(stats?.totalStudied ?? 0)
  const animatedDecks = useCountUp(stats?.decks ?? 0)

  // ── YOUR ORIGINAL LOADING STATES — NOT TOUCHED ────────
  if (authLoading) return (
    <div style={{ display:'flex', alignItems:'center',
      justifyContent:'center', height:'100vh',
      backgroundColor:'#f5f0e8', color:'#6B4226',
      fontFamily:"'Inter', sans-serif" }}>
      Checking session...
    </div>
  )

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center',
      justifyContent:'center', height:'100vh',
      backgroundColor:'#f5f0e8', color:'#6B4226',
      fontFamily:"'Inter', sans-serif" }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:'36px', height:'36px',
          border:'3px solid #d4c4b0',
          borderTop:'3px solid #6B4226',
          borderRadius:'50%', margin:'0 auto 12px',
          animation:'spin 0.8s linear infinite' }}/>
        Loading your dashboard...
      </div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f0e8',
      fontFamily: "'Inter', sans-serif",
      boxSizing: 'border-box',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity 0.5s ease, transform 0.5s ease'
    }}>

      {/* ── NAVBAR (new, visual only) ── */}
      <nav style={{
        backgroundColor: '#fffdf7',
        borderBottom: '1px solid #e8ddd0',
        padding: '0 20px',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{
            width: '34px', height: '34px',
            backgroundColor: '#6B4226',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '18px'
          }}>
            📚
          </div>
          <span style={{ fontWeight:'700', color:'#3d2b1f', fontSize:'16px' }}>
            StudySnap
          </span>
        </div>

        <div style={{ display:'flex', gap:'8px' }}>
          <button
            onClick={() => router.push('/upload')}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6B4226',
              color: 'white', border: 'none',
              borderRadius: '8px', fontSize: '13px',
              fontWeight: '600', cursor: 'pointer',
              transition: 'transform 0.15s ease, background-color 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.backgroundColor = '#8B5E3C'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.backgroundColor = '#6B4226'
            }}
          >
            + Upload
          </button>
          <button
            onClick={() => router.push('/quiz')}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              color: '#6B4226',
              border: '1px solid #6B4226',
              borderRadius: '8px', fontSize: '13px',
              fontWeight: '600', cursor: 'pointer',
              transition: 'transform 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            Study Now
          </button>
        </div>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <div style={{ maxWidth:'560px', margin:'0 auto', padding:'28px 16px' }}>

        {/* Header */}
        <div style={{ marginBottom:'24px' }}>
          <h1 style={{ color:'#3d2b1f', fontSize:'1.8rem',
            fontWeight:'700', margin:'0 0 4px' }}>
            Dashboard
          </h1>
          <p style={{ color:'#8a6a50', margin:0, fontSize:'14px' }}>
            {new Date().toLocaleDateString('en-US',
              { weekday:'long', month:'long', day:'numeric' })}
          </p>
        </div>

        {/* Stats Grid — count-up animation added */}
        {stats && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
            gap:'12px', marginBottom:'28px' }}>

            {[
              { emoji:'🔥', value: animatedStreak, label:'Day streak' },
              { emoji:'🎯', value: `${animatedAccuracy}%`, label:'Accuracy' },
              { emoji:'📚', value: animatedStudied, label:'Cards studied' },
              { emoji:'🗂️', value: animatedDecks, label:'Decks' },
            ].map((stat, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: '#fffdf7',
                  border: '1px solid #e8ddd0',
                  borderRadius: '14px',
                  padding: '18px',
                  boxSizing: 'border-box',
                  cursor: 'default',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  animation: `fadeUp 0.4s ease ${i * 0.08}s both`
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(107,66,38,0.12)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ fontSize:'28px', marginBottom:'4px' }}>{stat.emoji}</div>
                <div style={{ fontSize:'1.8rem', fontWeight:'700',
                  color:'#6B4226', lineHeight:1 }}>
                  {stat.value}
                </div>
                <div style={{ color:'#8a6a50', fontSize:'13px', marginTop:'4px' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Due Today Section */}
        <div style={{ backgroundColor:'#fffdf7',
          border:'1px solid #e8ddd0', borderRadius:'16px',
          padding:'20px', marginBottom:'20px',
          animation:'fadeUp 0.4s ease 0.3s both' }}>

          <div style={{ display:'flex', justifyContent:'space-between',
            alignItems:'center', marginBottom:'16px' }}>
            <h2 style={{ color:'#3d2b1f', fontSize:'1.1rem',
              fontWeight:'600', margin:0 }}>
              Due Today
            </h2>
            <span style={{ backgroundColor:'#6B4226', color:'white',
              borderRadius:'99px', padding:'3px 10px',
              fontSize:'13px', fontWeight:'600' }}>
              {dueCards.length} cards
            </span>
          </div>

          {dueCards.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 0' }}>
              <div style={{ fontSize:'40px', marginBottom:'12px' }}>✅</div>
              <p style={{ color:'#6B4226', fontWeight:'600', margin:'0 0 4px' }}>
                All caught up!
              </p>
              <p style={{ color:'#8a6a50', fontSize:'13px', margin:0 }}>
                No cards due today. Upload more lectures!
              </p>
            </div>
          ) : (
            <>
              {dueCards.map((card, i) => {
                const diff = getDifficultyColor(card.difficulty)
                return (
                  <div
                    key={card.id}
                    style={{
                      padding: '14px',
                      margin: '8px 0',
                      backgroundColor: '#f5f0e8',
                      borderRadius: '10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      animation: `fadeUp 0.3s ease ${0.35 + i * 0.05}s both`
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(107,66,38,0.1)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ color:'#3d2b1f', margin:'0 0 4px',
                        fontSize:'14px', fontWeight:'500',
                        overflow:'hidden', textOverflow:'ellipsis',
                        whiteSpace:'nowrap' }}>
                        {card.question}
                      </p>
                      <p style={{ color:'#8a6a50', margin:0, fontSize:'12px' }}>
                        {card.deck}
                      </p>
                    </div>
                    <span style={{ backgroundColor: diff.bg,
                      color: diff.text, borderRadius:'99px',
                      padding:'3px 10px', fontSize:'12px',
                      fontWeight:'500', whiteSpace:'nowrap' }}>
                      {card.difficulty}
                    </span>
                  </div>
                )
              })}

              <button
                onClick={() => router.push('/quiz')}
                style={{
                  width: '100%', padding: '13px',
                  backgroundColor: '#6B4226', color: 'white',
                  border: 'none', borderRadius: '10px',
                  fontSize: '15px', fontWeight: '600',
                  cursor: 'pointer', marginTop: '16px',
                  transition: 'transform 0.15s ease, background-color 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.backgroundColor = '#8B5E3C'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.backgroundColor = '#6B4226'
                }}
              >
                Start Studying ({dueCards.length} cards) →
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 480px) {
          nav { padding: 0 12px !important; }
        }
      `}</style>
    </div>
  )
}