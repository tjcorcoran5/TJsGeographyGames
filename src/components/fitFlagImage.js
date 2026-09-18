export function fitFlagImage(image, frame, inset = 18) {
  const applyFit = () => {
    if (!frame?.isConnected || !image.naturalWidth || !image.naturalHeight) return;

    const availableWidth = Math.max(1, frame.clientWidth - inset);
    const availableHeight = Math.max(1, frame.clientHeight - inset);
    const scale = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight);

    image.style.width = `${Math.floor(image.naturalWidth * scale)}px`;
    image.style.height = `${Math.floor(image.naturalHeight * scale)}px`;
  };

  image.style.width = "auto";
  image.style.height = "auto";

  if (image.complete && image.naturalWidth && image.naturalHeight) applyFit();
  else image.addEventListener("load", applyFit, { once: true });
}
