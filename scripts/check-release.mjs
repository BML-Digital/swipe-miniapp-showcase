const raw = process.env.VITE_API_BASE_URL;
if (!raw)
  throw new Error("VITE_API_BASE_URL is required for a release bundle.");
const url = new URL(raw);
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  ["localhost", "127.0.0.1"].includes(url.hostname)
)
  throw new Error("Use an exact public HTTPS API origin.");
if (process.env.VITE_ENABLE_DEMO === "true")
  throw new Error("Mock wallet must be disabled in a release bundle.");
