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

// Function to normalize URLs for comparison (improved version)
function normalizeUrl(url: string): string {
  try {
    // Create URL object to parse the URL
    const parsedUrl = new URL(url);
    
    // Normalize: remove trailing slashes, convert to lowercase, remove www. prefix
    let hostname = parsedUrl.hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    
    let pathname = parsedUrl.pathname.replace(/\/+$/, '').toLowerCase();
    
    // Build normalized URL with consistent protocol
    let normalized = parsedUrl.protocol + '//' + hostname + pathname;
    
    // Keep the query parameters but ensure they're sorted
    if (parsedUrl.search) {
      const searchParams = new URLSearchParams(parsedUrl.search);
      const sortedParams = new URLSearchParams([...searchParams.entries()].sort());
      normalized += '?' + sortedParams.toString();
    }
    
    // Remove any fragments (#)
    return normalized;
  } catch {
    // If URL parsing fails, return the original
    return url;
  }
}

export async function crawlAndCheckUrls(baseUrl: string): Promise<CrawlResult> {
  try {
    console.log(`[urlCrawler] Starting crawl for base URL: ${baseUrl}`);

    // First, try to find and parse sitemap
    const sitemapUrls = await findAndParseSitemaps(baseUrl);
    
    console.log(`[urlCrawler] Found ${sitemapUrls.length} URLs from sitemap before deduplication`);

    // If sitemap found, use those URLs
    const urlsToCrawl = sitemapUrls.length > 0 
      ? sitemapUrls 
      : await extractUrlsFromPage(baseUrl);

    // Debug the URLs and their normalized versions
    console.log('[urlCrawler] Debug: URL normalization map:');
    const normalizationMap = new Map<string, string>();
    urlsToCrawl.forEach(url => {
      const normalized = normalizeUrl(url);
      normalizationMap.set(url, normalized);
    });
    
    // Count how many URLs normalize to the same value
    const normalizationCounts = new Map<string, number>();
    for (const normalized of normalizationMap.values()) {
      normalizationCounts.set(normalized, (normalizationCounts.get(normalized) || 0) + 1);
    }
    
    // Log duplicates for debugging
    console.log('[urlCrawler] Debug: Duplicates found:');
    for (const [normalized, count] of normalizationCounts.entries()) {
      if (count > 1) {
        console.log(`  Normalized URL "${normalized}" appears ${count} times:`);
        for (const [original, norm] of normalizationMap.entries()) {
          if (norm === normalized) {
            console.log(`    - ${original}`);
          }
        }
      }
    }

    // Use a Map to track normalized URLs and their original form
    const urlMap = new Map<string, string>();
    
    for (const url of urlsToCrawl) {
      const normalizedUrl = normalizeUrl(url);
      if (!urlMap.has(normalizedUrl)) {
        urlMap.set(normalizedUrl, url);
      }
    }
    
    // Get unique URLs from the map values
    const uniqueUrlsToCrawl = Array.from(urlMap.values());

    console.log(`[urlCrawler] Total URLs found: ${urlsToCrawl.length}`);
    console.log(`[urlCrawler] Total unique URLs to check after deduplication: ${uniqueUrlsToCrawl.length}`);
    
    // Log each URL being crawled
    console.log('[urlCrawler] URLs to be checked:');
    uniqueUrlsToCrawl.forEach((url, index) => {
      console.log(`  ${index + 1}. ${url}`);
    });

    // Track processed URLs during this run to avoid any potential duplicates
    const processedUrls = new Set<string>();
    
    // Process URLs sequentially
    const brokenPages: BrokenPage[] = [];
    
    for (const url of uniqueUrlsToCrawl) {
      const normalizedUrl = normalizeUrl(url);
      
      // Skip if already processed in this run
      if (processedUrls.has(normalizedUrl)) {
        console.log(`[urlCrawler] Skipping already processed URL: ${url}`);
        continue;
      }
      
      processedUrls.add(normalizedUrl);
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

    // Use a map to deduplicate
    const urlMap = new Map<string, string>();
    
    for (const url of sitemapUrls) {
      const normalizedUrl = normalizeUrl(url);
      if (!urlMap.has(normalizedUrl)) {
        urlMap.set(normalizedUrl, url);
      }
    }
    
    return Array.from(urlMap.values());
  } catch (error) {
    console.warn('[urlCrawler] Sitemap parsing error:', error);
  }

  return sitemapUrls;
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