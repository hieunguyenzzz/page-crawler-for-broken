import { useState } from 'react';
import { useNavigation, Form, useLoaderData } from '@remix-run/react';
import { json } from '@remix-run/node';
import { getRegisteredUrls, getScanResults } from '~/utils/urlStorage';

export async function loader() {
  const urls = getRegisteredUrls();
  const results = getScanResults();
  return json({ urls, results });
}

export default function UrlManagementPage() {
  const { urls, results } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [isScanning, setIsScanning] = useState(false);

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
      <h1 className="text-2xl font-bold mb-4">URL Management</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-2">Register New URL</h2>
        <Form method="post" action="/api/urls" className="flex flex-col sm:flex-row gap-2">
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
                  <th className="px-4 py-2 border-b">Date Added</th>
                  <th className="px-4 py-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {urls.map((site) => (
                  <tr key={site.id}>
                    <td className="px-4 py-2 border-b">{site.name}</td>
                    <td className="px-4 py-2 border-b">
                      <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        {site.url}
                      </a>
                    </td>
                    <td className="px-4 py-2 border-b">
                      {new Date(site.createdAt).toLocaleDateString()}
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
        <h2 className="text-xl font-bold mb-2">Scan Results</h2>
        
        {results.length === 0 ? (
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
                {results.map((result, index) => {
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