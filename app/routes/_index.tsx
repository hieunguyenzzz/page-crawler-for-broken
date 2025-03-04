import { useState } from 'react';
import { useNavigation, Form, useLoaderData, useActionData } from '@remix-run/react';
import { json, type MetaFunction, type ActionFunctionArgs } from '@remix-run/node';
import { getRegisteredUrls, getScanResults, getLatestScanResultForUrl, addRegisteredUrl } from '~/utils/urlStorage';

export const meta: MetaFunction = () => {
  return [
    { title: "URL Monitoring Dashboard" },
    { name: "description", content: "Monitor websites for broken pages and links" },
  ];
};

export async function loader() {
  const urls = getRegisteredUrls();
  
  // Get the latest scan result for each URL
  const urlsWithStatus = await Promise.all(
    urls.map(async url => {
      const latestResult = getLatestScanResultForUrl(url.id);
      return {
        ...url,
        latestScan: latestResult
      };
    })
  );
  
  // Get recent scan results for the history section
  const recentResults = getScanResults().slice(0, 10);
  
  return json({ urls: urlsWithStatus, recentResults });
}

// Add action function to handle form submissions
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const url = formData.get('url') as string;
  const name = formData.get('name') as string;
  
  try {
    if (!url || !name) {
      return json({ error: 'URL and name are required' }, 400);
    }
    
    const newUrl = addRegisteredUrl(url, name);
    return json({ success: true, message: 'URL registered successfully', url: newUrl });
  } catch (error) {
    return json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add URL' 
    }, 400);
  }
}

export default function Index() {
  const { urls, recentResults } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [isScanning, setIsScanning] = useState(false);
  const actionData = useActionData<typeof action>();
  const [showMessage, setShowMessage] = useState(!!actionData);
  
  // Close message after 5 seconds
  if (showMessage && actionData) {
    setTimeout(() => setShowMessage(false), 5000);
  }

  // Type guard to check action data type
  const isSuccessActionData = (data: any): data is { success: boolean; message: string; url?: any } => {
    return data && typeof data === 'object' && 'success' in data;
  };

  // Type guard to check error action data type
  const isErrorActionData = (data: any): data is { error: string } => {
    return data && typeof data === 'object' && 'error' in data;
  };

  const handleScanAll = async () => {
    setIsScanning(true);
    try {
      await fetch('/api/scan-all', { method: 'POST' });
    } catch (error) {
      console.error('Failed to trigger scan:', error);
    } finally {
      setIsScanning(false);
      // Reload the page to get fresh results
      window.location.reload();
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch('/api/urls', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      });
      // Reload the page to get fresh URL list
      window.location.reload();
    } catch (error) {
      console.error('Failed to delete URL:', error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">URL Monitoring Dashboard</h1>
      
      {/* Show success/error message */}
      {showMessage && actionData && (
        <div className={`p-4 mb-4 rounded ${
          isSuccessActionData(actionData) && actionData.success 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {isSuccessActionData(actionData) 
            ? actionData.message 
            : isErrorActionData(actionData) 
              ? actionData.error 
              : 'Unknown error'}
          <button 
            className="ml-4 text-sm underline" 
            onClick={() => setShowMessage(false)}
          >
            Dismiss
          </button>
        </div>
      )}
      
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-2">Register New URL</h2>
        <Form method="post" className="flex flex-col sm:flex-row gap-2">
          <input 
            type="text" 
            name="name" 
            placeholder="Site Name" 
            required 
            className="border p-2 flex-1"
          />
          <input 
            type="url" 
            name="url" 
            placeholder="https://example.com" 
            required 
            className="border p-2 flex-1"
          />
          <button 
            type="submit" 
            className="bg-blue-500 text-white p-2 rounded"
            disabled={navigation.state === 'submitting'}
          >
            {navigation.state === 'submitting' ? 'Registering...' : 'Register URL'}
          </button>
        </Form>
      </div>
      
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-bold">Registered URLs</h2>
          <button 
            onClick={handleScanAll}
            disabled={isScanning || urls.length === 0}
            className="bg-green-500 text-white p-2 rounded"
          >
            {isScanning ? 'Scanning...' : 'Scan All URLs'}
          </button>
        </div>
        
        {urls.length === 0 ? (
          <p className="text-gray-500">No URLs registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border">
              <thead>
                <tr>
                  <th className="px-4 py-2 border-b">Name</th>
                  <th className="px-4 py-2 border-b">URL</th>
                  <th className="px-4 py-2 border-b">Latest Scan Status</th>
                  <th className="px-4 py-2 border-b">Broken Pages</th>
                  <th className="px-4 py-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {urls.map((site) => (
                  <tr key={site.id} className={site.latestScan?.success === false ? 'bg-red-50' : ''}>
                    <td className="px-4 py-2 border-b">{site.name}</td>
                    <td className="px-4 py-2 border-b">
                      <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        {site.url}
                      </a>
                    </td>
                    <td className="px-4 py-2 border-b">
                      {site.latestScan ? (
                        <>
                          <span className={site.latestScan.success ? 'text-green-500' : 'text-red-500'}>
                            {site.latestScan.success ? '✓ Healthy' : '✗ Issues Found'}
                          </span>
                          <div className="text-xs text-gray-500">
                            {new Date(site.latestScan.timestamp).toLocaleString()}
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400">Never scanned</span>
                      )}
                    </td>
                    <td className="px-4 py-2 border-b">
                      {!site.latestScan || site.latestScan.brokenPages.length === 0 ? (
                        <span className="text-green-500">No broken pages</span>
                      ) : (
                        <details>
                          <summary className="text-red-500 cursor-pointer">
                            {site.latestScan.brokenPages.length} broken pages
                          </summary>
                          <ul className="mt-2 list-disc pl-5">
                            {site.latestScan.brokenPages.map((page, i) => (
                              <li key={i}>
                                <a href={page.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                  {page.url}
                                </a>
                                {page.status ? ` (Status: ${page.status})` : page.error ? ` (Error: ${page.error})` : ''}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className="px-4 py-2 border-b">
                      <button 
                        onClick={() => handleDelete(site.id)}
                        className="bg-red-500 text-white p-1 rounded text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      <div>
        <h2 className="text-xl font-bold mb-2">Recent Scan History</h2>
        
        {recentResults.length === 0 ? (
          <p className="text-gray-500">No scan results yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border">
              <thead>
                <tr>
                  <th className="px-4 py-2 border-b">URL</th>
                  <th className="px-4 py-2 border-b">Scan Time</th>
                  <th className="px-4 py-2 border-b">Status</th>
                  <th className="px-4 py-2 border-b">Broken Pages</th>
                  <th className="px-4 py-2 border-b">Total Pages</th>
                </tr>
              </thead>
              <tbody>
                {recentResults.map((result, index) => {
                  const site = urls.find(u => u.id === result.urlId);
                  return (
                    <tr key={index} className={result.success ? '' : 'bg-red-100'}>
                      <td className="px-4 py-2 border-b">
                        {site ? site.name : 'Unknown Site'}
                      </td>
                      <td className="px-4 py-2 border-b">
                        {new Date(result.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 border-b">
                        <span className={result.success ? 'text-green-500' : 'text-red-500'}>
                          {result.success ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td className="px-4 py-2 border-b">
                        {result.brokenPages.length === 0 ? (
                          <span className="text-green-500">No broken pages</span>
                        ) : (
                          <details>
                            <summary className="text-red-500 cursor-pointer">
                              {result.brokenPages.length} broken pages
                            </summary>
                            <ul className="mt-2 list-disc pl-5">
                              {result.brokenPages.map((page, i) => (
                                <li key={i}>
                                  <a href={page.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                    {page.url}
                                  </a>
                                  {page.status ? ` (Status: ${page.status})` : page.error ? ` (Error: ${page.error})` : ''}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className="px-4 py-2 border-b">
                        {result.totalPages || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
