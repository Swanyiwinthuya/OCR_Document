"use client";

import Script from "next/script";

export default function OpenCVScript() {
  return (
    <Script
      src="https://docs.opencv.org/4.x/opencv.js"
      strategy="afterInteractive"
      onLoad={() => {
        if (window.cv) {
          window.cvReady = new Promise<void>((resolve) => {
            if (window.cv?.onRuntimeInitialized) {
              window.cv.onRuntimeInitialized = () => resolve();
            } else {
              resolve();
            }
          });
        }
      }}
    />
  );
}
