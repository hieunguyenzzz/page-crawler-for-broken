import { JSDOM } from 'jsdom';

interface BrokenPage {
  url: string;
  status?: number;
  error?: string;
}

interface CrawlResult {
  brokenPages: BrokenPage[];
  error?: string;
}

export async function crawlAndCheckUrls(baseUrl: string): Promise<CrawlResult> {
  try {
    // Validate base URL
    const parsedUrl = new URL(baseUrl);
    console.log(`[urlCrawler] Starting to crawl: ${baseUrl}`);

    // Fetch the initial page
    const response = await fetch(baseUrl);
    const html = await response.text();
    console.log(`[urlCrawler] Successfully fetched base URL with status: ${response.status}`);

    // Parse HTML and extract URLs
    const dom = new JSDOM(html, {
      // Disable CSS parsing to avoid errors
      runScripts: "outside-only",
      resources: "usable"
    });
    const document = dom.window.document;

    // Extract all unique URLs from the page
    const urls = extractUniqueUrls(document, baseUrl);
    console.log(`[urlCrawler] Found ${urls.length} unique URLs to check`);
    
    // Check each URL
    const brokenPages: BrokenPage[] = [];
    
    for (const url of urls) {
      console.log(`[urlCrawler] Checking URL: ${url}`);
      try {
        const checkResponse = await fetch(url, { method: 'HEAD' });
        const status = checkResponse.status;
        console.log(`[urlCrawler] URL: ${url} - Status: ${status}`);
        
        // Only track broken pages
        if (status === 404 || status === 500) {
          brokenPages.push({
            url,
            status
          });
        }
      } catch (error) {
        // If fetch fails, consider it a broken URL
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`[urlCrawler] URL: ${url} - Error: ${errorMessage}`);
        
        brokenPages.push({
          url,
          error: errorMessage
        });
      }
    }

    console.log(`[urlCrawler] Completed checking all URLs. Found ${brokenPages.length} broken URLs.`);
    
    return {
      brokenPages,
      error: brokenPages.length > 0 ? 'Broken URLs found' : undefined
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[urlCrawler] Error during crawl: ${errorMessage}`);
    
    return {
      brokenPages: [],
      error: errorMessage
    };
  }
}

function extractUniqueUrls(document: Document, baseUrl: string): string[] {
  const uniqueUrls = new Set<string>();
  
  // Extract URLs from different elements
  const linkSelectors = [
    'a[href]',
    'img[src]',
    'script[src]',
    'link[href]'
  ];

  linkSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      const href = el.getAttribute('href') || el.getAttribute('src');
      if (href) {
        try {
          const fullUrl = new URL(href, baseUrl).toString();
          // Only include URLs from the same domain
          if (new URL(fullUrl).hostname === new URL(baseUrl).hostname) {
            uniqueUrls.add(fullUrl);
          }
        } catch {
          // Ignore invalid URLs
        }
      }
    });
  });

  return Array.from(uniqueUrls);
} 