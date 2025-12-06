/**
 * Custom hook for caching home data (tiles and summary)
 * Provides SWR-like functionality with React Native compatibility
 */
import { useState, useEffect, useRef } from 'react';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map();

function getCacheKey(key) {
  return `home_cache_${key}`;
}

function isCacheValid(entry) {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

export function useHomeCache(key, fetcher, options = {}) {
  const { revalidateOnFocus = true, revalidateOnMount = true } = options;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const fetcherRef = useRef(fetcher);
  const keyRef = useRef(key);
  const mountedRef = useRef(true);
  
  // Update refs when they change
  useEffect(() => {
    fetcherRef.current = fetcher;
    keyRef.current = key;
  }, [fetcher, key]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);
  
  // Initial load
  useEffect(() => {
    if (!key || key === 'multiDay_disabled' || key === 'tiles_disabled') {
      setIsLoading(false);
      setIsValidating(false);
      setData(null);
      setError(null);
      return;
    }
    
    // Ensure fetcher is available
    if (!fetcherRef.current) {
      setIsLoading(false);
      setIsValidating(false);
      return;
    }
    
    const cacheKey = getCacheKey(key);
    const cached = cache.get(cacheKey);
    
    // Use cache if valid and not forcing revalidation
    if (!revalidateOnMount && isCacheValid(cached)) {
      setData(cached.data);
      setError(null);
      setIsLoading(false);
      setIsValidating(false);
      return;
    }
    
    // Fetch new data
    setIsValidating(true);
    setIsLoading(true);
    
    const fetchData = async () => {
      try {
        if (!mountedRef.current || !fetcherRef.current) return;
        
        const result = await fetcherRef.current();
        
        if (!mountedRef.current) return;
        
        // Store in cache
        cache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
        });
        
        setData(result);
        setError(null);
        setIsLoading(false);
        setIsValidating(false);
      } catch (err) {
        if (!mountedRef.current) return;
        
        // On error, use cached data if available
        if (cached && cached.data) {
          setData(cached.data);
          setError(null);
        } else {
          setError(err);
          setData(null);
        }
        setIsLoading(false);
        setIsValidating(false);
      }
    };
    
    fetchData();
  }, [key, revalidateOnMount]);
  
  // Revalidate on window focus (web only)
  useEffect(() => {
    if (!revalidateOnFocus || typeof window === 'undefined' || !key || key === 'multiDay_disabled' || key === 'tiles_disabled') return;
    
    const handleFocus = async () => {
      const cacheKey = getCacheKey(key);
      const cached = cache.get(cacheKey);
      
      if (isCacheValid(cached)) return; // Don't revalidate if cache is still valid
      
      setIsValidating(true);
      try {
        const result = await fetcherRef.current();
        
        if (!mountedRef.current) return;
        
        cache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
        });
        
        setData(result);
        setError(null);
        setIsValidating(false);
      } catch (err) {
        if (!mountedRef.current) return;
        setIsValidating(false);
        // Keep existing data on error
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [key, revalidateOnFocus]);
  
  const revalidate = async (force = false) => {
    if (!key || key === 'multiDay_disabled' || key === 'tiles_disabled') return null;
    
    const cacheKey = getCacheKey(key);
    const cached = cache.get(cacheKey);
    
    // Use cache if valid and not forcing
    if (!force && isCacheValid(cached)) {
      setData(cached.data);
      setError(null);
      setIsLoading(false);
      setIsValidating(false);
      return cached.data;
    }
    
    setIsValidating(true);
    
    try {
      const result = await fetcherRef.current();
      
      if (!mountedRef.current) return null;
      
      // Store in cache
      cache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });
      
      setData(result);
      setError(null);
      setIsLoading(false);
      setIsValidating(false);
      
      return result;
    } catch (err) {
      if (!mountedRef.current) return null;
      
      // On error, use cached data if available
      if (cached && cached.data) {
        setData(cached.data);
        setError(null);
      } else {
        setError(err);
        setData(null);
      }
      setIsLoading(false);
      setIsValidating(false);
      throw err;
    }
  };
  
  return {
    data,
    error,
    isLoading,
    isValidating,
    revalidate,
  };
}

/**
 * Clear cache for a specific key or all home cache
 */
export function clearHomeCache(key = null) {
  if (key) {
    cache.delete(getCacheKey(key));
  } else {
    cache.clear();
  }
}

