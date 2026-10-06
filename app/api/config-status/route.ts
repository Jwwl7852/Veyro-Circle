import { serverConfigStatus } from "@/lib/server-config";
export async function GET() { const missing=serverConfigStatus(); return Response.json({ready:missing.length===0,missing}); }
