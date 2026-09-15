"use client";

// Client-side image resize + compress to a JPEG data URL — no blob/file
// storage exists in this project (see CLAUDE.md "Attendance"), so any
// upload (proxy check-in photos, insurance card images) is compressed
// in-browser and stored directly as a data URL. Factored out of
// AttendanceClient.jsx once a second caller (insurance card upload) needed
// the identical logic.
export async function compressImageToDataUrl(file, maxWidth = 800, quality = 0.6) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
