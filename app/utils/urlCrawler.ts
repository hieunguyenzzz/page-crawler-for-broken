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
    // First, try to find and parse sitemap
    const sitemapUrls = await findAndParseSitemaps(baseUrl);
    
    // If sitemap found, use those URLs
    const urlsToCrawl = sitemapUrls.length > 0 
      ? sitemapUrls 
      : await extractUrlsFromPage(baseUrl);

    console.log(`[urlCrawler] Found ${urlsToCrawl.length} URLs to check`);
    
    // Check each URL's status
    const brokenPages = await Promise.all(
      urlsToCrawl.map(async (url) => {
        try {
          const response = await fetch(url, { 
            method: 'HEAD',
            timeout: 5000  // 5-second timeout
          });
          
          // Consider 4xx and 5xx status codes as broken
          if (response.status >= 400) {
            return {
              url,
              status: response.status
            };
          }
          
          return null;
        } catch (error) {
          return {
            url,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    // Filter out non-broken pages
    return {
      brokenPages: brokenPages.filter(page => page !== null) as BrokenPage[]
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

    for (const sitemapUrl of sitemapLocations) {
      try {
        const response = await fetch(sitemapUrl);
        
        if (!response.ok) continue;
        
        const xmlText = await response.text();
        const parsedSitemap = await parseXmlSitemap(xmlText);
        
        sitemapUrls.push(...parsedSitemap);
      } catch {
        // Ignore errors for individual sitemap attempts
        continue;
      }
    }
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