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
    log(`[*] Đang tự động mở trình duyệt để xác thực OAuth...`);
    log(`[*] Nếu trình duyệt không tự mở, hãy click vào liên kết sau:\n${url}\n`);

    const command = getOpenBrowserCommand(url);
    exec(command, (error) => {
      if (error) {
        log(`[-] Không thể tự động mở trình duyệt: ${error.message}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
