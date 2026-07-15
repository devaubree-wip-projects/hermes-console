export type ApplicationResult<T = unknown> = {
  status: number;
  body: T;
};

export function result<T>(body: T, status = 200): ApplicationResult<T> {
  return { status, body };
}
