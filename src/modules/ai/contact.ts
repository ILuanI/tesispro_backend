export const whatsappNumber = '51987654321';
export function whatsappUrl(message: string) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}
