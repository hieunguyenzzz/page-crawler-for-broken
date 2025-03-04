import db from './db.server';

export interface RegisteredUrl {
  id: string;
  url: string;
  name: string;
  createdAt: string;
}

export interface BrokenPage {
  url: string;
  status?: number;
  error?: string;
}

export interface ScanResult {
  id?: number;
  urlId: string;
  timestamp: string;
  brokenPages: BrokenPage[];
  success: boolean;
  message: string;
  totalPages?: number;
}

export function getRegisteredUrls(): RegisteredUrl[] {
  const stmt = db.prepare('SELECT id, url, name, created_at as createdAt FROM registered_urls ORDER BY created_at DESC');
  return stmt.all();
}

export function addRegisteredUrl(url: string, name: string): RegisteredUrl {
  const timestamp = new Date().toISOString();
  const id = Date.now().toString();
  
  try {
    const stmt = db.prepare('INSERT INTO registered_urls (id, url, name, created_at) VALUES (?, ?, ?, ?)');
    stmt.run(id, url, name, timestamp);
    
    return {
      id,
      url,
      name,
      createdAt: timestamp
    };
  } catch (error) {
    // Check if it's a unique constraint violation
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new Error('URL already registered');
    }
    throw error;
  }
}

export function removeRegisteredUrl(id: string): boolean {
  // Begin transaction
  const transaction = db.transaction(() => {
    // First delete any scan results and broken pages associated with this URL
    const resultsStmt = db.prepare('SELECT id FROM scan_results WHERE url_id = ?');
    const resultIds = resultsStmt.all(id).map(row => row.id);
    
    // Delete broken pages for each result
    const deleteBrokenPagesStmt = db.prepare('DELETE FROM broken_pages WHERE result_id = ?');
    for (const resultId of resultIds) {
      deleteBrokenPagesStmt.run(resultId);
    }
    
    // Delete scan results
    const deleteResultsStmt = db.prepare('DELETE FROM scan_results WHERE url_id = ?');
    deleteResultsStmt.run(id);
    
    // Finally delete the URL
    const deleteUrlStmt = db.prepare('DELETE FROM registered_urls WHERE id = ?');
    const result = deleteUrlStmt.run(id);
    
    return result.changes > 0;
  });
  
  return transaction();
}

export function getScanResults(): ScanResult[] {
  const stmt = db.prepare(`
    SELECT sr.id, sr.url_id as urlId, sr.timestamp, sr.success, sr.message, sr.total_pages as totalPages
    FROM scan_results sr
    ORDER BY sr.timestamp DESC
    LIMIT 100
  `);
  
  const results = stmt.all();
  
  // For each scan result, get its broken pages
  const brokenPagesStmt = db.prepare(`
    SELECT url, status, error
    FROM broken_pages
    WHERE result_id = ?
  `);
  
  return results.map(result => {
    const brokenPages = brokenPagesStmt.all(result.id);
    return {
      ...result,
      brokenPages
    };
  });
}

export function getLatestScanResultForUrl(urlId: string): ScanResult | null {
  const stmt = db.prepare(`
    SELECT sr.id, sr.url_id as urlId, sr.timestamp, sr.success, sr.message, sr.total_pages as totalPages
    FROM scan_results sr
    WHERE sr.url_id = ?
    ORDER BY sr.timestamp DESC
    LIMIT 1
  `);
  
  const result = stmt.get(urlId);
  
  if (!result) {
    return null;
  }
  
  // Get broken pages for this result
  const brokenPagesStmt = db.prepare(`
    SELECT url, status, error
    FROM broken_pages
    WHERE result_id = ?
  `);
  
  const brokenPages = brokenPagesStmt.all(result.id);
  
  return {
    ...result,
    brokenPages
  };
}

export function saveScanResult(result: ScanResult): number {
  // Begin transaction
  const transaction = db.transaction(() => {
    // Insert scan result
    const insertResultStmt = db.prepare(`
      INSERT INTO scan_results (url_id, timestamp, success, message, total_pages)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const resultInsert = insertResultStmt.run(
      result.urlId,
      result.timestamp,
      result.success ? 1 : 0,
      result.message,
      result.totalPages || 0
    );
    
    const resultId = resultInsert.lastInsertRowid as number;
    
    // Insert broken pages
    if (result.brokenPages.length > 0) {
      const insertPageStmt = db.prepare(`
        INSERT INTO broken_pages (result_id, url, status, error)
        VALUES (?, ?, ?, ?)
      `);
      
      for (const page of result.brokenPages) {
        insertPageStmt.run(
          resultId,
          page.url,
          page.status || null,
          page.error || null
        );
      }
    }
    
    return resultId;
  });
  
  return transaction();
} 