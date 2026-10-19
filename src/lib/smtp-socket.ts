import { connect, type TLSSocket } from "node:tls";

type SocketCallback = (error: Error | null, result?: { connection: TLSSocket; secured: true }) => void;

/** Keep the hostname and SNI together for the Workers TCP proxy. */
export function workerSmtpSocket(host: string, port: number) {
  if (port !== 465) throw new Error("Workers SMTP requires implicit TLS on port 465");
  return (_options: unknown, callback: SocketCallback) => {
    const socket = connect({ host, port, servername: host, rejectUnauthorized: true });
    let delivered = false;
    socket.setTimeout(10000, () => socket.destroy(new Error("SMTP connection timed out")));
    socket.once("error", (error) => {
      if (!delivered) {
        delivered = true;
        callback(error);
      }
    });
    socket.once("secureConnect", () => {
      if (delivered) return;
      delivered = true;
      socket.setTimeout(0);
      callback(null, { connection: socket, secured: true });
    });
  };
}
