export const config = {
  runtime: "edge",
};

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Health check endpoints
  if (url.pathname === "/" || url.pathname === "/api") {
    return new Response(JSON.stringify({ status: "ok", service: "@openclawd/api" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/health" || url.pathname === "/api/health") {
    return new Response(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // For now, return a placeholder for other routes
  return new Response(JSON.stringify({
    error: "Not Found",
    message: "API is deployed. Full routes coming soon.",
    path: url.pathname
  }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
