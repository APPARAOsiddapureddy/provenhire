/**
 * Daily.co API client for video call rooms and meeting tokens.
 * Docs: https://docs.daily.co/reference/rest-api
 */

const DAILY_API = "https://api.daily.co/v1";

function getApiKey(): string {
  const key = process.env.DAILY_API_KEY;
  if (!key) throw new Error("DAILY_API_KEY is not configured");
  return key;
}

export interface CreateRoomResponse {
  id: string;
  name: string;
  api_created: boolean;
  privacy: string;
  url: string;
  config: Record<string, unknown>;
  created_at: string;
}

export async function createDailyRoom(): Promise<CreateRoomResponse> {
  const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60; // 2 hours from now
  const res = await fetch(`${DAILY_API}/rooms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      privacy: "private",
      properties: {
        max_participants: 2,
        exp,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Daily API error: ${res.status} ${err}`);
  }
  return res.json();
}

export interface CreateMeetingTokenResponse {
  token: string;
}

export async function createMeetingToken(
  roomName: string,
  options: { isOwner?: boolean; userId?: string; userName?: string }
): Promise<CreateMeetingTokenResponse> {
  const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60; // 2 hours from now
  const body: Record<string, unknown> = {
    properties: {
      room_name: roomName,
      is_owner: options.isOwner ?? false,
      exp,
    },
  };
  if (options.userId) (body.properties as Record<string, unknown>).user_id = options.userId;
  if (options.userName) (body.properties as Record<string, unknown>).user_name = options.userName;

  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Daily API error: ${res.status} ${err}`);
  }
  return res.json();
}

/** Extract room name from Daily room URL (e.g. https://provenhire.daily.co/abc123 -> abc123) */
export function getRoomNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\//, "") || parsed.hostname.split(".")[0];
  } catch {
    return "";
  }
}
