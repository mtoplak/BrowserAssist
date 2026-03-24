const statusEl = document.getElementById("status") as HTMLParagraphElement;

(async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    stream.getTracks().forEach(t => t.stop());
    statusEl.textContent = "Camera access granted. This window will close.";
    await chrome.runtime.sendMessage({ type: "CAMERA_PERMISSION_GRANTED" });
    window.close();
  } catch {
    statusEl.textContent =
      "Camera access was denied. Please allow camera access in your browser settings, then try again.";
    statusEl.classList.add("error");
    await chrome.runtime.sendMessage({ type: "CAMERA_PERMISSION_DENIED" });
  }
})();
