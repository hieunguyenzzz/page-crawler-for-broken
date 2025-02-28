import { json } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { crawlAndCheckUrls } from '~/utils/urlCrawler';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    // Handle JSON payload instead of form data
    const payload = await request.json();
    const url = payload.url;

    if (!url || typeof url !== 'string') {
      return json({ error: 'URL is required' }, 400);
    }

    console.log(`[api.broken-page-scanner] Starting crawl for: ${url}`);
    const result = await crawlAndCheckUrls(url);
    console.log(`[api.broken-page-scanner] Crawl completed. Found ${result.brokenPages.length} broken URLs`);

    if (result.brokenPages.length > 0) {
      return json({
        error: true,
        message: `There are ${result.brokenPages.length} broken pages`,
        pages: result.brokenPages.map(page => ({ url: page.url }))
      });
    }

    return json({
      error: false,
      message: "No broken pages found"
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[api.broken-page-scanner] Error: ${errorMessage}`);
    
    return json({ 
      error: true,
      message: errorMessage
    }, 500);
  }
} 