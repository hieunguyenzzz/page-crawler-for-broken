import { JSDOM } from 'jsdom';
import { parseStringPromise } from 'xml2js';

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
    console.log(`[urlCrawler] Starting crawl for base URL: ${baseUrl}`);

    // First, try to find and parse sitemap
    const sitemapUrls = await findAndParseSitemaps(baseUrl);
    
    console.log(`[urlCrawler] Found ${sitemapUrls.length} unique URLs from sitemap`);

    // If sitemap found, use those URLs
    const urlsToCrawl = sitemapUrls.length > 0 
      ? sitemapUrls 
      : await extractUrlsFromPage(baseUrl);

    // Remove any remaining duplicates
    const uniqueUrlsToCrawl = [...new Set(urlsToCrawl)];

    console.log(`[urlCrawler] Total unique URLs to check: ${uniqueUrlsToCrawl.length}`);
    
    // Log each URL being crawled
    console.log('[urlCrawler] URLs to be checked:');
    uniqueUrlsToCrawl.forEach((url, index) => {
      console.log(`  ${index + 1}. ${url}`);
    });

    // Process URLs sequentially
    const brokenPages: BrokenPage[] = [];
    
    for (const url of uniqueUrlsToCrawl) {
      console.log(`[urlCrawler] Checking URL: ${url}`);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
          const response = await fetch(url, { 
            method: 'GET',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1'
            }
          });
          
          clearTimeout(timeoutId);

          // Consider 4xx and 5xx status codes as broken
          if (response.status >= 400) {
            console.log(`[urlCrawler] Broken URL: ${url} (Status: ${response.status})`);
            brokenPages.push({
              url,
              status: response.status
            });
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.log(`[urlCrawler] Fetch error for URL: ${url}`, fetchError);
          
          // More detailed error handling
          if (fetchError.name === 'AbortError') {
            brokenPages.push({
              url,
              error: 'Request timed out'
            });
          } else {
            brokenPages.push({
              url,
              error: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error'
            });
          }
        }
      } catch (error) {
        console.log(`[urlCrawler] General error checking URL: ${url}`, error);
        brokenPages.push({
          url,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Optional: Add a small delay between requests to reduce server load
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[urlCrawler] Crawl completed. Found ${brokenPages.length} broken URLs`);

    return {
      brokenPages
    };
  } catch (error) {
    console.error('[urlCrawler] Crawling error:', error);
    throw error;
  }
}

async function findAndParseSitemaps(baseUrl: string): Promise<string[]> {
  const sitemapUrls: string[] = [];
  
  try {
    // Try standard sitemap locations
    const sitemapLocations = [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
      `${new URL(baseUrl).origin}/sitemap.xml`
    ];

    console.log('[urlCrawler] Attempting to find sitemaps at:');
    sitemapLocations.forEach(loc => console.log(`  - ${loc}`));

    for (const sitemapUrl of sitemapLocations) {
      try {
        console.log(`[urlCrawler] Trying sitemap: ${sitemapUrl}`);
        const response = await fetch(sitemapUrl);
        
        if (!response.ok) {
          console.log(`[urlCrawler] Sitemap not found or inaccessible: ${sitemapUrl}`);
          continue;
        }
        
        const xmlText = await response.text();
        const parsedSitemap = await parseXmlSitemap(xmlText);
        
        console.log(`[urlCrawler] Found ${parsedSitemap.length} URLs in sitemap: ${sitemapUrl}`);
        sitemapUrls.push(...parsedSitemap);
      } catch (error) {
        console.warn(`[urlCrawler] Error processing sitemap ${sitemapUrl}:`, error);
        continue;
      }
    }
  } catch (error) {
    console.warn('[urlCrawler] Sitemap parsing error:', error);
  }

  // Remove duplicates and return unique URLs
  return [...new Set(sitemapUrls)];
}

async function parseXmlSitemap(xmlText: string): Promise<string[]> {
  try {
    const parsed = await parseStringPromise(xmlText);
    
    // Handle sitemap index
    if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
      const sitemapLocations = parsed.sitemapindex.sitemap.map((sm: any) => sm.loc[0]);
      const nestedUrls = await Promise.all(
        sitemapLocations.map(async (url: string) => {
          const nestedResponse = await fetch(url);
          const nestedXml = await nestedResponse.text();
          return parseXmlSitemap(nestedXml);
        })
      );
      return nestedUrls.flat();
    }
    
    // Handle regular sitemap
    if (parsed.urlset && parsed.urlset.url) {
      return parsed.urlset.url
        .map((urlEntry: any) => {
          // Extract <loc> tag, which contains the URL
          const loc = urlEntry.loc && urlEntry.loc[0];
          return loc;
        })
        .filter(Boolean);  // Remove any null/undefined entries
    }
    
    return [];
  } catch (error) {
    console.warn('[urlCrawler] XML parsing error:', error);
    return [];
  }
}

async function extractUrlsFromPage(baseUrl: string): Promise<string[]> {
  const response = await fetch(baseUrl);
  const html = await response.text();
  
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    resources: "usable",
    url: baseUrl
  });
  const document = dom.window.document;

  const uniqueUrls = new Set<string>();
  
  const links = document.querySelectorAll('a[href]');
  
  links.forEach((link) => {
    const href = link.getAttribute('href');
    
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

  return Array.from(uniqueUrls);
} 