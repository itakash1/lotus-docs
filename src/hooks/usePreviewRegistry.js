import { useEffect, useRef } from 'react';

export function usePreviewRegistry() {
  const urlsRef = useRef(new Set());
  const createPreview = (blob) => {
    const url = URL.createObjectURL(blob);
    urlsRef.current.add(url);
    return url;
  };
  const clearPreviews = () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
  };
  useEffect(() => clearPreviews, []);
  return { createPreview, clearPreviews };
}
