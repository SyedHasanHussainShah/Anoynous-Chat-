import { useEffect, useState } from 'react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

export default function Admin() {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState(null)
  const [banIp, setBanIp] = useState('')
  const [banReason, setBanReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  

  useEffect(() => {
  }, [])

  useEffect(() => {
    let t
    function loop() {
      if (connected && autoRefresh && key) fetchStatus(key)
      t = setTimeout(loop, 3000)
    }
    loop()
    return () => { if (t) clearTimeout(t) }
  }, [connected, autoRefresh, key])

  const fetchStatus = async (k=key) => {
    try {
      setLoading(true)
      const res = await fetch(`${BACKEND_URL}/admin?key=${encodeURIComponent(k)}`)
      if (!res.ok) {
        setError(k ? 'Wrong admin key' : 'Admin key must be entered')
        setConnected(false)
        setStatus(null)
        return
      }
      const data = await res.json()
      setStatus(data)
      setError('')
      setConnected(true)
    } catch (e) {
      setError('Server error')
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }

  

  const connectAdmin = async () => {
    const k = key.trim()
    if (!k) {
      setError('Admin key must be entered')
      setConnected(false)
      setStatus(null)
      return
    }
    await fetchStatus(k)
  }

  const submitBan = async () => {
    if (!connected) return
    if (!banIp.trim()) return
    try {
      setLoading(true)
      const res = await fetch(`${BACKEND_URL}/admin/ban?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: banIp.trim(), reason: banReason.trim() || null })
      })
      if (res.ok) {
        setBanIp('')
        setBanReason('')
        fetchStatus()
      }
    } finally {
      setLoading(false)
    }
  }

  const unban = async (ip) => {
    try {
      if (!connected) return
      setLoading(true)
      const res = await fetch(`${BACKEND_URL}/admin/unban?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
      })
      if (res.ok) fetchStatus()
    } finally {
      setLoading(false)
    }
  }

  const statActive = status?.active_rooms?.length || 0
  const statWaiting = status?.waiting_count || 0
  const statBanned = status?.banned_ips?.length || 0

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="px-6 py-4 border-b border-slate-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-xl font-semibold">AnonyChat Admin</div>
          <div className="flex items-center gap-2">
            <input value={key} onChange={(e)=>setKey(e.target.value)} placeholder="Admin key" className="px-3 py-2 rounded bg-slate-800 border border-slate-700" />
            <button onClick={connectAdmin} className="px-3 py-2 bg-blue-600 rounded">Connect</button>
            <button onClick={()=>connected && fetchStatus()} className="px-3 py-2 bg-slate-700 rounded">Refresh</button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoRefresh} onChange={(e)=>setAutoRefresh(e.target.checked)} /> Auto refresh
            </label>
          </div>
        </div>
      </header>

      <main className="px-6">
        <div className="max-w-6xl mx-auto py-6">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-200 rounded p-3 mb-4">{error}</div>
          )}

          {!connected ? (
            <div className="bg-slate-800 border border-slate-700 rounded p-6 text-center">
              <div className="text-lg">Admin key must be entered</div>
              <div className="text-slate-400 mt-2">Enter the key above and click Connect.</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-800 border border-slate-700 rounded p-4">
                  <div className="text-sm text-slate-400">Active Rooms</div>
                  <div className="text-2xl font-bold">{statActive}</div>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded p-4">
                  <div className="text-sm text-slate-400">Waiting Queue</div>
                  <div className="text-2xl font-bold">{statWaiting}</div>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded p-4">
                  <div className="text-sm text-slate-400">Banned IPs</div>
                  <div className="text-2xl font-bold">{statBanned}</div>
                </div>
              </div>

              <div className="mt-6 bg-slate-800 border border-slate-700 rounded p-4">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <div className="text-sm text-slate-400">IP to ban</div>
                    <input value={banIp} onChange={(e)=>setBanIp(e.target.value)} className="w-full border border-slate-700 rounded px-3 py-2 bg-slate-900" placeholder="203.0.113.5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-slate-400">Reason</div>
                    <input value={banReason} onChange={(e)=>setBanReason(e.target.value)} className="w-full border border-slate-700 rounded px-3 py-2 bg-slate-900" placeholder="spam" />
                  </div>
                  <button disabled={loading} onClick={submitBan} className="px-4 py-2 bg-red-600 text-white rounded">{loading ? '...' : 'Ban'}</button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-800 border border-slate-700 rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">Active Rooms</div>
                    <div className="text-sm text-slate-400">Total: {statActive}</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-slate-400">
                        <tr>
                          <th className="text-left py-2">Room</th>
                          <th className="text-left py-2">IPs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {status?.active_rooms?.length ? status.active_rooms.map((r) => (
                          <tr key={r.room_id} className="border-t border-slate-700">
                            <td className="py-2 font-mono">{r.room_id}</td>
                            <td className="py-2">{r.ips.join(' , ')}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan="2" className="py-4 text-slate-400">No active rooms</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">Banned IPs</div>
                    <div className="text-sm text-slate-400">Total: {statBanned}</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-slate-400">
                        <tr>
                          <th className="text-left py-2">IP</th>
                          <th className="text-left py-2">Reason</th>
                          <th className="text-left py-2">Time</th>
                          <th className="text-left py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {status?.banned_ips?.length ? status.banned_ips.map((b) => (
                          <tr key={b.id} className="border-t border-slate-700">
                            <td className="py-2 font-mono">{b.ip_address}</td>
                            <td className="py-2">{b.reason || '—'}</td>
                            <td className="py-2">{b.timestamp}</td>
                            <td className="py-2"><button disabled={loading} onClick={()=>unban(b.ip_address)} className="px-3 py-1 bg-slate-700 rounded">Unban</button></td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan="4" className="py-4 text-slate-400">No bans</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
