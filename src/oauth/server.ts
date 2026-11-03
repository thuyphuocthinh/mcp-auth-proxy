import http from 'node:http';
import net from 'node:net';

export function getAvailablePort(startPort = 8080): Promise<number> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.listen(startPort, () => {
      const port = (tester.address() as net.AddressInfo).port;
      tester.close(() => resolve(port));
    });
    tester.on('error', () => {
      resolve(getAvailablePort(startPort + 1));
    });
  });
}

export interface CallbackServerInstance {
  server: http.Server;
  port: number;
  redirectUri: string;
  waitForCode: () => Promise<string>;
  close: () => Promise<void>;
}

export async function startCallbackServer(port?: number): Promise<CallbackServerInstance> {
  const selectedPort = port ?? (await getAvailablePort(8080));
  const redirectUri = `http://localhost:${selectedPort}/callback`;

  let resolveCode: (code: string) => void;
  let rejectCode: (err: Error) => void;

  const codePromise = new Promise<string>((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });
  // Tránh unhandledRejection khi người dùng attach handler muộn hơn 1 tick
  codePromise.catch(() => {});

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${selectedPort}`);

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const errorDesc = url.searchParams.get('error_description') || error;

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <div style="font-family: sans-serif; text-align: center; padding: 40px;">
            <h1 style="color: #ef4444;">&#10008; Xác thực thất bại!</h1>
            <p>${errorDesc}</p>
          </div>
        `);
        rejectCode(new Error(errorDesc || 'OAuth authentication failed'));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <div style="font-family: sans-serif; text-align: center; padding: 40px;">
            <h1 style="color: #ef4444;">&#10008; Không tìm thấy Authorization Code!</h1>
          </div>
        `);
        rejectCode(new Error('Missing authorization code in callback'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <div style="font-family: sans-serif; text-align: center; padding: 40px;">
          <h1 style="color: #10b981;">&#10004; Đăng nhập 200Lab thành công!</h1>
          <p>Token đã được tự động lưu vào hệ thống.</p>
          <p>Bạn có thể đóng tab này và quay lại ứng dụng.</p>
        </div>
      `);
      resolveCode(code);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(selectedPort, () => resolve());
  });

  const close = (): Promise<void> => {
    return new Promise((resolve) => {
      server.close(() => resolve());
    });
  };

  return {
    server,
    port: selectedPort,
    redirectUri,
    waitForCode: () => codePromise,
    close
  };
}
