import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";

let io: SocketServer | null = null;

export function initProctorSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    path: "/socket.io",
    cors: {
      origin: [
        "http://localhost:8080",
        "http://localhost:5173",
        "https://provenhire-z18w.vercel.app",
        "https://provenhire-z18w.vercel.app/",
      ],
    },
  });

  io.on("connection", (socket) => {
    socket.on("proctor:subscribe", (sessionId: string) => {
      socket.join(`proctor:${sessionId}`);
    });
    socket.on("proctor:unsubscribe", (sessionId: string) => {
      socket.leave(`proctor:${sessionId}`);
    });
    socket.on("proctor:recruiter_join", () => {
      socket.join("proctor:recruiters");
    });
  });

  return io;
}

export function getProctorIo(): SocketServer | null {
  return io;
}
