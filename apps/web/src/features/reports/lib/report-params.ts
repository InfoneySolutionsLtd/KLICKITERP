/** Every param in `paramsShape` is treated as required — the API itself never declares per-param optionality. */
export function isParamsComplete(paramsShape: Record<string, string>, value: Record<string, string>): boolean {
  return Object.keys(paramsShape).every((key) => !!value[key]);
}

/**
 * The controller's `validateParamsShape()` tolerates a missing key but not
 * an empty-string value on a `"uuid"`/`"date"`/`"number"` param (fails its
 * regex/typeof check, 400s) — omit unset fields entirely rather than send
 * `key: ""`.
 */
export function buildExecuteParams(value: Record<string, string>): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (fieldValue !== "") params[key] = fieldValue;
  }
  return params;
}
