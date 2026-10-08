import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { buildEventRows } from '../utils/lp'

export function useLpPositions(portfolioId) {
  const [positions, setPositions] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!portfolioId) { setPositions([]); setSnapshots([]); setEvents([]); return }
    setLoading(true)
    const [pos, snaps, evs] = await Promise.all([
      supabase.from('lp_positions')
        .select('*, token0:assets!lp_positions_token0_id_fkey(*), token1:assets!lp_positions_token1_id_fkey(*)')
        .eq('portfolio_id', portfolioId).order('created_at'),
      supabase.from('lp_snapshots').select('*').eq('portfolio_id', portfolioId).order('ts'),
      supabase.from('lp_events').select('*').eq('portfolio_id', portfolioId).order('ts'),
    ])
    setPositions(pos.data ?? [])
    setSnapshots(snaps.data ?? [])
    setEvents(evs.data ?? [])
    setLoading(false)
  }, [portfolioId])

  useEffect(() => { load() }, [load])

  // Events are derived from snapshots, so after any snapshot change we rebuild the persisted copy.
  async function rebuildEvents(position, positionSnapshots) {
    const rows = buildEventRows(position, positionSnapshots)
    const del = await supabase.from('lp_events').delete().eq('position_id', position.id)
    if (del.error) return { error: del.error }
    if (!rows.length) return { error: null }
    return supabase.from('lp_events').insert(rows)
  }

  async function createPosition(fields) {
    const { error } = await supabase.from('lp_positions').insert({ ...fields, portfolio_id: portfolioId })
    if (!error) await load()
    return { error }
  }

  async function addSnapshot(position, fields) {
    const existing = snapshots.filter(s => s.position_id === position.id)
    // Validate the whole history with the new snapshot before writing anything.
    try {
      buildEventRows(position, [...existing, { ...fields, id: 'new' }])
    } catch (e) {
      return { error: e }
    }
    const { data, error } = await supabase.from('lp_snapshots')
      .insert({ ...fields, position_id: position.id, portfolio_id: portfolioId })
      .select().single()
    if (error) return { error }
    const res = await rebuildEvents(position, [...existing, data])
    await load()
    return { error: res.error }
  }

  async function deleteSnapshot(position, snapshotId) {
    const remaining = snapshots.filter(s => s.position_id === position.id && s.id !== snapshotId)
    try {
      buildEventRows(position, remaining)
    } catch (e) {
      return { error: e }
    }
    const { error } = await supabase.from('lp_snapshots').delete().eq('id', snapshotId)
    if (error) return { error }
    const res = await rebuildEvents(position, remaining)
    await load()
    return { error: res.error }
  }

  async function deletePosition(positionId) {
    const { error } = await supabase.from('lp_positions').delete().eq('id', positionId)
    if (!error) await load()
    return { error }
  }

  return { positions, snapshots, events, loading, createPosition, addSnapshot, deleteSnapshot, deletePosition, reload: load }
}
