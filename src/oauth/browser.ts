import { exec } from 'node:child_process';
import os from 'node:os';

export function getOpenBrowserCommand(url: string, platform = os.platform()): string {
  if (platform === 'win32') {
    return `start "" "${url}"`;
  }
  if (platform === 'darwin') {
    return `open "${url}"`;
  }
  return `xdg-open "${url}"`;
}

export function openBrowser(url: string, log = console.log): Promise<boolean> {
  return new Promise((resolve) => {
    log(`[*] Automatically opening default browser for OAuth authentication...`);
    log(`[*] If the browser does not open automatically, open this URL in your browser:\n${url}\n`);

    const command = getOpenBrowserCommand(url);
    exec(command, (error) => {
      if (error) {
        log(`[-] Failed to launch browser automatically: ${error.message}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
