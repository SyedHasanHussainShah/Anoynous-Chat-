import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

function SystemMessage({ text }) {
  return (
    <div className="text-sm text-gray-500 italic py-1">{text}</div>
  )
}

export default function App() {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [searching, setSearching] = useState(false)
  const [roomId, setRoomId] = useState(null)
  const [role, setRole] = useState(null)
  const [messages, setMessages] = useState([])
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [notice, setNotice] = useState('')
  

  useEffect(() => {
    const s = io(BACKEND_URL, { transports: ['websocket'] })
    setSocket(s)

    s.on('connect', () => {})

    s.on('system', (text) => {
      setMessages((m) => [...m, { type: 'system', text }])
      if (text.includes('Searching')) setSearching(true)
      if (text.includes('connected')) {
        setSearching(false)
        setConnected(true)
      }
    })

    s.on('paired', ({ roomId, role }) => {
      setRoomId(roomId)
      setRole(role)
    })

    s.on('message', ({ from, text, timestamp }) => {
      setMessages((m) => [...m, { type: 'chat', from, text, timestamp }])
    })

    s.on('chat_ended', ({ reason }) => {
      const msg = reason === 'user_request'
        ? 'You disconnected. Click Start Chat to find a new stranger.'
        : 'Stranger disconnected. Click Start Chat to find a new stranger.'
      setNotice(msg)
      setConnected(false)
      setRoomId(null)
      setRole(null)
      setSearching(false)
    })

    return () => {
      s.disconnect()
    }
  }, [])

  

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 5000)
    return () => clearTimeout(t)
  }, [notice])

  const startChat = () => {
    setMessages([])
    setNotice('')
    setRoomId(null)
    setRole(null)
    setSearching(true)
    if (socket && !socket.connected) socket.connect()
    socket?.emit('start_chat')
  }

  const sendMessage = () => {
    const text = inputRef.current.value.trim()
    if (!text) return
    socket?.emit('message', { text })
    inputRef.current.value = ''
  }

  const disconnect = () => {
    socket?.emit('disconnect_request')
    setNotice('You disconnected. Click Start Chat to find a new stranger.')
    setConnected(false)
    setRoomId(null)
    setRole(null)
    setSearching(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-2xl font-semibold">AnonyChat</div>
        </div>
      </header>

      {!connected ? (
        <main className="flex-1">
          <div className="max-w-5xl mx-auto h-full px-6">
            <div className="h-full flex items-center justify-center">
              <div className="relative w-full max-w-md">
                {notice && (
                  <div className="mb-4 bg-slate-800 border border-slate-700 rounded p-3 text-center text-slate-200">{notice}</div>
                )}
                <div className="absolute inset-0 blur-3xl bg-gradient-to-tr from-blue-600/20 via-indigo-600/10 to-cyan-500/10 rounded-xl" aria-hidden></div>
                <div className="relative bg-slate-900/60 backdrop-blur border border-slate-700 rounded-2xl p-8 shadow-xl">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8z"/>
                      </svg>
                    </div>
                    <div className="text-2xl font-extrabold tracking-tight">AnonyChat</div>
                  </div>
                  <p className="text-slate-300">Connect instantly with a random stranger. No sign-up.</p>
                  <div className="mt-6">
                    <button onClick={startChat} className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] transition">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                        <circle cx="16" cy="3" r="3"/>
                      </svg>
                      Start Chat
                    </button>
                  </div>
                  <div className="text-xs text-slate-400 mt-3">Click "Start Chat" to begin.</div>
                  {searching && (
                    <div className="mt-4 flex items-center text-sm text-slate-300">
                      <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      Searching for a stranger…
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1">
          <div className="max-w-5xl mx-auto w-full px-6">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 h-[65vh] flex flex-col">
              <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 modern-scroll">
                {messages.map((m, idx) => (
                  m.type === 'system' ? (
                    <SystemMessage key={idx} text={m.text} />
                  ) : (
                    <div key={idx} className={`w-full flex ${m.from === role ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded ${m.from === role ? 'bg-blue-600 text-white' : 'bg-black text-white'}`}>
                        <div>{m.text}</div>
                        {m.timestamp && (
                          <div className="mt-1 text-xs opacity-75">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        )}
                      </div>
                    </div>
                  )
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input ref={inputRef} type="text" placeholder="Type a message" className="flex-1 border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100" onKeyDown={(e)=>{ if(e.key==='Enter') sendMessage() }} />
                <button onClick={sendMessage} className="px-4 py-2 bg-blue-600 text-white rounded">Send</button>
                <button onClick={disconnect} className="px-4 py-2 bg-red-600 text-white rounded">Disconnect</button>
              </div>
            </div>
          </div>
        </main>
      )}

      <footer className="px-6 py-4 border-t border-slate-800">
        <div className="max-w-5xl mx-auto text-center text-slate-400 text-sm">© 2025 AnonyChat. Chat anonymously and securely.</div>
      </footer>

      <a href="/admin" className="fixed left-6 bottom-6 group">
        <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-slate-800 border border-slate-700 shadow hover:bg-slate-700 transition">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1l3 5 5 1-4 4 1 5-5-3-5 3 1-5-4-4 5-1z"/>
            </svg>
          </div>
          <span className="text-slate-200 text-sm">Admin</span>
        </div>
      </a>
    </div>
  )
}
