/**
 * Reads the user list out of a machine's command reply (send_cmd_result to
 * GET_USER_ID_LIST / GET_USER_INFO).
 *
 * Fingerspot firmwares disagree on the shape: the FK-style protocol answers
 * `{ "user_id": "8", "user_name": "budi" }` or `{ "user_id_array": [...] }`,
 * the R6 variant `{ "users": [{ "userId": "8", "name": "budi" }] }` or
 * `{ "usersId": ["8"] }`. So this walks the JSON and takes anything that looks
 * like a user: an object with an id-ish key, or a string/number in an
 * id-list array. Names are kept when present.
 */
export type MachineUser = { pin: string; nama: string | null };

const PIN_RE = /^[0-9A-Za-z]{1,20}$/;
const ID_KEYS = ["user_id", "userId", "userid", "enroll_id", "enrollId", "pin", "PIN", "id"];
const NAME_KEYS = ["user_name", "userName", "name", "nama", "Name"];
const ID_LIST_KEYS = /^(user_?id_?(array|list)|users_?id|userIds|user_ids|ids)$/i;

export const normalizePin = (v: unknown): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const pin = String(v).trim().replace(/^0+(?=\d)/, "");
  return PIN_RE.test(pin) ? pin : null;
};

const cleanName = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  // Machines pad names with NULs / spaces.
  const s = v.replace(/\0/g, "").trim().slice(0, 100);
  return s || null;
};

function fromObject(o: Record<string, unknown>): MachineUser | null {
  const idKey = ID_KEYS.find((k) => k in o);
  if (!idKey) return null;
  const pin = normalizePin(o[idKey]);
  if (!pin) return null;
  const nameKey = NAME_KEYS.find((k) => k in o);
  return { pin, nama: nameKey ? cleanName(o[nameKey]) : null };
}

export function extractMachineUsers(json: unknown): MachineUser[] {
  const found = new Map<string, MachineUser>();
  const add = (u: MachineUser | null) => {
    if (!u) return;
    const prev = found.get(u.pin);
    if (!prev || (!prev.nama && u.nama)) found.set(u.pin, u);
  };

  const walk = (node: unknown, key: string | null, depth: number) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === "object") walk(item, null, depth + 1);
        else if (key && ID_LIST_KEYS.test(key)) add(((p) => (p ? { pin: p, nama: null } : null))(normalizePin(item)));
      }
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    add(fromObject(o));
    for (const [k, v] of Object.entries(o)) if (v && typeof v === "object") walk(v, k, depth + 1);
  };

  walk(json, null, 0);
  return [...found.values()];
}
