/** How money was collected. Stored on the payment timeline entry. */
export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "card", label: "Card" },
  { value: "transfer", label: "Transfer" },
  { value: "other", label: "Other" },
];

export function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label || "";
}
