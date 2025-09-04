"use client";
import { useEffect } from "react";

export default function HostPing() {
  useEffect(() => {
    console.info("[host]", window.location.hostname);
  }, []);
  return null;
}
