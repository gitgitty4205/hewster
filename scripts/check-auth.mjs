import { readFileSync } from "node:fs";
import { join } from "node:path";

const AUTH_TIMEOUT_MS = 30_000;
const GOOGLE_REDIRECT_TO = "https://lindy.b-average.com/auth/callback";

function readEnvFile() {
  try {
    return readFileSync(join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return "";
  }
}

function loadEnvValue(name) {
  if (process.env[name]) return process.env[name];

  const envText = readEnvFile();
  const line = envText
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));

  if (!line) return "";

  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

const supabaseUrl = loadEnvValue("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = loadEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");

function headerValue(headers, name) {
  return headers.get(name) || "";
}

function logFailureDetails(label, response) {
  const details = [
    `status=${response.status}`,
    `cf-ray=${headerValue(response.headers, "cf-ray") || "missing"}`,
    `sb-project-ref=${headerValue(response.headers, "sb-project-ref") || "missing"}`,
    `sb-request-id=${headerValue(response.headers, "sb-request-id") || "missing"}`,
    `retry-after=${headerValue(response.headers, "retry-after") || "missing"}`,
  ];
  console.error(`${label}: ${details.join(" ")}`);
}

if (!supabaseUrl || !anonKey) {
  console.error("Supabase auth check failed: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exitCode = 1;
} else {
  const baseUrl = supabaseUrl.replace(/\/$/, "");
  const authHeaders = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
  };
  const tokenUrl = `${baseUrl}/auth/v1/token?grant_type=password`;
  const googleAuthorizeUrl = `${baseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(GOOGLE_REDIRECT_TO)}`;

  try {
    const response = await fetchWithTimeout(tokenUrl, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        email: "auth-smoke-test@petnotebook.invalid",
        password: "auth-smoke-test",
      }),
    });

    if (response.status >= 500) {
      console.error(`Supabase auth check failed: token endpoint returned HTTP ${response.status}.`);
      logFailureDetails("Token endpoint details", response);
      process.exitCode = 1;
    } else {
      console.log(`Supabase auth check passed: token endpoint is reachable (HTTP ${response.status}).`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Supabase auth check failed: ${message}`);
    process.exitCode = 1;
  }

  try {
    const response = await fetchWithTimeout(googleAuthorizeUrl, {
      method: "GET",
      headers: authHeaders,
      redirect: "manual",
    });

    if (response.status >= 500) {
      console.error(`Supabase auth check failed: Google authorize endpoint returned HTTP ${response.status}.`);
      logFailureDetails("Google authorize details", response);
      process.exitCode = 1;
    } else {
      const location = response.headers.get("location");
      const destination = location ? new URL(location).hostname : "no-redirect";
      console.log(`Supabase Google auth endpoint is reachable (HTTP ${response.status}, destination: ${destination}).`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Supabase Google auth check failed: ${message}`);
    process.exitCode = 1;
  }
}
