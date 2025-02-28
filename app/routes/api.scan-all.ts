import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { getRegisteredUrls, saveScanResult } from '~/utils/urlStorage';
import { crawlAndCheckUrls } from '~/utils/urlCrawler';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  
  try {
    const urls = getRegisteredUrls();
    
    if (urls.length === 0) {
      return json({ message: 'No URLs registered' });
    }
    
    const scanPromises = urls.map(async (registeredUrl) => {
      console.log(`[api.scan-all] Scanning ${registeredUrl.url}`);
      
      try {
        const result = await crawlAndCheckUrls(registeredUrl.url);
        
        const scanResult = {
          urlId: registeredUrl.id,
          timestamp: new Date().toISOString(),
          brokenPages: result.brokenPages,
          success: true,
          message: result.brokenPages.length > 0 
            ? `Found ${result.brokenPages.length} broken pages` 
            : 'No broken pages found'
        };
        
        const resultId = saveScanResult(scanResult);
        return { ...scanResult, id: resultId };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        const scanResult = {
          urlId: registeredUrl.id,
          timestamp: new Date().toISOString(),
          brokenPages: [],
          success: false,
          message: `Error: ${errorMessage}`
        };
        
        const resultId = saveScanResult(scanResult);
        return { ...scanResult, id: resultId };
      }
    });
    
    const results = await Promise.all(scanPromises);
    
    return json({
      message: `Scanned ${results.length} URLs`,
      results
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[api.scan-all] Error: ${errorMessage}`);
    
    return json({ 
      error: true,
      message: errorMessage
    }, 500);
  }
} 