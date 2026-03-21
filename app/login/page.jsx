'use client'
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    // TODO: connect to Supabase auth when keys arrive
    console.log('logging in with', email, password)
    setLoading(false)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: '#0f0f0f',
      fontFamily: 'sans-serif',
      color: 'white'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>StudySnap</h1>
      <p style={{ color: '#888', marginBottom: '32px' }}>
        Turn your lectures into quizzes
      </p>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          padding: '12px',
          margin: '6px',
          width: '300px',
          borderRadius: '8px',
          border: '1px solid #333',
          backgroundColor: '#1a1a1a',
          color: 'white',
          fontSize: '16px'
        }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          padding: '12px',
          margin: '6px',
          width: '300px',
          borderRadius: '8px',
          border: '1px solid #333',
          backgroundColor: '#1a1a1a',
          color: 'white',
          fontSize: '16px'
        }}
      />

      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          padding: '12px 40px',
          marginTop: '16px',
          backgroundColor: '#6366f1',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          cursor: 'pointer',
          width: '300px'
        }}
      >
        {loading ? 'Logging in...' : 'Log In'}
      </button>

      <p style={{ marginTop: '20px', color: '#888' }}>
        Don&apos;t have an account?{' '}
        <a href="/signup" style={{ color: '#6366f1' }}>Sign up</a>
      </p>
    </div>
  )
}