const { spawn } = require("node:child_process");
const path = require("node:path");

const home = process.env.USERPROFILE || process.env.HOME;
const cloudflared = "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe";
const config = path.join(home, ".cloudflared", "shin-lindy.yml");

const child = spawn(cloudflared, ["--config", config, "tunnel", "run"], {
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
