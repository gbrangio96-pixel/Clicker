import { getCatalog } from '@/lib/store';
import { apiError } from '@/lib/http';
export const dynamic='force-dynamic';
export function GET() { try { return Response.json(getCatalog(),{headers:{'Cache-Control':'no-store'}}); } catch(error) { return apiError(error); } }
