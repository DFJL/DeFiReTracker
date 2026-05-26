import { useState, useEffect } from 'react'
import { fetchPolymarketPositions } from '../lib/polymarketService'

function addrKey(portfolioId)        { return `pmkt_addresses_${portfolioId ?? 'global'}` }
function consolidateKey(portfolioId)  { return `pmkt_consolidate_${portfolioId ?? 'global'}` }
function pusdKey(portfolioId)         { return `pmkt_pusd_${portfolioId ?? 'global'}` }

export function usePolymarket(portfolioId) {
  const [addresses, setAddresses] = useState([])
  const [positions, setPositions] = useState([])
  const [proxyWallets, setProxyWallets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [consolidate, setConsolidateState] = useState(false)
  const [pusdInput, setPusdInputState] = useState('')

  useEffect(() => {
    try { setAddresses(JSON.parse(localStorage.getItem(addrKey(portfolioId)) ?? '[]')) }
    catch { setAddresses([]) }
    setConsolidateState(localStorage.getItem(consolidateKey(portfolioId)) === 'true')
    setPusdInputState(localStorage.getItem(pusdKey(portfolioId)) ?? '')
    setPositions([])
    setProxyWallets([])
    setError(null)
  }, [portfolioId])

  useEffect(() => {
    if (!addresses.length) { setPositions([]); setProxyWallets([]); return }
    setLoading(true); setError(null)
    Promise.all(addresses.map(fetchPolymarketPositions))
      .then(results => {
        setPositions(results.flatMap(r => r.positions))
        setProxyWallets(results.map(r => r.proxyWallet).filter(Boolean))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [addresses.join(',')])

  function saveAddresses(next) {
    setAddresses(next)
    localStorage.setItem(addrKey(portfolioId), JSON.stringify(next))
  }

  function addAddress(addr) {
    addr = addr.trim()
    if (!addr || addresses.includes(addr)) return false
    saveAddresses([...addresses, addr])
    return true
  }

  function removeAddress(addr) {
    saveAddresses(addresses.filter(a => a !== addr))
  }

  function setConsolidate(val) {
    setConsolidateState(val)
    localStorage.setItem(consolidateKey(portfolioId), String(val))
  }

  function setPusdInput(val) {
    setPusdInputState(val)
    localStorage.setItem(pusdKey(portfolioId), val)
  }

  const manualPusd = parseFloat(pusdInput) || 0
  const open = positions.filter(p => Number(p.size ?? 0) > 0 && !p.redeemed)

  const positionsValue = open.reduce(
    (s, p) => s + Number(p.currentValue ?? (Number(p.size) * Number(p.currentPrice ?? 0))), 0
  )
  const totalValue = positionsValue + manualPusd
  // Fix #2: use size × avgPrice (not initialValue, which inflates cost for partially-closed positions)
  const totalInvested = open.reduce((s, p) => s + Number(p.size) * Number(p.avgPrice ?? 0), 0)
  const totalPnl = totalValue - totalInvested

  const summary = consolidate && (open.length > 0 || manualPusd > 0)
    ? { value: totalValue, invested: totalInvested }
    : null

  return {
    addresses, addAddress, removeAddress,
    positions, open, proxyWallets,
    loading, error,
    consolidate, setConsolidate,
    pusdInput, setPusdInput, manualPusd,
    positionsValue, totalValue, totalInvested, totalPnl,
    summary,
  }
}
