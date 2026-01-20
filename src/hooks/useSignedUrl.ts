import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to generate signed URLs for private storage bucket files.
 * This should be used instead of getPublicUrl for private buckets like 'resumes'.
 * 
 * @param storedUrl - The URL or file path stored in the database
 * @param bucket - The storage bucket name (default: 'resumes')
 * @param expiresIn - URL expiry time in seconds (default: 1 hour)
 */
export const useSignedUrl = (
  storedUrl: string | null | undefined,
  bucket: string = 'resumes',
  expiresIn: number = 3600
) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract file path from a stored URL or use it directly if it's already a path
  const extractFilePath = useCallback((url: string): string | null => {
    if (!url) return null;
    
    // If it's already a simple file path (not a URL), return it directly
    if (!url.startsWith('http')) {
      return url;
    }
    
    // Extract path from Supabase storage URL
    // Format: https://xxx.supabase.co/storage/v1/object/public/bucket/path
    const publicMatch = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)/);
    if (publicMatch) {
      return publicMatch[1];
    }
    
    // Format for signed URLs or authenticated paths
    const signedMatch = url.match(/\/storage\/v1\/object\/sign\/[^/]+\/(.+)\?/);
    if (signedMatch) {
      return signedMatch[1];
    }
    
    // Try to extract from any /object/ pattern
    const generalMatch = url.match(/\/object\/[^/]+\/[^/]+\/(.+?)(?:\?|$)/);
    if (generalMatch) {
      return generalMatch[1];
    }
    
    return null;
  }, []);

  const generateSignedUrl = useCallback(async () => {
    if (!storedUrl) {
      setSignedUrl(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const filePath = extractFilePath(storedUrl);
      
      if (!filePath) {
        throw new Error('Could not extract file path from URL');
      }

      const { data, error: signError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, expiresIn);

      if (signError) {
        throw signError;
      }

      setSignedUrl(data.signedUrl);
    } catch (err: any) {
      console.error('Error generating signed URL:', err);
      setError(err.message);
      // Fallback to stored URL if signed URL generation fails
      setSignedUrl(storedUrl);
    } finally {
      setLoading(false);
    }
  }, [storedUrl, bucket, expiresIn, extractFilePath]);

  useEffect(() => {
    generateSignedUrl();
  }, [generateSignedUrl]);

  return { signedUrl, loading, error, refresh: generateSignedUrl };
};

/**
 * Utility function to generate a signed URL for immediate use (non-hook version)
 * Use this when you need a signed URL outside of React components
 */
export const getSignedResumeUrl = async (
  storedUrl: string,
  expiresIn: number = 3600
): Promise<string | null> => {
  if (!storedUrl) return null;

  // Extract file path from URL
  let filePath: string | null = null;
  
  if (!storedUrl.startsWith('http')) {
    filePath = storedUrl;
  } else {
    const publicMatch = storedUrl.match(/\/storage\/v1\/object\/public\/resumes\/(.+)/);
    if (publicMatch) {
      filePath = publicMatch[1];
    }
    
    const signedMatch = storedUrl.match(/\/storage\/v1\/object\/sign\/resumes\/(.+)\?/);
    if (signedMatch) {
      filePath = signedMatch[1];
    }
    
    if (!filePath) {
      const generalMatch = storedUrl.match(/\/object\/[^/]+\/resumes\/(.+?)(?:\?|$)/);
      if (generalMatch) {
        filePath = generalMatch[1];
      }
    }
  }

  if (!filePath) {
    console.error('Could not extract file path from stored URL');
    return storedUrl; // Return original as fallback
  }

  try {
    const { data, error } = await supabase.storage
      .from('resumes')
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error('Error generating signed URL:', error);
      return storedUrl; // Return original as fallback
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Error generating signed URL:', err);
    return storedUrl;
  }
};
