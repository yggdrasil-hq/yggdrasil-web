import { createAvatar } from "@dicebear/core";
import { thumbs } from "@dicebear/collection";

export function avatarDataUri(username: string): string {
  const svg = createAvatar(thumbs, {
    seed: username,
    size: 128,
  }).toString();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
