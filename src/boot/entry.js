runSetup();


// Warm the network fabric in parallel with guest boot (non-blocking)
try {
  if (typeof ensureMwFabric === "function") {
    ensureMwFabric().then((s) => console.log("[goar] fabric warm", s)).catch(() => {});
  }
} catch (_) {}
