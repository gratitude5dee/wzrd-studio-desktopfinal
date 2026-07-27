
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/integrations/supabase/config';

export async function downloadFile(url: string, filename = 'download') {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const searchParams = new URLSearchParams({
      url,
      filename,
    });

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/download?${searchParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to download file');
    }

    // Create a blob URL and trigger download
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
    document.body.removeChild(a);

  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
}
