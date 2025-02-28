import { json } from '@remix-run/node';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { getRegisteredUrls, addRegisteredUrl, removeRegisteredUrl } from '~/utils/urlStorage';

export async function loader({ request }: LoaderFunctionArgs) {
  const urls = getRegisteredUrls();
  return json(urls);
}

export async function action({ request }: ActionFunctionArgs) {
  const method = request.method;
  
  if (method === 'POST') {
    try {
      const formData = await request.formData();
      const url = formData.get('url') as string;
      const name = formData.get('name') as string;
      
      if (!url || !name) {
        return json({ error: 'URL and name are required' }, 400);
      }
      
      const newUrl = addRegisteredUrl(url, name);
      return json(newUrl);
    } catch (error) {
      return json({ 
        error: error instanceof Error ? error.message : 'Failed to add URL' 
      }, 400);
    }
  } 
  
  if (method === 'DELETE') {
    try {
      const data = await request.json();
      const { id } = data;
      
      if (!id) {
        return json({ error: 'ID is required' }, 400);
      }
      
      const removed = removeRegisteredUrl(id);
      
      if (!removed) {
        return json({ error: 'URL not found' }, 404);
      }
      
      return json({ success: true });
    } catch (error) {
      return json({
        error: error instanceof Error ? error.message : 'Failed to remove URL'
      }, 400);
    }
  }
  
  return json({ error: 'Method not allowed' }, 405);
} 