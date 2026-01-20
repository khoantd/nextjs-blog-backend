import { useState, useEffect, useCallback } from "react";

interface UseRealTimeStatusOptions {
  analysisId: number;
  pollingInterval?: number; // in milliseconds, default 3000
  enabled?: boolean;
}

interface StatusUpdate {
  status: string | null;
  lastUpdated: Date;
  progress?: number;
  message?: string;
}

export function useRealTimeStatus({ 
  analysisId, 
  pollingInterval = 3000, 
  enabled = true 
}: UseRealTimeStatusOptions) {
  const [status, setStatus] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [progress, setProgress] = useState<number>(0);
  const [message, setMessage] = useState<string>("");
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/stock-analyses/${analysisId}/status`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.status}`);
      }

      const data: StatusUpdate = await response.json();
      setStatus(data.status);
      setLastUpdated(new Date(data.lastUpdated));
      setProgress(data.progress || 0);
      setMessage(data.message || "");
      setError(null);
    } catch (err) {
      console.error('Error fetching status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    }
  }, [analysisId]);

  const startPolling = useCallback(() => {
    if (!enabled) return;
    
    setIsPolling(true);
    // Initial fetch
    fetchStatus();
    
    // Set up polling interval
    const interval = setInterval(fetchStatus, pollingInterval);
    
    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [enabled, pollingInterval, fetchStatus]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  // Auto-start polling when component mounts or dependencies change
  useEffect(() => {
    if (!enabled) return;
    
    const cleanup = startPolling();
    return cleanup;
  }, [enabled, pollingInterval, analysisId]);

  // Manual refresh function
  const refresh = useCallback(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    lastUpdated,
    progress,
    message,
    isPolling,
    error,
    refresh,
    startPolling,
    stopPolling,
  };
}
