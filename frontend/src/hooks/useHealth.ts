import { useState, useEffect, useCallback } from 'react';
import type { HealthResponse } from '../types';
const POLL_INTERVAL = 10_000;
export function useHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('unhealthy');
      const data: HealthResponse = await res.json();
      setHealth(data);
      setIsOnline(data.status === 'healthy');
    } catch {
      setHealth(null);
      setIsOnline(false);
    }
  }, []);
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [checkHealth]);
  return { health, isOnline, checkHealth };
}
