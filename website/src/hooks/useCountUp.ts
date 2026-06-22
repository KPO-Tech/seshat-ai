import { useEffect, useState } from 'react'

export function useCountUp(target: number, duration = 1400, active = false) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!active) return
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * target))
      if (progress < 1) requestAnimationFrame(tick)
      else setCount(target)
    }

    requestAnimationFrame(tick)
  }, [active, target, duration])

  return count
}
