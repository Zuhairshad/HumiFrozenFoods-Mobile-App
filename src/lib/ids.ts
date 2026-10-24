/** "HUMI-" + 5 digits, e.g. "HUMI-48213". */
export function makeOrderId(): string {
  return `HUMI-${Math.floor(10000 + Math.random() * 90000)}`;
}
